/**
 * Carga y validacion del contenido.
 *
 * Todo el contenido vive en JSON para que se pueda escribir en masa. El precio
 * de esa comodidad es que un identificador mal escrito no lo detecta el
 * compilador, asi que lo detecta esto: la validacion cruza todas las
 * referencias y falla con un mensaje que dice exactamente donde esta el fallo.
 * Sin esto, un dia habra una salida que apunta a una habitacion inexistente y
 * se descubrira jugando.
 */
import { APPROACHES, canonicalApproach, type DialogueTopic } from '../engine/dialogue'
import type { ConversationDef } from '../engine/perception'
import type { EventDef } from '../engine/scheduler'
import type { InvestigatorDef } from '../engine/party'
import type { Difficulty } from '../engine/rules'
import type { Characteristics, Effect, LocationDef, NpcDef, NpcId, SkillId } from '../engine/types'
import type { PartyExchangeDef, SceneDef } from '../engine/adventure'

import locationsJson from './locations.json'
import npcsJson from './npcs.json'
import investigatorsJson from './investigators.json'
import conversationsJson from './conversations.json'
import day1Json from './events/day1.json'
import dialogueBehlerJson from './dialogue/behler.json'
import dialogueClintonJson from './dialogue/clinton.json'
import dialogueCarterJson from './dialogue/carter.json'
import dialogueWederJson from './dialogue/weder.json'
import dialogueGaspariniJson from './dialogue/gasparini.json'
import dialogueOlgaJson from './dialogue/olga.json'
import dialogueDieterJson from './dialogue/dieter.json'
import dialogueMahadniJson from './dialogue/mahadni.json'
import dialogueThornhillJson from './dialogue/thornhill.json'
import dialogueRollandJson from './dialogue/rolland.json'
import dialogueMeyerJson from './dialogue/meyer.json'
import dialogueEvelynJson from './dialogue/evelyn.json'
import dialogueCarnarvonJson from './dialogue/carnarvon.json'
import dialogueNajirJson from './dialogue/najir.json'
import rumorsJson from './rumors.json'
import luctuousJson from './luctuous.json'
import randomNpcsJson from './random_npcs.json'
import artifactsJson from './artifacts.json'
import scenesJson from './scenes.json'
import partyExchangesJson from './party_exchanges.json'
import mapArtJson from './map_art.json'

export interface MapArtDef {
  default: string
  rules: { art: string; floors: string[] }[]
}

/** Un suceso de la Lista de eventos luctuosos (1D100), pag. 146 del modulo. */
export interface LuctuousEventDef {
  id: string
  /** Rango del 1D100 que saca este suceso. */
  range: { min: number; max: number }
  text: string
  /** Efectos que se aplican siempre, solo por presenciar el suceso. */
  effects: Effect[]
  /**
   * Tirada opcional que decide un tramo adicional del suceso (una escalada,
   * un secuestro...). Mismo patron que `LocationFeature.check`: sin Guardian
   * que lo adjudique a ojo, esto tiene que resolverse solo.
   */
  check?: { skill: SkillId; difficulty?: Difficulty }
  onSuccess?: Effect[]
  onFailure?: Effect[]
  note?: string
}

/** Un personaje concreto dentro de una categoria de la Lista de personajes aleatorios. */
export interface RandomNpcMember {
  name: string
  age?: number
  /** Descripcion condensada de su ficha en el libro. */
  note?: string
  /** Pagina del libro donde tiene una ficha propia que aun no vive en npcs.json. */
  bookRef?: string
  /** Si ya tiene ficha completa en npcs.json. */
  npc?: NpcId
}

/** Una categoria de la Lista de personajes aleatorios (pag. 130), con su propia sublista. */
export interface RandomNpcCategory {
  id: string
  label: string
  /** Dado para elegir un miembro concreto dentro de la categoria (6, 10, 12...). */
  memberDie: number
  /** Dado que el personaje lanza en la Lista de rumores. Ausente si el libro no da uno comun. */
  rumorDie?: number
  desc?: string
  note?: string
  members: RandomNpcMember[]
}

export interface RandomNpcTable {
  genericStatBlock: {
    label: string
    tagline?: string
    chars: Characteristics
    hp: number
    damageBonus: string
    build: number
    move: number
    mp: number
    combat: string[]
    skills: Record<string, string>
    languages?: Record<string, string>
  }
  /** La tabla maestra 1D20 de la pag. 130. */
  masterTable: { range: { min: number; max: number }; categories: string[]; note?: string }[]
  categories: RandomNpcCategory[]
}

