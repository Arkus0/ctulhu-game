/**
 * Cordura y locura.
 *
 * Decision de diseno propia de este juego: una crisis de locura CUESTA TIEMPO.
 * En una partida cuyo recurso real es el reloj, desmayarse en el Viejo Templo y
 * perder cuarenta minutos duele mucho mas que perder unos puntos en una ficha.
 * Es tambien el castigo tematicamente correcto: el horror te roba la tarde.
 */
import { Rng, rollDice } from './rng'
import { Outcome, classify, roll } from './rules'
import type { Investigator } from './types'

export type MadnessKind = 'temporary' | 'indefinite'

export interface SanityResult {
  /** Tirada de Cordura contra la Cordura actual. */
  rollValue: number
  target: number
  passed: boolean
  loss: number
  sanBefore: number
  sanAfter: number
  /** Verdadero si la perdida de golpe llega a 5 y provoca crisis. */
  bout: MadnessBoutResult | null
  /** Verdadero si ha cruzado el umbral del 20% del dia. */
  indefinite: boolean
  /** Verdadero si se ha quedado a cero: locura permanente. */
  permanent: boolean
  /** Minutos que la crisis le roba al grupo. */
  minutesLost: number
  /** Texto listo para la caja de dialogo. */
  narration: string
}

export interface MadnessBoutResult {
  kind: MadnessKind
  effect: string
  description: string
  minutes: number
  /** Fobia o mania adquirida, si toca. */
  acquired?: { type: 'fobia' | 'mania'; name: string }
  /** Verdadero si ademas comprende lo que ha visto (tirada de INT superada). */
  realised: boolean
}

/** Pierde X con exito, YDZ con fallo. Ambos lados admiten dados: "1D10/1D100". */
export function parseSanityLoss(expr: string): { onSuccess: string; onFailure: string } {
  const parts = expr.split('/')
  if (parts.length === 1) return { onSuccess: parts[0]!.trim(), onFailure: parts[0]!.trim() }
  if (parts.length !== 2) throw new Error(`Perdida de Cordura no reconocida: "${expr}"`)
  return { onSuccess: parts[0]!.trim(), onFailure: parts[1]!.trim() }
}

/** Tabla de crisis de locura, 1D10. */
const BOUTS: { effect: string; description: string }[] = [
  {
    effect: 'amnesia',
    description:
      'Vuelve en si sin recordar nada de lo ocurrido. La ultima media hora es un agujero limpio.',
  },
  {
    effect: 'discapacidad',
    description:
      'El cuerpo se niega. Ceguera, sordera o una pierna que sencillamente no responde, sin causa fisica alguna.',
  },
  {
    effect: 'violencia',
    description: 'Arremete contra lo primero que se mueve, sea un monstruo o un camarero.',
  },
  {
    effect: 'fuga',
    description:
      'Echa a correr sin rumbo por los pasillos del Shepheard’s y aparece muy lejos de donde estaba.',
  },
  { effect: 'fobia', description: 'Algo perfectamente cotidiano se vuelve insoportable.' },
  { effect: 'mania', description: 'Una idea fija se apodera de su conducta.' },
  {
    effect: 'alucinacion',
    description:
      'Ve cosas que no estan ahi, y son mas convincentes que las que si estan. Nadie mas las ve.',
  },
  {
    effect: 'panico',
    description: 'Panico ciego. Huye del lugar sin escuchar a nadie, tirando sillas a su paso.',
  },
  {
    effect: 'histeria',
    description: 'Rompe a reir, o a llorar, o a gritar, y no hay forma de detenerlo.',
  },
  { effect: 'desmayo', description: 'Se desploma. Sin mas.' },
]

const FOBIAS = [
  'a la oscuridad',
  'a los espacios cerrados',
  'a las ratas',
  'a los insectos',
  'a los muertos',
  'a la sangre',
  'a las alturas',
  'a las multitudes',
  'a los gatos',
  'a las escaleras',
  'a los espejos',
  'a los hombres de negro',
]

const MANIAS = [
  'de limpieza compulsiva',
  'de acumular objetos',
  'de contar en voz alta',
  'de hablar sin parar',
  'de robar cosas pequenas',
  'de tomar notas de todo',
  'de mentir por deporte',
  'de rezar a media voz',
]

/**
 * Tirada de Cordura completa. Muta al investigador y devuelve el parte de danos.
 */
