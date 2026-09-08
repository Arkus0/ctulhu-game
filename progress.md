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
- Equilibrar a oído niveles y fundidos en altavoces y auriculares; todas las fuentes están auditadas como CC0 en `LICENSE-AUDIO.md`.
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
