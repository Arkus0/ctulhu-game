import { describe, it, expect } from 'vitest'
import { Rng } from '../src/engine/rng'
import {
  ConversationLog,
  eavesdrop,
  tail,
  spot,
  type ConversationDef,
  type PerceptionDeps,
} from '../src/engine/perception'
import { buildWorld, npc } from './world'

/** La conversacion real de Carter y Weder en la terraza, pagina 48 del modulo. */
const TERRAZA: ConversationDef = {
  id: 'carter_weder_terraza',
  location: 'terraza',
  participants: ['carter', 'weder'],
  ambient: 'Hablan bajo. Solo llega el tintineo de las cucharillas.',
  fragments: [
    { id: 'f1', text: 'Y los fellahin que nos ayudaron. Ya me encargue de ellos.' },
    { id: 'f2', text: 'El 22 del 22, a las 22:00.', facts: ['fecha_traslado'] },
    { id: 'f3', text: 'El traslado debe efectuarse despues de que te lo lleves a Luxor.' },
    { id: 'f4', text: 'Aunque su hija sea devorada por las ratas de las cocinas.' },
    { id: 'f5', text: 'Gracias a las ratas de las cocinas, tu tesoro esta protegido.' },
    { id: 'f6', text: 'Tengo mi habitacion apestada. Dormir con un cadaver bajo la cama.' },
  ],
}

function deps(seed: string, location = 'terraza', members = 1): PerceptionDeps & { w: ReturnType<typeof buildWorld> } {
  const w = buildWorld({
    seed,
    startLocation: location,
    members,
    npcs: [
      { def: npc('carter', { skills: { Descubrir: 35, Escuchar: 30 } }), location: 'terraza' },
      { def: npc('weder', { skills: { Descubrir: 35, Escuchar: 30 } }), location: 'terraza' },
    ],
  })
  return {
    rng: w.rng,
    party: w.party,
    world: w.world,
    npcSkills: {
      carter: { Descubrir: 35, Escuchar: 30 },
      weder: { Descubrir: 35, Escuchar: 30 },
    },
    w,
  }
}

