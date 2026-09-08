/**
 * La partitura de El Disco Egipcio.
 *
 * Este modulo no toca Web Audio: solo describe musica. Dado un tema, una
 * intensidad y el numero de seccion devuelve una lista de eventos con tiempo,
 * frecuencia, nivel y timbre. `src/ui/audio.ts` es quien convierte esos eventos
 * en osciladores.
 *
 * La separacion permite probar el repertorio sin navegador: densidad, registro,
 * nivel y continuidad son propiedades de los datos, no del grafo de audio.
 *
 * Todo el material es original y esta compuesto para el prototipo. El modelo
 * declarado es la aventura grafica de finales de los ochenta —melodia cantable,
 * bajo arpegiado y contracanto sostenido, con timbres FM de dos operadores—,
 * pero no reproduce ninguna obra ajena.
 */

export type MusicZone = 'hall' | 'terraza' | 'tiendas' | 'habitaciones' | 'subsuelo' | 'templo'
export type MusicScene = 'silent' | 'intro' | MusicZone
export type MusicIntensity = 'calm' | 'tense'
export type MusicLine = 'lead' | 'counter' | 'bass' | 'breath'
export type AmbienceZone = 'public' | 'private' | 'underground'

export interface MusicEvent {
  line: MusicLine
  /** Comienzo dentro de la seccion, en pulsos. */
  atBeat: number
  /** Duracion en pulsos. */
  beats: number
  frequency: number
  level: number
  ratio: number
  index: number
  attack: number
  detune: number
  type: OscillatorType
  endFrequency?: number
  /** Solo para `breath`: barrido del filtro de ruido, en hercios. */
  noise?: { from: number; to: number }
}

export interface MusicSection {
  scene: MusicScene
  intensity: MusicIntensity
  /** Nombre legible del tema, el que aparece en el diagnostico. */
  name: string
  bpm: number
  beatsPerBar: number
  /** Duracion total, respiro final incluido. */
  beats: number
  events: MusicEvent[]
}

const A4 = 69

export function midi(note: number): number {
  return 440 * 2 ** ((note - A4) / 12)
}

/** Voz, no instrumento: cada timbre es una pareja de operadores FM. */
interface Timbre {
  ratio: number
  index: number
  attack: number
  detune: number
  type: OscillatorType
}

const TIMBRES = {
  /** Campana templada: la melodia de los salones. */
  campana: { ratio: 2.01, index: 1.9, attack: 0.018, detune: 0, type: 'sine' },
  /** Caña estrecha y algo nasal para las tiendas. */
  cana: { ratio: 3.01, index: 1.45, attack: 0.012, detune: 0, type: 'sine' },
  /** Cuerda frotada: el contracanto que sostiene el acorde. */
  cuerda: { ratio: 2, index: 1.05, attack: 0.26, detune: 0, type: 'sine' },
  /** Pulsada y seca: el bajo arpegiado. */
  pulsada: { ratio: 1, index: 0.85, attack: 0.006, detune: 0, type: 'triangle' },
  /** Pedal desafinado del subsuelo. */
  pedal: { ratio: 1.997, index: 2.7, attack: 0.8, detune: -7, type: 'sine' },
  /** Metal lejano del templo. */
  metal: { ratio: 3.98, index: 2.2, attack: 0.12, detune: 4, type: 'sine' },
} as const satisfies Record<string, Timbre>

type TimbreName = keyof typeof TIMBRES

/**
 * Niveles por linea.
 *
 * Suman un pico de unos 0,1 antes del bus de musica: con el bus al 0,45 y el
 * maestro al 0,72 la musica se queda cerca de -30 dBFS, presente bajo la
 * lectura y por debajo de la señal de interfaz.
 */
const LEVELS: Record<MusicLine, number> = {
  lead: 0.042,
  counter: 0.024,
  bass: 0.032,
  breath: 0.012,
}

type ChordKind = 'min' | 'maj' | 'dom7' | 'sus4' | 'dim' | 'open5'

