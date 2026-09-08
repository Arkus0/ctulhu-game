import { describe, it, expect } from 'vitest'
import manifiestoCsv from '../art/manifest.csv?raw'
import { loadContent, validate } from '../src/content/index'
import { parseTime } from '../src/engine/clock'
import { RumorDeck } from '../src/engine/dialogue'
import { Rng } from '../src/engine/rng'

describe('el contenido real carga sin errores', () => {
  it('pasa la validacion cruzada entera', () => {
    expect(() => loadContent()).not.toThrow()
  })

  it('tiene las piezas minimas de la rebanada', () => {
    const c = loadContent()
    expect(c.locations.size).toBeGreaterThanOrEqual(14)
    expect(c.npcs.size).toBeGreaterThanOrEqual(12)
    expect(c.investigators.length).toBe(3)
    expect(c.events.length).toBeGreaterThanOrEqual(12)
    expect(c.conversations.size).toBeGreaterThanOrEqual(2)
    expect(c.topics.size).toBeGreaterThanOrEqual(20)
  })

  it('el mapa esta conectado: se llega al Viejo Templo desde la terraza', () => {
    const c = loadContent()
    const seen = new Set<string>(['terraza'])
    const queue = ['terraza']
    while (queue.length > 0) {
      const here = c.locations.get(queue.shift()!)
      for (const e of here?.exits ?? []) {
        if (!seen.has(e.to)) {
          seen.add(e.to)
          queue.push(e.to)
        }
      }
    }
    expect(seen.has('viejo_templo')).toBe(true)
    // Y todas las localizaciones son alcanzables: nada de cuartos huerfanos.
    for (const id of c.locations.keys()) expect(seen.has(id)).toBe(true)
  })

  it('bajar al Viejo Templo es una decision cara en tiempo', () => {
    const c = loadContent()
    const cost = (from: string, to: string): number =>
      c.locations.get(from)!.exits.find((e) => e.to === to)!.minutes
    const descent =
      cost('cocina', 'almacen_sotano') +
      cost('almacen_sotano', 'pasillo_intermedio') +
      cost('pasillo_intermedio', 'salon_ali_bey') +
      cost('salon_ali_bey', 'sala_escombros') +
      cost('sala_escombros', 'viejo_templo')
    // Ida y vuelta debe comerse mas de una secuencia de media hora.
    expect(descent * 2).toBeGreaterThan(30)
  })

  it('todas las salidas son reciprocas o deliberadamente de un solo sentido', () => {
    const c = loadContent()
    const oneWay: string[] = []
    for (const l of c.locations.values()) {
      for (const e of l.exits) {
        const back = c.locations.get(e.to)!.exits.some((x) => x.to === l.id)
        if (!back) oneWay.push(`${l.id} -> ${e.to}`)
      }
    }
    // De momento no hay ninguna trampa de un solo sentido en el hotel.
    expect(oneWay).toEqual([])
  })

  it('la agenda del dia 1 esta ordenada y dentro del dia', () => {
    const c = loadContent()
    for (const ev of c.events) {
      const m = parseTime(ev.at)
      expect(m).toBeGreaterThanOrEqual(parseTime('D1 09:00'))
      if (ev.until) expect(parseTime(ev.until)).toBeGreaterThan(m)
    }
  })

  it('los eventos que el jugador puede perderse dejan rastro', () => {
    const c = loadContent()
    // Un evento con texto de testigo pero sin rastro es informacion que se
    // evapora: el modulo dice explicitamente que eso no debe pasar.
    const sinRastro = c.events
      .filter((e) => e.witnessText && (e.traces ?? []).length === 0)
      .map((e) => e.id)
    // Se permiten excepciones conscientes, pero deben ser pocas y justificadas.
    expect(sinRastro.length).toBeLessThanOrEqual(2)
  })

  it('ninguna escena con texto se juega a un solo instante', () => {
    const c = loadContent()
    // Un evento con texto de testigo y sin `until` solo lo ve quien esta en la
    // sala en el minuto exacto en que salta. Treinta segundos tarde y te quedas
    // fuera, que es la manera mas tonta de frustrar a un jugador que hizo lo
    // correcto. Toda escena que dure algo tiene que declarar su ventana.
    const sinVentana = c.events.filter((e) => e.witnessText && !e.until).map((e) => e.id)
    expect(sinVentana).toEqual([])
  })

  it('toda conversacion espiable cuelga de un evento con ventana', () => {
    const c = loadContent()
    // `Game.eavesdroppableHere` solo ofrece una conversacion mientras su evento
    // ancla esta EN CURSO. Un ancla sin `until` nunca esta en curso, asi que la
    // conversacion existiria en el JSON y no se podria espiar jamas.
    const huerfanas: string[] = []
    for (const conv of c.conversations.values()) {
      if (!conv.event) continue
      const ev = c.events.find((e) => e.id === conv.event)
      if (!ev || !ev.until) huerfanas.push(conv.id)
      else if (ev.location !== conv.location) huerfanas.push(`${conv.id} (sala distinta al evento)`)
    }
    expect(huerfanas).toEqual([])
  })

  it('cada PNJ con ganchos usa aproximaciones reales', () => {
    const c = loadContent()
    for (const npc of c.npcs.values()) {
      for (const h of npc.hooks ?? []) {
        expect(h.approach.length).toBeGreaterThan(0)
        expect((h.bonus ?? 0) + (h.penalty ?? 0)).toBeGreaterThan(0)
        expect(h.note?.length ?? 0).toBeGreaterThan(10)
      }
    }
  })

  it('ningun fallo de dialogo es un muro: fallar deja siempre algo', () => {
    const c = loadContent()
    // El modulo no tiene puertas cerradas en la conversacion: un fallo es una
    // evasiva que delata, un cambio de tema demasiado rapido, una media verdad.
    // Traducido al esquema: la rama de fallo tiene que dejarle al jugador un
    // hecho, un tema nuevo o un efecto. Si no deja nada, ha tirado los dados
    // para nada y el tema esta mal escrito.
    //
    // La lista de excepciones esta vacia: todos los temas del juego tienen ya
    // una rama de fallo que deja algo. Solo puede encoger, nunca crecer.
    const pendientes = new Set<string>([])

    const muros: string[] = []
    for (const t of c.topics.values()) {
      if (!t.check || pendientes.has(t.id)) continue
      for (const r of [t.onFailure, t.onFumble]) {
        if (!r) continue
        const dejaAlgo =
          (r.facts?.length ?? 0) > 0 ||
          (r.unlocks?.length ?? 0) > 0 ||
          (r.effects?.length ?? 0) > 0
        if (!dejaAlgo) muros.push(t.id)
      }
    }
    expect(muros).toEqual([])
  })

  it('los cinco PNJ del dia 1 tienen conversacion de sobra', () => {
    const c = loadContent()
    // Behler, Clinton, Carter, Weder y Gasparini sostienen el primer dia. Cada
    // uno tiene en el libro una seccion "Datos y pistas" larga, y hablar con
    // ellos tiene que ser una decision de agenda, no un boton que se agota.
    for (const npc of ['behler', 'clinton', 'carter', 'weder', 'gasparini']) {
      const suyos = [...c.topics.values()].filter((t) => t.npc === npc)
      expect(suyos.length).toBeGreaterThanOrEqual(12)
    }
  })

  it('los nueve PNJ de la segunda tanda tambien', () => {
    const c = loadContent()
    // Olga, Dieter, Mahadni, Thornhill, Rolland, los Meyer (que cuentan como
    // uno: el libro les da una sola ficha), Evelyn, Carnarvon y Najir. Cada uno
    // sostiene una parte de la trama y tiene su propia seccion "Datos y pistas".
    const bloques: Record<string, string[]> = {
      olga: ['olga'],
      dieter: ['dieter'],
      mahadni: ['mahadni'],
      thornhill: ['thornhill'],
      rolland: ['rolland'],
      meyer: ['lars', 'hans', 'sven'],
      evelyn: ['evelyn'],
      carnarvon: ['carnarvon'],
      najir: ['najir'],
    }
    for (const [quien, npcs] of Object.entries(bloques)) {
      const suyos = [...c.topics.values()].filter((t) => npcs.includes(t.npc))
      expect({ quien, temas: suyos.length >= 10 }).toEqual({ quien, temas: true })
    }
  })

  it('los temas graduan: casi ninguno se juega a una sola carta', () => {
    const c = loadContent()
    // Un tema con tirada y un unico nivel de exito desperdicia la diferencia
    // entre aprobar por poco y aprobar por mucho, que es donde vive la tension
    // del sistema. Hay dos excepciones legitimas y por eso el tope no es cero:
    // las ofertas (presentar a alguien: o acepta o no acepta, no hay medias
    // tintas) y las dos preguntas que solo pagan con un exito Extremo, donde
    // graduar seria regalar informacion que el PNJ no da nunca.
    const planos = [...c.topics.values()]
      .filter((t) => t.check)
      .filter((t) => [t.onCritical, t.onExtreme, t.onHard, t.onSuccess].filter(Boolean).length < 2)
      .map((t) => t.id)
    expect(planos.length).toBeLessThanOrEqual(20)
  })

  it('la rama de Evelyn declara las banderas que el dia 2 tiene que leer', () => {
    const c = loadContent()
    // Si el grupo consigue que Evelyn no baje al sotano, o que no baje sola,
    // se cae `evelyn_devorada` y toda la cascada que cuelga de ella. El motor
    // no lo deduce: hay que declararlo, y se declara aqui.
    const banderas = new Set<string>()
    for (const t of c.topics.values()) {
      if (t.npc !== 'evelyn') continue
      for (const r of [t.onCritical, t.onExtreme, t.onHard, t.onSuccess, t.onFailure, t.always]) {
        for (const e of r?.effects ?? []) if (e.kind === 'setFlag') banderas.add(e.flag)
      }
    }
    expect(banderas.has('evelyn_no_baja')).toBe(true)
    expect(banderas.has('evelyn_acompanada')).toBe(true)
    expect(banderas.has('evelyn_va_a_bajar')).toBe(true)
  })

  it('los investigadores tienen habilidades complementarias', () => {
    const c = loadContent()
    const best = (skill: string): string =>
      c.investigators.reduce((a, b) => ((a.skills[skill] ?? 0) >= (b.skills[skill] ?? 0) ? a : b)).id
    // Si el mismo investigador fuese el mejor en todo, separar al grupo no
    // tendria ningun sentido mecanico.
    const especialistas = new Set([best('Escuchar'), best('Arqueologia'), best('Sigilo')])
    expect(especialistas.size).toBe(3)
  })

  it('tiene las tablas del capitulo 5', () => {
    const c = loadContent()
    expect(c.rumors.length).toBe(20)
    expect(c.luctuousEvents.length).toBe(20)
    expect(c.randomNpcs.categories.length).toBeGreaterThanOrEqual(10)
    expect(c.artifacts.size).toBeGreaterThanOrEqual(10)
  })

  it('la baraja de rumores reparte los del final solo a quien tira 1D20', () => {
    const c = loadContent()
    // Con un dado bajo (1D6) el mazo nunca deberia alcanzar los mejores rumores.
    const bajo = new RumorDeck(new Rng('rumor-bajo'), c.rumors)
    for (let i = 0; i < 6; i++) {
      const r = bajo.draw(6)
      expect(r).not.toBeNull()
      expect(r!.index).toBeLessThan(6)
    }
    expect(bajo.draw(6)).toBeNull() // agotados los seis primeros

    // Un PNJ con 1D20 puede llegar a cualquier rumor de la lista, incluidos
    // los del final, que son los mas jugosos.
    const alto = new RumorDeck(new Rng('rumor-alto'), c.rumors)
    const indices = new Set<number>()
    for (let i = 0; i < 20; i++) indices.add(alto.draw(20)!.index)
    expect(indices.has(19)).toBe(true)
  })

  it('la tabla maestra de personajes aleatorios cubre el 1D20 entero', () => {
    const c = loadContent()
    const cubiertos = new Set<number>()
    for (const row of c.randomNpcs.masterTable) {
      for (let n = row.range.min; n <= row.range.max; n++) cubiertos.add(n)
    }
    for (let n = 1; n <= 20; n++) expect(cubiertos.has(n)).toBe(true)
  })

  it('la lista de eventos luctuosos cubre el 1D100 entero', () => {
    const c = loadContent()
    const cubiertos = new Set<number>()
    for (const ev of c.luctuousEvents) {
      for (let n = ev.range.min; n <= ev.range.max; n++) cubiertos.add(n)
    }
    for (let n = 1; n <= 100; n++) expect(cubiertos.has(n)).toBe(true)
  })
})

