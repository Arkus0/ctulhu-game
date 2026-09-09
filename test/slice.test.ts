import { describe, it, expect } from 'vitest'
import { loadContent } from '../src/content/index'
import { Game } from '../src/engine/game'
import { parseTime } from '../src/engine/clock'
import type { Effect } from '../src/engine/types'

const content = loadContent()
const newGame = (seed: string): Game => new Game(content, seed)

/** Avanza hasta una hora concreta esperando en el sitio. */
function waitUntil(g: Game, time: string): void {
  const target = parseTime(time)
  let guard = 0
  while (g.clock.now < target && guard++ < 200) g.wait()
}

describe('la rebanada arranca de pie', () => {
  it('empieza el 21 de noviembre a las 9:00 en recepcion', () => {
    const g = newGame('arranque')
    const v = g.view()
    expect(v.day).toBe(1)
    expect(v.time).toContain('21 de noviembre')
    expect(v.time).toContain('09:00')
    expect(v.location.id).toBe('recepcion')
    expect(v.party).toHaveLength(3)
  })

  it('el grupo empieza junto y con los tres en pie', () => {
    const g = newGame('grupo')
    expect(g.party.together).toBe(true)
    expect(g.party.active).toHaveLength(3)
  })

  it('moverse cuesta tiempo de verdad', () => {
    const g = newGame('tiempo')
    const before = g.clock.now
    g.moveTo('terraza')
    expect(g.clock.now).toBeGreaterThan(before)
    expect(g.view().location.id).toBe('terraza')
  })

  it('no deja ir a donde no hay salida', () => {
    const g = newGame('salidas')
    expect(() => g.moveTo('viejo_templo')).toThrow()
  })
})

describe('el mundo avanza sin ti', () => {
  it('Weder coge el Disco Solar aunque el grupo este en la cama', () => {
    const g = newGame('sin-testigos')
    waitUntil(g, 'D1 13:30')
    // Ha ocurrido, pero no lo ha visto nadie.
    expect(g.world.fired.has('d1_weder_coge_disco')).toBe(true)
    expect(g.world.witnessed.has('d1_weder_coge_disco')).toBe(false)
    expect(g.world.holderOf('disco_solar')).toBe('weder')
  })

  it('lo que pasa sin testigos deja rastro que se puede encontrar despues', () => {
    const g = newGame('rastros')
    waitUntil(g, 'D1 13:30')
    // Bajamos al templo despues de la hora: la caja manipulada sigue ahi.
    g.moveTo('terraza')
    const summary = g.summary()
    expect(summary.missed.length).toBeGreaterThan(0)
    expect(summary.traces).toBeGreaterThan(0)
  })

  it('el Principe llega a su hora pase lo que pase', () => {
    const g = newGame('fuad')
    waitUntil(g, 'D1 14:00')
    expect(g.world.fired.has('d1_fuad_llega')).toBe(true)
  })
})

