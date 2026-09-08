/**
 * Reglas de La Llamada de Cthulhu 7a edicion, reducidas a lo que este juego usa.
 *
 * Criterio de diseno que atraviesa todo el modulo: FALLAR HACIA DELANTE. Una
 * tirada fallida casi nunca cierra una puerta; cambia el precio. Entras en la
 * habitacion, pero te han visto. Oyes la conversacion, pero solo dos frases.
 */
import { Rng } from './rng'

export enum Outcome {
  Fumble = 0,
  Fail = 1,
  Regular = 2,
  Hard = 3,
  Extreme = 4,
  Critical = 5,
}

export type Difficulty = 'regular' | 'hard' | 'extreme'

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  regular: 'normal',
  hard: 'difícil',
  extreme: 'extrema',
}

export const OUTCOME_LABEL: Record<Outcome, string> = {
  [Outcome.Fumble]: 'pifia',
  [Outcome.Fail]: 'fallo',
  [Outcome.Regular]: 'exito normal',
  [Outcome.Hard]: 'exito dificil',
  [Outcome.Extreme]: 'exito extremo',
  [Outcome.Critical]: 'exito critico',
}

export interface RollOptions {
  /** Dados de bonificacion (decenas extra, se queda el resultado mas bajo). */
  bonus?: number
  /** Dados de penalizacion (decenas extra, se queda el resultado mas alto). */
  penalty?: number
  /** Nivel minimo exigido para considerar superada la tirada. */
  difficulty?: Difficulty
  /** Etiqueta para el registro y la interfaz: "Escuchar", "DES", "Credito"... */
  label?: string
}

export interface RollResult {
  /** El d100 final tras aplicar dados de bonificacion o penalizacion. */
  value: number
  /** Resultados candidatos, en orden de tirada. El primero es el base. */
  candidates: number[]
  target: number
  outcome: Outcome
  difficulty: Difficulty
  /** Alcanza el nivel exigido por `difficulty`? */
  success: boolean
  label: string
  bonus: number
  penalty: number
  /** Verdadero si es el segundo intento tras empujar la tirada. */
  pushed: boolean
  /** Puntos de Suerte gastados para rebajar el resultado. */
  luckSpent: number
}

/** Umbral numerico de cada nivel de dificultad para una habilidad dada. */
export function threshold(target: number, difficulty: Difficulty): number {
  switch (difficulty) {
    case 'extreme':
      return Math.floor(target / 5)
    case 'hard':
      return Math.floor(target / 2)
    default:
      return target
  }
}

/**
 * Clasifica un d100 contra una habilidad. Reglas de 7a:
 *  - 01 es critico.
 *  - Pifia con 100 siempre; tambien con 96-99 si la habilidad es menor de 50.
 *  - Extremo <= hab/5, dificil <= hab/2, normal <= hab.
 */
export function classify(value: number, target: number): Outcome {
  if (value === 1) return Outcome.Critical
  if (value === 100) return Outcome.Fumble
  if (value >= 96 && target < 50) return Outcome.Fumble
  if (value <= threshold(target, 'extreme')) return Outcome.Extreme
  if (value <= threshold(target, 'hard')) return Outcome.Hard
  if (value <= target) return Outcome.Regular
  return Outcome.Fail
}

/** El resultado alcanza el nivel exigido? */
export function meets(outcome: Outcome, difficulty: Difficulty): boolean {
  if (outcome <= Outcome.Fail) return false
  if (outcome === Outcome.Critical) return true
  switch (difficulty) {
    case 'extreme':
      return outcome >= Outcome.Extreme
    case 'hard':
      return outcome >= Outcome.Hard
    default:
      return outcome >= Outcome.Regular
  }
}

/**
 * Tirada porcentual con dados de bonificacion y penalizacion.
 *
 * Mecanica de 7a: se tira un dado de unidades (0-9) y una o varias decenas
 * (00, 10, ..., 90). El resultado es decenas + unidades, salvo 00+0 que es 100.
 * Cada dado extra da un candidato mas; con bonificacion se elige el resultado
 * mas bajo y con penalizacion el mas alto. La comparacion va sobre el RESULTADO
 * final, no sobre la decena en bruto: por eso 00+0 = 100 es el peor candidato
 * posible y nunca gana con un dado de bonificacion.
 */