/** Grados de cada acorde, en semitonos sobre la fundamental. */
const CHORD_TONES: Record<ChordKind, [number, number, number, number]> = {
  min: [0, 3, 7, 12],
  maj: [0, 4, 7, 12],
  dom7: [0, 4, 7, 10],
  sus4: [0, 5, 7, 12],
  dim: [0, 3, 6, 9],
  open5: [0, 7, 12, 19],
}

/** Fundamental del acorde en la octava del bajo. */
interface Chord { root: number; kind: ChordKind }

/** `[nota, pulsos]`; `null` es silencio. */
type Note = [number | null, number]

/** `[grado del acorde, pulsos]`; `null` es silencio. */
type Step = [number | null, number]

interface ThemeData {
  name: string
  zone: MusicZone
  ambience: AmbienceZone
  bpm: { calm: number; tense: number }
  beatsPerBar: number
  /**
   * Pulsos de respiro al cerrar la seccion. La musica es continua, pero
   * respira: entre seccion y seccion quedan uno o dos segundos de aire.
   */
  tailBeats: number
  /** Un acorde por compas; su longitud fija el numero de compases. */
  harmony: { calm: Chord[][]; tense: Chord[][] }
  /** Melodias por intensidad; se recorren en orden y vuelven a empezar. */
  leads: { calm: Note[][]; tense: Note[][] }
  bass: { calm: Step[]; tense: Step[]; timbre: TimbreName; octave: number }
  counter: { calm: Step[]; tense: Step[]; timbre: TimbreName; octave: number }
  leadTimbre: TimbreName
  /** Respiraciones de ruido, si el tema las lleva. */
  breath?: { atBeat: number; beats: number; from: number; to: number }[]
  /** Ajuste fino de volumen del tema completo. */
  levelScale?: number
}

const m = (root: number): Chord => ({ root, kind: 'min' })
const M = (root: number): Chord => ({ root, kind: 'maj' })
const d7 = (root: number): Chord => ({ root, kind: 'dom7' })
const s4 = (root: number): Chord => ({ root, kind: 'sus4' })
const o5 = (root: number): Chord => ({ root, kind: 'open5' })

/** Bajo arpegiado en negras: fundamental, quinta, octava, quinta. */
const BAJO_NEGRAS: Step[] = [[0, 1], [2, 1], [3, 1], [2, 1]]
/** El mismo dibujo en corcheas para la variante tensa. */
const BAJO_CORCHEAS: Step[] = [
  [0, 0.5], [2, 0.5], [3, 0.5], [2, 0.5], [0, 0.5], [2, 0.5], [3, 0.5], [2, 0.5],
]
/** Contracanto sostenido: tercera y quinta durante todo el compas. */
const PAD_REDONDA: Step[] = [[1, 4]]
const PAD_MITADES: Step[] = [[1, 2], [2, 2]]