describe('tres caminos, tres partidas distintas', () => {
  /** Camino A: quedarse con Behler en la terraza. */
  function caminoBehler(seed: string): Game {
    const g = newGame(seed)
    g.moveTo('terraza')
    waitUntil(g, 'D1 11:00')
    for (const t of g.topicsFor('behler')) g.ask(t.id, 'directo')
    waitUntil(g, 'D1 14:00')
    return g
  }

  /** Camino B: espiar a Carter y Weder y seguir al aleman al sotano. */
  function caminoSotano(seed: string): Game {
    const g = newGame(seed)
    g.moveTo('terraza')
    waitUntil(g, 'D1 11:00')
    for (const c of g.view().eavesdroppable) g.listenTo(c.id)
    waitUntil(g, 'D1 11:55')
    g.moveTo('recepcion')
    g.moveTo('restaurante')
    g.moveTo('cocina')
    g.moveTo('almacen_sotano')
    g.moveTo('pasillo_intermedio')
    g.moveTo('salon_ali_bey')
    g.moveTo('sala_escombros')
    waitUntil(g, 'D1 12:15')
    if (g.view().scene?.id === 'ears') g.performAction('ears_examine')
    waitUntil(g, 'D1 14:00')
    return g
  }

  /** Camino C: irse al jardin del salon Isis detras de Gasparini. */
  function caminoJardin(seed: string): Game {
    const g = newGame(seed)
    g.moveTo('salon_isis')
    waitUntil(g, 'D1 12:00')
    for (const c of g.view().eavesdroppable) g.listenTo(c.id)
    waitUntil(g, 'D1 14:00')
    return g
  }

  it('cada camino presencia cosas distintas', () => {
    const a = caminoBehler('c1').summary()
    const b = caminoSotano('c1').summary()
    const c = caminoJardin('c1').summary()
    const key = (s: { seen: string[] }): string => s.seen.slice().sort().join('|')
    expect(new Set([key(a), key(b), key(c)]).size).toBe(3)
  })

  it('ninguno lo ve todo: perderse cosas es la mecanica, no un fallo', () => {
    for (const g of [caminoBehler('c2'), caminoSotano('c2'), caminoJardin('c2')]) {
      const s = g.summary()
      expect(s.missed.length).toBeGreaterThan(0)
    }
  })

  it('quedarse con Behler consigue el encargo y el pago', () => {
    const g = caminoBehler('c3')
    expect(g.world.getFlag('reunion_behler')).toBe(true)
    expect(g.world.knows('fenomenos_inexplicables')).toBe(true)
  })

  it('bajar a tiempo permite presenciar lo de las orejas', () => {
    // Es una escena con ventana: se puede llegar a mitad y seguir contando.
    const g = caminoSotano('s1')
    expect(g.world.fired.has('d1_las_orejas')).toBe(true)
    expect(g.world.witnessed.has('d1_las_orejas')).toBe(true)
    expect(g.world.knows('algo_vive_abajo')).toBe(true)
  })

  it('presenciarlo pasa factura de Cordura mas veces que no presenciarlo', () => {
    // La perdida es 0/1D3: superar la tirada no cuesta NADA, asi que un grupo
    // entero puede salir indemne de una sola escena. Lo que si tiene que
    // cumplirse es que bajar sea peor para la cabeza que quedarse arriba.
    const perdida = (g: Game): number =>
      g.party.members.reduce((acc, m) => acc + (m.sanAtDayStart - m.san), 0)

    const semillas = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8']
    const abajo = semillas.map((s) => perdida(caminoSotano(s)))
    const arriba = semillas.map((s) => perdida(caminoBehler(s)))

    expect(abajo.some((v) => v > 0)).toBe(true)
    const media = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length
    expect(media(abajo)).toBeGreaterThan(media(arriba))
  })

  it('quedarse en la terraza no cuesta Cordura ninguna', () => {
    const g = caminoBehler('tranquilo')
    for (const m of g.party.members) expect(m.san).toBe(m.sanAtDayStart)
  })

  it('espiar en la terraza da fragmentos distintos con semillas distintas', () => {
    const oido = (seed: string): string => {
      const g = newGame(seed)
      g.moveTo('terraza')
      waitUntil(g, 'D1 11:00')
      for (const c of g.view().eavesdroppable) g.listenTo(c.id)
      return g.conversations.heardIn('carter_weder_terraza').sort().join(',')
    }
    const versiones = new Set(['v1', 'v2', 'v3', 'v4', 'v5', 'v6'].map(oido))
    expect(versiones.size).toBeGreaterThan(2)
  })
})

describe('la misma semilla da la misma partida', () => {
  it('dos partidas identicas producen el mismo registro', () => {
    const jugar = (): string => {
      const g = newGame('reproducible')
      g.moveTo('terraza')
      waitUntil(g, 'D1 11:00')
      for (const c of g.view().eavesdroppable) g.listenTo(c.id)
      for (const t of g.topicsFor('behler')) g.ask(t.id, 'adular')
      waitUntil(g, 'D1 14:00')
      return g.world.log.map((l) => `${l.minute}:${l.channel}:${l.text.slice(0, 40)}`).join('\n')
    }
    expect(jugar()).toBe(jugar())
  })
})

