import { loadContent, ContentError } from './content/index'
import { Game, type GameSnapshot, type Line, type Turn } from './engine/game'
import type { DialogueTopic } from './engine/dialogue'
import type { GuidedAction } from './engine/adventure'
import { ArtRenderer, type TimeOfDay } from './ui/art'
import './ui/style.css'

type Mode =
  | { kind: 'root' }
  | { kind: 'talk' }
  | { kind: 'topics'; npc: string; page?: number }
  | { kind: 'approach'; topic: DialogueTopic }
  | { kind: 'end' }

interface HistoryEntry { time: string; lines: Line[] }
interface SaveEnvelope {
  version: 1
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
  private readonly art: ArtRenderer
  private readonly log = $('log')
  private readonly choices = $('choices')
  private readonly time = $('hud-time')
  private readonly place = $('hud-place')
  private readonly title = $('scene-title')
  private readonly objective = $('objective-text')
  private readonly panel = $('panel')
  private readonly panelBody = $('panel-body')
  private readonly scene = $('scene')

  constructor(readonly game: Game) {
    this.art = new ArtRenderer($<HTMLCanvasElement>('art'))
    $('hud-map').addEventListener('click', () => this.showMap())
    $('hud-case').addEventListener('click', () => this.showCase())
    $('hud-team').addEventListener('click', () => this.showTeam())
    $('hud-save').addEventListener('click', () => this.showSaves())
    $('hud-log').addEventListener('click', () => this.showHistory())
    $('panel-close').addEventListener('click', () => this.closePanel())
    this.log.addEventListener('click', () => this.typing?.())
    document.addEventListener('keydown', (event) => this.key(event))
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
        text: 'Cada acción consume tiempo. Consultad el Caso para seguir las pistas y el Equipo para repartir el trabajo. Lo que descubra un compañero no lo sabréis hasta volver a reuniros.',
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
    this.objective.textContent = view.objective
    this.scene.classList.toggle('scene-alert', view.scene != null)
    await this.art.draw(view.art, view.timeOfDay as TimeOfDay)
    this.renderChoices()
  }

