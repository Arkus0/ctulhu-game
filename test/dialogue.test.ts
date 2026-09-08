import { describe, expect, it } from 'vitest'
import { loadContent } from '../src/content/index'
import { APPROACHES, canonicalApproach } from '../src/engine/dialogue'
import { Game } from '../src/engine/game'

const content = loadContent()

describe('preguntar es un clic: la aproximación la elige el motor', () => {
  it('adula a Carter, que se abre con la adulación, en vez de ir de frente', () => {
    const game = new Game(content, 'carter-adula')
    const topic = content.topics.get('carter_excavacion')!
    expect(game.dialogue.chooseApproach(topic).id).toBe('adular')
  })

  it('a igualdad de números escoge la manera limpia', () => {
    // Rolland no tiene ni un gancho: ninguna aproximación aporta dados y deciden
    // la habilidad del hablante y el coste social. Untar cuesta; preguntar no.
    const game = new Game(content, 'rolland-limpio')
    const topic = content.topics.get('rolland_mesas')!
    expect(topic.approaches).toContain('sobornar')
    expect(game.dialogue.chooseApproach(topic).id).toBe('directo')
  })

  it('una aproximación explícita sigue mandando sobre la automática', () => {
    const game = new Game(content, 'explicita')
    game.world.setFlag('reunion_behler')
    const result = game.dialogue.ask('behler_desde_cuando', 'presionar')
    expect(result.approach?.id).toBe('presionar')
    expect(result.approachChosenByEngine).toBe(false)
  })

  it('cuenta quién ha hablado y cómo, que es lo que explica el dado', () => {
    const game = new Game(content, 'quien-pregunta')
    game.world.setFlag('reunion_behler')
    const turn = game.ask('behler_desde_cuando')
    const intro = turn.lines.find((line) => line.kind === 'narracion')
    expect(intro?.text).toMatch(/^(Edith|Nadia|Samuel) [a-zá-ú]/)
    expect(turn.lines.some((line) => line.kind === 'tirada')).toBe(true)
  })
})

describe('los ganchos de carácter del módulo están vivos', () => {
  it('ningún gancho de ninguna ficha se queda sin poder activarse', () => {
    const tagsByNpc = new Map<string, Set<string>>()
    for (const topic of content.topics.values()) {
      const tags = tagsByNpc.get(topic.npc) ?? new Set<string>()
      for (const tag of topic.tags ?? []) tags.add(tag)
      tagsByNpc.set(topic.npc, tags)
    }
    for (const npc of content.npcs.values()) {
      const tags = tagsByNpc.get(npc.id)
      if (!tags) continue
      for (const hook of npc.hooks ?? []) {
        const reachable = canonicalApproach(hook.approach) in APPROACHES || tags.has(hook.approach)
        expect(reachable, `${npc.id}/${hook.id} usa "${hook.approach}"`).toBe(true)
      }
    }
  })

  it('preguntar de egiptología a Carter suma dado se le pregunte como se le pregunte', () => {
    const game = new Game(content, 'carter-egiptologia')
    const topic = content.topics.get('carter_excavacion')!
    const directo = game.dialogue.hooksFor('carter', APPROACHES['directo']!, 'Persuasion', topic.tags ?? [])
    expect(directo.bonus).toBe(1)
    expect(directo.applied.map((hook) => hook.id)).toContain('egiptologia')
    // Sin la etiqueta del tema, ir de frente con Carter no activa nada.
    expect(game.dialogue.hooksFor('carter', APPROACHES['directo']!, 'Persuasion').bonus).toBe(0)
  })

  it('el sótano cierra a Mahadni con cualquier registro', () => {
    const game = new Game(content, 'mahadni-sotano')
    const topic = content.topics.get('mahadni_sotano')!
    for (const id of topic.approaches ?? []) {
      const hooks = game.dialogue.hooksFor('mahadni', APPROACHES[id]!, 'Persuasion', topic.tags ?? [])
      expect(hooks.penalty).toBe(2)
    }
  })
})

describe('la lista de temas no obliga a releerla', () => {
  it('deja al final lo que ya se ha preguntado', () => {
    const game = new Game(content, 'orden-temas')
    game.world.setFlag('reunion_behler')
    const before = game.topicsFor('behler')
    expect(before.length).toBeGreaterThan(2)
    const first = before[0]!
    game.ask(first.id)
    const after = game.topicsFor('behler')
    // O se ha consumido (once) o ha caído al final, pero nunca sigue el primero.
    expect(after[0]?.id).not.toBe(first.id)
    if (after.some((topic) => topic.id === first.id)) {
      expect(after[after.length - 1]?.id).toBe(first.id)
      expect(game.hasAskedTopic(first.id)).toBe(true)
    }
  })
})

describe('en un intercambio solo habla quien está delante', () => {
  it('elige la versión que pueden decir los que están en la sala', () => {
    // Vance se va a la cocina con un encargo. La versión de «poner ideas en común»
    // que le da réplica a él no puede sonar: la dice un hombre que está dos plantas
    // más abajo. Debe caer a la versión que Nadia sí puede sostener.
    const game = new Game(content, 'vance-ausente')
    game.assign('vance_servicio')
    expect(game.party.byId('vance').location).not.toBe(game.party.focus.location)

    const turn = game.debrief()
    const dialogo = turn.lines.filter((line) => line.kind === 'dialogo')
    expect(dialogo.length).toBeGreaterThanOrEqual(2)
    const speakers = dialogo.map((line) => line.text.split(' —')[0])
    expect(speakers).not.toContain('Vance')
    expect(speakers).toContain('Nadia')
  })

  it('con el grupo entero delante prefiere la versión a tres voces', () => {
    const game = new Game(content, 'grupo-entero')
    const speakers = game
      .debrief()
      .lines.filter((line) => line.kind === 'dialogo')
      .map((line) => line.text.split(' —')[0])
    expect(new Set(speakers)).toEqual(new Set(['Edith', 'Vance', 'Nadia']))
  })

  it('una condición cumplida cambia lo que se dicen', () => {
    const game = new Game(content, 'con-autorizacion')
    game.world.setFlag('autorizacion_behler')
    const texto = game
      .debrief()
      .lines.filter((line) => line.kind === 'dialogo')
      .map((line) => line.text)
      .join(' ')
    expect(texto).toContain('papel firmado')
  })
})

describe('el mapa cuenta el trayecto con nombres de sitios', () => {
  it('nunca enlaza rótulos de botón como si fueran salas', () => {
    const game = new Game(content, 'ruta')
    const turn = game.travelTo('terraza')
    const narration = turn.lines.find((line) => line.kind === 'narracion')!.text
    expect(narration).toMatch(/^De .+ a .+(, sin rodeos| pasando por .+)\.$/)
    for (const rotulo of ['Volver al', 'Salir al', 'Salir a la', 'Subir a', 'Bajar al', 'Entrar al']) {
      expect(narration).not.toContain(rotulo)
    }
  })
})
