/**
 * Generador determinista. Toda la aleatoriedad del juego pasa por aquí para que
 * una partida sea reproducible a partir de su semilla: hace falta para los tests
 * de simulación en seco y para depurar una cascada concreta del scheduler.
 */
export class Rng {
  private s: number

  constructor(seed: number | string = Date.now()) {
    this.s = typeof seed === 'string' ? Rng.hash(seed) : seed >>> 0
  }

  static hash(str: string): number {
    let h = 2166136261 >>> 0
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
    return h >>> 0
  }

  /** mulberry32: rápido, buena distribución, estado de 32 bits serializable. */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0
    let t = this.s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** Entero en [min, max] ambos inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1))
  }

  /** Un dado de `sides` caras: 1..sides. */
  die(sides: number): number {
    return this.int(1, sides)
  }

  /** `n`d`sides`, sumados. */
  dice(n: number, sides: number): number {
    let total = 0
    for (let i = 0; i < n; i++) total += this.die(sides)
    return total
  }

  /** Tirada porcentual clásica: 1..100. */
  d100(): number {
    return this.int(1, 100)
  }

  /** Verdadero con probabilidad `pct` por ciento. */
  chance(pct: number): boolean {
    return this.d100() <= pct
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('Rng.pick sobre un array vacío')
    return arr[this.int(0, arr.length - 1)]!
  }

  /** Fisher-Yates sobre una copia. */
  shuffle<T>(arr: readonly T[]): T[] {
    const out = arr.slice()
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i)
      const tmp = out[i]!
      out[i] = out[j]!
      out[j] = tmp
    }
    return out
  }

  /** `n` elementos distintos al azar (o todos, si n >= longitud). */
  sample<T>(arr: readonly T[], n: number): T[] {
    return this.shuffle(arr).slice(0, Math.max(0, Math.min(n, arr.length)))
  }

  /** Estado serializable, para el guardado. */
  save(): number {
    return this.s
  }

  restore(state: number): void {
    this.s = state >>> 0
  }
}

/**
 * Notación de dados del módulo: "1D6", "0/1D3", "2D10+4", "1D3-1", "1D10/1D100".
 * `parseDice` acepta un solo término; las pérdidas de Cordura con barra se tratan
 * en sanity.ts.
 */
export function parseDice(expr: string): { n: number; sides: number; mod: number } {
  const m = /^\s*(\d*)\s*[dD]\s*(\d+)\s*([+-]\s*\d+)?\s*$/.exec(expr)
  if (!m) {
    const flat = /^\s*([+-]?\d+)\s*$/.exec(expr)
    if (flat) return { n: 0, sides: 0, mod: parseInt(flat[1]!, 10) }
    throw new Error(`Expresión de dados no reconocida: "${expr}"`)
  }
  return {
    n: m[1] ? parseInt(m[1], 10) : 1,
    sides: parseInt(m[2]!, 10),
    mod: m[3] ? parseInt(m[3].replace(/\s+/g, ''), 10) : 0,
  }
}

export function rollDice(rng: Rng, expr: string): number {
  const { n, sides, mod } = parseDice(expr)
  return (n > 0 ? rng.dice(n, sides) : 0) + mod
}