const THEMES: Record<MusicZone, ThemeData> = {
  /**
   * Cortesia rota. Re menor con la quinta abierta del hall y un Mi bemol que
   * nunca decide si el acorde esta en reposo.
   */
  hall: {
    name: 'hall-cortesia-rota',
    zone: 'hall',
    ambience: 'public',
    bpm: { calm: 66, tense: 74 },
    beatsPerBar: 4,
    tailBeats: 1.5,
    harmony: {
      calm: [
        [m(38), M(46), m(43), d7(45)],
        [m(38), m(43), M(39), d7(45)],
      ],
      tense: [
        [m(38), M(46), m(43), d7(45)],
        [m(38), m(43), M(39), d7(45)],
      ],
    },
    leads: {
      calm: [
        [
          [69, 1], [74, 1], [77, 1.5], [76, 0.5],
          [74, 1.5], [72, 0.5], [70, 2],
          [67, 1], [74, 1], [75, 1.5], [74, 0.5],
          [73, 1], [71, 1], [69, 2],
        ],
        [
          [null, 0.5], [81, 1], [79, 0.5], [77, 1], [74, 1],
          [75, 1.5], [74, 0.5], [70, 2],
          [75, 1], [79, 1], [82, 1.5], [81, 0.5],
          [81, 1], [76, 1], [73, 1], [74, 1],
        ],
      ],
      tense: [
        [
          [74, 0.5], [75, 0.5], [74, 0.5], [72, 0.5], [74, 1], [null, 1],
          [77, 0.5], [76, 0.5], [74, 0.5], [72, 0.5], [70, 2],
          [79, 0.5], [78, 0.5], [77, 0.5], [75, 0.5], [74, 1], [null, 1],
          [73, 1], [76, 1], [81, 2],
        ],
        [
          [86, 0.5], [84, 0.5], [81, 1], [77, 1], [74, 1],
          [82, 0.5], [81, 0.5], [79, 1], [75, 2],
          [75, 0.5], [76, 0.5], [75, 0.5], [74, 0.5], [70, 2],
          [73, 0.5], [74, 0.5], [76, 1], [81, 1], [80, 1],
        ],
      ],
    },
    bass: { calm: BAJO_NEGRAS, tense: BAJO_CORCHEAS, timbre: 'pulsada', octave: 0 },
    counter: { calm: PAD_REDONDA, tense: PAD_MITADES, timbre: 'cuerda', octave: 12 },
    leadTimbre: 'campana',
  },

  /**
   * Calor de las once. Sol dorico, vasos que se tocan y un desliz cromatico
   * cuando la conversacion de la mesa de al lado deja de ser inocente.
   */
  terraza: {
    name: 'terraza-calor-de-las-once',
    zone: 'terraza',
    ambience: 'public',
    bpm: { calm: 72, tense: 80 },
    beatsPerBar: 4,
    tailBeats: 1.5,
    harmony: {
      calm: [
        [m(43), M(48), m(43), M(41)],
        [M(39), M(41), m(43), d7(38)],
      ],
      tense: [
        [m(43), M(48), m(43), M(41)],
        [M(39), M(41), m(43), d7(38)],
      ],
    },
    leads: {
      calm: [
        [
          [74, 1], [77, 1], [79, 2],
          [81, 1.5], [79, 0.5], [76, 2],
          [74, 1], [79, 1], [77, 1], [74, 1],
          [72, 2], [74, 2],
        ],
        [
          [75, 1], [79, 1], [82, 2],
          [81, 1], [77, 1], [74, 2],
          [79, 0.5], [78, 0.5], [79, 1], [82, 2],
          [81, 1], [78, 1], [74, 2],
        ],
      ],
      tense: [
        [
          [74, 0.5], [75, 0.5], [77, 0.5], [79, 0.5], [82, 1], [81, 1],
          [79, 0.5], [77, 0.5], [76, 1], [79, 2],
          [74, 0.5], [77, 0.5], [79, 0.5], [81, 0.5], [84, 2],
          [82, 1], [79, 1], [78, 2],
        ],
        [
          [87, 0.5], [86, 0.5], [84, 1], [82, 1], [79, 1],
          [81, 0.5], [80, 0.5], [81, 1], [77, 2],
          [79, 1], [82, 0.5], [81, 0.5], [79, 1], [75, 1],
          [78, 0.5], [79, 0.5], [81, 1], [86, 2],
        ],
      ],
    },
    bass: { calm: BAJO_NEGRAS, tense: BAJO_CORCHEAS, timbre: 'pulsada', octave: 0 },
    counter: { calm: PAD_MITADES, tense: PAD_MITADES, timbre: 'cuerda', octave: 12 },
    leadTimbre: 'campana',
  },

  /**
   * Baratijas del vestibulo. La musiquilla que el propio hotel vende a sus
   * huespedes: la menor con sensible, staccato y demasiada sonrisa.
   */
  tiendas: {
    name: 'tiendas-baratijas-del-vestibulo',
    zone: 'tiendas',
    ambience: 'public',
    bpm: { calm: 84, tense: 92 },
    beatsPerBar: 4,
    tailBeats: 1.5,
    harmony: {
      calm: [
        [m(45), d7(40), m(45), m(38)],
        [M(41), d7(40), m(45), s4(45)],
      ],
      tense: [
        [m(45), d7(40), m(45), m(38)],
        [M(41), d7(40), m(45), s4(45)],
      ],
    },
    leads: {
      calm: [
        [
          [81, 0.5], [84, 0.5], [83, 0.5], [81, 0.5], [79, 1], [77, 1],
          [80, 0.5], [83, 0.5], [80, 0.5], [76, 0.5], [76, 2],
          [81, 0.5], [83, 0.5], [84, 0.5], [86, 0.5], [88, 1], [85, 1],
          [86, 0.5], [84, 0.5], [81, 1], [78, 2],
        ],
        [
          [77, 0.5], [81, 0.5], [84, 1], [81, 1], [77, 1],
          [80, 0.5], [76, 0.5], [80, 1], [83, 2],
          [84, 0.5], [83, 0.5], [81, 0.5], [80, 0.5], [81, 1], [76, 1],
          [79, 1], [78, 1], [81, 2],
        ],
      ],
      tense: [
        [
          [81, 0.25], [83, 0.25], [84, 0.5], [83, 0.5], [81, 0.5], [80, 1], [81, 1],
          [80, 0.5], [83, 0.5], [86, 0.5], [83, 0.5], [80, 2],
          [81, 0.25], [84, 0.25], [88, 0.5], [86, 0.5], [84, 0.5], [83, 1], [81, 1],
          [80, 0.5], [81, 0.5], [83, 1], [76, 2],
        ],
      ],
    },
    bass: { calm: BAJO_CORCHEAS, tense: BAJO_CORCHEAS, timbre: 'pulsada', octave: 0 },
    counter: { calm: PAD_MITADES, tense: PAD_MITADES, timbre: 'cana', octave: 12 },
    leadTimbre: 'cana',
    levelScale: 0.94,
  },

  /**
   * Puertas cerradas. Do sostenido menor a media luz: pasos de otro huesped al
   * fondo del pasillo y notas largas que no llegan a formar una frase entera.
   */
  habitaciones: {
    name: 'habitaciones-puertas-cerradas',
    zone: 'habitaciones',
    ambience: 'private',
    bpm: { calm: 58, tense: 64 },
    beatsPerBar: 4,
    tailBeats: 1.5,
    harmony: {
      calm: [
        [m(37), M(45), M(47), m(37)],
        [m(37), M(42), M(47), s4(44)],
      ],
      tense: [
        [m(37), M(45), M(47), m(37)],
        [m(37), M(42), M(47), s4(44)],
      ],
    },
    leads: {
      calm: [
        [
          [76, 2], [80, 2],
          [81, 3], [80, 1],
          [78, 2], [76, 2],
          [null, 1], [73, 3],
        ],
        [
          [68, 2], [73, 2],
          [76, 1.5], [75, 0.5], [73, 2],
          [78, 2], [80, 2],
          [76, 3], [null, 1],
        ],
      ],
      tense: [
        [
          [76, 1], [77, 1], [76, 1], [73, 1],
          [80, 1], [81, 1], [80, 2],
          [83, 0.5], [82, 0.5], [80, 1], [78, 2],
          [76, 1], [75, 1], [73, 2],
        ],
      ],
    },
    bass: { calm: [[0, 2], [2, 2]], tense: BAJO_NEGRAS, timbre: 'pulsada', octave: 0 },
    counter: { calm: PAD_REDONDA, tense: PAD_REDONDA, timbre: 'cuerda', octave: 12 },
    leadTimbre: 'campana',
    levelScale: 0.86,
  },

  /**
   * Respiracion de piedra. Sin cuadricula estable: dos pedales que no encajan,
   * una respiracion de ruido y un armonico agudo que si se oye en un altavoz
   * pequeño, para que el subsuelo no sea solo un temblor invisible.
   */
  subsuelo: {
    name: 'subsuelo-respiracion-de-piedra',
    zone: 'subsuelo',
    ambience: 'underground',
    bpm: { calm: 52, tense: 56 },
    beatsPerBar: 4,
    tailBeats: 1,
    harmony: {
      calm: [
        [o5(34), o5(37), o5(34), o5(33)],
        [o5(36), o5(34), o5(39), o5(34)],
      ],
      tense: [
        [o5(34), o5(37), o5(34), o5(33)],
        [o5(36), o5(34), o5(39), o5(34)],
      ],
    },
    leads: {
      calm: [
        [
          [null, 1], [82, 3],
          [null, 2], [81, 2],
          [83, 2], [82, 2],
          [null, 1], [79, 2], [null, 1],
        ],
        [
          [86, 2], [85, 2],
          [null, 2], [83, 2],
          [81, 3], [null, 1],
          [82, 2], [81, 2],
        ],
      ],
      tense: [
        [
          [82, 1], [83, 1], [82, 2],
          [85, 1], [86, 1], [85, 2],
          [88, 1], [87, 1], [85, 2],
          [83, 2], [82, 2],
        ],
      ],
    },
    bass: { calm: [[0, 4]], tense: [[0, 2], [1, 2]], timbre: 'pedal', octave: 0 },
    counter: { calm: [[1, 4]], tense: [[1, 4]], timbre: 'pedal', octave: 0 },
    leadTimbre: 'metal',
    breath: [
      { atBeat: 0.5, beats: 5, from: 520, to: 170 },
      { atBeat: 9, beats: 4, from: 430, to: 125 },
    ],
  },

  /**
   * El Disco Solar. Quintas abiertas muy lentas y una melodia de intervalos
   * grandes que nunca cierra la cadencia.
   */
  templo: {
    name: 'templo-disco-solar',
    zone: 'templo',
    ambience: 'underground',
    bpm: { calm: 48, tense: 52 },
    beatsPerBar: 4,
    tailBeats: 1,
    harmony: {
      calm: [
        [o5(36), o5(41), o5(38), o5(43)],
        [o5(36), o5(43), o5(39), o5(38)],
      ],
      tense: [
        [o5(36), o5(41), o5(38), o5(43)],
        [o5(36), o5(43), o5(39), o5(38)],
      ],
    },
    leads: {
      calm: [
        [
          [72, 2], [79, 2],
          [77, 3], [76, 1],
          [74, 2], [81, 2],
          [79, 3], [null, 1],
        ],
        [
          [84, 2], [77, 2],
          [79, 2], [72, 2],
          [75, 3], [74, 1],
          [76, 4],
        ],
      ],
      tense: [
        [
          [84, 1], [83, 1], [79, 2],
          [86, 1], [84, 1], [81, 2],
          [88, 2], [86, 2],
          [83, 2], [81, 2],
        ],
      ],
    },
    bass: { calm: [[0, 4]], tense: [[0, 2], [2, 2]], timbre: 'pedal', octave: 0 },
    counter: { calm: [[2, 4]], tense: [[2, 2], [1, 2]], timbre: 'metal', octave: 0 },
    leadTimbre: 'metal',
    breath: [{ atBeat: 2, beats: 6, from: 610, to: 190 }],
  },
}

