import { describe, it, expect } from 'vitest'
import { Rng } from '../src/engine/rng'
import {
  parseSanityLoss,
  sanityCheck,
  recoverSanity,
  startNewDay,
  tickMadness,
  madnessPenalty,
} from '../src/engine/sanity'
import { makeInvestigator } from './helpers'

describe('perdidas de Cordura del modulo', () => {
  it('interpreta la notacion con barra', () => {
    expect(parseSanityLoss('0/1D6')).toEqual({ onSuccess: '0', onFailure: '1D6' })
    expect(parseSanityLoss('1/1D4+1')).toEqual({ onSuccess: '1', onFailure: '1D4+1' })
    expect(parseSanityLoss('1D10/1D100')).toEqual({ onSuccess: '1D10', onFailure: '1D100' })
  })

  it('sin barra, la perdida es la misma pase lo que pase', () => {
    expect(parseSanityLoss('1D3')).toEqual({ onSuccess: '1D3', onFailure: '1D3' })
  })

  it('protesta ante una expresion imposible', () => {
    expect(() => parseSanityLoss('1/2/3')).toThrow()
  })
})

describe('tirada de Cordura', () => {
  it('nunca baja de cero ni sube por accidente', () => {
    const rng = new Rng('cordura')
    for (let i = 0; i < 300; i++) {
      const inv = makeInvestigator({ san: 12 })
      const res = sanityCheck(rng, inv, '1/1D6', 0)
      expect(inv.san).toBeGreaterThanOrEqual(0)
      expect(inv.san).toBeLessThanOrEqual(12)
      expect(res.sanAfter).toBe(inv.san)
    }
  })

  it('perder 0 con exito deja al investigador intacto', () => {
    const rng = new Rng('intacto')
    const inv = makeInvestigator({ san: 99 })
    let sawZero = false
    for (let i = 0; i < 50; i++) {
      const before = inv.san
      const res = sanityCheck(rng, inv, '0/1D3', 0)
      if (res.passed && res.loss === 0) {
        sawZero = true
        expect(inv.san).toBe(before)
      }
    }
    expect(sawZero).toBe(true)
  })

  it('acumula la perdida del dia', () => {
    const rng = new Rng('acumula')
    const inv = makeInvestigator({ san: 80 })
    sanityCheck(rng, inv, '1/1D6', 0)
    sanityCheck(rng, inv, '1/1D6', 30)
    expect(inv.sanLostToday).toBe(80 - inv.san)
  })

  it('una perdida de golpe de 5 o mas provoca crisis', () => {
    const rng = new Rng('crisis')
    let found = false
    for (let i = 0; i < 400 && !found; i++) {
      const inv = makeInvestigator({ san: 70 })
      const res = sanityCheck(rng, inv, '0/1D10', 0)
      if (res.loss >= 5) {
        found = true
        expect(res.bout).not.toBeNull()
        expect(inv.madness).not.toBeNull()
        expect(res.minutesLost).toBeGreaterThan(0)
      }
    }
    expect(found).toBe(true)
  })

  it('llegar a cero es locura permanente', () => {
    const rng = new Rng('permanente')
    const inv = makeInvestigator({ san: 2 })
    let res = sanityCheck(rng, inv, '2/1D6', 0)
    while (!res.permanent) res = sanityCheck(rng, inv, '2/1D6', 0)
    expect(inv.san).toBe(0)
    expect(inv.status).toBe('insane')
    expect(inv.madness?.kind).toBe('indefinite')
  })

  it('cruzar un quinto de la Cordura del dia da locura indefinida', () => {
    const rng = new Rng('indefinida')
    const inv = makeInvestigator({ san: 50 })
    // Umbral: 10 puntos en el mismo dia.
    let res = sanityCheck(rng, inv, '3/1D6', 0)
    let guard = 0
    while (!res.indefinite && !res.permanent && guard++ < 50) {
      res = sanityCheck(rng, inv, '3/1D6', 0)
    }
    if (res.indefinite) {
      expect(inv.sanLostToday).toBeGreaterThanOrEqual(10)
      expect(inv.madness?.kind).toBe('indefinite')
    }
    expect(guard).toBeLessThan(50)
  })

  it('la crisis cuesta tiempo, que es la moneda real del juego', () => {
    const rng = new Rng('tiempo')
    for (let i = 0; i < 200; i++) {
      const inv = makeInvestigator({ san: 70 })
      const res = sanityCheck(rng, inv, '0/1D10', 0)
      if (res.bout) {
        expect(res.bout.minutes).toBeGreaterThanOrEqual(6)
        expect(res.bout.minutes).toBeLessThanOrEqual(120)
      }
    }
  })

  it('las fobias y manias se anotan sin duplicarse', () => {
    const rng = new Rng('fobias')
    const inv = makeInvestigator({ san: 90 })
    for (let i = 0; i < 300; i++) sanityCheck(rng, inv, '0/1D6', i * 10)
    expect(new Set(inv.phobias).size).toBe(inv.phobias.length)
    expect(new Set(inv.manias).size).toBe(inv.manias.length)
  })

  it('siempre devuelve una narracion utilizable', () => {
    const rng = new Rng('narracion')
    for (let i = 0; i < 100; i++) {
      const inv = makeInvestigator({ san: 60 })
      const res = sanityCheck(rng, inv, '1/1D8', 0)
      expect(res.narration.length).toBeGreaterThan(10)
      expect(res.narration).toContain(inv.name)
    }
  })
})

describe('recuperacion y paso del tiempo', () => {
  it('recuperar Cordura respeta el tope', () => {
    const inv = makeInvestigator({ san: 40 })
    inv.sanMax = 45
    expect(recoverSanity(inv, 10)).toBe(5)
    expect(inv.san).toBe(45)
  })

  it('el cambio de dia reinicia el umbral', () => {
    const rng = new Rng('dia')
    const inv = makeInvestigator({ san: 60 })
    sanityCheck(rng, inv, '5/1D6', 0)
    expect(inv.sanLostToday).toBeGreaterThan(0)
    startNewDay(inv)
    expect(inv.sanLostToday).toBe(0)
    expect(inv.sanAtDayStart).toBe(inv.san)
  })

  it('la locura temporal remite al cumplirse el plazo', () => {
    const inv = makeInvestigator()
    inv.madness = {
      kind: 'temporary',
      effect: 'panico',
      description: 'huye',
      until: 100,
    }
    inv.status = 'insane'
    expect(tickMadness(inv, 50)).toBe(false)
    expect(tickMadness(inv, 100)).toBe(true)
    expect(inv.madness).toBeNull()
    expect(inv.status).toBe('ok')
  })

  it('la locura indefinida no remite sola', () => {
    const inv = makeInvestigator()
    inv.madness = {
      kind: 'indefinite',
      effect: 'fobia',
      description: 'x',
      until: 10,
    }
    expect(tickMadness(inv, 9999)).toBe(false)
    expect(inv.madness).not.toBeNull()
  })

  it('estar en crisis penaliza las tiradas', () => {
    const inv = makeInvestigator()
    expect(madnessPenalty(inv)).toBe(0)
    inv.madness = { kind: 'temporary', effect: 'x', description: 'x', until: 1 }
    expect(madnessPenalty(inv)).toBe(1)
    inv.madness = { kind: 'indefinite', effect: 'x', description: 'x', until: 1 }
    expect(madnessPenalty(inv)).toBe(2)
  })
})
