import { describe, it, expect } from 'vitest'
import { Rng, parseDice, rollDice } from '../src/engine/rng'
import {
  Outcome,
  classify,
  threshold,
  meets,
  roll,
  push,
  canPush,
  luckCost,
  spendLuck,
  opposed,
  groupRoll,
} from '../src/engine/rules'

describe('Rng', () => {
  it('es determinista para una misma semilla', () => {
    const a = new Rng('broma')
    const b = new Rng('broma')
    const seqA = Array.from({ length: 50 }, () => a.d100())
    const seqB = Array.from({ length: 50 }, () => b.d100())
    expect(seqA).toEqual(seqB)
  })

  it('semillas distintas dan secuencias distintas', () => {
    const a = new Rng('shepheard')
    const b = new Rng('shepheards')
    const seqA = Array.from({ length: 50 }, () => a.d100())
    const seqB = Array.from({ length: 50 }, () => b.d100())
    expect(seqA).not.toEqual(seqB)
  })

  it('restaura el estado guardado', () => {
    const r = new Rng(12345)
    for (let i = 0; i < 10; i++) r.d100()
    const state = r.save()
    const next = Array.from({ length: 10 }, () => r.d100())
    r.restore(state)
    expect(Array.from({ length: 10 }, () => r.d100())).toEqual(next)
  })

  it('d100 cubre 1..100 sin salirse', () => {
    const r = new Rng('cobertura')
    const seen = new Set<number>()
    for (let i = 0; i < 100000; i++) {
      const v = r.d100()
      expect(v).toBeGreaterThanOrEqual(1)
      expect(v).toBeLessThanOrEqual(100)
      seen.add(v)
    }
    expect(seen.size).toBe(100)
  })

  it('d100 esta razonablemente uniforme', () => {
    const r = new Rng('uniforme')
    const buckets = new Array(10).fill(0)
    const n = 100000
    for (let i = 0; i < n; i++) buckets[Math.floor((r.d100() - 1) / 10)]++
    // Cada decil deberia rondar el 10%. Margen amplio: buscamos sesgos gordos.
    for (const b of buckets) expect(b / n).toBeGreaterThan(0.085)
    for (const b of buckets) expect(b / n).toBeLessThan(0.115)
  })

  it('sample no repite elementos', () => {
    const r = new Rng('muestra')
    const src = [1, 2, 3, 4, 5, 6]
    for (let i = 0; i < 200; i++) {
      const s = r.sample(src, 4)
      expect(s.length).toBe(4)
      expect(new Set(s).size).toBe(4)
    }
  })

  it('sample nunca devuelve mas elementos de los que hay', () => {
    const r = new Rng('tope')
    expect(r.sample([1, 2, 3], 10).length).toBe(3)
  })
})

describe('notacion de dados del modulo', () => {
  it('interpreta las formas que aparecen en el libro', () => {
    expect(parseDice('1D6')).toEqual({ n: 1, sides: 6, mod: 0 })
    expect(parseDice('1D3-1')).toEqual({ n: 1, sides: 3, mod: -1 })
    expect(parseDice('2D10+4')).toEqual({ n: 2, sides: 10, mod: 4 })
    expect(parseDice('D8')).toEqual({ n: 1, sides: 8, mod: 0 })
    expect(parseDice('1D4 + 1')).toEqual({ n: 1, sides: 4, mod: 1 })
    expect(parseDice('3')).toEqual({ n: 0, sides: 0, mod: 3 })
  })

  it('respeta los limites al tirar', () => {
    const r = new Rng('dados')
    for (let i = 0; i < 2000; i++) {
      const v = rollDice(r, '1D3-1')
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(2)
    }
    for (let i = 0; i < 2000; i++) {
      const v = rollDice(r, '10D6+8')
      expect(v).toBeGreaterThanOrEqual(18)
      expect(v).toBeLessThanOrEqual(68)
    }
  })
})

describe('umbrales de dificultad', () => {
  it('calcula normal, dificil y extremo', () => {
    expect(threshold(75, 'regular')).toBe(75)
    expect(threshold(75, 'hard')).toBe(37)
    expect(threshold(75, 'extreme')).toBe(15)
    expect(threshold(60, 'hard')).toBe(30)
    expect(threshold(60, 'extreme')).toBe(12)
  })
})

