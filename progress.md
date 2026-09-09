Original prompt: Implement the proposed plan for rebuilding La Broma Macabra as a guided 09:00-13:00 vertical slice.

## Product decisions

- Guided menus with no parser or hotspot hunting.
- Edith Harker remains the leader; Nadia and Vance can receive concurrent assignments.
- Preserve the module schedule and prose; add player-caused branches around it.
- The first playable slice runs from 09:00 to 13:00 and culminates in the Solar Disk scene.
- Leads show states and deadlines. Companion discoveries remain private until reunion.
- Rolls are visible and failed rolls may be converted by spending Luck.
- Three manual save slots. No rewind and no autosave.

## Implementation checklist

- [x] Add the guided investigation layer, leads, assignments, reports and pending rolls.
- [x] Turn the 12:30 Solar Disk event into an interactive branching scene.
- [x] Add versioned full-game snapshots and three local save slots.
- [x] Rebuild the UI around Scene, Actions, Case, Map, Team, History and Save.
- [x] Add render_game_to_text, advanceTime and fullscreen keyboard support.
- [x] Add branch and regression tests; fix the pre-existing overshoot test.
- [x] Run the game test client and visually inspect important paths.

## Notes

- Baseline before implementation: 170 tests passed and 1 scheduler/time test failed because waiting from 16:45 by 45 minutes landed at 17:30 rather than the asserted 17:15 state.
- Waiting now advances in 15-minute decisions, while explicit actions retain their authored costs.
- Underground map destinations remain hidden until the service route is actually learned.
- Browser checks covered initial UI, case, team assignments, the Solar Disk scene, Luck spending UI and save/load restoration.
- Automated suite after implementation: 180 tests passing.

## Product handoff

- [x] Added `docs/DIRECCION-DE-DISENO.md` as the source of truth for future sessions.
- [x] Added a reusable prompt for polishing the 09:00–13:00 demo.
- [x] Added a reusable prompt and production checklist for a fully original EGA art pack.
- [x] Updated README and replaced the obsolete Sonnet handoff.
- [x] Published the clean source tree to `Arkus0/ctulhu-game` on branch `main`.
- [x] Verified a fresh clone with `npm ci`, 180 tests, a production build and a browser smoke test.
- [x] Upgraded Vitest to 3.2.7; `npm audit` now reports zero known vulnerabilities.
- [x] Added `CLAUDE.md` and a local-reference manifest so future sessions verify the ignored PDF and temporary art before relying on them.

## Arte original: infraestructura y lote 0

- Sesión sin generación de imágenes disponible. `docs/PROMPT-ARTE-ORIGINAL.md`
  estaba escrito para una sesión que la tuviera, así que se acordó otro método:
  composición vectorial propia en SVG, renderizada a 4x con el Chromium de
  Playwright, reducida y cuantizada a EGA con tramado Bayer ordenado.
- Pipeline reproducible y versionado: `art/src/<id>.svg` →
  `tools/render_art.mjs` → `art/master/<id>.png` → `tools/ega.py` →
  `public/art/<id>.png`. `tools/check_art.py` valida tamaño, paleta cerrada,
  ausencia de alfa, peso y referencias huérfanas.
- Documentación nueva: `docs/ART-BIBLE.md` (paleta, tramado, luz por franja,
  escala, composición, hojas de personaje) y `LICENSE-ART.md` (procedencia
  original comprobable y licencia). Inventario y estado en `art/manifest.csv`.
- **Lote 0 rechazado en revisión.** Las tres sustituciones de fondo
  (`terraza`, `recepcion`, `sotano_palacio`) se compararon con las láminas del
  módulo y quedaron claramente por debajo: dibujo plano, figuras de muñeco. Se
  restauraron los recortes temporales y esos identificadores vuelven a
  `pendiente` en el manifiesto.
- Se probaron dos variantes del método antes de descartarlo: vector plano con
  tramado Bayer, y vector modelado en color continuo con difusión de error. La
  segunda gana textura y grano de época —`tools/ega.py` conserva las dos vías—
  pero el cuello de botella no era el tramado, era el dibujo.
- Siguen en el juego, marcadas como provisionales, `escena_disco_solar` y los
  retratos de Edith y Clinton: cubren huecos donde antes no había nada.
- Conclusión: la parte de sistema del encargo está hecha y es aprovechable tal
  cual; la parte de dibujo necesita una sesión con generación de imágenes, que
  es justo lo que decía la primera línea de `docs/PROMPT-ARTE-ORIGINAL.md`.
- Motor: `SceneDef.art` y `EventDef.art` son opcionales y la vista resuelve el
  fondo en el orden escena → suceso en curso → variante → localización. La
  interfaz sigue sin conocer ningún nombre de escena.
- Interfaz: panel de retrato del interlocutor durante el diálogo, alimentado
  por el campo `portrait` que las 39 fichas de PNJ ya declaraban y que nadie
  pintaba. Si falta el PNG, el panel se oculta sin dejar hueco.
