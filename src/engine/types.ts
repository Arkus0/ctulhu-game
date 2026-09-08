/**
 * Tipos del dominio. Todo el contenido JSON valida contra estas formas, asi que
 * este fichero es el contrato entre el motor y los ficheros de `src/content`.
 */

export type LocationId = string
export type NpcId = string
export type ActorId = string // investigador o PNJ: ambos ocupan localizaciones
export type FlagId = string
export type ItemId = string
export type EventId = string
export type FactId = string
export type SceneId = string
export type SkillId = string

/** Las ocho caracteristicas de 7a edicion. */
export interface Characteristics {
  FUE: number
  CON: number
  TAM: number
  DES: number
  INT: number
  APA: number
  POD: number
  EDU: number
}

export const CHARACTERISTIC_IDS: readonly (keyof Characteristics)[] = [
  'FUE',
  'CON',
  'TAM',
  'DES',
  'INT',
  'APA',
  'POD',
  'EDU',
]

export type ActorStatus =
  | 'ok'
  | 'unconscious'
  | 'dead'
  | 'detained' // el detective del hotel o la policia se lo han llevado
  | 'fled' // ha abandonado el Shepheard's
  | 'insane'

/** Un episodio de locura en curso. */
export interface MadnessBout {
  kind: 'temporary' | 'indefinite'
  /** Identificador de la manifestacion en la tabla de crisis. */
  effect: string
  description: string
  /** Minuto absoluto en el que remite. */
  until: number
}

export interface Investigator {
  id: string
  name: string
  occupation: string
  /** Frase de presentacion, para la ficha. */
  blurb: string
  chars: Characteristics
  skills: Record<SkillId, number>

  hp: number
  hpMax: number
  san: number
  sanMax: number
  /** Cordura al empezar el dia: base del umbral de locura indefinida. */
  sanAtDayStart: number
  mp: number
  mpMax: number
  luck: number

  location: LocationId
  status: ActorStatus
  madness: MadnessBout | null
  phobias: string[]
  manias: string[]

  /** Lo que este investigador sabe. El conocimiento es por personaje. */
  knows: FactId[]
  inventory: ItemId[]
  /** Cordura perdida hoy, para el umbral de locura indefinida. */
  sanLostToday: number
}

/** Bonificacion de dano y corpulencia derivadas de FUE + TAM. */
export interface Build {
  damageBonus: string
  build: number
}

export function deriveBuild(chars: Characteristics): Build {
  const sum = chars.FUE + chars.TAM
  if (sum <= 64) return { damageBonus: '-2', build: -2 }
  if (sum <= 84) return { damageBonus: '-1', build: -1 }
  if (sum <= 124) return { damageBonus: '0', build: 0 }
  if (sum <= 164) return { damageBonus: '1D4', build: 1 }
  if (sum <= 204) return { damageBonus: '1D6', build: 2 }
  return { damageBonus: '2D6', build: 3 }
}

export function deriveHpMax(chars: Characteristics): number {
  return Math.floor((chars.CON + chars.TAM) / 10)
}

export function deriveMpMax(chars: Characteristics): number {
  return Math.floor(chars.POD / 5)
}

/**
 * Movimiento base segun FUE, DES y TAM. La edad lo modifica en el reglamento;
 * aqui no hace falta porque los investigadores son pregenerados.
 */
export function deriveMove(chars: Characteristics): number {
  const { FUE, DES, TAM } = chars
  if (FUE < TAM && DES < TAM) return 7
  if (FUE > TAM && DES > TAM) return 9
  return 8
}

/** Disposicion de un PNJ hacia el grupo, de -100 (te quiere muerto) a 100. */
export type Disposition = number

export interface NpcState {
  id: NpcId
  location: LocationId
  status: ActorStatus
  disposition: Disposition
  /** Hechos que este PNJ conoce y puede contar. */
  knows: FactId[]
  hp: number
  /** Rumores de la lista general que este PNJ ya ha soltado. */
  rumorsTold: number[]
  /** Verdadero si ha pillado al grupo espiandole. */
  suspicious: boolean
}

/** Ficha estatica de un PNJ, cargada del JSON de contenido. */
export interface NpcDef {
  id: NpcId
  name: string
  age?: number
  title: string
  /** Retrato en `public/art`, sin extension. */
  portrait?: string
  chars: Partial<Characteristics>
  skills: Record<SkillId, number>
  hp?: number
  /** Disposicion inicial hacia el grupo. */
  disposition?: Disposition
  /** Que sabe de entrada. */
  knows?: FactId[]
  /**
   * Ganchos de interpretacion: modificadores contextuales a las tiradas
   * sociales. Son el alma de los PNJ del modulo y por eso son datos, no codigo.
   */
  hooks?: NpcHook[]
  /** Dado que tira en la lista de rumores: 6, 10 o 20. */
  rumorDie?: number
  notes?: string
}

/**
 * Un gancho de interpretacion. Ejemplos literales del libro:
 *  - Carter: adularle descaradamente da un dado de bonificacion.
 *  - Carnarvon: es sordo y miope, asi que enganarle es mas facil.
 *  - Fuad: llamarle "Principe" en vez de "Rey" puede acabar en arresto.
 *  - Weder presentandote a Shakti: dos dados de penalizacion con el brujo.
 */
