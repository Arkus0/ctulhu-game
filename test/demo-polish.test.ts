import { describe, expect, it } from 'vitest'
import { loadContent } from '../src/content/index'
import { Game, type GameSnapshot } from '../src/engine/game'
import { parseTime } from '../src/engine/clock'
import { AudioManager, readAudioPreferences } from '../src/ui/audio'
import { readFileSync } from 'node:fs'
import fuenteDelJuego from '../src/engine/game.ts?raw'

// La hoja de estilos se lee del disco: Vite convierte un `?raw` de CSS en un
// modulo procesado y llega vacia.
const hojaDeEstilos = readFileSync(new URL('../src/ui/style.css', import.meta.url), 'utf8')

const content = loadContent()

function at(seed: string, location: string, time: string): Game {
  const game = new Game(content, seed)
  game.party.moveTogether(location)
  game.advanceTime(parseTime(time) - game.clock.now)
  return game
}

describe('escenas de la mañana', () => {
  it('ofrece una decisión interesante nada más arrancar', () => {
    const game = new Game(content, 'arrival')
    expect(game.view().scene?.id).toBe('arrival_checkin')
    expect(game.view().actions).toHaveLength(4)
    expect(game.view().actions.every((action) => action.consequence)).toBe(true)
  })

  it('encadena Behler y el conflicto de atención desde eventos reales', () => {
    const game = at('terrace-scenes', 'terraza', 'D1 11:00')
    expect(game.view().scene?.id).toBe('behler_encargo')
    game.performAction('behler_listen')
    expect(game.view().scene?.id).toBe('terrace_conflict')
  })

  it('usa interruptibleBy como lista efectiva de acciones', () => {
    const game = at('threshold-actions', 'cocina', 'D1 12:00')
    const event = content.events.find((candidate) => candidate.id === 'd1_weder_baja')!
    expect(game.view().scene?.id).toBe('basement_threshold')
    expect(game.view().actions.map((action) => action.id)).toEqual(event.interruptibleBy)
  })

  it('la alerta de Weder endurece la persecución pero no cierra otras rutas', () => {
    const game = new Game(content, 'alert-threshold')
    game.world.setFlag('weder_alertado')
    game.world.setFlag('autorizacion_behler')
    game.world.learnFact('ruta_servicio_al_sotano')
    game.party.moveTogether('cocina')
    game.advanceTime(parseTime('D1 12:00') - game.clock.now)
    const actions = game.view().actions
    expect(actions.find((action) => action.id === 'threshold_follow')?.difficulty).toBe('hard')
    expect(actions.find((action) => action.id === 'threshold_authority')?.disabled).not.toBe(true)
    expect(actions.find((action) => action.id === 'threshold_service')?.disabled).not.toBe(true)
  })

  it('las orejas solo cobran Cordura si la decisión lo exige', () => {
    const hurry = at('ears-hurry', 'sala_escombros', 'D1 12:15')
    const before = hurry.party.members.map((member) => member.san)
    hurry.performAction('ears_hurry')
    expect(hurry.party.members.map((member) => member.san)).toEqual(before)
    expect(hurry.world.knows('algo_vive_abajo')).toBe(false)

    const examine = at('ears-examine', 'sala_escombros', 'D1 12:15')
    examine.performAction('ears_examine')
    expect(examine.world.knows('algo_vive_abajo')).toBe(true)
    expect(examine.world.journal).toContain('las_orejas')
  })

  it('cierra la demo al resolver el disco sin exigir esperas vacías hasta las 13:00', () => {
    const game = at('clean-ending', 'viejo_templo', 'D1 12:30')
    game.performAction('disk_observe')
    expect(game.view().sliceFinished).toBe(true)
    expect(game.view().finished).toBe(true)
  })
})