  private renderChoices(): void {
    const view = this.game.view()
    this.choices.replaceChildren()
    if (view.pendingRoll) return this.renderRoll()
    if (view.finished || this.mode.kind === 'end') {
      this.heading('Fin de la primera mañana')
      this.button('Ver las consecuencias', () => this.showEnding(), undefined, 'urgent')
      return
    }
    if (this.mode.kind === 'talk') {
      this.heading('¿Con quién habla Edith?')
      for (const npc of view.npcs.filter((item) => this.game.topicsFor(item.id).length > 0).slice(0, 3)) {
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
      const start = page === 0 ? 0 : 3 + (page - 1) * 3
      const topics = all.slice(start, start + 3)
      this.heading(page > 0 ? `Otros temas: página ${page}` : this.game.npcName(this.mode.npc))
      for (const topic of topics) this.topicButton(topic)
      if (start + 3 < all.length) {
        const npc = this.mode.npc
        this.button(page === 0 ? `Otros temas (${all.length - 3})` : 'Más temas', () => {
          this.mode = { kind: 'topics', npc, page: page + 1 }
          this.renderChoices()
        })
      }
      const npc = this.mode.npc
      this.back(() => {
        this.mode = page > 1
          ? { kind: 'topics', npc, page: page - 1 }
          : page === 1
            ? { kind: 'topics', npc }
            : { kind: 'talk' }
      })
      return
    }
    if (this.mode.kind === 'approach') {
      const topic = this.mode.topic
      this.heading(`${topic.label}: ¿cómo?`)
      for (const approach of this.game.approachesFor(topic).slice(0, 3)) {
        this.button(approach.label, () => void this.act(() => this.game.ask(topic.id, approach.id)), undefined, '', approach.hint)
      }
      this.back(() => { this.mode = { kind: 'topics', npc: topic.npc } })
      return
    }
    this.heading(view.scene ? view.scene.title : '¿Qué hace Edith?')
    for (const action of view.actions) this.actionButton(action)
  }

  private actionButton(action: GuidedAction): void {
    if (action.kind === 'talk') {
      this.button(action.label, () => {
        this.mode = { kind: 'talk' }
        this.renderChoices()
      }, action.minutes, action.urgent ? 'urgent' : '', action.hint)
      return
    }
    this.button(action.label, () => void this.act(() => this.game.performAction(action.id)), action.minutes, action.urgent ? 'urgent' : '', action.hint)
  }

  private topicButton(topic: DialogueTopic): void {
    this.button(topic.label, () => {
      const approaches = this.game.approachesFor(topic)
      if (approaches.length <= 1) void this.act(() => this.game.ask(topic.id, approaches[0]?.id ?? 'directo'))
      else {
        this.mode = { kind: 'approach', topic }
        this.renderChoices()
      }
    }, topic.minutes)
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

  private button(label: string, onClick: () => void, minutes?: number, className = '', hint = ''): void {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = className
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
    await this.paint()
  }

  private write(lines: Line[]): void {
    this.typing?.()
    if (lines.length === 0) return
    this.history.push({ time: this.game.view().time, lines: lines.map((line) => ({ ...line })) })
    this.log.replaceChildren()
    const paragraphs = lines.map((line) => {
      const paragraph = document.createElement('p')
      paragraph.className = line.kind
      if (line.kind === 'tirada') paragraph.classList.add(this.tone(line.text))
      paragraph.dataset['full'] = line.text
      this.log.append(paragraph)
      return paragraph
    })
    let lineIndex = 0
    let character = 0
    let stopped = false
    let timer: number | undefined
    const complete = (): void => {
      stopped = true
      if (timer !== undefined) clearTimeout(timer)
      for (const paragraph of paragraphs) paragraph.textContent = paragraph.dataset['full'] ?? ''
      this.log.scrollTop = this.log.scrollHeight
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
    for (const lead of this.game.view().leads) {
      const card = document.createElement('article')
      card.className = `lead ${lead.status}`
      const header = document.createElement('div')
      const title = document.createElement('h3')
      title.textContent = lead.title
      const status = document.createElement('span')
      status.textContent = { active: 'EN CURSO', completed: 'RESUELTA', missed: 'PERDIDA', locked: 'BLOQUEADA' }[lead.status]
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
    leadStats.textContent = `Salud ${leader.hp}/${leader.hpMax}. Cordura ${leader.san}. Suerte ${leader.luck}.`
    leadCard.append(leadTitle, leadStats)
    if (leader.inventory.length > 0) {
      const inventory = document.createElement('small')
      inventory.textContent = `Lleva: ${leader.inventory.join(', ').replaceAll('_', ' ')}.`
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
        detail.textContent = `${assignment.brief} Informe en ${assignment.duration} min.`
        assign.append(label, detail)
        assign.addEventListener('click', () => void this.act(() => this.game.assign(assignment.id)))
        card.append(assign)
      }
      this.panelBody.append(card)
    }
  }

  private companionStatus(state: string, readyAt?: string): string {
    if (state === 'working') return `Trabajando hasta las ${readyAt}.`
    if (state === 'report_ready') return 'Informe preparado. Debéis reuniros.'
    if (state === 'with_leader') return 'Acompaña a Edith.'
    return 'Disponible.'
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
      version: 1,
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
      return parsed.version === 1 ? parsed : null
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
    return JSON.stringify({
      time: view.time,
      location: view.location.name,
      objective: view.objective,
      scene: view.scene?.title ?? null,
      actions: view.actions.map((action) => ({ id: action.id, label: action.label, minutes: action.minutes })),
      leads: view.leads.map((lead) => ({ title: lead.title, status: lead.status, deadline: lead.deadline })),
      companions: view.companions.map((companion) => ({ name: companion.name, location: companion.location, state: companion.state, assignment: companion.assignment })),
      player: { health: `${view.focus.hp}/${view.focus.hpMax}`, sanity: view.focus.san, luck: view.focus.luck, inventory: view.focus.inventory },
      pendingRoll: view.pendingRoll ? { title: view.pendingRoll.title, value: view.pendingRoll.roll.value, canSpendLuck: view.pendingRoll.canSpendLuck } : null,
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
