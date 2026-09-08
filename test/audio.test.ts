import { afterEach, describe, expect, it, vi } from 'vitest'
import { AudioManager, readAudioPreferences } from '../src/ui/audio'
import audioSource from '../src/ui/audio.ts?raw'

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
  Q = new FakeParam()
  type = 'lowpass'
  connect(): FakeNode { return this }
  disconnect(): void {}
}

class FakeContext {
  state: AudioContextState = 'suspended'
  currentTime = 0
  sampleRate = 8_000
  destination = new FakeNode()
  resumeCalls = 0
  closeCalls = 0

  createGain(): FakeNode { return new FakeNode() }
  createBiquadFilter(): FakeNode { return new FakeNode() }
  createBuffer(_channels: number, length: number): { getChannelData: () => Float32Array } {
    const data = new Float32Array(length)
    return { getChannelData: () => data }
  }
  async resume(): Promise<void> { this.resumeCalls += 1; this.state = 'running' }
  async close(): Promise<void> { this.closeCalls += 1; this.state = 'closed' }
}

afterEach(() => vi.useRealTimers())

describe('audio sintetizado', () => {
  it('migra la preferencia v1 a los dos buses nuevos', () => {
    const storage = {
      getItem: (key: string) => key.endsWith('.v1')
        ? JSON.stringify({ muted: true, music: 0.31, ambience: 0.8, effects: 0.62 })
        : null,
    }
    expect(readAudioPreferences(storage)).toEqual({ muted: true, music: 0.31, effects: 0.62 })
  })

  it('crea y reanuda un único AudioContext ante desbloqueos simultáneos', async () => {
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
    expect(audio.diagnostics).toMatchObject({ unlocked: true, contextState: 'running', phraseTimerPending: true })
    audio.dispose()
    expect(audio.diagnostics.phraseTimerPending).toBe(false)
  })

  it('da prioridad al subsuelo y al silencio sobre el foco de investigación', () => {
    vi.useFakeTimers()
    const audio = new AudioManager({ getItem: () => null, setItem: () => undefined })
    audio.focusInvestigation()
    expect(audio.diagnostics.musicState).toBe('investigation')
    audio.setBaseMusicState('underground')
    expect(audio.diagnostics).toMatchObject({ musicState: 'underground', investigationTimerPending: false })
    audio.focusInvestigation()
    expect(audio.diagnostics.musicState).toBe('underground')
    audio.setBaseMusicState('silent')
    expect(audio.diagnostics.musicState).toBe('silent')
    audio.dispose()
  })

  it('mantiene la música de intro aislada del foco de investigación', () => {
    vi.useFakeTimers()
    const audio = new AudioManager({ getItem: () => null, setItem: () => undefined })
    audio.setBaseMusicState('intro')
    audio.focusInvestigation()
    expect(audio.diagnostics).toMatchObject({ musicState: 'intro', investigationTimerPending: false })
    audio.setBaseMusicState('hotel')
    expect(audio.diagnostics.musicState).toBe('hotel')
    audio.dispose()
  })

  it('no depende de archivos, elementos multimedia ni descargas', () => {
    expect(audioSource).not.toMatch(/new Audio\b|createMediaElementSource|decodeAudioData|\/(?:audio)\//)
    expect(audioSource).not.toMatch(/\.(?:mp3|ogg|wav|mid|midi)\b/i)
  })
})
