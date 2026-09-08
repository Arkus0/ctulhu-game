/**
 * La fachada del juego.
 *
 * Une reloj, agenda, estado, grupo, percepcion y dialogo, y expone la unica
 * superficie que necesita la interfaz: mira lo que hay, haz una cosa, mira otra
 * vez. Cada accion CUESTA TIEMPO y el mundo avanza mientras la haces. Esa es la
 * regla que sostiene todo el juego.
 */
import { Clock, ACTION_COST, GAME_START, formatClock, formatFull, timeOfDay } from './clock'
import { DialogueEngine, type AskResult, type Approach, type DialogueTopic } from './dialogue'
import { Party, createInvestigator, type Order, type PartySnapshot } from './party'
import {
  ConversationLog,
  eavesdrop,
  spot,
  tail,
  type ConversationDef,
  type EavesdropResult,
  type PerceptionDeps,
  type TailResult,
} from './perception'
import { Rng } from './rng'
import { luckCost, OUTCOME_LABEL, spendLuck as applyLuck, type Difficulty, type RollResult } from './rules'
import { sanityCheck } from './sanity'
import { Scheduler, type SchedulerSnapshot, type TickReport, type TraceDef } from './scheduler'
import { WorldState, type WorldSnapshot } from './worldstate'
import { rollDice } from './rng'
import type { Content } from '../content/index'
import type { Investigator, LocationDef, LocationFeature, NpcId, NpcState } from './types'
import {
  ASSIGNMENTS,
  type AssignmentState,
  type CompanionView,
  type GuidedAction,
  type LeadView,
  type PendingRollState,
  type PendingRollView,
  type SceneView,
} from './adventure'

/** Una linea de texto en la caja de dialogo, con su tono. */
export interface Line {
  kind: 'narracion' | 'dialogo' | 'tirada' | 'rastro' | 'cordura' | 'sistema' | 'titular'
  text: string
}

export interface Turn {
  lines: Line[]
  minutes: number
  /** Verdadero si la partida ha terminado. */
  over: boolean
  feedback: FeedbackCue[]
}

export interface FeedbackCue {
  kind: 'location' | 'clue' | 'report' | 'roll' | 'damage' | 'sanity' | 'scene' | 'luck' | 'clock' | 'door'
  id?: string
}

export interface ExitView {
  to: string
  label: string
  minutes: number
}

export interface GameView {
  time: string
  timeOfDay: string
  day: number
  location: LocationDef
  description: string
  art: string
  exits: ExitView[]
  npcs: { id: string; name: string; title: string }[]
  features: LocationFeature[]
  /** Rastros descubribles aqui de cosas que ya han pasado. */
  traces: TraceDef[]
  /** Conversaciones que se pueden espiar ahora mismo en esta sala. */
  eavesdroppable: ConversationDef[]
  party: Investigator[]
  focus: Investigator
  journal: string[]
  actions: GuidedAction[]
  leads: LeadView[]
  companions: CompanionView[]
  scene: SceneView | null
  pendingRoll: PendingRollView | null
  objective: string
  sliceFinished: boolean
  finished: boolean
}

export interface GameSnapshot {
  version: 1 | 2
  clock: number
  rng: number
  party: PartySnapshot
  world: WorldSnapshot
  scheduler: SchedulerSnapshot
  dialogue: { asked: string[]; unlocked: string[] }
  conversations: [string, string[]][]
  availableTraces: TraceDef[]
  examined: string[]
  assignments: AssignmentState[]
  completedAssignments: string[]
  pendingRoll: PendingRollState | null
  resolvedScenes?: string[]
  firedExchanges?: string[]
  emptyWaits?: number
}

/**
 * El limbo de los que aun no han llegado.
 *
 * No es una localizacion del mapa a proposito: `npcsAt` no la devuelve nunca,
 * asi que un PNJ aparcado aqui no se ve, no se le puede abordar y no cuenta como
 * testigo. Salen de aqui cuando su evento de llegada les nombra en `actors`, y
 * vuelven aqui cuando el contenido les manda con `moveNpc`.
 */
export const FUERA = 'fuera_del_hotel'

export class Game {
  readonly rng: Rng
  readonly clock: Clock
  readonly party: Party
  readonly world: WorldState
  readonly scheduler: Scheduler
  readonly dialogue: DialogueEngine
  readonly conversations = new ConversationLog()

  private readonly content: Content
  private readonly perception: PerceptionDeps
  /** Rastros ya generados por eventos que el grupo no presencio. */
  private availableTraces: TraceDef[] = []
  private examined = new Set<string>()
  private assignments = new Map<string, AssignmentState>()
  private completedAssignments = new Set<string>()
  private pendingRoll: PendingRollState | null = null
  private resolvedScenes = new Set<string>()
  private firedExchanges = new Set<string>()
  private emptyWaits = 0

  constructor(content: Content, seed: string | number = Date.now()) {
    this.content = content
    this.rng = new Rng(seed)
    this.clock = new Clock(GAME_START)

    const start = 'recepcion'
    this.party = new Party(
      content.investigators.map((def) => createInvestigator(def, start, this.rng)),
    )
    this.world = new WorldState(this.clock, this.party, this.rng)
    this.scheduler = new Scheduler(this.clock, this.world, this.party, this.rng)

    // Los PNJ empiezan donde el modulo dice que empiezan.
    //
    // Quien todavia no ha llegado al hotel empieza en FUERA, que no es una
    // localizacion del mapa: `npcsAt` no lo devuelve nunca, asi que no se le ve
    // ni se le puede abordar hasta que su evento de llegada le trae al hall.
    // Sin esto, Najir estaria en recepcion desde las 09:00 y el jugador podria
    // interrogarle ocho horas antes de que el modulo le haga entrar por la
    // puerta.
    const home: Record<string, string> = {
      behler: 'terraza',
      clinton: 'recepcion',
      murray: 'conserjeria',
      carter: 'terraza',
      weder: 'terraza',
      gasparini: 'salon_isis',
      olga: 'recepcion',
      dieter: 'recepcion',
      mahadni: 'cocina',
      thornhill: 'correos',
      rolland: 'restaurante',
      fuad: 'recepcion',

      // Los hermanos Meyer entran y salen de conserjeria con maletas ajenas.
      sven: 'conserjeria',
      hans: 'conserjeria',
      lars: 'conserjeria',

      // Los dependientes, cada uno en su tienda.
      merryweather: 'tienda_joyas',
      murphy: 'tienda_moda_caballeros',
      sandoval: 'tienda_cigarros',
      fontanarrosa: 'tienda_suvenires',
      belanger: 'tienda_moda_mujer',
      de_la_fontaine: 'tienda_moda_mujer',
      lardinne: 'tienda_relojes',

      // Personal y huespedes fijos.
      bulatovic: 'recepcion',
      scott_brown: 'conserjeria',
      crutta: 'recepcion',
      christie: 'terraza',
      churchill: 'tienda_cigarros',
      mayer: 'tienda_cigarros',
      williams: 'bar_largo',

      // Aun no estan en el Shepheard's. Cada uno llega en su evento:
      // Najir y el Aga Khan la tarde del dia 1, Selassie por la noche, los
      // Carnarvon y Shakti el dia 2. Al Fallah solo aparece si le llaman.
      najir: FUERA,
      aga_khan: FUERA,
      ibrahim: FUERA,
      selassie: FUERA,
      carnarvon: FUERA,
      evelyn: FUERA,
      shakti: FUERA,
      sakhatakh: FUERA,
      al_fallah: FUERA,

      // Los senores Bohr si estan: han pagado doce habitaciones contiguas de la
      // segunda planta y entran y salen de ellas a todas horas.
      bohr: 'habs_bohr',
    }
    for (const def of content.npcs.values()) {
      this.world.registerNpc(def, home[def.id] ?? 'recepcion')
    }

    this.scheduler.load(content.events)
    this.dialogue = new DialogueEngine(
      this.rng,
      this.world,
      this.party,
      content.topics,
      content.npcs,
    )
    this.perception = {
      rng: this.rng,
      party: this.party,
      world: this.world,
      npcSkills: content.npcSkills,
    }

    // El Disco Solar empieza en su caja, en el Viejo Templo, sin dueno.
    this.world.setHolder('disco_solar', 'nobody')
    // Activa las escenas que empiezan exactamente a las nueve sin hacer que el
    // jugador tenga que gastar primero una acción vacía.
    this.scheduler.advance(0)
  }

  /* ---------------------------------------------------------------- *
   * Consulta
   * ---------------------------------------------------------------- */

