/**
 * Sigilo, seguimiento y escucha fragmentaria.
 *
 * La escucha parcial es la mecanica con mas sabor de todo el modulo. El libro es
 * explicito: "un exito en Escuchar permite captar 1D6 fragmentos de la
 * conversacion; un exito Extremo eleva la cantidad a 1D6+3". No oyes la escena:
 * oyes trozos, elegidos al azar, y con ellos reconstruyes. Dos partidas sobre la
 * misma conversacion dan dos versiones distintas de la verdad, y esa es
 * justamente la rejugabilidad que el autor dice buscar.
 *
 * Detalle de diseno propio: para el SIGILO cuenta el PEOR del grupo presente,
 * porque el grupo es tan discreto como su miembro mas torpe. Para ESCUCHAR
 * cuenta el mejor. Eso da una razon mecanica real para separar al grupo, que es
 * la tesis del modulo.
 */
import { Rng } from './rng'
import { Outcome, roll, type Difficulty, type RollResult } from './rules'
import { madnessPenalty } from './sanity'
import type { Party } from './party'
import type { Investigator, LocationId, NpcId, SkillId } from './types'
import type { WorldState } from './worldstate'

/** Una conversacion espiable, con sus trozos numerados. */
export interface ConversationDef {
  id: string
  location: LocationId
  participants: NpcId[]
  /** Momento en el que ocurre, para casarla con el evento de la agenda. */
  event?: string
  /**
   * Los fragmentos. Cada uno tiene que sostenerse solo: el jugador puede
   * quedarse con el cuarto y el sexto y nada mas.
   */
  fragments: ConversationFragment[]
  /** Lo que se percibe aunque se falle la tirada: tono, gestos, una palabra. */
  ambient?: string

  /**
   * Cuanto sigilo hace falta para ponerse a tiro.
   *
   * 'ninguno' en un sitio publico y abarrotado: en la terraza del Shepheard's
   * las mesas se tocan unas con otras y basta con cambiarse de sitio, que es lo
   * que el modulo sugiere. 'normal' en un jardin apartado. 'dificil' en un
   * pasillo vacio o en el sotano, donde te oyen llegar.
   */
  stealth?: 'ninguno' | 'normal' | 'dificil'
  /** Modificador a Escuchar: el ruido de fondo del sitio. */
  listenPenalty?: number
  listenBonus?: number
}

export interface ConversationFragment {
  id: string
  text: string
  /** Hechos que este fragmento ensena al grupo. */
  facts?: string[]
  /** Si es verdadero, no se sortea: siempre entra si se supera la tirada. */
  always?: boolean
}

export interface EavesdropResult {
  /** Si es falso, les han pillado antes de oir nada. */
  positioned: boolean
  stealth: RollResult | null
  listen: RollResult | null
  /** Fragmentos captados en este intento. */
  fragments: ConversationFragment[]
  /** Cuantos quedan sin oir. */
  remaining: number
  detectedBy: NpcId | null
  narration: string
}

export interface TailResult {
  success: boolean
  stealth: RollResult
  awareness: RollResult
  detectedBy: NpcId | null
  narration: string
}

/**
 * Lleva la cuenta de que fragmentos ha oido ya el grupo, para no repetirlos si
 * vuelven a intentarlo y para poder mostrar al final cuanto se perdieron.
 */
export class ConversationLog {
  private heard = new Map<string, Set<string>>()

  markHeard(conversation: string, fragmentId: string): void {
    let set = this.heard.get(conversation)
    if (!set) {
      set = new Set()
      this.heard.set(conversation, set)
    }
    set.add(fragmentId)
  }

  heardIn(conversation: string): string[] {
    return [...(this.heard.get(conversation) ?? [])]
  }

  hasHeard(conversation: string, fragmentId: string): boolean {
    return this.heard.get(conversation)?.has(fragmentId) ?? false
  }

  /** Cuanto se ha enterado el grupo de una conversacion, de 0 a 1. */
  coverage(conv: ConversationDef): number {
    const total = conv.fragments.length
    if (total === 0) return 1
    return this.heardIn(conv.id).length / total
  }

  snapshot(): [string, string[]][] {
    return [...this.heard].map(([k, v]) => [k, [...v]])
  }

