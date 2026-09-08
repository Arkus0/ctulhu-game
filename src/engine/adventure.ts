import type { Difficulty, RollResult } from './rules'
import type { Condition } from './types'

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
  /**
   * La linea de la barra OBJETIVO: que hay que decidir aqui, en una frase.
   * Es un rotulo de interfaz y compite con la lamina por el alto de pantalla,
   * asi que no admite prosa. La prosa es `body`.
   */
  objective: string
  /**
   * La descripcion de la escena, que se narra en el cuadro de texto cuando la
   * escena se abre. Ahi puede respirar: es donde se lee todo lo demas.
   */
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
  objective: string
  body: string
  art?: string
  actions: SceneActionDef[]
}

export interface PartyExchangeDef {
  id: string
  trigger: string
  /**
   * Condiciones para que este intercambio sea el que salte. Permite escribir varias
   * versiones del mismo disparador: lo que se dicen tras fallar una tirada no es lo
   * mismo si Weder ya os ha visto la cara que si todavia no.
   */
  requires?: Condition[]
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
    partialReport:
      '«La 204, padre e hija, y en el motivo de la estancia una sola palabra: negocios. Eso es todo lo que he podido leer sin que el recepcionista cerrara el libro. —Se quita los guantes y los dobla—. Lo raro no es la palabra. Es que sea la única línea de esa página escrita con prisa.»',
    fullReport:
      '«He comparado las cuatro páginas de esta semana. Todas las entradas del turno de noche las escribe la misma mano, inclinada, con la e cerrada. La de los Lounpeen no. —Nadia deja el guante sobre la mesa como si señalara algo—. Y la hija preguntó por el bar antes de soltar la pluma, según el botones. Alguien inscribió a esa familia fuera de turno y quiso que pareciera rutina. En un hotel, corregir la memoria cuesta dinero.»',
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
    partialReport:
      '«Hay nueve piezas en el salón Ali Bey y no forman una colección: forman un lote. —Nadia se frota el pulgar contra el índice, quitándose polvo—. Un hotel que decora compra cosas que peguen entre sí. Esto es lo que cabía en una caja.»',
    fullReport:
      '«Los sellos de aduana están rotos, no despegados: rotos con la uña, deprisa. —Habla más bajo de lo que ha hablado en toda la mañana—. Y en la mesa larga hay un cerco de polvo circular, de un palmo, con el borde limpio por los cuatro sitios donde lo han agarrado para levantarlo. Eso no se mueve una vez. Eso se mueve muchas veces. Y ninguna de esas piezas ha salido legalmente de Egipto, por si a alguien le interesa el detalle.»',
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
    partialReport:
      '«Cerraron algo, seguro. Carter le dio la mano a Weder sin mirarle a la cara, que es como se cierra lo que no gusta. —Vance se sienta sin que nadie se lo ofrezca—. Después Weder se levantó y fue derecho a buscar al jefe de cocina. No a comer.»',
    fullReport:
      '«Weder tardó cuarenta minutos en levantarse de la mesa de Carter y once segundos en encontrar al jefe de cocina, así que sabía dónde estaba. —Vance cuenta con dos dedos—. Bajaron por una puerta de servicio del ala norte. Se lo pregunté a un camarero y me contestó otro, lo cual ya me dice bastante. Esa puerta no sale en ningún plano que le enseñen a un huésped.»',
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
    partialReport:
      '«Hay una escalera detrás del cuarto frío. Está abierta, pero no está libre: el cocinero mira quién baja. —Se limpia las manos en el pantalón—. Puedo pasar. Prefiero saber antes qué hago si me ven.»',
    fullReport:
      '«El pasador es de los viejos, se corre desde dentro y desde fuera si sabes dónde apoyar. Lo he dejado como estaba. —Vance abre la mano y enseña una costra de barro seco—. Esto lo he cogido del cuarto escalón. Barro. En un hotel con cocina de mármol, a treinta grados y sin llover desde marzo. Eso viene de más abajo que el sótano, y alguien lo sube todos los días.»',
    partialFacts: ['ruta_servicio_al_sotano'],
    fullFacts: ['ruta_servicio_al_sotano', 'pasador_servicio_preparado'],
    partialJournal: ['informe_rutas_servicio'],
    fullJournal: ['informe_rutas_servicio'],
    reportArt: 'escena_informe_vance',
  },
]
