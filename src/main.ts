import { loadContent, ContentError } from './content/index'
import { Game, type GameSnapshot, type Line, type Turn } from './engine/game'
import { DEFAULT_TOPIC_MINUTES, type DialogueTopic } from './engine/dialogue'
import type { GuidedAction } from './engine/adventure'
import { DIFFICULTY_LABEL, threshold } from './engine/rules'
import { ArtRenderer, type TimeOfDay } from './ui/art'
import { AudioManager, type AudioBus, type AudioZone, type MusicState, type SynthCue } from './ui/audio'
import './ui/style.css'

type Mode =
  | { kind: 'root' }
  | { kind: 'talk' }
  | { kind: 'topics'; npc: string; page?: number }
  | { kind: 'end' }

/**
 * Cuantas opciones caben sin robarle sitio a la lamina ni a la caja de texto.
 * Con tres hacian falta tres paginas para agotar a un personaje que tiene nueve
 * temas abiertos; con la fila compacta de navegacion caben cuatro y todavia se ve
 * el boton de volver sin rodar el panel.
 */
const PER_PAGE = 4

/** Alto que reserva la barra de paginacion dentro del cuadro de narracion. */
const PAGINATION_HEIGHT = 30

type AppPhase = 'title' | 'intro' | 'playing' | 'ending'

interface IntroFrame {
  until: number
  kind: 'image' | 'party'
  art?: string
  alt?: string
  kicker?: string
  title?: string
  body?: string
}

interface HistoryEntry { time: string; lines: Line[] }
interface SaveEnvelope {
  version: 1 | 2
  savedAt: string
  time: string
  place: string
  game: GameSnapshot
  history: HistoryEntry[]
}

interface AudioIntent {
  investigation?: boolean
  revelation?: boolean
}

const SAVE_PREFIX = 'la-broma-macabra.save.'
const INTRO_FRAMES: IntroFrame[] = [
  {
    until: 4_000,
    kind: 'image',
    art: 'escena_disco_solar',
    alt: 'El Disco Solar emerge entre las sombras del templo',
    kicker: 'UNA AVENTURA EN EL CAIRO',
    title: 'EL DISCO EGIPCIO',
  },
  {
    until: 10_000,
    kind: 'image',
    art: 'escena_llegada_hall',
    alt: 'Tres investigadores llegan a la recepción del Hotel Shepheard’s',
    kicker: 'EL CAIRO · 21 DE NOVIEMBRE DE 1922',
    title: 'HOTEL SHEPHEARD’S · 09:00',
  },
  {
    until: 17_000,
    kind: 'party',
    kicker: 'TRES INVESTIGADORES',
  },
  {
    until: 23_000,
    kind: 'image',
    art: 'escena_llegada_hall',
    alt: 'Edith, Nadia y Vance se presentan ante el recepcionista',
    kicker: 'UN TELEGRAMA DE CHARLES BEHLER',
    body: 'Investigar fenómenos inexplicables. Con discreción.',
  },
]
const INTRO_DURATION = INTRO_FRAMES.at(-1)?.until ?? 23_000
const $ = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Falta el elemento #${id} en el HTML`)
  return element as T
}

class UI {
  private phase: AppPhase = 'title'
  /** Ultima escena cuya descripcion se narro, para no repetirla en cada turno. */
  private narratedScene: string | null = null
  private mode: Mode = { kind: 'root' }
  private game: Game
  private readonly content: ReturnType<typeof loadContent>
  private readonly seedOverride: string | null
  private typing: (() => void) | null = null
  private history: HistoryEntry[] = []
  private pages: Line[][] = []
  private pageIndex = 0
  /** Arte de un suceso o informe; se descarta al iniciar la siguiente accion. */
  private presentationArt: string | null = null
  private readonly art: ArtRenderer
  private readonly audio = new AudioManager()
  private introElapsed = 0
  private introTimer: ReturnType<typeof setTimeout> | null = null
  private panelReturnFocus: HTMLElement | null = null
  private readonly gameRoot = $('game')
  private readonly front = $('front')
  private readonly frontImage = $<HTMLImageElement>('front-image')
  private readonly frontParty = $('front-party')
  private readonly frontCopy = $('front-copy')
  private readonly frontActions = $('front-actions')
  private readonly log = $('log')
  private readonly choices = $('choices')
  private readonly time = $('hud-time')
  private readonly place = $('hud-place')
  private readonly title = $('scene-title')
  private readonly sceneSummary = $('scene-summary')
  private readonly objective = $('objective-text')
  private readonly panel = $('panel')
  private readonly panelBody = $('panel-body')
  private readonly scene = $('scene')
  private readonly portrait = $('portrait')
  private readonly portraitImg = $<HTMLImageElement>('portrait-img')
  private readonly portraitName = $('portrait-name')
  private readonly condition = $('hud-condition')
  /**
   * Avisos pendientes de leer sobre Caso y Equipo.
   *
   * El destello de 520 ms se pierde si el jugador estaba leyendo la narracion
   * cuando ocurrio, y entonces una pista nueva o un informe listo solo se
   * descubren abriendo el panel a ciegas. El distintivo aguanta hasta que se
   * abre el panel correspondiente.
   */
  private readonly unread = { case: false, team: false }
  /** Hora del ultimo repintado, para saber si el reloj ha saltado. */
  private lastPaintedTime = ''

  constructor(content: ReturnType<typeof loadContent>, seedOverride: string | null) {
    this.content = content
    this.seedOverride = seedOverride
    this.game = this.newGame()
    this.art = new ArtRenderer($<HTMLCanvasElement>('art'))
    $('hud-map').addEventListener('click', () => this.showMap())
    $('hud-case').addEventListener('click', () => {
      this.unread.case = false
      this.showCase()
      // Abrir un panel no repinta la partida, y el distintivo vive en el HUD.
      this.renderBadges(this.game.view())
    })
    $('hud-team').addEventListener('click', () => {
      this.unread.team = false
      this.showTeam()
      this.renderBadges(this.game.view())
    })
    $('hud-save').addEventListener('click', () => this.showSaves())
    $('hud-log').addEventListener('click', () => this.showHistory())
    $('hud-audio').addEventListener('click', () => this.showAudio())
    $('hud-audio').setAttribute('aria-pressed', String(this.audio.preferences.muted))
    $('panel-close').dataset['audioCue'] = 'cancel'
    $('panel-close').addEventListener('click', () => this.closePanel())
    this.log.addEventListener('click', () => this.typing?.())
    document.addEventListener('keydown', (event) => this.key(event))
    document.addEventListener('click', (event) => {
      const target = event.target
      const button = target instanceof Element ? target.closest('button') : null
      if (!button) return
      if (button.getAttribute('aria-disabled') === 'true') this.audio.playCue('unavailable')
      else this.audio.playCue(button.dataset['audioCue'] === 'cancel' ? 'cancel' : 'select')
    }, { capture: true })
    document.addEventListener('visibilitychange', () => this.audio.setPageHidden(document.hidden))
    window.addEventListener('beforeunload', () => this.audio.dispose(), { once: true })

    const unlockListeners = new AbortController()
    const unlockAudio = (): void => {
      void this.audio.unlock().then(() => {
        this.syncAppAudio()
        unlockListeners.abort()
      }).catch(() => undefined)
    }
    document.addEventListener('pointerdown', unlockAudio, { signal: unlockListeners.signal })
    document.addEventListener('keydown', unlockAudio, { signal: unlockListeners.signal })
    this.audio.setBaseMusicState('silent')
  }