describe('privacidad de Caso', () => {
  it('no filtra nombres ni secretos bloqueados a las nueve', () => {
    const game = new Game(content, 'private-case')
    const publicState = JSON.stringify({ leads: game.view().leads, objective: game.view().objective })
    expect(game.view().leads.map((lead) => lead.id)).toEqual(['behler'])
    for (const secret of ['Carter', 'Weder', 'sótano', 'Disco Solar', 'Viejo Templo']) {
      expect(publicState).not.toContain(secret)
    }
  })

  it('una pista legítima revela el caso correspondiente', () => {
    const game = new Game(content, 'case-discovery')
    game.world.learnFact('weder_y_carter_se_reunen')
    expect(game.view().leads.find((lead) => lead.id === 'conspiradores')?.status).toBe('completed')
  })

  it('lo no descubierto expira de forma anónima', () => {
    const game = new Game(content, 'anonymous-missed')
    game.advanceTime(parseTime('D1 13:00') - game.clock.now)
    const hidden = game.view().leads.filter((lead) => lead.anonymous)
    expect(hidden.length).toBeGreaterThanOrEqual(2)
    expect(new Set(hidden.map((lead) => lead.title))).toEqual(new Set(['Oportunidad perdida']))
    expect(JSON.stringify(hidden)).not.toMatch(/Carter|Weder|sótano|Disco Solar|Viejo Templo/)
  })
})

describe('encargos, conversaciones y espera', () => {
  it('todos los encargos declaran tirada, riesgo y dos informes', () => {
    for (const companion of new Game(content, 'assignment-contract').view().companions) {
      for (const assignment of companion.availableAssignments) {
        expect(assignment.skill).toBeTruthy()
        expect(assignment.risk).toBeTruthy()
        expect(assignment.partialReport).not.toBe(assignment.fullReport)
      }
    }
  })

  it('resuelve la calidad en privado y muestra el dado al recoger el informe', () => {
    const game = new Game(content, 'assignment-quality')
    game.assign('nadia_registro')
    game.advanceTime(45)
    expect(game.world.knows('registro_lounpeen_revisado')).toBe(false)
    game.travelTo('conserjeria')
    const report = game.collectReport('nadia')
    expect(report.lines.some((line) => line.kind === 'tirada')).toBe(true)
    expect(game.world.knows('registro_lounpeen_revisado')).toBe(true)
    expect(report.feedback.map((cue) => cue.kind)).toContain('report')
    expect(report.presentationArt).toBe('escena_informe_nadia')
  })

  it('los intercambios no consumen tiempo y solo se disparan una vez', () => {
    const game = new Game(content, 'party-lines')
    const first = game.assign('nadia_registro')
    expect(first.minutes).toBe(0)
    const lines = first.lines.filter((line) => line.kind === 'dialogo')
    expect(lines).toHaveLength(0)
    // La escena de llegada es la que añade la despedida, sin coste adicional al briefing.
    const sceneGame = new Game(content, 'party-lines-scene')
    const turn = sceneGame.performAction('arrival_nadia_registry')
    expect(turn.minutes).toBe(5)
    const despedida = turn.lines.filter((line) => line.kind === 'dialogo')
    expect(despedida.length).toBeGreaterThanOrEqual(2)
    expect(despedida.every((line) => /^(Edith|Nadia|Vance) —/.test(line.text))).toBe(true)
  })

  it('poner ideas en común es una pausa voluntaria de cinco minutos', () => {
    const game = new Game(content, 'voluntary-debrief')
    const turn = game.debrief()
    expect(turn.minutes).toBe(5)
    const puesta = turn.lines.filter((line) => line.kind === 'dialogo')
    expect(puesta.length).toBeGreaterThanOrEqual(2)
    expect(puesta.length).toBeLessThanOrEqual(4)
  })

  it('nunca deja dos esperas vacías consecutivas', () => {
    const game = new Game(content, 'hotel-reacts')
    game.advanceTime(60)
    const turns = Array.from({ length: 8 }, () => game.wait())
    expect(turns.some((turn) => turn.lines.some((line) => line.kind === 'rastro'))).toBe(true)
    expect(turns.every((turn) => turn.minutes <= 15)).toBe(true)
  })

  it('ni siquiera la espera de Behler salta más de quince minutos', () => {
    const game = new Game(content, 'short-wait')
    game.performAction('arrival_telegram')
    game.travelTo('terraza')
    const wait = game.view().actions.find((action) => action.id === 'wait')
    expect(wait?.minutes).toBeLessThanOrEqual(15)
  })
})