  view(): GameView {
    const loc = this.location(this.party.focus.location)
    const variant = (loc.variants ?? []).find((v) => this.world.testAll(v.requires))

    const scene = this.currentScene()
    const leads = this.leads()
    const sliceFinished =
      (this.world.getFlag('disco_decision_jugador') || this.clock.now >= 13 * 60) &&
      scene == null &&
      this.pendingRoll == null
    return {
      time: formatFull(this.clock.now),
      timeOfDay: timeOfDay(this.clock.now),
      day: this.clock.day,
      location: loc,
      description: variant?.description ?? loc.description,
      // Lo que se ve manda sobre donde se esta: una escena abierta sustituye el
      // fondo, y un suceso en curso lo sustituye tambien mientras dura.
      art: scene?.art ?? this.ongoingArt() ?? variant?.art ?? loc.art ?? 'placeholder',
      exits: loc.exits
        .filter((e) => this.world.testAll(e.requires))
        .map((e) => ({
          to: e.to,
          label: e.label ?? this.location(e.to).name,
          minutes: e.minutes,
        })),
      npcs: this.world.npcsAt(loc.id).map((n) => ({
        id: n.id,
        name: this.content.npcs.get(n.id)?.name ?? n.id,
        title: this.content.npcs.get(n.id)?.title ?? '',
      })),
      features: (loc.features ?? []).filter(
        (f) => this.world.testAll(f.requires) && !this.examined.has(`${loc.id}:${f.id}`),
      ),
      traces: this.availableTraces.filter(
        (t) =>
          (t.location ?? '') === loc.id ||
          (t.teller != null && this.world.hasNpc(t.teller) && this.world.npc(t.teller).location === loc.id),
      ),
      eavesdroppable: this.eavesdroppableHere(),
      party: this.party.members,
      focus: this.party.focus,
      journal: this.world.journal,
      actions: this.contextActions(scene),
      leads,
      companions: this.companionViews(),
      scene,
      pendingRoll: this.pendingRollView(),
      objective: scene
        ? scene.body
        : sliceFinished
          ? 'La primera mañana ha cerrado su arco. Sus consecuencias quedan fijadas.'
          : leads.find((lead) => lead.status === 'active')?.detail ??
            'Buscar una nueva vía antes de que cambie la agenda del hotel.',
      sliceFinished,
      finished: sliceFinished || this.clock.finished || this.party.wipedOut,
    }
  }

  private eavesdroppableHere(): ConversationDef[] {
    const here = this.party.focus.location
    const ongoing = new Set(this.scheduler.ongoingAt(here).map((e) => e.id))
    return [...this.content.conversations.values()].filter(
      (c) =>
        c.location === here &&
        (c.event == null || ongoing.has(c.event)) &&
        this.conversations.coverage(c) < 1,
    )
  }

  location(id: string): LocationDef {
    const l = this.content.locations.get(id)
    if (!l) throw new Error(`Localizacion desconocida: "${id}"`)
    return l
  }

  npcName(id: string): string {
    return this.content.npcs.get(id)?.name ?? id
  }

  /** Nombre de la lamina de retrato de un PNJ, si su ficha declara una. */
  npcPortrait(id: NpcId): string | undefined {
    return this.content.npcs.get(id)?.portrait
  }

  topicsFor(npc: string): DialogueTopic[] {
    return this.dialogue.available(npc)
  }

  approachesFor(topic: DialogueTopic): Approach[] {
    return this.dialogue.approachesFor(topic)
  }

  /** Cinco decisiones como maximo. El mapa, el caso y el equipo viven fuera de esta lista. */
  private contextActions(scene: SceneView | null): GuidedAction[] {
    if (this.pendingRoll || this.clock.now >= 13 * 60) return []
    if (scene) return scene.actions

    const v: GuidedAction[] = []
    const here = this.party.focus.location
    const npcs = this.world
      .npcsAt(here)
      .filter((npc) => this.topicsFor(npc.id).length > 0)

    if (
      !this.world.getFlag('investigadores_registrados') &&
      here === 'recepcion' &&
      this.clock.now < 11 * 60
    ) {
      v.push({
        id: 'check_in',
        kind: 'act',
        label: 'Registrarse y preguntar por Behler',
        hint: 'Dejar constancia de la llegada y confirmar la cita de las once.',
        minutes: 15,
      })
    }

    if (
      here === 'terraza' &&
      this.world.getFlag('reunion_behler') &&
      !this.world.getFlag('autorizacion_behler') &&
      this.clock.now < 12 * 60
    ) {
      v.push({
        id: 'request_authority',
        kind: 'act',
        label: 'Pedir una autorización escrita',
        hint: 'Behler puede daros cobertura para intervenir en las zonas privadas.',
        minutes: 10,
        urgent: true,
      })
    }

    const conversation = this.eavesdroppableHere()[0]
    if (conversation) {
      const names = conversation.participants.map((id) => this.npcName(id)).join(' y ')
      v.push({
        id: `listen:${conversation.id}`,
        kind: 'listen',
        label: `Escuchar a ${names}`,
        hint: 'Acercarse lo bastante para captar fragmentos sin llamar la atención.',
        minutes: ACTION_COST.eavesdrop,
        urgent: true,
      })
    }

    if (npcs.length > 0) {
      v.push({
        id: 'talk_here',
        kind: 'talk',
        label: 'Hablar con alguien',
        hint: `${npcs.length} ${npcs.length === 1 ? 'persona disponible' : 'personas disponibles'} en esta escena.`,
      })
    }

    const loc = this.location(here)
    const feature = (loc.features ?? []).find(
      (item) => this.world.testAll(item.requires) && !this.examined.has(`${loc.id}:${item.id}`),
    )
    if (feature) {
      v.push({
        id: `inspect:${feature.id}`,
        kind: 'inspect',
        label: feature.name,
        hint: feature.description,
        minutes: feature.minutes ?? ACTION_COST.examine,
      })
    } else {
      v.push({
        id: 'observe_room',
        kind: 'act',
        label: 'Observar la escena',
        hint: 'Detenerse un momento y leer el lugar antes de decidir.',
        minutes: 5,
      })
    }

    if (
      this.clock.now >= 12 * 60 &&
      this.clock.now < 12 * 60 + 30 &&
      this.world.getFlag('weder_bajo_al_sotano') &&
      here !== 'viejo_templo'
    ) {
      v.push({
        id: 'trail_weder',
        kind: 'act',
        label: 'Seguir el rastro de Weder',
        hint: 'Bajó por la cocina hace unos minutos. Todavía podéis alcanzarlo.',
        minutes: 10,
        urgent: true,
      })
    }

    const waitMinutes = Math.min(15, this.clock.minutesToNextSequence || 15)
    v.push({
      id: 'wait',
      kind: 'act',
      label: 'Dejar correr el reloj',
      hint: `Esperar hasta las ${formatClock(this.clock.now + waitMinutes)}.`,
      minutes: waitMinutes,
    })

    return v.slice(0, 5)
  }

  private currentScene(): SceneView | null {
    const event = this.scheduler
      .ongoingAt(this.party.focus.location)
      .find((candidate) => candidate.scene && !this.resolvedScenes.has(candidate.scene))
    if (!event?.scene) return null
    if (event.scene === 'solar_disk' && (this.world.getFlag('disco_resuelto') || this.world.holderOf('disco_solar') !== 'nobody')) return null
    const def = this.content.scenes.get(event.scene)
    if (!def) return null
    const allowed = new Set(event.interruptibleBy ?? def.actions.map((action) => action.id))
    const actions = def.actions
      .filter((action) => allowed.has(action.id))
      .map((action) => {
        const copy = { ...action }
        if (action.id === 'threshold_authority' && !this.world.getFlag('autorizacion_behler')) {
          copy.disabled = true
          copy.hint = 'No tenéis una autorización firmada por Behler.'
        }
        if (action.id === 'threshold_service' && !this.world.knows('ruta_servicio_al_sotano')) {
          copy.disabled = true
          copy.hint = 'Aún no habéis descubierto una ruta de servicio.'
        }
        if (action.id === 'disk_authority' && (!this.world.getFlag('autorizacion_behler') || this.party.at('viejo_templo').length < 2)) {
          copy.disabled = true
          copy.hint = 'Requiere la autorización escrita y dos investigadores presentes.'
        }
        if ((action.id === 'attention_divide' || action.id === 'arrival_vance_service') && this.companionBusy('vance')) {
          copy.disabled = true
          copy.hint = 'Vance ya está ocupado con otro encargo.'
        }
        if (action.id === 'arrival_nadia_registry' && this.companionBusy('nadia')) copy.disabled = true
        if (action.id === 'threshold_follow' && this.world.getFlag('weder_alertado')) {
          copy.difficulty = 'hard'
          copy.hint = 'Sigilo · Difícil. Weder ya conoce vuestra vigilancia.'
        }
        return copy
      })
    return { id: def.id, title: def.title, body: def.body, art: def.art, actions }
  }

