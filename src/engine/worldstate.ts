/**
 * El estado del mundo.
 *
 * Aqui vive la cadena de custodia de objetos, que es la columna vertebral de la
 * aventura. El Disco Solar pasa por hasta seis manos a lo largo de dos dias
 * (Weder, Dieter, los esbirros de Selassie, Gasparini, el grupo) y termine donde
 * termine acaba en la cabeza de Shakti a las 21:00 del dia 22, arrancado por un
 * hechizo. Es una patata caliente, y modelarla bien es media aventura.
 *
 * Tambien vive aqui el evaluador de Condition y Effect: el lenguaje declarativo
 * que usan por igual el scheduler, los dialogos y las localizaciones, para que
 * el contenido se pueda escribir en JSON sin tocar TypeScript.
 */
import type { Clock } from './clock'
import type { Party } from './party'
import type { Rng } from './rng'
import type {
  ActorId,
  ActorStatus,
  Condition,
  Effect,
  EventId,
  FactId,
  FlagId,
  ItemId,
  LocationId,
  NpcDef,
  NpcId,
  NpcState,
} from './types'

/** Quien tiene un objeto. 'nobody' es "esta en su sitio, sin duenno". */
export type Holder = ActorId | 'player' | 'nobody'

export interface LogEntry {
  minute: number
  text: string
  /** 'seen' lo presencio el grupo; 'heard' se lo contaron; 'hidden' paso sin ellos. */
  channel: 'seen' | 'heard' | 'hidden' | 'system'
  location?: LocationId
  event?: EventId
}

export interface WorldSnapshot {
  flags: [FlagId, boolean][]
  counters: [string, number][]
  custody: [ItemId, Holder][]
  npcs: [NpcId, NpcState][]
  fired: EventId[]
  cancelled: EventId[]
  witnessed: EventId[]
  journal: string[]
  log: LogEntry[]
}

export class WorldState {
  private flags = new Map<FlagId, boolean>()
  private counters = new Map<string, number>()
  private custody = new Map<ItemId, Holder>()
  private npcs = new Map<NpcId, NpcState>()

  /** Eventos que han ocurrido, los haya visto el grupo o no. */
  readonly fired = new Set<EventId>()
  /** Eventos cancelados por las decisiones del jugador. */
  readonly cancelled = new Set<EventId>()
  /** Eventos que el grupo presencio de verdad. Alimenta la pantalla final. */
  readonly witnessed = new Set<EventId>()

  readonly journal: string[] = []
  readonly log: LogEntry[] = []

  constructor(
    private readonly clock: Clock,
    private readonly party: Party,
    private readonly rng: Rng,
  ) {}

  /* ---------------------------------------------------------------- *
   * Banderas y contadores
   * ---------------------------------------------------------------- */

  getFlag(flag: FlagId): boolean {
    return this.flags.get(flag) ?? false
  }

  setFlag(flag: FlagId, value = true): void {
    this.flags.set(flag, value)
  }

  getCounter(counter: string): number {
    return this.counters.get(counter) ?? 0
  }

  addCounter(counter: string, by: number): number {
    const next = this.getCounter(counter) + by
    this.counters.set(counter, next)
    return next
  }

  /* ---------------------------------------------------------------- *
   * Custodia de objetos
   * ---------------------------------------------------------------- */

  holderOf(item: ItemId): Holder {
    return this.custody.get(item) ?? 'nobody'
  }

  setHolder(item: ItemId, holder: Holder): void {
    this.custody.set(item, holder)
  }

  /** Objetos que tiene un actor concreto. */
  itemsHeldBy(holder: Holder): ItemId[] {
    const out: ItemId[] = []
    for (const [item, h] of this.custody) if (h === holder) out.push(item)
    return out
  }

  /** Verdadero si el objeto lo tiene el grupo, sea en custodia o en mochila. */
  partyHas(item: ItemId): boolean {
    if (this.custody.get(item) === 'player') return true
    return this.party.members.some((m) => m.inventory.includes(item))
  }

  /* ---------------------------------------------------------------- *
   * PNJ
   * ---------------------------------------------------------------- */

  registerNpc(def: NpcDef, location: LocationId): NpcState {
    const state: NpcState = {
      id: def.id,
      location,
      status: 'ok',
      disposition: def.disposition ?? 0,
      knows: [...(def.knows ?? [])],
      hp: def.hp ?? 10,
      rumorsTold: [],
      suspicious: false,
    }
    this.npcs.set(def.id, state)
    return state
  }

  npc(id: NpcId): NpcState {
    const n = this.npcs.get(id)
    if (!n) throw new Error(`PNJ no registrado: "${id}"`)
    return n
  }

  hasNpc(id: NpcId): boolean {
    return this.npcs.has(id)
  }

  get allNpcs(): NpcState[] {
    return [...this.npcs.values()]
  }

