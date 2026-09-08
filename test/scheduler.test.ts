import { describe, it, expect } from 'vitest'
import {
  Clock,
  GAME_START,
  parseTime,
  t,
  formatClock,
  formatFull,
  timeOfDay,
  dayOf,
} from '../src/engine/clock'
import type { EventDef } from '../src/engine/scheduler'
import { buildWorld, npc } from './world'

describe('reloj', () => {
  it('interpreta las horas como las escribe el contenido', () => {
    expect(parseTime('D1 09:00')).toBe(540)
    expect(parseTime('D1 12:30')).toBe(750)
    expect(parseTime('D2 21:00')).toBe(1440 + 1260)
    expect(parseTime('D3 03:00')).toBe(2880 + 180)
    expect(parseTime('11:00')).toBe(660)
  })

  it('rechaza horas imposibles', () => {
    expect(() => parseTime('D1 25:00')).toThrow()
    expect(() => parseTime('D1 12:75')).toThrow()
    expect(() => parseTime('mediodia')).toThrow()
  })

  it('formatea para pantalla', () => {
    expect(formatClock(t(1, 9, 0))).toBe('09:00')
    expect(formatClock(t(2, 21, 30))).toBe('21:30')
    expect(formatFull(t(2, 12, 0))).toContain('22 de noviembre')
    expect(dayOf(t(3, 2, 0))).toBe(3)
  })

  it('distingue los momentos del dia para elegir lamina', () => {
    expect(timeOfDay(t(1, 11, 0))).toBe('manana')
    expect(timeOfDay(t(1, 17, 0))).toBe('tarde')
    expect(timeOfDay(t(1, 23, 0))).toBe('noche')
    expect(timeOfDay(t(2, 3, 0))).toBe('madrugada')
  })

  it('cuenta las secuencias de media hora cruzadas', () => {
    const c = new Clock(t(1, 11, 0))
    const info = c.advance(75)
    // De 11:00 a 12:15 se cruzan dos limites: las 11:30 y las 12:00.
    expect(info.sequencesCrossed).toEqual([t(1, 11, 30), t(1, 12, 0)])
    expect(c.now).toBe(t(1, 12, 15))
    // Justo al pisar el limite, ese limite cuenta como cruzado.
    expect(new Clock(t(1, 11, 0)).advance(30).sequencesCrossed).toEqual([t(1, 11, 30)])
  })

  it('sabe cuanto falta para cerrar la secuencia', () => {
    const c = new Clock(t(1, 11, 10))
    expect(c.minutesToNextSequence).toBe(20)
    c.advanceToNextSequence()
    expect(formatClock(c.now)).toBe('11:30')
  })

  it('nunca retrocede', () => {
    const c = new Clock(GAME_START)
    expect(() => c.advance(-10)).toThrow()
    c.advanceTo(GAME_START - 100)
    expect(c.now).toBe(GAME_START)
  })
})

/* ------------------------------------------------------------------ */

const ev = (over: Partial<EventDef> & { id: string; at: string }): EventDef => ({
  location: 'terraza',
  ...over,
})

describe('scheduler: disparo basico', () => {
  it('dispara en orden cronologico', () => {
    const { scheduler } = buildWorld({
      events: [
        ev({ id: 'c', at: 'D1 12:00' }),
        ev({ id: 'a', at: 'D1 10:00' }),
        ev({ id: 'b', at: 'D1 11:00' }),
      ],
    })
    const r = scheduler.advance(240)
    const order = [...r.witnessed, ...r.offscreen].sort((x, y) => x.minute - y.minute)
    expect(order.map((f) => f.def.id)).toEqual(['a', 'b', 'c'])
  })

  it('respeta la prioridad dentro del mismo minuto', () => {
    const { scheduler } = buildWorld({
      events: [
        ev({ id: 'tarde', at: 'D1 10:00', priority: 0 }),
        ev({ id: 'antes', at: 'D1 10:00', priority: 10 }),
      ],
    })
    const r = scheduler.advance(120)
    expect(r.witnessed.map((f) => f.def.id)).toEqual(['antes', 'tarde'])
  })

  it('no dispara lo que aun no toca', () => {
    const { scheduler } = buildWorld({
      events: [ev({ id: 'tarde', at: 'D1 20:00' })],
    })
    const r = scheduler.advance(60)
    expect(r.witnessed).toHaveLength(0)
    expect(scheduler.isPending('tarde')).toBe(true)
  })

  it('coloca a los actores en la localizacion del evento', () => {
    const { scheduler, world } = buildWorld({
      npcs: [{ def: npc('weder'), location: 'habitacion' }],
      events: [ev({ id: 'baja', at: 'D1 12:00', location: 'sotano', actors: ['weder'] })],
    })
    scheduler.advance(300)
    expect(world.npc('weder').location).toBe('sotano')
  })

  it('protesta ante identificadores duplicados', () => {
    const { scheduler } = buildWorld({})
    scheduler.load([ev({ id: 'x', at: 'D1 10:00' })])
    expect(() => scheduler.load([ev({ id: 'x', at: 'D1 11:00' })])).toThrow(/duplicado/)
  })
})

