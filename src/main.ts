import { loadContent, ContentError } from './content/index'
import { Game, type GameSnapshot, type Line, type Turn } from './engine/game'
import type { DialogueTopic } from './engine/dialogue'
import type { GuidedAction } from './engine/adventure'
import { ArtRenderer, type TimeOfDay } from './ui/art'
import { AudioManager, type AudioBus } from './ui/audio'
import './ui/style.css'

type Mode =
  | { kind: 'root' }
  | { kind: 'talk' }
  | { kind: 'topics'; npc: string; page?: number }
  | { kind: 'end' }

/**
 * Cuantas opciones caben en una pantalla sin que haya que releerla. Tres obligaba
 * a paginar tres veces para agotar a un personaje que tiene nueve temas abiertos.
 */
const PER_PAGE = 5

interface HistoryEntry { time: string; lines: Line[] }
interface SaveEnvelope {
  version: 1 | 2
  savedAt: string
  time: string
  place: string
  game: GameSnapshot
  history: HistoryEntry[]
}

const SAVE_PREFIX = 'la-broma-macabra.save.'
const $ = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Falta el elemento #${id} en el HTML`)
  return element as T
}

class UI {
  private mode: Mode = { kind: 'root' }
  private typing: (() => void) | null = null
  private history: HistoryEntry[] = []
  private pages: Line[][] = []
  private pageIndex = 0
  private readonly art: ArtRenderer
  private readonly audio = new AudioManager()
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

  constructor(readonly game: Game) {
    this.art = new ArtRenderer($<HTMLCanvasElement>('art'))
    $('hud-map').addEventListener('click', () => this.showMap())
    $('hud-case').addEventListener('click', () => this.showCase())
    $('hud-team').addEventListener('click', () => this.showTeam())
    $('hud-save').addEventListener('click', () => this.showSaves())
    $('hud-log').addEventListener('click', () => this.showHistory())
    $('hud-audio').addEventListener('click', () => this.showAudio())
    $('hud-audio').setAttribute('aria-pressed', String(this.audio.preferences.muted))
    $('panel-close').addEventListener('click', () => this.closePanel())
    this.log.addEventListener('click', () => this.typing?.())
    document.addEventListener('keydown', (event) => this.key(event))
    const unlockAudio = (): void => {
      void this.audio.unlock().then(() => {
        const view = this.game.view()
        this.audio.sync(view.location.id, view.scene?.id ?? null)
      })
    }
    document.addEventListener('pointerdown', unlockAudio, { once: true })
    document.addEventListener('keydown', unlockAudio, { once: true })
  }

  async start(): Promise<void> {
    const view = this.game.view()
    this.write([
      { kind: 'titular', text: 'LA BROMA MACABRA' },
      {
        kind: 'narracion',
        text: 'Hotel Shepheard’s, El Cairo. Martes 21 de noviembre de 1922, nueve de la mañana. Un telegrama del director os ha traído hasta aquí: «fenómenos inexplicables», decía, y «ruego discreción». Fuera hace ya treinta grados y el polvo se pega a la piel.',
      },
      {
        kind: 'sistema',
        text: 'Caso reúne lo descubierto; Mapa mueve; Equipo coordina. Un compañero separado conserva lo que sabe hasta volver a reunirse.',
      },
      { kind: 'titular', text: view.location.name },
      { kind: 'narracion', text: view.description },
    ])
    await this.paint()
  }