/**
 * La intro no es un bucle: sus cuatro secciones acompañan a las cuatro laminas
 * y suman 22,8 de los 23 segundos de la presentacion. Se escriben aparte porque
 * su forma la manda la imagen, no la armonia.
 */
const INTRO_BPM = 58
const INTRO_SECTIONS_MS = [3_800, 6_000, 7_000, 6_000] as const
const INTRO_LEADS: { name: string; pad: number[]; padBeats: number; melody: Note[]; padLevel: number }[] = [
  {
    name: 'intro-titulo',
    pad: [45, 52, 57],
    padBeats: 3.24,
    padLevel: 0.026,
    melody: [[null, 0.6], [69, 1.02], [68, 1.02], [64, 0.92]],
  },
  {
    name: 'intro-hotel',
    pad: [50, 57, 63],
    padBeats: 4.74,
    padLevel: 0.025,
    melody: [[null, 0.65], [69, 1.55], [72, 1.55], [71, 1.06], [null, 0.14], [62, 0.87]],
  },
  {
    name: 'intro-investigadores',
    pad: [45, 52],
    padBeats: 5.95,
    padLevel: 0.024,
    melody: [[null, 0.75], [64, 1.95], [67, 1.95], [70, 1.16], [null, 0.84], [58, 0.87]],
  },
  {
    name: 'intro-telegrama',
    pad: [44, 51, 57],
    padBeats: 5.32,
    padLevel: 0.024,
    melody: [[null, 0.55], [69, 1.18], [68, 1.18], [64, 1.18], [63, 0.97]],
  },
]