  async start(): Promise<void> {
    const skipIntro = new URLSearchParams(location.search).get('skipIntro') === '1'
    if (skipIntro) return this.startFreshGame()
    this.showTitle()
  }

  private newGame(): Game {
    return new Game(this.content, this.seedOverride ?? String(Date.now()))
  }

  private async startFreshGame(): Promise<void> {
    this.cancelIntroTimer()
    this.game = this.newGame()
    this.narratedScene = null
    this.history = []
    this.pages = []
    this.pageIndex = 0
    this.presentationArt = null
    this.mode = { kind: 'root' }
    this.phase = 'playing'
    this.front.hidden = true
    this.gameRoot.hidden = false
    this.closePanel(false)
    const view = this.game.view()
    this.write([
      { kind: 'titular', text: 'EL DISCO EGIPCIO' },
      {
        kind: 'narracion',
        text: 'Hotel Shepheard’s, El Cairo. Martes 21 de noviembre de 1922, nueve de la mañana. Un telegrama del director os ha traído hasta aquí: «fenómenos inexplicables», decía, y «ruego discreción». Fuera hace ya treinta grados y el polvo se pega a la piel.',
      },
      {
        kind: 'sistema',
        text: 'Caso reúne lo descubierto; Mapa mueve; Equipo coordina. Un compañero separado conserva lo que sabe hasta volver a reunirse.',
      },
      { kind: 'titular', text: view.location.name },
      // Con una escena abierta, su descripcion y la de la sala cuentan lo mismo
      // dos veces y obligan a pasar dos paginas antes de la primera decision.
      ...(view.scene ? [] : [{ kind: 'narracion' as const, text: view.description }]),
      ...this.sceneOpeningLines(),
    ])
    await this.paint()
  }

  private showTitle(): void {
    this.cancelIntroTimer()
    this.phase = 'title'
    this.audio.setBaseMusicState('silent')
    this.gameRoot.hidden = true
    this.front.hidden = false
    this.front.dataset['view'] = 'title'
    this.front.dataset['frame'] = '0'
    this.frontImage.hidden = false
    this.frontImage.src = 'art/escena_disco_solar.png'
    this.frontImage.alt = 'El Disco Solar bajo el templo del Hotel Shepheard’s'
    this.frontParty.hidden = true
    this.frontParty.replaceChildren()
    this.frontCopy.replaceChildren(
      this.frontText('p', 'UNA AVENTURA EN EL CAIRO', 'front-kicker'),
      this.frontText('h1', 'EL DISCO EGIPCIO'),
      this.frontText('p', 'EL CAIRO · 1922', 'front-subtitle'),
    )
    this.frontActions.replaceChildren()
    this.frontButton('Nueva partida', () => void this.beginIntro(), 'primary')
    const latest = this.latestSave()
    if (latest) this.frontButton(`Continuar · ${latest.time}`, () => void this.continueFrom(latest))
    this.frontButton('Sonido', () => this.showTitleAudio())
    this.frontButton('Cómo jugar', () => this.showHelp())
    this.focusFirstFrontButton()
  }

  private async beginIntro(): Promise<void> {
    await this.audio.unlock().catch(() => undefined)
    this.phase = 'intro'
    this.audio.setBaseMusicState('intro')
    this.introElapsed = 0
    this.renderIntroFrame()
    this.scheduleIntroFrame()
  }

  private renderIntroFrame(): void {
    const index = INTRO_FRAMES.findIndex((frame) => this.introElapsed < frame.until)
    if (index < 0) {
      void this.finishIntro()
      return
    }
    const frame = INTRO_FRAMES[index]!
    this.front.hidden = false
    this.gameRoot.hidden = true
    this.front.dataset['view'] = 'intro'
    this.front.dataset['frame'] = String(index)
    this.frontCopy.replaceChildren()
    if (frame.kicker) this.frontCopy.append(this.frontText('p', frame.kicker, 'front-kicker'))
    if (frame.title) this.frontCopy.append(this.frontText('h1', frame.title))
    if (frame.body) this.frontCopy.append(this.frontText('p', frame.body, 'front-subtitle'))
    this.frontImage.hidden = frame.kind === 'party'
    this.frontParty.hidden = frame.kind !== 'party'
    if (frame.kind === 'image') {
      this.frontImage.src = `art/${frame.art}.png`
      this.frontImage.alt = frame.alt ?? ''
      this.frontParty.replaceChildren()
    } else {
      this.renderIntroParty()
    }
    this.frontActions.replaceChildren()
    this.frontButton('Saltar intro', () => void this.finishIntro(), 'skip')
    this.animateFront(frame.kind === 'party' ? [this.frontParty, this.frontCopy] : [this.frontImage, this.frontCopy])
  }

  private renderIntroParty(): void {
    this.frontParty.replaceChildren()
    for (const [id, name] of [['edith', 'Edith Harker'], ['nadia', 'Nadia Farouk'], ['vance', 'Samuel Vance']] as const) {
      const card = document.createElement('figure')
      card.className = 'front-character'
      const image = document.createElement('img')
      image.src = `art/hojas/${id}.png`
      image.alt = name
      const caption = document.createElement('figcaption')
      caption.textContent = name
      card.append(image, caption)
      this.frontParty.append(card)
    }
  }

  private scheduleIntroFrame(): void {
    this.cancelIntroTimer()
    const frame = INTRO_FRAMES.find((candidate) => this.introElapsed < candidate.until)
    if (!frame) return void this.finishIntro()
    this.introTimer = setTimeout(() => {
      this.introElapsed = frame.until
      this.renderIntroFrame()
      if (this.phase === 'intro') this.scheduleIntroFrame()
    }, frame.until - this.introElapsed)
  }

  private cancelIntroTimer(): void {
    if (this.introTimer) clearTimeout(this.introTimer)
    this.introTimer = null
  }

  private async finishIntro(): Promise<void> {
    if (this.phase !== 'intro') return
    this.cancelIntroTimer()
    await this.startFreshGame()
  }

  private async continueFrom(save: SaveEnvelope): Promise<void> {
    await this.audio.unlock().catch(() => undefined)
    this.phase = 'playing'
    this.front.hidden = true
    this.gameRoot.hidden = false
    await this.loadSave(save)
  }

  private latestSave(): SaveEnvelope | null {
    return [1, 2, 3]
      .map((slot) => this.readSave(slot))
      .filter((save): save is SaveEnvelope => save != null)
      .sort((a, b) => (Date.parse(b.savedAt) || 0) - (Date.parse(a.savedAt) || 0))[0] ?? null
  }

  private showHelp(): void {
    this.front.dataset['view'] = 'info'
    this.frontImage.hidden = false
    this.frontImage.src = 'art/mapa_plantas.png'
    this.frontImage.alt = 'Mapa del Hotel Shepheard’s'
    this.frontParty.hidden = true
    this.frontCopy.replaceChildren(
      this.frontText('h2', 'CÓMO JUGAR'),
      this.frontText('p', 'Elige con el ratón o las teclas 1–9.'),
      this.frontText('p', 'Cada acción consume minutos.'),
      this.frontText('p', 'Mapa mueve · Caso reúne pistas · Equipo coordina.'),
      this.frontText('p', 'Espacio o Intro completa el texto. F activa pantalla completa.'),
    )
    this.frontActions.replaceChildren()
    this.frontButton('Volver', () => this.showTitle(), 'primary', 'cancel')
    this.focusFirstFrontButton()
  }