  /**
   * Lamina del suceso que se esta presenciando aqui, si lo hay.
   *
   * Es el equivalente de `SceneDef.art` para los sucesos que no abren escena
   * interactiva pero si merecen imagen propia mientras duran. Se ignoran los
   * eventos con escena: de esos ya se ocupa `currentScene`.
   */
  private ongoingArt(): string | undefined {
    return this.scheduler
      .ongoingAt(this.party.focus.location)
      .find((event) => event.art && !event.scene)?.art
  }

  leads(): LeadView[] {
    const now = this.clock.now
    const done = (yes: boolean, missed: boolean): LeadView['status'] =>
      yes ? 'completed' : missed ? 'missed' : 'active'
    const visible: LeadView[] = [
      {
        id: 'behler',
        title: 'El encargo de Behler',
        detail: 'Reunirse con el director en la terraza y averiguar qué teme del hotel.',
        deadline: '11:00 a 12:00',
        status: done(this.world.getFlag('reunion_behler'), now >= 12 * 60),
      },
    ]

    const conspiratorsKnown =
      this.world.knows('carter_y_weder_juntos') ||
      this.world.knows('weder_y_carter_se_reunen') ||
      this.conversations.coverage(
        this.content.conversations.get('carter_weder_terraza') ?? {
          id: '', location: '', participants: [], fragments: [],
        },
      ) > 0
    if (conspiratorsKnown) visible.push({
        id: 'conspiradores',
        title: 'La mesa del fondo',
        detail: 'Identificar el trato entre Carter y Weder sin perder de vista a Behler.',
        deadline: 'Antes de las 12:00',
        status: 'completed',
      })
    else if (now >= 12 * 60) visible.push(this.anonymousMissed('conspiradores'))

    const basementSuspected =
      this.world.knows('ruta_servicio_al_sotano') ||
      this.world.knows('weder_baja_al_sotano') ||
      this.world.knows('weder_alquila_el_templo') ||
      this.world.knows('viejo_templo_existe')
    if (basementSuspected) visible.push({
        id: 'sotano',
        title: 'La ruta de servicio',
        detail: 'Descubrir qué conecta la cocina con las galerías bajo el hotel.',
        deadline: 'Antes de las 12:30',
        status: done(
          this.world.knows('ruta_servicio_al_sotano') || this.world.knows('weder_baja_al_sotano'),
          now >= 12 * 60 + 30,
        ),
      })
    else if (now >= 12 * 60 + 30) visible.push(this.anonymousMissed('sotano'))

    const diskKnown =
      this.world.knows('disco_solar_existe') ||
      (this.world.getFlag('disco_scene_open') && this.party.focus.location === 'viejo_templo')
    if (diskKnown) visible.push({
        id: 'disco',
        title: 'El objeto de la caja',
        detail: 'Decidir quién sale del Viejo Templo con el Disco Solar.',
        deadline: '12:30 a 13:00',
        status: this.world.getFlag('disco_decision_jugador')
          ? 'completed'
          : now >= 13 * 60
            ? 'missed'
            : 'active',
      })
    else if (now >= 13 * 60) visible.push(this.anonymousMissed('disco'))
    return visible
  }

  private anonymousMissed(id: string): LeadView {
    return {
      id: `missed_${id}`,
      title: 'Oportunidad perdida',
      detail: 'Algo ocurrió en el hotel sin que el equipo reuniera información suficiente para identificarlo.',
      status: 'missed',
      anonymous: true,
    }
  }

  private pendingRollView(): PendingRollView | null {
    if (!this.pendingRoll) return null
    const actor = this.party.byId(this.pendingRoll.actorId)
    const cost = luckCost(this.pendingRoll.roll)
    return {
      ...this.pendingRoll,
      actorName: actor.name,
      luckCost: cost,
      canSpendLuck: cost != null && cost > 0 && actor.luck >= cost,
    }
  }

  private companionViews(): CompanionView[] {
    return ['nadia', 'vance'].map((id) => {
      const inv = this.party.byId(id)
      const active = [...this.assignments.values()].find(
        (state) => state.investigator === id && !state.collected,
      )
      const def = active ? ASSIGNMENTS.find((item) => item.id === active.id) : undefined
      const withLeader = inv.location === this.party.focus.location
      const availableAssignments = ASSIGNMENTS.filter(
        (item) =>
          item.investigator === id &&
          this.clock.now >= item.availableFrom &&
          this.clock.now <= item.availableUntil &&
          !this.completedAssignments.has(item.id) &&
          !active,
      )
      return {
        id,
        name: inv.name,
        location: this.content.locations.get(inv.location)?.name ?? inv.location,
        state: active
          ? active.ready
            ? 'report_ready'
            : 'working'
          : withLeader
            ? 'with_leader'
            : 'available',
        assignment: def?.label,
        readyAt: active ? formatClock(active.completesAt) : undefined,
        canCollect: Boolean(active?.ready && withLeader),
        availableAssignments,
      }
    })
  }

  private companionBusy(id: 'nadia' | 'vance'): boolean {
    return [...this.assignments.values()].some((state) => state.investigator === id && !state.collected)
  }

  private completeScene(id: string): void {
    this.resolvedScenes.add(id)
  }

  private exchange(trigger: string, allowSeparated = false): Line[] {
    // Un intercambio solo necesita dos voces en la misma estancia. Exigir al
    // grupo entero silenciaba los informes mientras el tercer investigador
    // seguia cumpliendo otro encargo.
    if (!allowSeparated && this.party.at(this.party.focus.location).length < 2) return []
    const def = this.content.partyExchanges.find(
      (candidate) => candidate.trigger === trigger && !this.firedExchanges.has(candidate.id),
    )
    if (!def) return []
    this.firedExchanges.add(def.id)
    const names = { edith: 'Edith', nadia: 'Nadia', vance: 'Vance' }
    return def.lines.map((line) => ({ kind: 'dialogo', text: `${names[line.speaker]} —${line.text}` }))
  }

  /* ---------------------------------------------------------------- *
   * Acciones
   * ---------------------------------------------------------------- */