function introSection(index: number): MusicSection {
  const section = index % INTRO_LEADS.length
  const plan = INTRO_LEADS[section]!
  const beats = (INTRO_SECTIONS_MS[section]! / 1000) * (INTRO_BPM / 60)
  const events: MusicEvent[] = []
  plan.pad.forEach((note, position) => {
    events.push({
      line: 'counter',
      atBeat: position * 0.12,
      beats: plan.padBeats,
      frequency: midi(note),
      level: plan.padLevel,
      ratio: position === 1 ? 2.01 : 1.997,
      index: 1.7,
      attack: 0.55,
      detune: position === 2 ? 4 : 0,
      type: 'sine',
    })
  })
  let cursor = 0
  for (const [note, length] of plan.melody) {
    if (note != null) {
      events.push({
        line: 'lead',
        atBeat: cursor,
        beats: length * 0.94,
        frequency: midi(note),
        level: 0.034,
        ratio: 2.01,
        index: 2.1,
        attack: 0.06,
        detune: 0,
        type: 'sine',
      })
    }
    cursor += length
  }
  return {
    scene: 'intro',
    intensity: 'calm',
    name: plan.name,
    bpm: INTRO_BPM,
    beatsPerBar: 4,
    beats,
    events,
  }
}

/** Duracion compuesta de la intro en milisegundos, para las pruebas. */
export const INTRO_DURATION_MS = INTRO_SECTIONS_MS.reduce((total, part) => total + part, 0)