export function roll(rng: Rng, target: number, opts: RollOptions = {}): RollResult {
  const bonus = Math.max(0, opts.bonus ?? 0)
  const penalty = Math.max(0, opts.penalty ?? 0)
  const difficulty = opts.difficulty ?? 'regular'

  // Bonificacion y penalizacion se cancelan entre si antes de tirar.
  const net = bonus - penalty
  const extra = Math.abs(net)

  const units = rng.int(0, 9)
  const combine = (tens: number): number => {
    const v = tens * 10 + units
    return v === 0 ? 100 : v
  }

  const candidates: number[] = [combine(rng.int(0, 9))]
  for (let i = 0; i < extra; i++) candidates.push(combine(rng.int(0, 9)))

  let value = candidates[0]!
  if (net > 0) value = Math.min(...candidates)
  else if (net < 0) value = Math.max(...candidates)

  const outcome = classify(value, target)
  return {
    value,
    candidates,
    target,
    outcome,
    difficulty,
    success: meets(outcome, difficulty),
    label: opts.label ?? '',
    bonus,
    penalty,
    pushed: false,
    luckSpent: 0,
  }
}

/**
 * Empujar la tirada: se repite con las mismas condiciones. Si vuelve a fallar,
 * la consecuencia debe ser grave. El motor solo marca `pushed`; el coste lo
 * define el contenido del evento.
 */
export function push(rng: Rng, previous: RollResult): RollResult {
  const r = roll(rng, previous.target, {
    bonus: previous.bonus,
    penalty: previous.penalty,
    difficulty: previous.difficulty,
    label: previous.label,
  })
  r.pushed = true
  return r
}

/** Solo se puede empujar una tirada fallada que no sea pifia, y una unica vez. */
export function canPush(r: RollResult): boolean {
  return !r.success && r.outcome !== Outcome.Fumble && !r.pushed
}

/**
 * Coste en puntos de Suerte para llevar una tirada fallada hasta `difficulty`.
 * Devuelve null si es imposible: una pifia no se compra, y la Suerte no altera
 * tiradas de Suerte ni de dano.
 */
export function luckCost(
  r: RollResult,
  difficulty: Difficulty = r.difficulty,
): number | null {
  if (r.outcome === Outcome.Fumble) return null
  if (meets(r.outcome, difficulty)) return 0
  const need = threshold(r.target, difficulty)
  if (need < 1) return null
  const cost = r.value - need
  return cost > 0 ? cost : null
}

/** Aplica el gasto de Suerte y devuelve la tirada rebajada. */
export function spendLuck(r: RollResult, points: number): RollResult {
  const value = Math.max(1, r.value - points)
  const outcome = classify(value, r.target)
  return {
    ...r,
    value,
    outcome,
    success: meets(outcome, r.difficulty),
    luckSpent: r.luckSpent + points,
  }
}

export interface OpposedResult {
  attacker: RollResult
  defender: RollResult
  /** Verdadero si gana quien tira primero, es decir, quien actua. */
  attackerWins: boolean
}

/**
 * Tirada enfrentada: gana el nivel de exito mas alto. En empate gana el
 * defensor, que es lo que el modulo quiere para el sigilo: la casa gana los
 * empates y colarte tiene que costar.
 */
export function opposed(
  rng: Rng,
  attackerTarget: number,
  defenderTarget: number,
  opts: { attacker?: RollOptions; defender?: RollOptions } = {},
): OpposedResult {
  const attacker = roll(rng, attackerTarget, opts.attacker)
  const defender = roll(rng, defenderTarget, opts.defender)
  return {
    attacker,
    defender,
    attackerWins: attacker.outcome > defender.outcome,
  }
}

/**
 * Tirada de caracteristica. En 7a se tira contra la caracteristica directamente:
 * DES para no resbalar en las escaleras del sotano, POD para resistir la vision.
 */
export function characteristicRoll(
  rng: Rng,
  value: number,
  opts: RollOptions = {},
): RollResult {
  return roll(rng, value, opts)
}

export interface GroupMember {
  id: string
  target: number
  opts?: RollOptions
}

export interface GroupRollResult {
  rolls: RollResult[]
  successes: number
  /** Verdadero si al menos uno lo logra. */
  any: boolean
  /** Verdadero si todos lo logran: algunas escenas exigen que nadie falle. */
  all: boolean
  best: RollResult
}

/**
 * Tirada de grupo. El modulo la usa una y otra vez: "cada investigador hace una
 * tirada de Credito y cada exito disminuye la furia de Carter un 10%", o la
 * entrada a la mascarada, donde basta con que uno falle para que se vaya todo
 * al traste.
 */
export function groupRoll(
  rng: Rng,
  members: GroupMember[],
  difficulty: Difficulty = 'regular',
): GroupRollResult {
  if (members.length === 0) throw new Error('groupRoll sin participantes')
  const rolls = members.map((m) =>
    roll(rng, m.target, { ...m.opts, difficulty, label: m.opts?.label ?? m.id }),
  )
  const successes = rolls.filter((r) => r.success).length
  let best = rolls[0]!
  for (const r of rolls) if (r.outcome > best.outcome) best = r
  return {
    rolls,
    successes,
    any: successes > 0,
    all: successes === rolls.length,
    best,
  }
}