- `tools/qa_shots.mjs` recorre la demo entera con Playwright hasta el Disco
  Solar de las 12:30 y guarda nueve capturas en `art/qa/`. Sin errores de
  consola. Se revisaron una a una: el recuadro de texto de escena tapa el
  tercio superior de la lámina, lo que queda anotado en la biblia como
  restricción de composición.
- Hallazgo previo, no tocado: `src/content/scenes.json` define seis escenas y
  solo `arrival_checkin`, `behler_encargo`, `terrace_conflict`,
  `basement_threshold`, `ears` y `solar_disk` se disparan por evento; conectar
  las que falten es trabajo de la sesión que afile la demo.
- Pendiente del paquete: 19 fondos, los dos mapas, nueve hojas de personaje y
  once ilustraciones de escena, todas listadas en el manifiesto. Los catorce
  recortes del PDF que siguen en `public/art` continúan ignorados en Git y
  `check_art.py` los señala en cada ejecución.

## Next recommended milestone

Polish the existing demo before extending the schedule: reactive investigator dialogue, restrained original audio, interactive versions of the arrival/Behler/basement scenes, meaningful quality levels for companion reports, and three complete browser playthroughs.

The public repository must exclude the source PDF and current cropped module illustrations. Missing art intentionally falls back to the procedural EGA renderer until original replacements are approved.

## Pulido 09:00–13:00 (verificado, 8 de septiembre de 2026)

- [x] La llegada, Behler, el conflicto de terraza, el umbral, las orejas y el Disco Solar ya se describen como escenas de contenido con acciones validadas e `interruptibleBy` real.
- [x] `Caso` usa una proyección pública: al inicio solo existe el encargo de Behler; las oportunidades desconocidas expiran de forma anónima.
- [x] Los cuatro encargos tienen habilidad, dificultad, riesgo y calidad parcial/completa; la tirada permanece privada hasta recoger el informe.
- [x] Se añadieron 17 intercambios de Edith, Nadia y Vance sin transferencia accidental de hechos; son gratuitos salvo la pausa voluntaria «Poner ideas en común» de 5 minutos.
- [x] Se instaló y verificó Playwright; la copia temporal del cliente de la skill coincide por SHA-256 con el original.
- [x] Se añadieron recursos CC0 auditados, buses de audio, desbloqueo por gesto y controles persistentes.
- [x] La primera decisión aparece al iniciar; las esperas son de 15 minutos como máximo y el hotel reacciona antes de permitir dos esperas vacías seguidas.
- [x] El texto largo se pagina sin reescritura; las transiciones respetan `prefers-reduced-motion` y la demo cierra en cuanto queda resuelto el Disco Solar, sin exigir esperas vacías hasta las 13:00.
- [x] Se actualizaron las expectativas antiguas de orejas/caso y la suite alcanza 205 pruebas en 9 ficheros.
- [x] `npm test` y `npm run build` pasan. Vite solo conserva el aviso no bloqueante del paquete JavaScript de 837 kB antes de gzip.
- [x] El cliente de `develop-web-game` produjo captura y estado textual coincidentes; no registró errores de consola.
- [x] Recorrido social completo: escucha a Behler, investiga a Carter/Weder, sigue la ruta directa, examina las orejas y deja que Weder conserve el disco bajo vigilancia.
- [x] Recorrido de delegación completo: Vance prepara un informe privado con tirada visible al reunirse, abre una segunda ruta y la autoridad de Behler retrasa a Weder tras gastar Suerte.
- [x] Recorrido de persecución completo: la confrontación alerta a Weder, el umbral cambia a Sigilo Difícil y Edith obtiene la custodia del disco gastando Suerte.
- [x] Verificación visual en 1440×900, 1024×768 y 390×844: sin desbordamiento horizontal, acciones accesibles y cero errores de consola. Capturas y estados reproducibles en `artifacts/demo-09-13/`.

### Decisiones fijadas por este pase

- Las escenas viven en `src/content/scenes.json`; `scene` e `interruptibleBy` son contratos validados y ejecutados por el motor.
- `Caso` nunca proyecta nombres ni objetivos secretos. Una oportunidad no descubierta solo aparece después como «Oportunidad perdida».
- Los informes conservan conocimiento privado, riesgo y calidad parcial/completa hasta la reunión física.
- El audio no se inicia antes del primer gesto. Música, ambiente y efectos tienen buses independientes; silencio y volumen persisten en `localStorage`.
- Resolver el Disco Solar es el cierre jugable de esta demo aunque el reloj diegético aún no marque las 13:00; la pantalla de consecuencias resume el estado canónico de las 13:00.

### Riesgos siguientes, sin ampliar aún la tarde

- Hacer una prueba cronometrada con personas externas para confirmar los 20–30 minutos; la automatización valida ramas y ritmo sistémico, no velocidad de lectura humana.
- El audio CC0 de aquel pase quedó reemplazado posteriormente por síntesis Web Audio original; la nueva referencia es `docs/DIRECCION-DE-AUDIO.md`.
- Reducir el paquete JavaScript inicial y sustituir el arte provisional por el lote original aprobado, sin tocar el arco ni las ramas verificadas.