describe('escucha fragmentaria', () => {
  it('nunca entrega mas fragmentos de los que existen', () => {
    for (let i = 0; i < 60; i++) {
      const d = deps(`tope${i}`)
      const log = new ConversationLog()
      const r = eavesdrop(d, TERRAZA, log, { skipStealth: true })
      expect(r.fragments.length).toBeLessThanOrEqual(TERRAZA.fragments.length)
      expect(new Set(r.fragments.map((f) => f.id)).size).toBe(r.fragments.length)
    }
  })

  it('un exito normal da entre 1 y 6 fragmentos', () => {
    let sawSome = false
    for (let i = 0; i < 200; i++) {
      const d = deps(`normal${i}`)
      const log = new ConversationLog()
      const r = eavesdrop(d, TERRAZA, log, { skipStealth: true })
      if (r.listen && r.listen.success) {
        sawSome = true
        expect(r.fragments.length).toBeGreaterThanOrEqual(1)
      }
    }
    expect(sawSome).toBe(true)
  })

  it('fallar Escuchar no da ningun fragmento, pero si el ambiente', () => {
    let sawFail = false
    for (let i = 0; i < 200 && !sawFail; i++) {
      const d = deps(`fallo${i}`)
      const log = new ConversationLog()
      const r = eavesdrop(d, TERRAZA, log, { skipStealth: true })
      if (r.listen && !r.listen.success) {
        sawFail = true
        expect(r.fragments).toHaveLength(0)
        expect(r.narration).toBe(TERRAZA.ambient)
      }
    }
    expect(sawFail).toBe(true)
  })

  it('no repite fragmentos ya oidos al insistir', () => {
    const d = deps('insistir')
    const log = new ConversationLog()
    const seen = new Set<string>()
    for (let i = 0; i < 12; i++) {
      const r = eavesdrop(d, TERRAZA, log, { skipStealth: true })
      for (const f of r.fragments) {
        expect(seen.has(f.id)).toBe(false)
        seen.add(f.id)
      }
    }
    expect(log.heardIn(TERRAZA.id).length).toBe(seen.size)
  })

  it('devuelve los fragmentos en el orden del guion, no en el del sorteo', () => {
    for (let i = 0; i < 80; i++) {
      const d = deps(`orden${i}`)
      const r = eavesdrop(d, TERRAZA, new ConversationLog(), { skipStealth: true })
      const idx = r.fragments.map((f) => TERRAZA.fragments.findIndex((x) => x.id === f.id))
      expect(idx).toEqual([...idx].sort((a, b) => a - b))
    }
  })

  it('aprende los hechos que traen los fragmentos', () => {
    const d = deps('hechos')
    const log = new ConversationLog()
    let learned = false
    for (let i = 0; i < 12 && !learned; i++) {
      const r = eavesdrop(d, TERRAZA, log, { skipStealth: true })
      if (r.fragments.some((f) => f.id === 'f2')) learned = true
    }
    if (learned) expect(d.world.knows('fecha_traslado')).toBe(true)
  })

  it('lleva la cuenta de lo que queda por oir', () => {
    const d = deps('restante')
    const log = new ConversationLog()
    const r = eavesdrop(d, TERRAZA, log, { skipStealth: true })
    expect(r.remaining).toBe(TERRAZA.fragments.length - r.fragments.length)
    expect(log.coverage(TERRAZA)).toBeCloseTo(r.fragments.length / 6, 5)
  })

  it('sin nadie del grupo cerca no se oye nada', () => {
    const d = deps('lejos', 'sotano')
    const r = eavesdrop(d, TERRAZA, new ConversationLog(), { skipStealth: true })
    expect(r.positioned).toBe(false)
    expect(r.listen).toBeNull()
    expect(r.fragments).toHaveLength(0)
  })

  it('ser descubierto corta la escucha y deja al PNJ escamado', () => {
    let caught = false
    for (let i = 0; i < 200 && !caught; i++) {
      const d = deps(`pillado${i}`)
      const r = eavesdrop(d, TERRAZA, new ConversationLog())
      if (r.detectedBy) {
        caught = true
        expect(r.fragments).toHaveLength(0)
        expect(d.world.npc(r.detectedBy).suspicious).toBe(true)
        expect(d.world.npc(r.detectedBy).disposition).toBeLessThan(0)
      }
    }
    expect(caught).toBe(true)
  })

  it('el sigilo lo marca el peor del grupo presente', () => {
    const d = deps('eslabon', 'terraza', 3)
    d.party.members[0]!.skills['Sigilo'] = 90
    d.party.members[1]!.skills['Sigilo'] = 90
    d.party.members[2]!.skills['Sigilo'] = 5
    let detections = 0
    for (let i = 0; i < 120; i++) {
      if (eavesdrop(d, TERRAZA, new ConversationLog()).detectedBy) detections++
    }
    // Con un torpe en el grupo, los pillan a menudo.
    expect(detections).toBeGreaterThan(20)
  })

  it('escuchar lo hace el mejor del grupo presente', () => {
    const d = deps('mejor-oido', 'terraza', 2)
    d.party.members[0]!.skills['Escuchar'] = 5
    d.party.members[1]!.skills['Escuchar'] = 95
    const r = eavesdrop(d, TERRAZA, new ConversationLog(), { skipStealth: true })
    expect(r.listen?.target).toBe(95)
  })
})