  performAction(id: string): Turn {
    if (this.pendingRoll) {
      return this.instant([{ kind: 'sistema', text: 'Primero hay que resolver la tirada pendiente.' }])
    }
    const scene = this.currentScene()
    if (scene) {
      const action = scene.actions.find((candidate) => candidate.id === id)
      if (!action) return this.instant([{ kind: 'sistema', text: 'Esa acción no puede interrumpir la escena actual.' }])
      if (action.disabled) return this.instant([{ kind: 'sistema', text: action.hint }])
    }

    if (id === 'arrival_telegram') {
      this.completeScene('arrival_checkin')
      this.world.setFlag('investigadores_registrados')
      this.world.unlockJournal('cita_con_behler')
      return this.resolve([
        { kind: 'dialogo', text: 'Clinton encuentra vuestros nombres bajo una nota de tinta violeta. «El señor Behler les espera a las once en la terraza. Ha subrayado discreción dos veces».' },
        { kind: 'sistema', text: 'Caso actualizado: cita con Behler, terraza, 11:00.' },
      ], 10, [{ kind: 'clue', id: 'behler' }])
    }
    if (id === 'arrival_question_clinton') {
      return this.beginSceneRoll(id, 'Una línea fuera de sitio', 'harker', 'Descubrir', 'regular', 'Éxito: detectas una anomalía. Fallo: Clinton se incomoda, pero deja una pista parcial.')
    }
    if (id === 'arrival_nadia_registry' || id === 'arrival_vance_service') {
      this.completeScene('arrival_checkin')
      this.world.setFlag('investigadores_registrados')
      this.world.unlockJournal('cita_con_behler')
      const assignment = id === 'arrival_nadia_registry' ? 'nadia_registro' : 'vance_servicio'
      const who = id === 'arrival_nadia_registry' ? 'nadia' : 'vance'
      const dispatched = this.assign(assignment)
      return this.resolve([...dispatched.lines, ...this.exchange(`separation:${who}`, true)], 5, [{ kind: 'scene', id: 'arrival_checkin' }])
    }
    if (id === 'behler_listen' || id === 'behler_basement') {
      this.completeScene('behler_encargo')
      this.world.setFlag('reunion_behler')
      return this.ask(id === 'behler_listen' ? 'behler_encargo' : 'behler_sotano', 'directo')
    }
    if (id === 'behler_authority') {
      return this.beginSceneRoll(id, 'La firma de Behler', 'harker', 'Persuasion', 'regular', 'Éxito: Behler firma. Fallo: niega el papel y pierde confianza.')
    }
    if (id === 'behler_watch_table') {
      this.completeScene('behler_encargo')
      this.world.learnFact('carter_y_weder_juntos')
      this.world.adjustDisposition('behler', -5)
      return this.resolve([
        { kind: 'narracion', text: 'Edith deja hablar a Behler mientras memoriza la mesa del fondo: Howard Carter frente a Heinrich Weder, demasiado cerca y demasiado atentos al reloj.' },
        ...this.exchange('weder:suspicion'),
      ], 5, [{ kind: 'clue', id: 'conspiradores' }])
    }
    if (id === 'attention_behler') {
      this.completeScene('terrace_conflict')
      this.world.adjustDisposition('behler', 5)
      const topic = this.topicsFor('behler').find((candidate) => candidate.id === 'behler_encargo')
      return topic
        ? this.ask('behler_encargo', 'directo')
        : this.resolve([{ kind: 'narracion', text: 'Edith mantiene los ojos en Behler. La mesa del fondo se dispersa sin regalarle una frase más.' }], 10)
    }
    if (id === 'attention_listen') {
      return this.beginSceneRoll(id, 'La mesa del fondo', 'harker', 'Escuchar', 'hard', 'Éxito: oyes el vínculo con Mahadni y el sótano. Fallo: Weder reconoce la maniobra.')
    }
    if (id === 'attention_interrupt') {
      return this.beginSceneRoll(id, 'Una pregunta demasiado pública', 'harker', 'Persuasion', 'hard', 'Éxito: Weder revela a quién busca. Fallo: cierra filas y queda alertado.')
    }
    if (id === 'attention_divide') {
      this.completeScene('terrace_conflict')
      const dispatched = this.assign('vance_terraza')
      return this.resolve([...dispatched.lines, ...this.exchange('separation:vance', true)], 5, [{ kind: 'scene', id: 'terrace_conflict' }])
    }
    if (id === 'threshold_follow') {
      const difficulty: Difficulty = this.world.getFlag('weder_alertado') ? 'hard' : 'regular'
      return this.beginSceneRoll(id, 'Tras la puerta de servicio', 'harker', 'Sigilo', difficulty, 'Éxito: alcanzáis las galerías sin ser vistos. Fallo: entráis, pero Weder os descubre.')
    }
    if (id === 'threshold_authority' || id === 'threshold_service') {
      this.completeScene('basement_threshold')
      this.world.learnFact('ruta_servicio_al_sotano')
      this.world.unlockJournal('ruta_servicio_al_sotano')
      this.party.moveTogether('sala_escombros')
      const trigger = id === 'threshold_authority' ? 'descend:authority' : 'descend:follow'
      const text = id === 'threshold_authority'
        ? 'La firma de Behler obliga a los pinches a apartarse. Mahadni no discute el papel; se limita a memorizar vuestras caras.'
        : 'Vance encuentra el pasador que había estudiado. La escalera evita la mesa de despiece y desemboca en la galería húmeda.'
      return this.resolve([{ kind: 'narracion', text }, ...this.exchange(trigger)], 10, [
        { kind: 'door', id: 'sotano' },
        { kind: 'location', id: 'sala_escombros' },
      ])
    }
    if (id === 'threshold_retreat') {
      this.completeScene('basement_threshold')
      this.world.setFlag('umbral_abandonado')
      return this.resolve([{ kind: 'narracion', text: 'Edith deja que la puerta se cierre. Weder conserva la iniciativa, pero todavía no sabe cuánto habéis visto.' }], 5)
    }
    if (id === 'ears_examine' || id === 'ears_protect' || id === 'ears_hurry') {
      this.completeScene('ears')
      const lines: Line[] = []
      if (id === 'ears_examine') {
        this.world.learnFact('algo_vive_abajo')
        this.world.unlockJournal('las_orejas')
        lines.push(...this.resolveDeferred({ kind: 'sanityLoss', loss: '0/1D3' }))
        lines.push(...this.exchange('ears:examine'))
      } else if (id === 'ears_protect') {
        this.world.setFlag('edith_protege_al_equipo')
        lines.push(...this.resolveDeferred({ kind: 'sanityLoss', loss: '0/1', who: 'harker' }))
        lines.push(...this.exchange('ears:protect'))
      } else {
        this.world.setFlag('orejas_ignoradas')
        this.party.moveTogether('viejo_templo')
        lines.push({ kind: 'narracion', text: 'No miráis una segunda vez. Dejáis atrás los sonidos del túnel y alcanzáis el templo antes de que el eco se apague.' })
      }
      return this.resolve(lines, 5, [{ kind: 'sanity', id: 'ears' }])
    }
    if (id === 'check_in') {
      this.world.setFlag('investigadores_registrados')
      this.world.unlockJournal('cita_con_behler')
      return this.resolve(
        [
          {
            kind: 'dialogo',
            text:
              'Clinton encuentra vuestros nombres bajo una nota escrita con tinta violeta. «El señor Behler les espera a las once en la terraza. Ha subrayado discreción dos veces».',
          },
          { kind: 'sistema', text: 'Caso actualizado: cita con Behler, terraza, 11:00.' },
        ],
        15,
      )
    }
    if (id === 'observe_room') {
      return this.resolve(
        [{ kind: 'narracion', text: this.view().description }],
        5,
      )
    }
    if (id === 'request_authority') {
      if (
        this.party.focus.location !== 'terraza' ||
        !this.world.getFlag('reunion_behler') ||
        this.clock.now >= 12 * 60
      ) {
        return this.instant([
          { kind: 'sistema', text: 'Behler ya no está disponible para firmar esa autorización.' },
        ])
      }
      this.world.setFlag('autorizacion_behler')
      if (!this.party.focus.inventory.includes('autorizacion_behler')) {
        this.party.focus.inventory.push('autorizacion_behler')
      }
      this.world.unlockJournal('autorizacion_behler')
      return this.resolve(
        [
          {
            kind: 'dialogo',
            text:
              'Behler firma una hoja con gesto impaciente. «Pueden retener cualquier pieza del hotel si creen que corre peligro. No conviertan esto en un espectáculo, señorita Harker».',
          },
          { kind: 'sistema', text: 'Objeto obtenido: autorización de Behler.' },
        ],
        10,
      )
    }
    if (id === 'wait_for_behler') {
      return this.resolve(
        [{ kind: 'narracion', text: 'Tomáis una mesa desde la que se domina la terraza.' }],
        Math.max(0, 11 * 60 - this.clock.now),
      )
    }
    if (id === 'wait') return this.wait()
    if (id === 'trail_weder') {
      if (!this.world.hasNpc('weder')) return this.instant([])
      const turn = this.follow('weder')
      if (this.party.focus.location === this.world.npc('weder').location) {
        this.world.learnFact('ruta_servicio_al_sotano')
        this.world.unlockJournal('ruta_servicio_al_sotano')
      }
      return turn
    }
    if (id.startsWith('listen:')) return this.listenTo(id.slice('listen:'.length))
    if (id.startsWith('inspect:')) return this.examine(id.slice('inspect:'.length))
    if (id === 'disk_observe') return this.resolveDiskWithoutRoll('observe')
    if (id === 'disk_authority') return this.beginDiskRoll('disk_authority')
    if (id === 'disk_snatch') return this.beginDiskRoll('disk_snatch')
    throw new Error(`Accion guiada desconocida: "${id}"`)
  }

  private beginSceneRoll(
    actionId: string,
    title: string,
    actorId: string,
    skill: string,
    difficulty: Difficulty,
    stakes: string,
  ): Turn {
    const result = this.party.check(this.rng, actorId, skill, { difficulty })
    this.pendingRoll = { actionId, title, stakes, actorId, roll: result }
    return this.instant([
      { kind: 'titular', text: title },
      this.rollLine(result),
      { kind: 'sistema', text: stakes },
      ...(result.success ? [] : this.exchange('roll:failed')),
    ], [{ kind: 'roll', id: actionId }])
  }

  private beginDiskRoll(actionId: PendingRollState['actionId']): Turn {
    if (!this.currentScene()) {
      return this.instant([{ kind: 'sistema', text: 'La oportunidad ya ha pasado.' }])
    }
    if (
      actionId === 'disk_authority' &&
      (!this.world.getFlag('autorizacion_behler') || this.party.at('viejo_templo').length < 2)
    ) {
      return this.instant([
        {
          kind: 'sistema',
          text: 'Hace falta la autorización escrita y otro investigador que pueda respaldar a Edith.',
        },
      ])
    }

    const skill = actionId === 'disk_authority' ? 'Persuasion' : 'Pelea'
    const title = actionId === 'disk_authority' ? 'La palabra de Behler' : 'Un movimiento desesperado'
    const stakes =
      actionId === 'disk_authority'
        ? 'Éxito: Weder se retira. Fallo: comprende que le vigiláis y toma el disco.'
        : 'Éxito: Edith toma el disco. Fallo: Weder contraataca y conserva la pieza.'
    const result = this.party.check(this.rng, 'harker', skill, { difficulty: 'hard' })
    this.pendingRoll = { actionId, title, stakes, actorId: 'harker', roll: result }
    return this.instant([
      { kind: 'titular', text: title },
      this.rollLine(result),
      { kind: 'sistema', text: stakes },
      ...(result.success ? [] : this.exchange('roll:failed')),
    ], [{ kind: 'roll', id: actionId }])
  }

