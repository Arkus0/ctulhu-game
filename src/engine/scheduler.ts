/**
 * El scheduler: la maquinaria de relojeria del Shepheard's.
 *
 * El modulo esta escrito como una agenda. Los PNJ se mueven cada media hora
 * hagan lo que hagan los investigadores, y el autor insiste: "Si son las 19:00,
 * son las 19:00, y Shakti se ha ido". Este fichero es esa agenda.
 *
 * Tres reglas de oro:
 *
 * 1. EL SCHEDULER MANDA. El jugador no improvisa contra el mundo: solo puede
 *    cancelar, retrasar o redirigir eventos a traves de los ganchos que cada
 *    evento declara. Eso sustituye al Guardian improvisando en la mesa, y evita
 *    que el sistema tenga que resolver intenciones arbitrarias.
 *
 * 2. LO QUE NO SE VE, PASA IGUAL. Un evento sin testigos ocurre y deja RASTRO:
 *    un PNJ que lo cotillea, sangre en una alfombra, una habitacion revuelta.
 *    Es la instruccion literal del libro de "suministrar esa informacion perdida
 *    a traves de otros personajes no jugadores".
 *
 * 3. LAS CASCADAS SON EXPLICITAS. Si el jugador impide que Evelyn baje al
 *    sotano, no solo se cae que la devoren: se caen la resurreccion y su entrada
 *    como zombi en el salon, y el sacrificio de Shakti tiene que MUTAR, porque
 *    el brujo sigue necesitando una victima viva y los investigadores estan muy
 *    a mano. Esas ramas se declaran, no se adivinan.
 */
import { Clock, parseTime } from './clock'
import type { Party } from './party'
import type { Rng } from './rng'
import type { WorldState } from './worldstate'
import type {
  Condition,
  Effect,
  EventId,
  LocationId,
  NpcId,
  SceneId,
} from './types'

/** Rastro que deja un evento que el grupo no presencio. */
export interface TraceDef {
  id: string
  /** Donde queda el rastro. Por defecto, la localizacion del evento. */
  location?: LocationId
  /** PNJ que lo puede contar, si el rastro es un chisme. */
  teller?: NpcId
  text: string
  /** Momento a partir del cual el rastro es descubrible. */
  requires?: Condition[]
}

export interface EventDef {
  id: EventId
  /** Hora de inicio: "D1 12:00". */
  at: string
  /** Fin de la ventana, si el evento dura: "D1 13:00". */
  until?: string
  location: LocationId
  /** PNJ implicados. El scheduler los mueve alli al dispararse. */
  actors?: NpcId[]
  /** Si no se cumplen, el evento no ocurre y queda descartado. */
  requires?: Condition[]
  /** Se aplican al dispararse, se vea o no. */
  effects?: Effect[]
  /** Cancelacion explicita de otros eventos. */
  cancels?: EventId[]
  /** Texto si el grupo esta delante. */
  witnessText?: string
  /**
   * Lamina propia mientras el evento esta en curso en esta localizacion. Sirve
   * para los sucesos que se presencian pero no abren escena interactiva: la
   * llegada de los Lounpeen, Weder cruzando la cocina, las orejas. Sin esto,
   * un suceso solo puede cambiar el texto, nunca lo que se ve.
   */
  art?: string
  /** Escena con lamina y opciones, si la hay. */
  scene?: SceneId
  /** Que queda si el grupo no estaba. */
  traces?: TraceDef[]
  /** Acciones del jugador capaces de alterar este evento. */
  interruptibleBy?: string[]
  /** Desempate cuando varios caen en el mismo minuto. Mayor va antes. */
  priority?: number
  /** Etiquetas para depurar y filtrar: "custodia", "sotano", "fiesta". */
  tags?: string[]
  /** Notas del disenador, con la pagina del libro. */
  note?: string
}

/** Un evento ya disparado, listo para presentarse. */
export interface FiredEvent {
  def: EventDef
  minute: number
  witnessed: boolean
  /** Investigadores presentes en el momento. */
  witnesses: string[]
}

