import { describe, expect, it } from 'vitest'
import { loadContent } from '../src/content/index'
import { Game } from '../src/engine/game'
import { parseTime } from '../src/engine/clock'

const content = loadContent()

function atDisk(seed: string): Game {
  const game = new Game(content, seed)
  game.party.moveTogether('viejo_templo')
  game.advanceTime(parseTime('D1 12:30') - game.clock.now)
  expect(game.view().scene?.id).toBe('solar_disk')
  return game
}

function gameWithRoll(
  action: 'disk_authority' | 'disk_snatch',
  predicate: (game: Game) => boolean,
): Game {
  for (let index = 0; index < 1000; index += 1) {
    const game = atDisk(`${action}-${index}`)
    if (action === 'disk_authority') game.world.setFlag('autorizacion_behler')
    game.performAction(action)
    if (predicate(game)) return game
  }
  throw new Error('No se encontro una semilla apropiada')
}

describe('director de investigacion', () => {
  it('nunca ofrece mas de cinco acciones contextuales', () => {
    const game = new Game(content, 'acciones')
    for (let step = 0; step < 16; step += 1) {
      expect(game.view().actions.length).toBeLessThanOrEqual(5)
      game.wait()
    }
  })

  it('mantiene privado el trabajo de un compañero hasta la reunion', () => {
    const game = new Game(content, 'informe')
    game.assign('vance_terraza')
    game.advanceTime(parseTime('D1 12:10') - game.clock.now)

    expect(game.world.knows('carter_y_weder_juntos')).toBe(false)
    expect(game.view().companions.find((item) => item.id === 'vance')?.state).toBe('report_ready')
    expect(game.mapDestinations().map((item) => item.id)).not.toContain('viejo_templo')

    game.travelTo('terraza')
    const report = game.collectReport('vance')
    expect(report.lines.some((line) => line.text.includes('Weder'))).toBe(true)
    expect(game.world.knows('carter_y_weder_juntos')).toBe(true)
    expect(game.world.knows('ruta_servicio_al_sotano')).toBe(true)
    expect(game.mapDestinations().map((item) => item.id)).toContain('viejo_templo')
  })

  it('restaura reloj, posicion, agenda y encargos desde una instantanea', () => {
    const game = new Game(content, 'guardado')
    game.assign('nadia_registro')
    game.advanceTime(20)
    const snapshot = game.snapshot()
    const before = game.view()

    game.travelTo('terraza')
    game.advanceTime(90)
    game.restore(snapshot)

    const after = game.view()
    expect(after.time).toBe(before.time)
    expect(after.location.id).toBe(before.location.id)
    expect(after.companions).toEqual(before.companions)
    expect(game.scheduler.snapshot()).toEqual(snapshot.scheduler)
  })
})

describe('escena del Disco Solar', () => {
  it('marca la oportunidad como perdida si el jugador no estuvo alli', () => {
    const game = new Game(content, 'disco-perdido')
    game.advanceTime(parseTime('D1 13:00') - game.clock.now)
    expect(game.view().leads.find((lead) => lead.id === 'disco')?.status).toBe('missed')
    expect(game.world.holderOf('disco_solar')).toBe('weder')
  })

  it('observar conserva la resolucion canonica', () => {
    const game = atDisk('observar')
    game.performAction('disk_observe')
    expect(game.world.holderOf('disco_solar')).toBe('weder')
    expect(game.world.getFlag('disco_resuelto')).toBe(true)
  })

  it('la autoridad puede retrasar a Weder hasta las 15:00', () => {
    const game = gameWithRoll('disk_authority', (candidate) => candidate.view().pendingRoll?.roll.success === true)
    game.settlePendingRoll(false)
    expect(game.world.getFlag('weder_retrasado')).toBe(true)
    expect(game.world.holderOf('disco_solar')).toBe('nobody')
    expect(game.scheduler.scheduledAt('d1_weder_toma_disco')).toBe(parseTime('D1 15:00'))
  })

  it('arrebatar el disco cambia su custodia si la tirada tiene exito', () => {
    const game = gameWithRoll('disk_snatch', (candidate) => candidate.view().pendingRoll?.roll.success === true)
    game.settlePendingRoll(false)
    expect(game.world.holderOf('disco_solar')).toBe('player')
    expect(game.world.getFlag('disco_robado_por_investigadores')).toBe(true)
    expect(game.party.byId('harker').inventory).toContain('disco_solar')
  })

  it('un fallo aceptado deja a Weder hostil y causa daño', () => {
    const game = gameWithRoll('disk_snatch', (candidate) => candidate.view().pendingRoll?.roll.success === false)
    const hp = game.party.byId('harker').hp
    game.settlePendingRoll(false)
    expect(game.world.holderOf('disco_solar')).toBe('weder')
    expect(game.world.getFlag('weder_hostil')).toBe(true)
    expect(game.party.byId('harker').hp).toBeLessThan(hp)
  })

  it('permite convertir un fallo gastando Suerte', () => {
    const game = gameWithRoll(
      'disk_snatch',
      (candidate) => candidate.view().pendingRoll?.canSpendLuck === true,
    )
    const pending = game.view().pendingRoll!
    const luck = game.party.byId('harker').luck
    game.settlePendingRoll(true)
    expect(game.world.holderOf('disco_solar')).toBe('player')
    expect(game.party.byId('harker').luck).toBe(luck - pending.luckCost!)
  })
})
