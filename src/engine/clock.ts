/**
 * El reloj del mundo.
 *
 * El modulo esta escrito como una tabla horaria en bloques de media hora, y esa
 * es tambien la unidad de este motor: una SECUENCIA. Cada accion del jugador
 * consume minutos, el mundo avanza con el, y lo que no se ve no se recupera.
 *
 * El tiempo se mide en minutos absolutos desde las 00:00 del 21 de noviembre de
 * 1922. El dia 1 son los minutos 0..1439, el dia 2 los 1440..2879, y la partida
 * termina de madrugada del dia 3.
 */

export const MINUTES_PER_DAY = 1440
export const SEQUENCE_MINUTES = 30

/** Los investigadores llegan al Shepheard's a las 9:00 del dia 21. */
export const GAME_START = 9 * 60
/** Weder llega al museo a las 3:00 de la madrugada del 23. */
export const GAME_END = 2 * MINUTES_PER_DAY + 3 * 60

/** Construye un minuto absoluto a partir de dia (1..3) y hora. */
export function t(day: number, hour: number, minute = 0): number {
  return (day - 1) * MINUTES_PER_DAY + hour * 60 + minute
}

/**
 * Interpreta las horas tal como las escribe el contenido: "D1 12:30", "D2 21:00",
 * "D3 03:00". Tambien acepta "12:30" y asume dia 1.
 */
export function parseTime(expr: string): number {
  const m = /^\s*(?:[Dd](\d)\s+)?(\d{1,2}):(\d{2})\s*$/.exec(expr)
  if (!m) throw new Error(`Hora no reconocida: "${expr}"`)
  const day = m[1] ? parseInt(m[1], 10) : 1
  const hour = parseInt(m[2]!, 10)
  const minute = parseInt(m[3]!, 10)
  if (hour > 23 || minute > 59) throw new Error(`Hora fuera de rango: "${expr}"`)
  return t(day, hour, minute)
}

export function dayOf(minute: number): number {
  return Math.floor(minute / MINUTES_PER_DAY) + 1
}

export function hourOf(minute: number): number {
  return Math.floor((minute % MINUTES_PER_DAY) / 60)
}

export function minuteOf(minute: number): number {
  return minute % 60
}

/** "12:30" */
export function formatClock(minute: number): string {
  const h = hourOf(minute).toString().padStart(2, '0')
  const m = minuteOf(minute).toString().padStart(2, '0')
  return `${h}:${m}`
}

const DATE_LABEL: Record<number, string> = {
  1: '21 de noviembre',
  2: '22 de noviembre',
  3: '23 de noviembre',
}

/** "Martes 21 de noviembre, 12:30" para el marcador de pantalla. */
export function formatFull(minute: number): string {
  const day = dayOf(minute)
  return `${DATE_LABEL[day] ?? `dia ${day}`}, ${formatClock(minute)}`
}

/** Momento del dia, para elegir la iluminacion de la lamina. */
export type TimeOfDay = 'madrugada' | 'manana' | 'tarde' | 'noche'

export function timeOfDay(minute: number): TimeOfDay {
  const h = hourOf(minute)
  if (h < 6) return 'madrugada'
  if (h < 14) return 'manana'
  if (h < 20) return 'tarde'
  return 'noche'
}

export interface TickInfo {
  from: number
  to: number
  /** Limites de secuencia cruzados, en minutos absolutos. */
  sequencesCrossed: number[]
  /** Verdadero si el avance ha cruzado la medianoche hacia un dia nuevo. */
  newDay: boolean
}

export type TickListener = (info: TickInfo) => void

export class Clock {
  private minute: number
  private listeners: TickListener[] = []

  constructor(start: number = GAME_START) {
    this.minute = start
  }

  get now(): number {
    return this.minute
  }

  get day(): number {
    return dayOf(this.minute)
  }

  /** Indice de secuencia absoluto: util para depurar agendas. */
  get sequence(): number {
    return Math.floor(this.minute / SEQUENCE_MINUTES)
  }

  /** Minutos que faltan para cerrar la secuencia actual. */
  get minutesToNextSequence(): number {
    const next = (Math.floor(this.minute / SEQUENCE_MINUTES) + 1) * SEQUENCE_MINUTES
    return next - this.minute
  }

  get finished(): boolean {
    return this.minute >= GAME_END
  }

  onTick(fn: TickListener): () => void {
    this.listeners.push(fn)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn)
    }
  }

  /**
   * Avanza el reloj y avisa a quien escuche. Devuelve el detalle del salto para
   * que el scheduler sepa que limites de secuencia se han cruzado: los eventos
   * se anclan a esos limites.
   */
  advance(minutes: number): TickInfo {
    if (minutes < 0) throw new Error('El reloj no va hacia atras')
    const from = this.minute
    const to = from + minutes
    this.minute = to

    const sequencesCrossed: number[] = []
    const first = (Math.floor(from / SEQUENCE_MINUTES) + 1) * SEQUENCE_MINUTES
    for (let s = first; s <= to; s += SEQUENCE_MINUTES) sequencesCrossed.push(s)

    const info: TickInfo = {
      from,
      to,
      sequencesCrossed,
      newDay: dayOf(to) > dayOf(from),
    }
    for (const l of this.listeners) l(info)
    return info
  }

  /** Salta hasta un minuto absoluto concreto. */
  advanceTo(minute: number): TickInfo {
    return this.advance(Math.max(0, minute - this.minute))
  }

  /** Avanza hasta cerrar la secuencia de media hora en curso. */
  advanceToNextSequence(): TickInfo {
    return this.advance(this.minutesToNextSequence)
  }

  save(): number {
    return this.minute
  }

  restore(minute: number): void {
    this.minute = minute
  }

  toString(): string {
    return formatFull(this.minute)
  }
}

/** Costes de tiempo por tipo de accion, en minutos. */
export const ACTION_COST = {
  /** Mirar algo con calma. */
  examine: 5,
  /** Una conversacion normal. */
  talk: 10,
  /** Sonsacar, negociar, interrogar. */
  press: 15,
  /** Registrar una habitacion a fondo. */
  search: 20,
  /** Seguir a alguien sin ser visto. */
  tail: 10,
  /** Espiar una conversacion entera. */
  eavesdrop: 15,
  /** Una secuencia completa: vigilar, esperar, hacer guardia. */
  sequence: 30,
} as const
