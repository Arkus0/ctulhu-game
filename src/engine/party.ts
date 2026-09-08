/**
 * El grupo de investigadores.
 *
 * El jugador es uno solo, pero lleva a tres personajes. Eso resuelve el problema
 * central del modulo: "estar en un lugar concreto nos impide estar en otros".
 * Puedes repartirlos por el hotel, pero entonces cada uno ve solo su trozo, y un
 * investigador solo en el Viejo Templo es carne muerta.
 *
 * Modelo de interfaz: hay un investigador CON FOCO, que es al que juegas de
 * verdad. A los otros les das una orden permanente y se resuelve sola cuando
 * avanza el reloj, devolviendo un informe. Asi el juego sigue siendo una sola
 * pantalla de texto y no una hoja de calculo.
 */
import { Rng } from './rng'
import { groupRoll, roll, type Difficulty, type GroupRollResult, type RollResult } from './rules'
import { madnessPenalty, tickMadness } from './sanity'
import {
  deriveHpMax,
  deriveMove,
  deriveMpMax,
  type Characteristics,
  type Investigator,
  type LocationId,
  type NpcId,
  type SkillId,
} from './types'

export type OrderKind = 'wait' | 'watch' | 'follow' | 'search' | 'goto' | 'ask'

/** Orden permanente para un investigador sin foco. */
export interface Order {
  kind: OrderKind
  /** Localizacion a vigilar o a la que ir. */
  location?: LocationId
  /** PNJ al que seguir o preguntar. */
  npc?: NpcId
  /** Descripcion para la interfaz. */
  label: string
}

export const DEFAULT_ORDER: Order = { kind: 'wait', label: 'Esperar donde esta' }

export interface PartySnapshot {
  focusId: string
  members: Investigator[]
  orders: [string, Order][]
}

export interface InvestigatorDef {
  id: string
  name: string
  occupation: string
  blurb: string
  /** Retrato en `public/art/retratos`, sin extension. */
  portrait?: string
  chars: Characteristics
  skills: Record<SkillId, number>
  /** Cordura inicial; por defecto POD. */
  san?: number
  /** Suerte inicial; por defecto 3D6 x 5. */
  luck?: number
  inventory?: string[]
}

/** Construye un investigador jugable derivando todos los atributos secundarios. */
export function createInvestigator(
  def: InvestigatorDef,
  startLocation: LocationId,
  rng?: Rng,
): Investigator {
  const hpMax = deriveHpMax(def.chars)
  const mpMax = deriveMpMax(def.chars)
  const san = def.san ?? def.chars.POD
  const luck = def.luck ?? (rng ? rng.dice(3, 6) * 5 : 50)

  return {
    id: def.id,
    name: def.name,
    occupation: def.occupation,
    blurb: def.blurb,
    chars: { ...def.chars },
    skills: { ...def.skills },
    hp: hpMax,
    hpMax,
    san,
    sanMax: 99,
    sanAtDayStart: san,
    mp: mpMax,
    mpMax,
    luck,
    location: startLocation,
    status: 'ok',
    madness: null,
    phobias: [],
    manias: [],
    knows: [],
    inventory: [...(def.inventory ?? [])],
    sanLostToday: 0,
  }
}

export class Party {
  readonly members: Investigator[]
  private orders = new Map<string, Order>()
  private focusId: string

  constructor(members: Investigator[]) {
    if (members.length === 0) throw new Error('Un grupo sin investigadores')
    this.members = members
    this.focusId = members[0]!.id
    for (const m of members) this.orders.set(m.id, { ...DEFAULT_ORDER })
  }

  /** El investigador al que el jugador esta jugando ahora mismo. */
  get focus(): Investigator {
    return this.byId(this.focusId)
  }

  setFocus(id: string): void {
    const inv = this.members.find((m) => m.id === id)
    if (!inv) throw new Error(`No hay ningun investigador con id "${id}"`)
    if (!isPlayable(inv)) throw new Error(`${inv.name} no esta en condiciones de actuar`)
    this.focusId = id
  }

  byId(id: string): Investigator {
    const inv = this.members.find((m) => m.id === id)
    if (!inv) throw new Error(`No hay ningun investigador con id "${id}"`)
    return inv
  }

  /** Investigadores que pueden hacer algo: ni muertos, ni inconscientes, ni idos. */
  get active(): Investigator[] {
    return this.members.filter(isPlayable)
  }

  get alive(): Investigator[] {
    return this.members.filter((m) => m.status !== 'dead')
  }

  /** Verdadero si el grupo entero esta fuera de juego: fin de partida. */
  get wipedOut(): boolean {
    return this.active.length === 0
  }

  at(location: LocationId): Investigator[] {
    return this.active.filter((m) => m.location === location)
  }

  /** Verdadero si el grupo esta junto en un mismo sitio. */
  get together(): boolean {
    const locs = new Set(this.active.map((m) => m.location))
    return locs.size <= 1
  }

  /** Localizaciones ocupadas por alguien del grupo. */
  get occupiedLocations(): LocationId[] {
    return [...new Set(this.active.map((m) => m.location))]
  }

  move(id: string, to: LocationId): void {
    this.byId(id).location = to
  }

  /** Mueve a todo el que este acompanando al investigador con foco. */
  moveTogether(to: LocationId): void {
    const from = this.focus.location
    for (const m of this.active) if (m.location === from) m.location = to
  }

  getOrder(id: string): Order {
    return this.orders.get(id) ?? { ...DEFAULT_ORDER }
  }

  setOrder(id: string, order: Order): void {
    this.byId(id)
    this.orders.set(id, order)
  }

