# Prompt para afilar la demo 09:00–13:00

Copia el bloque siguiente en una nueva sesión de Codex:

```text
Trabaja en el proyecto local «El Disco Egipcio». Tu objetivo no es ampliar todavía la historia después de las 13:00, sino convertir la demo 09:00–13:00 en una experiencia pulida, tensa y rejugable de 20–30 minutos.

Antes de tocar archivos, lee completos:
- docs/DIRECCION-DE-DISENO.md
- docs/REFERENCIAS-LOCALES.md
- progress.md
- README.md
- el PDF local `pdfcoffee.com_la-broma-macabra-5-pdf-free.pdf` únicamente para comprobar hechos, tono y cronología

Haz primero la comprobación previa indicada en `docs/REFERENCIAS-LOCALES.md`. Si el PDF no está disponible, dilo expresamente en la entrega y no afirmes que has contrastado la adaptación con el módulo. Puedes continuar con mejoras que no dependan de esa consulta.

Respeta estas decisiones: Edith Harker es la líder fija; Nadia y Vance reciben encargos; sus conocimientos no se comparten hasta reunirse; la raíz ofrece un máximo de cinco acciones; el mapa contiene el movimiento; el texto literario existente se conserva íntegro; la agenda canónica sigue ocurriendo, pero las acciones del jugador pueden ramificarla; las tiradas son visibles y permiten gastar Suerte; hay tres guardados manuales y no hay rebobinado.

Afila la demo en este orden:

1. Ritmo y onboarding
- Haz que la primera decisión interesante llegue antes de dos minutos.
- Enseña Caso, Mapa y Equipo mediante contexto y una sola indicación breve, sin tutorial modal largo.
- Elimina esperas redundantes y opciones que no cambien información, posición, recursos o relaciones.
- Mantén acciones de espera de 15 minutos, pero añade reacciones del hotel cuando de otro modo haya dos esperas seguidas sin contenido.

2. Escenas jugables
- Convierte en escenas interactivas la llegada y registro, la reunión de Behler, el conflicto de atención entre Behler y Carter/Weder, el umbral del sótano, las orejas y el Disco Solar.
- Cada escena necesita anticipación, entre dos y cuatro acciones, coste visible y una consecuencia que sobreviva a la escena.
- Usa `scene` e `interruptibleBy` como datos reales, no como condiciones aisladas en la interfaz.
- Conserva los hechos y horarios del módulo. Añade ramas causadas por el jugador, no sucesos arbitrarios nuevos.

3. Conversaciones del grupo
- Añade un sistema de intercambios reactivos entre Edith, Nadia y Vance.
- Escribe entre 12 y 18 intercambios breves para esta demo: primera separación, informe, sospecha sobre Weder, decisión de bajar, reacción a las orejas, tirada fallida, gasto de Suerte y desenlace del disco.
- Cada intercambio debe caracterizar y además interpretar una pista, anticipar un riesgo o plantear una decisión.
- No repitas el cuaderno ni conviertas a Nadia en una enciclopedia. Da a los tres voces claramente distintas.
- Los intercambios no deben consumir tiempo salvo que el jugador elija «poner ideas en común».

4. Sonido y música
- Implementa un AudioManager pequeño y desacoplado con buses de música, ambiente y efectos.
- No reproduzcas nada antes del primer gesto del usuario.
- Añade controles accesibles de volumen y silencio, guardados en localStorage.
- Diseña ambientes propios para hall, terraza, cocina, jardín y sótano.
- Añade efectos breves para reloj, cambio de pista, pasos, puerta, papel, dados, daño y Cordura.
- Usa música con moderación: tema de hotel, capa de sospecha, capa de subsuelo y golpe del Disco Solar. Evita un bucle constante que fatigue durante la lectura.
- Usa exclusivamente la síntesis Web Audio original descrita en `docs/DIRECCION-DE-AUDIO.md`. No añadas grabaciones, MIDI, bancos de sonido ni archivos descargados.

5. Feedback y presentación
- Añade transiciones breves para cambio de lugar, pista actualizada, informe listo y tirada, respetando prefers-reduced-motion.
- Mantén la estética EGA y las formas rectas. No llenes la pantalla de insignias o paneles.
- Pagina el texto largo sin resumirlo ni reescribirlo.
- Haz que el estado de una oportunidad perdida sea claro sin revelar el contenido secreto de la escena.
- Comprueba 1440×900, 1024×768 y 390×844, sin desbordamiento horizontal y con todas las acciones principales visibles.

6. Profundidad sistémica
- Da a cada encargo de compañero una tirada o coste apropiado, un riesgo y al menos dos calidades de informe.
- Añade como mínimo dos vías para descubrir la ruta del sótano y dos para identificar el papel de Weder.
- Haz que alertar a Weder cambie al menos un diálogo o una oportunidad posterior de la demo.
- Haz que Salud, Cordura, Suerte, autorización e inventario aparezcan únicamente cuando son relevantes.

7. Prueba de juego
- Añade pruebas para cada escena, informe, filtración de conocimiento, gasto de Suerte, audio silenciado, guardado y tres desenlaces del Disco Solar.
- Ejecuta npm test y npm run build.
- Usa el cliente Playwright indicado por la skill develop-web-game después de cada cambio significativo.
- Recorre al menos tres partidas completas: investigación social, delegación eficaz y persecución directa.
- Inspecciona visualmente las capturas, compara render_game_to_text con la pantalla y corrige el primer error de consola antes de seguir.

Entrega:
- la demo implementada y verificada;
- una tabla breve de cambios y su efecto jugable;
- capturas de los momentos principales;
- resultados de tests;
- progress.md actualizado con decisiones y siguientes riesgos.

No continúes con la tarde hasta que la demo tenga un arco completo, tres desenlaces y ninguna espera vacía evidente.
```
