import { describe, expect, it } from 'vitest'
import {
  INTRO_DURATION_MS,
  MUSIC_ZONES,
  ambienceZoneFor,
  composeSection,
  midi,
  musicZoneFor,
  themeName,
  type MusicIntensity,
  type MusicSection,
} from '../src/ui/music'
import locations from '../src/content/locations.json'

function seconds(section: MusicSection): number {
  return section.beats * (60 / section.bpm)
}

/**
 * Silencios de la seccion, en segundos.
 *
 * `interno` es el hueco mas largo mientras la seccion todavia tiene musica por
 * delante; `respiro` es lo que queda callado al final, que es el descanso
 * escrito antes de que empiece la seccion siguiente.
 */
function silences(section: MusicSection): { interno: number; respiro: number } {
  const secondsPerBeat = 60 / section.bpm
  const spans = section.events
    .map((event) => [event.atBeat * secondsPerBeat, (event.atBeat + event.beats) * secondsPerBeat] as const)
    .sort((left, right) => left[0] - right[0])
  let cursor = 0
  let interno = 0
  for (const [start, end] of spans) {
    if (start > cursor) interno = Math.max(interno, start - cursor)
    cursor = Math.max(cursor, end)
  }
  return { interno, respiro: Math.max(0, seconds(section) - cursor) }
}

const INTENSITIES: MusicIntensity[] = ['calm', 'tense']