describe('guardado y audio', () => {
  it('restaura guardados versión 1 inicializando el estado nuevo', () => {
    const game = new Game(content, 'legacy-save')
    game.performAction('arrival_telegram')
    const current = game.snapshot()
    const legacy = { ...current, version: 1, resolvedScenes: undefined, firedExchanges: undefined, emptyWaits: undefined } as GameSnapshot
    const restored = new Game(content, 'legacy-target')
    expect(() => restored.restore(legacy)).not.toThrow()
    expect(restored.view().time).toBe(game.view().time)
  })

  it('recupera volúmenes válidos y corrige valores fuera de rango', () => {
    const prefs = readAudioPreferences({ getItem: () => JSON.stringify({ muted: true, music: 3, ambience: -1, effects: 0.4 }) })
    expect(prefs).toEqual({ muted: true, music: 1, effects: 0.4 })
  })

  it('no intenta reproducir nada antes de desbloquearse con un gesto', () => {
    const memory = { getItem: () => null, setItem: () => undefined }
    const audio = new AudioManager(memory)
    expect(audio.unlocked).toBe(false)
    expect(() => audio.playCue('success')).not.toThrow()
    expect(audio.unlocked).toBe(false)
  })

  it('guarda el silencio y los volúmenes como preferencia accesible', () => {
    let saved = ''
    const memory = { getItem: () => saved || null, setItem: (_key: string, value: string) => { saved = value } }
    const audio = new AudioManager(memory)
    audio.setMuted(true)
    audio.setVolume('effects', 0.35)
    expect(readAudioPreferences(memory)).toMatchObject({ muted: true, effects: 0.35 })
  })

  it('expone el resultado de una tirada sin obligar a interpretar la narración', () => {
    const game = new Game(content, 'structured-roll-feedback')
    const turn = game.performAction('arrival_question_clinton')
    expect(turn.feedback).toContainEqual({
      kind: 'roll',
      id: 'arrival_question_clinton',
      outcome: game.view().pendingRoll?.roll.success ? 'success' : 'failure',
    })
  })

  it('explica sin ambigüedad que 67 contra 55 es una prueba fallida', () => {
    let match: { game: Game; turn: ReturnType<Game['performAction']> } | null = null
    for (let index = 0; index < 1000; index += 1) {
      const game = new Game(content, `roll-under-${index}`)
      const turn = game.performAction('arrival_question_clinton')
      if (game.view().pendingRoll?.roll.value === 67) {
        match = { game, turn }
        break
      }
    }

    expect(match).not.toBeNull()
    const roll = match!.game.view().pendingRoll!.roll
    const line = match!.turn.lines.find((candidate) => candidate.kind === 'tirada')
    expect(roll.target).toBe(55)
    expect(roll.success).toBe(false)
    expect(line?.text).toContain('Tirada 67; necesitabas 55 o menos')
    expect(line?.text).toContain('prueba fallida')
  })
})