  private showTitleAudio(): void {
    this.front.dataset['view'] = 'info'
    this.frontImage.hidden = false
    this.frontImage.src = 'art/escena_disco_solar.png'
    this.frontImage.alt = ''
    this.frontParty.hidden = true
    this.frontCopy.replaceChildren(this.frontText('h2', 'SONIDO'))
    this.appendAudioControls(this.frontCopy)
    this.frontActions.replaceChildren()
    this.frontButton('Volver', () => this.showTitle(), 'primary', 'cancel')
    this.focusFirstFrontButton()
  }

  private frontText(tag: 'h1' | 'h2' | 'p', text: string, className = ''): HTMLElement {
    const element = document.createElement(tag)
    element.textContent = text
    element.className = className
    return element
  }

  private frontButton(label: string, onClick: () => void, className = '', audioCue: 'select' | 'cancel' = 'select'): void {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = label
    button.className = className
    button.dataset['audioCue'] = audioCue
    button.addEventListener('click', onClick)
    this.frontActions.append(button)
  }

  private focusFirstFrontButton(): void {
    window.setTimeout(() => this.frontActions.querySelector('button')?.focus(), 0)
  }

  private animateFront(elements: HTMLElement[]): void {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    for (const element of elements) {
      element.animate(
        [{ opacity: 0.72 }, { opacity: 1 }],
        { duration: 620, easing: 'steps(6, end)' },
      )
    }
  }

  private syncAppAudio(): void {
    if (this.phase === 'intro') this.audio.setBaseMusicState('intro')
    else if (this.phase === 'playing') this.syncAudio(this.game.view())
    else this.audio.setBaseMusicState('silent')
  }

  private async paint(): Promise<void> {
    const view = this.game.view()
    // El reloj es el antagonista y hasta ahora cambiaba de cifra sin avisar.
    if (this.lastPaintedTime && this.lastPaintedTime !== view.time) {
      this.time.classList.remove('clock-ticked')
      // Reiniciar la animacion: sin esto, dos saltos seguidos solo animan uno.
      void this.time.offsetWidth
      this.time.classList.add('clock-ticked')
    }
    this.lastPaintedTime = view.time
    this.time.textContent = view.time
    this.place.textContent = view.location.name
    this.renderCondition(view)
    this.renderBadges(view)
    this.title.textContent = view.scene?.title ?? view.location.name
    // El cuerpo de la escena ya ocupa la barra OBJETIVO. Repetirlo sobre la
    // lamina tapaba caras, salidas y objetos en los encuadres panoramicos.
    this.sceneSummary.textContent = ''
    this.sceneSummary.hidden = true
    this.objective.textContent = view.objective
    this.scene.classList.toggle('scene-alert', view.scene != null)
    this.syncAudio(view)
    await this.art.draw(this.presentationArt ?? view.art, view.timeOfDay as TimeOfDay)
    this.renderChoices()
  }

  /**
   * Retrato de quien tiene la palabra.
   *
   * La interfaz no conoce a ningun personaje por su nombre: pregunta al juego
   * que retrato corresponde al PNJ con el que se esta hablando. Si ese PNJ
   * todavia no tiene lamina, el elemento se queda oculto, igual que el fondo
   * cae en el dibujo procedimental cuando falta el PNG.
   */
  private renderPortrait(): void {
    const npc = this.mode.kind === 'topics' ? this.mode.npc : null
    const file = npc ? this.game.npcPortrait(npc) : undefined
    if (!npc || !file) {
      this.portrait.hidden = true
      return
    }

    const src = `art/retratos/${file}.png`
    this.portraitName.textContent = this.game.npcName(npc)
    if (this.portraitImg.getAttribute('src') !== src) {
      this.portrait.hidden = true
      this.portraitImg.onload = (): void => {
        this.portrait.hidden = false
      }
      this.portraitImg.onerror = (): void => {
        this.portrait.hidden = true
      }
      this.portraitImg.setAttribute('src', src)
      return
    }
    this.portrait.hidden = this.portraitImg.naturalWidth === 0
  }

  private renderChoices(): void {
    const view = this.game.view()
    this.syncAudio(view)
    this.renderPortrait()
    this.choices.replaceChildren()
    if (view.pendingRoll) return this.renderRoll()
    if (view.finished || this.mode.kind === 'end') {
      this.heading('Fin de la primera mañana')
      this.button('Ver las consecuencias', () => this.showEnding(), undefined, 'urgent')
      return
    }
    if (this.mode.kind === 'talk') {
      this.heading('¿Con quién habla Edith?')
      for (const npc of view.npcs.filter((item) => this.game.topicsFor(item.id).length > 0).slice(0, PER_PAGE)) {
        this.button(`${npc.name}: ${npc.title}`, () => {
          this.mode = { kind: 'topics', npc: npc.id }
          this.renderChoices()
        })
      }
      this.back()
      return
    }
    if (this.mode.kind === 'topics') {
      const all = this.game.topicsFor(this.mode.npc)
      const page = this.mode.page ?? 0
      const start = page * PER_PAGE
      const topics = all.slice(start, start + PER_PAGE)
      const npc = this.mode.npc
      this.heading(page > 0 ? `${this.game.npcName(npc)}: página ${page + 1}` : this.game.npcName(npc))
      // La conversacion no se cierra al preguntar: cada tema vuelve a esta misma
      // pagina, asi que hay que decirle al motor a donde regresar.
      for (const topic of topics) this.topicButton(topic, { kind: 'topics', npc, page })
      if (topics.length === 0) {
        this.heading('No se te ocurre nada más que preguntarle.')
      }
      const nav: [string, () => void][] = []
      if (start + PER_PAGE < all.length) {
        nav.push([
          page === 0 ? `Otros temas (${all.length - PER_PAGE})` : 'Más temas',
          () => { this.mode = { kind: 'topics', npc, page: page + 1 } },
        ])
      }
      if (page > 0) {
        nav.push(['Temas anteriores', () => { this.mode = { kind: 'topics', npc, page: page - 1 } }])
      }
      // La salida explicita de la conversacion. Sin ella, seguir preguntando
      // seria una trampa: se entra y no se sabe por donde se sale.
      nav.push(['Despedirse', () => { this.mode = { kind: 'root' } }])
      this.navRow(nav)
      return
    }
    this.heading(view.scene ? view.scene.title : '¿Qué hace Edith?')
    for (const action of view.actions) this.actionButton(action)
  }

  private syncAudio(view: ReturnType<Game['view']>): void {
    const underground =
      ['sotano', 'templo'].includes(view.location.floor) ||
      ['basement_threshold', 'ears', 'solar_disk'].includes(view.scene?.id ?? '')
    const baseState: MusicState = view.finished ? 'silent' : underground ? 'underground' : 'hotel'
    const zone: AudioZone = underground
      ? 'underground'
      : /^\d+$/.test(view.location.floor)
        ? 'private'
        : 'public'
    const investigationOpen =
      !underground &&
      (view.pendingRoll != null || this.mode.kind === 'topics')
    this.audio.setBaseMusicState(baseState)
    this.audio.setInvestigationActive(investigationOpen)
    this.audio.noteLocation(view.location.id, zone)
  }