/** Nombre legible del tema de una zona, sin componer nada. */
export function themeName(zone: MusicZone): string {
  return THEMES[zone].name
}

/** A que grupo de sonido ambiente pertenece una zona. */
export function ambienceZoneFor(zone: MusicZone): AmbienceZone {
  return THEMES[zone].ambience
}

/**
 * Zona musical de una localizacion.
 *
 * Manda la escena abierta —el descenso, las orejas y el Disco Solar suenan a
 * subsuelo aunque el jugador siga contando plantas—, despues la planta y por
 * ultimo el identificador, que es lo que distingue las tiendas del resto de la
 * planta baja.
 */
export function musicZoneFor(locationId: string, floor: string, sceneId: string | null = null): MusicZone {
  if (sceneId === 'solar_disk') return 'templo'
  if (sceneId === 'basement_threshold' || sceneId === 'ears') return 'subsuelo'
  if (floor === 'templo') return 'templo'
  if (floor === 'sotano') return 'subsuelo'
  if (floor === 'terraza') return 'terraza'
  if (/^\d+$/.test(floor)) return 'habitaciones'
  if (locationId.startsWith('tienda_')) return 'tiendas'
  if (locationId.startsWith('hab_') || locationId.startsWith('habs_') || locationId === 'pasillo_habitaciones') {
    return 'habitaciones'
  }
  return 'hall'
}

/** Compas a compas, la armonia que toca en cada pulso de la seccion. */
function chordAt(bars: Chord[], beat: number, beatsPerBar: number): Chord {
  return bars[Math.min(bars.length - 1, Math.floor(beat / beatsPerBar))]!
}