## Paquete visual original 09:00–13:00 (verificado, 8 de septiembre de 2026)

- [x] La comprobación previa confirmó el PDF local de 166 páginas,
  `art/raw/*.png`, los antiguos `public/art/*.png`, `art/contacto.png` y
  `art/ega_preview.png`. `tools/crops.csv` se usó únicamente como inventario de
  nombres anteriores.
- [x] Se consultó el PDF para hechos, arquitectura, ropa y tono; las imágenes
  temporales solo sirvieron para auditar cobertura y función. Ninguna referencia
  ajena se entregó al generador ni se utilizó como composición.
- [x] Se crearon 58 finales originales: 22 fondos, 2 mapas, 13 escenas, 11
  retratos y 10 hojas de continuidad. Todas las imágenes públicas son opacas,
  miden exactamente 320×152 o 72×96 según su tipo, usan solo las 16 tintas EGA
  y pesan menos de 40 KB.
- [x] `art/prompts.json` conserva dirección común, fichas de continuidad,
  descripciones por activo y la edición dirigida del Disco Solar. Los maestros
  raster permanecen localmente en `art/master/`; los mapas tienen SVG original
  versionado.
- [x] `tools/ega.py` recorta a 40:19, reduce y aplica Bayer 4×4 por defecto;
  `tools/check_art.py` valida las 58 filas; `tools/contact_art.py` genera hojas
  para fondos, escenas, mapas, retratos y personajes.
- [x] El inventario detectó que `habitacion` sirve catorce cuartos, `correos`
  tres despachos y `recepcion`, `cocina` y `salon_isis` dos espacios. Los giros
  de la demo no reutilizan esos genéricos: tienen trece composiciones propias.
- [x] `SceneView.art`, `EventDef.art`, `Turn.presentationArt` y
  `AssignmentDef.reportArt` forman una ruta de datos completa. La interfaz no
  codifica nombres de escenas; conserva el arte transitorio hasta la siguiente
  acción y luego vuelve al fondo, escena o cierre correspondiente.
- [x] Los mapas se seleccionan desde `src/content/map_art.json`; el panel mantiene
  la lista textual como fallback. El Viejo Templo tiene variantes visuales para
  custodia de Edith, retirada por autoridad y salida de Weder.
- [x] Se retiraron las exclusiones individuales de `public/art/` después de
  comprobar que todos los nombres usados tenían sustituto. El fallback
  procedimental permanece para cualquier archivo futuro ausente.
- [x] Revisión visual: cinco hojas de contacto y once capturas reales del
  cliente (hall, diálogo, mapas, terraza, Behler, cocina, umbral, orejas, Disco
  Solar y móvil). Se retiró el resumen duplicado que tapaba el arte; la segunda
  pasada conserva rostros, foco, salida y rótulos legibles, sin errores de
  consola.
- [x] Suite final: 208 pruebas en 9 ficheros y compilación de producción
  correctas. Vite conserva únicamente el aviso no bloqueante por el tamaño del
  paquete JavaScript inicial.

### Corrección de mapas

- [x] La primera versión vectorial se rechazó por parecer un diagrama de nodos
  y tener mucha menos calidad que los fondos.
- [x] `mapa_plantas` y `mapa_sotanos` se regeneraron como maquetas originales
  en perspectiva oblicua: fondos pintados, geometría facetada y cámaras fijas
  propias del survival horror de PC de principios de los noventa.
- [x] Las antiguas fuentes SVG se retiraron para que el pipeline no pueda
  restaurar accidentalmente el mapa rechazado. Los prompts finales quedan en
  `art/prompts.json` y los maestros seleccionados en `art/master/`.
- [x] Ambos mapas se volvieron a reducir y cuantizar a EGA, se inspeccionaron a
  320×152 y dentro del panel a 1024×700. El recorrido Playwright terminó sin
  errores de consola.

## Audio original Web Audio (entregado, 8 de septiembre de 2026)

- [x] Sustituido el reproductor de recursos CC0 por síntesis FM y ruido generado en memoria, con estados Hotel, Investigación, Subsuelo y Silencio.
- [x] Reducidos los controles a Música, Efectos y silencio total; preferencias v2 con migración desde v1.
- [x] Añadidos resultados estructurados a las señales de tirada y diagnóstico de audio a `render_game_to_text` sin alterar reloj, RNG ni guardados.
- [x] Retirados los quince recursos de `public/audio`; la compilación pasa y la suite provisional alcanza 213 pruebas.
- [x] Primer humo con el cliente de `develop-web-game`: AudioContext desbloqueado, estado Hotel, un planificador pendiente, cero voces residuales y cero errores de consola; captura EGA intacta.
- [x] Documentados los motivos, estados, señales, controles, persistencia, límites de voces y limpieza de nodos en `docs/DIRECCION-DE-AUDIO.md`.
- [x] El recorrido automatizado corto cubrió hotel, conversación, investigación, subsuelo y cierre sin errores de consola; mute, volúmenes, recarga y activaciones consecutivas quedaron comprobados.
- [ ] La auditoría continua de quince minutos se detuvo a petición del usuario después de 225 segundos estables en Hotel y la entrada en Investigación; no se reanudó antes de publicar.

