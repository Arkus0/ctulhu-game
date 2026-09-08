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
 * PERO EL SEGUNDO EJE NO SE LE PREGUNTA AL JUGADOR. Elegir el tono antes de cada
 * pregunta funciona en una mesa, donde se interpreta una vez; en un videojuego se
 * repite cuarenta veces por partida y casi siempre tiene una respuesta obvia. Así
 * que la elige `chooseApproach`: mira los ganchos del personaje, la habilidad de
 * quien tiene delante y lo que cuesta socialmente cada registro. El jugador solo
 * escoge la línea que dice, y después ve quién ha hablado, cómo, y qué gancho ha
 * saltado. Los datos no cambian: cambia quién decide.
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

/**
 * Cómo se cuenta en la narración que la pregunta se ha hecho de esta manera.
 * Sustituye al menú desaparecido: el jugador ya no elige el tono, pero tiene que
 * leerlo, porque es lo que explica el resultado del dado.
 */
export const APPROACH_NARRATION: Record<string, string> = {
  directo: 'lo pregunta sin rodeos',
  adular: 'lo envuelve en un halago y deja la pregunta dentro',
  enganar: 'lo pregunta como si ya supiera la respuesta',
  presionar: 'lo pregunta sin dejar salida',
  sobornar: 'lo pregunta con un billete doblado bajo el platillo',
}

/**
 * Ganchos del libro escritos con otro nombre.
 *
 * Las fichas de PNJ vienen del módulo, y el módulo dice "amenazar" donde el motor
 * dice "presionar", o "seducción" donde dice "adular". Sin este mapa esos ganchos
 * no se activaban nunca: quince de los cincuenta y uno eran contenido muerto.
 */
export const APPROACH_ALIASES: Record<string, string> = {
  amenazar: 'presionar',
  cortesia: 'directo',
  educacion: 'directo',
  seduccion: 'adular',
  invitar_copa: 'sobornar',
  debilidades: 'sobornar',
}

/**
 * Lo que cuesta socialmente cada registro, en puntos de habilidad equivalentes.
 *
 * Sirve para que el motor no aprieta a un hombre amable por un mísero dado de
 * bonificación: presionar cuesta relación aunque salga bien, mentir cuesta mucho
 * más cuando sale mal, y untar cuesta dinero y deja testigos.
 */
const SOCIAL_COST: Record<string, number> = {
  directo: 0,
  adular: 0,
  sobornar: 4,
  enganar: 8,
  presionar: 12,
}

/** Orden de desempate: a igualdad de números, la manera más limpia. */
const APPROACH_PREFERENCE = ['directo', 'adular', 'sobornar', 'enganar', 'presionar']

/** Lo que cuesta una pregunta que no declara su tiempo. El reloj es el antagonista:
 * ninguna opción puede ocultar lo que vale. */
export const DEFAULT_TOPIC_MINUTES = 10

/** Un dado de bonificación vale, a habilidad media, unos quince puntos de éxito. */
const DIE_WORTH = 15

/** Normaliza el nombre de gancho del libro al de una aproximación del motor. */
export function canonicalApproach(id: string): string {
  return APPROACH_ALIASES[id] ?? id
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
  /**
   * De qué va el tema, para los ganchos que no dependen del tono sino del asunto.
   * Carter da un dado de bonificación en cuanto se habla de egiptología y dos de
   * penalización en cuanto se menciona la Hermandad, se lo preguntes como se lo
   * preguntes. Esas etiquetas son las que llevan los `hooks` de `npcs.json`.
   */
  tags?: string[]
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
  /** Verdadero si la aproximación la ha escogido el motor y no quien llama. */
  approachChosenByEngine: boolean
  /** Quién del grupo ha llevado la conversación. Null en los temas sin tirada. */
  speakerName: string | null
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
   * Elige por el jugador cómo se plantea la pregunta.
   *
   * Puntúa cada aproximación permitida por lo que de verdad decide el resultado:
   * la habilidad de quien la llevaría, los dados que aportan los ganchos del PNJ y
   * lo que ese registro va a costar en relación. A igualdad, la manera más limpia.
   */
  chooseApproach(topic: DialogueTopic): Approach {
    const candidates = [...this.approachesFor(topic)].sort(
      (a, b) => preferenceIndex(a.id) - preferenceIndex(b.id),
    )
    let best = candidates[0] ?? APPROACHES['directo']!
    let bestScore = -Infinity

    for (const approach of candidates) {
      const skill = topic.check?.skill ?? approach.skill
      const speaker = this.bestSpeaker(topic.npc, skill)
      const { bonus, penalty } = this.hooksFor(topic.npc, approach, skill, topic.tags ?? [])
      const net = bonus - penalty - madnessPenalty(speaker)
      const score = (speaker.skills[skill] ?? 5) + DIE_WORTH * net - (SOCIAL_COST[approach.id] ?? 0)
      if (score > bestScore) {
        bestScore = score
        best = approach
      }
    }

    return best
  }

  /**
   * Calcula los dados de bonificación y penalización que aporta el carácter del
   * PNJ para una aproximación concreta. Es aquí donde viven los ganchos de
   * interpretación del libro, y por eso son datos y no código.
   */
  hooksFor(
    npc: NpcId,
    approach: Approach,
    skill: SkillId,
    tags: string[] = [],
  ): { bonus: number; penalty: number; applied: NpcHook[] } {
    const def = this.npcs.get(npc)
    let bonus = 0
    let penalty = 0
    const applied: NpcHook[] = []

    for (const hook of def?.hooks ?? []) {
      // Un gancho salta por tono (la aproximación, o el nombre que le da el libro)
      // o por asunto (la etiqueta del tema). Mahadni se cierra si le preguntas por
      // el sótano, lo hagas con una sonrisa o con un billete.
      const byApproach = canonicalApproach(hook.approach) === approach.id
      const byTag = tags.includes(hook.approach)
      if (!byApproach && !byTag) continue
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
  ask(topicId: string, approachId?: string): AskResult {
    const topic = this.topics.get(topicId)
    if (!topic) throw new Error(`Tema de conversación desconocido: "${topicId}"`)

    // Sin aproximación explícita decide el motor. Los tests y las escenas guiadas
    // pueden seguir forzando una concreta cuando el guion la exige.
    const chosenByEngine = approachId === undefined
    const approach = chosenByEngine
      ? this.chooseApproach(topic)
      : (APPROACHES[approachId] ?? APPROACHES['directo']!)
    this.asked.add(topic.id)

    // Tema sin tirada: el PNJ responde y ya está.
    if (!topic.check) {
      const response = topic.always ?? topic.onSuccess ?? { text: '(silencio)' }
      return this.finish(topic, null, null, response, [], 0, chosenByEngine, null)
    }

    const skill = topic.check.skill ?? approach.skill
    const speaker = this.bestSpeaker(topic.npc, skill)
    const { bonus, penalty, applied } = this.hooksFor(topic.npc, approach, skill, topic.tags ?? [])

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

    return this.finish(topic, approach, r, response, applied, delta, chosenByEngine, speaker.name)
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
    approachChosenByEngine: boolean,
    speakerName: string | null,
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
      approachChosenByEngine,
      speakerName,
      roll: r,
      response,
      hooksApplied: applied,
      dispositionDelta: delta,
      minutes: topic.minutes ?? DEFAULT_TOPIC_MINUTES,
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

function preferenceIndex(id: string): number {
  const index = APPROACH_PREFERENCE.indexOf(id)
  return index === -1 ? APPROACH_PREFERENCE.length : index
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