export interface TickReport {
  from: number
  to: number
  /** Eventos que el grupo ha presenciado: hay que renderizarlos. */
  witnessed: FiredEvent[]
  /** Eventos ocurridos lejos del grupo. */
  offscreen: FiredEvent[]
  /** Eventos descartados por no cumplir precondiciones. */
  skipped: EventId[]
  /** Rastros nuevos disponibles en el mundo. */
  traces: TraceDef[]
  /** Cordura y dano pendientes de resolver por quien llama. */
  deferred: Effect[]
}

interface Entry {
  def: EventDef
  minute: number
  endMinute: number | null
}

export interface SchedulerSnapshot {
  pending: { id: EventId; minute: number; endMinute: number | null }[]
  ongoing: { id: EventId; minute: number; endMinute: number | null }[]
}

export class Scheduler {
  /** Eventos pendientes, ordenados por minuto. */
  private pending: Entry[] = []
  /** Eventos en curso: el jugador puede llegar a mitad de escena. */
  private ongoing = new Map<EventId, Entry>()
  private byId = new Map<EventId, EventDef>()

  constructor(
    private readonly clock: Clock,
    private readonly world: WorldState,
    private readonly party: Party,
    private readonly rng: Rng,
  ) {}

  /** Carga la agenda. Se puede llamar varias veces para anadir dias. */
  load(defs: EventDef[]): void {
    for (const def of defs) {
      if (this.byId.has(def.id)) throw new Error(`Evento duplicado: "${def.id}"`)
      this.byId.set(def.id, def)
      this.pending.push({
        def,
        minute: parseTime(def.at),
        endMinute: def.until ? parseTime(def.until) : null,
      })
    }
    this.sort()
  }

  private sort(): void {
    this.pending.sort(
      (a, b) => a.minute - b.minute || (b.def.priority ?? 0) - (a.def.priority ?? 0),
    )
  }

  get pendingCount(): number {
    return this.pending.length
  }

  definition(id: EventId): EventDef | undefined {
    return this.byId.get(id)
  }

  /** Minuto en el que esta programado un evento pendiente, si sigue en cola. */
  scheduledAt(id: EventId): number | null {
    return this.pending.find((e) => e.def.id === id)?.minute ?? null
  }

  isPending(id: EventId): boolean {
    return this.pending.some((e) => e.def.id === id)
  }

  /** Eventos en curso ahora mismo en una localizacion. */
  ongoingAt(location: LocationId): EventDef[] {
    return [...this.ongoing.values()]
      .filter((e) => e.def.location === location)
      .map((e) => e.def)
  }

  /**
   * Eventos en curso aqui que el grupo aun no habia visto, y que a partir de
   * ahora si.
   *
   * Sin esto, llegar a una escena que ya ha empezado no contaria como haberla
   * presenciado, y el modulo quiere justo lo contrario: entrar por la puerta a
   * mitad de conversacion es la forma normal de enterarse de las cosas en este
   * hotel. Lo llama el juego cada vez que el grupo cambia de sitio.
   */
  witnessOngoingAt(location: LocationId): EventDef[] {
    const nuevos: EventDef[] = []
    for (const entry of this.ongoing.values()) {
      if (entry.def.location !== location) continue
      if (this.world.witnessed.has(entry.def.id)) continue
      this.world.witnessed.add(entry.def.id)
      nuevos.push(entry.def)
    }
    return nuevos
  }

  /* ---------------------------------------------------------------- *
   * Manipulacion de la agenda
   * ---------------------------------------------------------------- */

  /**
   * Cancela un evento y arrastra su cascada. Los eventos que dependen de este
   * via `requires: [{kind:'eventFired'}]` caeran solos cuando les toque, pero
   * los cancelamos ya para que no queden colgando en la cola: asi el conteo de
   * "lo que te perdiste" es honesto.
   */
  cancel(id: EventId, reason = ''): EventId[] {
    const cancelled: EventId[] = []
    const queue: EventId[] = [id]

    while (queue.length > 0) {
      const current = queue.shift()!
      if (this.world.cancelled.has(current)) continue

      const idx = this.pending.findIndex((e) => e.def.id === current)
      const wasPending = idx >= 0
      if (wasPending) this.pending.splice(idx, 1)
      this.ongoing.delete(current)

      // Solo se cancela lo que aun no ha pasado.
      if (!this.world.fired.has(current)) {
        this.world.cancelled.add(current)
        cancelled.push(current)
      }

      // Arrastra a quien dependia de el.
      for (const entry of this.pending) {
        if (dependsOn(entry.def.requires, current) && !queue.includes(entry.def.id)) {
          queue.push(entry.def.id)
        }
      }
    }

    if (reason && cancelled.length > 0) {
      this.world.record(reason, 'system', { event: id })
    }
    return cancelled
  }