describe('seguir a un PNJ', () => {
  it('mucha habilidad hace que funcione la mayoria de las veces', () => {
    const d = deps('seguir-bien')
    for (const m of d.party.members) m.skills['Sigilo'] = 90
    let ok = 0
    const n = 400
    for (let i = 0; i < n; i++) {
      // Cada intento parte de cero: aqui medimos la tirada, no el desgaste.
      d.world.npc('weder').suspicious = false
      if (tail(d, 'weder').success) ok++
    }
    // Sigilo 90 contra una alerta de 35, resolviendo empates a favor del PNJ,
    // ronda el 69%. No es un pase automatico, y no deberia serlo.
    expect(ok / n).toBeGreaterThan(0.6)
    expect(ok / n).toBeLessThan(0.8)
  })

  it('la sospecha, una vez encendida, ya no se apaga sola', () => {
    const d = deps('desgaste')
    for (const m of d.party.members) m.skills['Sigilo'] = 90
    expect(d.world.npc('weder').suspicious).toBe(false)

    // Seguimos hasta el primer fallo: ese es el que le pone en guardia.
    let attempts = 0
    while (tail(d, 'weder').success && attempts++ < 200) {
      expect(d.world.npc('weder').suspicious).toBe(false)
    }
    expect(d.world.npc('weder').suspicious).toBe(true)

    // A partir de ahi da igual cuantas veces salga bien: no vuelve a confiarse.
    const disposition = d.world.npc('weder').disposition
    for (let i = 0; i < 50; i++) tail(d, 'weder')
    expect(d.world.npc('weder').suspicious).toBe(true)
    expect(d.world.npc('weder').disposition).toBeLessThanOrEqual(disposition)
  })

  it('ser descubierto deja al PNJ escamado y resentido', () => {
    const d = deps('seguir-mal')
    for (const m of d.party.members) m.skills['Sigilo'] = 1
    let caught = false
    for (let i = 0; i < 200 && !caught; i++) {
      const r = tail(d, 'weder')
      if (!r.success) {
        caught = true
        expect(d.world.npc('weder').suspicious).toBe(true)
        expect(d.world.npc('weder').disposition).toBeLessThanOrEqual(-15)
      }
    }
    expect(caught).toBe(true)
  })

  it('un PNJ ya escamado es mucho mas dificil de seguir', () => {
    const rate = (suspicious: boolean): number => {
      const d = deps(`escamado-${suspicious}`)
      for (const m of d.party.members) m.skills['Sigilo'] = 60
      d.world.npc('weder').suspicious = suspicious
      let ok = 0
      for (let i = 0; i < 400; i++) {
        d.world.npc('weder').suspicious = suspicious
        if (tail(d, 'weder').success) ok++
      }
      return ok / 400
    }
    expect(rate(true)).toBeLessThan(rate(false))
  })
})

describe('descubrir cosas fijas', () => {
  it('devuelve null si no hay nadie en la localizacion', () => {
    const d = deps('vacio', 'sotano')
    expect(spot(d, 'terraza')).toBeNull()
  })

  it('tira con el mejor del grupo presente', () => {
    const d = deps('descubrir', 'terraza', 2)
    d.party.members[0]!.skills['Descubrir'] = 10
    d.party.members[1]!.skills['Descubrir'] = 80
    expect(spot(d, 'terraza')?.target).toBe(80)
  })
})

describe('registro de conversaciones', () => {
  it('se guarda y se restaura entero', () => {
    const log = new ConversationLog()
    log.markHeard('a', 'f1')
    log.markHeard('a', 'f3')
    log.markHeard('b', 'f1')
    const other = new ConversationLog()
    other.restore(log.snapshot())
    expect(other.heardIn('a').sort()).toEqual(['f1', 'f3'])
    expect(other.hasHeard('b', 'f1')).toBe(true)
    expect(other.hasHeard('b', 'f2')).toBe(false)
  })

  it('una conversacion sin fragmentos cuenta como cubierta', () => {
    const log = new ConversationLog()
    expect(log.coverage({ ...TERRAZA, fragments: [] })).toBe(1)
  })
})

describe('reproducibilidad', () => {
  it('la misma semilla da exactamente la misma escucha', () => {
    const run = (): string[] => {
      const d = deps('reproducible')
      return eavesdrop(d, TERRAZA, new ConversationLog(), { skipStealth: true }).fragments.map(
        (f) => f.id,
      )
    }
    expect(run()).toEqual(run())
  })

  it('semillas distintas dan reconstrucciones distintas', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 30; i++) {
      const d = deps(`variedad${i}`)
      const r = eavesdrop(d, TERRAZA, new ConversationLog(), { skipStealth: true })
      ids.add(r.fragments.map((f) => f.id).join(','))
    }
    expect(ids.size).toBeGreaterThan(3)
  })
})

describe('Rng.sample no se pasa de la raya', () => {
  it('pedir mas de lo que hay devuelve todo', () => {
    const r = new Rng('sample')
    expect(r.sample(TERRAZA.fragments, 99)).toHaveLength(6)
  })
})