describe('dialogo', () => {
  it('los ganchos de interpretacion cambian el resultado', () => {
    // Adular a Carter da bonificacion; mencionarle la Hermandad, penalizacion.
    const g = newGame('ganchos')
    const adular = g.dialogue.hooksFor('carter', { id: 'adular', label: '', skill: 'Charlateria', hint: '' }, 'Charlateria')
    expect(adular.bonus).toBeGreaterThan(0)

    const hermandad = g.dialogue.hooksFor('carter', { id: 'hermandad', label: '', skill: 'Persuasion', hint: '' }, 'Persuasion')
    expect(hermandad.penalty).toBeGreaterThan(0)
  })

  it('preguntar a Fuad llamandole Principe es una idea pesima', () => {
    const g = newGame('fuad-principe')
    const h = g.dialogue.hooksFor('fuad', { id: 'llamarle_principe', label: '', skill: 'Persuasion', hint: '' }, 'Persuasion')
    expect(h.penalty).toBeGreaterThanOrEqual(3)
  })

  it('un tema de una sola vez desaparece tras preguntarlo', () => {
    const g = newGame('una-vez')
    g.moveTo('terraza')
    waitUntil(g, 'D1 11:00')
    const antes = g.topicsFor('behler').map((t) => t.id)
    expect(antes).toContain('behler_encargo')
    g.ask('behler_encargo')
    expect(g.topicsFor('behler').map((t) => t.id)).not.toContain('behler_encargo')
  })

  it('el encargo de Behler desbloquea los temas que dependen de el', () => {
    const g = newGame('desbloqueo')
    g.moveTo('terraza')
    waitUntil(g, 'D1 11:00')
    expect(g.topicsFor('behler').map((t) => t.id)).not.toContain('behler_pago')
    g.ask('behler_encargo')
    expect(g.topicsFor('behler').map((t) => t.id)).toContain('behler_pago')
  })

  it('invitar a la senorita Thornhill la convierte en aliada de por vida', () => {
    const g = newGame('thornhill')
    g.world.setFlag('invitados_mascarada')
    g.moveTo('correos')
    const antes = g.world.npc('thornhill').disposition
    g.ask('thornhill_invitar')
    expect(g.world.npc('thornhill').disposition).toBeGreaterThan(antes + 40)
    expect(g.world.getFlag('thornhill_aliada')).toBe(true)
  })
})

describe('simulacion en seco de la agenda completa', () => {
  it('ningun PNJ acaba en dos sitios a la vez', () => {
    const g = newGame('seco')
    waitUntil(g, 'D1 14:00')
    const porNpc = new Map<string, string>()
    for (const n of g.world.allNpcs) {
      expect(porNpc.has(n.id)).toBe(false)
      porNpc.set(n.id, n.location)
    }
    expect(porNpc.size).toBe(content.npcs.size)
  })

  it('la cadena de custodia del Disco Solar avanza sola', () => {
    const g = newGame('custodia')
    expect(g.world.holderOf('disco_solar')).toBe('nobody')
    waitUntil(g, 'D1 13:00')
    expect(g.world.holderOf('disco_solar')).toBe('weder')
    expect(g.world.getFlag('disco_en_caja_fuerte')).toBe(true)
  })

  it('si el grupo roba el disco antes, Weder no lo encuentra', () => {
    const g = newGame('robo')
    // El grupo se adelanta y lo saca del templo antes de las 12:30.
    g.world.setHolder('disco_solar', 'player')
    waitUntil(g, 'D1 13:30')
    // El evento exige que el disco siga sin dueno, asi que se descarta entero.
    expect(g.world.cancelled.has('d1_weder_coge_disco')).toBe(true)
    expect(g.world.holderOf('disco_solar')).toBe('player')
    // Y la cascada arrastra lo que dependia de ello.
    expect(g.world.fired.has('d1_weder_sube')).toBe(false)
  })

  it('la ventana de la habitacion 407 solo se abre si el disco llego a la caja', () => {
    const g = newGame('ventana')
    waitUntil(g, 'D1 14:30')
    expect(g.world.getFlag('disco_en_caja_fuerte')).toBe(true)
    expect(g.world.getFlag('ventana_407_abierta')).toBe(true)
  })
})