  restore(data: [string, string[]][]): void {
    this.heard = new Map(data.map(([k, v]) => [k, new Set(v)]))
  }
}

/** El miembro presente con el valor mas bajo: el eslabon debil del sigilo. */
function worstAt(party: Party, location: LocationId, skill: SkillId): Investigator | null {
  const here = party.at(location)
  if (here.length === 0) return null
  let worst = here[0]!
  for (const m of here) if ((m.skills[skill] ?? 0) < (worst.skills[skill] ?? 0)) worst = m
  return worst
}

function bestAt(party: Party, location: LocationId, skill: SkillId): Investigator | null {
  const here = party.at(location)
  if (here.length === 0) return null
  let best = here[0]!
  for (const m of here) if ((m.skills[skill] ?? 0) > (best.skills[skill] ?? 0)) best = m
  return best
}

/** Lo alerta que esta un PNJ: el mayor de Descubrir y Escuchar. */
function awareness(world: WorldState, npcSkills: Record<NpcId, Record<string, number>>, id: NpcId): number {
  const skills = npcSkills[id] ?? {}
  const base = Math.max(skills['Descubrir'] ?? 25, skills['Escuchar'] ?? 25)
  // Un PNJ escamado esta mucho mas atento.
  return world.hasNpc(id) && world.npc(id).suspicious ? base + 20 : base
}

export interface PerceptionDeps {
  rng: Rng
  party: Party
  world: WorldState
  /** Habilidades de los PNJ, del contenido. */
  npcSkills: Record<NpcId, Record<string, number>>
}

/**
 * Espiar una conversacion.
 *
 * Dos pasos, y el primero puede arruinarlo todo: colocarse sin que te vean, y
 * luego enterarte. Fallar el sigilo NO impide oir nada por sistema, pero te
 * delata, y un PNJ escamado cambia de tema y te trata distinto el resto de la
 * partida. Fallar hacia delante.
 */
export function eavesdrop(
  deps: PerceptionDeps,
  conv: ConversationDef,
  log: ConversationLog,
  opts: { bonus?: number; penalty?: number; skipStealth?: boolean } = {},
): EavesdropResult {
  const { rng, party, world, npcSkills } = deps

  const listener = bestAt(party, conv.location, 'Escuchar')
  if (!listener) {
    return {
      positioned: false,
      stealth: null,
      listen: null,
      fragments: [],
      remaining: conv.fragments.length,
      detectedBy: null,
      narration: 'No hay nadie del grupo lo bastante cerca para oir nada.',
    }
  }

  // Sigilo: el peor del grupo presente marca el paso, porque el grupo es tan
  // discreto como su miembro mas torpe.
  const needed = conv.stealth ?? 'normal'
  let stealth: RollResult | null = null
  let detectedBy: NpcId | null = null

  if (!opts.skipStealth && needed !== 'ninguno') {
    const sneaker = worstAt(party, conv.location, 'Sigilo')!
    stealth = roll(rng, sneaker.skills['Sigilo'] ?? 20, {
      // Un sitio dificil resta; uno apartado pero normal, ni suma ni resta.
      penalty: madnessPenalty(sneaker) + (needed === 'dificil' ? 1 : 0),
      label: `${sneaker.name}: Sigilo`,
    })

    for (const p of conv.participants) {
      const notice = roll(rng, awareness(world, npcSkills, p), { label: `${p}: alerta` })
      if (notice.outcome > stealth.outcome) {
        detectedBy = p
        break
      }
    }
  }

  if (detectedBy) {
    // Les han visto. Bajan la voz y el PNJ queda escamado.
    if (world.hasNpc(detectedBy)) {
      world.npc(detectedBy).suspicious = true
      world.adjustDisposition(detectedBy, -10)
    }
    return {
      positioned: false,
      stealth,
      listen: null,
      fragments: [],
      remaining: conv.fragments.length - log.heardIn(conv.id).length,
      detectedBy,
      narration:
        conv.ambient ??
        'Notan que alguien escucha. Las voces bajan hasta hacerse inaudibles y la conversacion se apaga.',
    }
  }

  // Escuchar: cuenta el mejor del grupo presente.
  const listen = roll(rng, listener.skills['Escuchar'] ?? 20, {
    bonus: (opts.bonus ?? 0) + (conv.listenBonus ?? 0),
    penalty:
      (opts.penalty ?? 0) + (conv.listenPenalty ?? 0) + madnessPenalty(listener),
    label: `${listener.name}: Escuchar`,
  })

  const pending = conv.fragments.filter((f) => !log.hasHeard(conv.id, f.id))

  let count = 0
  if (listen.outcome >= Outcome.Extreme) count = rng.die(6) + 3
  else if (listen.outcome >= Outcome.Regular) count = rng.die(6)

  const forced = pending.filter((f) => f.always)
  const pool = pending.filter((f) => !f.always)
  const picked =
    count > 0
      ? [...forced, ...rng.sample(pool, Math.max(0, count - forced.length))]
      : []

  // El orden en que se cuentan es el del guion, no el del sorteo: leer los
  // trozos desordenados seria ruido en vez de misterio.
  const order = new Map(conv.fragments.map((f, i) => [f.id, i]))
  picked.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))

  for (const f of picked) {
    log.markHeard(conv.id, f.id)
    for (const fact of f.facts ?? []) world.learnFact(fact)
  }

  const remaining = conv.fragments.length - log.heardIn(conv.id).length

  return {
    positioned: true,
    stealth,
    listen,
    fragments: picked,
    remaining,
    detectedBy: null,
    narration:
      picked.length > 0
        ? `${listener.name} pesca lo que puede entre el ruido.`
        : (conv.ambient ??
          `${listener.name} solo distingue el murmullo. Ni una palabra en claro.`),
  }
}