export function sanityCheck(
  rng: Rng,
  inv: Investigator,
  lossExpr: string,
  now: number,
  opts: { bonus?: number; penalty?: number } = {},
): SanityResult {
  const { onSuccess, onFailure } = parseSanityLoss(lossExpr)
  const sanBefore = inv.san

  const r = roll(rng, inv.san, { ...opts, label: 'Cordura' })
  const passed = r.success

  // Un 01 minimiza el dano; una pifia lo maximiza, que es lo que espera la mesa.
  let loss: number
  if (r.outcome === Outcome.Critical) loss = rollDice(rng, onSuccess)
  else if (r.outcome === Outcome.Fumble) loss = maxOf(onFailure)
  else loss = rollDice(rng, passed ? onSuccess : onFailure)

  loss = Math.max(0, loss)
  inv.san = Math.max(0, inv.san - loss)
  inv.sanLostToday += loss

  const permanent = inv.san === 0
  // Umbral de locura indefinida: una quinta parte de la Cordura con la que
  // empezo el dia, acumulada a lo largo de ese dia.
  const indefiniteThreshold = Math.floor(inv.sanAtDayStart / 5)
  const indefinite =
    !permanent && inv.sanLostToday >= indefiniteThreshold && indefiniteThreshold > 0

  let bout: MadnessBoutResult | null = null
  if (permanent) {
    inv.status = 'insane'
    inv.madness = {
      kind: 'indefinite',
      effect: 'permanente',
      description: 'La razon se ha ido del todo, y no va a volver.',
      until: Number.POSITIVE_INFINITY,
    }
  } else if (loss >= 5 || indefinite) {
    bout = rollBout(rng, inv, now, indefinite ? 'indefinite' : 'temporary')
    inv.madness = {
      kind: bout.kind,
      effect: bout.effect,
      description: bout.description,
      until: now + bout.minutes,
    }
    if (bout.kind === 'indefinite') inv.status = 'insane'
  }

  return {
    rollValue: r.value,
    target: r.target,
    passed,
    loss,
    sanBefore,
    sanAfter: inv.san,
    bout,
    indefinite,
    permanent,
    minutesLost: bout?.minutes ?? 0,
    narration: narrate(inv, loss, passed, bout, permanent),
  }
}

function rollBout(
  rng: Rng,
  inv: Investigator,
  _now: number,
  kind: MadnessKind,
): MadnessBoutResult {
  const entry = BOUTS[rng.int(0, BOUTS.length - 1)]!

  // La crisis roba tiempo: de 6 a 60 minutos para una temporal, y el doble si es
  // indefinida. En un juego de reloj, eso es la verdadera herida.
  const base = rng.die(10) * 6
  const minutes = kind === 'indefinite' ? base * 2 : base

  let acquired: MadnessBoutResult['acquired']
  if (entry.effect === 'fobia') {
    const name = rng.pick(FOBIAS)
    if (!inv.phobias.includes(name)) inv.phobias.push(name)
    acquired = { type: 'fobia', name }
  } else if (entry.effect === 'mania') {
    const name = rng.pick(MANIAS)
    if (!inv.manias.includes(name)) inv.manias.push(name)
    acquired = { type: 'mania', name }
  }

  // Tirada de INT: superarla significa comprender lo que se acaba de ver, que en
  // esta ambientacion es peor que no entenderlo.
  const realised = classify(rng.d100(), inv.chars.INT) >= Outcome.Regular

  return {
    kind,
    effect: entry.effect,
    description: entry.description,
    minutes,
    ...(acquired ? { acquired } : {}),
    realised,
  }
}

function narrate(
  inv: Investigator,
  loss: number,
  passed: boolean,
  bout: MadnessBoutResult | null,
  permanent: boolean,
): string {
  if (loss === 0) return `${inv.name} encaja la escena sin inmutarse.`
  const head = passed
    ? `${inv.name} aguanta la mirada, pero algo se le queda dentro (-${loss} Cordura).`
    : `${inv.name} no puede con ello (-${loss} Cordura).`
  if (permanent) {
    return `${head} No queda nada que salvar: ${inv.name} se ha perdido para siempre.`
  }
  if (!bout) return head
  const extra =
    bout.acquired != null
      ? ` Le queda un miedo nuevo: ${bout.acquired.type} ${bout.acquired.name}.`
      : ''
  const realised = bout.realised
    ? ' Y lo peor es que ha entendido perfectamente lo que estaba viendo.'
    : ''
  return `${head} ${bout.description}${extra}${realised}`
}

/** Valor maximo posible de una expresion de dados, para las pifias. */
function maxOf(expr: string): number {
  const m = /^\s*(\d*)\s*[dD]\s*(\d+)\s*([+-]\s*\d+)?\s*$/.exec(expr)
  if (!m) {
    const flat = /^\s*([+-]?\d+)\s*$/.exec(expr)
    return flat ? parseInt(flat[1]!, 10) : 0
  }
  const n = m[1] ? parseInt(m[1], 10) : 1
  const sides = parseInt(m[2]!, 10)
  const mod = m[3] ? parseInt(m[3].replace(/\s+/g, ''), 10) : 0
  return n * sides + mod
}

/** Recuperar Cordura, con el tope de 99 menos Mitos de Cthulhu. */
export function recoverSanity(inv: Investigator, amount: number): number {
  const before = inv.san
  inv.san = Math.min(inv.sanMax, inv.san + amount)
  return inv.san - before
}

/** Al cambiar de dia se reinicia el contador del umbral de locura indefinida. */
export function startNewDay(inv: Investigator): void {
  inv.sanAtDayStart = inv.san
  inv.sanLostToday = 0
}

/** Comprueba si una crisis temporal ya ha remitido. */
export function tickMadness(inv: Investigator, now: number): boolean {
  if (!inv.madness) return false
  if (inv.madness.kind === 'indefinite') return false
  if (now >= inv.madness.until) {
    inv.madness = null
    if (inv.status === 'insane') inv.status = 'ok'
    return true
  }
  return false
}

/**
 * Una crisis en curso penaliza. Un investigador enloquecido no rinde, y el
 * scheduler lo tiene en cuenta al resolver sus acciones.
 */
export function madnessPenalty(inv: Investigator): number {
  if (!inv.madness) return 0
  return inv.madness.kind === 'indefinite' ? 2 : 1
}