describe('el paquete de arte', () => {
  /** Identificadores declarados en art/manifest.csv. */
  const manifiesto = (): Map<string, string> => {
    const filas = manifiestoCsv.trim().split(/\r?\n/).slice(1)
    return new Map(filas.map((fila: string) => [fila.split(',')[0]!, fila.split(',')[6]!]))
  }

  it('todo `art` que usa el contenido esta en el manifiesto', () => {
    const c = loadContent()
    const declarados = manifiesto()
    const usados = new Set<string>()
    for (const loc of c.locations.values()) {
      if (loc.art) usados.add(loc.art)
      for (const v of loc.variants ?? []) if (v.art) usados.add(v.art)
    }
    for (const escena of c.scenes.values()) if (escena.art) usados.add(escena.art)
    for (const evento of c.events) if (evento.art) usados.add(evento.art)

    // Sin esto, una lamina puede quedarse sin producir porque nadie recuerda
    // que alguien la pidio: el manifiesto es la lista de la compra.
    const huerfanos = [...usados].filter((nombre) => !declarados.has(nombre))
    expect(huerfanos).toEqual([])
  })

  it('el manifiesto no declara laminas que no use nadie', () => {
    const c = loadContent()
    const declarados = manifiesto()
    const usados = new Set<string>()
    for (const loc of c.locations.values()) if (loc.art) usados.add(loc.art)
    for (const escena of c.scenes.values()) if (escena.art) usados.add(escena.art)
    for (const evento of c.events) if (evento.art) usados.add(evento.art)
    for (const npc of c.npcs.values()) if (npc.portrait) usados.add(npc.portrait)
    for (const inv of c.investigators) if (inv.portrait) usados.add(inv.portrait)

    // Las escenas y mapas planificados todavia no tienen quien los invoque:
    // se listan aparte para que la lista no se llene de falsos positivos.
    const planificados = new Set(['mapa_plantas', 'mapa_sotanos'])
    const sobrantes = [...declarados.keys()].filter(
      (nombre) => !usados.has(nombre) && !planificados.has(nombre) && !nombre.startsWith('escena_'),
    )
    expect(sobrantes).toEqual([])
  })
})

