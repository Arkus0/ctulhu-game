/**
 * La fachada del juego.
 *
 * Une reloj, agenda, estado, grupo, percepcion y dialogo, y expone la unica
 * superficie que necesita la interfaz: mira lo que hay, haz una cosa, mira otra
 * vez. Cada accion CUESTA TIEMPO y el mundo avanza mientras la haces. Esa es la
 * regla que sostiene todo el juego.
 */
import { Clock, ACTION_COST, GAME_START, formatClock, formatFull, timeOfDay } from './clock'
import { APPROACH_NARRATION, DialogueEngine, type AskResult, type Approach, type DialogueTopic } from './dialogue'
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
import {
  canPush,
  DIFFICULTY_LABEL,
  luckCost,
  push as pushRoll,
  OUTCOME_LABEL,
  spendLuck as applyLuck,
  threshold,
  type Difficulty,
  type RollResult,
} from './rules'
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

/**
 * Lo que cuesta empujar y volver a fallar, por accion.
 *
 * La septima edicion permite repetir una tirada fallada apretando mas, con la
 * condicion de que el segundo fallo tenga una consecuencia peor. El motor solo
 * marca `pushed`; el precio lo pone el contenido, y aqui esta escrito para que
 * el jugador pueda leerlo antes de decidir. Sin esta linea, empujar seria una
 * segunda tirada gratis.
 */
const PUSH_STAKES: Record<string, string> = {
  arrival_question_clinton: 'Si insistes y vuelves a fallar, Clinton dejará de contestaros en toda la mañana.',
  behler_authority: 'Si insistes y vuelves a fallar, Behler no volverá a considerar la firma.',
  attention_listen: 'Si te acercas más y te oyen, lo sabrán los dos, no solo Weder.',
  attention_interrupt: 'Si aprietas y falla, Carter se pondrá de su lado delante de todos.',
  threshold_follow: 'Si bajas otro tramo y te ven, también te verá el jefe de cocina.',
  lounpeen_apartar: 'Si insistes con su padre mirando, Olga no os dirá nada en absoluto.',
  disk_authority: 'Si vuelves a levantar la voz y falla, Weder sabrá exactamente quién le persigue.',
  disk_snatch: 'Si insistes cuerpo a cuerpo y falla, la pelea os costará más sangre.',
}

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
  /** Lamina transitoria: permanece mientras el jugador lee este turno. */
  presentationArt?: string
}

export interface FeedbackCue {
  kind: 'location' | 'clue' | 'report' | 'roll' | 'damage' | 'sanity' | 'scene' | 'luck' | 'clock' | 'door'
  id?: string
  /** Resultado estructurado para que la interfaz no tenga que interpretar texto localizado. */
  outcome?: 'success' | 'failure'
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
  /** Mapa esquematico elegido por las reglas de contenido para esta planta. */
  mapArt: string
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
  /** Opcional: los guardados anteriores al azar de ambiente no lo traen. */
  flavorRng?: number
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
  /**
   * Azar propio para el ambiente del hotel.
   *
   * La partitura ya sigue esta regla: el planificador musical tiene su azar y no
   * consulta el RNG del juego. El ambiente necesita lo mismo. Si las frases de
   * relleno gastaran tiradas del generador comun, elegir una frase movería todos
   * los dados posteriores y dos partidas con la misma semilla dejarian de ser la
   * misma partida en cuanto una esperase un turno mas que la otra.
   */
  private readonly flavorRng: Rng