  settlePendingRoll(useLuck: boolean): Turn {
    const pending = this.pendingRoll
    if (!pending) throw new Error('No hay ninguna tirada pendiente')
    const actor = this.party.byId(pending.actorId)
    let result = pending.roll
    const cost = luckCost(result)
    if (useLuck) {
      if (cost == null || cost <= 0 || actor.luck < cost) {
        return this.instant([{ kind: 'sistema', text: 'No hay Suerte suficiente para alterar esta tirada.' }])
      }
      actor.luck -= cost
      result = applyLuck(result, cost)
    }
    this.pendingRoll = null

    const lines: Line[] = [this.rollLine(result)]
    if (useLuck) lines.push(...this.exchange('luck:spent'))

    if (!pending.actionId.startsWith('disk_')) {
      const feedback: FeedbackCue[] = [{ kind: 'roll', id: pending.actionId }]
      if (useLuck) feedback.push({ kind: 'luck', id: pending.actionId })
      if (pending.actionId === 'arrival_question_clinton') {
        this.completeScene('arrival_checkin')
        this.world.setFlag('investigadores_registrados')
        this.world.unlockJournal('cita_con_behler')
        if (result.success) {
          this.world.learnFact('behler_teme_escandalo')
          lines.push({ kind: 'narracion', text: 'La nota de Behler fue añadida después de cerrar el turno: no pide una habitación, solo discreción y una mesa desde la que se vea toda la terraza.' })
          feedback.push({ kind: 'clue', id: 'behler' })
        } else {
          this.world.adjustDisposition('clinton', -5)
          lines.push({ kind: 'dialogo', text: 'Clinton tapa el registro con la mano. «El señor Behler les explicará lo que considere oportuno». Ha contestado demasiado deprisa.' })
        }
        return this.resolve(lines, 15, feedback)
      }
      if (pending.actionId === 'behler_authority') {
        this.completeScene('behler_encargo')
        if (result.success) {
          this.world.setFlag('autorizacion_behler')
          if (!this.party.focus.inventory.includes('autorizacion_behler')) this.party.focus.inventory.push('autorizacion_behler')
          this.world.unlockJournal('autorizacion_behler')
          lines.push({ kind: 'dialogo', text: 'Behler firma. «Pueden retener cualquier pieza del hotel si creen que corre peligro. No conviertan esto en un espectáculo».' })
          feedback.push({ kind: 'clue', id: 'autorizacion_behler' })
        } else {
          this.world.adjustDisposition('behler', -5)
          lines.push({ kind: 'dialogo', text: 'Behler guarda la estilográfica. «Les he pedido discreción, señorita Harker, no jurisdicción».' })
        }
        return this.resolve(lines, 10, feedback)
      }
      if (pending.actionId === 'attention_listen' || pending.actionId === 'attention_interrupt') {
        this.completeScene('terrace_conflict')
        this.world.learnFact('carter_y_weder_juntos')
        if (result.success) {
          this.world.learnFact('weder_baja_al_sotano')
          this.world.unlockJournal('weder_y_mahadni')
          lines.push({ kind: 'dialogo', text: 'Weder —«Mahadni tendrá abierta la puerta de la cocina al mediodía. Carter no necesita saber qué caja buscamos».' })
          lines.push(...this.exchange('weder:suspicion'))
          feedback.push({ kind: 'clue', id: 'conspiradores' })
        } else {
          this.world.setFlag('weder_alertado')
          this.world.npc('weder').suspicious = true
          lines.push({ kind: 'narracion', text: 'Weder interrumpe la frase y mira directamente a Edith. Sonríe, pero a partir de ahora coloca cada palabra para que ella la oiga.' })
          lines.push(...this.exchange('weder:alerted'))
        }
        return this.resolve(lines, 10, feedback)
      }
      if (pending.actionId === 'threshold_follow') {
        this.completeScene('basement_threshold')
        this.world.learnFact('ruta_servicio_al_sotano')
        this.world.unlockJournal('ruta_servicio_al_sotano')
        this.party.moveTogether('sala_escombros')
        if (result.success) {
          lines.push({ kind: 'narracion', text: 'Guardáis diez pasos y dos recodos de distancia. Weder no se vuelve cuando la escalera del hotel se convierte en piedra antigua.' })
        } else {
          this.world.setFlag('weder_alertado')
          lines.push({ kind: 'dialogo', text: 'Weder —«La señorita Harker debería aprender que una sombra también hace ruido». No os detiene; quiere saber hasta dónde llegaréis.' })
        }
        lines.push(...this.exchange('descend:follow'))
        feedback.push({ kind: 'door', id: 'sotano' }, { kind: 'location', id: 'sala_escombros' })
        return this.resolve(lines, 10, feedback)
      }
      throw new Error(`Tirada de escena sin resolución: "${pending.actionId}"`)
    }

    this.world.learnFact('disco_solar_existe')
    this.world.setFlag('disco_decision_jugador')
    this.completeScene('solar_disk')
    if (pending.actionId === 'disk_authority') {
      if (result.success) {
        this.world.setFlag('disco_resuelto')
        this.world.setFlag('weder_retrasado')
        this.world.setFlag('weder_alertado')
        this.scheduler.reschedule('d1_weder_toma_disco', 120)
        lines.push({
          kind: 'dialogo',
          text:
            'Edith despliega la firma de Behler. Weder mira el papel, después al testigo, y vuelve a cubrir el disco. «A las tres hablaré con el director. Entonces veremos quién da órdenes aquí».',
        })
        lines.push(...this.exchange('ending:delay'))
      } else {
        this.world.setFlag('disco_resuelto')
        this.world.setFlag('weder_alertado')
        this.world.setHolder('disco_solar', 'weder')
        this.world.setFlag('weder_tiene_el_disco')
        lines.push({
          kind: 'dialogo',
          text:
            'Weder dobla la autorización sin leerla entera. «Llegan tarde». Mahadni os cierra el paso mientras el alemán asegura el disco bajo el brazo.',
        })
      }
    } else if (result.success) {
      this.world.setFlag('disco_resuelto')
      this.world.setFlag('disco_robado_por_investigadores')
      this.world.apply({ kind: 'moveCustody', item: 'disco_solar', to: 'player' })
      this.world.learnFact('disco_solar_existe')
      this.world.unlockJournal('disco_en_nuestro_poder')
      lines.push({
        kind: 'narracion',
        text:
          'Edith golpea la muñeca de Weder contra el borde de la caja y atrapa el disco antes de que caiga. Mahadni ruge. El corredor de salida sigue libre, pero solo por un instante.',
      })
      lines.push(...this.exchange('ending:custody'))
    } else {
      const damage = rollDice(this.rng, '1D3')
      this.party.applyDamage('harker', damage)
      this.world.setFlag('disco_resuelto')
      this.world.setFlag('weder_hostil')
      this.world.setHolder('disco_solar', 'weder')
      this.world.setFlag('weder_tiene_el_disco')
      lines.push({
        kind: 'sistema',
        text: `Mahadni derriba a Edith contra una columna. Pierde ${damage} puntos de Salud.`,
      })
      lines.push({
        kind: 'narracion',
        text: 'Weder guarda el disco y ya no finge cordialidad. Ahora sabe exactamente quiénes sois.',
      })
    }
    return this.resolve(lines, 5, [
      { kind: 'roll', id: pending.actionId },
      ...(useLuck ? [{ kind: 'luck' as const, id: pending.actionId }] : []),
      ...(pending.actionId === 'disk_snatch' && !result.success ? [{ kind: 'damage' as const, id: 'harker' }] : []),
    ])
  }

  private resolveDiskWithoutRoll(mode: 'observe'): Turn {
    if (!this.currentScene()) return this.instant([{ kind: 'sistema', text: 'La oportunidad ya ha pasado.' }])
    this.world.setFlag('disco_resuelto')
    this.world.setFlag('disco_decision_jugador')
    this.world.setFlag('weder_tiene_el_disco')
    this.world.setHolder('disco_solar', 'weder')
    this.world.learnFact('disco_solar_existe')
    this.world.unlockJournal('weder_toma_el_disco')
    this.completeScene('solar_disk')
    return this.resolve(
      [
        {
          kind: 'narracion',
          text:
            'Contenéis la respiración. Weder envuelve el disco con la tela y se lo entrega a Mahadni solo el tiempo necesario para cerrar la caja. Hablan de la habitación 407 y de una caja fuerte. Luego emprenden el regreso.',
        },
        { kind: 'sistema', text: 'Pista confirmada: Weder llevará el disco a la habitación 407.' },
        ...this.exchange('ending:observe'),
      ],
      mode === 'observe' ? 5 : 5,
      [{ kind: 'clue', id: 'disco' }],
    )
  }