  private actionButton(action: GuidedAction): void {
    if (action.kind === 'talk' && action.id === 'talk_here') {
      this.button(action.label, () => {
        this.mode = { kind: 'talk' }
        this.renderChoices()
      }, action.minutes, action.urgent ? 'urgent' : '')
      return
    }
    const investigation = action.kind === 'inspect' || action.kind === 'listen'
    const revelation = action.id === 'ears_examine' || action.id === 'ears_protect'
    this.button(
      action.label,
      () => void this.act(() => this.game.performAction(action.id), { investigation, revelation }),
      action.minutes,
      action.urgent ? 'urgent' : '',
      this.actionHint(action),
      action.disabled,
    )
  }

  /**
   * Lo que va debajo de la etiqueta, y solo eso.
   *
   * Una opcion activa no lleva nada: se lee la intencion y se decide. La habilidad,
   * la dificultad y lo que esta en juego aparecen al resolver, en la tarjeta de la
   * tirada, que es donde el jugador puede hacer algo con ese dato —aceptarlo o
   * comprarlo con Suerte—. Antes iban los tres pegados en el boton y una sola
   * opcion ocupaba cuatro lineas de reglamento.
   *
   * Una opcion desactivada si lo lleva: hay que saber que falta para poder tomarla.
   */
  private actionHint(action: GuidedAction): string {
    return action.disabled ? action.hint : ''
  }

  /**
   * Un tema es una linea de dialogo: se pulsa y se dice. El tono lo decide el motor
   * segun el caracter del personaje, y se cuenta despues junto con la tirada.
   */
  private topicButton(topic: DialogueTopic, resume: Mode): void {
    this.button(
      topic.label,
      () => void this.act(() => this.game.ask(topic.id), { investigation: true }, resume),
      topic.minutes ?? DEFAULT_TOPIC_MINUTES,
      '',
      this.game.hasAskedTopic(topic.id) ? 'Ya lo habéis preguntado.' : '',
    )
  }

  private renderRoll(): void {
    const pending = this.game.view().pendingRoll
    if (!pending) return
    this.heading(pending.title)
    const card = document.createElement('div')
    card.className = `roll-card ${pending.roll.success ? 'success' : 'failure'}`
    const value = document.createElement('strong')
    value.textContent = String(pending.roll.value).padStart(2, '0')
    value.setAttribute('aria-label', `Tirada ${pending.roll.value}`)
    const detail = document.createElement('span')
    const required = threshold(pending.roll.target, pending.roll.difficulty)
    detail.textContent = `${pending.roll.success ? 'Prueba superada' : 'Prueba fallida'}. Necesitas ${required} o menos · ${pending.roll.label} ${pending.roll.target}% · dificultad ${DIFFICULTY_LABEL[pending.roll.difficulty]}.`
    const stakes = document.createElement('small')
    stakes.textContent = pending.stakes
    card.append(value, detail, stakes)
    this.choices.append(card)
    this.button(pending.roll.success ? 'Aceptar el éxito' : 'Aceptar el fallo', () => void this.act(() => this.game.settlePendingRoll(false)))
    if (pending.canSpendLuck && pending.luckCost != null) {
      this.button(
        `Gastar ${pending.luckCost} de Suerte`,
        () => void this.act(() => this.game.settlePendingRoll(true)),
        undefined,
        'urgent',
        `${pending.actorName} conservará ${this.game.party.byId(pending.actorId).luck - pending.luckCost} puntos.`,
      )
    }
  }

  private heading(text: string): void {
    const element = document.createElement('div')
    element.className = 'choice-heading'
    element.textContent = text
    this.choices.append(element)
  }

  private button(
    label: string,
    onClick: () => void,
    minutes?: number,
    className = '',
    hint = '',
    disabled = false,
    audioCue: 'select' | 'cancel' = 'select',
  ): void {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = className
    button.dataset['audioCue'] = audioCue
    if (disabled) button.setAttribute('aria-disabled', 'true')
    const number = this.choices.querySelectorAll('button').length + 1
    const key = document.createElement('span')
    key.className = 'key'
    key.textContent = number <= 9 ? `${number}.` : '·'
    const copy = document.createElement('span')
    copy.className = 'choice-copy'
    const main = document.createElement('strong')
    main.textContent = label
    copy.append(main)
    if (hint) {
      const small = document.createElement('small')
      small.textContent = hint
      copy.append(small)
    }
    button.append(key, copy)
    if (minutes != null) {
      const cost = document.createElement('span')
      cost.className = 'cost'
      cost.textContent = `${minutes} min`
      button.append(cost)
    }
    button.addEventListener('click', () => {
      if (disabled) return
      onClick()
    })
    this.choices.append(button)
  }

  /**
   * Paginacion y vuelta atras en una sola linea.
   *
   * Son navegacion, no decisiones: ocupando cada una un boton entero empujaban la
   * ultima opcion fuera de la pantalla, que es justo la que hace falta para salir.
   */
  private navRow(entries: [string, () => void][]): void {
    const row = document.createElement('div')
    row.className = 'choice-nav'
    for (const [label, change] of entries) {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = label
      button.addEventListener('click', () => {
        change()
        this.renderChoices()
      })
      row.append(button)
    }
    this.choices.append(row)
  }

  private back(change?: () => void): void {
    this.button('Volver', () => {
      if (change) change()
      else this.mode = { kind: 'root' }
      this.renderChoices()
    }, undefined, '', '', false, 'cancel')
  }

  /**
   * Ejecuta una accion del motor y decide donde queda el jugador despues.
   *
   * `resume` es lo que sostiene la conversacion: una pregunta devuelve al mismo
   * personaje en vez de escupir al menu de la sala, que es como se hablaba antes
   * y obligaba a cuatro clics por pregunta. `resumeMode` decide si ese regreso
   * sigue teniendo sentido cuando el turno ha cambiado el mundo.
   */
  private async act(action: () => Turn, audioIntent: AudioIntent = {}, resume?: Mode): Promise<void> {
    let turn: Turn
    const sanityBefore = this.totalSanity()
    this.presentationArt = null
    try { turn = action() }
    catch (error) {
      this.audio.playCue('unavailable')
      this.write([{ kind: 'sistema', text: `No se puede: ${(error as Error).message}` }])
      return
    }
    this.closePanel()
    this.mode = turn.over ? { kind: 'end' } : this.resumeMode(resume)
    this.presentationArt = turn.presentationArt ?? null
    const lines = [...turn.lines, ...this.sceneOpeningLines()]
    if (lines.length > 0) this.write(lines)
    this.feedback(turn.feedback)
    this.audioForTurn(turn, sanityBefore, audioIntent)
    await this.paint()
  }

  /**
   * A donde vuelve el jugador despues de una accion.
   *
   * Seguir hablando solo vale mientras hablar siga siendo posible: si el turno
   * ha abierto una escena en esta sala hay algo que mirar y la conversacion no
   * puede taparlo, y si el interlocutor se ha ido de la sala ya no hay con quien
   * seguir. En los dos casos se cae a la raiz, que es la pantalla que sabe
   * contar lo que esta pasando.
   */
  private resumeMode(resume?: Mode): Mode {
    if (!resume || resume.kind !== 'topics') return resume ?? { kind: 'root' }
    const view = this.game.view()
    if (view.scene) return { kind: 'root' }
    const present = view.npcs.some((npc) => npc.id === resume.npc)
    if (!present) {
      this.write([{ kind: 'sistema', text: `${this.game.npcName(resume.npc)} ya no está aquí.` }])
      return { kind: 'root' }
    }
    if (this.game.topicsFor(resume.npc).length === 0) return { kind: 'root' }
    return resume
  }

