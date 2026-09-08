/**
 * Recorrido de control del arte con el cliente Playwright.
 *
 * Juega la demo de verdad —el reloj solo avanza con acciones— y captura los
 * momentos en los que hay que mirar una lamina: el hall, un dialogo con
 * retrato, la terraza, el descenso al subsuelo, la escena del Disco Solar y
 * una vista movil. Cada captura anota la localizacion y la hora reales, para
 * que no se cuele una imagen que no es la que se cree.
 *
 * No comprueba reglas: de eso se ocupan las pruebas. Aqui solo importa si la
 * lamina se ve, se entiende y deja leer los rotulos que van encima.
 *
 * Requiere el servidor de desarrollo en marcha:
 *   npm run dev
 *   node tools/qa_shots.mjs [http://localhost:5173]
 */
import { chromium } from 'playwright'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SALIDA = join(RAIZ, 'art', 'qa')
const URL_BASE = process.argv[2] ?? 'http://localhost:5173'

await mkdir(SALIDA, { recursive: true })

// El entorno remoto trae Chromium preinstalado en `/opt/pw-browsers` y puede no
// coincidir con la compilacion que espera la version de Playwright del proyecto.
// Si esta ahi, se usa ese binario en vez de intentar descargar otro.
const BINARIO = process.env['CHROMIUM_PATH'] ?? '/opt/pw-browsers/chromium'
const navegador = await chromium.launch(
  existsSync(BINARIO) ? { executablePath: BINARIO } : {},
)
const contexto = await navegador.newContext({ viewport: { width: 1024, height: 700 } })
const pagina = await contexto.newPage()

const errores = []
pagina.on('console', (msg) => {
  if (msg.type() === 'error') errores.push(msg.text())
})
pagina.on('pageerror', (error) => errores.push(String(error)))
pagina.on('requestfailed', (peticion) => errores.push(`falla ${peticion.url()}`))
pagina.on('response', (respuesta) => {
  if (respuesta.status() >= 400) errores.push(`${respuesta.status()} ${respuesta.url()}`)
})

const estado = async () => JSON.parse(await pagina.evaluate(() => window.render_game_to_text()))

/** Pulsa el primer boton cuyo texto contenga `texto`. Devuelve si existia. */
async function pulsar(texto, { obligatorio = false } = {}) {
  const boton = pagina.locator('#choices button', { hasText: texto }).first()
  if ((await boton.count()) === 0) {
    if (obligatorio) throw new Error(`No hay ningun boton "${texto}"`)
    return false
  }
  await boton.click()
  await pagina.waitForTimeout(320)
  return true
}

/**
 * Empuja el reloj un paso.
 *
 * Durante una escena no se ofrece «esperar»: la unica forma de avanzar es
 * tomar una de sus decisiones. Por eso, si no hay boton de espera, se pulsa la
 * primera accion que cueste tiempo y no sea volver atras.
 */
async function avanzar() {
  if (await pulsar('Esperar la cita')) return true
  if (await pulsar('Dejar correr el reloj')) return true
  if (await pulsar('Esperar')) return true

  const botones = pagina.locator('#choices button')
  const total = await botones.count()
  for (let i = 0; i < total; i += 1) {
    const texto = (await botones.nth(i).innerText()).trim()
    if (/^\d+\.\s*(Volver|Atrás|Cerrar|Hablar)/i.test(texto)) continue
    await botones.nth(i).click()
    await pagina.waitForTimeout(320)
    return true
  }
  return false
}

/** Avanza hasta que se cumpla el predicado o se agoten los intentos. */
async function esperarHasta(predicado, intentos = 30) {
  for (let paso = 0; paso < intentos; paso += 1) {
    if (predicado(await estado())) return true
    if (!(await avanzar())) return false
  }
  return predicado(await estado())
}

/** Resuelve una tirada pendiente, que si no bloquea el resto de la escena. */
async function resolverTirada() {
  const s = await estado()
  if (!s.pendingRoll) return false
  await pulsar('Aceptar')
  return true
}

