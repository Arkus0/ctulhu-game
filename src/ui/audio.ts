import {
  ambienceZoneFor,
  composeSection,
  midi,
  type AmbienceZone,
  type MusicEvent,
  type MusicIntensity,
  type MusicScene,
  type MusicSection,
  type MusicZone,
} from './music'

export type AudioBus = 'music' | 'effects'
export type { AmbienceZone, MusicIntensity, MusicScene, MusicZone }

export type SynthCue =
  | 'select'
  | 'cancel'
  | 'unavailable'
  | 'success'
  | 'failure'
  | 'clock'
  | 'clue'
  | 'sanity'
  | 'room'

export interface AudioPreferences {
  muted: boolean
  music: number
  effects: number
}

export interface AudioDiagnostics {
  unlocked: boolean
  contextState: AudioContextState | 'uninitialized'
  scene: MusicScene
  intensity: MusicIntensity
  musicTheme: string | null
  sectionsPlayed: number
  /** Ganancia del bus de estado: si es 0 con musica activa, algo va mal. */
  musicGain: number
  preferences: Readonly<AudioPreferences>
  activeMusicVoices: number
  activeEffectVoices: number
  schedulerPending: boolean
  nextTickMs: number | null
  intensityHoldPending: boolean
}

type AudioStorage = Pick<Storage, 'getItem' | 'setItem'>
type ContextFactory = () => AudioContext

interface Voice {
  bus: AudioBus
  sources: AudioScheduledSourceNode[]
  nodes: AudioNode[]
  oscillators: OscillatorNode[]
  stopped: boolean
  disconnected: boolean
}

interface FmOptions {
  ratio?: number
  index?: number
  attack?: number
  level?: number
  type?: OscillatorType
  endFrequency?: number
  detune?: number
}

/** Por donde va la reproduccion del tema en curso. */
interface Cursor {
  section: MusicSection
  /** Siguiente compas por programar. */
  bar: number
  /** Momento del contexto en el que empieza la seccion. */
  startTime: number
  secondsPerBeat: number
}

const STORAGE_KEY = 'la-broma-macabra.audio.v3'
const LEGACY_STORAGE_KEYS = ['la-broma-macabra.audio.v2', 'la-broma-macabra.audio.v1']
const DEFAULTS: AudioPreferences = { muted: false, music: 0.45, effects: 0.45 }
/**
 * El valor por defecto de las versiones anteriores. La musica sonaba unos 11 dB
 * por debajo de la señal de interfaz y en partida no se oia; al migrar se
 * respeta la eleccion explicita del jugador y solo se reescribe si coincide con
 * aquel defecto.
 */
const LEGACY_MUSIC_DEFAULT = 0.22
const MUSIC_POLYPHONY = 24
const EFFECTS_POLYPHONY = 14
/** Cuanto se adelanta el planificador al final del compas, en milisegundos. */
const LOOKAHEAD_MS = 160
/** Sostenimiento de la intensidad tensa despues de una accion de investigacion. */
const INTENSITY_HOLD_MS = 12_000

const memoryStorage: AudioStorage = { getItem: () => null, setItem: () => undefined }

function defaultStorage(): AudioStorage {
  return typeof localStorage === 'undefined' ? memoryStorage : localStorage
}

export function readAudioPreferences(storage: Pick<Storage, 'getItem'> = defaultStorage()): AudioPreferences {
  const current = parsePreferences(storage.getItem(STORAGE_KEY))
  if (current) return current
  for (const key of LEGACY_STORAGE_KEYS) {
    const legacy = parsePreferences(storage.getItem(key))
    if (!legacy) continue
    const untouched = Math.abs(legacy.music - LEGACY_MUSIC_DEFAULT) < 0.005
    return { ...legacy, music: untouched ? DEFAULTS.music : legacy.music }
  }
  return { ...DEFAULTS }
}

function parsePreferences(raw: string | null): AudioPreferences | null {
  if (raw == null) return null
  try {
    const value = JSON.parse(raw) as Partial<AudioPreferences>
    return {
      muted: Boolean(value.muted),
      music: clamp(value.music ?? DEFAULTS.music),
      effects: clamp(value.effects ?? DEFAULTS.effects),
    }
  } catch {
    return null
  }
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}