  assign(assignmentId: string): Turn {
    const def = ASSIGNMENTS.find((item) => item.id === assignmentId)
    if (!def) throw new Error(`Encargo desconocido: "${assignmentId}"`)
    const occupied = [...this.assignments.values()].some(
      (state) => state.investigator === def.investigator && !state.collected,
    )
    if (occupied) throw new Error('Ese compañero ya tiene un encargo en curso')
    if (
      this.clock.now < def.availableFrom ||
      this.clock.now > def.availableUntil ||
      this.completedAssignments.has(def.id)
    ) {
      throw new Error('Ese encargo ya no está disponible')
    }
    const completesAt = Math.max(this.clock.now + def.duration, def.notReadyBefore ?? 0)
    this.party.move(def.investigator, def.location)
    this.party.setOrder(def.investigator, {
      kind: 'watch',
      location: def.location,
      label: def.label,
    })
    this.assignments.set(def.id, {
      id: def.id,
      investigator: def.investigator,
      startedAt: this.clock.now,
      completesAt,
      ready: false,
      collected: false,
      quality: null,
      roll: null,
      extraLines: [],
      extraFacts: [],
      extraJournal: [],
    })
    return this.instant([
      {
        kind: 'sistema',
        text: `${this.party.byId(def.investigator).name} parte hacia ${this.location(def.location).name}. Informará al reuniros después de las ${formatClock(completesAt)}.`,
      },
    ])
  }

  collectReport(investigatorId: string): Turn {
    const state = [...this.assignments.values()].find(
      (item) => item.investigator === investigatorId && item.ready && !item.collected,
    )
    if (!state) throw new Error('Ese compañero no tiene un informe preparado')
    const inv = this.party.byId(investigatorId)
    if (inv.location !== this.party.focus.location) {
      throw new Error('Tenéis que reuniros antes de compartir lo descubierto')
    }
    const def = ASSIGNMENTS.find((item) => item.id === state.id)!
    const quality = state.quality ?? 'partial'
    const facts = quality === 'complete' ? def.fullFacts : def.partialFacts
    const journal = quality === 'complete' ? def.fullJournal : def.partialJournal
    for (const fact of [...facts, ...state.extraFacts]) this.world.learnFact(fact)
    for (const entry of [...journal, ...state.extraJournal]) this.world.unlockJournal(entry)
    state.collected = true
    this.completedAssignments.add(state.id)
    this.party.setOrder(investigatorId, { kind: 'wait', label: 'Acompañar a Edith' })
    return this.instant([
      { kind: 'titular', text: `Informe de ${inv.name}` },
      ...(state.roll ? [this.rollLine(state.roll)] : []),
      { kind: 'dialogo', text: quality === 'complete' ? def.fullReport : def.partialReport },
      ...state.extraLines.map((text): Line => ({ kind: 'narracion', text })),
      ...this.exchange(`report:${state.id}:${quality}`),
      { kind: 'sistema', text: 'Las nuevas pistas ya figuran en el caso.' },
    ], [{ kind: 'report', id: state.id }, { kind: 'clue', id: state.id }])
  }

  /**
   * La conversacion reactiva normal es gratuita. Esta accion existe para que
   * el jugador pueda detenerse deliberadamente a ordenar lo averiguado.
   */
  debrief(): Turn {
    const present = this.party.at(this.party.focus.location)
    if (present.length < 2) {
      return this.instant([{ kind: 'sistema', text: 'Edith necesita al menos a un compañero presente para poner ideas en comun.' }])
    }
    const likelyTriggers = [
      this.world.getFlag('weder_alertado') ? 'weder:alerted' : '',
      this.world.knows('carter_y_weder_juntos') || this.world.knows('weder_y_carter_se_reunen') ? 'weder:suspicion' : '',
      this.world.getFlag('orejas_vistas') ? 'ears:examine' : '',
      'debrief:generic',
    ].filter(Boolean)
    const lines = likelyTriggers.flatMap((trigger) => this.exchange(trigger)).slice(0, 3)
    return this.resolve(
      [
        { kind: 'titular', text: 'Poner ideas en comun' },
        ...(lines.length > 0
          ? lines
          : [{ kind: 'narracion' as const, text: 'Repasais lo comprobado y separais los hechos de las sospechas. No aparece ninguna conclusion nueva.' }]),
      ],
      5,
    )
  }

  /** Destinos principales con su coste total por la ruta mas corta disponible. */
  mapDestinations(): { id: string; name: string; floor: string; minutes: number; current: boolean }[] {
    const ids = [
      'recepcion',
      'conserjeria',
      'terraza',
      'restaurante',
      'cocina',
      'salon_isis',
      'correos',
      'bar_largo',
      'salon_ali_bey',
      'sala_escombros',
      'viejo_templo',
    ]
    const underground = new Set(['salon_ali_bey', 'sala_escombros', 'viejo_templo'])
    const routeKnown =
      this.world.knows('ruta_servicio_al_sotano') ||
      this.world.knows('weder_baja_al_sotano') ||
      underground.has(this.party.focus.location)
    return ids.flatMap((id) => {
      if (underground.has(id) && !routeKnown) return []
      const route = this.shortestRoute(this.party.focus.location, id)
      const loc = this.content.locations.get(id)
      return loc && route
        ? [{ id, name: loc.name, floor: loc.floor, minutes: route.minutes, current: id === this.party.focus.location }]
        : []
    })
  }

  travelTo(to: string): Turn {
    const route = this.shortestRoute(this.party.focus.location, to)
    if (!route) throw new Error('No hay una ruta disponible hasta ese lugar')
    if (route.minutes === 0) return this.instant([{ kind: 'sistema', text: 'Ya estáis aquí.' }])
    this.party.moveTogether(to)
    return this.resolve(
      [
        { kind: 'titular', text: this.location(to).name },
        { kind: 'narracion', text: `Recorréis ${route.labels.join(', ')}.` },
      ],
      route.minutes,
    )
  }

  private shortestRoute(from: string, to: string): { minutes: number; labels: string[] } | null {
    if (from === to) return { minutes: 0, labels: [] }
    const best = new Map<string, number>([[from, 0]])
    const labels = new Map<string, string[]>([[from, []]])
    const open = new Set<string>([from])
    while (open.size > 0) {
      let current = [...open][0]!
      for (const id of open) if ((best.get(id) ?? Infinity) < (best.get(current) ?? Infinity)) current = id
      open.delete(current)
      if (current === to) return { minutes: best.get(current)!, labels: labels.get(current)! }
      const loc = this.content.locations.get(current)
      if (!loc) continue
      for (const exit of loc.exits.filter((item) => this.world.testAll(item.requires))) {
        const distance = best.get(current)! + exit.minutes
        if (distance >= (best.get(exit.to) ?? Infinity)) continue
        best.set(exit.to, distance)
        labels.set(exit.to, [...(labels.get(current) ?? []), exit.label ?? this.location(exit.to).name])
        open.add(exit.to)
      }
    }
    return null
  }

  advanceTime(minutes: number): Turn {
    return this.resolve([{ kind: 'narracion', text: 'Dejáis correr el reloj.' }], Math.max(0, minutes))
  }

  /** Moverse. El grupo que acompana al que lleva el foco se mueve con el. */
  moveTo(to: string): Turn {
    const loc = this.location(this.party.focus.location)
    const exit = loc.exits.find((e) => e.to === to)
    if (!exit) throw new Error(`No se puede ir de "${loc.id}" a "${to}"`)

    this.party.moveTogether(to)
    const lines: Line[] = [
      { kind: 'titular', text: this.location(to).name },
    ]
    return this.resolve(lines, exit.minutes)
  }

  /** Examinar un detalle de la localizacion. */
  examine(featureId: string): Turn {
    const loc = this.location(this.party.focus.location)
    const f = (loc.features ?? []).find((x) => x.id === featureId)
    if (!f) throw new Error(`Aqui no hay nada llamado "${featureId}"`)

    this.examined.add(`${loc.id}:${f.id}`)
    const lines: Line[] = []
    let ok = true
    let r: RollResult | null = null

    if (f.check) {
      r = spot(this.perception, loc.id, {
        skill: f.check.skill,
        difficulty: f.check.difficulty ?? 'regular',
      })
      ok = r?.success ?? false
      if (r) lines.push(this.rollLine(r))
    }

    lines.push({
      kind: 'narracion',
      text: (ok ? f.successText : f.failureText) ?? f.description,
    })

    const effects = ok ? f.onSuccess : f.onFailure
    for (const req of this.world.applyAll(effects)) {
      if (req.kind === 'defer') lines.push(...this.resolveDeferred(req.effect))
    }

    return this.resolve(lines, f.minutes ?? ACTION_COST.examine)
  }

