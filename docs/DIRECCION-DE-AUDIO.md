# Dirección de audio original

El Disco Egipcio genera todo su sonido en tiempo real con Web Audio API. No
usa grabaciones, MIDI, bancos de sonido, recursos descargados ni material de
terceros. La partitura está en `src/ui/music.ts` y el motor que la reproduce,
en `src/ui/audio.ts`.

## Principios

- Mientras se juega siempre suena un tema. La música no desaparece: respira
  entre secciones uno o dos segundos y vuelve a entrar.
- La música sostiene la lectura a volumen bajo y con pocas voces simultáneas.
  Un compresor suave en el bus impide que la entrada de un tema pise el texto.
- Los timbres son secos y deliberadamente artificiales: síntesis FM de dos
  operadores, envolventes cortas y filtrado elemental.
- El ruido necesario para las texturas se calcula en memoria al crear el
  `AudioContext`; no se guarda ni se descarga.
- La composición es determinista: el mismo tema, la misma intensidad y el mismo
  número de sección suenan siempre igual. El planificador no consulta el RNG ni
  el reloj del juego.

## Cómo está organizado

`src/ui/music.ts` no toca Web Audio. Describe música: dado un tema, una
intensidad y el número de sección devuelve una lista de eventos con pulso,
frecuencia, duración, nivel y timbre. Eso permite comprobar el repertorio en la
suite de pruebas —densidad, registro, nivel y silencios— sin abrir un navegador.

`src/ui/audio.ts` construye el grafo y programa esos eventos compás a compás,
con 160 ms de antelación sobre el final de cada compás. Como nunca espera al
final de una frase para decidir la siguiente, no quedan huecos.

### Zona, tema e intensidad

La **zona** decide el tema; la **situación** decide la variante. Son ejes
independientes, y por eso una tirada o un diálogo ya no sustituyen la música de
la sala: la tensan.

| Zona | Dónde | Tema |
| --- | --- | --- |
| `hall` | recepción, salones, restaurante, cocina, bar, correos, oficinas | `hall-cortesia-rota` |
| `terraza` | terraza y jardín exterior | `terraza-calor-de-las-once` |
| `tiendas` | las seis tiendas del vestíbulo | `tiendas-baratijas-del-vestibulo` |
| `habitaciones` | pasillo y plantas 1–4 | `habitaciones-puertas-cerradas` |
| `subsuelo` | almacén, pasillo intermedio y salón de Alí Bey | `subsuelo-respiracion-de-piedra` |
| `templo` | sala de escombros y Viejo Templo | `templo-disco-solar` |

`musicZoneFor()` resuelve la zona con la escena abierta por delante de la
planta: el descenso, las orejas y el Disco Solar suenan a subsuelo o a templo
aunque el jugador siga contando plantas. Toda localización del contenido cae en
una zona; hay una prueba que lo verifica contra `locations.json`.

La intensidad es `calm` o `tense`. Sube al abrir los temas de un personaje o
con una tirada en pantalla, y se sostiene doce segundos después de preguntar,
inspeccionar, escuchar o recibir una pista. Cambia de variante —otra melodía,
otro tempo, bajo en corcheas— y entra en el compás siguiente, sin cortar nada.

### Motivos originales

Melodía cantable, bajo arpegiado y contracanto sostenido, a la manera de las
aventuras gráficas de finales de los ochenta. Dos secciones por tema y por
intensidad, que se alternan; ninguna se repite dos veces seguidas.

- **Cortesía rota** (hall, 66/74 bpm). Re menor con la quinta abierta y un Mi
  bemol que nunca decide si el acorde está en reposo.
- **Calor de las once** (terraza, 72/80 bpm). Sol dórico luminoso, vasos que se
  tocan y un desliz cromático cuando la mesa de al lado deja de ser inocente.
- **Baratijas del vestíbulo** (tiendas, 84/92 bpm). La musiquilla que el propio
  hotel vende: la menor con sensible, staccato y demasiada sonrisa.