describe('contratos de contenido', () => {
  it('el objetivo cabe en su barra y la descripción vive aparte', () => {
    for (const scene of content.scenes.values()) {
      // La barra OBJETIVO es un rotulo de una linea encima de la lamina: si
      // crece, le come alto de pantalla al arte. La prosa va en `body`.
      expect(scene.objective.length).toBeLessThanOrEqual(90)
      expect(scene.objective).not.toBe(scene.body)
      expect(scene.body.length).toBeGreaterThan(scene.objective.length)
    }
  })

  it('la barra enseña el objetivo corto, no la descripción', () => {
    const game = new Game(content, 'objetivo-corto')
    const view = game.view()
    expect(view.scene?.id).toBe('arrival_checkin')
    expect(view.objective).toBe(view.scene!.objective)
    expect(view.objective).not.toBe(view.scene!.body)
  })

  it('cada escena tiene entre dos y cuatro consecuencias persistentes', () => {
    expect(content.scenes.size).toBe(7)
    for (const scene of content.scenes.values()) {
      expect(scene.actions.length).toBeGreaterThanOrEqual(2)
      expect(scene.actions.length).toBeLessThanOrEqual(4)
      expect(scene.actions.every((action) => action.consequence.length > 10)).toBe(true)
    }
  })

  it('los intercambios son replicas cortas, a varias voces y sin frases repetidas', () => {
    expect(content.partyExchanges.length).toBeGreaterThanOrEqual(17)
    const seen = new Set<string>()
    for (const exchange of content.partyExchanges) {
      // Dos lineas es una replica; cinco ya es una tertulia que frena la partida.
      expect(exchange.lines.length).toBeGreaterThanOrEqual(2)
      expect(exchange.lines.length).toBeLessThanOrEqual(4)
      expect(new Set(exchange.lines.map((line) => line.speaker)).size).toBeGreaterThanOrEqual(2)
      for (const line of exchange.lines) {
        // Una frase reciclada delata que el intercambio se escribio con plantilla.
        expect(seen.has(line.text)).toBe(false)
        seen.add(line.text)
      }
    }
  })

  it('cada disparador de intercambio tiene alguna version escrita', () => {
    const triggers = new Set(content.partyExchanges.map((exchange) => exchange.trigger))
    for (const trigger of [
      'separation:nadia',
      'separation:vance',
      'weder:suspicion',
      'weder:alerted',
      'descend:follow',
      'descend:authority',
      'ears:examine',
      'ears:protect',
      'roll:failed',
      'luck:spent',
      'ending:observe',
      'ending:delay',
      'ending:custody',
      'debrief:generic',
      'lounpeen:escuchada',
      'lounpeen:esquivada',
    ]) {
      expect(triggers.has(trigger)).toBe(true)
    }
  })
})

describe('la hora de las diez ya no es una espera', () => {
  it('ningún tramo de treinta minutos entre las 09:00 y las 13:00 se queda sin suceso', () => {
    const inicio = parseTime('D1 09:00')
    const fin = parseTime('D1 13:00')
    const vacios: string[] = []
    for (let desde = inicio; desde < fin; desde += 30) {
      const hasta = desde + 30
      // Un tramo esta vivo si hay un suceso en curso, no solo si empieza uno:
      // las dos escenas de la terraza duran una hora entera.
      const hay = content.events.some((evento) => {
        const at = parseTime(evento.at)
        const until = evento.until ? parseTime(evento.until) : at
        return at < hasta && until > desde
      })
      if (!hay) vacios.push(`${Math.floor(desde / 60)}:${String(desde % 60).padStart(2, '0')}`)
    }
    expect(vacios).toEqual([])
  })

  it('la mañana abre tres frentes distintos entre las diez y las once', () => {
    const desde = parseTime('D1 10:00')
    const hasta = parseTime('D1 11:00')
    const enLaFranja = content.events.filter((evento) => {
      const at = parseTime(evento.at)
      return at >= desde && at < hasta
    })
    expect(enLaFranja.length).toBeGreaterThanOrEqual(3)
    // Tres sucesos en la misma sala serian un solo frente con tres parrafos.
    expect(new Set(enLaFranja.map((evento) => evento.location)).size).toBeGreaterThanOrEqual(2)
  })

  it('Olga señala el jardín de Isis, que antes no tenía forma de descubrirse', () => {
    const game = at('olga', 'recepcion', 'D1 10:40')
    expect(game.view().scene?.id).toBe('lounpeen_abordaje')
    expect(game.leads().some((lead) => lead.id === 'olga')).toBe(false)
    game.performAction('lounpeen_escuchar')
    expect(game.world.knows('gasparini_en_el_jardin_de_isis')).toBe(true)
    expect(game.leads().some((lead) => lead.id === 'olga')).toBe(true)
  })

  it('escuchar a Olga cuesta puntualidad y endurece la firma de Behler', () => {
    const tarde = at('tarde', 'recepcion', 'D1 10:40')
    tarde.performAction('lounpeen_escuchar')
    expect(tarde.world.getFlag('behler_impaciente')).toBe(true)
    tarde.party.moveTogether('terraza')
    tarde.advanceTime(parseTime('D1 11:30') - tarde.clock.now)
    const firma = tarde.view().scene?.actions.find((accion) => accion.id === 'behler_authority')
    expect(firma?.difficulty).toBe('hard')

    const puntual = at('puntual', 'recepcion', 'D1 10:40')
    puntual.performAction('lounpeen_excusarse')
    expect(puntual.world.getFlag('behler_impaciente')).toBe(false)
  })

  it('hablar con Olga delante de su padre cuesta a Dieter, y apartarla puede evitarlo', () => {
    const game = at('dieter', 'recepcion', 'D1 10:40')
    expect(game.world.npc('dieter').suspicious).toBe(false)
    game.performAction('lounpeen_escuchar')
    expect(game.world.getFlag('dieter_hostil')).toBe(true)
    expect(game.world.npc('dieter').suspicious).toBe(true)
  })

  it('el hotel no cuenta siempre lo mismo mientras el jugador espera', () => {
    const frases = (seed: string): string[] => {
      const game = at(seed, 'recepcion', 'D1 10:00')
      const salida: string[] = []
      for (let i = 0; i < 8; i += 1) {
        for (const linea of game.performAction('wait').lines) {
          if (linea.kind === 'rastro') salida.push(linea.text)
        }
      }
      return salida
    }
    const semillas = ['a', 'b', 'c', 'd', 'e', 'f'].map((seed) => frases(`ambiente-${seed}`))
    expect(semillas.every((partida) => partida.length > 0)).toBe(true)
    // Antes se elegia con el reloj: todas las partidas leian la misma frase en el
    // mismo minuto. Con azar propio, seis semillas no pueden dar un solo guion.
    expect(new Set(semillas.map((partida) => partida.join('|'))).size).toBeGreaterThan(1)
    // Y la sala tiene mas de una frase que contar.
    expect(new Set(semillas.flat()).size).toBeGreaterThan(1)
  })

  it('el azar de ambiente no mueve los dados de la partida', () => {
    const tirada = (esperas: number): number => {
      const game = at('dados', 'recepcion', 'D1 10:00')
      for (let i = 0; i < esperas; i += 1) game.performAction('wait')
      return game.rng.save()
    }
    // Dos partidas de la misma semilla que han esperado distinto siguen teniendo
    // el generador principal en el mismo sitio: el ambiente gasta el suyo.
    expect(tirada(0)).toBe(tirada(6))
  })
})