describe('la tarde y la mascarada del dia 1', () => {
  /** Deja correr el reloj hasta que amanece el 22. */
  function hastaElAmanecer(seed: string): Game {
    const g = newGame(seed)
    let guard = 0
    while (g.clock.now < parseTime('D2 07:00') && guard++ < 3000) g.wait()
    return g
  }

  const SEMILLAS = ['n1', 'n2', 'n3', 'n4', 'n5', 'n6']

  it('la agenda de la noche se resuelve entera: nada queda colgando', () => {
    for (const s of SEMILLAS) {
      const g = hastaElAmanecer(s)
      // Todo evento tiene que haber ocurrido o haberse descartado. Un evento que
      // no es ni una cosa ni la otra es una rama muerta en la agenda.
      const colgados = content.events
        .map((e) => e.id)
        .filter((id) => !g.world.fired.has(id) && !g.world.cancelled.has(id))
      expect({ semilla: s, colgados }).toEqual({ semilla: s, colgados: [] })
    }
  })

  it('el Disco Solar acaba siempre en una mano declarada', () => {
    for (const s of SEMILLAS) {
      const g = hastaElAmanecer(s)
      const quien = g.world.holderOf('disco_solar')
      // Weder lo saca del templo, se lo vende a Dieter, Dieter lo esconde bajo
      // el colchon y los esbirros de Selassie pueden llevarselo esa noche.
      expect(['dieter', 'selassie']).toContain(quien)
      if (quien === 'dieter') expect(g.world.getFlag('disco_bajo_el_colchon')).toBe(true)
      if (quien === 'selassie') expect(g.world.getFlag('disco_lo_tiene_selassie')).toBe(true)
    }
  })

  it('la Daga de Akhenaton acaba siempre en manos del Principe', () => {
    for (const s of SEMILLAS) {
      const g = hastaElAmanecer(s)
      expect(g.world.holderOf('daga_de_akhenaton')).toBe('fuad')
      expect(g.world.getFlag('pacto_con_fuad')).toBe(true)
    }
  })

  it('si el grupo se adelanta, la venta de las 16:00 se cae y Carter monta en colera igual', () => {
    const g = newGame('adelantarse')
    // El grupo saca el disco de la caja fuerte en la ventana de las 14:00.
    g.world.setHolder('disco_solar', 'player')
    let guard = 0
    while (g.clock.now < parseTime('D1 19:00') && guard++ < 200) g.wait()

    expect(g.world.cancelled.has('d1_weder_vende_el_disco')).toBe(true)
    expect(g.world.cancelled.has('d1_dieter_esconde_el_disco')).toBe(true)
    expect(g.world.holderOf('disco_solar')).toBe('player')
    // Pero Carter baja igual, y encuentra el hueco igual.
    expect(g.world.fired.has('d1_carter_descubre_el_robo')).toBe(true)
    expect(g.world.getFlag('carter_furioso')).toBe(true)
  })

  it('el telegrama a Shakti se escribe siempre y pasa por la oficina de correos', () => {
    for (const s of SEMILLAS) {
      const g = hastaElAmanecer(s)
      expect(g.world.getFlag('shakti_avisado')).toBe(true)
      expect(g.world.getFlag('telegrama_en_correos')).toBe(true)
    }
  })

  it('Najir o baja a los sotanos y no sale, o se marcha a vigilar la entrada', () => {
    for (const s of SEMILLAS) {
      const g = hastaElAmanecer(s)
      const bajo = g.world.getFlag('najir_baja_al_sotano')
      const muerto = g.world.getFlag('najir_muerto')
      const fuera = g.world.getFlag('najir_vigila_la_entrada')
      // Las dos ramas son excluyentes: el libro no contempla las dos cosas.
      expect({ semilla: s, ambas: muerto && fuera }).toEqual({ semilla: s, ambas: false })
      expect(bajo ? muerto : fuera).toBe(true)
      expect(g.world.npc('najir').status).toBe(bajo ? 'dead' : 'ok')
    }
  })

  it('al amanecer nadie se queda plantado en el sotano', () => {
    const g = hastaElAmanecer('amanecer')
    const abajo = ['almacen_sotano', 'pasillo_intermedio', 'salon_ali_bey', 'sala_escombros', 'viejo_templo']
    const atrapados = g.world.allNpcs
      .filter((n) => abajo.includes(n.location) && n.status !== 'dead')
      .map((n) => n.id)
    expect(atrapados).toEqual([])
  })

  it('Dieter termina la noche encerrado en el frigorifico', () => {
    const g = hastaElAmanecer('frigorifico')
    expect(g.world.getFlag('dieter_encerrado')).toBe(true)
    expect(g.world.npc('dieter').status).toBe('detained')
    expect(g.world.npc('dieter').location).toBe('cocina')
  })

  it('los que aun no han llegado no estan en el hall a las nueve de la manana', () => {
    const g = newGame('llegadas')
    // Najir llega a las 17:00 y el Aga Khan a las 17:30: antes de eso no se les
    // puede ver ni abordar en ninguna sala del hotel.
    for (const id of ['najir', 'aga_khan', 'selassie', 'carnarvon', 'evelyn', 'shakti']) {
      expect(g.world.npcsAt('recepcion').map((n) => n.id)).not.toContain(id)
    }
    let guard = 0
    while (g.clock.now < parseTime('D1 17:15') && guard++ < 200) g.wait()
    expect(g.world.npc('najir').location).toBe('recepcion')
    expect(g.world.npc('aga_khan').location).not.toBe('recepcion')
  })
})