/**
 * Sintesis original y efimera para El Disco Egipcio.
 *
 * No carga ningun recurso: todas las voces nacen de osciladores y de un buffer
 * de ruido creado al desbloquear el contexto. La partitura vive en
 * `./music.ts`; aqui solo se construye el grafo, se programan los compases con
 * antelacion y se disparan las señales de interfaz. El planificador tiene su
 * propio azar y nunca consulta ni altera el RNG, el reloj o el estado de la
 * partida.
 */
export class AudioManager {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private musicBus: GainNode | null = null
  private effectsBus: GainNode | null = null
  private musicStateGain: GainNode | null = null
  private musicFilter: BiquadFilterNode | null = null
  private musicShaper: DynamicsCompressorNode | null = null
  private noise: AudioBuffer | null = null
  private voices = new Set<Voice>()
  private pendingCleanups = new Set<ReturnType<typeof setTimeout>>()
  private tickTimer: ReturnType<typeof setTimeout> | null = null
  private nextTickMs: number | null = null
  private intensityTimer: ReturnType<typeof setTimeout> | null = null
  private unlockPromise: Promise<void> | null = null
  private prefs: AudioPreferences
  private _unlocked = false
  private baseScene: MusicScene = 'silent'
  private activeScene: MusicScene = 'silent'
  private activeIntensity: MusicIntensity = 'calm'
  private cursor: Cursor | null = null
  private sectionIndex = 0
  private sectionsPlayed = 0
  private currentTheme: string | null = null
  private musicGain = 1
  private intensityActive = false
  private intensityUntil = 0
  private pageHidden = false
  private lastCueAt = new Map<SynthCue, number>()
  private lastStrongCueAt = Number.NEGATIVE_INFINITY
  private lastLocation: string | null = null
  private lastAmbience: AmbienceZone | null = null
  private roomMoves = 0
  private lastRoomCueAt = Number.NEGATIVE_INFINITY

  constructor(
    private readonly storage: AudioStorage = defaultStorage(),
    private readonly contextFactory: ContextFactory = () => new AudioContext(),
  ) {
    this.prefs = readAudioPreferences(storage)
  }

  get preferences(): Readonly<AudioPreferences> { return this.prefs }
  get unlocked(): boolean { return this._unlocked }

  get diagnostics(): AudioDiagnostics {
    return {
      unlocked: this._unlocked,
      contextState: this.context?.state ?? 'uninitialized',
      scene: this.activeScene,
      intensity: this.activeIntensity,
      musicTheme: this.currentTheme,
      sectionsPlayed: this.sectionsPlayed,
      musicGain: this.musicGain,
      preferences: { ...this.prefs },
      activeMusicVoices: this.voiceCount('music'),
      activeEffectVoices: this.voiceCount('effects'),
      schedulerPending: this.tickTimer != null,
      nextTickMs: this.nextTickMs,
      intensityHoldPending: this.intensityTimer != null,
    }
  }

  async unlock(): Promise<void> {
    if (this._unlocked && this.context?.state === 'running') return
    if (this.unlockPromise) return this.unlockPromise
    if (!this.context) this.createGraph()
    const context = this.context
    if (!context) return
    this.unlockPromise = context.resume()
      .then(() => {
        this._unlocked = true
        this.applyPreferences()
        this.refreshMusic()
      })
      .finally(() => { this.unlockPromise = null })
    return this.unlockPromise
  }

  setMuted(muted: boolean): void {
    this.prefs = { ...this.prefs, muted }
    this.persist()
    this.applyPreferences()
    if (!muted && this.context?.state === 'suspended') void this.context.resume().catch(() => undefined)
    this.refreshMusic()
  }

  setVolume(bus: AudioBus, value: number): void {
    this.prefs = { ...this.prefs, [bus]: clamp(value) }
    this.persist()
    this.applyPreferences()
    if (bus === 'music') this.refreshMusic()
    if (bus === 'effects' && this.prefs.effects === 0) this.stopVoices('effects')
  }