  private async paint(): Promise<void> {
    const view = this.game.view()
    this.time.textContent = view.time
    this.place.textContent = view.location.name
    this.title.textContent = view.scene?.title ?? view.location.name
    this.sceneSummary.textContent = view.scene?.body ?? ''
    this.sceneSummary.hidden = view.scene == null
    this.objective.textContent = view.objective
    this.scene.classList.toggle('scene-alert', view.scene != null)
    this.audio.sync(view.location.id, view.scene?.id ?? null)
    await this.art.draw(view.art, view.timeOfDay as TimeOfDay)
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
      this.heading(page > 0 ? `Otros temas: página ${page}` : this.game.npcName(this.mode.npc))
      for (const topic of topics) this.topicButton(topic)
      if (start + PER_PAGE < all.length) {
        const npc = this.mode.npc
        this.button(page === 0 ? `Otros temas (${all.length - PER_PAGE})` : 'Más temas', () => {
          this.mode = { kind: 'topics', npc, page: page + 1 }
          this.renderChoices()
        })
      }
      const npc = this.mode.npc
      this.back(() => {
        this.mode = page > 0 ? { kind: 'topics', npc, page: page - 1 } : { kind: 'talk' }
      })
      return
    }
    this.heading(view.scene ? view.scene.title : '¿Qué hace Edith?')
    for (const action of view.actions) this.actionButton(action)
  }

  private actionButton(action: GuidedAction): void {
    if (action.kind === 'talk' && action.id === 'talk_here') {
      this.button(action.label, () => {
        this.mode = { kind: 'talk' }
        this.renderChoices()
      }, action.minutes, action.urgent ? 'urgent' : '')
      return
    }
    this.button(action.label, () => void this.act(() => this.game.performAction(action.id)), action.minutes, action.urgent ? 'urgent' : '', this.actionHint(action), action.disabled)
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
  private topicButton(topic: DialogueTopic): void {
    this.button(
      topic.label,
      () => void this.act(() => this.game.ask(topic.id)),
      topic.minutes,
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
    const detail = document.createElement('span')
    detail.textContent = `${pending.roll.label}. Objetivo difícil: ${Math.floor(pending.roll.target / 2)}.`
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

  private button(label: string, onClick: () => void, minutes?: number, className = '', hint = '', disabled = false): void {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = className
    button.disabled = disabled
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
    button.addEventListener('click', onClick)
    this.choices.append(button)
  }

  private back(change?: () => void): void {
    this.button('Volver', () => {
      if (change) change()
      else this.mode = { kind: 'root' }
      this.renderChoices()
    })
  }

  private async act(action: () => Turn): Promise<void> {
    let turn: Turn
    try { turn = action() }
    catch (error) {
      this.write([{ kind: 'sistema', text: `No se puede: ${(error as Error).message}` }])
      return
    }
    this.closePanel()
    this.mode = turn.over ? { kind: 'end' } : { kind: 'root' }
    if (turn.lines.length > 0) this.write(turn.lines)
    this.feedback(turn.feedback)
    this.audio.handle(turn.feedback)
    await this.paint()
  }

  private feedback(cues: Turn['feedback']): void {
    const game = $('game')
    const classes = cues.map((cue) => `feedback-${cue.kind}`)
    game.classList.add(...classes)
    window.setTimeout(() => game.classList.remove(...classes), 520)
  }

  private write(lines: Line[]): void {
    this.typing?.()
    if (lines.length === 0) return
    this.history.push({ time: this.game.view().time, lines: lines.map((line) => ({ ...line })) })
    this.pages = this.paginate(lines)
    this.pageIndex = 0
    this.renderPage()
  }

  private paginate(lines: Line[]): Line[][] {
    const expanded = lines.flatMap((line) => {
      const chunks = line.text.split(/\n+/).flatMap((paragraph) => {
        if (paragraph.length <= 720) return [paragraph]
        const sentences = paragraph.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) ?? [paragraph]
        const out: string[] = []
        let current = ''
        for (const sentence of sentences) {
          if (current && current.length + sentence.length > 720) { out.push(current.trim()); current = '' }
          current += sentence
        }
        if (current.trim()) out.push(current.trim())
        return out
      })
      return chunks.filter(Boolean).map((text) => ({ ...line, text }))
    })
    const pages: Line[][] = []
    let page: Line[] = []
    let size = 0
    for (const line of expanded) {
      if (page.length > 0 && (size + line.text.length > 760 || page.length >= 4)) {
        pages.push(page)
        page = []
        size = 0
      }
      page.push(line)
      size += line.text.length
    }
    if (page.length > 0) pages.push(page)
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
    return /pifia|fallo/.test(text) ? 'failure' : /éxito|exito/.test(text) ? 'success' : ''
  }

  private openPanel(title: string): void {
    this.panelBody.replaceChildren()
    const heading = document.createElement('h2')
    heading.textContent = title
    this.panelBody.append(heading)
    this.panel.hidden = false
    this.panel.scrollTop = 0
  }

  private closePanel(): void { this.panel.hidden = true }

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
    this.panelNote('El coste incluye el trayecto completo. Los compañeros que están trabajando no siguen a Edith.')
    for (const destination of this.game.mapDestinations()) {
      const button = document.createElement('button')
      button.className = 'panel-action map-destination'
      button.type = 'button'
      button.disabled = destination.current
      const label = document.createElement('strong')
      label.textContent = destination.name
      const detail = document.createElement('span')
      detail.textContent = destination.current ? `Planta ${destination.floor}. Estáis aquí.` : `Planta ${destination.floor}. ${destination.minutes} min.`
      button.append(label, detail)
      button.addEventListener('click', () => void this.act(() => this.game.travelTo(destination.id)))
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
    this.panelNote('El audio solo se activa después de una interacción. La música aparece en momentos concretos y deja espacio al silencio.')
    const muted = document.createElement('button')
    muted.type = 'button'
    muted.className = 'panel-action compact'
    muted.setAttribute('aria-pressed', String(this.audio.preferences.muted))
    muted.textContent = this.audio.preferences.muted ? 'Activar sonido' : 'Silenciar todo'
    muted.addEventListener('click', () => {
      this.audio.setMuted(!this.audio.preferences.muted)
      $('hud-audio').setAttribute('aria-pressed', String(this.audio.preferences.muted))
      this.showAudio()
    })
    this.panelBody.append(muted)
    for (const [bus, label] of [['music', 'Música'], ['ambience', 'Ambiente'], ['effects', 'Efectos']] as const) {
      this.audioSlider(bus, label)
    }
  }

  private audioSlider(bus: AudioBus, label: string): void {
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
    row.append(title, input, value)
    this.panelBody.append(row)
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
    this.mode = { kind: 'root' }
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
    this.openPanel('13:00. Consecuencias')
    const holder = this.game.world.holderOf('disco_solar')
    const heading = document.createElement('h3')
    const paragraph = document.createElement('p')
    if (holder === 'player') {
      heading.textContent = 'Habéis cambiado la historia'
      paragraph.textContent = 'Edith conserva el Disco Solar. Weder sabe quién se lo quitó y el hotel ya no es terreno neutral.'
    } else if (this.game.world.getFlag('weder_retrasado')) {
      heading.textContent = 'Habéis ganado dos horas'
      paragraph.textContent = 'Weder volverá a las tres con argumentos mejores. El disco sigue bajo tierra y ahora ambos bandos preparan su siguiente movimiento.'
    } else {
      heading.textContent = 'La cadena de custodia ha empezado'
      paragraph.textContent = 'Weder sube hacia la habitación 407 con el Disco Solar. Sabéis más o menos de lo ocurrido, pero el reloj no se detiene.'
    }
    this.panelBody.append(heading, paragraph)
    const stats = this.game.summary()
    this.panelNote(`Presenciasteis ${stats.seen.length} escenas. ${stats.missed.length} ocurrieron lejos de Edith. Quedan ${stats.traces} rastros recuperables.`)
  }

  async debugAdvance(_milliseconds: number): Promise<void> {
    // El juego avanza por acciones, no por fotogramas. Esta entrada solo hace
    // determinista la animacion de texto para clientes de prueba.
    this.typing?.()
  }

  textState(): string {
    const view = this.game.view()
    const resources: Record<string, string | number | string[]> = {}
    if (view.focus.hp < view.focus.hpMax || view.scene?.actions.some((action) => action.risk?.includes('daño'))) resources['health'] = `${view.focus.hp}/${view.focus.hpMax}`
    if (view.focus.san < view.focus.sanAtDayStart || view.scene?.id === 'ears') resources['sanity'] = view.focus.san
    if (view.pendingRoll) resources['luck'] = view.focus.luck
    const relevantInventory = view.focus.inventory.filter((item) => item === 'disco_solar' || (item === 'autorizacion_behler' && ['basement_threshold', 'solar_disk'].includes(view.scene?.id ?? '')))
    if (relevantInventory.length > 0) resources['inventory'] = relevantInventory
    return JSON.stringify({
      time: view.time,
      location: view.location.name,
      objective: view.objective,
      scene: view.scene?.title ?? null,
      actions: view.actions.map((action) => ({ id: action.id, label: action.label, minutes: action.minutes, disabled: action.disabled, risk: action.risk, consequence: action.consequence })),
      leads: view.leads.map((lead) => ({ title: lead.title, status: lead.status, deadline: lead.deadline })),
      companions: view.companions.map((companion) => ({ name: companion.name, location: companion.location, state: companion.state, assignment: companion.assignment })),
      resources,
      pendingRoll: view.pendingRoll ? { title: view.pendingRoll.title, value: view.pendingRoll.roll.value, canSpendLuck: view.pendingRoll.canSpendLuck } : null,
      page: { current: this.pageIndex + 1, total: Math.max(1, this.pages.length) },
      narration: [...this.log.querySelectorAll('p')].map((item) => item.dataset['full'] ?? item.textContent ?? ''),
    })
  }

  private key(event: KeyboardEvent): void {
    if (event.key === 'Escape') return this.closePanel()
    if (event.key.toLowerCase() === 'f' && !event.ctrlKey && !event.metaKey) {
      if (document.fullscreenElement) void document.exitFullscreen()
      else void document.documentElement.requestFullscreen()
      return
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
  const seed = new URLSearchParams(location.search).get('seed') ?? String(Date.now())
  const ui = new UI(new Game(content, seed))
  window.render_game_to_text = () => ui.textState()
  window.advanceTime = (milliseconds: number) => ui.debugAdvance(milliseconds)
  void ui.start()
} catch (error) {
  if (error instanceof ContentError) fatal('El contenido del juego tiene erratas', error.problems.join('\n'))
  else fatal('No se ha podido arrancar', String((error as Error)?.stack ?? error))
}

export type { UI }
