import type { Difficulty, RollResult } from './rules'

export type LeadStatus = 'active' | 'completed' | 'missed'

export interface LeadView {
  id: string
  title: string
  detail: string
  status: LeadStatus
  deadline?: string
  anonymous?: boolean
}

export type GuidedActionKind = 'act' | 'talk' | 'listen' | 'inspect'

export interface GuidedAction {
  id: string
  kind: GuidedActionKind
  label: string
  hint: string
  minutes?: number
  urgent?: boolean
  consequence?: string
  risk?: string
  skill?: string
  difficulty?: Difficulty
  disabled?: boolean
}

export interface SceneActionDef extends GuidedAction {
  consequence: string
}

export interface SceneDef {
  id: string
  title: string
  body: string
  /**
   * Lamina propia de la escena, sin extension. Mientras la escena esta abierta
   * sustituye al fondo de la localizacion: la sala sigue siendo la misma, pero
   * lo que hay que mirar es lo que esta pasando en ella.
   */
  art?: string
  actions: SceneActionDef[]
}

export interface SceneView {
  id: string
  title: string
  body: string
  art?: string
  actions: SceneActionDef[]
}

export interface PartyExchangeDef {
  id: string
  trigger: string
  lines: { speaker: 'edith' | 'nadia' | 'vance'; text: string }[]
}

export interface AssignmentDef {
  id: string
  investigator: 'nadia' | 'vance'
  label: string
  brief: string
  location: string
  duration: number
  availableFrom: number
  availableUntil: number
  notReadyBefore?: number
  skill: string
  difficulty: Difficulty
  risk: string
  partialReport: string
  fullReport: string
  partialFacts: string[]
  fullFacts: string[]
  partialJournal: string[]
  fullJournal: string[]
  /** Lamina breve que acompana el informe al reunirse con el investigador. */
  reportArt?: string
}

export type AssignmentQuality = 'partial' | 'complete'

export interface AssignmentState {
  id: string
  investigator: 'nadia' | 'vance'
  startedAt: number
  completesAt: number
  ready: boolean
  collected: boolean
  quality: AssignmentQuality | null
  roll: RollResult | null
  extraLines: string[]
  extraFacts: string[]
  extraJournal: string[]
}

export interface CompanionView {
  id: string
  name: string
  location: string
  state: 'available' | 'working' | 'report_ready' | 'with_leader'
  assignment?: string
  readyAt?: string
  canCollect: boolean
  availableAssignments: AssignmentDef[]
}

export interface PendingRollView {
  actionId: string
  title: string
  stakes: string
  actorId: string
  actorName: string
  roll: RollResult
  luckCost: number | null
  canSpendLuck: boolean
}

export interface PendingRollState {
  actionId: string
  title: string
  stakes: string
  actorId: string
  roll: RollResult
}

export const ASSIGNMENTS: AssignmentDef[] = [
  {
    id: 'nadia_registro',
    investigator: 'nadia',
    label: 'Revisar el registro de huéspedes',
    brief: 'Cruzar llegadas, habitaciones y motivos de estancia con el personal de recepción.',
    location: 'conserjeria',
    duration: 35,
    availableFrom: 540,
    availableUntil: 690,
    skill: 'Descubrir',
    difficulty: 'regular',
    risk: 'Si fuerza demasiado la conversación, Clinton recordará la intromisión.',
    partialReport: 'Nadia confirma que Dieter Lounpeen y su hija Olga ocupan la 204 y escribieron «negocios» como único motivo de estancia.',
    fullReport: 'Nadia ha cruzado tinta, turnos y habitaciones: los Lounpeen ocupan la 204, Olga preguntó por el bar antes de soltar la pluma y su inscripción no sigue la mano del recepcionista de guardia.',
    partialFacts: ['registro_lounpeen_revisado'],
    fullFacts: ['registro_lounpeen_revisado', 'registro_lounpeen_irregular'],
    partialJournal: ['informe_registro_lounpeen'],
    fullJournal: ['informe_registro_lounpeen'],
    reportArt: 'escena_informe_nadia',
  },
  {
    id: 'nadia_coleccion',
    investigator: 'nadia',
    label: 'Catalogar la colección del sótano',
    brief: 'Examinar las piezas egipcias que Behler mantiene fuera del inventario público.',
    location: 'salon_ali_bey',
    duration: 45,
    availableFrom: 600,
    availableUntil: 720,
    skill: 'Arqueologia',
    difficulty: 'hard',
    risk: 'Mahadni sabrá que una especialista ha revisado las cajas.',
    partialReport: 'Nadia confirma que varias piezas del salón Ali Bey no pertenecen al hotel ni forman una colección coherente.',
    fullReport: 'Nadia confirma que las piezas no pertenecen al hotel: los sellos están rotos y el polvo dibuja el hueco reciente de un objeto circular trasladado muchas veces.',
    partialFacts: ['coleccion_sotano_irregular'],
    fullFacts: ['coleccion_sotano_irregular', 'objeto_circular_movido'],
    partialJournal: ['informe_coleccion_sotano'],
    fullJournal: ['informe_coleccion_sotano'],
    reportArt: 'escena_informe_nadia',
  },
  {
    id: 'vance_terraza',
    investigator: 'vance',
    label: 'Vigilar a Carter y Weder',
    brief: 'Mantener distancia, anotar contactos y seguir al alemán si abandona la terraza.',
    location: 'terraza',
    duration: 45,
    availableFrom: 540,
    availableUntil: 720,
    notReadyBefore: 730,
    skill: 'Sigilo',
    difficulty: 'regular',
    risk: 'Un fallo hará que Weder reconozca la vigilancia.',
    partialReport: 'Vance vio a Weder cerrar un trato con Carter y buscar después al jefe de cocina.',
    fullReport: 'Vance vio a Weder cerrar el trato, seguir a Mahadni y bajar por una puerta de servicio que el personal evita mencionar.',
    partialFacts: ['vance_siguio_a_weder', 'weder_y_carter_se_reunen'],
    fullFacts: ['vance_siguio_a_weder', 'weder_y_carter_se_reunen', 'ruta_servicio_al_sotano'],
    partialJournal: ['informe_vance_weder'],
    fullJournal: ['informe_vance_weder', 'informe_rutas_servicio'],
    reportArt: 'escena_informe_vance',
  },
  {
    id: 'vance_servicio',
    investigator: 'vance',
    label: 'Reconocer las rutas de servicio',
    brief: 'Localizar accesos discretos, llaves y turnos del personal entre cocina y sótano.',
    location: 'cocina',
    duration: 40,
    availableFrom: 540,
    availableUntil: 705,
    skill: 'Cerrajeria',
    difficulty: 'regular',
    risk: 'El ruido puede alertar al personal de cocina.',
    partialReport: 'Vance ha localizado una escalera detrás de la cocina. Mahadni controla quién baja.',
    fullReport: 'Vance ha localizado la escalera, ha estudiado el pasador y sabe cómo cruzarlo sin dejar a nadie encerrado. El barro seco procede de galerías más antiguas que el hotel.',
    partialFacts: ['ruta_servicio_al_sotano'],
    fullFacts: ['ruta_servicio_al_sotano', 'pasador_servicio_preparado'],
    partialJournal: ['informe_rutas_servicio'],
    fullJournal: ['informe_rutas_servicio'],
    reportArt: 'escena_informe_vance',
  },
]