export interface NpcHook {
  id: string
  /** Etiqueta de aproximacion que activa el gancho, p.ej. "adular", "amenazar". */
  approach: string
  /** Habilidades afectadas. Vacio significa todas las sociales. */
  skills?: SkillId[]
  bonus?: number
  penalty?: number
  /** Condiciones para que el gancho este activo. */
  requires?: Condition[]
  /** Texto que se muestra al jugador cuando se aplica. */
  note?: string
}

export const SOCIAL_SKILLS: readonly SkillId[] = [
  'Charlataneria',
  'Encanto',
  'Intimidar',
  'Persuasion',
]

/* ------------------------------------------------------------------ *
 * Condiciones y efectos: el lenguaje declarativo del contenido.
 * El scheduler y los dialogos comparten estas dos formas para que Sonnet
 * pueda escribir eventos y conversaciones sin tocar TypeScript.
 * ------------------------------------------------------------------ */

export type Condition =
  | { kind: 'flag'; flag: FlagId; value?: boolean }
  | { kind: 'counter'; counter: string; op: '<' | '<=' | '=' | '>=' | '>'; value: number }
  | { kind: 'custody'; item: ItemId; holder: ActorId | 'player' | 'nobody' }
  | { kind: 'npcStatus'; npc: NpcId; status: ActorStatus | ActorStatus[] }
  | { kind: 'npcAlive'; npc: NpcId }
  | { kind: 'disposition'; npc: NpcId; op: '<' | '<=' | '>=' | '>'; value: number }
  | { kind: 'partyAt'; location: LocationId }
  | { kind: 'anyoneAt'; location: LocationId }
  | { kind: 'knows'; fact: FactId; who?: ActorId }
  | { kind: 'hasItem'; item: ItemId }
  | { kind: 'timeBefore'; minute: number }
  | { kind: 'timeAfter'; minute: number }
  | { kind: 'eventFired'; event: EventId }
  | { kind: 'eventCancelled'; event: EventId }
  | { kind: 'chance'; percent: number }
  | { kind: 'not'; of: Condition }
  | { kind: 'all'; of: Condition[] }
  | { kind: 'any'; of: Condition[] }

export type Effect =
  | { kind: 'setFlag'; flag: FlagId; value?: boolean }
  | { kind: 'addCounter'; counter: string; by: number }
  | { kind: 'moveCustody'; item: ItemId; to: ActorId | 'player' | 'nobody' }
  | { kind: 'moveNpc'; npc: NpcId; to: LocationId }
  | { kind: 'setNpcStatus'; npc: NpcId; status: ActorStatus }
  | { kind: 'adjustDisposition'; npc: NpcId; by: number }
  /**
   * Cambia el estado de un investigador por decision del contenido (detenido,
   * huido, enloquecido para siempre...), sin pasar por danno o Cordura.
   * 'random' elige a uno al azar entre los presentes: lo usan sucesos como el
   * cuadro de Pnakotus, donde el libro pide "el Guardian lanza un dado para
   * ver a cual investigador atacan los tentaculos" y aqui no hay Guardian.
   */
  | { kind: 'setInvestigatorStatus'; who: ActorId | 'random'; status: ActorStatus }
  | { kind: 'learnFact'; fact: FactId; who?: ActorId }
  | { kind: 'npcLearnsFact'; npc: NpcId; fact: FactId }
  | { kind: 'giveItem'; item: ItemId }
  | { kind: 'removeItem'; item: ItemId }
  | { kind: 'sanityLoss'; loss: string; who?: ActorId }
  | { kind: 'damage'; amount: string; who?: ActorId }
  | { kind: 'adjustLuck'; by: number; who?: ActorId }
  | { kind: 'cancelEvent'; event: EventId }
  | { kind: 'rescheduleEvent'; event: EventId; deltaMinutes: number }
  | { kind: 'scheduleEvent'; event: EventId; atMinute: number }
  | { kind: 'unlockJournal'; entry: string }
  | { kind: 'log'; text: string }

/* ------------------------------------------------------------------ *
 * Localizaciones
 * ------------------------------------------------------------------ */

export interface LocationDef {
  id: LocationId
  /** Numero de localizacion del libro, p.ej. "L1", para poder cotejar. */
  ref?: string
  name: string
  /** Planta: 'terraza' | 'baja' | '1' .. '4' | 'sotano' | 'templo'. */
  floor: string
  /** Fondo en `public/art`, sin extension. */
  art?: string
  description: string
  /** Descripcion alternativa segun condiciones (de noche, tras el robo...). */
  variants?: { requires: Condition[]; description: string; art?: string }[]
  /** Salidas: destino y minutos que cuesta llegar. */
  exits: { to: LocationId; minutes: number; requires?: Condition[]; label?: string }[]
  /** Cosas examinables que no son PNJ. */
  features?: LocationFeature[]
  /** Verdadero si entrar exige sigilo o llave. */
  restricted?: boolean
}

export interface LocationFeature {
  id: string
  name: string
  description: string
  requires?: Condition[]
  /** Tirada necesaria para sacar algo en claro. */
  check?: { skill: SkillId; difficulty?: 'regular' | 'hard' | 'extreme' }
  onSuccess?: Effect[]
  onFailure?: Effect[]
  successText?: string
  failureText?: string
  minutes?: number
}
