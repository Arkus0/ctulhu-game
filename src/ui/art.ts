/**
 * La lámina.
 *
 * Si existe `public/art/<nombre>.png` se pinta tal cual, sin interpolar. Si no
 * existe, se dibuja un fondo EGA tramado por código, derivado del nombre de la
 * localización y de la hora del día. No es un cuadrado rosa de "falta el
 * asset": es una imagen deliberada, para que el juego se pueda jugar entero
 * antes de que esté el arte definitivo y para que meterlo después sea solo
 * soltar ficheros en una carpeta.
 */

/** Paleta EGA de 16 tintas. */
export const EGA: readonly string[] = [
  '#000000', '#0000aa', '#00aa00', '#00aaaa',
  '#aa0000', '#aa00aa', '#aa5500', '#aaaaaa',
  '#555555', '#5555ff', '#55ff55', '#55ffff',
  '#ff5555', '#ff55ff', '#ffff55', '#ffffff',
]

export type TimeOfDay = 'madrugada' | 'manana' | 'tarde' | 'noche'

/** Combinaciones de tintas por momento del día. */
const PALETAS: Record<TimeOfDay, { cielo: [number, number]; suelo: [number, number]; masa: number; luz: number }> = {
  madrugada: { cielo: [0, 1], suelo: [0, 8], masa: 0, luz: 9 },
  manana: { cielo: [11, 3], suelo: [6, 7], masa: 8, luz: 14 },
  tarde: { cielo: [6, 12], suelo: [6, 8], masa: 8, luz: 14 },
  noche: { cielo: [1, 0], suelo: [8, 0], masa: 0, luz: 6 },
}

/** Matriz de Bayer 4x4 para el tramado ordenado. */
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
]

function hash(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export class ArtRenderer {
  private ctx: CanvasRenderingContext2D
  private cache = new Map<string, HTMLImageElement | null>()

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Sin contexto 2D: el navegador no puede dibujar')
    ctx.imageSmoothingEnabled = false
    this.ctx = ctx
  }

  /** Pinta la lámina de una localización. */
  async draw(name: string, when: TimeOfDay): Promise<void> {
    const img = await this.load(name)
    const { width: w, height: h } = this.canvas

    if (img) {
      this.ctx.imageSmoothingEnabled = false
      this.ctx.clearRect(0, 0, w, h)
      this.ctx.drawImage(img, 0, 0, w, h)
      return
    }
    this.procedural(name, when)
  }

  private async load(name: string): Promise<HTMLImageElement | null> {
    if (this.cache.has(name)) return this.cache.get(name)!
    const img = new Image()
    const done = new Promise<HTMLImageElement | null>((resolve) => {
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null)
    })
    img.src = `art/${name}.png`
    const result = await done
    this.cache.set(name, result)
    return result
  }

  /**
   * Fondo generado: cielo tramado, horizonte, siluetas verticales derivadas del
   * nombre y una fuente de luz. Da una imagen distinta y estable por sala.
   */
  private procedural(name: string, when: TimeOfDay): void {
    const { width: w, height: h } = this.canvas
    const p = PALETAS[when]
    const seed = hash(name)
    const ctx = this.ctx

    ctx.clearRect(0, 0, w, h)
    const horizonte = Math.floor(h * (0.52 + ((seed >>> 3) % 12) / 100))

    // Cielo con degradado tramado entre dos tintas EGA.
    for (let y = 0; y < horizonte; y++) {
      const t = y / horizonte
      for (let x = 0; x < w; x += 1) {
        const umbral = BAYER[y & 3]![x & 3]! / 16
        const idx = t > umbral ? p.cielo[1] : p.cielo[0]
        ctx.fillStyle = EGA[idx]!
        ctx.fillRect(x, y, 1, 1)
      }
    }

    // Suelo, con el tramado invertido para que se lea la línea del horizonte.
    for (let y = horizonte; y < h; y++) {
      const t = (y - horizonte) / (h - horizonte)
      for (let x = 0; x < w; x += 1) {
        const umbral = BAYER[y & 3]![x & 3]! / 16
        const idx = t > umbral ? p.suelo[0] : p.suelo[1]
        ctx.fillStyle = EGA[idx]!
        ctx.fillRect(x, y, 1, 1)
      }
    }

    // Siluetas verticales: columnas, palmeras, estanterías. Da igual lo que
    // sean; lo que importa es que cada sala tenga una silueta reconocible.
    const columnas = 3 + (seed % 5)
    ctx.fillStyle = EGA[p.masa]!
    for (let i = 0; i < columnas; i++) {
      const r = hash(`${name}:${i}`)
      const x = (r % w) | 0
      const ancho = 6 + (r >>> 5) % 22
      const alto = 18 + (r >>> 11) % Math.max(20, horizonte - 8)
      ctx.fillRect(x, horizonte - alto, ancho, alto + 4)
    }

    // Una fuente de luz: ventana, farol, el resplandor de las piezas.
    const lr = hash(`${name}:luz`)
    const lx = 12 + (lr % Math.max(1, w - 40))
    const ly = 10 + ((lr >>> 7) % Math.max(1, horizonte - 24))
    ctx.fillStyle = EGA[p.luz]!
    ctx.fillRect(lx, ly, 10, 12)
    ctx.fillStyle = EGA[p.masa]!
    ctx.fillRect(lx + 4, ly, 2, 12)
    ctx.fillRect(lx, ly + 5, 10, 2)

    // Marco de dos píxeles, como las pantallas de la época.
    ctx.strokeStyle = EGA[8]!
    ctx.lineWidth = 2
    ctx.strokeRect(1, 1, w - 2, h - 2)
  }
}