## Claridad de las tiradas porcentuales (8 de septiembre de 2026)

- [x] Aclarado en la tarjeta y el historial que las pruebas son *roll-under*: el resultado debe ser igual o menor que el umbral efectivo.
- [x] La interfaz muestra por separado tirada, umbral requerido, habilidad base, dificultad y veredicto de la prueba.
- [x] El estado textual estructurado expone `required` y `success` durante una tirada pendiente.
- [x] Añadida una regresión explícita para el caso comunicado: 67 contra 55 es una prueba fallida.

## Conversación de un clic y diálogos al nivel del resto (8 de septiembre de 2026)

### Preguntar

- [x] La pantalla «¿cómo?» desaparece. La aproximación la elige `chooseApproach`
  puntuando habilidad del hablante, dados que aportan los ganchos del PNJ y coste
  social de cada registro (`presionar` 12, `enganar` 8, `sobornar` 4, `directo` y
  `adular` 0); a igualdad manda el orden `directo > adular > sobornar > enganar >
  presionar`. `ask(topicId)` sin aproximación entra en modo automático y la firma
  antigua sigue valiendo para las escenas guiadas y las pruebas.
- [x] Se cuenta lo que antes se elegía: quién lleva la voz, en qué registro y qué
  gancho ha saltado, delante de la línea de tirada. Sin eso, un dado automático
  parece arbitrario.
- [x] Entrevista completa a Behler: de 4 clics por pregunta a 2. La lista pasa de
  tres temas a cuatro por página, lo ya preguntado cae al final marcado como tal, y
  paginación y «Volver» comparten una fila compacta.
- [x] Las tiradas de diálogo siguen resolviéndose enteras. La tarjeta con apuesta y
  gasto de Suerte se reserva para las tiradas de escena, que son las caras.

### Ganchos de carácter

- [x] Quince de los cincuenta y un ganchos no saltaban nunca: usaban el vocabulario
  del libro (`amenazar`, `cortesia`, `egiptologia`, `hermandad`, `cocina`, `sotano`,
  `posicion`, `politica`, `discrecion`, `invitar`…) y el motor solo comparaba contra
  las cinco aproximaciones. Afectaba a Behler, Clinton, Weder, Mahadni y Thornhill,
  los cinco centrales de la demo.
- [x] Se rescatan por dos vías: `APPROACH_ALIASES` para los que son sinónimos de tono
  y `tags` de tema para los que dependen del asunto. `criticar_behler` era en realidad
  una penalización por apretar a Clinton y se corrige en la ficha.
- [x] `validate` rechaza desde ahora cualquier gancho que no pueda saltar. Los PNJ sin
  temas escritos quedan exentos: su ficha va por delante de su diálogo.

### Legibilidad de las opciones

- [x] Fuera del botón la habilidad, el riesgo y la consecuencia. Reaparecen con la
  tirada, que es cuando el jugador puede aceptarla o comprarla con Suerte. Solo la
  opción desactivada explica qué le falta.
- [x] Los rótulos de `scenes.json` cargan ahora con la intención entera, porque el
  botón ya no la explica.
- [x] Ninguna opción oculta su coste: un tema sin `minutes` mostraba el botón sin
  tiempo aunque el motor le cobrase diez.
- [x] Medido en 1440×900, 1024×768 y 390×844: la lista completa cabe sin rodar el
  panel y sin quitarle un píxel ni a la lámina ni a la caja de texto.

### Rutas del mapa

- [x] `travelTo` enlazaba los `label` de las salidas, que son rótulos de botón en
  infinitivo, y producía «Recorréis Volver al hall, Salir a la terraza». Ahora
  `shortestRoute` devuelve las salas atravesadas y la frase se construye de manera
  que no pueda quedar mal: «De la terraza a la cocina, pasando por Recepción y hall
  de entrada y el restaurante».

### Texto

- [x] Reescritos los diecisiete intercambios del equipo, que eran el mismo aforismo
  partido en dos y sin voz propia. Ahora son veintiséis con variantes según quién
  esté delante, de dos a cuatro líneas, y con `requires` opcional.
- [x] Corregido un fallo real: `exchange` solo comprobaba que hubiera dos
  investigadores en la sala y luego daba la réplica a quien tocara. Vance contestaba
  al informe de Nadia desde la cocina, dos plantas más abajo.
- [x] Reescritos los ocho informes de Nadia y Vance: se pintan como `dialogo` y
  estaban escritos en tercera persona.
- [x] Repasados los seis cuerpos de escena y la prosa de desenlace de `game.ts`, y
  corregidas las cadenas sin tildes que llegaban a pantalla («Dejais correr el
  reloj», «retazos mas», «poner ideas en comun»).

