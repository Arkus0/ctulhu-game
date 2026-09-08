import { Clock, GAME_START } from '../src/engine/clock'
import { Party } from '../src/engine/party'
import { Rng } from '../src/engine/rng'
import { Scheduler, type EventDef } from '../src/engine/scheduler'
import { WorldState } from '../src/engine/worldstate'
import type { NpcDef } from '../src/engine/types'
import { makeInvestigator } from './helpers'

export interface TestWorld {
  clock: Clock
  party: Party
  world: WorldState
  scheduler: Scheduler
  rng: Rng
}

export function buildWorld(
  opts: {
    seed?: string
    start?: number
    events?: EventDef[]
    npcs?: { def: NpcDef; location: string }[]
    startLocation?: string
    members?: number
  } = {},
): TestWorld {
  const rng = new Rng(opts.seed ?? 'test')
  const clock = new Clock(opts.start ?? GAME_START)
  const loc = opts.startLocation ?? 'terraza'
  const count = opts.members ?? 1
  const members = Array.from({ length: count }, (_, i) =>
    makeInvestigator({ id: `inv${i + 1}`, name: `Investigador ${i + 1}` }, loc),
  )
  const party = new Party(members)
  const world = new WorldState(clock, party, rng)
  const scheduler = new Scheduler(clock, world, party, rng)

  for (const n of opts.npcs ?? []) world.registerNpc(n.def, n.location)
  if (opts.events) scheduler.load(opts.events)

  return { clock, party, world, scheduler, rng }
}

export function npc(id: string, over: Partial<NpcDef> = {}): NpcDef {
  return {
    id,
    name: over.name ?? id,
    title: over.title ?? 'personaje de prueba',
    chars: over.chars ?? { INT: 60, POD: 50 },
    skills: over.skills ?? { Descubrir: 50, Escuchar: 50 },
    ...(over.disposition !== undefined ? { disposition: over.disposition } : {}),
    ...(over.knows ? { knows: over.knows } : {}),
    ...(over.hp !== undefined ? { hp: over.hp } : {}),
  }
}