- **Puertas cerradas** (habitaciones, 58/64 bpm). Do sostenido menor a media
  luz, notas largas que no llegan a formar frase. Suena un 14 % más bajo.
- **Respiración de piedra** (subsuelo, 52/56 bpm). Pedales que no encajan y
  respiración de ruido de banda estrecha, ahora con un armónico agudo que sí se
  oye en un altavoz pequeño.
- **El Disco Solar** (templo, 48/52 bpm). Quintas abiertas muy lentas y una
  melodía de intervalos grandes que nunca cierra la cadencia.

### Intro

Cuatro secciones de 3,8, 6, 7 y 6 segundos que cubren 22,8 de los 23 segundos
de la presentación y siguen las láminas de título, hotel, grupo y telegrama.
Conserva el descenso La–Sol sostenido–Mi de la primera versión. No admite
variante tensa: la intro va con la imagen, no con la partida.

### Revelación y Cordura

Durante 2,4 segundos, las voces musicales activas se separan hasta ±42 cents,
el filtro se cierra y reaparece, y cuatro notas descienden cromáticamente sobre
ruido filtrado. Se usa ante una pérdida real de Cordura o cuando Edith decide
comprender la revelación de las orejas; apartar la vista no lo dispara. Al
cerrar la demo la música se funde a silencio.

## Efectos sintetizados

| Señal | Diseño |
| --- | --- |
| Selección | Clic cuadrado de 35 ms con caída rápida. |
| Volver/cancelar | Triángulo grave de 60 ms. |
| No disponible | Dos pulsos cuadrados apagados. |
| Éxito | Dos campanas FM ascendentes y discretas. |
| Fallo | Dos tonos FM descendentes, sin énfasis cómico. |
| Reloj | Dos pulsos metálicos separados 240 ms. |
| Pista/informe | Dos operadores inarmónicos de caída frágil. |
| Cambio de sala | Soplo filtrado y tono subgrave casi imperceptibles. |
| Cordura | Batimiento, divergencia, ruido filtrado y caída cromática. |

Solo suena una señal narrativa por turno. La prioridad es Cordura, fallo o
daño, pista o éxito, reloj y finalmente cambio de sala. Los cruces entre zona
pública, privada y subterránea siempre pueden señalarse; dentro de una zona
solo suena uno de cada tres desplazamientos y nunca con menos de veinte
segundos entre ellos.

## Niveles

La música de la primera versión salía unos 11 dB por debajo del clic de
interfaz que suena en cada pulsación: se programaba, pero en partida no se oía.
Ahora la melodía va a 0.042, el bajo a 0.032 y el contracanto a 0.024, con el
bus de música al 0,45 por defecto y el maestro al 0,72. El pico queda cerca de
−30 dBFS, presente bajo la lectura y por debajo de la señal de interfaz.

Las preferencias viven en `la-broma-macabra.audio.v3`. Al migrar desde v2 o v1
se respeta el valor que el jugador hubiera elegido y solo se sube el que
coincide con el antiguo defecto de 0,22.

## Integración y recursos

- Un único `AudioContext`, creado después del primer gesto y reutilizado.
- Buses independientes de Música y Efectos, más silencio total.
- Polifonía limitada a veinticuatro voces musicales y catorce de efectos. Una
  voz detenida se descuenta en el acto: esperar al aviso `ended` dejaba voces
  fantasma, porque una fuente parada antes de su propio comienzo puede no
  emitirlo nunca.
- La ganancia del bus de estado se fija en cada decisión, no solo cuando algo
  cambia. Así no puede quedarse a cero porque la zona cambiase con la pestaña
  oculta o el sonido silenciado.
- `render_game_to_text()` expone escena, intensidad, tema, secciones
  ejecutadas, ganancia de música, voces y próxima cita del planificador.
- `node tools/audio_check.mjs` juega en Chromium con un analizador delante del
  destino y mide lo que sale de verdad: presencia, pico y silencio máximo por
  tramo.

Todo este material musical y sonoro fue compuesto para el prototipo y se
distribuye como parte de su código fuente. No deriva de melodías, arreglos ni
archivos de audio preexistentes.
