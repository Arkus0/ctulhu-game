export type AudioBus = 'music' | 'effects'

export type MusicState = 'silent' | 'intro' | 'hotel' | 'investigation' | 'underground'
export type AudioZone = 'public' | 'private' | 'underground'
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
  musicState: MusicState
  preferences: Readonly<AudioPreferences>
  activeMusicVoices: number
  activeEffectVoices: number
  phraseTimerPending: boolean
  investigationTimerPending: boolean
}

type AudioStorage = Pick<Storage, 'getItem' | 'setItem'>
type ContextFactory = () => AudioContext

interface Voice {
  bus: AudioBus
  sources: AudioScheduledSourceNode[]
  nodes: AudioNode[]
  oscillators: OscillatorNode[]
  stopped: boolean
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

const STORAGE_KEY = 'la-broma-macabra.audio.v2'
const LEGACY_STORAGE_KEY = 'la-broma-macabra.audio.v1'
const DEFAULTS: AudioPreferences = { muted: false, music: 0.22, effects: 0.45 }
const MUSIC_POLYPHONY = 12
const EFFECTS_POLYPHONY = 14

const memoryStorage: AudioStorage = { getItem: () => null, setItem: () => undefined }

function defaultStorage(): AudioStorage {
  return typeof localStorage === 'undefined' ? memoryStorage : localStorage
}

export function readAudioPreferences(storage: Pick<Storage, 'getItem'> = defaultStorage()): AudioPreferences {
  try {
    const raw = storage.getItem(STORAGE_KEY) ?? storage.getItem(LEGACY_STORAGE_KEY)
    const value = JSON.parse(raw ?? '') as Partial<AudioPreferences>
    return {
      muted: Boolean(value.muted),
      music: clamp(value.music ?? DEFAULTS.music),
      effects: clamp(value.effects ?? DEFAULTS.effects),
    }
  } catch {
    return { ...DEFAULTS }
  }
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}

function midi(note: number): number {
  return 440 * 2 ** ((note - 69) / 12)
}

/**
 * Sintesis original y efimera para El Disco Egipcio.
 *
 * No carga ningun recurso: todas las voces nacen de osciladores y de un buffer
 * de ruido creado al desbloquear el contexto. El planificador usa su propio
 * azar; nunca consulta ni altera el RNG, el reloj o el estado de la partida.
 */
export class AudioManager {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private musicBus: GainNode | null = null
  private effectsBus: GainNode | null = null
  private musicStateGain: GainNode | null = null
  private musicFilter: BiquadFilterNode | null = null
  private noise: AudioBuffer | null = null
  private voices = new Set<Voice>()
  private phraseTimer: ReturnType<typeof setTimeout> | null = null
  private investigationTimer: ReturnType<typeof setTimeout> | null = null
  private unlockPromise: Promise<void> | null = null
  private prefs: AudioPreferences
  private _unlocked = false
  private baseState: MusicState = 'hotel'
  private activeState: MusicState = 'hotel'
  private investigationActive = false
  private investigationUntil = 0
  private pageHidden = false
  private randomState = 0x6d2b79f5
  private lastCueAt = new Map<SynthCue, number>()
  private lastStrongCueAt = Number.NEGATIVE_INFINITY
  private lastLocation: string | null = null
  private lastZone: AudioZone | null = null
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
      musicState: this.activeState,
      preferences: { ...this.prefs },
      activeMusicVoices: this.voiceCount('music'),
      activeEffectVoices: this.voiceCount('effects'),
      phraseTimerPending: this.phraseTimer != null,
      investigationTimerPending: this.investigationTimer != null,
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
        this.randomState = (this.randomState ^ Date.now()) >>> 0
        this.applyPreferences()
        this.refreshMusic(true)
      })
      .finally(() => { this.unlockPromise = null })
    return this.unlockPromise
  }

  setMuted(muted: boolean): void {
    this.prefs = { ...this.prefs, muted }
    this.persist()
    this.applyPreferences()
    if (muted) {
      this.cancelPhraseTimer()
      this.stopVoices('music')
      this.stopVoices('effects')
    } else {
      if (this.context?.state === 'suspended') void this.context.resume().catch(() => undefined)
      this.refreshMusic(true)
    }
  }

  setVolume(bus: AudioBus, value: number): void {
    this.prefs = { ...this.prefs, [bus]: clamp(value) }
    this.persist()
    this.applyPreferences()
    if (bus === 'music') {
      if (this.prefs.music === 0) {
        this.cancelPhraseTimer()
        this.stopVoices('music')
      } else this.refreshMusic(true)
    }
    if (bus === 'effects' && this.prefs.effects === 0) this.stopVoices('effects')
  }

  setBaseMusicState(state: MusicState): void {
    if (this.baseState === state) return
    this.baseState = state
    if (state === 'silent' || state === 'intro' || state === 'underground') this.clearInvestigationHold()
    this.refreshMusic()
  }

  setInvestigationActive(active: boolean): void {
    if (this.investigationActive === active) return
    this.investigationActive = active
    this.refreshMusic()
  }

  focusInvestigation(durationMs = 25_000): void {
    if (this.baseState === 'silent' || this.baseState === 'intro' || this.baseState === 'underground') return
    this.investigationUntil = Date.now() + Math.max(0, durationMs)
    if (this.investigationTimer) clearTimeout(this.investigationTimer)
    this.investigationTimer = setTimeout(() => {
      this.investigationTimer = null
      this.investigationUntil = 0
      this.refreshMusic()
    }, Math.max(0, durationMs))
    this.refreshMusic()
  }

  noteLocation(location: string, zone: AudioZone): void {
    if (this.lastLocation == null) {
      this.lastLocation = location
      this.lastZone = zone
      return
    }
    if (this.lastLocation === location) return
    const zoneChanged = this.lastZone !== zone
    this.lastLocation = location
    this.lastZone = zone
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
    if (hidden) {
      this.cancelPhraseTimer()
      this.stopVoices('music')
    } else this.refreshMusic(true)
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
    this.cancelPhraseTimer()
    this.clearInvestigationHold()
    this.stopVoices()
    for (const node of [this.musicStateGain, this.musicFilter, this.musicBus, this.effectsBus, this.master]) {
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
    musicStateGain.connect(musicFilter)
    musicFilter.connect(musicBus)
    musicBus.connect(master)
    effectsBus.connect(master)
    master.connect(context.destination)
    this.context = context
    this.master = master
    this.musicBus = musicBus
    this.effectsBus = effectsBus
    this.musicStateGain = musicStateGain
    this.musicFilter = musicFilter
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

  private desiredMusicState(): MusicState {
    if (this.baseState === 'silent' || this.baseState === 'intro' || this.baseState === 'underground') return this.baseState
    if (this.investigationActive || this.investigationUntil > Date.now()) return 'investigation'
    return this.baseState
  }

  private refreshMusic(force = false): void {
    const desired = this.desiredMusicState()
    const changed = desired !== this.activeState
    if (changed) this.activeState = desired
    if (!this.context || !this.musicStateGain || !this._unlocked) return
    if (this.prefs.muted || this.prefs.music === 0 || this.pageHidden) {
      this.cancelPhraseTimer()
      this.stopVoices('music')
      return
    }
    if (desired === 'silent') {
      const now = this.context.currentTime
      this.cancelPhraseTimer()
      this.musicStateGain.gain.cancelScheduledValues(now)
      this.musicStateGain.gain.setValueAtTime(this.musicStateGain.gain.value, now)
      this.musicStateGain.gain.linearRampToValueAtTime(0.0001, now + 0.45)
      this.stopVoices('music', now + 0.48)
      return
    }
    if (changed) {
      const now = this.context.currentTime
      this.cancelPhraseTimer()
      this.musicStateGain.gain.cancelScheduledValues(now)
      this.musicStateGain.gain.setValueAtTime(this.musicStateGain.gain.value, now)
      this.musicStateGain.gain.linearRampToValueAtTime(0.0001, now + 0.18)
      this.stopVoices('music', now + 0.21)
      this.musicStateGain.gain.setValueAtTime(0.0001, now + 0.22)
      this.musicStateGain.gain.linearRampToValueAtTime(1, now + 0.72)
      this.schedulePhrase(this.initialDelay(desired) + 720)
    } else if (force || this.phraseTimer == null) {
      this.schedulePhrase(this.initialDelay(desired))
    }
  }

  private initialDelay(state: MusicState): number {
    if (state === 'intro') return 220
    if (state === 'hotel') return this.randomBetween(4_000, 8_000)
    if (state === 'investigation') return this.randomBetween(1_200, 2_400)
    return this.randomBetween(1_600, 3_000)
  }

  private schedulePhrase(delayMs: number): void {
    this.cancelPhraseTimer()
    if (!this.context || this.prefs.muted || this.prefs.music === 0 || this.pageHidden || this.activeState === 'silent') return
    this.phraseTimer = setTimeout(() => {
      this.phraseTimer = null
      if (!this.context || this.context.state === 'closed') return
      const nextDelay = this.composePhrase(this.activeState)
      this.schedulePhrase(nextDelay)
    }, Math.max(0, delayMs))
  }

  private composePhrase(state: MusicState): number {
    if (!this.context || !this.musicStateGain) return 30_000
    const now = this.context.currentTime + 0.04
    if (state === 'intro') return this.introPhrase(now)
    if (state === 'hotel') return this.hotelPhrase(now)
    if (state === 'investigation') return this.investigationPhrase(now)
    if (state === 'underground') return this.undergroundPhrase(now)
    return 30_000
  }

  private introPhrase(start: number): number {
    const beat = 60 / 58
    ;[45, 52, 57].forEach((note, index) => {
      this.fmTone(midi(note), start + index * beat * 0.16, 3.4, 'music', {
        ratio: index === 1 ? 2.01 : 2,
        index: 1.8,
        attack: 0.55,
        level: 0.018,
      })
    })
    ;[69, 68, 64].forEach((note, index) => {
      this.fmTone(midi(note), start + beat * (1.35 + index * 1.4), 1.2, 'music', {
        ratio: 2.01,
        index: 2.2,
        attack: 0.08,
        level: 0.022,
      })
    })
    return 18_000
  }

  private hotelPhrase(start: number): number {
    const beat = 60 / 66
    const variant = Math.floor(this.random() * 3)
    const chords = [[50, 57, 63], [50, 57], [57, 63]]
    for (const note of chords[variant]!) {
      this.fmTone(midi(note), start, 1.6, 'music', { ratio: 2, index: 1.15, attack: 0.018, level: 0.018 })
    }
    const motif = variant === 2 ? [69, 72] : [69, 72, 71]
    motif.forEach((note, index) => {
      this.fmTone(midi(note), start + beat * (1.1 + index * 1.35), 1.05, 'music', {
        ratio: index === 1 ? 2.01 : 2,
        index: 1.65,
        attack: 0.01,
        level: 0.027,
      })
    })
    return this.randomBetween(18_000, 35_000)
  }

  private investigationPhrase(start: number): number {
    const beat = 60 / 72
    const pulses = 5 + Math.floor(this.random() * 3)
    for (let index = 0; index < pulses; index += 1) {
      const note = index % 2 === 0 ? 38 : 44
      this.fmTone(midi(note), start + index * beat, 0.32, 'music', {
        ratio: 1,
        index: 0.75,
        attack: 0.008,
        level: 0.021,
        type: 'triangle',
      })
    }
    const motif = this.random() > 0.35 ? [62, 63, 66] : [62, 63]
    motif.forEach((note, index) => {
      this.fmTone(midi(note), start + beat * (1.5 + index * 1.55), 0.72, 'music', {
        ratio: 2.02,
        index: 1.25,
        attack: 0.012,
        level: 0.02,
      })
    })
    return this.randomBetween(8_000, 18_000)
  }

  private undergroundPhrase(start: number): number {
    const firstLength = this.randomBetween(3_200, 5_400) / 1000
    const secondStart = start + this.randomBetween(1_100, 2_300) / 1000
    this.fmTone(midi(36), start, firstLength, 'music', {
      ratio: 1.997,
      index: 2.8,
      attack: 0.75,
      level: 0.019,
      endFrequency: midi(37),
      detune: -7,
    })
    this.fmTone(midi(42), secondStart, this.randomBetween(2_500, 4_600) / 1000, 'music', {
      ratio: 2.014,
      index: 3.2,
      attack: 0.9,
      level: 0.013,
      detune: 9,
    })
    this.noiseBreath(start + 0.35, firstLength * 0.8, 'music', 520, 170, 0.009)
    return this.randomBetween(10_000, 22_000)
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
    const voice: Voice = { bus, sources, nodes, oscillators, stopped: false }
    this.voices.add(voice)
    let remaining = sources.length
    const ended = (): void => {
      remaining -= 1
      if (remaining <= 0) this.cleanupVoice(voice)
    }
    for (const source of sources) source.addEventListener('ended', ended, { once: true })
  }

  private cleanupVoice(voice: Voice): void {
    if (!this.voices.delete(voice)) return
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

  private stopVoice(voice: Voice, atTime = this.context?.currentTime ?? 0): void {
    if (voice.stopped) return
    voice.stopped = true
    for (const source of voice.sources) {
      try { source.stop(atTime) } catch { /* la fuente ya termino */ }
    }
  }

  private cancelPhraseTimer(): void {
    if (this.phraseTimer) clearTimeout(this.phraseTimer)
    this.phraseTimer = null
  }

  private clearInvestigationHold(): void {
    if (this.investigationTimer) clearTimeout(this.investigationTimer)
    this.investigationTimer = null
    this.investigationUntil = 0
  }

  private persist(): void {
    try { this.storage.setItem(STORAGE_KEY, JSON.stringify(this.prefs)) }
    catch { /* localStorage puede estar bloqueado; el juego sigue funcionando */ }
  }

  private random(): number {
    let value = this.randomState || 0x6d2b79f5
    value ^= value << 13
    value ^= value >>> 17
    value ^= value << 5
    this.randomState = value >>> 0
    return this.randomState / 0xffffffff
  }

  private randomBetween(min: number, max: number): number {
    return Math.round(min + (max - min) * this.random())
  }
}
