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
  musicTheme: string | null
  phrasesPlayed: number
  preferences: Readonly<AudioPreferences>
  activeMusicVoices: number
  activeEffectVoices: number
  phraseTimerPending: boolean
  nextPhraseDelayMs: number | null
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

export const MUSIC_TIMING = {
  introSectionsMs: [3_800, 6_000, 7_000, 6_000] as const,
  hotelEntryMs: [250, 700] as const,
  hotelCycleMs: [10_000, 16_000] as const,
  investigationEntryMs: [550, 1_100] as const,
  investigationCycleMs: [7_000, 12_000] as const,
  undergroundCycleMs: [7_500, 13_500] as const,
} as const

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
  private nextPhraseDelayMs: number | null = null
  private investigationTimer: ReturnType<typeof setTimeout> | null = null
  private unlockPromise: Promise<void> | null = null
  private prefs: AudioPreferences
  private _unlocked = false
  private baseState: MusicState = 'hotel'
  private activeState: MusicState = 'hotel'
  private phraseIndex = 0
  private phrasesPlayed = 0
  private currentTheme: string | null = null
  private lastHotelVariant = -1
  private lastInvestigationVariant = -1
  private lastUndergroundVariant = -1
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
      musicTheme: this.currentTheme,
      phrasesPlayed: this.phrasesPlayed,
      preferences: { ...this.prefs },
      activeMusicVoices: this.voiceCount('music'),
      activeEffectVoices: this.voiceCount('effects'),
      phraseTimerPending: this.phraseTimer != null,
      nextPhraseDelayMs: this.nextPhraseDelayMs,
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
    if (changed) {
      this.activeState = desired
      this.phraseIndex = 0
      this.currentTheme = null
    }
    if (!this.context || !this.musicStateGain || !this._unlocked) return
    if (this.prefs.muted || this.prefs.music === 0 || this.pageHidden) {
      this.cancelPhraseTimer()
      this.stopVoices('music')
      return
    }
    if (desired === 'silent') {
      const now = this.context.currentTime
      this.cancelPhraseTimer()
      this.currentTheme = null
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
    if (state === 'hotel') return this.randomBetween(...MUSIC_TIMING.hotelEntryMs)
    if (state === 'investigation') return this.randomBetween(...MUSIC_TIMING.investigationEntryMs)
    return this.randomBetween(900, 1_600)
  }

  private schedulePhrase(delayMs: number): void {
    this.cancelPhraseTimer()
    if (!this.context || this.prefs.muted || this.prefs.music === 0 || this.pageHidden || this.activeState === 'silent') return
    this.nextPhraseDelayMs = Math.max(0, delayMs)
    this.phraseTimer = setTimeout(() => {
      this.phraseTimer = null
      this.nextPhraseDelayMs = null
      if (!this.context || this.context.state === 'closed') return
      const nextDelay = this.composePhrase(this.activeState)
      this.schedulePhrase(nextDelay)
    }, Math.max(0, delayMs))
  }

  private composePhrase(state: MusicState): number {
    if (!this.context || !this.musicStateGain) return 30_000
    const now = this.context.currentTime + 0.04
    const phraseIndex = this.phraseIndex
    this.phraseIndex += 1
    this.phrasesPlayed += 1
    if (state === 'intro') return this.introPhrase(now, phraseIndex)
    if (state === 'hotel') return this.hotelPhrase(now)
    if (state === 'investigation') return this.investigationPhrase(now)
    if (state === 'underground') return this.undergroundPhrase(now)
    return 30_000
  }

  private introPhrase(start: number, phraseIndex: number): number {
    const beat = 60 / 58
    const section = phraseIndex % MUSIC_TIMING.introSectionsMs.length
    if (section === 0) {
      this.currentTheme = 'intro-titulo'
      ;[45, 52, 57].forEach((note, index) => {
        this.fmTone(midi(note), start + index * beat * 0.12, 3.35, 'music', {
          ratio: index === 1 ? 2.01 : 2,
          index: 1.8,
          attack: 0.48,
          level: 0.019,
        })
      })
      ;[69, 68, 64].forEach((note, index) => {
        this.fmTone(midi(note), start + beat * (0.6 + index * 1.02), 0.95, 'music', {
          ratio: 2.01,
          index: 2.2,
          attack: 0.07,
          level: 0.024,
        })
      })
    } else if (section === 1) {
      this.currentTheme = 'intro-hotel'
      ;[50, 57, 63].forEach((note, index) => {
        this.fmTone(midi(note), start + index * beat * 0.11, 4.9, 'music', {
          ratio: 2,
          index: 1.45,
          attack: 0.6,
          level: 0.018,
        })
      })
      ;[69, 72, 71].forEach((note, index) => {
        this.fmTone(midi(note), start + beat * (0.65 + index * 1.55), 1.1, 'music', {
          ratio: index === 1 ? 2.01 : 2,
          index: 1.85,
          attack: 0.025,
          level: 0.026,
        })
      })
      this.fmTone(midi(62), start + beat * 4.95, 0.9, 'music', {
        ratio: 2.01,
        index: 1.3,
        level: 0.018,
      })
    } else if (section === 2) {
      this.currentTheme = 'intro-investigadores'
      ;[45, 52].forEach((note, index) => {
        this.fmTone(midi(note), start + index * beat * 0.18, 6.15, 'music', {
          ratio: index === 0 ? 1.997 : 2.01,
          index: 1.55,
          attack: 0.72,
          level: 0.017,
        })
      })
      ;[64, 67, 70].forEach((note, index) => {
        this.fmTone(midi(note), start + beat * (0.75 + index * 1.95), 1.2, 'music', {
          ratio: 2.01,
          index: 1.7 + index * 0.18,
          attack: 0.045,
          level: 0.024,
        })
      })
      this.fmTone(midi(58), start + beat * 5.65, 0.9, 'music', {
        ratio: 3.98,
        index: 1.1,
        level: 0.017,
      })
    } else {
      this.currentTheme = 'intro-telegrama'
      ;[44, 51, 57].forEach((note, index) => {
        this.fmTone(midi(note), start + index * beat * 0.13, 5.5, 'music', {
          ratio: index === 1 ? 2.014 : 1.997,
          index: 2.05,
          attack: 0.62,
          level: 0.017,
          detune: index === 2 ? 5 : 0,
        })
      })
      ;[69, 68, 64, 63].forEach((note, index) => {
        this.fmTone(midi(note), start + beat * (0.55 + index * 1.18), 1.0, 'music', {
          ratio: index % 2 === 0 ? 2.01 : 1.997,
          index: 2.15,
          attack: 0.055,
          level: 0.023,
        })
      })
    }
    return MUSIC_TIMING.introSectionsMs[section]!
  }

  private hotelPhrase(start: number): number {
    const firstPublicPhrase = this.lastHotelVariant < 0 && this.lastZone === 'public'
    const variant = firstPublicPhrase ? 0 : this.nextVariant(3, this.lastHotelVariant)
    this.lastHotelVariant = variant
    const levelScale = this.lastZone === 'private' ? 0.82 : 1
    if (variant === 0) {
      this.currentTheme = 'hotel-cortesia-rota'
      const beat = 60 / 66
      for (const note of [50, 57, 63]) {
        this.fmTone(midi(note), start, 2.5, 'music', {
          ratio: 2,
          index: 1.2,
          attack: 0.024,
          level: 0.021 * levelScale,
        })
      }
      ;[69, 72, 71, 67].forEach((note, index) => {
        const offsets = [1, 2.45, 4.25, 6.8]
        this.fmTone(midi(note), start + beat * offsets[index]!, 1.08, 'music', {
          ratio: index === 1 ? 2.01 : 2,
          index: 1.7,
          attack: 0.012,
          level: 0.032 * levelScale,
        })
      })
      this.fmTone(midi(50), start + beat * 6.15, 1.75, 'music', {
        ratio: 1,
        index: 0.7,
        attack: 0.12,
        level: 0.015 * levelScale,
      })
      return this.randomBetween(10_000, 14_000)
    }
    if (variant === 1) {
      this.currentTheme = 'hotel-galeria-de-espejos'
      const beat = 60 / 70
      for (const note of [53, 60, 64]) {
        this.fmTone(midi(note), start, 2.85, 'music', {
          ratio: 2.01,
          index: 1.35,
          attack: 0.035,
          level: 0.019 * levelScale,
        })
      }
      ;[72, 75, 71].forEach((note, index) => {
        const offsets = [0.9, 2.9, 5.35]
        this.fmTone(midi(note), start + beat * offsets[index]!, 1.2, 'music', {
          ratio: index === 1 ? 3.99 : 2.01,
          index: 1.9,
          attack: 0.018,
          level: 0.029 * levelScale,
        })
      })
      ;[65, 64].forEach((note, index) => {
        this.fmTone(midi(note), start + beat * (7.1 + index * 1.15), 0.9, 'music', {
          ratio: 2,
          index: 1.35,
          level: 0.022 * levelScale,
        })
      })
      return this.randomBetween(11_000, 15_000)
    }
    this.currentTheme = 'hotel-despues-de-hora'
    const beat = 60 / 62
    for (const note of [48, 55, 61]) {
      this.fmTone(midi(note), start, 3.15, 'music', {
        ratio: 1.997,
        index: 1.65,
        attack: 0.08,
        level: 0.018 * levelScale,
      })
    }
    ;[67, 66, 70, 69].forEach((note, index) => {
      const offsets = [1.25, 3.05, 4.95, 7.15]
      this.fmTone(midi(note), start + beat * offsets[index]!, 1.12, 'music', {
        ratio: index === 2 ? 3.98 : 2.014,
        index: 1.65,
        attack: 0.02,
        level: 0.028 * levelScale,
        detune: index % 2 === 0 ? -2 : 2,
      })
    })
    return this.randomBetween(12_000, 16_000)
  }

  private investigationPhrase(start: number): number {
    const beat = 60 / 72
    const variants = [
      { pulse: [38, 44], motif: [62, 63, 66], name: 'investigacion-piezas' },
      { pulse: [36, 43], motif: [59, 62, 63, 67], name: 'investigacion-margen' },
      { pulse: [41, 47], motif: [65, 66, 69], name: 'investigacion-indicio' },
    ] as const
    const variant = this.nextVariant(variants.length, this.lastInvestigationVariant)
    this.lastInvestigationVariant = variant
    const theme = variants[variant]!
    this.currentTheme = theme.name
    const pulses = 5 + Math.floor(this.random() * 3)
    for (let index = 0; index < pulses; index += 1) {
      const note = theme.pulse[index % theme.pulse.length]!
      this.fmTone(midi(note), start + index * beat, 0.32, 'music', {
        ratio: 1,
        index: 0.75,
        attack: 0.008,
        level: 0.021,
        type: 'triangle',
      })
    }
    const motif = this.random() > 0.22 ? theme.motif : theme.motif.slice(0, -1)
    motif.forEach((note, index) => {
      this.fmTone(midi(note), start + beat * (1.5 + index * 1.55), 0.72, 'music', {
        ratio: 2.02,
        index: 1.25,
        attack: 0.012,
        level: 0.02,
      })
    })
    return this.randomBetween(...MUSIC_TIMING.investigationCycleMs)
  }

  private undergroundPhrase(start: number): number {
    const variants = [
      { notes: [36, 42], noise: [520, 170], name: 'subsuelo-respiracion' },
      { notes: [34, 41], noise: [430, 125], name: 'subsuelo-piedra' },
      { notes: [37, 43], noise: [610, 190], name: 'subsuelo-maquina-imposible' },
    ] as const
    const variant = this.nextVariant(variants.length, this.lastUndergroundVariant)
    this.lastUndergroundVariant = variant
    const theme = variants[variant]!
    this.currentTheme = theme.name
    const firstLength = this.randomBetween(3_200, 5_400) / 1000
    const secondStart = start + this.randomBetween(1_100, 2_300) / 1000
    this.fmTone(midi(theme.notes[0]), start, firstLength, 'music', {
      ratio: 1.997,
      index: 2.8,
      attack: 0.75,
      level: 0.019,
      endFrequency: midi(theme.notes[0] + 1),
      detune: -7,
    })
    this.fmTone(midi(theme.notes[1]), secondStart, this.randomBetween(2_500, 4_600) / 1000, 'music', {
      ratio: 2.014,
      index: 3.2,
      attack: 0.9,
      level: 0.013,
      detune: 9,
    })
    this.noiseBreath(start + 0.35, firstLength * 0.8, 'music', theme.noise[0], theme.noise[1], 0.009)
    return this.randomBetween(...MUSIC_TIMING.undergroundCycleMs)
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
    this.nextPhraseDelayMs = null
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

  private nextVariant(count: number, previous: number): number {
    if (previous < 0 || count < 2) return Math.floor(this.random() * count)
    return (previous + 1 + Math.floor(this.random() * (count - 1))) % count
  }
}