describe('la noche es jugable, no solo simulable', () => {
  /**
   * La agenda de la noche siempre se ejecuto bien; lo que no habia era manera de
   * verla. La demo se cortaba a las 13:00 y cincuenta de los sesenta y ocho
   * sucesos se disparaban sin que ningun jugador pudiera estar delante.
   */
  it('el jugador conserva acciones despues de las 13:00 y hasta el amanecer', () => {
    for (const hora of ['D1 14:00', 'D1 17:00', 'D1 21:30', 'D1 23:45', 'D2 03:00', 'D2 06:30']) {
      const g = newGame('acciones-' + hora)
      g.advanceTime(parseTime(hora) - g.clock.now)
      expect({ hora, acciones: g.view().actions.length > 0 }).toEqual({ hora, acciones: true })
      expect({ hora, fin: g.view().finished }).toEqual({ hora, fin: false })
    }
  })

  it('la rebanada se cierra al clausurarse la mascarada, no a mediodia', () => {
    const g = newGame('cierre')
    g.advanceTime(parseTime('D2 06:59') - g.clock.now)
    expect(g.view().sliceFinished).toBe(false)
    g.advanceTime(1)
    expect(g.view().sliceFinished).toBe(true)
    expect(g.view().finished).toBe(true)
    expect(g.view().actions).toEqual([])
  })

  it('el tablero del caso ofrece objetivos durante toda la noche', () => {
    const g = newGame('tablero')
    const activas = (): string[] =>
      g.view().leads.filter((l) => l.status === 'active').map((l) => l.id)
    // El grupo se entera de lo que hay que enterarse estando donde toca.
    g.party.moveTogether('terraza')
    g.advanceTime(parseTime('D1 11:05') - g.clock.now)
    g.party.moveTogether('restaurante')
    g.advanceTime(parseTime('D1 13:50') - g.clock.now)
    expect(g.world.knows('carter_evita_su_habitacion')).toBe(true)
    expect(activas()).toContain('saco_carter')

    g.party.moveTogether('salon_baile')
    g.advanceTime(parseTime('D1 18:30') - g.clock.now)
    expect(g.world.knows('mascarada_esta_noche')).toBe(true)
    expect(activas()).toContain('mascarada')
  })

  it('una pista de noche que vence sin descubrirse deja el hueco anonimo', () => {
    const g = newGame('vencidas')
    g.advanceTime(parseTime('D2 02:30') - g.clock.now)
    const anonimas = g.view().leads.filter((l) => l.anonymous)
    expect(anonimas.length).toBeGreaterThanOrEqual(4)
    expect(new Set(anonimas.map((l) => l.title))).toEqual(new Set(['Oportunidad perdida']))
    // Lo que no se descubrio no se nombra. Se mira lo que el jugador lee de
    // verdad -titulo, detalle y ventana-, porque el `id` es la clave interna
    // del tablero y `showCase` no lo pinta en ninguna parte.
    const visible = JSON.stringify(
      anonimas.map((l) => ({ title: l.title, detail: l.detail, deadline: l.deadline })),
    )
    expect(visible).not.toMatch(/Najir|telegrama|Shakti|mascarada|Selassie|Carter|Weder/i)
  })

  it('la espera larga cruza los tramos muertos sin saltarse el final', () => {
    const g = newGame('espera-larga')
    g.party.moveTogether('recepcion')
    g.advanceTime(parseTime('D1 20:00') - g.clock.now)
    const larga = g.view().actions.find((a) => a.id === 'wait_long')
    expect(larga).toBeDefined()
    expect(larga!.minutes).toBeGreaterThanOrEqual(30)
    expect(larga!.minutes).toBeLessThanOrEqual(90)
    const antes = g.clock.now
    g.performAction('wait_long')
    expect(g.clock.now).toBeGreaterThan(antes + 29)

    // Nunca por encima del cierre de la rebanada.
    const fin = newGame('espera-fin')
    fin.advanceTime(parseTime('D2 06:00') - fin.clock.now)
    for (const accion of fin.view().actions) {
      if (accion.id === 'wait_long') {
        expect(fin.clock.now + accion.minutes!).toBeLessThanOrEqual(parseTime('D2 07:00'))
      }
    }
  })

  /**
   * El mapa es la unica forma de moverse: una sala que no sale en el panel no
   * existe para el jugador. Trece sucesos de la noche ocurren en el salon de
   * baile, cuatro en la 407 y dos en la 204.
   */
  it('toda sala con sucesos se puede alcanzar desde el mapa', () => {
    const g = newGame('mapa-completo')
    // Un grupo que se ha enterado de todo lo que el dia ensena.
    for (const fact of [
      'ruta_servicio_al_sotano', 'carter_y_weder_juntos', 'disco_solar_existe',
      'lounpeen_en_el_hotel', 'fuad_ha_llegado', 'faraz_najir',
      'aga_khan_viene', 'selassie_en_el_hotel',
    ]) g.world.learnFact(fact)

    const alcanzables = new Set(g.mapDestinations().map((d) => d.id))
    const conSucesos = [...new Set(content.events.map((e) => e.location))]
    const inalcanzables = conSucesos.filter((id) => !alcanzables.has(id))
    expect(inalcanzables).toEqual([])
  })

  it('una habitación ajena no aparece en el mapa hasta saber quién la ocupa', () => {
    const g = newGame('mapa-discreto')
    const ids = (): string[] => g.mapDestinations().map((d) => d.id)
    expect(ids()).toContain('salon_baile')
    expect(ids()).toContain('pasillo_habitaciones')
    expect(ids()).not.toContain('hab_selassie')
    expect(ids()).not.toContain('hab_fuad')
    g.world.learnFact('selassie_en_el_hotel')
    expect(ids()).toContain('hab_selassie')
    expect(ids()).not.toContain('hab_fuad')
  })

  it('el subsuelo sigue pidiendo conocer la ruta de servicio', () => {
    const g = newGame('mapa-subsuelo')
    expect(g.mapDestinations().map((d) => d.id)).not.toContain('viejo_templo')
    g.world.learnFact('ruta_servicio_al_sotano')
    expect(g.mapDestinations().map((d) => d.id)).toContain('viejo_templo')
  })

  it('no se ofrece salto largo cuando hay algo ocurriendo delante', () => {
    const g = newGame('salto-en-escena')
    g.party.moveTogether('salon_baile')
    g.advanceTime(parseTime('D1 21:15') - g.clock.now)
    expect(g.view().actions.some((a) => a.id === 'wait_long')).toBe(false)
  })
})