describe('partitura', () => {
  it('toda localizacion del juego cae en una zona con tema', () => {
    for (const location of locations as { id: string; floor: string }[]) {
      const zone = musicZoneFor(location.id, location.floor)
      expect(MUSIC_ZONES).toContain(zone)
      expect(themeName(zone)).toMatch(/^[a-z-]+$/)
    }
  })

  it('reparte el hotel por plantas y deja las tiendas aparte', () => {
    expect(musicZoneFor('recepcion', 'baja')).toBe('hall')
    expect(musicZoneFor('terraza', 'terraza')).toBe('terraza')
    expect(musicZoneFor('tienda_joyas', 'baja')).toBe('tiendas')
    expect(musicZoneFor('hab_investigadores', '2')).toBe('habitaciones')
    expect(musicZoneFor('hab_gasparini', 'baja')).toBe('habitaciones')
    expect(musicZoneFor('almacen_sotano', 'sotano')).toBe('subsuelo')
    expect(musicZoneFor('viejo_templo', 'templo')).toBe('templo')
  })

  it('la escena manda sobre la planta al bajar al subsuelo', () => {
    expect(musicZoneFor('cocina', 'baja', 'basement_threshold')).toBe('subsuelo')
    expect(musicZoneFor('cocina', 'baja', 'ears')).toBe('subsuelo')
    expect(musicZoneFor('sala_escombros', 'templo', 'solar_disk')).toBe('templo')
  })

  it('las habitaciones son zona privada y el subsuelo, subterranea', () => {
    expect(ambienceZoneFor('hall')).toBe('public')
    expect(ambienceZoneFor('habitaciones')).toBe('private')
    expect(ambienceZoneFor('subsuelo')).toBe('underground')
  })

  it('ningun tema deja huecos largos ni secciones interminables', () => {
    for (const zone of MUSIC_ZONES) {
      for (const intensity of INTENSITIES) {
        for (let index = 0; index < 4; index += 1) {
          const section = composeSection(zone, intensity, index)
          expect(section, `${zone}/${intensity}/${index}`).not.toBeNull()
          const music = section!
          expect(music.events.length, `${zone}/${intensity} notas`).toBeGreaterThanOrEqual(12)
          expect(seconds(music), `${zone}/${intensity} duracion`).toBeGreaterThan(8)
          expect(seconds(music), `${zone}/${intensity} duracion`).toBeLessThan(32)
          const hueco = silences(music)
          expect(hueco.interno, `${zone}/${intensity} hueco interno`).toBeLessThan(1.5)
          expect(hueco.respiro, `${zone}/${intensity} respiro`).toBeGreaterThan(0.4)
          expect(hueco.respiro, `${zone}/${intensity} respiro`).toBeLessThan(2.5)
        }
      }
    }
  })

  it('cada tema tiene voces en registro audible y a nivel utilizable', () => {
    for (const zone of MUSIC_ZONES) {
      for (const intensity of INTENSITIES) {
        const section = composeSection(zone, intensity, 0)!
        const cantables = section.events.filter((event) => event.line !== 'breath' && event.frequency >= 250)
        expect(cantables.length, `${zone}/${intensity} registro`).toBeGreaterThanOrEqual(4)
        const pico = Math.max(...cantables.map((event) => event.level))
        expect(pico, `${zone}/${intensity} nivel`).toBeGreaterThanOrEqual(0.03)
      }
    }
  })

  it('el pico simultaneo se queda por debajo del limite del bus', () => {
    for (const zone of MUSIC_ZONES) {
      for (const intensity of INTENSITIES) {
        const section = composeSection(zone, intensity, 0)!
        const secondsPerBeat = 60 / section.bpm
        // Suma de niveles de todo lo que suena a la vez en cada ataque.
        let peak = 0
        for (const reference of section.events) {
          const at = reference.atBeat
          const sum = section.events
            .filter((event) => event.atBeat <= at && event.atBeat + event.beats > at)
            .reduce((total, event) => total + event.level, 0)
          peak = Math.max(peak, sum)
        }
        expect(peak * secondsPerBeat, `${zone}/${intensity}`).toBeGreaterThan(0)
        expect(peak, `${zone}/${intensity} pico`).toBeLessThan(0.16)
      }
    }
  })

  it('la seccion no programa nada fuera de su propia duracion', () => {
    for (const zone of MUSIC_ZONES) {
      const section = composeSection(zone, 'calm', 1)!
      for (const event of section.events) {
        expect(event.atBeat).toBeGreaterThanOrEqual(0)
        expect(event.atBeat).toBeLessThan(section.beats)
        expect(event.beats).toBeGreaterThan(0)
      }
    }
  })

  it('las melodias y la armonia se alternan al repetir seccion', () => {
    const primera = composeSection('hall', 'calm', 0)!
    const segunda = composeSection('hall', 'calm', 1)!
    const tercera = composeSection('hall', 'calm', 2)!
    const firma = (section: MusicSection): string => section.events.map((event) => Math.round(event.frequency)).join(',')
    expect(firma(primera)).not.toBe(firma(segunda))
    expect(firma(primera)).toBe(firma(tercera))
  })

  it('la variante tensa se distingue de la tranquila sin cambiar de tema', () => {
    const calma = composeSection('hall', 'calm', 0)!
    const tensa = composeSection('hall', 'tense', 0)!
    expect(tensa.name).toBe(calma.name)
    expect(tensa.bpm).toBeGreaterThan(calma.bpm)
    expect(tensa.events.length).toBeGreaterThan(calma.events.length)
  })

  it('mantiene la intro compuesta contra sus cuatro laminas', () => {
    expect(INTRO_DURATION_MS).toBe(22_800)
    const duraciones = [0, 1, 2, 3].map((index) => {
      const section = composeSection('intro', 'calm', index)!
      return Math.round(seconds(section) * 1000)
    })
    expect(duraciones).toEqual([3_800, 6_000, 7_000, 6_000])
    expect(composeSection('intro', 'calm', 0)!.name).toBe('intro-titulo')
    expect(composeSection('intro', 'calm', 4)!.name).toBe('intro-titulo')
  })

  it('el silencio no compone nada', () => {
    expect(composeSection('silent', 'calm', 0)).toBeNull()
  })

  it('afina el la de referencia', () => {
    expect(midi(69)).toBeCloseTo(440, 6)
    expect(midi(57)).toBeCloseTo(220, 6)
  })
})
