/**
 * Comprobacion de la musica en partida con el cliente Playwright.
 *
 * El diagnostico de `render_game_to_text()` dice que se programa; esto ademas
 * mide lo que sale. Antes de cargar el juego se envuelve `AudioNode.connect`
 * para colar un analizador delante del destino: a partir de ahi se puede leer
 * el nivel eficaz real de la mezcla sin tocar el codigo del juego.
 *
 * Recorre las zonas que la demo guiada deja alcanzar —hall y terraza—; que
 * tiendas, habitaciones, sotanos y templo suenan y a que se parecen lo
 * comprueba la suite en `test/music.test.ts`, sin navegador.
 *
 * Comprueba cinco cosas, las cuatro primeras rotas hasta ahora:
 *   1. en el hall hay musica sonando la mayor parte del tiempo;
 *   2. una accion de investigacion sube la tension sin cambiar de tema;
 *   3. cambiar de zona cambia de tema sin dejar un silencio largo;
 *   4. silenciar y volver devuelve la musica, no la deja a ganancia cero;
 *   5. la portada y la intro siguen sonando como antes.
 *
 * Requiere el servidor de desarrollo en marcha:
 *   npm run dev
 *   node tools/audio_check.mjs [http://localhost:5173]
 */
import { chromium } from 'playwright'
import { existsSync } from 'node:fs'

const URL_BASE = process.argv[2] ?? 'http://localhost:5173'
const BINARIO = process.env['CHROMIUM_PATH'] ?? '/opt/pw-browsers/chromium'
/** Por debajo de esto no se puede llamar musica a lo que sale del bus. */
const UMBRAL_RMS = 0.0004

const navegador = await chromium.launch({
  ...(existsSync(BINARIO) ? { executablePath: BINARIO } : {}),
  args: ['--autoplay-policy=no-user-gesture-required'],
})
const pagina = await navegador.newPage({ viewport: { width: 1024, height: 700 } })

const errores = []
pagina.on('console', (msg) => { if (msg.type() === 'error') errores.push(msg.text()) })
pagina.on('pageerror', (error) => errores.push(String(error)))

await pagina.addInitScript(() => {
  const conectar = AudioNode.prototype.connect
  AudioNode.prototype.connect = function (destino, ...resto) {
    if (typeof AudioDestinationNode !== 'undefined' && destino instanceof AudioDestinationNode) {
      const contexto = destino.context
      if (!window.__sonda || window.__sondaContexto !== contexto) {
        const analizador = contexto.createAnalyser()
        analizador.fftSize = 2048
        conectar.call(analizador, destino)
        window.__sonda = analizador
        window.__sondaContexto = contexto
      }
      return conectar.call(this, window.__sonda, ...resto)
    }
    return conectar.call(this, destino, ...resto)
  }
  window.__nivel = () => {
    if (!window.__sonda) return null
    const datos = new Float32Array(window.__sonda.fftSize)
    window.__sonda.getFloatTimeDomainData(datos)
    let suma = 0
    for (const muestra of datos) suma += muestra * muestra
    return Math.sqrt(suma / datos.length)
  }
})

const estado = async () => JSON.parse(await pagina.evaluate(() => window.render_game_to_text()))
const nivel = async () => pagina.evaluate(() => window.__nivel())

/** Muestrea nivel y diagnostico durante `ms` y resume lo que se ha oido. */
async function escuchar(etiqueta, ms, paso = 400) {
  const muestras = []
  const temas = new Set()
  let silencioMaximo = 0
  let silencioActual = 0
  for (let transcurrido = 0; transcurrido < ms; transcurrido += paso) {
    await pagina.waitForTimeout(paso)
    const rms = await nivel()
    const { audio } = await estado()
    muestras.push(rms ?? 0)
    if (audio.musicTheme) temas.add(audio.musicTheme)
    if ((rms ?? 0) >= UMBRAL_RMS) silencioActual = 0
    else {
      silencioActual += paso
      silencioMaximo = Math.max(silencioMaximo, silencioActual)
    }
  }
  const conMusica = muestras.filter((valor) => valor >= UMBRAL_RMS).length / muestras.length
  const pico = Math.max(...muestras)
  const resumen = {
    etiqueta,
    presencia: `${Math.round(conMusica * 100)} %`,
    pico: pico.toFixed(4),
    silencioMaximo: `${(silencioMaximo / 1000).toFixed(1)} s`,
    temas: [...temas].join(' → ') || '(ninguno)',
  }
  console.log(
    `  ${etiqueta.padEnd(26)} presencia ${resumen.presencia.padStart(5)} · pico ${resumen.pico} · ` +
    `silencio max ${resumen.silencioMaximo.padStart(5)} · ${resumen.temas}`,
  )
  return { conMusica, pico, silencioMaximo, temas }
}

const fallos = []
const exigir = (condicion, mensaje) => { if (!condicion) fallos.push(mensaje) }

await pagina.goto(`${URL_BASE}?skipIntro=1`, { waitUntil: 'networkidle' })
await pagina.waitForSelector('#choices button')

const inicial = await estado()
console.log(`Antes del gesto: contexto ${inicial.audio.contextState}, escena ${inicial.audio.scene}`)