async function capturar(nombre) {
  await pagina.waitForTimeout(260)
  // `advanceTime` termina de golpe el efecto de maquina de escribir. Sin esto la
  // captura sale a medio teclear y parece un cuadro de texto vacio.
  await pagina.evaluate(() => window.advanceTime(0))
  await pagina.waitForTimeout(120)
  const s = await estado()
  await pagina.screenshot({ path: join(SALIDA, `${nombre}.png`) })
  console.log(`  ${nombre.padEnd(22)} ${s.time} · ${s.location}${s.scene ? ` · escena: ${s.scene}` : ''}`)
}

// `skipIntro=1` entra directo a la partida: la portada y la introduccion tienen
// su propio recorrido y aqui lo que se comprueba son las laminas del juego.
const separador = URL_BASE.includes('?') ? '&' : '?'
await pagina.goto(`${URL_BASE}${separador}skipIntro=1`, { waitUntil: 'networkidle' })
await pagina.waitForSelector('#choices button')

// 1. Hall con la escena de llegada abierta.
await capturar('01_hall')

// 2. Dialogo con Clinton: el panel de retrato.
await pulsar('telegrama', { obligatorio: true })
await pulsar('Hablar con alguien', { obligatorio: true })
await pulsar('Cleveland Clinton', { obligatorio: true })
await capturar('02_dialogo_retrato')
await pulsar('Volver')
await pulsar('Volver')

// 3. Terraza, y de paso la cita con Behler a las once.
await pagina.click('#hud-map')
await pagina.waitForTimeout(300)
await capturar('03a_mapa_plantas')
const terraza = pagina.locator('#panel-body button', { hasText: 'terraza' }).first()
if (await terraza.count()) await terraza.click()
else await pagina.click('#panel-close')
await pagina.waitForTimeout(400)
await capturar('03_terraza')

// 4. Behler y la mesa del fondo: hay que pasar por aqui para que el dia avance.
await esperarHasta((s) => s.scene != null || s.time.includes('11:'))
await capturar('04_terraza_11h')
await pulsar('autoridad por escrito')
await resolverTirada()
await pulsar('mesa del fondo')
await resolverTirada()
await pulsar('Quedarse con Behler')

// 5. Cocina y descenso: Weder baja a las doce.
await esperarHasta((s) => s.time.includes('12:'), 40)
await pagina.click('#hud-map')
await pagina.waitForTimeout(300)
const cocina = pagina.locator('#panel-body button', { hasText: 'cocina' }).first()
if (await cocina.count()) await cocina.click()
else await pagina.click('#panel-close')
await pagina.waitForTimeout(400)
await capturar('05_cocina')

await pulsar('Seguirlos')
await resolverTirada()
await pulsar('firma de Behler')
await pulsar('ruta de servicio')
await capturar('06_subsuelo')

// 6. Las orejas y el Disco Solar.
await esperarHasta((s) => s.scene === 'Las orejas' || s.scene === 'El Disco Solar', 12)
await capturar('07_orejas')
await pagina.click('#hud-map')
await pagina.waitForTimeout(300)
await capturar('07a_mapa_sotanos')
await pagina.click('#panel-close')
await pulsar('Apartar la vista')
await pulsar('Mirar hasta entender')
await esperarHasta((s) => s.scene === 'El Disco Solar', 12)
await capturar('08_disco_solar')

// 7. Vista movil del estado al que se haya llegado.
await pagina.setViewportSize({ width: 390, height: 780 })
await pagina.waitForTimeout(400)
await capturar('09_movil')

const final = await estado()
console.log(`\nEstado final: ${final.time} · ${final.location}`)
console.log(errores.length > 0 ? `\n${errores.length} error(es) de consola:` : '\nSin errores de consola.')
for (const error of errores.slice(0, 10)) console.log('  ' + error)

await navegador.close()