function chordNote(chord: Chord, degree: number, octave: number): number {
  const tones = CHORD_TONES[chord.kind]
  const wrapped = ((degree % tones.length) + tones.length) % tones.length
  return chord.root + tones[wrapped]! + octave
}

function pushPattern(
  events: MusicEvent[],
  line: MusicLine,
  pattern: Step[],
  bars: Chord[],
  beatsPerBar: number,
  timbre: Timbre,
  octave: number,
  level: number,
  legato: number,
): void {
  const total = bars.length * beatsPerBar
  let beat = 0
  while (beat < total - 1e-6) {
    for (const [degree, length] of pattern) {
      if (beat >= total - 1e-6) break
      const clipped = Math.min(length, total - beat)
      if (degree != null) {
        const chord = chordAt(bars, beat, beatsPerBar)
        events.push({
          line,
          atBeat: beat,
          beats: clipped * legato,
          frequency: midi(chordNote(chord, degree, octave)),
          level,
          ratio: timbre.ratio,
          index: timbre.index,
          attack: timbre.attack,
          detune: timbre.detune,
          type: timbre.type,
        })
      }
      beat += clipped
    }
  }
}

/**
 * La seccion numero `index` del tema.
 *
 * Es una funcion pura: el mismo tema, la misma intensidad y el mismo indice
 * devuelven siempre la misma musica. La variedad viene de recorrer las melodias
 * y las armonias escritas, no del azar.
 */
export function composeSection(
  scene: MusicScene,
  intensity: MusicIntensity,
  index: number,
): MusicSection | null {
  if (scene === 'silent') return null
  if (scene === 'intro') return introSection(index)

  const theme = THEMES[scene]
  const leads = theme.leads[intensity]
  const lead = leads[index % leads.length]!
  const harmonies = theme.harmony[intensity]
  const bars = harmonies[index % harmonies.length]!
  const beatsPerBar = theme.beatsPerBar
  const scale = theme.levelScale ?? 1
  const events: MusicEvent[] = []

  const leadTimbre = TIMBRES[theme.leadTimbre]
  let beat = 0
  for (const [note, length] of lead) {
    if (note != null) {
      events.push({
        line: 'lead',
        atBeat: beat,
        beats: length * 0.92,
        frequency: midi(note),
        level: LEVELS.lead * scale * (intensity === 'tense' ? 1.08 : 1),
        ratio: leadTimbre.ratio,
        index: leadTimbre.index,
        attack: leadTimbre.attack,
        detune: leadTimbre.detune,
        type: leadTimbre.type,
      })
    }
    beat += length
  }

  pushPattern(
    events,
    'bass',
    theme.bass[intensity],
    bars,
    beatsPerBar,
    TIMBRES[theme.bass.timbre],
    theme.bass.octave,
    LEVELS.bass * scale,
    0.86,
  )
  pushPattern(
    events,
    'counter',
    theme.counter[intensity],
    bars,
    beatsPerBar,
    TIMBRES[theme.counter.timbre],
    theme.counter.octave,
    LEVELS.counter * scale,
    0.94,
  )

  for (const breath of theme.breath ?? []) {
    events.push({
      line: 'breath',
      atBeat: breath.atBeat,
      beats: breath.beats,
      frequency: breath.from,
      level: LEVELS.breath * scale,
      ratio: 1,
      index: 0,
      attack: 0.3,
      detune: 0,
      type: 'sine',
      noise: { from: breath.from, to: breath.to },
    })
  }

  events.sort((left, right) => left.atBeat - right.atBeat)
  return {
    scene,
    intensity,
    name: theme.name,
    bpm: theme.bpm[intensity],
    beatsPerBar,
    beats: bars.length * beatsPerBar + theme.tailBeats,
    events,
  }
}

/** Los temas de zona, para recorrerlos en las pruebas. */
export const MUSIC_ZONES: readonly MusicZone[] = Object.keys(THEMES) as MusicZone[]