/** Una de las piezas negras descritas en el capitulo 5 (Artefactos, pag. 112). */
export interface ArtifactDef {
  id: string
  name: string
  usedBy: string
  /** Localizacion donde se puede encontrar, si el libro la fija. */
  location?: string
  description: string
  powers: string
  /** Verdadero si el propio libro dice que no forma parte de la secuencia canonica. */
  extra?: boolean
  note?: string
}

export interface Content {
  locations: Map<string, LocationDef>
  npcs: Map<string, NpcDef>
  investigators: InvestigatorDef[]
  conversations: Map<string, ConversationDef>
  events: EventDef[]
  topics: Map<string, DialogueTopic>
  /** Habilidades de los PNJ, en el formato que espera perception.ts. */
  npcSkills: Record<string, Record<string, number>>
  /** Los 20 rumores de la Lista de rumores, en orden: los mejores al final. */
  rumors: string[]
  luctuousEvents: LuctuousEventDef[]
  randomNpcs: RandomNpcTable
  artifacts: Map<string, ArtifactDef>
  scenes: Map<string, SceneDef>
  partyExchanges: PartyExchangeDef[]
  mapArt: MapArtDef
}

export class ContentError extends Error {
  constructor(readonly problems: string[]) {
    super(`El contenido tiene ${problems.length} problema(s):\n  - ${problems.join('\n  - ')}`)
    this.name = 'ContentError'
  }
}

export function loadContent(): Content {
  const locations = locationsJson as unknown as LocationDef[]
  const npcs = npcsJson as unknown as NpcDef[]
  const investigators = investigatorsJson as unknown as InvestigatorDef[]
  const conversations = conversationsJson as unknown as ConversationDef[]
  const events = day1Json as unknown as EventDef[]
  // Un fichero por PNJ en cuanto un personaje pasa de unos pocos temas: la
  // seccion "Datos y pistas" de una sola ficha del modulo ya da quince o mas.
  const topics = [
    ...dialogueBehlerJson,
    ...dialogueClintonJson,
    ...dialogueCarterJson,
    ...dialogueWederJson,
    ...dialogueGaspariniJson,
    ...dialogueOlgaJson,
    ...dialogueDieterJson,
    ...dialogueMahadniJson,
    ...dialogueThornhillJson,
    ...dialogueRollandJson,
    ...dialogueMeyerJson,
    ...dialogueEvelynJson,
    ...dialogueCarnarvonJson,
    ...dialogueNajirJson,
  ] as unknown as DialogueTopic[]
  const rumors = rumorsJson as unknown as string[]
  const luctuousEvents = luctuousJson as unknown as LuctuousEventDef[]
  const randomNpcs = randomNpcsJson as unknown as RandomNpcTable
  const artifacts = artifactsJson as unknown as ArtifactDef[]
  const scenes = scenesJson as unknown as SceneDef[]
  const partyExchanges = partyExchangesJson as unknown as PartyExchangeDef[]
  const mapArt = mapArtJson as unknown as MapArtDef

  const problems = validate({
    locations,
    npcs,
    investigators,
    conversations,
    events,
    topics,
    rumors,
    luctuousEvents,
    randomNpcs,
    artifacts,
    scenes,
    partyExchanges,
    mapArt,
  })
  if (problems.length > 0) throw new ContentError(problems)

  const npcSkills: Record<string, Record<string, number>> = {}
  for (const n of npcs) npcSkills[n.id] = n.skills

  return {
    locations: new Map(locations.map((l) => [l.id, l])),
    npcs: new Map(npcs.map((n) => [n.id, n])),
    investigators,
    conversations: new Map(conversations.map((c) => [c.id, c])),
    events,
    topics: new Map(topics.map((t) => [t.id, t])),
    npcSkills,
    rumors,
    luctuousEvents,
    randomNpcs,
    artifacts: new Map(artifacts.map((a) => [a.id, a])),
    scenes: new Map(scenes.map((scene) => [scene.id, scene])),
    partyExchanges,
    mapArt,
  }
}