### Comprobación

- [x] `npm test`: 229 pruebas en 11 ficheros. `test/dialogue.test.ts` es nuevo y sus
  doce casos fallan contra el código anterior, comprobado con `git stash`.
- [x] `npm run build` limpio salvo el aviso conocido del paquete JavaScript.
- [x] `tools/qa_shots.mjs` recorre la demo entera hasta el Disco Solar de las 12:30.
  Entra con `skipIntro=1` y usa el Chromium de `/opt/pw-browsers` cuando existe. Los
  dos errores de consola que quedan son del entorno: la hoja de Google Fonts la corta
  el proxy de red.

### Objetivo y descripción, tras acordarlo con el usuario

- [x] La escena declara `objective`, la línea de la barra, validada a noventa
  caracteres, y `body`, la prosa. Eran el mismo texto: la barra es un rótulo encima
  de la lámina y la descripción la desbordaba a tres líneas.
- [x] La descripción se narra en el cuadro de texto al abrirse la escena. Con una
  escena abierta ya no se cuenta además la sala: eran lo mismo dos veces.
- [x] Fuera el rótulo «DECISIÓN CRÍTICA». Salía en las seis escenas, o sea siempre, y
  un aviso que sale siempre deja de avisar. El borde sigue marcando la escena.
- [x] El cuadro paginaba con un presupuesto fijo que no cabía en su propia caja: había
  que rodar el cuadro *y* pasar de página. Ahora se mide en el DOM, porque el ajuste
  por palabras desperdicia más cuanto más estrecha es la columna y ninguna cuenta de
  caracteres acierta en móvil y en escritorio a la vez. Lo que no cabe ni solo se parte
  por frases, y un titular no puede quedarse solo en una página.
- [x] La barra de paginación se pega al borde del cuadro; antes asomaba por debajo la
  línea siguiente y se leía como texto cortado.
- [x] Comprobado en 1440×900, 1024×768, 1024×700 y 390×844: el cuadro llena su alto
  exacto y no desborda en ninguno.

### Pendiente

- [ ] Contrastar jugando el reparto entre lámina, cuadro de texto y lista de opciones.
  Está medido, no jugado.

## El Disco Egipcio: portada, intro y cierre (verificado, 8 de septiembre de 2026)

- [x] El nombre visible del juego pasa a ser `El Disco Egipcio` en la portada, el documento HTML, la entrada de partida y la documentación de producto. Se conservan el paquete, la URL publicada y las claves de guardado para no romper despliegues ni partidas existentes.
- [x] Nueva portada EGA con `Nueva partida`, continuación del guardado más reciente cuando existe, sonido y una ayuda de cuatro líneas. No hay pantalla ni botón de créditos.
- [x] Intro automática y saltable de 23 segundos: título; El Cairo, 21 de noviembre de 1922; Hotel Shepheard's, 09:00; Edith, Nadia y Vance; y el encargo breve de Behler.
- [x] Tras la intro se entra directamente en la escena, sin repetir el briefing; el acceso de pruebas que la omite conserva una sola frase de contexto.
- [x] La intro reutiliza las ilustraciones EGA originales, presenta al grupo con encuadres legibles en escritorio y móvil y tiene un motivo de audio propio aislado del foco de investigación.
- [x] El cierre jugable se presenta ahora como una lámina EGA breve con consecuencia, una línea de estado y solo las acciones `Jugar otra vez` y `Volver al título`.
- [x] Portada, ayuda, los cuatro fotogramas, salto por botón/teclado, continuación y vistas móviles verificadas sin desbordamiento ni errores de consola.
- [x] Tres recorridos completos verificados en 1440×900, 1024×768 y 390×844: ocho auditorías de pantalla y cero errores de consola. Capturas en `artifacts/el-disco/` y `artifacts/demo-09-13/`.
- [x] Suite final: 214 pruebas en 10 ficheros, compilación de producción correcta y 58/58 láminas validadas. Permanece el aviso no bloqueante de Vite por el paquete inicial de unos 860 kB y el inventario avisa de 31 retratos de PNJ aún no ilustrados.

## Mayor presencia y variedad musical (8 de septiembre de 2026)

- [x] La intro musical pasa de una frase corta con un gran vacío a cuatro secciones enlazadas que cubren 22,8 de sus 23 segundos y siguen las láminas de título, hotel, grupo y telegrama.
- [x] El hotel entra entre 250 y 700 ms después del fundido y alterna tres temas originales sin repetición consecutiva; los ciclos bajan de 18–35 a 10–16 segundos.
- [x] Investigación y subsuelo también alternan tres variantes y reducen sus pausas, conservando menos densidad que una banda sonora continua.
- [x] Los diagnósticos de `render_game_to_text` incluyen tema, frases ejecutadas y demora de la siguiente frase.

## Afilado de la demo: ritmo, estado visible, accesibilidad y decisión (8 de septiembre de 2026)