  /**
   * La descripcion de una escena recien abierta.
   *
   * La barra OBJETIVO se queda con la linea corta —es un rotulo y compite con la
   * lamina por el alto de pantalla— y la prosa baja al cuadro de texto, que es
   * donde se lee todo lo demas y donde puede pasar de una linea sin estorbar.
   */
  private sceneOpeningLines(): Line[] {
    const scene = this.game.view().scene
    const id = scene?.id ?? null
    if (id === this.narratedScene) return []
    this.narratedScene = id
    return scene ? [{ kind: 'narracion', text: scene.body }] : []
  }

  private totalSanity(): number {
    return this.game.view().party.reduce((sum, investigator) => sum + investigator.san, 0)
  }

  private audioForTurn(turn: Turn, sanityBefore: number, intent: AudioIntent): void {
    const sanityLost = this.totalSanity() < sanityBefore
    const unavailable = turn.minutes === 0 && turn.lines.some(
      (line) => line.kind === 'sistema' && /^(No |Esa |Hace falta|Primero |Ya est)/i.test(line.text),
    )
    const roll = turn.feedback.find((cue) => cue.kind === 'roll' && cue.outcome)
    let cue: SynthCue | null = null
    if (sanityLost || intent.revelation) cue = 'sanity'
    else if (unavailable) cue = 'unavailable'
    else if (turn.feedback.some((item) => item.kind === 'damage') || roll?.outcome === 'failure') cue = 'failure'
    else if (turn.feedback.some((item) => item.kind === 'clue' || item.kind === 'report')) cue = 'clue'
    else if (roll?.outcome === 'success' || turn.feedback.some((item) => item.kind === 'luck')) cue = 'success'
    else if (turn.minutes >= 15 || turn.feedback.some((item) => item.kind === 'clock')) cue = 'clock'
    if (cue) this.audio.playCue(cue)
    if (intent.investigation || roll || turn.feedback.some((item) => item.kind === 'clue' || item.kind === 'report')) {
      this.audio.focusInvestigation()
    }
  }

  private feedback(cues: Turn['feedback']): void {
    const game = $('game')
    const classes = cues.map((cue) => `feedback-${cue.kind}`)
    game.classList.add(...classes)
    window.setTimeout(() => game.classList.remove(...classes), 520)
    // El destello se apaga; el distintivo no, hasta que se lea.
    for (const cue of cues) {
      if (cue.kind === 'clue') this.unread.case = true
      if (cue.kind === 'report') this.unread.team = true
    }
  }

  /**
   * Lo que el jugador debe poder leer sin abrir nada.
   *
   * Cordura y Salud solo aparecen cuando dejan de estar intactas —la regla de
   * «solo lo relevante» que ya seguia el panel de Equipo— pero, una vez
   * relevantes, se quedan: una perdida de Cordura que solo se anuncia con una
   * linea magenta y un destello de medio segundo no deja rastro en pantalla.
   */
  private renderCondition(view: ReturnType<Game['view']>): void {
    const edith = view.focus
    // La referencia es la Cordura con la que Edith empezo el dia, no `sanMax`:
    // el maximo de la septima edicion es 99 menos Mitos, asi que comparar con el
    // enseñaba «Cordura 65/99» desde el primer segundo, sin que hubiese pasado
    // nada. Lo que el jugador necesita saber es cuanto ha perdido hoy.
    const perdida = edith.sanAtDayStart - edith.san
    const herida = edith.hpMax - edith.hp
    const partes: string[] = []
    if (perdida > 0) partes.push(`Cordura ${edith.san} (−${perdida})`)
    if (herida > 0) partes.push(`Salud ${edith.hp}/${edith.hpMax}`)
    if (view.pendingRoll) partes.push(`Suerte ${edith.luck}`)
    this.condition.textContent = partes.join(' · ')
    this.condition.hidden = partes.length === 0
    this.condition.classList.toggle('condition-hurt', herida > 0)
    this.condition.classList.toggle('condition-shaken', perdida > 0)
  }

  /**
   * Enciende o apaga los distintivos de Caso y Equipo.
   *
   * No son el mismo aviso. El de Caso marca «hay algo que no has leido» y se
   * apaga al abrir el panel. El de Equipo marca «hay un informe sin recoger»,
   * que es un hecho del mundo: sigue encendido hasta que Edith se reune con el
   * companero, porque apagarlo al mirar seria mentir sobre lo que queda por
   * hacer.
   */
  private renderBadges(view: ReturnType<Game['view']>): void {
    const informeEsperando = view.companions.some((companion) => companion.state === 'report_ready')
    const marca = (id: string, on: boolean, texto: string): void => {
      const button = $(id)
      button.classList.toggle('has-news', on)
      const base = button.dataset['label'] ?? button.textContent ?? ''
      button.dataset['label'] = base
      button.setAttribute('aria-label', on ? `${base}: ${texto}` : base)
    }
    marca('hud-case', this.unread.case, 'hay algo nuevo sin leer')
    marca('hud-team', this.unread.team || informeEsperando, 'hay un informe esperando')
  }

  private write(lines: Line[]): void {
    this.typing?.()
    if (lines.length === 0) return
    this.history.push({ time: this.game.view().time, lines: lines.map((line) => ({ ...line })) })
    this.pages = this.paginate(lines)
    this.pageIndex = 0
    this.renderPage()
  }

  /**
   * Reparte el texto en paginas que quepan enteras en el cuadro.
   *
   * Se mide en el navegador en vez de calcularse: el ajuste por palabras desperdicia
   * el final de cada linea, y cuanto mas estrecha es la columna mas desperdicia, asi
   * que cualquier cuenta de caracteres falla justo donde importa. Un presupuesto mal
   * calculado o desborda —y entonces hay que rodar el cuadro *y* pasar de pagina, que
   * es lo peor de las dos cosas— o deja paginas de una sola linea.
   */
  private paginate(lines: Line[]): Line[][] {
    const flat = lines.flatMap((line) =>
      line.text
        .split(/\n+/)
        .map((text) => text.trim())
        .filter(Boolean)
        .map((text) => ({ ...line, text })),
    )
    if (flat.length === 0) return [[]]

    const styles = getComputedStyle(this.log)
    const padY = Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom)
    const padX = Number.parseFloat(styles.paddingLeft) + Number.parseFloat(styles.paddingRight)
    const budget = Math.max(1, this.log.clientHeight - padY - PAGINATION_HEIGHT)

    const probe = document.createElement('div')
    probe.style.cssText = `position:absolute;visibility:hidden;top:0;left:0;width:${this.log.clientWidth - padX}px`
    this.log.append(probe)

    const measure = (candidate: Line[]): number => {
      probe.replaceChildren()
      for (const line of candidate) {
        const paragraph = document.createElement('p')
        paragraph.className = line.kind
        paragraph.textContent = line.text
        probe.append(paragraph)
      }
      return probe.scrollHeight
    }