describe('la validacion detecta erratas', () => {
  const base = {
    locations: [
      { id: 'a', name: 'A', floor: 'baja', description: '', exits: [{ to: 'b', minutes: 2 }] },
      { id: 'b', name: 'B', floor: 'baja', description: '', exits: [{ to: 'a', minutes: 2 }] },
    ],
    npcs: [{ id: 'n1', name: 'N', title: 't', chars: {}, skills: {} }],
    investigators: [{ id: 'i1', name: 'I', occupation: 'o', blurb: '', chars: {}, skills: {} }],
    conversations: [],
    events: [],
    topics: [],
  } as never

  const con = (over: object): string[] => validate({ ...(base as object), ...over } as never)

  it('caza una salida a ninguna parte', () => {
    const p = con({
      locations: [
        { id: 'a', name: 'A', floor: 'baja', description: '', exits: [{ to: 'fantasma', minutes: 2 }] },
      ],
    })
    expect(p.some((x) => x.includes('fantasma'))).toBe(true)
  })

  it('caza un evento en una localizacion inexistente', () => {
    const p = con({ events: [{ id: 'e', at: 'D1 10:00', location: 'ninguna' }] })
    expect(p.some((x) => x.includes('ninguna'))).toBe(true)
  })

  it('caza un actor que no existe', () => {
    const p = con({ events: [{ id: 'e', at: 'D1 10:00', location: 'a', actors: ['nadie'] }] })
    expect(p.some((x) => x.includes('nadie'))).toBe(true)
  })

  it('caza una hora mal escrita', () => {
    const p = con({ events: [{ id: 'e', at: 'a las diez', location: 'a' }] })
    expect(p.some((x) => x.includes('hora rara'))).toBe(true)
  })

  it('caza una dependencia a un evento inexistente', () => {
    const p = con({
      events: [
        {
          id: 'e',
          at: 'D1 10:00',
          location: 'a',
          requires: [{ kind: 'eventFired', event: 'no_existe' }],
        },
      ],
    })
    expect(p.some((x) => x.includes('no_existe'))).toBe(true)
  })

  it('caza un tema de dialogo con tirada y sin respuesta de fallo', () => {
    const p = con({
      topics: [
        { id: 't', npc: 'n1', label: 'x', check: {}, onSuccess: { text: 'bien' } },
      ],
    })
    expect(p.some((x) => x.includes('respuesta de fallo'))).toBe(true)
  })

  it('caza un tema que desbloquea algo que no existe', () => {
    const p = con({
      topics: [
        {
          id: 't',
          npc: 'n1',
          label: 'x',
          always: { text: 'a', unlocks: ['tema_fantasma'] },
        },
      ],
    })
    expect(p.some((x) => x.includes('tema_fantasma'))).toBe(true)
  })

  it('caza un duplicado', () => {
    const p = con({
      npcs: [
        { id: 'n1', name: 'A', title: 't', chars: {}, skills: {} },
        { id: 'n1', name: 'B', title: 't', chars: {}, skills: {} },
      ],
    })
    expect(p.some((x) => x.includes('duplicado'))).toBe(true)
  })

  it('caza un rumor vacio', () => {
    const p = con({ rumors: ['algo', '   ', 'otra cosa'] })
    expect(p.some((x) => x.includes('rumor') && x.includes('posicion 1'))).toBe(true)
  })

  it('caza un evento luctuoso con tirada pero ninguna rama que la use', () => {
    const p = con({
      luctuousEvents: [
        {
          id: 'e',
          range: { min: 1, max: 100 },
          text: 'x',
          effects: [],
          check: { skill: 'POD' },
        },
      ],
    })
    expect(p.some((x) => x.includes('ninguna rama'))).toBe(true)
  })

  it('caza un evento luctuoso duplicado', () => {
    const p = con({
      luctuousEvents: [
        { id: 'e', range: { min: 1, max: 50 }, text: 'x', effects: [] },
        { id: 'e', range: { min: 51, max: 100 }, text: 'y', effects: [] },
      ],
    })
    expect(p.some((x) => x.includes('duplicado'))).toBe(true)
  })

  it('caza un hueco en la tabla de eventos luctuosos', () => {
    const p = con({
      luctuousEvents: [
        { id: 'e1', range: { min: 1, max: 40 }, text: 'x', effects: [] },
        { id: 'e2', range: { min: 51, max: 100 }, text: 'y', effects: [] },
      ],
    })
    expect(p.some((x) => x.includes('hueco entre 41 y 50'))).toBe(true)
  })

  it('caza una categoria de personaje aleatorio con memberDie que no cuadra', () => {
    const p = con({
      randomNpcs: {
        genericStatBlock: {
          label: 'x',
          chars: { FUE: 30, CON: 30, TAM: 30, DES: 30, INT: 30, APA: 30, POD: 30, EDU: 30 },
          hp: 6,
          damageBonus: '0',
          build: 0,
          move: 7,
          mp: 6,
          combat: [],
          skills: {},
        },
        masterTable: [{ range: { min: 1, max: 20 }, categories: ['sospechosos'] }],
        categories: [{ id: 'sospechosos', label: 'x', memberDie: 6, members: [{ name: 'Uno' }] }],
      },
    })
    expect(p.some((x) => x.includes('memberDie'))).toBe(true)
  })

  it('caza una categoria de personaje aleatorio que referencia un PNJ inexistente', () => {
    const p = con({
      randomNpcs: {
        genericStatBlock: {
          label: 'x',
          chars: { FUE: 30, CON: 30, TAM: 30, DES: 30, INT: 30, APA: 30, POD: 30, EDU: 30 },
          hp: 6,
          damageBonus: '0',
          build: 0,
          move: 7,
          mp: 6,
          combat: [],
          skills: {},
        },
        masterTable: [{ range: { min: 1, max: 20 }, categories: ['secundarios'] }],
        categories: [
          { id: 'secundarios', label: 'x', memberDie: 1, members: [{ name: 'Fantasma', npc: 'no_existe' }] },
        ],
      },
    })
    expect(p.some((x) => x.includes('no_existe'))).toBe(true)
  })

  it('caza un artefacto duplicado', () => {
    const p = con({
      artifacts: [
        { id: 'disco', name: 'A', usedBy: 'x', description: 'd', powers: 'p' },
        { id: 'disco', name: 'B', usedBy: 'x', description: 'd', powers: 'p' },
      ],
    })
    expect(p.some((x) => x.includes('Artefacto duplicado'))).toBe(true)
  })

  it('caza un artefacto en una localizacion inexistente', () => {
    const p = con({
      artifacts: [{ id: 'disco', name: 'A', usedBy: 'x', description: 'd', powers: 'p', location: 'fantasma' }],
    })
    expect(p.some((x) => x.includes('fantasma'))).toBe(true)
  })

  it('el contenido bueno no produce ningun problema', () => {
    expect(con({})).toEqual([])
  })
})