  constructor(content: Content, seed: string | number = Date.now()) {
    this.content = content
    this.rng = new Rng(seed)
    this.flavorRng = new Rng(`ambiente:${seed}`)
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
      mapArt:
        this.content.mapArt.rules.find((rule) => rule.floors.includes(loc.floor))?.art ??
        this.content.mapArt.default,
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
        ? scene.objective
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

  /**
   * Los temas abiertos con un PNJ, ordenados para que la lista no obligue a releer.
   * Lo que aun no se ha preguntado va primero; lo repetible que ya se pregunto cae
   * al final, porque volver a preguntarlo casi nunca es lo que quiere el jugador.
   */
  topicsFor(npc: string): DialogueTopic[] {
    const available = this.dialogue.available(npc)
    return [
      ...available.filter((topic) => !this.dialogue.hasAsked(topic.id)),
      ...available.filter((topic) => this.dialogue.hasAsked(topic.id)),
    ]
  }

  /** Verdadero si ese tema ya se planteo alguna vez. Lo usa la interfaz para avisar. */
  hasAskedTopic(topicId: string): boolean {
    return this.dialogue.hasAsked(topicId)
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
    // Hasta dos detalles, no uno. Ofrecer solo el primero agotaba una sala en un
    // turno y la dejaba en «Observar la escena», que es relleno: fuera de las
    // escenas guionizadas el hotel dejaba de responder enseguida.
    const detalles = (loc.features ?? []).filter(
      (item) => this.world.testAll(item.requires) && !this.examined.has(`${loc.id}:${item.id}`),
    )
    if (detalles.length > 0) {
      for (const feature of detalles.slice(0, 2)) {
        v.push({
          id: `inspect:${feature.id}`,
          kind: 'inspect',
          label: feature.name,
          hint: feature.description,
          minutes: feature.minutes ?? ACTION_COST.examine,
        })
      }
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
    const esperar: GuidedAction = {
      id: 'wait',
      kind: 'act',
      label: 'Dejar correr el reloj',
      hint: `Esperar hasta las ${formatClock(this.clock.now + waitMinutes)}.`,
      minutes: waitMinutes,
    }

    // Cinco como maximo, y una de las cinco es siempre esperar: antes iba al
    // final de la lista y el corte podia llevarsela, dejando al jugador sin
    // ninguna forma de dejar pasar el tiempo.
    return [...v.slice(0, 4), esperar]
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
        if (action.id === 'behler_authority' && this.world.getFlag('behler_impaciente')) {
          copy.difficulty = 'hard'
          copy.hint = 'Persuasión · Difícil. Le habéis hecho esperar y lo sabe.'
        }
        if (action.id === 'threshold_follow' && this.world.getFlag('weder_alertado')) {
          copy.difficulty = 'hard'
          copy.hint = 'Sigilo · Difícil. Weder ya conoce vuestra vigilancia.'
        }
        return copy
      })
    return { id: def.id, title: def.title, objective: def.objective, body: def.body, art: def.art, actions }
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

    if (this.world.knows('olga_busca_a_gasparini')) visible.push({
        id: 'olga',
        title: 'A quién espera la hija de Lounpeen',
        detail: 'Olga busca al barman del bar largo, y sabe dónde empieza siempre a buscarle.',
        deadline: '12:00 a 13:00',
        status: done(this.world.getFlag('gasparini_olga_jardin'), now >= 13 * 60),
      })
    else if (now >= 13 * 60) visible.push(this.anonymousMissed('olga'))

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
      canPush: canPush(this.pendingRoll.roll),
      pushStakes: PUSH_STAKES[this.pendingRoll.actionId] ?? 'Un segundo fallo sale más caro que el primero.',
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

    // Y solo puede hablar quien esta delante. Sin esto, Vance replicaba al informe
    // de Nadia desde la cocina, dos plantas mas abajo, mientras cumplia su encargo.
    const here = new Set(this.party.at(this.party.focus.location).map((member) => member.id))
    const canSpeak = (id: string): boolean =>
      allowSeparated || here.has(id === 'edith' ? 'harker' : id)

    const def = this.content.partyExchanges.find(
      (candidate) =>
        candidate.trigger === trigger &&
        !this.firedExchanges.has(candidate.id) &&
        candidate.lines.every((line) => canSpeak(line.speaker)) &&
        this.world.testAll(candidate.requires),
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
        { kind: 'narracion', text: 'Edith asiente a Behler cada pocos segundos, en el sitio justo, mientras aprende de memoria la mesa del fondo: Howard Carter de espaldas al salón, Heinrich Weder frente a él, las cabezas demasiado juntas y los dos mirando el reloj del hall más de lo que mira nadie que esté desayunando.' },
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
      return this.resolve([{ kind: 'narracion', text: 'Edith aguanta la puerta con dos dedos hasta que se cierra sin ruido. Abajo siguen bajando escalones. Nadie ha mirado hacia arriba, y esa es toda la ventaja que os lleváis.' }], 5)
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
    if (id === 'lounpeen_escuchar') {
      this.completeScene('lounpeen_abordaje')
      const late = this.clock.now + 25 >= 11 * 60
      if (late) this.world.setFlag('behler_impaciente')
      this.world.learnFact('olga_busca_a_gasparini')
      this.world.learnFact('gasparini_en_el_jardin_de_isis')
      this.world.unlockJournal('olga_y_el_barman')
      this.angerDieter()
      const lines: Line[] = [
        { kind: 'dialogo', text: 'Olga —«Barman. Del bar largo, no del de la terraza, que ese tiene mujer y se le nota. Gasparini. Libra hoy y no ha bajado a desayunar». Se ríe sin ganas. «Ustedes preguntan por todo el mundo. Pregunten también por él».' },
        { kind: 'narracion', text: 'Tarda media hora en contarlo y solo la última frase es información: Gasparini empieza siempre por el jardín del salón Isis, y ella lo sabe porque no es la primera vez que le busca allí.' },
      ]
      if (late) lines.push({ kind: 'sistema', text: 'Son más de las once. Behler lleva un rato solo en la terraza.' })
      lines.push(...this.exchange('lounpeen:escuchada'))
      return this.resolve(lines, 25, [{ kind: 'clue', id: 'olga' }])
    }
    if (id === 'lounpeen_apartar') {
      return this.beginSceneRoll(id, 'Lejos del periódico', 'harker', 'Charlateria', 'regular', 'Éxito: el nombre y el sitio sin que su padre lo vea. Fallo: el nombre a medias y Dieter mirando.')
    }
    if (id === 'lounpeen_excusarse') {
      this.completeScene('lounpeen_abordaje')
      this.world.setFlag('olga_esquivada')
      return this.resolve([
        { kind: 'narracion', text: 'Edith se disculpa con la fórmula que usa cuando la historia buena no es la que tiene delante. Olga no insiste: recoge el bolso, mira otra vez la puerta giratoria y se acomoda para seguir esperando.' },
        ...this.exchange('lounpeen:esquivada'),
      ], 5)
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
        [{ kind: 'narracion', text: 'Elegís la mesa desde la que se ve la escalera, la puerta del restaurante y las tres del fondo. Un camarero trae café que nadie ha pedido y no acepta que se le pague.' }],
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
    ], [{ kind: 'roll', id: actionId, outcome: result.success ? 'success' : 'failure' }])
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
    ], [{ kind: 'roll', id: actionId, outcome: result.success ? 'success' : 'failure' }])
  }

  /**
   * Empujar la tirada: repetirla apretando mas.
   *
   * No resuelve nada por si misma: sustituye la tirada pendiente por la nueva y
   * deja al jugador delante de la misma tarjeta, porque el resultado empujado
   * tambien se puede aceptar o comprar con Suerte. Lo que cambia es que un
   * fallo empujado arrastra la penalizacion de `PUSH_STAKES`.
   */
  pushPendingRoll(): Turn {
    const pending = this.pendingRoll
    if (!pending) throw new Error('No hay ninguna tirada pendiente')
    if (!canPush(pending.roll)) throw new Error('Esta tirada ya no se puede empujar')
    const actor = this.party.byId(pending.actorId)
    const repetida = pushRoll(this.rng, pending.roll)
    this.pendingRoll = { ...pending, roll: repetida }
    return this.instant(
      [
        { kind: 'narracion', text: `${actor.name} no lo deja correr y vuelve a intentarlo, esta vez sin disimular que le importa.` },
      ],
      [{ kind: 'roll', id: pending.actionId, outcome: repetida.success ? 'success' : 'failure' }],
    )
  }

  /**
   * El precio del segundo fallo. Se aplica solo cuando la tirada empujada falla,
   * y siempre encima de la consecuencia normal, nunca en su lugar.
   */
  private pushPenalty(actionId: string): Line[] {
    switch (actionId) {
      case 'arrival_question_clinton':
        this.world.adjustDisposition('clinton', -15)
        this.world.npc('clinton').suspicious = true
        return [{ kind: 'narracion', text: 'Clinton cierra el libro con las dos manos y llama al siguiente huésped por encima del hombro de Edith. Ya no hay conversación que rescatar.' }]
      case 'behler_authority':
        this.world.adjustDisposition('behler', -15)
        this.world.setFlag('behler_niega_la_firma')
        return [{ kind: 'dialogo', text: 'Behler —«Le he dicho que no una vez. Que me lo pregunte dos veces me ayuda a entender a quién he contratado».' }]
      case 'attention_listen':
      case 'attention_interrupt':
        this.world.npc('weder').suspicious = true
        this.world.adjustDisposition('carter', -10)
        return [{ kind: 'narracion', text: 'Carter se levanta a medias y pone una mano en el hombro de Weder: un gesto de propietario. A partir de ahora sois un problema de los dos.' }]
      case 'threshold_follow':
        if (this.world.hasNpc('mahadni')) this.world.npc('mahadni').suspicious = true
        return [{ kind: 'narracion', text: 'El jefe de cocina levanta la cabeza al oír el escalón y se limpia las manos muy despacio, mirando la escalera hasta que dejáis de bajar.' }]
      case 'lounpeen_apartar':
        this.world.adjustDisposition('olga', -10)
        return [{ kind: 'dialogo', text: 'Olga —«Ya no». Y se va hacia el ascensor sin terminar la frase que estaba empezando.' }]
      default:
        return []
    }
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
    // El precio de haber apretado. Va encima de la consecuencia normal del
    // fallo, nunca en su lugar: empujar no cambia lo que pasa, lo agrava.
    if (result.pushed && !result.success) lines.push(...this.pushPenalty(pending.actionId))

    if (!pending.actionId.startsWith('disk_')) {
      const feedback: FeedbackCue[] = useLuck
        ? [
            { kind: 'luck', id: pending.actionId },
            { kind: 'roll', id: pending.actionId, outcome: result.success ? 'success' : 'failure' },
          ]
        : []
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
      if (pending.actionId === 'lounpeen_apartar') {
        this.completeScene('lounpeen_abordaje')
        if (this.clock.now + 15 >= 11 * 60) this.world.setFlag('behler_impaciente')
        this.world.learnFact('olga_busca_a_gasparini')
        if (result.success) {
          this.world.learnFact('gasparini_en_el_jardin_de_isis')
          this.world.unlockJournal('olga_y_el_barman')
          lines.push({ kind: 'dialogo', text: 'Olga, en el hueco de la escalera —«Gasparini. El del bar largo. Y no me lo pregunten aquí, pregúntenlo en el jardín del salón Isis, que es donde empieza siempre».' })
          feedback.push({ kind: 'clue', id: 'olga' })
        } else {
          this.angerDieter()
          lines.push({ kind: 'narracion', text: 'Olga suelta un nombre —Gasparini— y se calla en seco: su padre ha doblado el periódico y viene por el pasillo sin prisa, que es como camina la gente que ya ha decidido lo que va a decir.' })
        }
        return this.resolve(lines, 15, feedback)
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
      // Empujar el forcejeo y volver a fallar cuesta mas sangre: es el precio
      // que la septima edicion exige a la segunda tirada.
      const damage = rollDice(this.rng, result.pushed ? '1D6' : '1D3')
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
        text: 'Weder se guarda el disco en el forro de la chaqueta sin dejar de miraros, y por primera vez en toda la mañana no sonríe. Ya no hace falta: ahora sabe cómo os llamáis.',
      })
    }
    return this.resolve(lines, 5, [
      ...(useLuck
        ? [
            { kind: 'luck' as const, id: pending.actionId },
            { kind: 'roll' as const, id: pending.actionId, outcome: result.success ? 'success' as const : 'failure' as const },
          ]
        : []),
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
    ], [{ kind: 'report', id: state.id }, { kind: 'clue', id: state.id }], def.reportArt)
  }

  /**
   * La conversacion reactiva normal es gratuita. Esta accion existe para que
   * el jugador pueda detenerse deliberadamente a ordenar lo averiguado.
   */
  debrief(): Turn {
    const present = this.party.at(this.party.focus.location)
    if (present.length < 2) {
      return this.instant([{ kind: 'sistema', text: 'Edith necesita al menos a un compañero delante para poner ideas en común.' }])
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
        { kind: 'titular', text: 'Poner ideas en común' },
        ...(lines.length > 0
          ? lines
          : [{ kind: 'narracion' as const, text: 'Repasáis lo comprobado y separáis los hechos de las sospechas. No sale de ahí ninguna conclusión nueva.' }]),
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
    const from = this.party.focus.location
    const route = this.shortestRoute(from, to)
    if (!route) throw new Error('No hay una ruta disponible hasta ese lugar')
    if (route.minutes === 0) return this.instant([{ kind: 'sistema', text: 'Ya estáis aquí.' }])
    this.party.moveTogether(to)
    return this.resolve(
      [
        { kind: 'titular', text: this.location(to).name },
        {
          kind: 'narracion',
          text: journeyText(this.location(from).name, route.through, this.location(to).name),
        },
      ],
      route.minutes,
    )
  }

  /**
   * Ruta mas corta. Devuelve las salas que se atraviesan por el camino, sin el
   * origen ni el destino.
   *
   * Antes devolvia los `label` de las salidas, que son rotulos de boton escritos en
   * infinitivo —«Volver al hall», «Salir a la terraza»— y al enlazarlos salian
   * frases como «Recorréis Volver al hall, Salir a la terraza». Un rotulo de
   * interfaz no es el nombre de un sitio.
   */
  private shortestRoute(from: string, to: string): { minutes: number; through: string[] } | null {
    if (from === to) return { minutes: 0, through: [] }
    const best = new Map<string, number>([[from, 0]])
    const path = new Map<string, string[]>([[from, []]])
    const open = new Set<string>([from])
    while (open.size > 0) {
      let current = [...open][0]!
      for (const id of open) if ((best.get(id) ?? Infinity) < (best.get(current) ?? Infinity)) current = id
      open.delete(current)
      if (current === to) {
        const crossed = path.get(current)!
        return { minutes: best.get(current)!, through: crossed.slice(0, -1).map((id) => this.location(id).name) }
      }
      const loc = this.content.locations.get(current)
      if (!loc) continue
      for (const exit of loc.exits.filter((item) => this.world.testAll(item.requires))) {
        const distance = best.get(current)! + exit.minutes
        if (distance >= (best.get(exit.to) ?? Infinity)) continue
        best.set(exit.to, distance)
        path.set(exit.to, [...(path.get(current) ?? []), exit.to])
        open.add(exit.to)
      }
    }
    return null
  }

  advanceTime(minutes: number): Turn {
    return this.resolve([{ kind: 'narracion', text: WAIT_LINE }], Math.max(0, minutes))
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

    return this.resolve(
      lines,
      f.minutes ?? ACTION_COST.examine,
      r ? [{ kind: 'roll', id: `${loc.id}:${f.id}`, outcome: r.success ? 'success' : 'failure' }] : [],
    )
  }

  /**
   * Preguntar algo a un PNJ.
   *
   * Sin `approachId` decide el motor con que registro se plantea la pregunta. El
   * jugador ya no elige el tono, asi que hay que contarselo: quien lleva la voz,
   * como lo ha planteado y que gancho del personaje ha saltado. Eso es lo que
   * explica el dado, y sin ello la tirada automatica parece arbitraria.
   */
  ask(topicId: string, approachId?: string): Turn {
    const res: AskResult = this.dialogue.ask(topicId, approachId)
    const lines: Line[] = []

    if (res.approach && res.roll) {
      if (res.speakerName) {
        const how = APPROACH_NARRATION[res.approach.id] ?? 'lo pregunta'
        // Por el nombre de pila: dentro del grupo nadie se llama por los apellidos.
        lines.push({ kind: 'narracion', text: `${res.speakerName.split(' ')[0]!} ${how}.` })
      }
      for (const h of res.hooksApplied) {
        if (h.note) lines.push({ kind: 'sistema', text: h.note })
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

    return this.resolve(
      lines,
      res.minutes,
      res.roll ? [{ kind: 'roll', id: topicId, outcome: res.roll.success ? 'success' : 'failure' }] : [],
    )
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
            ? `Se os escapan ${res.remaining} retazos más de esa conversación.`
            : 'No se os ha escapado nada.',
      })
    } else {
      lines.push({ kind: 'narracion', text: res.narration })
    }

    return this.resolve(lines, ACTION_COST.eavesdrop, [
      { kind: 'roll', id: conversationId, outcome: res.fragments.length > 0 ? 'success' : 'failure' },
    ])
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

    return this.resolve(lines, ACTION_COST.tail, [
      { kind: 'roll', id: npcId, outcome: res.success ? 'success' : 'failure' },
    ])
  }

  /** Dejar pasar el tiempo hasta el siguiente bloque de media hora. */
  wait(): Turn {
    return this.resolve(
      [{ kind: 'narracion', text: WAIT_LINE }],
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
    let presentationArt = [...report.witnessed]
      .reverse()
      .find((event) => event.witnesses.includes(this.party.focus.id) && event.def.art)?.def.art

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
      presentationArt ??= def.art
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
      const substantive = lines.some((line) => line.text !== WAIT_LINE)
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
      presentationArt,
    }
  }

  private instant(lines: Line[], feedback: FeedbackCue[] = [], presentationArt?: string): Turn {
    return {
      lines: lines.filter((line) => line.text.trim().length > 0),
      minutes: 0,
      over: this.clock.finished || this.party.wipedOut,
      feedback,
      presentationArt,
    }
  }

  /**
   * El precio de hablar con Olga en publico. Es su gancho de caracter: cualquier
   * insinuacion sobre su hija, o pillarles simplemente charlando con ella, os
   * convierte en gente non grata. `suspicious` mete un dado de penalizacion en
   * todo lo que se le pregunte a partir de ahora.
   */
  private angerDieter(): void {
    this.world.setFlag('dieter_hostil')
    this.world.adjustDisposition('dieter', -40)
    if (this.world.hasNpc('dieter')) this.world.npc('dieter').suspicious = true
  }

  /**
   * La reaccion del hotel cuando el jugador encadena esperas vacias.
   *
   * Antes cubria cuatro salas con dos frases cada una y elegia con el reloj
   * (`clock.now / 15`), asi que alternaba las dos mismas frases y una hora de
   * espera se leia dos veces. Ahora cubre las once salas jugables y elige con el
   * RNG de la partida, que es determinista por semilla pero distinto entre
   * partidas. La regla del scheduler dice que el mundo sigue andando aunque no
   * mires; esto es lo unico que el jugador oye de eso mientras espera.
   */
  private hotelReaction(): string {
    // Reservado a que alguien del grupo este fuera cumpliendo un encargo. Es la
    // unica ventana a un compañero separado antes de que vuelva con su informe,
    // y por eso no puede salir cuando estan los tres delante.
    const away: string[] = []
    if (this.companionBusy('nadia')) {
      away.push('Dos plantas más allá alguien pide en árabe que le dejen ver una página otra vez. Le contestan que no, en inglés.')
    }
    if (this.companionBusy('vance')) {
      away.push('Una puerta de servicio se abre y se cierra en el ala norte con la calma de quien ha decidido que tiene derecho a estar ahí.')
    }
    if (away.length > 0 && this.flavorRng.chance(35)) return away[this.flavorRng.int(0, away.length - 1)]!

    const reactions: Record<string, string[]> = {
      recepcion: [
        'Una campana reclama a un botones. Tres maletas cambian de dueño sin que nadie levante la voz.',
        'El montacargas se detiene detrás del mostrador y vuelve a arrancar vacío.',
        'Clinton cambia la hoja del registro y alisa la anterior con el canto de la mano antes de guardarla.',
      ],
      conserjeria: [
        'Los hermanos Meyer entran con equipaje ajeno, lo dejan numerado y salen sin cruzar palabra con nadie.',
        'Suena un timbre en el tablero de llaves. Nadie mira qué habitación lo ha pulsado.',
        'Un mozo repasa la lista de excursiones al Fayum con el lápiz detrás de la oreja y no apunta nada.',
      ],
      terraza: [
        'El toldo golpea una vez con el viento caliente. Una silla se arrastra en la mesa del fondo.',
        'Un camarero sustituye una taza intacta por otra y guarda la primera debajo del delantal.',
        'Abajo, en la calle, un vendedor de escarabajos falsos levanta la vista hacia la terraza y calcula.',
      ],
      restaurante: [
        'El metre recoloca por tercera vez los cubiertos de una mesa que nadie ha ocupado.',
        'De la cocina sale un olor a carbón húmedo que no pega con nada de lo que hay en la carta.',
        'Dos camareros se cruzan en la puerta de vaivén y ninguno de los dos lleva nada en las manos.',
      ],
      cocina: [
        'La vajilla choca detrás de la puerta; después, durante cinco segundos, toda la cocina calla.',
        'El montacargas sube con olor a carbón húmedo y baja sin que nadie lo abra.',
        'Un pinche lleva fregando la misma cazuela desde que entrasteis y os da la espalda con mucho cuidado.',
      ],
      salon_isis: [
        'Las hojas de las palmeras ocultan una risa y luego solo queda el agua de la fuente.',
        'Un jardinero abandona las tijeras al oír pasos en la balconada.',
        'La puerta del jardín se queda entreabierta el tiempo justo para que salga alguien sin que se le vea la cara.',
      ],
      correos: [
        'La máquina de telegrafía arranca sola, escupe cuatro palabras y se para.',
        'Thornhill separa un sobre del montón y lo deja boca abajo, debajo del secante.',
        'Un botones espera un cambio de sello con la gorra en la mano y sin ninguna prisa.',
      ],
      bar_largo: [
        'El hielo se asienta en una copa que nadie ha pedido y que ya estaba ahí cuando entrasteis.',
        'El ventilador reparte el humo de un puro que se apagó hace rato.',
        'El hueco de detrás de la barra está limpio y ordenado como un sitio del que se han ido con tiempo de sobra.',
      ],
      salon_ali_bey: [
        'La bombilla del pasillo baja de intensidad, aguanta y vuelve. Aquí abajo eso pasa cada pocos minutos.',
        'Una de las cajas cruje al reasentarse. No la ha tocado nadie.',
        'Corre un aire que no viene de la escalera: viene de más adentro, y viene más frío.',
      ],
      sala_escombros: [
        'Cae arenilla del techo en una línea recta y deja de caer de golpe.',
        'El eco devuelve vuestros pasos con medio segundo de más, como si el pasillo fuese más largo de lo que se ve.',
        'Algo se arrastra al fondo del túnel, se detiene cuando os detenéis, y espera.',
      ],
      viejo_templo: [
        'La linterna encuentra una pared pintada, y la pintura está demasiado entera para llevar tres mil años ahí.',
        'El polvo del suelo tiene huellas que van y vienen: mucha gente, muchas veces, hace poco.',
        'Se oye agua muy abajo, y entre trago y trago hay un silencio que no dura siempre lo mismo.',
      ],
    }
    const pool = reactions[this.party.focus.location] ?? [
      'El hotel cambia de turno a vuestro alrededor: pasos, llaves y una puerta que se cierra lejos.',
      'En algún pasillo alguien discute en voz muy baja, que es como se discute en los sitios caros.',
    ]
    return pool[this.flavorRng.int(0, pool.length - 1)]!
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
    const presentes = here.length > 0 ? here : [this.party.focus]

    /**
     * A quien le toca pagar.
     *
     * `sanityLoss` y `damage` declaran `who` desde el primer dia y esto lo
     * ignoraba, asi que cobraba a todo el que estuviera delante: la opcion
     * «Ponerse delante de Nadia y de Vance» les cobraba Cordura a Nadia y a
     * Vance, justo lo contrario de lo que promete el boton. `who` solo se
     * respeta aqui: `setInvestigatorStatus` usa la palabra «random», que no es
     * el identificador de nadie, y elige entre los presentes mas abajo.
     */
    const victimas = (): Investigator[] => {
      const who = typeof effect['who'] === 'string' ? (effect['who'] as string) : null
      if (!who) return presentes
      const senalado = this.party.members.find((inv) => inv.id === who)
      return senalado ? [senalado] : presentes
    }

    if (effect['kind'] === 'sanityLoss') {
      for (const inv of victimas()) {
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
      for (const inv of victimas()) {
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
      const inv = who === 'random' ? this.rng.pick(presentes) : this.party.byId(who)
      inv.status = status
      lines.push({ kind: 'sistema', text: statusNarration(inv.name, status) })
    }

    return lines
  }

  private rollLine(r: RollResult): Line {
    const mods =
      r.bonus > r.penalty
        ? ` (${dice(r.bonus - r.penalty)} de bonificación)`
        : r.penalty > r.bonus
          ? ` (${dice(r.penalty - r.bonus)} de penalización)`
          : ''
    const required = threshold(r.target, r.difficulty)
    const verdict = r.success
      ? `prueba superada (${OUTCOME_LABEL[r.outcome]})`
      : 'prueba fallida'
    return {
      kind: 'tirada',
      text: `${r.label} · Tirada ${r.value}; necesitabas ${required} o menos (dificultad ${DIFFICULTY_LABEL[r.difficulty]}, habilidad ${r.target})${mods} → ${verdict}`,
    }
  }

  snapshot(): GameSnapshot {
    return {
      version: 2,
      clock: this.clock.save(),
      rng: this.rng.save(),
      flavorRng: this.flavorRng.save(),
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
    if (snap.flavorRng != null) this.flavorRng.restore(snap.flavorRng)
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
/**
 * El trayecto, contado con los nombres de las salas.
 *
 * Se construye de manera que no pueda quedar mal con ninguna combinacion: o hay
 * salas por medio y se enumeran, o no las hay y se dice que el camino es directo.
 */
/** El texto de dejar correr el reloj. Una comparacion depende de el, asi que vive aqui. */
const WAIT_LINE = 'Dejáis correr el reloj.'

/** «un dado» / «dos dados», que es como lo dice el reglamento. */
function dice(n: number): string {
  return n === 1 ? 'un dado' : `${n} dados`
}

function journeyText(from: string, through: string[], to: string): string {
  const origen = lowerArticle(from)
  const destino = lowerArticle(to)
  if (through.length === 0) return `De ${origen} a ${destino}, sin rodeos.`
  const pasos = through.map(lowerArticle)
  const list =
    pasos.length === 1 ? pasos[0]! : `${pasos.slice(0, -1).join(', ')} y ${pasos[pasos.length - 1]!}`
  return `De ${origen} a ${destino}, pasando por ${list}.`
}

/**
 * Los nombres de sala llevan articulo en mayuscula porque encabezan un rotulo:
 * «La terraza», «El restaurante». Dentro de una frase eso chirria.
 */
function lowerArticle(name: string): string {
  return name.replace(/^(El|La|Los|Las) /, (match) => match.toLowerCase())
}

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