describe('scheduler: presenciar o perderselo', () => {
  it('marca como presenciado si el grupo esta delante', () => {
    const { scheduler, world } = buildWorld({
      startLocation: 'terraza',
      events: [ev({ id: 'charla', at: 'D1 11:00', location: 'terraza', witnessText: 'Hablan.' })],
    })
    const r = scheduler.advance(180)
    expect(r.witnessed.map((f) => f.def.id)).toEqual(['charla'])
    expect(world.witnessed.has('charla')).toBe(true)
    expect(world.log.some((l) => l.channel === 'seen')).toBe(true)
  })

  it('ocurre igual sin testigos, pero deja rastro', () => {
    const { scheduler, world } = buildWorld({
      startLocation: 'terraza',
      events: [
        ev({
          id: 'sotano',
          at: 'D1 12:00',
          location: 'viejo_templo',
          witnessText: 'Weder se lleva el Disco.',
          traces: [{ id: 'olor', text: 'Un hedor insoportable sube por las escaleras.' }],
        }),
      ],
    })
    const r = scheduler.advance(300)
    expect(r.offscreen.map((f) => f.def.id)).toEqual(['sotano'])
    expect(world.fired.has('sotano')).toBe(true)
    expect(world.witnessed.has('sotano')).toBe(false)
    expect(r.traces.map((x) => x.id)).toEqual(['olor'])
  })

  it('el rastro condicionado solo aparece si procede', () => {
    const { scheduler, world } = buildWorld({
      startLocation: 'terraza',
      events: [
        ev({
          id: 'x',
          at: 'D1 12:00',
          location: 'lejos',
          traces: [
            { id: 'siempre', text: 'a' },
            { id: 'condicionado', text: 'b', requires: [{ kind: 'flag', flag: 'sabe' }] },
          ],
        }),
      ],
    })
    world.setFlag('sabe', false)
    const r = scheduler.advance(300)
    expect(r.traces.map((x) => x.id)).toEqual(['siempre'])
  })

  it('un evento con ventana sigue en curso si llegas tarde', () => {
    const { scheduler, clock } = buildWorld({
      startLocation: 'lejos',
      events: [
        ev({ id: 'conversacion', at: 'D1 11:00', until: 'D1 12:00', location: 'terraza' }),
      ],
    })
    scheduler.advance(parseTime('D1 11:30') - clock.now)
    expect(scheduler.ongoingAt('terraza').map((d) => d.id)).toEqual(['conversacion'])
    scheduler.advance(45)
    expect(scheduler.ongoingAt('terraza')).toHaveLength(0)
  })
})

