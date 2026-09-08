import { describe, it, expect } from 'vitest'
import { loadContent } from '../src/content/index'
import { Game } from '../src/engine/game'
import { parseTime } from '../src/engine/clock'

const content = loadContent()

const GENERICOS = [
  'Responde, pero no dice nada que no supierais ya.',
  'Cambia de tema con una sonrisa educada.',
  '(silencio)',
]

describe('diagnostico', () => {
  it('ninguna rama de dialogo cae en el texto generico de reserva', () => {
    const fallos = new Set<string>()
    for (const seed of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8', 'h9', 'h10']) {
      for (const topic of content.topics.values()) {
        for (const ap of topic.approaches ?? ['directo', 'adular', 'enganar', 'presionar', 'sobornar']) {
          const g = new Game(content, seed + topic.id + ap)
          const res = g.dialogue.ask(topic.id, ap)
          if (GENERICOS.includes(res.response.text)) fallos.add(`${topic.id}/${ap}`)
        }
      }
    }
    console.log('ramas genericas:', fallos.size, [...fallos].slice(0, 20).join(', '))
    expect(fallos.size).toBe(0)
  })

  it('los temas nuevos de la noche llegan a estar disponibles', () => {
    const g = new Game(content, 'reachability')
    let guard = 0
    while (g.clock.now < parseTime('D2 07:00') && guard++ < 3000) g.wait()
    // Forzamos las ramas de azar y las de intervencion del jugador para
    // comprobar el gateo de los temas que dependen de ellas.
    g.world.setFlag('najir_aliado')
    g.world.setFlag('dieter_liberado_por_el_grupo')
    g.world.setFlag('najir_baja_al_sotano')
    g.world.setFlag('leones_sueltos')
    g.world.setFlag('olga_baila_con_selassie')

    const nuevos = [
      ['clinton', 'clinton_najir'], ['clinton', 'clinton_quien_es_selassie'], ['clinton', 'clinton_saqueos'],
      ['thornhill', 'thornhill_telegrama'], ['mahadni', 'mahadni_frigorifico'], ['mahadni', 'mahadni_la_comitiva'],
      ['rolland', 'rolland_carter_come_solo'], ['gasparini', 'gasparini_visita_de_najir'],
      ['gasparini', 'gasparini_selassie'], ['behler', 'behler_selassie'], ['behler', 'behler_leones'],
      ['carter', 'carter_la_bronca'], ['carter', 'carter_mecenas'], ['weder', 'weder_la_venta'],
      ['dieter', 'dieter_el_disco'], ['dieter', 'dieter_frigorifico'], ['olga', 'olga_selassie'],
      ['najir', 'najir_la_comitiva'], ['najir', 'najir_rescate'],
    ]
    const invisibles: string[] = []
    for (const [npc, id] of nuevos) {
      if (!g.topicsFor(npc!).some((t) => t.id === id)) invisibles.push(id!)
    }
    console.log('temas nuevos que NO aparecen:', invisibles.length, invisibles.join(', '))
    expect(invisibles).toEqual([])
  })

  it('las conversaciones nuevas son espiables en su ventana', () => {
    const casos: [string, string, string][] = [
      ['gasparini_najir_bar', 'bar_largo', 'D1 18:30'],
      ['dieter_najir_fiesta', 'salon_baile', 'D1 21:45'],
      ['fuad_en_el_templo', 'viejo_templo', 'D1 23:00'],
    ]
    for (const [conv, loc, hora] of casos) {
      const g = new Game(content, 'espiar-' + conv)
      // Avance fino: el jugador real no se mueve en bloques de media hora, asi
      // que hay que poder aterrizar en mitad de una escena.
      g.scheduler.advance(parseTime(hora) - g.clock.now)
      g.party.moveTogether(loc)
      const disponibles = g.view().eavesdroppable.map((c) => c.id)
      console.log(hora, loc, '->', disponibles.join(', ') || '(ninguna)')
      expect(disponibles).toContain(conv)
    }
  })
})