  /** Preguntar algo a un PNJ. */
  ask(topicId: string, approachId = 'directo'): Turn {
    const res: AskResult = this.dialogue.ask(topicId, approachId)
    const lines: Line[] = []

    if (res.approach && res.roll) {
      for (const h of res.hooksApplied) {
        lines.push({ kind: 'sistema', text: h.note ?? '' })
      }
      lines.push(this.rollLine(res.roll))
    }
    lines.push({ kind: 'dialogo', text: res.response.text })

    for (const eff of res.deferred) lines.push(...this.resolveDeferred(eff))

    if (res.dispositionDelta !== 0) {
      const name = this.npcName(res.topic.npc)
      lines.push({
        kind: 'sistema',
        text:
          res.dispositionDelta > 0
            ? `${name} os mira con algo parecido al aprecio.`
            : `${name} os aprecia bastante menos que hace un minuto.`,
      })
    }

    return this.resolve(lines, res.minutes)
  }

  /** Espiar una conversacion en curso. */
  listenTo(conversationId: string): Turn {
    const conv = this.content.conversations.get(conversationId)
    if (!conv) throw new Error(`Conversacion desconocida: "${conversationId}"`)

    const res: EavesdropResult = eavesdrop(this.perception, conv, this.conversations)
    const lines: Line[] = []

    if (res.stealth) lines.push(this.rollLine(res.stealth))
    if (res.listen) lines.push(this.rollLine(res.listen))

    if (res.fragments.length > 0) {
      lines.push({ kind: 'narracion', text: res.narration })
      for (const f of res.fragments) lines.push({ kind: 'dialogo', text: f.text })
      lines.push({
        kind: 'sistema',
        text:
          res.remaining > 0
            ? `Se te escapan ${res.remaining} retazos mas de esa conversacion.`
            : 'No se te ha escapado nada.',
      })
    } else {
      lines.push({ kind: 'narracion', text: res.narration })
    }

    return this.resolve(lines, ACTION_COST.eavesdrop)
  }

  /** Seguir a un PNJ hasta donde vaya. */
  follow(npcId: string): Turn {
    const res: TailResult = tail(this.perception, npcId)
    const lines: Line[] = [this.rollLine(res.stealth)]

    if (res.success) {
      const dest = this.world.npc(npcId).location
      this.party.moveTogether(dest)
      lines.push({ kind: 'narracion', text: res.narration })
      lines.push({ kind: 'titular', text: this.location(dest).name })
    } else {
      lines.push({ kind: 'narracion', text: res.narration })
    }

    return this.resolve(lines, ACTION_COST.tail)
  }

  /** Dejar pasar el tiempo hasta el siguiente bloque de media hora. */
  wait(): Turn {
    return this.resolve(
      [{ kind: 'narracion', text: 'Dejais correr el reloj.' }],
      Math.min(15, this.clock.minutesToNextSequence || 15),
      [{ kind: 'clock' }],
      true,
    )
  }

  setFocus(id: string): void {
    this.party.setFocus(id)
  }

  setOrder(id: string, order: Order): void {
    this.party.setOrder(id, order)
  }

  /* ---------------------------------------------------------------- *
   * Resolucion del turno
   * ---------------------------------------------------------------- */

  /**
   * Avanza el mundo `minutes` y anade a la narracion lo que haya pasado
   * mientras tanto. Esta es la costura del juego: haces algo, y el hotel sigue
   * a lo suyo.
   */
  private resolve(lines: Line[], minutes: number, feedback: FeedbackCue[] = [], isWait = false): Turn {
    const privateKnowledge = new Map<string, Set<string>>()
    for (const state of this.assignments.values()) {
      if (state.collected) continue
      privateKnowledge.set(state.investigator, new Set(this.party.byId(state.investigator).knows))
    }
    const report: TickReport = this.scheduler.advance(minutes)

    // Durante la rebanada jugable, una escena sin testigos no entrega sus
    // conocimientos por telepatia. El mundo cambia, pero la libreta no.
    for (const fired of report.offscreen.filter((event) => event.minute <= 13 * 60)) {
      for (const effect of fired.def.effects ?? []) {
        if (effect.kind !== 'learnFact' || effect.who != null) continue
        for (const member of this.party.members) {
          member.knows = member.knows.filter((fact) => fact !== effect.fact)
        }
      }
    }

    // Un compañero separado conserva sus descubrimientos hasta la reunión.
    for (const state of this.assignments.values()) {
      if (state.collected) continue
      const inv = this.party.byId(state.investigator)
      if (inv.location === this.party.focus.location) continue
      const before = privateKnowledge.get(state.investigator) ?? new Set<string>()
      const additions = inv.knows.filter((fact) => !before.has(fact))
      if (additions.length > 0) {
        state.extraFacts.push(...additions.filter((fact) => !state.extraFacts.includes(fact)))
        inv.knows = inv.knows.filter((fact) => !additions.includes(fact))
      }
    }

    const focusId = this.party.focus.id
    for (const fired of report.witnessed) {
      if (fired.def.id === 'd1_behler_terraza' && fired.witnesses.includes(focusId)) {
        this.world.setFlag('reunion_behler')
        this.world.learnFact('fenomenos_inexplicables')
      }
      if (fired.witnesses.includes(focusId)) continue
      const state = [...this.assignments.values()].find(
        (item) => !item.collected && fired.witnesses.includes(item.investigator),
      )
      if (!state) continue
      if (fired.def.witnessText && !state.extraLines.includes(fired.def.witnessText)) {
        state.extraLines.push(fired.def.witnessText)
      }
      for (const effect of fired.def.effects ?? []) {
        if (effect.kind === 'learnFact' && effect.who == null) {
          if (!state.extraFacts.includes(effect.fact)) state.extraFacts.push(effect.fact)
          for (const member of this.party.members) {
            member.knows = member.knows.filter((fact) => fact !== effect.fact)
          }
        }
        if (effect.kind === 'unlockJournal') {
          state.extraJournal.push(effect.entry)
          const index = this.world.journal.indexOf(effect.entry)
          if (index >= 0) this.world.journal.splice(index, 1)
        }
      }
    }

    for (const state of this.assignments.values()) {
      if (state.collected || state.ready || this.clock.now < state.completesAt) continue
      const def = ASSIGNMENTS.find((candidate) => candidate.id === state.id)
      if (!def) continue
      state.roll = this.party.check(this.rng, state.investigator, def.skill, { difficulty: def.difficulty })
      state.quality = state.roll.success ? 'complete' : 'partial'
      state.ready = true
      if (!state.roll.success) {
        if (state.id === 'vance_terraza') this.world.setFlag('weder_alertado')
        if (state.id === 'vance_servicio') this.world.setFlag('personal_cocina_alertado')
        if (state.id === 'nadia_registro') this.world.adjustDisposition('clinton', -5)
        if (state.id === 'nadia_coleccion') this.world.setFlag('mahadni_sospecha_de_nadia')
      }
    }
    lines.push(...this.renderReport(report))

    // Y si el grupo acaba de entrar en una escena que ya estaba ocurriendo,
    // tambien cuenta como haberla presenciado: con su texto y con su factura de
    // Cordura, que quedo sin cobrar porque no habia nadie delante al empezar.
    for (const def of this.scheduler.witnessOngoingAt(this.party.focus.location)) {
      if (def.id === 'd1_behler_terraza') {
        this.world.setFlag('reunion_behler')
        this.world.learnFact('fenomenos_inexplicables')
      }
      if (def.witnessText) lines.push({ kind: 'narracion', text: def.witnessText })
      for (const eff of def.effects ?? []) {
        if (eff.kind === 'learnFact' && eff.who == null) {
          for (const inv of this.party.at(this.party.focus.location)) {
            this.world.learnFact(eff.fact, inv.id)
          }
        }
        if (eff.kind === 'unlockJournal') this.world.unlockJournal(eff.entry)
        if (eff.kind === 'sanityLoss' || eff.kind === 'damage') {
          lines.push(...this.resolveDeferred(eff as never))
        }
      }
    }

    if (isWait) {
      const substantive = lines.some((line) => line.text !== 'Dejais correr el reloj.')
      this.emptyWaits = substantive ? 0 : this.emptyWaits + 1
      if (this.emptyWaits >= 2) {
        lines.push({ kind: 'rastro', text: this.hotelReaction() })
        this.emptyWaits = 0
      }
    } else {
      this.emptyWaits = 0
    }

    return {
      lines: lines.filter((l) => l.text.trim().length > 0),
      minutes,
      over: this.clock.finished || this.party.wipedOut,
      feedback,
    }
  }

