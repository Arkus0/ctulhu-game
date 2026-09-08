import type { RollResult } from './rules'

export type LeadStatus = 'active' | 'completed' | 'missed' | 'locked'

export interface LeadView {
  id: string
  title: string
  detail: string
  status: LeadStatus
  deadline?: string
}

export type GuidedActionKind = 'act' | 'talk' | 'listen' | 'inspect'

export interface GuidedAction {
  id: string
  kind: GuidedActionKind
  label: string
  hint: string
  minutes?: number
  urgent?: boolean
}

export interface SceneActionDef extends GuidedAction {
  consequence: string
}

export interface SceneView {
  id: string
  title: string
  body: string
  actions: SceneActionDef[]
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
  report: string
  facts: string[]
  journal: string[]
}

export interface AssignmentState {
  id: string
  investigator: 'nadia' | 'vance'
  startedAt: number
  completesAt: number
  ready: boolean
  collected: boolean
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
  actionId: 'disk_authority' | 'disk_snatch'
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
    report:
      'Nadia ha encontrado una coincidencia incómoda: Dieter Lounpeen y su hija Olga ocupan la 204 y han escrito «negocios» como único motivo de estancia. Olga preguntó por el bar antes de soltar la pluma.',
    facts: ['registro_lounpeen_revisado'],
    journal: ['informe_registro_lounpeen'],
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
    report:
      'Nadia confirma que varias piezas del salón Ali Bey no pertenecen al hotel. Los sellos de inventario están rotos y una caja de madera labrada ha sido movida muchas veces.',
    facts: ['coleccion_sotano_irregular'],
    journal: ['informe_coleccion_sotano'],
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
    report:
      'Vance vio a Weder cerrar un trato con Carter y seguir después al jefe de cocina. Los dos bajaron por una puerta de servicio que el personal evita mencionar.',
    facts: ['vance_siguio_a_weder', 'ruta_servicio_al_sotano'],
    journal: ['informe_vance_weder'],
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
    report:
      'Vance ha localizado una escalera detrás de la cocina. El pasador es viejo, el tránsito frecuente y Mahadni controla quién baja. Hay barro seco de una galería mucho más antigua que el hotel.',
    facts: ['ruta_servicio_al_sotano'],
    journal: ['informe_rutas_servicio'],
  },
]