    // Primero se parte lo que no cabria ni estando solo, por frases y sin cortar
    // ninguna. Asi el reparto siguiente nunca tiene que aceptar un desbordamiento.
    const pieces = flat.flatMap((line) => {
      if (measure([line]) <= budget) return [line]
      const sentences = line.text.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) ?? [line.text]
      const out: Line[] = []
      let current = ''
      for (const sentence of sentences) {
        if (current && measure([{ ...line, text: current + sentence }]) > budget) {
          out.push({ ...line, text: current.trim() })
          current = ''
        }
        current += sentence
      }
      if (current.trim()) out.push({ ...line, text: current.trim() })
      return out
    })

    const pages: Line[][] = []
    let page: Line[] = []
    for (const line of pieces) {
      // Un titular no puede quedarse solo en una pagina: es un rotulo, no un
      // pasaje, y deja el cuadro en blanco debajo de tres palabras.
      const mustStay = page.length === 0 || page.every((item) => item.kind === 'titular')
      if (mustStay || measure([...page, line]) <= budget) {
        page.push(line)
        continue
      }
      pages.push(page)
      page = [line]
    }
    if (page.length > 0) pages.push(page)
    probe.remove()
    return pages.length > 0 ? pages : [[]]
  }

  private renderPage(): void {
    this.typing?.()
    this.log.replaceChildren()
    const lines = this.pages[this.pageIndex] ?? []
    const paragraphs = lines.map((line) => {
      const paragraph = document.createElement('p')
      paragraph.className = line.kind
      if (line.kind === 'tirada') paragraph.classList.add(this.tone(line.text))
      paragraph.dataset['full'] = line.text
      this.log.append(paragraph)
      return paragraph
    })
    if (this.pages.length > 1) {
      const navigation = document.createElement('div')
      navigation.className = 'log-pagination'
      const previous = document.createElement('button')
      previous.type = 'button'
      previous.textContent = '← Anterior'
      previous.disabled = this.pageIndex === 0
      previous.addEventListener('click', () => { this.pageIndex -= 1; this.renderPage() })
      const count = document.createElement('span')
      count.textContent = `${this.pageIndex + 1}/${this.pages.length}`
      const next = document.createElement('button')
      next.type = 'button'
      next.textContent = 'Siguiente →'
      next.disabled = this.pageIndex >= this.pages.length - 1
      next.addEventListener('click', () => { this.pageIndex += 1; this.renderPage() })
      navigation.append(previous, count, next)
      this.log.append(navigation)
    }
    let lineIndex = 0
    let character = 0
    let stopped = false
    let timer: number | undefined
    const complete = (): void => {
      stopped = true
      if (timer !== undefined) clearTimeout(timer)
      for (const paragraph of paragraphs) paragraph.textContent = paragraph.dataset['full'] ?? ''
      // Cada pagina es una unidad de lectura: abrirla por el principio evita
      // ocultar el arranque de un pasaje largo tras el scroll interno.
      this.log.scrollTop = 0
      this.typing = null
    }
    const step = (): void => {
      if (stopped) return
      const paragraph = paragraphs[lineIndex]
      if (!paragraph) return complete()
      const full = paragraph.dataset['full'] ?? ''
      character += 5
      paragraph.textContent = full.slice(0, character)
      if (character >= full.length) {
        paragraph.textContent = full
        lineIndex += 1
        character = 0
      }
      timer = window.setTimeout(step, 12)
    }
    this.typing = complete
    const total = lines.reduce((sum, line) => sum + line.text.length, 0)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.hidden || total > 1800) complete()
    else {
      window.setTimeout(() => { if (!stopped) complete() }, (total / 5) * 12 + 900)
      step()
    }
  }

  private tone(text: string): string {
    return /pifia|fallo|fallida/.test(text) ? 'failure' : /éxito|exito|superada/.test(text) ? 'success' : ''
  }

  private openPanel(title: string): void {
    this.panelReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    this.panelBody.replaceChildren()
    const heading = document.createElement('h2')
    heading.textContent = title
    this.panelBody.append(heading)
    this.panel.hidden = false
    this.panel.scrollTop = 0
    window.setTimeout(() => $('panel-close').focus(), 0)
  }

  private closePanel(restoreFocus = true): void {
    this.panel.hidden = true
    if (restoreFocus && this.panelReturnFocus?.isConnected) this.panelReturnFocus.focus()
    this.panelReturnFocus = null
  }

  private showCase(): void {
    this.openPanel('Cuaderno del caso')
    const leads = this.game.view().leads
    if (leads.length === 0) this.panelNote('Todavía no habéis descubierto ninguna línea de investigación.')
    for (const lead of leads) {
      const card = document.createElement('article')
      card.className = `lead ${lead.status}`
      const header = document.createElement('div')
      const title = document.createElement('h3')
      title.textContent = lead.title
      const status = document.createElement('span')
      status.textContent = { active: 'EN CURSO', completed: 'RESUELTA', missed: 'PERDIDA' }[lead.status]
      header.append(title, status)
      const detail = document.createElement('p')
      detail.textContent = lead.detail
      card.append(header, detail)
      if (lead.deadline) {
        const deadline = document.createElement('small')
        deadline.textContent = `Ventana: ${lead.deadline}`
        card.append(deadline)
      }
      this.panelBody.append(card)
    }
  }

  private showMap(): void {
    this.openPanel('Mapa del Shepheard’s')
    const view = this.game.view()
    const map = document.createElement('img')
    map.className = 'map-art'
    map.src = `art/${view.mapArt}.png`
    map.alt = `Esquema de la planta ${view.location.floor}`
    map.addEventListener('error', () => { map.hidden = true }, { once: true })
    this.panelBody.append(map)
    this.panelNote('El coste incluye el trayecto completo. Los compañeros que están trabajando no siguen a Edith.')
    for (const destination of this.game.mapDestinations()) {
      const button = document.createElement('button')
      button.className = 'panel-action map-destination'
      button.type = 'button'
      if (destination.current) button.setAttribute('aria-disabled', 'true')
      const label = document.createElement('strong')
      label.textContent = destination.name
      const detail = document.createElement('span')
      detail.textContent = destination.current ? `Planta ${destination.floor}. Estáis aquí.` : `Planta ${destination.floor}. ${destination.minutes} min.`
      button.append(label, detail)
      button.addEventListener('click', () => {
        if (destination.current) return
        void this.act(() => this.game.travelTo(destination.id))
      })
      this.panelBody.append(button)
    }
  }

  private showTeam(): void {
    this.openPanel('Equipo')
    const view = this.game.view()
    const leader = view.focus
    const leadCard = document.createElement('article')
    leadCard.className = 'member leader'
    const leadTitle = document.createElement('h3')
    leadTitle.textContent = `${leader.name}: líder`
    const leadStats = document.createElement('p')
    const relevant: string[] = []
    if (leader.hp < leader.hpMax || view.scene?.actions.some((action) => action.risk?.includes('daño'))) relevant.push(`Salud ${leader.hp}/${leader.hpMax}`)
    if (leader.san < leader.sanAtDayStart || view.scene?.id === 'ears') relevant.push(`Cordura ${leader.san}`)
    if (view.pendingRoll) relevant.push(`Suerte ${leader.luck}`)
    leadStats.textContent = relevant.length > 0 ? `${relevant.join('. ')}.` : 'Dirige el grupo y decide dónde concentrar la investigación.'
    leadCard.append(leadTitle, leadStats)
    const relevantInventory = leader.inventory.filter((item) =>
      item === 'disco_solar' ||
      (item === 'autorizacion_behler' && ['basement_threshold', 'solar_disk'].includes(view.scene?.id ?? '')),
    )
    if (relevantInventory.length > 0) {
      const inventory = document.createElement('small')
      inventory.textContent = `Lleva: ${relevantInventory.join(', ').replaceAll('_', ' ')}.`
      leadCard.append(inventory)
    }
    this.panelBody.append(leadCard)
    for (const companion of view.companions) {
      const card = document.createElement('article')
      card.className = `member ${companion.state}`
      const title = document.createElement('h3')
      title.textContent = companion.name
      const where = document.createElement('p')
      where.textContent = `${companion.location}. ${this.companionStatus(companion.state, companion.readyAt)}`
      card.append(title, where)
      if (companion.assignment) {
        const assignment = document.createElement('small')
        assignment.textContent = `Encargo: ${companion.assignment}`
        card.append(assignment)
      }
      if (companion.canCollect) {
        const collect = document.createElement('button')
        collect.type = 'button'
        collect.className = 'panel-action report'
        collect.textContent = 'Escuchar informe'
        collect.addEventListener('click', () => void this.act(() => this.game.collectReport(companion.id)))
        card.append(collect)
      }
      for (const assignment of companion.availableAssignments) {
        const assign = document.createElement('button')
        assign.type = 'button'
        assign.className = 'panel-action'
        const label = document.createElement('strong')
        label.textContent = assignment.label
        const detail = document.createElement('span')
        const difficulty = { regular: 'Normal', hard: 'Difícil', extreme: 'Extrema' }[assignment.difficulty]
        detail.textContent = `${assignment.brief} ${assignment.skill} · ${difficulty}. Informe en ${assignment.duration} min. Riesgo: ${assignment.risk}`
        assign.append(label, detail)
        assign.addEventListener('click', () => void this.act(() => this.game.assign(assignment.id)))
        card.append(assign)
      }
      this.panelBody.append(card)
    }
    if (view.party.filter((member) => member.location === view.focus.location).length >= 2) {
      const debrief = document.createElement('button')
      debrief.type = 'button'
      debrief.className = 'panel-action compact'
      debrief.textContent = 'Poner ideas en común —5 min'
      debrief.addEventListener('click', () => void this.act(() => this.game.debrief()))
      this.panelBody.append(debrief)
    }
  }

  private companionStatus(state: string, readyAt?: string): string {
    if (state === 'working') return `Trabajando hasta las ${readyAt}.`
    if (state === 'report_ready') return 'Informe preparado. Debéis reuniros.'
    if (state === 'with_leader') return 'Acompaña a Edith.'
    return 'Disponible.'
  }

  private showAudio(): void {
    this.openPanel('Sonido')
    this.panelNote('Síntesis original Web Audio. Solo se activa después de una interacción y deja largos espacios de silencio.')
    this.appendAudioControls(this.panelBody)
  }

  private appendAudioControls(container: HTMLElement): void {
    const muted = document.createElement('button')
    muted.type = 'button'
    muted.className = 'panel-action compact'
    muted.setAttribute('aria-pressed', String(this.audio.preferences.muted))
    muted.textContent = this.audio.preferences.muted ? 'Activar sonido' : 'Silenciar todo'
    muted.addEventListener('click', () => {
      this.audio.setMuted(!this.audio.preferences.muted)
      $('hud-audio').setAttribute('aria-pressed', String(this.audio.preferences.muted))
      if (!this.audio.preferences.muted) this.audio.playCue('select')
      if (this.phase === 'title') this.showTitleAudio()
      else this.showAudio()
    })
    container.append(muted)
    for (const [bus, label] of [['music', 'Música'], ['effects', 'Efectos']] as const) {
      this.audioSlider(bus, label, container)
    }
  }

  private audioSlider(bus: AudioBus, label: string, container: HTMLElement): void {
    const row = document.createElement('label')
    row.className = 'audio-control'
    const title = document.createElement('span')
    title.textContent = label
    const input = document.createElement('input')
    input.type = 'range'
    input.min = '0'
    input.max = '100'
    input.step = '5'
    input.value = String(Math.round(this.audio.preferences[bus] * 100))
    input.setAttribute('aria-label', `Volumen de ${label.toLowerCase()}`)
    const value = document.createElement('output')
    value.textContent = `${input.value}%`
    input.addEventListener('input', () => {
      value.textContent = `${input.value}%`
      this.audio.setVolume(bus, Number(input.value) / 100)
    })
    input.addEventListener('change', () => this.audio.playCue('select'))
    row.append(title, input, value)
    container.append(row)
  }

  private showSaves(): void {
    this.openPanel('Guardar y cargar')
    this.panelNote('Tres ranuras manuales. Guardar sustituye el contenido de la ranura.')
    for (let slot = 1; slot <= 3; slot += 1) {
      const saved = this.readSave(slot)
      const card = document.createElement('article')
      card.className = 'save-slot'
      const title = document.createElement('h3')
      title.textContent = `Ranura ${slot}`
      const detail = document.createElement('p')
      detail.textContent = saved ? `${saved.time}. ${saved.place}. ${new Date(saved.savedAt).toLocaleString('es-ES')}.` : 'Vacía.'
      const save = document.createElement('button')
      save.className = 'panel-action compact'
      save.type = 'button'
      save.textContent = saved ? 'Sobrescribir' : 'Guardar aquí'
      save.addEventListener('click', () => { this.writeSave(slot); this.showSaves() })
      card.append(title, detail, save)
      if (saved) {
        const load = document.createElement('button')
        load.className = 'panel-action compact'
        load.type = 'button'
        load.textContent = 'Cargar'
        load.addEventListener('click', () => void this.loadSave(saved))
        card.append(load)
      }
      this.panelBody.append(card)
    }
  }

  private writeSave(slot: number): void {
    const view = this.game.view()
    const envelope: SaveEnvelope = {
      version: 2,
      savedAt: new Date().toISOString(),
      time: view.time,
      place: view.location.name,
      game: this.game.snapshot(),
      history: this.history.map((entry) => ({ time: entry.time, lines: entry.lines.map((line) => ({ ...line })) })),
    }
    localStorage.setItem(`${SAVE_PREFIX}${slot}`, JSON.stringify(envelope))
  }

  private readSave(slot: number): SaveEnvelope | null {
    try {
      const raw = localStorage.getItem(`${SAVE_PREFIX}${slot}`)
      if (!raw) return null
      const parsed = JSON.parse(raw) as SaveEnvelope
      return parsed.version === 1 || parsed.version === 2 ? parsed : null
    } catch { return null }
  }

  private async loadSave(save: SaveEnvelope): Promise<void> {
    this.game.restore(save.game)
    this.history = save.history.map((entry) => ({ time: entry.time, lines: entry.lines.map((line) => ({ ...line })) }))
    this.narratedScene = this.game.view().scene?.id ?? null
    this.mode = { kind: 'root' }
    this.presentationArt = null
    this.closePanel()
    this.write([{ kind: 'sistema', text: `Partida cargada: ${save.time}, ${save.place}.` }])
    await this.paint()
  }

  private showHistory(): void {
    this.openPanel('Historial')
    if (this.history.length === 0) this.panelNote('Todavía no ha ocurrido nada digno de recordar.')
    for (const entry of [...this.history].reverse()) {
      const block = document.createElement('article')
      block.className = 'history-entry'
      const time = document.createElement('h3')
      time.textContent = entry.time
      block.append(time)
      for (const line of entry.lines.filter((item) => item.kind !== 'tirada')) {
        const paragraph = document.createElement('p')
        paragraph.className = line.kind
        paragraph.textContent = line.text
        block.append(paragraph)
      }
      this.panelBody.append(block)
    }
  }

  private panelNote(text: string): void {
    const note = document.createElement('p')
    note.className = 'panel-note'
    note.textContent = text
    this.panelBody.append(note)
  }

  private showEnding(): void {
    this.cancelIntroTimer()
    this.phase = 'ending'
    this.audio.setBaseMusicState('silent')
    this.closePanel(false)
    this.gameRoot.hidden = true
    this.front.hidden = false
    this.front.dataset['view'] = 'ending'
    this.front.dataset['frame'] = '0'
    this.frontParty.hidden = true
    this.frontParty.replaceChildren()
    const view = this.game.view()
    this.frontImage.hidden = false
    this.frontImage.src = `art/${this.presentationArt ?? view.art}.png`
    this.frontImage.alt = 'Consecuencia de la decisión sobre el Disco Solar'
    const holder = this.game.world.holderOf('disco_solar')
    let heading = ''
    let paragraph = ''
    if (holder === 'player') {
      heading = 'Habéis cambiado la historia'
      paragraph = 'Edith conserva el Disco Solar. Weder sabe quién se lo quitó y el hotel ya no es terreno neutral.'
    } else if (this.game.world.getFlag('weder_retrasado')) {
      heading = 'Habéis ganado dos horas'
      paragraph = 'Weder volverá a las tres. El disco sigue bajo tierra y ambos bandos preparan su siguiente movimiento.'
    } else {
      heading = 'La cadena de custodia ha empezado'
      paragraph = 'Weder sube hacia la habitación 407 con el Disco Solar. El reloj no se detiene.'
    }
    const stats = this.game.summary()
    this.frontCopy.replaceChildren(
      this.frontText('p', '13:00 · FIN DE LA DEMO', 'front-kicker'),
      this.frontText('h2', heading),
      this.frontText('p', paragraph, 'front-subtitle'),
      this.frontText('p', `${stats.seen.length} escenas presenciadas · ${stats.missed.length} lejos de Edith · ${stats.traces} rastros pendientes`, 'front-stats'),
    )
    this.frontActions.replaceChildren()
    this.frontButton('Jugar otra vez', () => void this.startFreshGame(), 'primary')
    this.frontButton('Volver al título', () => this.showTitle(), '', 'cancel')
    this.focusFirstFrontButton()
  }

  async debugAdvance(milliseconds: number): Promise<void> {
    if (this.phase === 'intro') {
      this.introElapsed = Math.min(INTRO_DURATION, this.introElapsed + Math.max(0, milliseconds))
      if (this.introElapsed >= INTRO_DURATION) await this.finishIntro()
      else {
        this.renderIntroFrame()
        this.scheduleIntroFrame()
      }
      return
    }
    // El juego avanza por acciones, no por fotogramas. Esta entrada solo hace
    // determinista la animacion de texto para clientes de prueba.
    this.typing?.()
  }

  textState(): string {
    if (this.phase !== 'playing') {
      const introFrame = this.phase === 'intro'
        ? INTRO_FRAMES.findIndex((frame) => this.introElapsed < frame.until)
        : null
      return JSON.stringify({
        phase: this.phase,
        title: 'El Disco Egipcio',
        introFrame,
        introElapsed: this.phase === 'intro' ? this.introElapsed : null,
        actions: [...this.frontActions.querySelectorAll('button')].map((button) => button.textContent ?? ''),
        audio: this.audio.diagnostics,
      })
    }
    const view = this.game.view()
    const resources: Record<string, string | number | string[]> = {}
    if (view.focus.hp < view.focus.hpMax || view.scene?.actions.some((action) => action.risk?.includes('daño'))) resources['health'] = `${view.focus.hp}/${view.focus.hpMax}`
    if (view.focus.san < view.focus.sanAtDayStart || view.scene?.id === 'ears') resources['sanity'] = view.focus.san
    if (view.pendingRoll) resources['luck'] = view.focus.luck
    const relevantInventory = view.focus.inventory.filter((item) => item === 'disco_solar' || (item === 'autorizacion_behler' && ['basement_threshold', 'solar_disk'].includes(view.scene?.id ?? '')))
    if (relevantInventory.length > 0) resources['inventory'] = relevantInventory
    return JSON.stringify({
      phase: this.phase,
      time: view.time,
      location: view.location.name,
      objective: view.objective,
      scene: view.scene?.title ?? null,
      actions: view.actions.map((action) => ({ id: action.id, label: action.label, minutes: action.minutes, disabled: action.disabled, risk: action.risk, consequence: action.consequence })),
      leads: view.leads.map((lead) => ({ title: lead.title, status: lead.status, deadline: lead.deadline })),
      companions: view.companions.map((companion) => ({ name: companion.name, location: companion.location, state: companion.state, assignment: companion.assignment })),
      resources,
      pendingRoll: view.pendingRoll ? {
        title: view.pendingRoll.title,
        value: view.pendingRoll.roll.value,
        required: threshold(view.pendingRoll.roll.target, view.pendingRoll.roll.difficulty),
        success: view.pendingRoll.roll.success,
        canSpendLuck: view.pendingRoll.canSpendLuck,
      } : null,
      page: { current: this.pageIndex + 1, total: Math.max(1, this.pages.length) },
      narration: [...this.log.querySelectorAll('p')].map((item) => item.dataset['full'] ?? item.textContent ?? ''),
      audio: this.audio.diagnostics,
    })
  }

  private key(event: KeyboardEvent): void {
    if (event.key.toLowerCase() === 'f' && !event.ctrlKey && !event.metaKey) {
      if (document.fullscreenElement) void document.exitFullscreen()
      else void document.documentElement.requestFullscreen()
      return
    }
    if (this.phase === 'intro') {
      if (event.key === 'Escape' || event.key === ' ' || event.key === 'Enter') {
        event.preventDefault()
        void this.finishIntro()
      }
      return
    }
    if (this.phase !== 'playing') return
    if (event.key === 'Escape') {
      if (!this.panel.hidden) this.audio.playCue('cancel')
      return this.closePanel()
    }
    if (this.typing && (event.key === ' ' || event.key === 'Enter')) {
      event.preventDefault()
      this.typing()
      return
    }
    const number = Number.parseInt(event.key, 10)
    if (number >= 1 && number <= 9) this.choices.querySelectorAll('button')[number - 1]?.click()
  }
}

declare global {
  interface Window {
    render_game_to_text: () => string
    advanceTime: (milliseconds: number) => Promise<void>
  }
}

function fatal(message: string, detail = ''): void {
  document.body.replaceChildren()
  const wrap = document.createElement('div')
  wrap.className = 'fatal'
  const heading = document.createElement('h1')
  heading.textContent = message
  const pre = document.createElement('pre')
  pre.textContent = detail
  wrap.append(heading, pre)
  document.body.append(wrap)
}

try {
  const content = loadContent()
  const seed = new URLSearchParams(location.search).get('seed')
  const ui = new UI(content, seed)
  window.render_game_to_text = () => ui.textState()
  window.advanceTime = (milliseconds: number) => ui.debugAdvance(milliseconds)
  void ui.start()
} catch (error) {
  if (error instanceof ContentError) fatal('El contenido del juego tiene erratas', error.problems.join('\n'))
  else fatal('No se ha podido arrancar', String((error as Error)?.stack ?? error))
}

export type { UI }