interface RawContent {
  locations: LocationDef[]
  npcs: NpcDef[]
  investigators: InvestigatorDef[]
  conversations: ConversationDef[]
  events: EventDef[]
  topics: DialogueTopic[]
  rumors?: string[]
  luctuousEvents?: LuctuousEventDef[]
  randomNpcs?: RandomNpcTable
  artifacts?: ArtifactDef[]
  scenes?: SceneDef[]
  partyExchanges?: PartyExchangeDef[]
  mapArt?: MapArtDef
}

/**
 * Cruza todas las referencias entre ficheros. Devuelve la lista completa de
 * problemas en vez de reventar en el primero: si Sonnet mete diez erratas,
 * conviene verlas todas de una vez.
 */
export function validate(c: RawContent): string[] {
  const problems: string[] = []

  if (!c.mapArt?.default) problems.push('El mapa no declara una lamina por defecto')
  for (const [index, rule] of (c.mapArt?.rules ?? []).entries()) {
    if (!rule.art || rule.floors.length === 0) problems.push(`La regla de mapa ${index + 1} esta incompleta`)
  }

  const locationIds = new Set<string>()

  // Habilidades que alguien del grupo puede tirar de verdad.
  const skillsDeLosInvestigadores = new Set(
    (c.investigators ?? []).flatMap((inv) => Object.keys(inv.skills ?? {})),
  )
  for (const l of c.locations) {
    if (locationIds.has(l.id)) problems.push(`Localizacion duplicada: "${l.id}"`)
    locationIds.add(l.id)
  }

  const npcIds = new Set<string>()
  for (const n of c.npcs) {
    if (npcIds.has(n.id)) problems.push(`PNJ duplicado: "${n.id}"`)
    npcIds.add(n.id)
  }

  // Salidas del mapa.
  for (const l of c.locations) {
    for (const e of l.exits ?? []) {
      if (!locationIds.has(e.to)) {
        problems.push(`"${l.id}" tiene una salida a "${e.to}", que no existe`)
      }
      if (!(e.minutes > 0)) {
        problems.push(`La salida de "${l.id}" a "${e.to}" no cuesta tiempo`)
      }
    }
    for (const f of l.features ?? []) {
      if (!f.id) problems.push(`Un detalle de "${l.id}" no tiene identificador`)
      // Una tirada contra una habilidad que ningun investigador tiene en su
      // ficha no la puede sacar nadie: el detalle queda escrito y muerto.
      // `Contabilidad` llego a estar asi, copiada de las fichas de PNJ.
      if (f.check && !skillsDeLosInvestigadores.has(f.check.skill)) {
        problems.push(
          `El detalle "${f.id}" de "${l.id}" pide ${f.check.skill}, que no tiene ningun investigador`,
        )
      }
    }
  }

  // Eventos.
  const eventIds = new Set<string>()
  const sceneIds = new Set<string>()
  for (const scene of c.scenes ?? []) {
    if (sceneIds.has(scene.id)) problems.push(`Escena duplicada: "${scene.id}"`)
    sceneIds.add(scene.id)
    if (!scene.title || !scene.body) problems.push(`La escena "${scene.id}" no tiene título o cuerpo`)
    // El objetivo va en una barra de una linea encima de la lamina: si crece,
    // le come alto de pantalla al arte. La descripcion larga es `body`.
    if (!scene.objective) problems.push(`La escena "${scene.id}" no declara objetivo`)
    else if (scene.objective.length > 90) {
      problems.push(`El objetivo de "${scene.id}" tiene ${scene.objective.length} caracteres; el máximo es 90`)
    }
    const actionIds = new Set<string>()
    for (const action of scene.actions) {
      if (actionIds.has(action.id)) problems.push(`Acción duplicada "${action.id}" en la escena "${scene.id}"`)
      actionIds.add(action.id)
      if (!action.label || !action.consequence) problems.push(`La acción "${action.id}" de "${scene.id}" está incompleta`)
    }
    if (scene.actions.length < 2 || scene.actions.length > 4) {
      problems.push(`La escena "${scene.id}" debe ofrecer entre dos y cuatro acciones`)
    }
  }

  for (const ev of c.events) {
    if (eventIds.has(ev.id)) problems.push(`Evento duplicado: "${ev.id}"`)
    eventIds.add(ev.id)

    if (!locationIds.has(ev.location)) {
      problems.push(`El evento "${ev.id}" ocurre en "${ev.location}", que no existe`)
    }
    for (const a of ev.actors ?? []) {
      if (!npcIds.has(a)) problems.push(`El evento "${ev.id}" usa al PNJ "${a}", que no existe`)
    }
    for (const tr of ev.traces ?? []) {
      if (tr.location && !locationIds.has(tr.location)) {
        problems.push(`El rastro "${tr.id}" de "${ev.id}" apunta a "${tr.location}", que no existe`)
      }
      if (tr.teller && !npcIds.has(tr.teller)) {
        problems.push(`El rastro "${tr.id}" de "${ev.id}" lo cuenta "${tr.teller}", que no existe`)
      }
    }
    if (!/^[Dd]\d\s+\d{1,2}:\d{2}$/.test(ev.at)) {
      problems.push(`El evento "${ev.id}" tiene una hora rara: "${ev.at}"`)
    }
    if (ev.scene && !sceneIds.has(ev.scene)) {
      problems.push(`El evento "${ev.id}" usa la escena "${ev.scene}", que no existe`)
    }
    if (ev.scene && ev.interruptibleBy) {
      const scene = (c.scenes ?? []).find((item) => item.id === ev.scene)
      const actions = new Set(scene?.actions.map((action) => action.id) ?? [])
      for (const action of ev.interruptibleBy) {
        if (!actions.has(action)) problems.push(`El evento "${ev.id}" permite la acción inexistente "${action}"`)
      }
    }
  }

  // Referencias cruzadas entre eventos.
  for (const ev of c.events) {
    for (const id of ev.cancels ?? []) {
      if (!eventIds.has(id)) {
        problems.push(`El evento "${ev.id}" cancela "${id}", que no existe`)
      }
    }
    for (const ref of referencedEvents(ev)) {
      if (!eventIds.has(ref)) {
        problems.push(`El evento "${ev.id}" hace referencia a "${ref}", que no existe`)
      }
    }
  }

  // Conversaciones.
  const convIds = new Set<string>()
  for (const conv of c.conversations) {
    if (convIds.has(conv.id)) problems.push(`Conversacion duplicada: "${conv.id}"`)
    convIds.add(conv.id)

    if (!locationIds.has(conv.location)) {
      problems.push(`La conversacion "${conv.id}" ocurre en "${conv.location}", que no existe`)
    }
    for (const p of conv.participants) {
      if (!npcIds.has(p)) {
        problems.push(`En la conversacion "${conv.id}" habla "${p}", que no existe`)
      }
    }
    if (conv.event && !eventIds.has(conv.event)) {
      problems.push(`La conversacion "${conv.id}" se ancla a "${conv.event}", que no existe`)
    }
    if (conv.fragments.length === 0) {
      problems.push(`La conversacion "${conv.id}" no tiene fragmentos`)
    }
    const fragIds = new Set<string>()
    for (const f of conv.fragments) {
      if (fragIds.has(f.id)) {
        problems.push(`Fragmento duplicado "${f.id}" en la conversacion "${conv.id}"`)
      }
      fragIds.add(f.id)
    }
  }

  // Temas de conversacion.
  const topicIds = new Set<string>()
  for (const t of c.topics) {
    if (topicIds.has(t.id)) problems.push(`Tema de dialogo duplicado: "${t.id}"`)
    topicIds.add(t.id)
    if (!npcIds.has(t.npc)) {
      problems.push(`El tema "${t.id}" se lo pregunta a "${t.npc}", que no existe`)
    }
    if (!t.label) problems.push(`El tema "${t.id}" no tiene etiqueta para el jugador`)

    const responses = [
      t.onCritical,
      t.onExtreme,
      t.onHard,
      t.onSuccess,
      t.onFailure,
      t.onFumble,
      t.always,
    ].filter((r) => r !== undefined)

    if (responses.length === 0) problems.push(`El tema "${t.id}" no tiene ninguna respuesta`)
    // Un tema con tirada necesita al menos que salga bien y que salga mal;
    // si no, el jugador tira los dados para nada.
    if (t.check && !t.onSuccess && !t.onHard && !t.onExtreme && !t.onCritical) {
      problems.push(`El tema "${t.id}" exige tirada pero no tiene respuesta de exito`)
    }
    if (t.check && !t.onFailure && !t.onFumble) {
      problems.push(`El tema "${t.id}" exige tirada pero no tiene respuesta de fallo`)
    }
    for (const a of t.approaches ?? []) {
      if (!(a in APPROACHES)) problems.push(`El tema "${t.id}" usa la aproximacion "${a}", que no existe`)
    }
  }

  // Los temas que se desbloquean tienen que existir.
  for (const t of c.topics) {
    const responses = [t.onCritical, t.onExtreme, t.onHard, t.onSuccess, t.onFailure, t.onFumble, t.always]
    for (const r of responses) {
      for (const u of r?.unlocks ?? []) {
        if (!topicIds.has(u)) problems.push(`El tema "${t.id}" desbloquea "${u}", que no existe`)
      }
    }
  }

  // Investigadores.
  if (c.investigators.length === 0) problems.push('No hay ningun investigador definido')
  const invIds = new Set<string>()
  for (const i of c.investigators) {
    if (invIds.has(i.id)) problems.push(`Investigador duplicado: "${i.id}"`)
    invIds.add(i.id)
  }

  // Rumores: el mazo (RumorDeck) los consume tal cual, en orden.
  for (const [i, r] of (c.rumors ?? []).entries()) {
    if (!r || !r.trim()) problems.push(`El rumor en la posicion ${i} esta vacio`)
  }

  // Eventos luctuosos: la tabla 1D100 tiene que quedar completa, sin huecos ni solapes.
  const luctuousEvents = c.luctuousEvents ?? []
  if (luctuousEvents.length > 0) {
    const luctuousIds = new Set<string>()
    for (const ev of luctuousEvents) {
      if (luctuousIds.has(ev.id)) problems.push(`Evento luctuoso duplicado: "${ev.id}"`)
      luctuousIds.add(ev.id)
      if (!(ev.range.min <= ev.range.max)) {
        problems.push(`El evento luctuoso "${ev.id}" tiene un rango invertido (${ev.range.min}-${ev.range.max})`)
      }
      if (!ev.text) problems.push(`El evento luctuoso "${ev.id}" no tiene texto`)
      if (ev.check && !ev.onSuccess && !ev.onFailure) {
        problems.push(`El evento luctuoso "${ev.id}" tiene tirada pero ninguna rama la usa`)
      }
    }
    for (const gap of rangeGaps(luctuousEvents.map((e) => e.range), 1, 100)) {
      problems.push(`La Lista de eventos luctuosos (1D100) ${gap}`)
    }
  }

  // Lista de personajes aleatorios: la tabla maestra (1D20) apunta a categorias reales.
  if (c.randomNpcs) {
    const rn = c.randomNpcs
    const categoryIds = new Set<string>()
    for (const cat of rn.categories) {
      if (categoryIds.has(cat.id)) problems.push(`Categoria de personaje aleatorio duplicada: "${cat.id}"`)
      categoryIds.add(cat.id)
      if (cat.members.length !== cat.memberDie) {
        problems.push(
          `La categoria "${cat.id}" declara memberDie ${cat.memberDie} pero tiene ${cat.members.length} miembro(s)`,
        )
      }
      for (const m of cat.members) {
        if (!m.name) problems.push(`Un miembro de la categoria "${cat.id}" no tiene nombre`)
        if (m.npc && !npcIds.has(m.npc)) {
          problems.push(`"${cat.id}" referencia al PNJ "${m.npc}", que no existe en npcs.json`)
        }
      }
    }
    for (const row of rn.masterTable) {
      for (const catId of row.categories) {
        if (!categoryIds.has(catId)) {
          problems.push(`La Lista de personajes aleatorios referencia la categoria "${catId}", que no existe`)
        }
      }
    }
    for (const gap of rangeGaps(rn.masterTable.map((r) => r.range), 1, 20)) {
      problems.push(`La Lista de personajes aleatorios (1D20) ${gap}`)
    }
  }

  // Artefactos.
  const artifactIds = new Set<string>()
  for (const art of c.artifacts ?? []) {
    if (artifactIds.has(art.id)) problems.push(`Artefacto duplicado: "${art.id}"`)
    artifactIds.add(art.id)
    if (!art.description) problems.push(`El artefacto "${art.id}" no tiene descripcion`)
    if (!art.powers) problems.push(`El artefacto "${art.id}" no tiene poderes`)
    if (art.location && !locationIds.has(art.location)) {
      problems.push(`El artefacto "${art.id}" se encuentra en "${art.location}", que no existe`)
    }
  }

  // Ganchos de PNJ. Un gancho que el motor no sabe activar es contenido muerto: se
  // escribio pensando en una mesa, no en este juego, y ahi se quedo. Se activan por
  // aproximacion (o por el nombre que le da el libro, via alias) o por la etiqueta
  // de un tema del propio PNJ. Un PNJ sin ningun tema escrito todavia queda exento:
  // su ficha va por delante de su dialogo y eso es legitimo.
  const topicTagsByNpc = new Map<string, Set<string>>()
  for (const t of c.topics) {
    const tags = topicTagsByNpc.get(t.npc) ?? new Set<string>()
    for (const tag of t.tags ?? []) tags.add(tag)
    topicTagsByNpc.set(t.npc, tags)
  }
  for (const n of c.npcs) {
    const tags = topicTagsByNpc.get(n.id)
    if (!tags) continue
    for (const hook of n.hooks ?? []) {
      if (canonicalApproach(hook.approach) in APPROACHES) continue
      if (tags.has(hook.approach)) continue
      problems.push(
        `El gancho "${hook.id}" de "${n.id}" se activa con "${hook.approach}", que no es una aproximacion, ` +
          'ni un alias de una, ni una etiqueta de ninguno de sus temas: no saltaria nunca',
      )
    }
  }

  const exchangeIds = new Set<string>()
  const speakers = new Set(['edith', 'nadia', 'vance'])
  for (const exchange of c.partyExchanges ?? []) {
    if (exchangeIds.has(exchange.id)) problems.push(`Intercambio de equipo duplicado: "${exchange.id}"`)
    exchangeIds.add(exchange.id)
    if (!exchange.trigger) problems.push(`El intercambio "${exchange.id}" no tiene disparador`)
    // Dos lineas es una replica; cinco ya es una tertulia y frena la partida.
    if (exchange.lines.length < 2 || exchange.lines.length > 4) {
      problems.push(`El intercambio "${exchange.id}" debe tener entre dos y cuatro lineas`)
    }
    if (new Set(exchange.lines.map((line) => line.speaker)).size < 2) {
      problems.push(`El intercambio "${exchange.id}" lo dice una sola voz: no es un intercambio`)
    }
    for (const line of exchange.lines) {
      if (!speakers.has(line.speaker)) {
        problems.push(`El intercambio "${exchange.id}" hace hablar a "${line.speaker}", que no es del grupo`)
      }
      if (!line.text?.trim()) problems.push(`Una linea del intercambio "${exchange.id}" esta vacia`)
    }
  }

  return problems
}

