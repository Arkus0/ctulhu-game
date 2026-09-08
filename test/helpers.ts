import { createInvestigator, type InvestigatorDef } from '../src/engine/party'
import type { Investigator } from '../src/engine/types'

export const TEST_CHARS = {
  FUE: 55,
  CON: 60,
  TAM: 60,
  DES: 65,
  INT: 70,
  APA: 55,
  POD: 60,
  EDU: 70,
}

export function makeDef(over: Partial<InvestigatorDef> = {}): InvestigatorDef {
  return {
    id: over.id ?? 'test',
    name: over.name ?? 'Investigador de pruebas',
    occupation: over.occupation ?? 'anticuario',
    blurb: over.blurb ?? '',
    chars: { ...TEST_CHARS, ...(over.chars ?? {}) },
    skills: {
      Escuchar: 50,
      Sigilo: 40,
      Descubrir: 55,
      Persuasion: 45,
      Charlateria: 30,
      Credito: 50,
      ...(over.skills ?? {}),
    },
    ...(over.san !== undefined ? { san: over.san } : {}),
    ...(over.luck !== undefined ? { luck: over.luck } : {}),
    ...(over.inventory ? { inventory: over.inventory } : {}),
  }
}

export function makeInvestigator(
  over: Partial<InvestigatorDef> = {},
  location = 'terraza',
): Investigator {
  return createInvestigator(makeDef(over), location)
}