Sesión abierta desde un clon de GitHub. **El paquete local de referencias no
estaba disponible**: no existen `pdfcoffee.com_la-broma-macabra-5-pdf-free.pdf`
ni `art/raw/`. Todo lo de este pase evalúa código, datos y experiencia jugable.
No se ha contrastado fidelidad al módulo, ni comparado láminas, ni aprobado
ninguna sustitución artística. Los hechos nuevos se apoyan solo en lo que ya
afirmaba el contenido versionado.

### El diagnóstico del que sale este pase

El motor iba muy por delante del contenido, y la interfaz por detrás de los dos.
La demo tenía forma de **arranque fuerte, hora muerta y final fuerte**: de los 65
sucesos de `day1.json`, 12 caían en la ventana jugable y **ninguno entre las 09:30
y las 11:00**, justo la franja que `DIRECCION-DE-DISENO.md` §4 describe con más
detalle. Y la capa que debía sostener la tensión —tiempo, Cordura, pistas
nuevas— existía en el motor sin llegar al ojo del jugador.

### Fase 1. La hora muerta y las conversaciones

- [x] Tres sucesos nuevos entre las 10:00 y las 11:00: `d1_servicio_carga` (la
  segunda anomalía que pedía §4 y no existía), `d1_mahadni_recibe` (segunda vía
  hacia el subsuelo) y `d1_olga_aborda`.
- [x] Séptima escena, `lounpeen_abordaje`: la decisión de información frente a
  puntualidad que faltaba. Escucharla entera cuesta media hora y llega tarde a
  Behler; apartarla de su padre es una tirada; excusarse conserva la hora y
  pierde el hilo.
- [x] Consecuencias con lector, no banderas sueltas: `behler_impaciente`
  endurece la firma a Difícil, y hablar con Olga en público activa el gancho de
  carácter de Dieter que el módulo ya declaraba (`suspicious` mete un dado de
  penalización en todo lo que se le pregunte después).
- [x] Olga señala el jardín del salón Isis. La ruta alternativa de las 12:00
  existía desde el principio **sin ninguna forma de descubrirla**.
- [x] `hotelReaction` pasa de 4 salas a las 11 jugables, tres frases cada una, y
  reserva una línea para cuando hay un compañero fuera. Elige con un generador
  propio: gastar tiradas del RNG común movería todos los dados posteriores.
- [x] **Las conversaciones no se cierran al preguntar.** Preguntar un tema
  devolvía al menú de la sala. Ahora se sigue delante del mismo personaje hasta
  «Despedirse», y `resumeMode` corta el regreso si el turno ha abierto una
  escena o el interlocutor se ha ido.

### Fase 2. Que el estado se vea

- [x] Distintivo persistente sobre Caso y Equipo. No son el mismo aviso: el de
  Caso se apaga al leer; el de Equipo marca un informe sin recoger y sigue
  encendido hasta la reunión, porque apagarlo al mirar sería mentir.
- [x] Cordura y Salud en la barra superior, medidas contra la Cordura del
  comienzo del día y no contra `sanMax`: comparar con el máximo enseñaba
  «Cordura 65/99» desde el primer segundo sin que hubiera pasado nada.
- [x] Las cuatro señales huérfanas ya pintan. `FeedbackCue` declara diez tipos y
  la hoja definía seis. Una prueba de contrato lee la declaración del motor.
- [x] El salto del reloj se anima, y `prefers-reduced-motion` lo desactiva.

### Fase 3. Accesibilidad y cinco bugs

- [x] `aria-live` estaba en `<main>` entero y en `#front` entero, con el tecleo
  reescribiendo el párrafo cada 12 ms: **el juego era menos usable con lector de
  pantalla que sin él**. La región viva se acota a `#log` y el anuncio se retiene
  con `aria-busy` hasta que la página está completa.
- [x] `#panel` pasa a `role="dialog"` con `aria-modal`, y `#game` queda `inert`
  mientras está abierto: el panel vive después en el DOM y el tabulador salía
  hacia la interfaz tapada.
- [x] Los atajos numéricos atravesaban el panel abierto.
- [x] `writeSave` no protegía `localStorage.setItem` y `loadSave` no protegía
  `game.restore`: el jugador creía haber guardado, o se quedaba con una partida
  muda y sin mensaje.
- [x] `#front-image` sin `onerror`, y la tecla «f» sin mirar la fase ni el
  elemento con el foco.