  private instant(lines: Line[], feedback: FeedbackCue[] = []): Turn {
    return {
      lines: lines.filter((line) => line.text.trim().length > 0),
      minutes: 0,
      over: this.clock.finished || this.party.wipedOut,
      feedback,
    }
  }

  private hotelReaction(): string {
    const reactions: Record<string, string[]> = {
      recepcion: ['Una campana reclama a un botones. Tres maletas cambian de dueño sin que nadie levante la voz.', 'El montacargas se detiene detrás del mostrador y vuelve a arrancar vacío.'],
      terraza: ['El toldo golpea una vez con el viento caliente. Una silla se arrastra en la mesa del fondo.', 'Un camarero sustituye una taza intacta por otra y guarda la primera debajo del delantal.'],
      cocina: ['La vajilla choca detrás de la puerta; después, durante cinco segundos, toda la cocina calla.', 'El montacargas sube con olor a carbón húmedo y baja sin que nadie lo abra.'],
      salon_isis: ['Las hojas de las palmeras ocultan una risa y luego solo queda el agua de la fuente.', 'Un jardinero abandona las tijeras al oír pasos en la balconada.'],
    }
    const pool = reactions[this.party.focus.location] ?? ['El hotel cambia de turno a vuestro alrededor: pasos, llaves y una puerta que se cierra lejos.']
    return pool[Math.floor(this.clock.now / 15) % pool.length]!
  }

  private renderReport(report: TickReport): Line[] {
    const lines: Line[] = []

    for (const f of report.witnessed.filter((event) => event.witnesses.includes(this.party.focus.id))) {
      if (f.def.witnessText) lines.push({ kind: 'narracion', text: f.def.witnessText })
    }
    for (const eff of report.deferred) lines.push(...this.resolveDeferred(eff))

    // Los rastros no se cuentan aqui: quedan disponibles para que el grupo los
    // encuentre cuando pase por el sitio. Perderse algo tiene que doler, pero
    // no debe cerrar la investigacion.
    for (const t of report.traces) {
      if (!this.availableTraces.some((x) => x.id === t.id)) this.availableTraces.push(t)
    }

    return lines
  }

  /** Aplica Cordura y dano, que necesitan ficha y narracion propia. */
  private resolveDeferred(effect: { kind: string; [k: string]: unknown }): Line[] {
    const lines: Line[] = []
    const here = this.party.at(this.party.focus.location)
    const targets = here.length > 0 ? here : [this.party.focus]

    if (effect['kind'] === 'sanityLoss') {
      for (const inv of targets) {
        const res = sanityCheck(this.rng, inv, String(effect['loss']), this.clock.now)
        if (res.loss > 0 || res.bout) {
          lines.push({ kind: 'cordura', text: res.narration })
        }
        // Una crisis roba tiempo de verdad, y eso es lo que duele.
        if (res.minutesLost > 0) {
          this.scheduler.advance(res.minutesLost)
          lines.push({
            kind: 'sistema',
            text: `Se pierden ${res.minutesLost} minutos antes de que ${inv.name} vuelva en si.`,
          })
        }
      }
    }

    if (effect['kind'] === 'damage') {
      const amount = rollDice(this.rng, String(effect['amount']))
      for (const inv of targets) {
        const out = this.party.applyDamage(inv.id, amount)
        lines.push({
          kind: 'sistema',
          text: out.dead
            ? `${inv.name} no se levanta.`
            : out.unconscious
              ? `${inv.name} pierde el conocimiento.`
              : `${inv.name} encaja ${amount} puntos de dano.`,
        })
      }
    }

    if (effect['kind'] === 'setInvestigatorStatus') {
      const who = String(effect['who'])
      const status = effect['status'] as Investigator['status']
      const inv = who === 'random' ? this.rng.pick(targets) : this.party.byId(who)
      inv.status = status
      lines.push({ kind: 'sistema', text: statusNarration(inv.name, status) })
    }

    return lines
  }

  private rollLine(r: RollResult): Line {
    const mods =
      r.bonus > r.penalty
        ? ` (+${r.bonus - r.penalty} bonificacion)`
        : r.penalty > r.bonus
          ? ` (+${r.penalty - r.bonus} penalizacion)`
          : ''
    return {
      kind: 'tirada',
      text: `${r.label} · ${r.value} contra ${r.target}${mods} → ${OUTCOME_LABEL[r.outcome]}`,
    }
  }

  snapshot(): GameSnapshot {
    return {
      version: 2,
      clock: this.clock.save(),
      rng: this.rng.save(),
      party: this.party.snapshot(),
      world: this.world.snapshot(),
      scheduler: this.scheduler.snapshot(),
      dialogue: this.dialogue.snapshot(),
      conversations: this.conversations.snapshot(),
      availableTraces: this.availableTraces.map((trace) => ({ ...trace })),
      examined: [...this.examined],
      assignments: [...this.assignments.values()].map((state) => ({
        ...state,
        roll: state.roll ? { ...state.roll, candidates: [...state.roll.candidates] } : null,
        extraLines: [...state.extraLines],
        extraFacts: [...state.extraFacts],
        extraJournal: [...state.extraJournal],
      })),
      completedAssignments: [...this.completedAssignments],
      pendingRoll: this.pendingRoll
        ? { ...this.pendingRoll, roll: { ...this.pendingRoll.roll, candidates: [...this.pendingRoll.roll.candidates] } }
        : null,
      resolvedScenes: [...this.resolvedScenes],
      firedExchanges: [...this.firedExchanges],
      emptyWaits: this.emptyWaits,
    }
  }

  restore(snap: GameSnapshot): void {
    if (snap.version !== 1 && snap.version !== 2) throw new Error('Esta partida pertenece a una versión incompatible')
    this.clock.restore(snap.clock)
    this.rng.restore(snap.rng)
    this.party.restore(snap.party)
    this.world.restore(snap.world)
    this.scheduler.restore(snap.scheduler)
    this.dialogue.restore(snap.dialogue)
    this.conversations.restore(snap.conversations)
    this.availableTraces = snap.availableTraces.map((trace) => ({ ...trace }))
    this.examined = new Set(snap.examined)
    this.assignments = new Map(
      snap.assignments.map((state) => [
        state.id,
        {
          ...state,
          quality: state.quality ?? null,
          roll: state.roll ? { ...state.roll, candidates: [...state.roll.candidates] } : null,
          extraLines: [...state.extraLines],
          extraFacts: [...state.extraFacts],
          extraJournal: [...state.extraJournal],
        },
      ]),
    )
    this.completedAssignments = new Set(snap.completedAssignments)
    this.pendingRoll = snap.pendingRoll
      ? { ...snap.pendingRoll, roll: { ...snap.pendingRoll.roll, candidates: [...snap.pendingRoll.roll.candidates] } }
      : null
    this.resolvedScenes = new Set(snap.resolvedScenes ?? [])
    this.firedExchanges = new Set(snap.firedExchanges ?? [])
    this.emptyWaits = snap.emptyWaits ?? 0
  }

  /* ---------------------------------------------------------------- *
   * Cierre de la rebanada
   * ---------------------------------------------------------------- */

  /**
   * Lo que viste y lo que te perdiste.
   *
   * No es decoracion: es la respuesta al riesgo de que perderse cosas frustre.
   * El modulo entero se apoya en que no puedes estar en todas partes, asi que el
   * juego tiene que rematar ensenandote el tamano de lo que se te escapo.
   */
  summary(): { seen: string[]; missed: string[]; traces: number; coverage: number } {
    const seen: string[] = []
    const missed: string[] = []

    for (const ev of this.content.events) {
      if (this.world.witnessed.has(ev.id)) {
        seen.push(ev.witnessText ?? ev.id)
      } else if (this.world.fired.has(ev.id)) {
        missed.push(ev.witnessText ?? ev.id)
      }
    }

    let heard = 0
    let total = 0
    for (const c of this.content.conversations.values()) {
      total += c.fragments.length
      heard += this.conversations.heardIn(c.id).length
    }

    return {
      seen,
      missed,
      traces: this.availableTraces.length,
      coverage: total > 0 ? heard / total : 1,
    }
  }

  /** PNJ presentes, para la interfaz. */
  npcsHere(): NpcState[] {
    return this.world.npcsAt(this.party.focus.location)
  }
}

/** Narracion para un cambio de estado de investigador que no viene de danno o Cordura. */
function statusNarration(name: string, status: Investigator['status']): string {
  switch (status) {
    case 'fled':
      return `${name} desaparece sin dejar rastro.`
    case 'detained':
      return `Detienen a ${name}.`
    case 'insane':
      return `${name} pierde la cordura para siempre.`
    case 'unconscious':
      return `${name} pierde el conocimiento.`
    case 'dead':
      return `${name} no sobrevive.`
    case 'ok':
      return `${name} vuelve en si.`
  }
}