  reschedule(id: EventId, deltaMinutes: number): boolean {
    const entry = this.pending.find((e) => e.def.id === id)
    if (!entry) return false
    entry.minute += deltaMinutes
    if (entry.endMinute !== null) entry.endMinute += deltaMinutes
    this.sort()
    return true
  }

  /** Programa un evento ya definido para un momento concreto. */
  schedule(id: EventId, atMinute: number): boolean {
    const def = this.byId.get(id)
    if (!def) return false
    if (this.isPending(id)) {
      this.reschedule(id, atMinute - this.scheduledAt(id)!)
      return true
    }
    this.world.cancelled.delete(id)
    this.pending.push({
      def,
      minute: atMinute,
      endMinute: def.until ? atMinute + (parseTime(def.until) - parseTime(def.at)) : null,
    })
    this.sort()
    return true
  }

  /* ---------------------------------------------------------------- *
   * Avance del reloj
   * ---------------------------------------------------------------- */

  /**
   * Avanza el reloj `minutes` y resuelve todo lo que caiga en la ventana.
   *
   * Los eventos se procesan EN ORDEN CRONOLOGICO uno a uno, no en bloque,
   * porque los efectos de uno pueden cancelar a otro de la misma ventana. Es
   * justo lo que pasa el dia 2: si Evelyn se salva a las 12:00, lo que estaba
   * previsto para las 12:30 deja de existir antes de que le llegue el turno.
   */
  advance(minutes: number): TickReport {
    const from = this.clock.now
    const to = from + minutes

    const report: TickReport = {
      from,
      to,
      witnessed: [],
      offscreen: [],
      skipped: [],
      traces: [],
      deferred: [],
    }

    // Bucle sobre eventos, no sobre minutos: procesamos el siguiente pendiente
    // mientras caiga dentro de la ventana, avanzando el reloj hasta el.
    for (;;) {
      const next = this.pending[0]
      if (!next || next.minute > to) break

      this.pending.shift()
      // El reloj se coloca en el instante del evento para que las condiciones
      // de tiempo se evaluen con el valor correcto.
      this.clock.advanceTo(Math.max(this.clock.now, next.minute))
      this.fire(next, report)
    }

    this.clock.advanceTo(to)
    this.closeOngoing(to)
    this.party.tick(to)
    return report
  }

  /** Avanza hasta cerrar la secuencia de media hora en curso. */
  advanceToNextSequence(): TickReport {
    return this.advance(this.clock.minutesToNextSequence)
  }

  private fire(entry: Entry, report: TickReport): void {
    const { def } = entry

    if (this.world.cancelled.has(def.id)) {
      report.skipped.push(def.id)
      return
    }

    if (!this.world.testAll(def.requires)) {
      // No se cumplen las condiciones: el evento se descarta y arrastra a los
      // que dependian de el.
      this.world.cancelled.add(def.id)
      report.skipped.push(def.id)
      this.cascadeFrom(def.id, report)
      return
    }

    // Los actores acuden a su cita.
    for (const npc of def.actors ?? []) {
      if (this.world.hasNpc(npc) && this.world.npcAvailable(npc)) {
        this.world.moveNpc(npc, def.location)
      }
    }

    this.world.fired.add(def.id)

    const witnesses = this.party.at(def.location).map((m) => m.id)
    const witnessed = witnesses.length > 0
    const fired: FiredEvent = { def, minute: entry.minute, witnessed, witnesses }

    if (witnessed) {
      this.world.witnessed.add(def.id)
      report.witnessed.push(fired)
      if (def.witnessText) {
        this.world.record(def.witnessText, 'seen', {
          location: def.location,
          event: def.id,
        })
      }
    } else {
      report.offscreen.push(fired)
      // Sin testigos, el evento deja rastro: eso es lo que permite reconstruir
      // despues lo que paso sin haber estado delante.
      for (const trace of def.traces ?? []) {
        if (this.world.testAll(trace.requires)) report.traces.push(trace)
      }
      if (def.witnessText) {
        this.world.record(def.witnessText, 'hidden', {
          location: def.location,
          event: def.id,
        })
      }
    }

    // Efectos. Los que tocan la agenda vuelven aqui como peticiones.
    for (const req of this.world.applyAll(def.effects)) {
      switch (req.kind) {
        case 'cancel':
          this.cancel(req.event)
          break
        case 'reschedule':
          this.reschedule(req.event, req.deltaMinutes)
          break
        case 'schedule':
          this.schedule(req.event, req.atMinute)
          break
        case 'defer':
          // Cordura y dano SOLO si habia alguien delante. Perder la cabeza por
          // algo que no has visto seria absurdo, y ademas rompe la promesa de
          // que perderse una escena tiene un coste distinto: no la sufres, pero
          // tampoco te enteras.
          if (witnessed) report.deferred.push(req.effect)
          break
      }
    }

    for (const id of def.cancels ?? []) this.cancel(id)

    // Si el evento dura, queda en curso para que el jugador pueda llegar tarde.
    if (entry.endMinute !== null && entry.endMinute > this.clock.now) {
      this.ongoing.set(def.id, entry)
    }
  }

