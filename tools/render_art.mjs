/**
 * Renderiza las composiciones originales de `art/src/*.svg` a PNG maestros.
 *
 * Primer paso del pipeline de arte original:
 *
 *   art/src/<id>.svg  --este script-->  art/master/<id>.png  --ega.py-->  public/art/<id>.png
 *
 * Se compone a 4x (1280x608 para un fondo, 288x384 para un retrato) y se reduce
 * despues. Dibujar directamente a 320x152 obliga a pensar en pixeles sueltos;
 * componer grande y reducir deja decidir primero las masas y la luz, que es lo
 * que de verdad hace legible una lamina EGA.
 *
 * Uso:
 *   node tools/render_art.mjs               # todos los SVG
 *   node tools/render_art.mjs terraza       # solo ese
 */
import { chromium } from 'playwright'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const FUENTES = join(RAIZ, 'art', 'src')
const MAESTROS = join(RAIZ, 'art', 'master')

/** Lee el tamaño declarado en el propio SVG; si no lo declara, asume un fondo. */
function tamano(svg) {
  const ancho = /<svg[^>]*\bwidth="(\d+)"/.exec(svg)
  const alto = /<svg[^>]*\bheight="(\d+)"/.exec(svg)
  return {
    width: ancho ? Number(ancho[1]) : 1280,
    height: alto ? Number(alto[1]) : 608,
  }
}

const solo = process.argv[2]
await mkdir(MAESTROS, { recursive: true })

const ficheros = (await readdir(FUENTES))
  .filter((f) => f.endsWith('.svg'))
  .filter((f) => !solo || f === `${solo}.svg`)

if (ficheros.length === 0) {
  console.error(solo ? `No existe art/src/${solo}.svg` : 'No hay SVG en art/src/')
  process.exit(1)
}

const navegador = await chromium.launch()
const contexto = await navegador.newContext({ deviceScaleFactor: 1 })
const pagina = await contexto.newPage()

for (const fichero of ficheros) {
  const svg = await readFile(join(FUENTES, fichero), 'utf8')
  const medidas = tamano(svg)

  await pagina.setViewportSize(medidas)
  // `background: #000` evita que un SVG con zonas vacías salga transparente:
  // la lámina final no debe tener canal alfa.
  await pagina.setContent(
    `<!doctype html><meta charset="utf-8">
     <style>html,body{margin:0;padding:0;background:#000;overflow:hidden}
            svg{display:block}</style>
     ${svg}`,
    { waitUntil: 'load' },
  )

  const destino = join(MAESTROS, fichero.replace(/\.svg$/, '.png'))
  const png = await pagina.screenshot({ type: 'png', omitBackground: false })
  await writeFile(destino, png)
  console.log(`  ${fichero} -> art/master/${fichero.replace(/\.svg$/, '.png')} (${medidas.width}x${medidas.height})`)
}

await navegador.close()
console.log(`\n${ficheros.length} maestro(s) renderizado(s)`)