- [x] `--gray` (#555, 2.8:1) llevaba las líneas de sistema, que es donde va la
  única indicación de onboarding. Se queda para bordes; el texto usa
  `--gray-text` (7:1). `:focus-visible` deja de ser idéntico a `:hover`.
- [x] Objetivos táctiles a 44 px, incluida la paginación (medía ~19 px y es el
  control más pulsado), y escalón intermedio de 761 a 1100 px.
- [x] Favicon incrustado: el 404 de `/favicon.ico` contaba como error de consola.

### Fase 4. Decisión, no solo ejecución

- [x] **Empujar la tirada.** `push` y `canPush` estaban en `rules.ts` con sus
  pruebas y `game.ts` ni los importaba. El precio del segundo fallo está escrito
  por acción en `PUSH_STAKES`, se lee antes de decidir, y se aplica encima de la
  consecuencia normal, nunca en su lugar.
- [x] **El bug de `who`.** `resolveDeferred` lo ignoraba y cobraba a todo el que
  estuviera delante: «Ponerse delante de Nadia y de Vance» les cobraba Cordura a
  Nadia y a Vance. Se respeta en `sanityLoss` y `damage`, y solo ahí:
  `setInvestigatorStatus` usa «random», que no es identificador de nadie.
- [x] La raíz ofrece hasta dos detalles, y esperar deja de competir por la última
  ranura del corte de cinco: iba al final y podía caerse.
- [x] Conserjería, restaurante y bar largo estaban en el mapa con cero detalles.
- [x] La validación rechaza una tirada de detalle contra una habilidad que no
  tiene ningún investigador. `Contabilidad` está en las fichas de PNJ y en
  ninguna del grupo; escribí la regla y me encontré a mí mismo.
- [x] El coste en minutos desaparecía en la opción resaltada: `.cost` era
  `--silver` sobre un fondo `--silver`.

### Comprobación

- [x] `npm test`: 258 pruebas en 11 ficheros. `npm run build` limpio salvo el
  aviso conocido del paquete JavaScript.
- [x] `tools/qa_shots.mjs` recorre la demo entera hasta el Disco Solar de las
  12:30, con las seis escenas disparándose.
- [x] En navegador: dos preguntas seguidas sin salir de la conversación; con el
  Mapa abierto la tecla «1» no mueve el reloj y `#game` queda inert; a 1440,
  1100 y 390 no hay desbordamiento y los botones llegan a 44 px en móvil; y con
  seis semillas hasta dar con un fallo, la tarjeta ofrece aceptar, insistir con
  su precio escrito y gastar Suerte.
- [x] Ninguna franja de 30 minutos entre las 09:00 y las 13:00 se queda sin
  suceso: la cobertura pasa de 1-4 sucesos vivos por tramo, sin ceros.

### Riesgos siguientes

- [ ] **La única fuente de error de consola que queda es la hoja de Google
  Fonts**, que corta el proxy del entorno. No es solo ruido: el juego cae a
  `Courier New` y pierde su identidad de píxel si la red falla en casa de
  cualquiera. Autoalojar `DotGothic16` subsetada.
- [ ] Primera carga: `content/index.ts` importa 936 KB de JSON de golpe,
  incluidos ~250 KB de diálogo de PNJ que la demo no alcanza.
- [ ] El epílogo sigue siendo un titular, un párrafo y tres cifras. `summary()`
  ya calcula `seen`, `missed` y la cobertura de conversaciones y solo se usa
  `.length`. No hay créditos pese a `LICENSE-ART.md`.
- [ ] No hay menú de pausa: no se puede volver al título ni releer «Cómo jugar»
  sin recargar. Ni ajustes de accesibilidad más allá del volumen.
- [ ] `interruptibleBy` sigue siendo un no-op: los siete sucesos declaran el
  mismo conjunto que su escena, así que el filtro nunca quita nada. Es la palanca
  más barata que hay para dar variedad a las escenas que ya existen.
- [ ] Rastros y diario están construidos y no llegan a pantalla: 73 rastros
  declarados y `view().traces` no se pinta en ninguna parte.
- [ ] Sigue pendiente la partida humana cronometrada de principio a fin.

## La música vuelve a la partida (verificado, 8 de septiembre de 2026)

- [x] Diagnosticado el motivo de que la intro sonara y la partida no: la música se programaba, pero salía unos 11 dB por debajo del clic de interfaz, con huecos de hasta 14 segundos, y tras la primera acción el juego se quedaba 25 segundos en un estado de investigación hecho de pulsos de 73–104 Hz, inaudibles en un altavoz de portátil.
- [x] Corregidos dos defectos del motor: la ganancia del bus de música podía quedarse a cero para el resto de la partida si la zona cambiaba con el sonido silenciado o la pestaña oculta, y las voces detenidas antes de su propio comienzo no se descontaban nunca, así que el límite de polifonía dejaba de proteger.
- [x] La partitura se separa en `src/ui/music.ts`, sin Web Audio: un compositor determinista de eventos que la suite puede medir —densidad, registro, nivel y silencios— sin abrir un navegador.
- [x] Seis temas nuevos por zona —hall, terraza, tiendas, habitaciones, sótanos y Viejo Templo—, con melodía, bajo arpegiado y contracanto, dos secciones por intensidad y variante tensa para la investigación. La intro se conserva y pasa por el mismo planificador.
- [x] La música es continua: el planificador programa compás a compás con 160 ms de antelación y solo deja el respiro escrito de uno o dos segundos entre secciones. La zona decide el tema y la situación decide la variante, que entra en el compás siguiente sin cortar nada.
- [x] Bus de música al 0,45 por defecto y compresor suave; preferencias `v3` que respetan la elección previa del jugador y solo suben la de quien nunca tocó el mando.
- [x] `node tools/audio_check.mjs` mide lo que sale de verdad con un analizador delante del destino. En el hall la música suena el 87 % del tiempo con un silencio máximo de 1,6 s (antes: dos frases en veinte segundos y tramos con cero voces); investigar sube la tensión sin cambiar de tema; el cambio de zona cambia de tema con 0,8 s de silencio; silenciar y volver recupera la ganancia; la intro sigue sonando como antes.
- [x] Suite: 249 pruebas en 12 ficheros, `tsc --noEmit` limpio y compilación de producción correcta.
- [ ] Escuchar la mezcla con altavoces reales y ajustar el equilibrio entre melodía, bajo y efectos. Está medido, no escuchado.

## La noche de la mascarada deja de ser invisible (verificado, 9 de septiembre de 2026)

- [x] Auditada `events/day1.json` antes de tocar nada: ya estaba completa. 68 sucesos de las 09:00 a las 07:00 del día siguiente, los hitos del módulo (páginas impresas 54-60) escritos y fieles, la cadena de custodia del Disco atada con `requires`/`custody`, ninguna referencia rota —comprobados también `moveNpc.to`, `moveCustody.item`, los holders, el arte y los tellers, que la validación de `content/index.ts` no cubre— y ninguna franja de 30 minutos vacía. `fuera_del_hotel` no era un error: es el centinela de `game.ts:158`.
- [x] Lo que faltaba no era contenido, era acceso: la demo se cortaba a las 13:00 y **cincuenta de los sesenta y ocho sucesos se disparaban sin que ningún jugador pudiera estar delante**. `DEMO_END` (D2 07:00) sustituye a los tres cortes de `game.ts` que lo causaban. Los otros cuatro `13 * 60` se quedan donde estaban: son los plazos reales de las pistas de Olga y del Disco.
- [x] **La trampa del pase.** El filtro que impide aprender por telepatía lo que no se ha presenciado solo llegaba hasta las 13:00. Abrir la tarde sin moverlo le regalaba al grupo los 51 hechos de la noche. Una prueba de `_diag` lo fija ahora en los dos sentidos: estando delante en la 407 a las 16:00 se aprende la venta, y esperando sentado en el hall no. Tres temas de diálogo pasaban solo por esa vía equivocada.
- [x] La decisión sobre el Disco Solar deja de terminar la partida y pasa a ser el hito de mediodía.
- [x] Seis pistas nuevas en el tablero para la tarde y la noche —la venta de la 407, el saco de Carter, su cólera, entrar en la mascarada, el telegrama y Najir al otro lado de la puerta—. Sin ellas el jugador se quedaba dieciocho horas sin un solo objetivo. Las tres últimas se resuelven por detalles que ya existían y nadie podía alcanzar.
- [x] `mapDestinations` era una lista fija de once salas de la mañana, y el mapa es la única forma de moverse: **el salón de baile —trece sucesos, el centro de la noche—, la 407 y la 204 no se podían pisar**. Ahora las salas públicas están siempre, el subsuelo sigue pidiendo la ruta de servicio y una habitación ajena aparece cuando el grupo sabe quién duerme en ella. Una prueba impide que vuelva a quedarse fuera una sala con sucesos.
- [x] «Esperar a que pase algo» salta al siguiente suceso de la agenda, con tope de hora y media y sin pasarse del cierre. Cruzar de las 14:00 a las 21:00 baja de 28 pulsaciones a 17.
- [x] Epílogo nuevo: lo escribe dónde amanece el Disco —jugador, Dieter, Selassie, Weder o nadie—, más Najir, el telegrama y el pacto del sótano.
- [x] Comprobación: 283 pruebas en 12 ficheros, `tsc --noEmit` limpio, compilación correcta y partida completa en navegador de las 09:00 al amanecer, sin errores de consola, entrando en la mascarada y con el epílogo leyendo el estado real de la noche.
- [x] `docs/NOCHE-DE-LA-MASCARADA.md` recoge lo que falta para que esto parezca un videojuego, con un prompt copiable por tarea.

### Lo que la partida completa deja a la vista

- [ ] **Cero escenas de decisión después de las 12:30.** Los cincuenta sucesos de la tarde y la noche se presencian; no se decide en ninguno.
- [ ] **El salón de baile tiene un solo detalle para las nueve horas que dura la fiesta**, y se consume al primer uso. `pasillo_habitaciones` tiene cero mientras los esbirros lo saquean durante siete. Cuarenta detalles para cuarenta salas.
- [ ] **Fuad, Selassie y el Aga Khan no tienen ni un tema de diálogo**, y salen en 22 sucesos entre los tres.
- [ ] **Catorce habitaciones comparten `habitacion.png`** y no hay ni una lámina de escena para la noche. El fondo procedural de `art.ts` es una red de desarrollo, no una entrega.
- [ ] 22 hechos de la noche siguen huérfanos: se aprenden y no los usa nadie.