describe('setInvestigatorStatus: sucesos que sacan a un investigador de la partida sin danno', () => {
  // No hay ningun sitio real del hotel pensado para probar esto, asi que se
  // inyecta una localizacion de usar y tirar sobre una copia del contenido
  // real: no se toca ningun fichero de src/content.
  function conCuadroMaldito(effect: Effect) {
    const content2 = { ...content, locations: new Map(content.locations) }
    content2.locations.set('sala_de_prueba', {
      id: 'sala_de_prueba',
      name: 'Sala de prueba',
      floor: 'baja',
      description: 'Una sala que solo existe para este test.',
      exits: [],
      features: [
        {
          id: 'cuadro_maldito',
          name: 'El cuadro',
          description: 'd',
          onSuccess: [effect],
        },
      ],
    })
    return content2
  }

  it('con who al azar, saca a uno cualquiera de los presentes y a nadie mas', () => {
    const g = new Game(conCuadroMaldito({ kind: 'setInvestigatorStatus', who: 'random', status: 'fled' }), 'pnakotus')
    g.party.moveTogether('sala_de_prueba')
    g.examine('cuadro_maldito')

    const idos = g.party.members.filter((m) => m.status === 'fled')
    expect(idos).toHaveLength(1)
    expect(g.party.active).toHaveLength(2)
  })

  it('con who explicito, afecta solo a ese investigador', () => {
    const segundoId = content.investigators[1]!.id
    const g = new Game(
      conCuadroMaldito({ kind: 'setInvestigatorStatus', who: segundoId, status: 'detained' }),
      'explicito',
    )
    const objetivo = g.party.members[1]!
    expect(objetivo.id).toBe(segundoId)
    g.party.moveTogether('sala_de_prueba')
    g.examine('cuadro_maldito')

    expect(objetivo.status).toBe('detained')
    expect(g.party.members.filter((m) => m.status === 'detained')).toHaveLength(1)
  })
})
