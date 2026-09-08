import { afterEach, describe, expect, it, vi } from 'vitest'
import { AudioManager, readAudioPreferences } from '../src/ui/audio'
import audioSource from '../src/ui/audio.ts?raw'
import musicSource from '../src/ui/music.ts?raw'

class FakeParam {
  value = 1
  cancelScheduledValues(): void {}
  setTargetAtTime(value: number): void { this.value = value }
  setValueAtTime(value: number): void { this.value = value }
  linearRampToValueAtTime(value: number): void { this.value = value }
  exponentialRampToValueAtTime(value: number): void { this.value = value }
}

class FakeNode {
  gain = new FakeParam()
  frequency = new FakeParam()
  detune = new FakeParam()
  Q = new FakeParam()
  threshold = new FakeParam()
  knee = new FakeParam()
  ratio = new FakeParam()
  attack = new FakeParam()
  release = new FakeParam()
  type = 'lowpass'
  connect(): FakeNode { return this }
  disconnect(): void { this.disconnects += 1 }
  disconnects = 0
}

interface Tone { frequency: number; start: number; stop: number }

/**
 * Fuente programada que **nunca** avisa de que ha terminado.
 *
 * Es el caso que dejaba voces fantasma: una fuente detenida antes de su propio
 * `start` puede no emitir `ended` en un navegador real.
 */
class FakeSource extends FakeNode {
  buffer: unknown = null
  loop = false
  started = -1
  stopped = -1
  constructor(private readonly registry: Tone[]) { super() }
  start(when = 0): void { this.started = when }
  stop(when = 0): void {
    if (this.stopped < 0) this.stopped = when
    this.registry.push({ frequency: this.frequency.value, start: this.started, stop: this.stopped })
  }
  addEventListener(): void {}
}

class FakeContext {
  state: AudioContextState = 'suspended'
  currentTime = 0
  sampleRate = 8_000
  destination = new FakeNode()
  resumeCalls = 0
  closeCalls = 0
  /** Cada `stop` deja aqui la nota, con su comienzo y su final. */
  tones: Tone[] = []

  createGain(): FakeNode { return new FakeNode() }
  createBiquadFilter(): FakeNode { return new FakeNode() }
  createDynamicsCompressor(): FakeNode { return new FakeNode() }
  createOscillator(): FakeSource { return new FakeSource(this.tones) }
  createBufferSource(): FakeSource { return new FakeSource(this.tones) }
  createBuffer(_channels: number, length: number): { getChannelData: () => Float32Array } {
    const data = new Float32Array(length)
    return { getChannelData: () => data }
  }
  async resume(): Promise<void> { this.resumeCalls += 1; this.state = 'running' }
  async close(): Promise<void> { this.closeCalls += 1; this.state = 'closed' }
}

function build(): { audio: AudioManager; context: FakeContext } {
  const context = new FakeContext()
  const audio = new AudioManager(
    { getItem: () => null, setItem: () => undefined },
    () => context as unknown as AudioContext,
  )
  return { audio, context }
}

/** Deja correr el reloj del contexto y los temporizadores a la vez. */
function run(context: FakeContext, milliseconds: number, step = 50): void {
  for (let elapsed = 0; elapsed < milliseconds; elapsed += step) {
    context.currentTime += step / 1000
    vi.advanceTimersByTime(step)
  }
}

/** El silencio mas largo entre `desde` y `hasta`, segun lo ya programado. */
function longestSilence(tones: Tone[], desde: number, hasta: number): number {
  const spans = tones
    .filter((tone) => tone.stop > desde && tone.start < hasta)
    .map((tone) => [Math.max(desde, tone.start), Math.min(hasta, tone.stop)] as const)
    .sort((left, right) => left[0] - right[0])
  let cursor = desde
  let worst = 0
  for (const [start, end] of spans) {
    if (start > cursor) worst = Math.max(worst, start - cursor)
    cursor = Math.max(cursor, end)
  }
  return Math.max(worst, hasta - cursor)
}

