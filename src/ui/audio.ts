import type { FeedbackCue } from '../engine/game'

export type AudioBus = 'music' | 'ambience' | 'effects'

export interface AudioPreferences {
  muted: boolean
  music: number
  ambience: number
  effects: number
}

const STORAGE_KEY = 'la-broma-macabra.audio.v1'
const DEFAULTS: AudioPreferences = { muted: false, music: 0.28, ambience: 0.22, effects: 0.5 }

type AudioStorage = Pick<Storage, 'getItem' | 'setItem'>

const memoryStorage: AudioStorage = { getItem: () => null, setItem: () => undefined }

export function readAudioPreferences(
  storage: Pick<Storage, 'getItem'> = typeof localStorage === 'undefined' ? memoryStorage : localStorage,
): AudioPreferences {
  try {
    const value = JSON.parse(storage.getItem(STORAGE_KEY) ?? '') as Partial<AudioPreferences>
    return {
      muted: Boolean(value.muted),
      music: clamp(value.music ?? DEFAULTS.music),
      ambience: clamp(value.ambience ?? DEFAULTS.ambience),
      effects: clamp(value.effects ?? DEFAULTS.effects),
    }
  } catch {
    return { ...DEFAULTS }
  }
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}

interface Track {
  element: HTMLAudioElement
  gain: GainNode
  url: string
}

const AMBIENCE: Record<string, string> = {
  recepcion: '/audio/hall.ogg',
  terraza: '/audio/garden.ogg',
  salon_isis: '/audio/garden.ogg',
  cocina: '/audio/kitchen.ogg',
  almacen_sotano: '/audio/basement.ogg',
  pasillo_intermedio: '/audio/basement.ogg',
  salon_ali_bey: '/audio/basement.ogg',
  sala_escombros: '/audio/basement.ogg',
  viejo_templo: '/audio/basement.ogg',
}

const MUSIC: Record<string, string> = {
  arrival_checkin: '/audio/hotel-theme.mp3',
  behler_encargo: '/audio/hotel-theme.mp3',
  terrace_conflict: '/audio/suspicion.ogg',
  basement_threshold: '/audio/underground-theme.ogg',
  ears: '/audio/underground-theme.ogg',
}

const EFFECTS: Record<FeedbackCue['kind'], string | undefined> = {
  location: '/audio/steps.ogg',
  clue: '/audio/clue.ogg',
  report: '/audio/paper.ogg',
  roll: '/audio/dice.ogg',
  damage: '/audio/damage.ogg',
  sanity: '/audio/solar-disk.ogg',
  scene: '/audio/clock.wav',
  luck: '/audio/clue.ogg',
  clock: '/audio/clock.wav',
  door: '/audio/door.ogg',
}

export class AudioManager {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private gains: Record<AudioBus, GainNode | null> = { music: null, ambience: null, effects: null }
  private current: Record<'music' | 'ambience', Track | null> = { music: null, ambience: null }
  private prefs: AudioPreferences
  private _unlocked = false
  private lastScene: string | null = null

  constructor(private readonly storage: AudioStorage = typeof localStorage === 'undefined' ? memoryStorage : localStorage) {
    this.prefs = readAudioPreferences(storage)
  }

  get preferences(): Readonly<AudioPreferences> { return this.prefs }
  get unlocked(): boolean { return this._unlocked }

  async unlock(): Promise<void> {
    if (!this.context) {
      this.context = new AudioContext()
      this.master = this.context.createGain()
      this.master.connect(this.context.destination)
      for (const bus of ['music', 'ambience', 'effects'] as const) {
        const gain = this.context.createGain()
        gain.connect(this.master)
        this.gains[bus] = gain
      }
      this.applyPreferences()
    }
    await this.context.resume()
    this._unlocked = true
  }

  setMuted(muted: boolean): void {
    this.prefs = { ...this.prefs, muted }
    this.persist()
    this.applyPreferences()
  }

  setVolume(bus: AudioBus, value: number): void {
    this.prefs = { ...this.prefs, [bus]: clamp(value) }
    this.persist()
    this.applyPreferences()
  }

  sync(location: string, scene: string | null): void {
    if (!this._unlocked) return
    this.crossfade('ambience', AMBIENCE[location] ?? null, true)
    this.crossfade('music', scene ? MUSIC[scene] ?? null : null, false)
    if (scene === 'solar_disk' && this.lastScene !== 'solar_disk') this.effect('/audio/solar-disk.ogg')
    this.lastScene = scene
  }

  handle(cues: FeedbackCue[]): void {
    if (!this._unlocked) return
    for (const cue of cues) {
      const url = EFFECTS[cue.kind]
      if (url) this.effect(url)
    }
  }

  private crossfade(bus: 'music' | 'ambience', url: string | null, loop: boolean): void {
    const active = this.current[bus]
    if (active?.url === url) return
    const now = this.context?.currentTime ?? 0
    if (active) {
      active.gain.gain.cancelScheduledValues(now)
      active.gain.gain.setValueAtTime(active.gain.gain.value, now)
      active.gain.gain.linearRampToValueAtTime(0, now + 0.6)
      window.setTimeout(() => active.element.pause(), 700)
      this.current[bus] = null
    }
    if (!url || !this.context || !this.gains[bus]) return
    const element = new Audio(url)
    element.loop = loop
    element.preload = 'metadata'
    const source = this.context.createMediaElementSource(element)
    const gain = this.context.createGain()
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(1, now + 0.8)
    source.connect(gain)
    gain.connect(this.gains[bus]!)
    const track = { element, gain, url }
    this.current[bus] = track
    void element.play().catch(() => undefined)
    if (bus === 'music') window.setTimeout(() => {
      if (this.current.music === track) this.crossfade('music', null, false)
    }, 18_000)
  }

  private effect(url: string): void {
    if (!this.context || !this.gains.effects) return
    const element = new Audio(url)
    const source = this.context.createMediaElementSource(element)
    source.connect(this.gains.effects)
    void element.play().catch(() => undefined)
  }

  private applyPreferences(): void {
    if (!this.context || !this.master) return
    const now = this.context.currentTime
    this.master.gain.setValueAtTime(this.prefs.muted ? 0 : 1, now)
    for (const bus of ['music', 'ambience', 'effects'] as const) {
      this.gains[bus]?.gain.setValueAtTime(this.prefs[bus], now)
    }
  }

  private persist(): void {
    this.storage.setItem(STORAGE_KEY, JSON.stringify(this.prefs))
  }
}
