# La Broma Macabra

Aventura gráfica narrativa y sistémica basada en el módulo de rol homónimo de Álex de la Iglesia para La Llamada de Cthulhu. Está diseñada para un jugador y automatiza la agenda, los personajes no jugadores, las tiradas y las consecuencias que normalmente resolvería un Guardián.

La demo jugable actual cubre el 21 de noviembre de 1922 entre las 09:00 y las 13:00. Edith Harker dirige la investigación mientras Nadia Farouk y Samuel Vance pueden ocuparse de otros frentes. El mundo avanza aunque Edith no esté mirando y la mañana culmina en una escena ramificada alrededor del Disco Solar.

## Probar el juego

```bash
npm install
npm run dev
```

```bash
npm test
npm run build
```

Estado actual: 180 pruebas automatizadas y compilación de producción verificada.

## Qué se juega

- Un máximo de cinco acciones contextuales en la escena.
- Desplazamiento mediante un mapa que solo revela rutas conocidas.
- Cuaderno con pistas, plazos y oportunidades perdidas.
- Encargos paralelos para Nadia y Vance.
- Informes que solo se comparten al volver a reunirse.
- Conversaciones por tema y aproximación, con fallos que hacen avanzar la historia.
- Tiradas visibles y gasto de Suerte.
- Tres ranuras de guardado manual.
- Tres resoluciones distintas para la escena final de la demo.

## Dirección del proyecto

- [Dirección de diseño](docs/DIRECCION-DE-DISENO.md)
- [Prompt para afilar la demo](docs/PROMPT-AFILAR-DEMO.md)
- [Prompt para crear arte original](docs/PROMPT-ARTE-ORIGINAL.md)
- [Referencias locales necesarias](docs/REFERENCIAS-LOCALES.md)
- [Estado y traspaso entre sesiones](progress.md)

La prioridad es pulir este arco de cuatro horas antes de ampliar la historia. El objetivo no es trasladar más páginas del módulo, sino conseguir que cada sistema produzca decisiones, escenas y consecuencias.

## Arquitectura

```text
src/engine/     reloj, agenda, estado, reglas, percepción, diálogo y director de investigación
src/content/    localizaciones, personajes, eventos y conversaciones en JSON validado
src/ui/         interfaz EGA y renderizado de escenas
test/           pruebas de reglas, contenido, simulación y ramas jugables
tools/          herramientas locales de tratamiento de arte
```

Los sistemas principales son:

- `scheduler.ts`: agenda cronológica, ventanas, cascadas y rastros.
- `worldstate.ts`: hechos, relaciones, estados y cadena de custodia.
- `adventure.ts`: pistas, acciones guiadas, encargos, informes y tiradas pendientes.
- `game.ts`: fachada jugable, escenas, ramificaciones y guardado versionado.
- `main.ts`: Mapa, Caso, Equipo, Guardar, Historial y controles accesibles.

La interfaz expone `window.render_game_to_text()` y `window.advanceTime(ms)` para pruebas deterministas en navegador. La tecla `F` alterna pantalla completa.

## Arte y derechos

El PDF original y sus ilustraciones no forman parte del repositorio público. Cuando falta una imagen, el juego genera un fondo EGA procedimental para que el flujo siga siendo jugable.

Las sesiones ejecutadas sobre la carpeta local completa sí pueden consultarlos. `CLAUDE.md` y [el manifiesto de referencias](docs/REFERENCIAS-LOCALES.md) indican las rutas exactas y obligan a comprobar su disponibilidad; un clon de GitHub por sí solo no contiene ese material.

El paquete definitivo debe estar compuesto por ilustraciones originales. Su biblia, inventario y proceso de sustitución se describen en [el prompt de arte](docs/PROMPT-ARTE-ORIGINAL.md).

El texto, las marcas y los materiales del módulo pertenecen a sus respectivos titulares. Este repositorio es un prototipo no oficial y no incluye el libro necesario para consultar la obra original.