  /** PNJ presentes en una localizacion y en condiciones de ser abordados. */
  npcsAt(location: LocationId): NpcState[] {
    return this.allNpcs.filter(
      (n) => n.location === location && n.status !== 'dead' && n.status !== 'fled',
    )
  }

  moveNpc(id: NpcId, to: LocationId): void {
    this.npc(id).location = to
  }

  setNpcStatus(id: NpcId, status: ActorStatus): void {
    this.npc(id).status = status
  }

  adjustDisposition(id: NpcId, by: number): number {
    const n = this.npc(id)
    n.disposition = Math.max(-100, Math.min(100, n.disposition + by))
    return n.disposition
  }

  /** Verdadero si el PNJ sigue disponible: ni muerto, ni detenido, ni fugado. */
  npcAvailable(id: NpcId): boolean {
    if (!this.hasNpc(id)) return false
    const s = this.npc(id).status
    return s === 'ok' || s === 'insane'
  }

  /* ---------------------------------------------------------------- *
   * Conocimiento
   * ---------------------------------------------------------------- */

  /** Un hecho aprendido por un investigador, o por todo el grupo si no se dice. */
  learnFact(fact: FactId, who?: ActorId): void {
    const targets = who ? [this.party.byId(who)] : this.party.members
    for (const inv of targets) if (!inv.knows.includes(fact)) inv.knows.push(fact)
  }

  /** Verdadero si alguien del grupo lo sabe (o uno concreto, si se especifica). */
  knows(fact: FactId, who?: ActorId): boolean {
    if (who) return this.party.byId(who).knows.includes(fact)
    return this.party.members.some((m) => m.knows.includes(fact))
  }

  npcLearnsFact(npc: NpcId, fact: FactId): void {
    const n = this.npc(npc)
    if (!n.knows.includes(fact)) n.knows.push(fact)
  }

  /* ---------------------------------------------------------------- *
   * Registro
   * ---------------------------------------------------------------- */

  record(text: string, channel: LogEntry['channel'], extra: Partial<LogEntry> = {}): void {
    this.log.push({ minute: this.clock.now, text, channel, ...extra })
  }

  unlockJournal(entry: string): void {
    if (!this.journal.includes(entry)) this.journal.push(entry)
  }

  /* ---------------------------------------------------------------- *
   * Evaluacion de condiciones
   * ---------------------------------------------------------------- */

  test(cond: Condition): boolean {
    switch (cond.kind) {
      case 'flag':
        return this.getFlag(cond.flag) === (cond.value ?? true)

      case 'counter': {
        const v = this.getCounter(cond.counter)
        switch (cond.op) {
          case '<':
            return v < cond.value
          case '<=':
            return v <= cond.value
          case '=':
            return v === cond.value
          case '>=':
            return v >= cond.value
          case '>':
            return v > cond.value
        }
        return false
      }

      case 'custody':
        return this.holderOf(cond.item) === cond.holder

      case 'npcStatus': {
        if (!this.hasNpc(cond.npc)) return false
        const want = Array.isArray(cond.status) ? cond.status : [cond.status]
        return want.includes(this.npc(cond.npc).status)
      }

      case 'npcAlive':
        return this.hasNpc(cond.npc) && this.npc(cond.npc).status !== 'dead'

      case 'disposition': {
        if (!this.hasNpc(cond.npc)) return false
        const d = this.npc(cond.npc).disposition
        switch (cond.op) {
          case '<':
            return d < cond.value
          case '<=':
            return d <= cond.value
          case '>=':
            return d >= cond.value
          case '>':
            return d > cond.value
        }
        return false
      }

      case 'partyAt':
        return this.party.focus.location === cond.location

      case 'anyoneAt':
        return this.party.at(cond.location).length > 0

      case 'knows':
        return this.knows(cond.fact, cond.who)

      case 'hasItem':
        return this.partyHas(cond.item)

      case 'timeBefore':
        return this.clock.now < cond.minute

      case 'timeAfter':
        return this.clock.now >= cond.minute

      case 'eventFired':
        return this.fired.has(cond.event)

      case 'eventCancelled':
        return this.cancelled.has(cond.event)

      case 'chance':
        return this.rng.chance(cond.percent)

      case 'not':
        return !this.test(cond.of)

      case 'all':
        return cond.of.every((c) => this.test(c))

      case 'any':
        return cond.of.some((c) => this.test(c))
    }
  }

  /** Verdadero si se cumplen todas. Una lista vacia se cumple siempre. */
  testAll(conds: Condition[] | undefined): boolean {
    if (!conds || conds.length === 0) return true
    return conds.every((c) => this.test(c))
  }

  /* ---------------------------------------------------------------- *
   * Aplicacion de efectos
   * ---------------------------------------------------------------- */