describe('el estado se ve sin abrir un panel', () => {
  it('las diez señales de feedback pintan algo', () => {
    // Los tipos se leen de la propia declaracion de `FeedbackCue`, para que
    // anadir una senal nueva sin regla de estilo rompa esta prueba.
    const bloque = /export interface FeedbackCue \{([\s\S]*?)\n\}/.exec(fuenteDelJuego)
    expect(bloque).not.toBeNull()
    const declaradas = /kind: ((?:'[a-z]+' \| )+'[a-z]+')/.exec(bloque![1]!)
    expect(declaradas).not.toBeNull()
    const tipos = [...declaradas![1]!.matchAll(/'([a-z]+)'/g)].map((m) => m[1]!)
    expect(tipos.length).toBe(10)
    // Cuatro de ellas se anadian como clase y se retiraban sin ninguna regla
    // detras: gastar Suerte o saltar el reloj no se distinguian de no hacer nada.
    const sinPintar = tipos.filter((tipo) => !hojaDeEstilos.includes(`.feedback-${tipo}`))
    expect(sinPintar).toEqual([])
  })

  it('Cordura y Salud tienen sitio propio en la barra superior', () => {
    expect(hojaDeEstilos).toContain('#hud-condition')
    expect(hojaDeEstilos).toContain('condition-shaken')
    expect(hojaDeEstilos).toContain('condition-hurt')
  })

  it('un informe listo se puede ver desde fuera del panel de Equipo', () => {
    const game = at('informe', 'recepcion', 'D1 09:00')
    game.performAction('arrival_vance_service')
    expect(game.view().companions.some((c) => c.state === 'working')).toBe(true)
    game.advanceTime(parseTime('D1 10:30') - game.clock.now)
    // La interfaz enciende el distintivo con este mismo estado.
    expect(game.view().companions.some((c) => c.state === 'report_ready')).toBe(true)
  })
})
