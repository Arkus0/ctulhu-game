/**
 * Diálogo.
 *
 * El módulo no trae árboles de conversación. Trae, para cada PNJ, tres cosas:
 * qué sabe ("Datos y pistas"), cómo hay que tratarle ("Ganchos de
 * interpretación") y qué tirada hace falta para sacárselo. Copiar eso a un árbol
 * ramificado escrito a mano seria traicionarlo, y ademas no escalaria a los
 * cuarenta y cinco personajes del libro.
 *
 * De modo que el sistema tiene DOS EJES:
 *
 *   TEMA          de qué quieres hablar
 *   APROXIMACIÓN  cómo lo planteas: adular, presionar, sobornar, ir de frente
 *
 * La aproximación elige la habilidad social y enciende o apaga los ganchos del
 * personaje. Adular a Carter da un dado de bonificación porque desprecia a los
 * demás y le encanta que se lo reconozcan; mencionarle la Hermandad del Faraón
 * Negro le vuelve paranoico y además avisa a Weder. Llamar "Príncipe" a Fuad,
 * que es Rey desde marzo, puede terminar con el grupo detenido.
 *
 * El nivel de éxito decide cuánto sueltan, no si sueltan: casi siempre hay una
 * respuesta, aunque sea una evasiva reveladora. Fallar hacia delante.
 */
import { Rng } from './rng'
import { Outcome, roll, type Difficulty, type RollResult } from './rules'
import { madnessPenalty } from './sanity'
import type { Party } from './party'
import type {
  Condition,
  Effect,
  FactId,
  NpcDef,
  NpcHook,
  NpcId,
  SkillId,
} from './types'
import type { WorldState } from './worldstate'

/** Cómo se plantea la pregunta. Cada una tiene su habilidad y su riesgo. */
export interface Approach {
  id: string
  label: string
  skill: SkillId
  /** Descripción corta para la interfaz. */
  hint: string
}

export const APPROACHES: Record<string, Approach> = {
  directo: {
    id: 'directo',
    label: 'Preguntar sin rodeos',
    skill: 'Persuasion',
    hint: 'Honesto y sin trampa. Funciona con quien no tiene nada que esconder.',
  },
  adular: {
    id: 'adular',
    label: 'Adular',
    skill: 'Encanto',
    hint: 'Darle la razón y algo más. Los vanidosos se abren como una nuez.',
  },
  enganar: {
    id: 'enganar',
    label: 'Fingir ser otro',
    skill: 'Charlateria',
    hint: 'Mentir con aplomo. Si te pillan, ya no hay marcha atrás.',
  },
  presionar: {
    id: 'presionar',
    label: 'Presionar',
    skill: 'Intimidar',
    hint: 'Apretar. Rápido y sucio, y te ganas un enemigo.',
  },
  sobornar: {
    id: 'sobornar',
    label: 'Untar',
    skill: 'Credito',
    hint: 'En El Cairo casi todo tiene precio, y casi siempre es bajo.',
  },
}

/** Respuesta a un nivel de éxito concreto. */
export interface DialogueResponse {
  text: string
  effects?: Effect[]
  /** Hechos que el grupo aprende con esta respuesta. */
  facts?: FactId[]
  /** Temas que se desbloquean al oír esto. */
  unlocks?: string[]
}

export interface DialogueTopic {
  id: string
  npc: NpcId
  /** Lo que lee el jugador en la lista de opciones. */
  label: string
  /** Condiciones para que el tema aparezca siquiera. */
  requires?: Condition[]
  /** Aproximaciones permitidas. Si no se indica, todas. */
  approaches?: string[]
  /** Tirada exigida. Sin ella, el PNJ responde sin más. */
  check?: { difficulty?: Difficulty; skill?: SkillId }
  /** Si es verdadero, solo se puede preguntar una vez. */
  once?: boolean
  /**
   * Si es verdadero, el tema no aparece hasta que otra respuesta lo desbloquea
   * con `unlocks`. Sirve para las preguntas que solo se te ocurren despues de
   * haber oido algo: no puedes preguntarle a Behler por el Viejo Templo antes
   * de saber que existe un Viejo Templo.
   */
  locked?: boolean
  minutes?: number

  /** Respuestas por nivel. Se busca de arriba abajo hasta encontrar una. */
  onCritical?: DialogueResponse
  onExtreme?: DialogueResponse
  onHard?: DialogueResponse
  onSuccess?: DialogueResponse
  onFailure?: DialogueResponse
  onFumble?: DialogueResponse
  /** Respuesta si el tema no lleva tirada. */
  always?: DialogueResponse