  /** Portada, intro, zona del hotel o final. Manda sobre la intensidad. */
  setMusicScene(scene: MusicScene): void {
    if (this.baseScene === scene) return
    this.baseScene = scene
    if (scene === 'silent' || scene === 'intro') this.clearIntensityHold()
    this.refreshMusic()
  }

  /** Un menu de dialogo o una tirada abierta: la escena sigue, sube la tension. */
  setIntensityActive(active: boolean): void {
    if (this.intensityActive === active) return
    this.intensityActive = active
    this.refreshMusic()
  }

  /** Una accion de investigacion mantiene la variante tensa un rato mas. */
  focusIntensity(durationMs = INTENSITY_HOLD_MS): void {
    if (this.baseScene === 'silent' || this.baseScene === 'intro') return
    this.intensityUntil = Date.now() + Math.max(0, durationMs)
    if (this.intensityTimer) clearTimeout(this.intensityTimer)
    this.intensityTimer = setTimeout(() => {
      this.intensityTimer = null
      this.intensityUntil = 0
      this.refreshMusic()
    }, Math.max(0, durationMs))
    this.refreshMusic()
  }

  noteLocation(location: string, zone: MusicZone): void {
    const ambience = ambienceZoneFor(zone)
    if (this.lastLocation == null) {
      this.lastLocation = location
      this.lastAmbience = ambience
      return
    }
    if (this.lastLocation === location) return
    const zoneChanged = this.lastAmbience !== ambience
    this.lastLocation = location
    this.lastAmbience = ambience
    this.roomMoves += 1
    const now = Date.now()
    const spaced = now - this.lastRoomCueAt >= 20_000
    if (zoneChanged || (spaced && this.roomMoves % 3 === 0)) {
      this.lastRoomCueAt = now
      this.playCue('room')
    }
  }

  setPageHidden(hidden: boolean): void {
    if (this.pageHidden === hidden) return
    this.pageHidden = hidden
    this.refreshMusic()
  }

  playCue(cue: SynthCue): void {
    if (!this.context || !this.effectsBus || this.prefs.muted || this.prefs.effects === 0) return
    const nowMs = Date.now()
    const minimumGap = cue === 'select' ? 45 : cue === 'room' ? 500 : cue === 'sanity' ? 600 : 90
    if (nowMs - (this.lastCueAt.get(cue) ?? Number.NEGATIVE_INFINITY) < minimumGap) return
    if (cue === 'room' && nowMs - this.lastStrongCueAt < 500) return
    this.lastCueAt.set(cue, nowMs)
    if (!['select', 'cancel', 'unavailable', 'room'].includes(cue)) this.lastStrongCueAt = nowMs

    const now = this.context.currentTime + 0.008
    if (cue === 'select') {
      this.simpleTone(760, now, 0.035, 0.055, 'square', 470)
      return
    }
    if (cue === 'cancel') {
      this.simpleTone(185, now, 0.06, 0.055, 'triangle', 120)
      return
    }
    if (cue === 'unavailable') {
      this.simpleTone(116, now, 0.045, 0.045, 'square', 92)
      this.simpleTone(105, now + 0.085, 0.045, 0.038, 'square', 84)
      return
    }
    if (cue === 'success') {
      this.fmTone(midi(65), now, 0.24, 'effects', { ratio: 2, index: 1.4, level: 0.045 })
      this.fmTone(midi(69), now + 0.09, 0.32, 'effects', { ratio: 2, index: 1.1, level: 0.04 })
      return
    }
    if (cue === 'failure') {
      this.fmTone(midi(52), now, 0.24, 'effects', { ratio: 1, index: 0.8, level: 0.045 })
      this.fmTone(midi(46), now + 0.09, 0.32, 'effects', { ratio: 1, index: 1.1, level: 0.04 })
      return
    }
    if (cue === 'clock') {
      this.fmTone(430, now, 0.15, 'effects', { ratio: 3.02, index: 2.1, level: 0.04 })
      this.fmTone(390, now + 0.24, 0.17, 'effects', { ratio: 3.02, index: 2.35, level: 0.04 })
      return
    }
    if (cue === 'clue') {
      this.fmTone(midi(79), now, 0.75, 'effects', { ratio: 2.01, index: 3.2, level: 0.038 })
      this.fmTone(midi(84), now + 0.055, 0.48, 'effects', { ratio: 3.97, index: 1.7, level: 0.018 })
      return
    }
    if (cue === 'room') {
      this.noiseBreath(now, 0.16, 'effects', 260, 120, 0.018)
      this.simpleTone(92, now, 0.11, 0.022, 'sine', 78)
      return
    }
    this.sanityEffect(now)
  }