/**
 * Seguir a un PNJ sin que se de cuenta.
 *
 * "Veis a Carter dirigirse a los sotanos. El no es consciente de vuestra
 * presencia." El libro pide una tirada de Sigilo enfrentada a Descubrir o
 * Escuchar, y avisa de que lo esencial en este hotel maldito es ser discreto.
 */
export function tail(
  deps: PerceptionDeps,
  target: NpcId,
  opts: { bonus?: number; penalty?: number } = {},
): TailResult {
  const { rng, party, world, npcSkills } = deps
  const location = world.hasNpc(target) ? world.npc(target).location : party.focus.location

  const sneaker = worstAt(party, location, 'Sigilo') ?? party.focus
  const stealth = roll(rng, sneaker.skills['Sigilo'] ?? 20, {
    bonus: opts.bonus ?? 0,
    penalty: (opts.penalty ?? 0) + madnessPenalty(sneaker),
    label: `${sneaker.name}: Sigilo`,
  })
  const notice = roll(rng, awareness(world, npcSkills, target), { label: `${target}: alerta` })

  const success = stealth.outcome > notice.outcome
  if (!success && world.hasNpc(target)) {
    world.npc(target).suspicious = true
    world.adjustDisposition(target, -15)
  }

  return {
    success,
    stealth,
    awareness: notice,
    detectedBy: success ? null : target,
    narration: success
      ? `${sneaker.name} se mantiene a distancia. No les ha visto.`
      : `Se gira antes de tiempo. Sabe que le siguen, y ya no lo va a olvidar.`,
  }
}

/**
 * Buscar algo concreto: Descubrir con el mejor del grupo presente. Se usa para
 * las pistas fijas de las localizaciones (las cucarachas a los pies de Weder, la
 * carta calcada de Najir, el doble fondo de la maleta).
 */
export function spot(
  deps: PerceptionDeps,
  location: LocationId,
  opts: { skill?: SkillId; difficulty?: Difficulty; bonus?: number; penalty?: number } = {},
): RollResult | null {
  const skill = opts.skill ?? 'Descubrir'
  const searcher = bestAt(deps.party, location, skill)
  if (!searcher) return null
  return roll(deps.rng, searcher.skills[skill] ?? 20, {
    difficulty: opts.difficulty ?? 'regular',
    bonus: opts.bonus ?? 0,
    penalty: (opts.penalty ?? 0) + madnessPenalty(searcher),
    label: `${searcher.name}: ${skill}`,
  })
}