  note?: string
}

export interface AskResult {
  topic: DialogueTopic
  approach: Approach | null
  roll: RollResult | null
  response: DialogueResponse
  /** Ganchos que se han aplicado, para poder explicárselo al jugador. */
  hooksApplied: NpcHook[]
  /** Cambio de humor del PNJ tras la pregunta. */
  dispositionDelta: number
  minutes: number
  /** Efectos de Cordura o daño que debe resolver quien llama. */
  deferred: Effect[]
}

export class DialogueEngine {
  private asked = new Set<string>()
  private unlocked = new Set<string>()

  constructor(
    private readonly rng: Rng,
    private readonly world: WorldState,
    private readonly party: Party,
    private readonly topics: Map<string, DialogueTopic>,
    private readonly npcs: Map<NpcId, NpcDef>,
  ) {}

  /** Temas disponibles ahora mismo con un PNJ. */
  available(npc: NpcId): DialogueTopic[] {
    return [...this.topics.values()].filter(
      (t) =>
        t.npc === npc &&
        !(t.once && this.asked.has(t.id)) &&
        (!t.locked || this.unlocked.has(t.id)) &&
        this.world.testAll(t.requires),
    )
  }

  /** Abre un tema cerrado. Lo llaman las respuestas con `unlocks`. */
  unlock(topicId: string): void {
    this.unlocked.add(topicId)
  }

  /** Aproximaciones que admite un tema. */
  approachesFor(topic: DialogueTopic): Approach[] {
    const ids = topic.approaches ?? Object.keys(APPROACHES)
    return ids.map((id) => APPROACHES[id]).filter((a): a is Approach => a !== undefined)
  }

  hasAsked(topicId: string): boolean {
    return this.asked.has(topicId)
  }

  /**
   * Calcula los dados de bonificación y penalización que aporta el carácter del
   * PNJ para una aproximación concreta. Es aquí donde viven los ganchos de
   * interpretación del libro, y por eso son datos y no código.
   */
  hooksFor(npc: NpcId, approach: Approach, skill: SkillId): { bonus: number; penalty: number; applied: NpcHook[] } {
    const def = this.npcs.get(npc)
    let bonus = 0
    let penalty = 0
    const applied: NpcHook[] = []

    for (const hook of def?.hooks ?? []) {
      if (hook.approach !== approach.id) continue
      if (hook.skills && hook.skills.length > 0 && !hook.skills.includes(skill)) continue
      if (!this.world.testAll(hook.requires)) continue
      bonus += hook.bonus ?? 0
      penalty += hook.penalty ?? 0
      applied.push(hook)
    }

    // El humor del PNJ pesa: quien te odia no te cuenta nada.
    if (this.world.hasNpc(npc)) {
      const d = this.world.npc(npc).disposition
      if (d >= 50) bonus += 1
      else if (d <= -50) penalty += 1
      // Y si te ha pillado espiándole, desconfía de todo lo que digas.
      if (this.world.npc(npc).suspicious) penalty += 1
    }

    return { bonus, penalty, applied }
  }

  /**
   * Preguntar. Devuelve la respuesta, la tirada y lo que ha cambiado.
   */
  ask(topicId: string, approachId = 'directo'): AskResult {
    const topic = this.topics.get(topicId)
    if (!topic) throw new Error(`Tema de conversación desconocido: "${topicId}"`)

    const approach = APPROACHES[approachId] ?? APPROACHES['directo']!
    this.asked.add(topic.id)

    // Tema sin tirada: el PNJ responde y ya está.
    if (!topic.check) {
      const response = topic.always ?? topic.onSuccess ?? { text: '(silencio)' }
      return this.finish(topic, null, null, response, [], 0)
    }

    const skill = topic.check.skill ?? approach.skill
    const speaker = this.bestSpeaker(topic.npc, skill)
    const { bonus, penalty, applied } = this.hooksFor(topic.npc, approach, skill)

    const r = roll(this.rng, speaker.skills[skill] ?? 5, {
      difficulty: topic.check.difficulty ?? 'regular',
      bonus,
      penalty: penalty + madnessPenalty(speaker),
      label: `${speaker.name}: ${skill}`,
    })

    const response = this.pickResponse(topic, r)

    // Coste social: presionar y mentir tienen precio aunque salgan bien.
    let delta = 0
    if (approach.id === 'presionar') delta -= r.success ? 5 : 15
    if (approach.id === 'enganar' && !r.success) delta -= 10
    if (approach.id === 'adular' && r.success) delta += 5
    if (approach.id === 'sobornar' && r.success) delta += 3
    if (r.outcome === Outcome.Fumble) delta -= 10
    for (const h of applied) if (h.penalty) delta -= 5

    return this.finish(topic, approach, r, response, applied, delta)
  }