describe('scheduler: precondiciones y cascadas', () => {
  it('descarta el evento si no se cumplen las condiciones', () => {
    const { scheduler, world } = buildWorld({
      events: [
        ev({ id: 'requiere', at: 'D1 11:00', requires: [{ kind: 'flag', flag: 'nunca' }] }),
      ],
    })
    const r = scheduler.advance(180)
    expect(r.skipped).toContain('requiere')
    expect(world.fired.has('requiere')).toBe(false)
    expect(world.cancelled.has('requiere')).toBe(true)
  })

  it('arrastra a los que dependian de un evento descartado', () => {
    const { scheduler, world } = buildWorld({
      events: [
        ev({ id: 'padre', at: 'D1 11:00', requires: [{ kind: 'flag', flag: 'nunca' }] }),
        ev({
          id: 'hijo',
          at: 'D1 12:00',
          requires: [{ kind: 'eventFired', event: 'padre' }],
        }),
        ev({
          id: 'nieto',
          at: 'D1 13:00',
          requires: [{ kind: 'eventFired', event: 'hijo' }],
        }),
      ],
    })
    scheduler.advance(300)
    expect(world.cancelled.has('padre')).toBe(true)
    expect(world.cancelled.has('hijo')).toBe(true)
    expect(world.cancelled.has('nieto')).toBe(true)
    expect(scheduler.pendingCount).toBe(0)
  })

  it('una condicion negada NO crea dependencia', () => {
    const { scheduler, world } = buildWorld({
      events: [
        ev({ id: 'padre', at: 'D1 11:00', requires: [{ kind: 'flag', flag: 'nunca' }] }),
        ev({
          id: 'alternativo',
          at: 'D1 12:00',
          requires: [{ kind: 'not', of: { kind: 'eventFired', event: 'padre' } }],
        }),
      ],
    })
    scheduler.advance(300)
    expect(world.cancelled.has('padre')).toBe(true)
    // El plan B tiene que sobrevivir: existe precisamente porque el otro fallo.
    expect(world.fired.has('alternativo')).toBe(true)
  })

  it('la cancelacion explicita tambien cascadea', () => {
    const { scheduler, world } = buildWorld({
      events: [
        ev({ id: 'disparador', at: 'D1 11:00', cancels: ['victima'] }),
        ev({ id: 'victima', at: 'D1 12:00' }),
        ev({
          id: 'dependiente',
          at: 'D1 13:00',
          requires: [{ kind: 'eventFired', event: 'victima' }],
        }),
      ],
    })
    scheduler.advance(300)
    expect(world.fired.has('disparador')).toBe(true)
    expect(world.cancelled.has('victima')).toBe(true)
    expect(world.cancelled.has('dependiente')).toBe(true)
  })

  it('cancelar un evento ya disparado no lo deshace', () => {
    const { scheduler, world } = buildWorld({
      events: [ev({ id: 'pasado', at: 'D1 10:00' })],
    })
    scheduler.advance(120)
    expect(world.fired.has('pasado')).toBe(true)
    scheduler.cancel('pasado')
    expect(world.cancelled.has('pasado')).toBe(false)
  })

  it('los efectos de un evento cancelan a otro de la misma ventana', () => {
    const { scheduler, world } = buildWorld({
      events: [
        ev({
          id: 'temprano',
          at: 'D1 11:00',
          effects: [{ kind: 'cancelEvent', event: 'tardio' }],
        }),
        ev({ id: 'tardio', at: 'D1 11:20' }),
      ],
    })
    // Un solo salto que abarca los dos: el segundo no debe llegar a ocurrir.
    scheduler.advance(180)
    expect(world.fired.has('temprano')).toBe(true)
    expect(world.fired.has('tardio')).toBe(false)
    expect(world.cancelled.has('tardio')).toBe(true)
  })

  it('reprograma y programa eventos', () => {
    const { scheduler, clock } = buildWorld({
      events: [ev({ id: 'movible', at: 'D1 11:00' })],
    })
    scheduler.reschedule('movible', 120)
    expect(scheduler.scheduledAt('movible')).toBe(parseTime('D1 13:00'))
    scheduler.schedule('movible', parseTime('D1 10:00'))
    expect(scheduler.scheduledAt('movible')).toBe(parseTime('D1 10:00'))
    scheduler.advance(parseTime('D1 14:00') - clock.now)
    expect(scheduler.pendingCount).toBe(0)
  })
})

describe('scheduler: efectos diferidos', () => {
  it('devuelve la Cordura y el dano para que los resuelva quien llama', () => {
    const { scheduler } = buildWorld({
      startLocation: 'viejo_templo',
      events: [
        ev({
          id: 'orejas',
          at: 'D1 12:30',
          location: 'viejo_templo',
          effects: [
            { kind: 'setFlag', flag: 'vio_las_orejas' },
            { kind: 'sanityLoss', loss: '0/1D3' },
          ],
        }),
      ],
    })
    const r = scheduler.advance(300)
    expect(r.deferred).toHaveLength(1)
    expect(r.deferred[0]).toMatchObject({ kind: 'sanityLoss', loss: '0/1D3' })
  })
})