afterEach(() => vi.useRealTimers())

describe('audio sintetizado', () => {
  it('migra las preferencias antiguas y sube la musica que nadie habia tocado', () => {
    const v1 = { getItem: (key: string) => key.endsWith('.v1')
      ? JSON.stringify({ muted: true, music: 0.22, ambience: 0.8, effects: 0.62 })
      : null }
    expect(readAudioPreferences(v1)).toEqual({ muted: true, music: 0.45, effects: 0.62 })

    const elegido = { getItem: (key: string) => key.endsWith('.v2')
      ? JSON.stringify({ muted: false, music: 0.9, effects: 0.3 })
      : null }
    expect(readAudioPreferences(elegido)).toEqual({ muted: false, music: 0.9, effects: 0.3 })

    const actual = { getItem: (key: string) => key.endsWith('.v3')
      ? JSON.stringify({ muted: false, music: 0.1, effects: 0.2 })
      : null }
    expect(readAudioPreferences(actual)).toEqual({ muted: false, music: 0.1, effects: 0.2 })
  })

  it('crea y reanuda un unico AudioContext ante desbloqueos simultaneos', async () => {
    vi.useFakeTimers()
    const context = new FakeContext()
    let creations = 0
    const audio = new AudioManager(
      { getItem: () => null, setItem: () => undefined },
      () => { creations += 1; return context as unknown as AudioContext },
    )
    await Promise.all([audio.unlock(), audio.unlock(), audio.unlock()])
    await audio.unlock()
    expect(creations).toBe(1)
    expect(context.resumeCalls).toBe(1)
    expect(audio.diagnostics).toMatchObject({ unlocked: true, contextState: 'running', scene: 'silent' })
    audio.dispose()
  })

  it('la partida suena de verdad: media hora de hall sin huecos largos', async () => {
    vi.useFakeTimers()
    const { audio, context } = build()
    await audio.unlock()
    audio.setMusicScene('hall')
    run(context, 30_000)
    const diagnostico = audio.diagnostics
    expect(diagnostico.musicTheme).toBe('hall-cortesia-rota')
    expect(diagnostico.sectionsPlayed).toBeGreaterThanOrEqual(2)
    expect(diagnostico.musicGain).toBe(1)
    expect(diagnostico.schedulerPending).toBe(true)
    expect(context.tones.length).toBeGreaterThanOrEqual(25)
    // Del segundo 1 al 28: ya sonando y sin contar lo que aun no se ha programado.
    expect(longestSilence(context.tones, 1, 28)).toBeLessThan(2.6)
    audio.dispose()
  })

  it('cambiar de zona cambia de tema sin dejar de sonar', async () => {
    vi.useFakeTimers()
    const { audio, context } = build()
    await audio.unlock()
    audio.setMusicScene('hall')
    run(context, 12_000)
    const corte = context.currentTime
    audio.setMusicScene('subsuelo')
    run(context, 14_000)
    expect(audio.diagnostics.musicTheme).toBe('subsuelo-respiracion-de-piedra')
    expect(longestSilence(context.tones, corte, context.currentTime - 1)).toBeLessThan(2.6)
    audio.dispose()
  })

  it('la investigacion sube la tension sin cambiar de tema ni cortar la musica', async () => {
    vi.useFakeTimers()
    const { audio, context } = build()
    await audio.unlock()
    audio.setMusicScene('terraza')
    run(context, 8_000)
    expect(audio.diagnostics.intensity).toBe('calm')
    const corte = context.currentTime
    audio.focusIntensity(12_000)
    run(context, 10_000)
    expect(audio.diagnostics).toMatchObject({
      intensity: 'tense',
      musicTheme: 'terraza-calor-de-las-once',
      intensityHoldPending: true,
    })
    expect(longestSilence(context.tones, corte, context.currentTime - 1)).toBeLessThan(2.6)
    // Pasado el sostenimiento vuelve la variante tranquila, con el mismo tema.
    run(context, 6_000)
    expect(audio.diagnostics).toMatchObject({ intensity: 'calm', musicTheme: 'terraza-calor-de-las-once' })
    audio.dispose()
  })

  it('la intro no admite la variante tensa y el silencio la corta', async () => {
    vi.useFakeTimers()
    const { audio, context } = build()
    await audio.unlock()
    audio.setMusicScene('intro')
    audio.focusIntensity()
    run(context, 4_000)
    expect(audio.diagnostics).toMatchObject({
      scene: 'intro',
      intensity: 'calm',
      intensityHoldPending: false,
    })
    audio.setMusicScene('silent')
    run(context, 1_000)
    expect(audio.diagnostics).toMatchObject({ scene: 'silent', musicGain: 0, schedulerPending: false })
    audio.dispose()
  })

  /** Regresion: la ganancia se quedaba a cero para el resto de la partida. */
  it('recupera el volumen aunque la zona cambie con la pestana oculta', async () => {
    vi.useFakeTimers()
    const { audio, context } = build()
    await audio.unlock()
    audio.setMusicScene('hall')
    run(context, 3_000)
    audio.setMusicScene('silent')
    run(context, 1_000)
    expect(audio.diagnostics.musicGain).toBe(0)

    audio.setPageHidden(true)
    audio.setMusicScene('templo')
    run(context, 1_000)
    expect(audio.diagnostics.musicGain).toBe(0)

    audio.setPageHidden(false)
    run(context, 4_000)
    expect(audio.diagnostics.musicGain).toBe(1)
    expect(audio.diagnostics.musicTheme).toBe('templo-disco-solar')
    audio.dispose()
  })

  it('vuelve a sonar despues de silenciar y de bajar la musica a cero', async () => {
    vi.useFakeTimers()
    const { audio, context } = build()
    await audio.unlock()
    audio.setMusicScene('hall')
    run(context, 3_000)

    audio.setMuted(true)
    run(context, 1_000)
    expect(audio.diagnostics).toMatchObject({ musicGain: 0, schedulerPending: false })
    audio.setMuted(false)
    run(context, 3_000)
    expect(audio.diagnostics).toMatchObject({ musicGain: 1, schedulerPending: true })

    audio.setVolume('music', 0)
    run(context, 1_000)
    expect(audio.diagnostics.schedulerPending).toBe(false)
    audio.setVolume('music', 0.5)
    run(context, 3_000)
    expect(audio.diagnostics).toMatchObject({ musicGain: 1, schedulerPending: true })
    audio.dispose()
  })

  /** Regresion: las voces detenidas antes de empezar no se descontaban nunca. */
  it('no acumula voces fantasma aunque las fuentes no avisen de que terminan', async () => {
    vi.useFakeTimers()
    const { audio, context } = build()
    await audio.unlock()
    audio.setMusicScene('hall')
    run(context, 20_000)
    const enMarcha = audio.diagnostics.activeMusicVoices
    expect(enMarcha).toBeGreaterThan(0)
    expect(enMarcha).toBeLessThanOrEqual(24)

    audio.setMusicScene('silent')
    run(context, 1_000)
    expect(audio.diagnostics.activeMusicVoices).toBe(0)

    audio.setMusicScene('tiendas')
    run(context, 20_000)
    expect(audio.diagnostics.activeMusicVoices).toBeLessThanOrEqual(24)
    audio.dispose()
    expect(audio.diagnostics.activeMusicVoices).toBe(0)
  })

  it('no depende de archivos, elementos multimedia ni descargas', () => {
    for (const source of [audioSource, musicSource]) {
      expect(source).not.toMatch(/new Audio\b|createMediaElementSource|decodeAudioData|\/(?:audio)\//)
      expect(source).not.toMatch(/\.(?:mp3|ogg|wav|mid|midi)\b/i)
    }
  })
})