// Un clic en la lamina desbloquea el audio sin tomar ninguna decision.
await pagina.click('#art')
await pagina.waitForTimeout(600)
const desbloqueado = await estado()
exigir(desbloqueado.audio.unlocked, 'el gesto no desbloqueo el AudioContext')

console.log('\n1. Hall, sin tocar nada:')
const hall = await escuchar('hall en reposo', 24_000)
exigir(hall.conMusica > 0.7, `la musica solo suena el ${Math.round(hall.conMusica * 100)} % del tiempo en el hall`)
exigir(hall.silencioMaximo <= 3_000, `silencio de ${hall.silencioMaximo} ms en el hall`)
exigir(hall.pico >= UMBRAL_RMS * 3, `nivel demasiado bajo en el hall (${hall.pico})`)

console.log('\n2. Investigacion: misma zona, mas tension:')
const antes = (await estado()).audio

/**
 * Juega hasta dar con algo que investigue.
 *
 * Preguntar por un tema, inspeccionar o afrontar una tirada suben la tension;
 * moverse o esperar, no. Se pulsan opciones reales hasta que el diagnostico lo
 * confirma, como haria un jugador.
 */
async function subirTension(intentos = 6) {
  for (let intento = 0; intento < intentos; intento += 1) {
    const botones = pagina.locator('#choices button')
    const total = await botones.count()
    for (let indice = 0; indice < total; indice += 1) {
      const texto = (await botones.nth(indice).innerText()).trim()
      if (/Volver|Atrás|Esperar|Dejar correr/i.test(texto)) continue
      await botones.nth(indice).click()
      await pagina.waitForTimeout(700)
      if ((await estado()).audio.intensity === 'tense') return texto
      break
    }
  }
  return null
}

const disparador = await subirTension()
console.log(`  la tension sube tras: ${disparador ?? '(nada)'}`)
await pagina.waitForTimeout(600)
const tenso = await escuchar('tras investigar', 8_000)
const conTension = (await estado()).audio
exigir(conTension.intensity === 'tense', `la intensidad no subio (${conTension.intensity})`)
exigir(conTension.scene === antes.scene, `la zona cambio al investigar (${antes.scene} → ${conTension.scene})`)
exigir(tenso.conMusica > 0.7, 'la musica se apaga al investigar')

console.log('\n3. Cambio de zona:')
await pagina.click('#hud-map')
await pagina.waitForTimeout(400)
const terraza = pagina.locator('#panel-body button', { hasText: 'terraza' }).first()
if (await terraza.count()) await terraza.click()
else await pagina.click('#panel-close')
await pagina.waitForTimeout(500)
const zona = await escuchar('terraza', 12_000)
const enTerraza = (await estado()).audio
exigir(enTerraza.scene === 'terraza', `no se llego a la terraza (${enTerraza.scene})`)
exigir(zona.silencioMaximo <= 3_000, `silencio de ${zona.silencioMaximo} ms al cambiar de zona`)

console.log('\n4. Silenciar y volver:')
await pagina.click('#hud-audio')
await pagina.waitForTimeout(300)
await pagina.locator('#panel-body button', { hasText: 'Silenciar todo' }).first().click()
await pagina.waitForTimeout(900)
const callado = (await estado()).audio
exigir(callado.musicGain === 0, 'silenciar no bajo la ganancia de musica')
await pagina.locator('#panel-body button', { hasText: 'Activar sonido' }).first().click()
await pagina.waitForTimeout(1_200)
await pagina.click('#panel-close')
const vuelta = await escuchar('tras quitar el silencio', 8_000)
const recuperado = (await estado()).audio
exigir(recuperado.musicGain === 1, `la ganancia no volvio (${recuperado.musicGain})`)
exigir(vuelta.conMusica > 0.6, 'la musica no volvio despues del silencio')

console.log('\n5. Portada e intro, que ya sonaban antes:')
await pagina.goto(URL_BASE, { waitUntil: 'networkidle' })
await pagina.waitForSelector('#front-actions button')
await pagina.locator('#front-actions button', { hasText: 'Nueva partida' }).first().click()
await pagina.waitForTimeout(700)
const intro = await escuchar('intro', 10_000)
const enIntro = (await estado()).audio
exigir(enIntro.scene === 'intro', `la intro no puso su escena (${enIntro.scene})`)
exigir(/^intro-/.test(enIntro.musicTheme ?? ''), `la intro no toca su tema (${enIntro.musicTheme})`)
exigir(intro.conMusica > 0.8, 'la intro dejo de sonar')

const final = await estado()
console.log(`\nDiagnostico final: ${JSON.stringify(final.audio)}`)
console.log(errores.length > 0 ? `\n${errores.length} error(es) de consola:` : '\nSin errores de consola.')
for (const error of errores.slice(0, 10)) console.log('  ' + error)

await navegador.close()

if (fallos.length > 0) {
  console.log(`\n${fallos.length} comprobacion(es) fallidas:`)
  for (const fallo of fallos) console.log('  ✗ ' + fallo)
  process.exit(1)
}
console.log('\nTodas las comprobaciones de musica pasan.')