  dispose(): void {
    this.cancelTick()
    this.clearIntensityHold()
    this.stopVoices()
    for (const timeout of this.pendingCleanups) clearTimeout(timeout)
    this.pendingCleanups.clear()
    for (const voice of [...this.voices]) this.disconnectVoice(voice)
    this.voices.clear()
    this.cursor = null
    for (const node of [this.musicStateGain, this.musicFilter, this.musicShaper, this.musicBus, this.effectsBus, this.master]) {
      try { node?.disconnect() } catch { /* ya estaba desconectado */ }
    }
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => undefined)
    this.context = null
    this._unlocked = false
  }

  private createGraph(): void {
    const context = this.contextFactory()
    const master = context.createGain()
    const musicBus = context.createGain()
    const effectsBus = context.createGain()
    const musicStateGain = context.createGain()
    const musicFilter = context.createBiquadFilter()
    musicFilter.type = 'lowpass'
    musicFilter.frequency.value = 7_200
    musicFilter.Q.value = 0.35
    // La musica es continua y la narracion se lee encima: un compresor suave
    // impide que la entrada de un tema o un acorde denso pise el texto.
    const musicShaper = context.createDynamicsCompressor()
    musicShaper.threshold.value = -24
    musicShaper.knee.value = 18
    musicShaper.ratio.value = 3
    musicShaper.attack.value = 0.02
    musicShaper.release.value = 0.28
    musicStateGain.connect(musicFilter)
    musicFilter.connect(musicShaper)
    musicShaper.connect(musicBus)
    musicBus.connect(master)
    effectsBus.connect(master)
    master.connect(context.destination)
    this.context = context
    this.master = master
    this.musicBus = musicBus
    this.effectsBus = effectsBus
    this.musicStateGain = musicStateGain
    this.musicFilter = musicFilter
    this.musicShaper = musicShaper
    this.noise = this.createNoiseBuffer(context)
    this.applyPreferences()
  }

  private createNoiseBuffer(context: AudioContext): AudioBuffer {
    const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate)
    const channel = buffer.getChannelData(0)
    let seed = 0x51f15e
    for (let index = 0; index < channel.length; index += 1) {
      seed ^= seed << 13
      seed ^= seed >>> 17
      seed ^= seed << 5
      channel[index] = ((seed >>> 0) / 0xffffffff) * 2 - 1
    }
    return buffer
  }

  private applyPreferences(): void {
    if (!this.context || !this.master || !this.musicBus || !this.effectsBus) return
    const now = this.context.currentTime
    this.master.gain.cancelScheduledValues(now)
    this.master.gain.setTargetAtTime(this.prefs.muted ? 0 : 0.72, now, 0.012)
    this.musicBus.gain.setTargetAtTime(this.prefs.music, now, 0.018)
    this.effectsBus.gain.setTargetAtTime(this.prefs.effects, now, 0.012)
  }

  private desiredScene(): MusicScene {
    return this.baseScene
  }

  private desiredIntensity(): MusicIntensity {
    if (this.baseScene === 'silent' || this.baseScene === 'intro') return 'calm'
    return this.intensityActive || this.intensityUntil > Date.now() ? 'tense' : 'calm'
  }

  /**
   * Punto unico de decision de la musica.
   *
   * La ganancia del bus de estado se fija en cada llamada, no solo cuando algo
   * cambia: asi no puede quedarse a cero porque el estado cambiase mientras la
   * pestaña estaba oculta o el sonido silenciado.
   */
  private refreshMusic(): void {
    const scene = this.desiredScene()
    const intensity = this.desiredIntensity()
    const sceneChanged = scene !== this.activeScene
    const intensityChanged = intensity !== this.activeIntensity
    this.activeScene = scene
    this.activeIntensity = intensity
    if (!this.context || !this.musicStateGain || !this._unlocked) return

    const playable = !this.prefs.muted && this.prefs.music > 0 && !this.pageHidden && scene !== 'silent'
    if (!playable) {
      const fade = scene === 'silent' ? 0.45 : 0.12
      this.cancelTick()
      this.applyMusicGain(0, fade)
      this.stopVoices('music', this.context.currentTime + fade + 0.05)
      this.cursor = null
      this.currentTheme = null
      return
    }

    this.applyMusicGain(1, this.musicGain > 0 ? 0.2 : 0.5)
    if (sceneChanged) {
      this.sectionIndex = 0
      this.closeSectionAtNextBar()
    } else if (intensityChanged) {
      this.closeSectionAtNextBar()
    }
    if (this.tickTimer == null) this.pump()
  }

  private applyMusicGain(target: number, seconds: number): void {
    if (!this.context || !this.musicStateGain) return
    const now = this.context.currentTime
    const gain = this.musicStateGain.gain
    gain.cancelScheduledValues(now)
    gain.setValueAtTime(gain.value, now)
    gain.linearRampToValueAtTime(Math.max(0.0001, target), now + seconds)
    this.musicGain = target
  }

  /**
   * Cierra la seccion en curso al acabar el compas ya programado.
   *
   * Cambiar de zona o de intensidad no corta ninguna nota: la seccion nueva
   * entra en el siguiente compas, como en una partitura adaptativa.
   */
  private closeSectionAtNextBar(): void {
    if (!this.cursor) return
    const scheduled = this.cursor.bar * this.cursor.section.beatsPerBar
    if (scheduled <= 0) {
      this.cursor = null
      return
    }
    this.cursor = {
      ...this.cursor,
      section: { ...this.cursor.section, beats: Math.min(this.cursor.section.beats, scheduled) },
      bar: Number.MAX_SAFE_INTEGER,
    }
  }

  /** Programa el siguiente compas y se cita consigo mismo antes de que acabe. */
  private pump(): void {
    const context = this.context
    if (!context || context.state === 'closed' || !this.musicStateGain) return
    const now = context.currentTime

    if (!this.cursor || this.cursor.bar * this.cursor.section.beatsPerBar >= this.cursor.section.beats) {
      const previousEnd = this.cursor
        ? this.cursor.startTime + this.cursor.section.beats * this.cursor.secondsPerBeat
        : 0
      const section = composeSection(this.activeScene, this.activeIntensity, this.sectionIndex)
      if (!section) return
      this.sectionIndex += 1
      this.sectionsPlayed += 1
      this.currentTheme = section.name
      this.cursor = {
        section,
        bar: 0,
        startTime: Math.max(previousEnd, now + 0.06),
        secondsPerBeat: 60 / section.bpm,
      }
    }

    const { section, bar, startTime, secondsPerBeat } = this.cursor
    const from = bar * section.beatsPerBar
    const to = from + section.beatsPerBar
    for (const event of section.events) {
      if (event.atBeat < from || event.atBeat >= to || event.atBeat >= section.beats) continue
      this.renderEvent(event, startTime + event.atBeat * secondsPerBeat, secondsPerBeat)
    }
    this.cursor = { ...this.cursor, bar: bar + 1 }

    const barEnd = startTime + Math.min(to, section.beats) * secondsPerBeat
    this.scheduleTick((barEnd - context.currentTime) * 1000 - LOOKAHEAD_MS)
  }

  private scheduleTick(delayMs: number): void {
    this.cancelTick()
    const delay = Math.max(20, delayMs)
    this.nextTickMs = Math.round(delay)
    this.tickTimer = setTimeout(() => {
      this.tickTimer = null
      this.nextTickMs = null
      this.pump()
    }, delay)
  }

  private cancelTick(): void {
    if (this.tickTimer) clearTimeout(this.tickTimer)
    this.tickTimer = null
    this.nextTickMs = null
  }

  private renderEvent(event: MusicEvent, when: number, secondsPerBeat: number): void {
    const duration = Math.max(0.05, event.beats * secondsPerBeat)
    if (event.noise) {
      this.noiseBreath(when, duration, 'music', event.noise.from, event.noise.to, event.level)
      return
    }
    this.fmTone(event.frequency, when, duration, 'music', {
      ratio: event.ratio,
      index: event.index,
      attack: event.attack,
      level: event.level,
      detune: event.detune,
      type: event.type,
      ...(event.endFrequency ? { endFrequency: event.endFrequency } : {}),
    })
  }

  private fmTone(frequency: number, start: number, duration: number, bus: AudioBus, options: FmOptions = {}): void {
    if (!this.context) return
    const target = bus === 'music' ? this.musicStateGain : this.effectsBus
    if (!target) return
    this.enforcePolyphony(bus)

    const carrier = this.context.createOscillator()
    const modulator = this.context.createOscillator()
    const modulation = this.context.createGain()
    const envelope = this.context.createGain()
    const ratio = options.ratio ?? 2
    const attack = Math.min(duration * 0.45, options.attack ?? 0.012)
    const level = options.level ?? 0.025
    carrier.type = options.type ?? 'sine'
    modulator.type = 'sine'
    carrier.frequency.setValueAtTime(frequency, start)
    if (options.endFrequency) carrier.frequency.exponentialRampToValueAtTime(options.endFrequency, start + duration)
    carrier.detune.setValueAtTime(options.detune ?? 0, start)
    modulator.frequency.setValueAtTime(frequency * ratio, start)
    modulation.gain.setValueAtTime(frequency * (options.index ?? 1.5), start)
    envelope.gain.setValueAtTime(0.0001, start)
    envelope.gain.linearRampToValueAtTime(level, start + attack)
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    modulator.connect(modulation)
    modulation.connect(carrier.frequency)
    carrier.connect(envelope)
    envelope.connect(target)
    const stop = start + duration + 0.035
    carrier.start(start)
    modulator.start(start)
    carrier.stop(stop)
    modulator.stop(stop)
    this.trackVoice(bus, [carrier, modulator], [carrier, modulator, modulation, envelope], [carrier, modulator])
  }

  private simpleTone(
    frequency: number,
    start: number,
    duration: number,
    level: number,
    type: OscillatorType,
    endFrequency = frequency,
  ): void {
    if (!this.context || !this.effectsBus) return
    this.enforcePolyphony('effects')
    const oscillator = this.context.createOscillator()
    const envelope = this.context.createGain()
    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, start)
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration)
    envelope.gain.setValueAtTime(0.0001, start)
    envelope.gain.linearRampToValueAtTime(level, start + Math.min(0.006, duration / 3))
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    oscillator.connect(envelope)
    envelope.connect(this.effectsBus)
    oscillator.start(start)
    oscillator.stop(start + duration + 0.02)
    this.trackVoice('effects', [oscillator], [oscillator, envelope], [oscillator])
  }

  private noiseBreath(
    start: number,
    duration: number,
    bus: AudioBus,
    fromFrequency: number,
    toFrequency: number,
    level: number,
  ): void {
    if (!this.context || !this.noise) return
    const target = bus === 'music' ? this.musicStateGain : this.effectsBus
    if (!target) return
    this.enforcePolyphony(bus)
    const source = this.context.createBufferSource()
    const filter = this.context.createBiquadFilter()
    const envelope = this.context.createGain()
    source.buffer = this.noise
    source.loop = true
    filter.type = 'bandpass'
    filter.Q.value = 2.4
    filter.frequency.setValueAtTime(fromFrequency, start)
    filter.frequency.exponentialRampToValueAtTime(Math.max(30, toFrequency), start + duration)
    envelope.gain.setValueAtTime(0.0001, start)
    envelope.gain.linearRampToValueAtTime(level, start + duration * 0.38)
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    source.connect(filter)
    filter.connect(envelope)
    envelope.connect(target)
    source.start(start)
    source.stop(start + duration + 0.025)
    this.trackVoice(bus, [source], [source, filter, envelope], [])
  }

  private sanityEffect(start: number): void {
    if (!this.context || !this.musicFilter) return
    const end = start + 2.4
    for (const voice of this.voices) {
      if (voice.bus !== 'music') continue
      voice.oscillators.forEach((oscillator, index) => {
        const detune = index % 2 === 0 ? -42 : 42
        oscillator.detune.cancelScheduledValues(start)
        oscillator.detune.setValueAtTime(oscillator.detune.value, start)
        oscillator.detune.linearRampToValueAtTime(detune, start + 1.2)
        oscillator.detune.linearRampToValueAtTime(0, end)
      })
    }
    this.musicFilter.frequency.cancelScheduledValues(start)
    this.musicFilter.frequency.setValueAtTime(this.musicFilter.frequency.value, start)
    this.musicFilter.frequency.exponentialRampToValueAtTime(820, start + 1.15)
    this.musicFilter.frequency.exponentialRampToValueAtTime(7_200, end)
    ;[66, 65, 64, 63].forEach((note, index) => {
      this.fmTone(midi(note), start + index * 0.31, 1.1, 'effects', {
        ratio: index % 2 === 0 ? 1.997 : 2.014,
        index: 3.8,
        attack: 0.08,
        level: 0.027,
        detune: index % 2 === 0 ? -18 : 18,
        endFrequency: midi(note - 2),
      })
    })
    this.noiseBreath(start, 2.25, 'effects', 1_100, 150, 0.035)
  }

  private trackVoice(
    bus: AudioBus,
    sources: AudioScheduledSourceNode[],
    nodes: AudioNode[],
    oscillators: OscillatorNode[],
  ): void {
    const voice: Voice = { bus, sources, nodes, oscillators, stopped: false, disconnected: false }
    this.voices.add(voice)
    let remaining = sources.length
    const ended = (): void => {
      remaining -= 1
      if (remaining > 0) return
      this.voices.delete(voice)
      this.disconnectVoice(voice)
    }
    for (const source of sources) source.addEventListener('ended', ended, { once: true })
  }

  private disconnectVoice(voice: Voice): void {
    if (voice.disconnected) return
    voice.disconnected = true
    for (const node of voice.nodes) {
      try { node.disconnect() } catch { /* ya estaba desconectado */ }
    }
  }

  private voiceCount(bus: AudioBus): number {
    let count = 0
    for (const voice of this.voices) if (voice.bus === bus) count += 1
    return count
  }

  private enforcePolyphony(bus: AudioBus): void {
    const limit = bus === 'music' ? MUSIC_POLYPHONY : EFFECTS_POLYPHONY
    const active = [...this.voices].filter((voice) => voice.bus === bus)
    while (active.length >= limit) this.stopVoice(active.shift()!)
  }

  private stopVoices(bus?: AudioBus, atTime = this.context?.currentTime ?? 0): void {
    for (const voice of [...this.voices]) {
      if (bus && voice.bus !== bus) continue
      this.stopVoice(voice, atTime)
    }
  }

  /**
   * Detiene una voz y la descuenta en el acto.
   *
   * Una fuente parada antes de su propio `start` puede no llegar a emitir
   * `ended`, asi que esperar a ese aviso dejaba voces fantasma en la cuenta y
   * el limite de polifonia acababa protegiendo a nadie. Los nodos se
   * desconectan cuando el sonido ya ha terminado de verdad.
   */
  private stopVoice(voice: Voice, atTime = this.context?.currentTime ?? 0): void {
    if (voice.stopped) return
    voice.stopped = true
    for (const source of voice.sources) {
      try { source.stop(atTime) } catch { /* la fuente ya termino */ }
    }
    this.voices.delete(voice)
    const wait = Math.max(0, (atTime - (this.context?.currentTime ?? 0)) * 1000) + 140
    const timeout = setTimeout(() => {
      this.pendingCleanups.delete(timeout)
      this.disconnectVoice(voice)
    }, wait)
    this.pendingCleanups.add(timeout)
  }

  private clearIntensityHold(): void {
    if (this.intensityTimer) clearTimeout(this.intensityTimer)
    this.intensityTimer = null
    this.intensityUntil = 0
  }

  private persist(): void {
    try { this.storage.setItem(STORAGE_KEY, JSON.stringify(this.prefs)) }
    catch { /* localStorage puede estar bloqueado; el juego sigue funcionando */ }
  }
}