  /** Ordenes de todos los que no tienen el foco. */
  standingOrders(): { investigator: Investigator; order: Order }[] {
    return this.active
      .filter((m) => m.id !== this.focusId)
      .map((m) => ({ investigator: m, order: this.getOrder(m.id) }))
  }

  /**
   * Valor de una habilidad para un investigador, ya con la penalizacion por
   * locura descontada en forma de dados de penalizacion.
   */
  skill(id: string, skill: SkillId): number {
    return this.byId(id).skills[skill] ?? 0
  }

  /** El miembro presente en `location` con mejor valor en `skill`. */
  bestAt(location: LocationId, skill: SkillId): Investigator | null {
    const here = this.at(location)
    if (here.length === 0) return null
    let best = here[0]!
    for (const m of here) if ((m.skills[skill] ?? 0) > (best.skills[skill] ?? 0)) best = m
    return best
  }

  /**
   * Tirada individual con los modificadores del personaje ya aplicados: la
   * locura mete dados de penalizacion sin que el contenido tenga que acordarse.
   */
  check(
    rng: Rng,
    id: string,
    skill: SkillId,
    opts: { difficulty?: Difficulty; bonus?: number; penalty?: number } = {},
  ): RollResult {
    const inv = this.byId(id)
    const target = skill in inv.skills ? inv.skills[skill]! : characteristicValue(inv, skill)
    return roll(rng, target, {
      difficulty: opts.difficulty ?? 'regular',
      bonus: opts.bonus ?? 0,
      penalty: (opts.penalty ?? 0) + madnessPenalty(inv),
      label: `${inv.name}: ${skill}`,
    })
  }

  /**
   * Tirada de grupo entre los presentes en una localizacion. El modulo la pide
   * constantemente: "cada investigador hace una tirada de Credito y cada exito
   * disminuye la furia de Carter un 10%".
   */
  checkGroup(
    rng: Rng,
    location: LocationId,
    skill: SkillId,
    opts: { difficulty?: Difficulty; bonus?: number; penalty?: number } = {},
  ): GroupRollResult {
    const here = this.at(location)
    if (here.length === 0) throw new Error(`No hay nadie del grupo en ${location}`)
    return groupRoll(
      rng,
      here.map((inv) => ({
        id: inv.id,
        target: skill in inv.skills ? inv.skills[skill]! : characteristicValue(inv, skill),
        opts: {
          bonus: opts.bonus ?? 0,
          penalty: (opts.penalty ?? 0) + madnessPenalty(inv),
          label: inv.name,
        },
      })),
      opts.difficulty ?? 'regular',
    )
  }

  /** Reparte dano y deja inconsciente o muerto segun corresponda. */
  applyDamage(id: string, amount: number): { unconscious: boolean; dead: boolean } {
    const inv = this.byId(id)
    inv.hp = Math.max(0, inv.hp - amount)
    // Herida grave: dano igual o mayor que la mitad de los PV maximos.
    const dead = inv.hp === 0 && amount >= Math.floor(inv.hpMax / 2)
    if (inv.hp === 0) inv.status = dead ? 'dead' : 'unconscious'
    return { unconscious: inv.hp === 0 && !dead, dead }
  }

  /** Avanza el reloj para el grupo: remite la locura temporal cumplida. */
  tick(now: number): Investigator[] {
    const recovered: Investigator[] = []
    for (const m of this.members) if (tickMadness(m, now)) recovered.push(m)
    // Si el que llevaba el foco ha quedado fuera de juego, se pasa a otro.
    if (!isPlayable(this.focus)) {
      const next = this.active[0]
      if (next) this.focusId = next.id
    }
    return recovered
  }

  moveSpeed(id: string): number {
    return deriveMove(this.byId(id).chars)
  }

  snapshot(): PartySnapshot {
    return {
      focusId: this.focusId,
      members: this.members.map((m) => ({
        ...m,
        chars: { ...m.chars },
        skills: { ...m.skills },
        madness: m.madness ? { ...m.madness } : null,
        phobias: [...m.phobias],
        manias: [...m.manias],
        knows: [...m.knows],
        inventory: [...m.inventory],
      })),
      orders: [...this.orders].map(([id, order]) => [id, { ...order }]),
    }
  }

  restore(snap: PartySnapshot): void {
    this.members.splice(
      0,
      this.members.length,
      ...snap.members.map((m) => ({
        ...m,
        chars: { ...m.chars },
        skills: { ...m.skills },
        madness: m.madness ? { ...m.madness } : null,
        phobias: [...m.phobias],
        manias: [...m.manias],
        knows: [...m.knows],
        inventory: [...m.inventory],
      })),
    )
    this.focusId = snap.focusId
    this.orders = new Map(snap.orders.map(([id, order]) => [id, { ...order }]))
  }
}

function isPlayable(inv: Investigator): boolean {
  return inv.status === 'ok'
}

/**
 * Permite tirar contra una caracteristica escribiendo su nombre donde iria una
 * habilidad: el modulo pide "una tirada de DES" para no resbalar en las
 * escaleras del sotano y "una tirada de POD" ante la vision.
 */
function characteristicValue(inv: Investigator, key: string): number {
  const upper = key.toUpperCase()
  if (upper in inv.chars) return inv.chars[upper as keyof Characteristics]
  if (upper === 'SUERTE' || upper === 'LUCK') return inv.luck
  if (upper === 'COR' || upper === 'CORDURA') return inv.san
  if (upper === 'CONOCIMIENTOS') return inv.chars.EDU
  if (upper === 'IDEA') return inv.chars.INT
  return 0
}