  /**
   * Elige la respuesta segun lo bien que haya salido.
   *
   * Manda `r.success`, no `r.outcome`: un tema que exige exito dificil y saca
   * exito normal ES un fallo, aunque el d100 quedase por debajo de la
   * habilidad. Solo cuando se ha superado el liston se mira cuanto se ha
   * superado, y se cae hacia abajo hasta encontrar un texto escrito.
   */
  private pickResponse(topic: DialogueTopic, r: RollResult): DialogueResponse {
    const chain: (DialogueResponse | undefined)[] = []

    if (!r.success) {
      if (r.outcome === Outcome.Fumble) chain.push(topic.onFumble)
      chain.push(topic.onFailure)
    } else {
      if (r.outcome >= Outcome.Critical) chain.push(topic.onCritical)
      if (r.outcome >= Outcome.Extreme) chain.push(topic.onExtreme)
      if (r.outcome >= Outcome.Hard) chain.push(topic.onHard)
      chain.push(topic.onSuccess, topic.always)
    }

    for (const c of chain) if (c) return c
    return {
      text: r.success
        ? 'Responde, pero no dice nada que no supierais ya.'
        : 'Cambia de tema con una sonrisa educada.',
    }
  }

  private finish(
    topic: DialogueTopic,
    approach: Approach | null,
    r: RollResult | null,
    response: DialogueResponse,
    applied: NpcHook[],
    delta: number,
  ): AskResult {
    const deferred: Effect[] = []

    for (const fact of response.facts ?? []) this.world.learnFact(fact)
    for (const id of response.unlocks ?? []) this.unlock(id)
    for (const req of this.world.applyAll(response.effects)) {
      if (req.kind === 'defer') deferred.push(req.effect)
    }
    if (delta !== 0 && this.world.hasNpc(topic.npc)) {
      this.world.adjustDisposition(topic.npc, delta)
    }

    return {
      topic,
      approach,
      roll: r,
      response,
      hooksApplied: applied,
      dispositionDelta: delta,
      minutes: topic.minutes ?? 10,
      deferred,
    }
  }

  /** El miembro del grupo presente con mejor habilidad para esta conversación. */
  private bestSpeaker(npc: NpcId, skill: SkillId) {
    const location = this.world.hasNpc(npc)
      ? this.world.npc(npc).location
      : this.party.focus.location
    const here = this.party.at(location)
    const pool = here.length > 0 ? here : [this.party.focus]
    let best = pool[0]!
    for (const m of pool) if ((m.skills[skill] ?? 0) > (best.skills[skill] ?? 0)) best = m
    return best
  }

  snapshot(): { asked: string[]; unlocked: string[] } {
    return { asked: [...this.asked], unlocked: [...this.unlocked] }
  }

  restore(data: { asked: string[]; unlocked: string[] }): void {
    this.asked = new Set(data.asked)
    this.unlocked = new Set(data.unlocked)
  }
}

/** Baraja de rumores: se gasta, y los mejores están al final. */
export class RumorDeck {
  private used = new Set<number>()

  constructor(
    private readonly rng: Rng,
    private readonly rumors: string[],
  ) {}

  /**
   * Un PNJ suelta un rumor. Cada categoría tira un dado distinto: los personajes
   * más metidos en el ajo tiran 1D20 y por tanto alcanzan los rumores del final
   * de la lista, que son los buenos.
   */
  draw(die: number): { index: number; text: string } | null {
    const max = Math.min(die, this.rumors.length)
    const candidates: number[] = []
    for (let i = 0; i < max; i++) if (!this.used.has(i)) candidates.push(i)
    if (candidates.length === 0) return null

    const index = this.rng.pick(candidates)
    this.used.add(index)
    return { index, text: this.rumors[index]! }
  }

  get remaining(): number {
    return this.rumors.length - this.used.size
  }

  snapshot(): number[] {
    return [...this.used]
  }

  restore(used: number[]): void {
    this.used = new Set(used)
  }
}