/**
 * Comprueba que una lista de rangos {min,max} cubre exactamente [from, to] al
 * ordenarlos, sin huecos ni solapes. Devuelve un problema legible por cada
 * anomalia encontrada (una tabla de porcentajes mal transcrita casi siempre
 * deja un hueco o un solape, y a mano es facil no darse cuenta).
 */
function rangeGaps(ranges: { min: number; max: number }[], from: number, to: number): string[] {
  const sorted = [...ranges].sort((a, b) => a.min - b.min)
  const problems: string[] = []
  let cursor = from
  for (const r of sorted) {
    if (r.min > cursor) problems.push(`tiene un hueco entre ${cursor} y ${r.min - 1}`)
    else if (r.min < cursor) problems.push(`tiene un solape en "${r.min}-${r.max}"`)
    cursor = Math.max(cursor, r.max + 1)
  }
  if (cursor <= to) problems.push(`tiene un hueco entre ${cursor} y ${to}`)
  return problems
}

/** Identificadores de evento mencionados en condiciones y efectos. */
function referencedEvents(ev: EventDef): string[] {
  const out: string[] = []

  const walkCondition = (c: unknown): void => {
    if (!c || typeof c !== 'object') return
    const obj = c as Record<string, unknown>
    if (obj['kind'] === 'eventFired' || obj['kind'] === 'eventCancelled') {
      if (typeof obj['event'] === 'string') out.push(obj['event'])
    }
    if (Array.isArray(obj['of'])) for (const sub of obj['of']) walkCondition(sub)
    else if (obj['of']) walkCondition(obj['of'])
  }

  for (const c of ev.requires ?? []) walkCondition(c)
  for (const e of ev.effects ?? []) {
    if (
      (e.kind === 'cancelEvent' || e.kind === 'rescheduleEvent' || e.kind === 'scheduleEvent') &&
      typeof e.event === 'string'
    ) {
      out.push(e.event)
    }
  }
  for (const tr of ev.traces ?? []) for (const c of tr.requires ?? []) walkCondition(c)

  return out
}