describe('clasificacion de tiradas (7a edicion)', () => {
  it('01 siempre es critico, incluso sobre habilidad baja', () => {
    expect(classify(1, 5)).toBe(Outcome.Critical)
  })

  it('100 siempre es pifia, incluso sobre habilidad altisima', () => {
    expect(classify(100, 99)).toBe(Outcome.Fumble)
  })

  it('96-99 es pifia solo si la habilidad es menor de 50', () => {
    expect(classify(96, 49)).toBe(Outcome.Fumble)
    expect(classify(99, 49)).toBe(Outcome.Fumble)
    expect(classify(96, 50)).toBe(Outcome.Fail)
    expect(classify(99, 80)).toBe(Outcome.Fail)
  })

  it('reparte los niveles de exito segun el porcentaje', () => {
    // Habilidad 80: extremo <=16, dificil <=40, normal <=80.
    expect(classify(16, 80)).toBe(Outcome.Extreme)
    expect(classify(17, 80)).toBe(Outcome.Hard)
    expect(classify(40, 80)).toBe(Outcome.Hard)
    expect(classify(41, 80)).toBe(Outcome.Regular)
    expect(classify(80, 80)).toBe(Outcome.Regular)
    expect(classify(81, 80)).toBe(Outcome.Fail)
  })

  it('meets exige el nivel pedido', () => {
    expect(meets(Outcome.Regular, 'regular')).toBe(true)
    expect(meets(Outcome.Regular, 'hard')).toBe(false)
    expect(meets(Outcome.Hard, 'hard')).toBe(true)
    expect(meets(Outcome.Hard, 'extreme')).toBe(false)
    expect(meets(Outcome.Extreme, 'extreme')).toBe(true)
    expect(meets(Outcome.Critical, 'extreme')).toBe(true)
    expect(meets(Outcome.Fail, 'regular')).toBe(false)
    expect(meets(Outcome.Fumble, 'regular')).toBe(false)
  })
})

describe('dados de bonificacion y penalizacion', () => {
  it('la bonificacion mejora la tasa de exito y la penalizacion la empeora', () => {
    const n = 20000
    const rate = (bonus: number, penalty: number): number => {
      const r = new Rng('modificadores')
      let ok = 0
      for (let i = 0; i < n; i++) if (roll(r, 50, { bonus, penalty }).success) ok++
      return ok / n
    }
    const plain = rate(0, 0)
    const withBonus = rate(1, 0)
    const withPenalty = rate(0, 1)
    expect(plain).toBeGreaterThan(0.45)
    expect(plain).toBeLessThan(0.55)
    expect(withBonus).toBeGreaterThan(plain + 0.1)
    expect(withPenalty).toBeLessThan(plain - 0.1)
  })

  it('los dados extra comparten el dado de unidades', () => {
    const r = new Rng('unidades')
    for (let i = 0; i < 500; i++) {
      const res = roll(r, 50, { bonus: 2 })
      const units = res.candidates.map((c) => c % 10)
      // 100 aporta unidad 0, que es coherente con el resto.
      expect(new Set(units).size).toBe(1)
    }
  })

  it('bonificacion y penalizacion se cancelan', () => {
    const r = new Rng('cancelan')
    for (let i = 0; i < 200; i++) {
      expect(roll(r, 50, { bonus: 2, penalty: 2 }).candidates.length).toBe(1)
    }
  })

  it('la bonificacion escoge el candidato mas bajo y nunca se queda el 100', () => {
    const r = new Rng('minimo')
    for (let i = 0; i < 3000; i++) {
      const res = roll(r, 50, { bonus: 2 })
      expect(res.value).toBe(Math.min(...res.candidates))
      if (res.candidates.some((c) => c !== 100)) expect(res.value).not.toBe(100)
    }
  })

  it('la penalizacion escoge el candidato mas alto', () => {
    const r = new Rng('maximo')
    for (let i = 0; i < 3000; i++) {
      const res = roll(r, 50, { penalty: 2 })
      expect(res.value).toBe(Math.max(...res.candidates))
    }
  })

  it('00 mas 0 vale 100 y no cero', () => {
    const r = new Rng('cien')
    for (let i = 0; i < 20000; i++) {
      const res = roll(r, 50)
      expect(res.value).toBeGreaterThanOrEqual(1)
      expect(res.value).toBeLessThanOrEqual(100)
    }
  })
})