  /** Marca como descartados los eventos que dependian de uno que no ocurrio. */
  private cascadeFrom(id: EventId, report: TickReport): void {
    for (const dropped of this.cancel(id)) {
      if (dropped !== id && !report.skipped.includes(dropped)) report.skipped.push(dropped)
    }
  }

  private closeOngoing(now: number): void {
    for (const [id, entry] of this.ongoing) {
      if (entry.endMinute !== null && now >= entry.endMinute) this.ongoing.delete(id)
    }
  }

  /* ---------------------------------------------------------------- *
   * Diagnostico
   * ---------------------------------------------------------------- */

  /**
   * Ejecuta la agenda entera sin jugador, para los tests de simulacion en seco.
   * Devuelve el orden real de disparo.
   */
  runToEnd(endMinute: number): { fired: EventId[]; skipped: EventId[] } {
    const fired: EventId[] = []
    const skipped: EventId[] = []
    while (this.pending.length > 0 && this.clock.now < endMinute) {
      const next = this.pending[0]!
      const step = Math.max(1, next.minute - this.clock.now)
      const report = this.advance(step)
      for (const f of [...report.witnessed, ...report.offscreen]) fired.push(f.def.id)
      skipped.push(...report.skipped)
    }
    return { fired, skipped }
  }

  /** Toda la agenda pendiente, para depurar. */
  dump(): { id: EventId; minute: number; location: LocationId }[] {
    return this.pending.map((e) => ({
      id: e.def.id,
      minute: e.minute,
      location: e.def.location,
    }))
  }

  snapshot(): SchedulerSnapshot {
    const pack = (entry: Entry) => ({
      id: entry.def.id,
      minute: entry.minute,
      endMinute: entry.endMinute,
    })
    return {
      pending: this.pending.map(pack),
      ongoing: [...this.ongoing.values()].map(pack),
    }
  }

  restore(snap: SchedulerSnapshot): void {
    const unpack = (entry: SchedulerSnapshot['pending'][number]): Entry => {
      const def = this.byId.get(entry.id)
      if (!def) throw new Error(`No se puede restaurar el evento desconocido "${entry.id}"`)
      return { def, minute: entry.minute, endMinute: entry.endMinute }
    }
    this.pending = snap.pending.map(unpack)
    this.ongoing = new Map(snap.ongoing.map((entry) => [entry.id, unpack(entry)]))
    this.sort()
  }

  /** Semilla para reproducir una partida. */
  get seed(): number {
    return this.rng.save()
  }
}

/** Verdadero si alguna condicion exige que `id` se haya disparado. */
function dependsOn(conds: Condition[] | undefined, id: EventId): boolean {
  if (!conds) return false
  return conds.some((c) => conditionDependsOn(c, id))
}

function conditionDependsOn(cond: Condition, id: EventId): boolean {
  switch (cond.kind) {
    case 'eventFired':
      return cond.event === id
    case 'all':
    case 'any':
      return cond.of.some((c) => conditionDependsOn(c, id))
    case 'not':
      // Una condicion negada NO crea dependencia: que el evento no ocurra es
      // precisamente lo que la hace cierta.
      return false
    default:
      return false
  }
}

export type { SceneId }