  /**
   * Aplica un efecto. Los que tocan al scheduler (cancelar, reprogramar,
   * programar) se devuelven como peticiones en lugar de ejecutarse aqui, para
   * no acoplar el estado con la cola de eventos.
   */
  apply(effect: Effect): SchedulerRequest | null {
    switch (effect.kind) {
      case 'setFlag':
        this.setFlag(effect.flag, effect.value ?? true)
        return null

      case 'addCounter':
        this.addCounter(effect.counter, effect.by)
        return null

      case 'moveCustody':
        this.setHolder(effect.item, effect.to)
        if (effect.to === 'player') {
          const inv = this.party.focus
          if (!inv.inventory.includes(effect.item)) inv.inventory.push(effect.item)
        } else {
          for (const m of this.party.members) {
            m.inventory = m.inventory.filter((i) => i !== effect.item)
          }
        }
        return null

      case 'moveNpc':
        if (this.hasNpc(effect.npc)) this.moveNpc(effect.npc, effect.to)
        return null

      case 'setNpcStatus':
        if (this.hasNpc(effect.npc)) this.setNpcStatus(effect.npc, effect.status)
        return null

      case 'adjustDisposition':
        if (this.hasNpc(effect.npc)) this.adjustDisposition(effect.npc, effect.by)
        return null

      case 'learnFact':
        this.learnFact(effect.fact, effect.who)
        return null

      case 'npcLearnsFact':
        if (this.hasNpc(effect.npc)) this.npcLearnsFact(effect.npc, effect.fact)
        return null

      case 'giveItem': {
        const inv = this.party.focus
        if (!inv.inventory.includes(effect.item)) inv.inventory.push(effect.item)
        return null
      }

      case 'removeItem':
        for (const m of this.party.members) {
          m.inventory = m.inventory.filter((i) => i !== effect.item)
        }
        return null

      case 'adjustLuck': {
        const targets = effect.who ? [this.party.byId(effect.who)] : this.party.members
        for (const inv of targets) inv.luck = Math.max(0, Math.min(99, inv.luck + effect.by))
        return null
      }

      case 'unlockJournal':
        this.unlockJournal(effect.entry)
        return null

      case 'log':
        this.record(effect.text, 'system')
        return null

      // Estos tres los resuelve el scheduler.
      case 'cancelEvent':
        return { kind: 'cancel', event: effect.event }
      case 'rescheduleEvent':
        return { kind: 'reschedule', event: effect.event, deltaMinutes: effect.deltaMinutes }
      case 'scheduleEvent':
        return { kind: 'schedule', event: effect.event, atMinute: effect.atMinute }

      // Cordura, dano y el estado de un investigador necesitan el Rng y la
      // ficha; los resuelve quien llama, porque tienen narracion propia que
      // mostrar (y 'random' necesita saber quien esta presente).
      case 'sanityLoss':
      case 'damage':
      case 'setInvestigatorStatus':
        return { kind: 'defer', effect }
    }
  }

  /** Aplica una lista y devuelve las peticiones pendientes para el scheduler. */
  applyAll(effects: Effect[] | undefined): SchedulerRequest[] {
    if (!effects) return []
    const out: SchedulerRequest[] = []
    for (const e of effects) {
      const req = this.apply(e)
      if (req) out.push(req)
    }
    return out
  }

  /* ---------------------------------------------------------------- *
   * Guardado
   * ---------------------------------------------------------------- */

  snapshot(): WorldSnapshot {
    return {
      flags: [...this.flags],
      counters: [...this.counters],
      custody: [...this.custody],
      npcs: [...this.npcs].map(([k, v]) => [k, { ...v, knows: [...v.knows], rumorsTold: [...v.rumorsTold] }]),
      fired: [...this.fired],
      cancelled: [...this.cancelled],
      witnessed: [...this.witnessed],
      journal: [...this.journal],
      log: [...this.log],
    }
  }

  restore(snap: WorldSnapshot): void {
    this.flags = new Map(snap.flags)
    this.counters = new Map(snap.counters)
    this.custody = new Map(snap.custody)
    this.npcs = new Map(snap.npcs)
    this.fired.clear()
    for (const e of snap.fired) this.fired.add(e)
    this.cancelled.clear()
    for (const e of snap.cancelled) this.cancelled.add(e)
    this.witnessed.clear()
    for (const e of snap.witnessed) this.witnessed.add(e)
    this.journal.length = 0
    this.journal.push(...snap.journal)
    this.log.length = 0
    this.log.push(...snap.log)
  }
}

/** Peticiones que el estado delega en el scheduler. */
export type SchedulerRequest =
  | { kind: 'cancel'; event: EventId }
  | { kind: 'reschedule'; event: EventId; deltaMinutes: number }
  | { kind: 'schedule'; event: EventId; atMinute: number }
  | { kind: 'defer'; effect: Effect }