describe('empujar la tirada', () => {
  it('solo se puede empujar un fallo que no sea pifia, y una vez', () => {
    expect(canPush({ success: false, outcome: Outcome.Fail, pushed: false } as never)).toBe(true)
    expect(canPush({ success: false, outcome: Outcome.Fumble, pushed: false } as never)).toBe(false)
    expect(canPush({ success: true, outcome: Outcome.Regular, pushed: false } as never)).toBe(false)
    expect(canPush({ success: false, outcome: Outcome.Fail, pushed: true } as never)).toBe(false)
  })

  it('la tirada empujada conserva condiciones y queda marcada', () => {
    const r = new Rng('empujar')
    const first = roll(r, 40, { bonus: 1, difficulty: 'hard', label: 'Escuchar' })
    const second = push(r, first)
    expect(second.pushed).toBe(true)
    expect(second.target).toBe(40)
    expect(second.bonus).toBe(1)
    expect(second.difficulty).toBe('hard')
    expect(second.label).toBe('Escuchar')
  })
})

describe('gasto de Suerte', () => {
  it('cuesta la diferencia justa hasta el umbral', () => {
    const base = { target: 60, difficulty: 'regular' as const, outcome: Outcome.Fail, luckSpent: 0 }
    expect(luckCost({ ...base, value: 65 } as never)).toBe(5)
    expect(luckCost({ ...base, value: 61 } as never)).toBe(1)
  })

  it('no se puede comprar una pifia', () => {
    expect(
      luckCost({ target: 60, value: 100, outcome: Outcome.Fumble, difficulty: 'regular' } as never),
    ).toBeNull()
  })

  it('cuesta cero si ya se alcanzo el nivel', () => {
    expect(
      luckCost({ target: 60, value: 30, outcome: Outcome.Hard, difficulty: 'regular' } as never),
    ).toBe(0)
  })

  it('gastar Suerte convierte el fallo en exito', () => {
    const r = new Rng('suerte')
    let failed = roll(r, 60)
    while (failed.success || failed.outcome === Outcome.Fumble) failed = roll(r, 60)
    const cost = luckCost(failed)
    expect(cost).not.toBeNull()
    const fixed = spendLuck(failed, cost!)
    expect(fixed.success).toBe(true)
    expect(fixed.luckSpent).toBe(cost)
  })
})

describe('tiradas enfrentadas', () => {
  it('el que tiene mas habilidad gana la mayoria de las veces', () => {
    const r = new Rng('enfrentada')
    let wins = 0
    const n = 5000
    for (let i = 0; i < n; i++) if (opposed(r, 80, 25).attackerWins) wins++
    expect(wins / n).toBeGreaterThan(0.6)
  })

  it('el empate lo gana el defensor', () => {
    const res = opposed(new Rng('empate'), 50, 50)
    if (res.attacker.outcome === res.defender.outcome) expect(res.attackerWins).toBe(false)
  })
})

describe('tiradas de grupo', () => {
  it('cuenta exitos y detecta any y all', () => {
    const r = new Rng('grupo')
    const res = groupRoll(r, [
      { id: 'a', target: 99 },
      { id: 'b', target: 99 },
      { id: 'c', target: 99 },
    ])
    expect(res.rolls.length).toBe(3)
    expect(res.any).toBe(true)
    expect(res.successes).toBeGreaterThan(0)
  })

  it('con habilidad ridicula casi nadie pasa', () => {
    const r = new Rng('grupo-malo')
    const res = groupRoll(r, [
      { id: 'a', target: 1 },
      { id: 'b', target: 1 },
    ])
    expect(res.all).toBe(false)
  })

  it('protesta si no hay participantes', () => {
    expect(() => groupRoll(new Rng(1), [])).toThrow()
  })

  it('etiqueta cada tirada con el investigador', () => {
    const res = groupRoll(new Rng('etiquetas'), [
      { id: 'harker', target: 50 },
      { id: 'nadia', target: 50 },
    ])
    expect(res.rolls.map((x) => x.label)).toEqual(['harker', 'nadia'])
  })
})
