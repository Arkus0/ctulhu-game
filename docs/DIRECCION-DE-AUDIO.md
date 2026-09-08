# Dirección de audio original

El Disco Egipcio genera todo su sonido en tiempo real con Web Audio API. No
usa grabaciones, MIDI, bancos de sonido, recursos descargados ni material de
terceros. La implementación y la composición están en `src/ui/audio.ts`.

## Principios

- El silencio forma parte de la partitura. Ningún estado mantiene una capa
  musical continua.
- La música sostiene la lectura a volumen bajo y con pocas voces simultáneas.
- Los timbres son secos y deliberadamente artificiales: osciladores simples,
  síntesis FM de dos operadores, envolventes cortas y filtrado elemental.
- El ruido necesario para las texturas se calcula en memoria al crear el
  `AudioContext`; no se guarda ni se descarga.
- El planificador musical tiene azar propio y no consulta el RNG ni el reloj
  del juego.

## Motivos originales

### Intro

- Duración compuesta: 22,8 segundos para una intro visual de 23 segundos.
- Estructura: título (3,8 s), hotel (6 s), investigadores (7 s) y telegrama
  (6 s), sincronizados con sus cuatro láminas.
- Motivo: conserva el descenso La–Sol sostenido–Mi de la primera versión y lo
  desarrolla con respuestas distintas, sin convertirlo en un bucle continuo.
- Timbre: campanas FM, pedales secos y una disonancia creciente en el último
  bloque.

Cada sección se programa por separado para mantener baja la polifonía. Si la
intro se salta, todas las voces futuras se detienen durante el fundido al hotel.

### Hotel público

- Tempos: 62, 66 y 70 BPM.
- Armonía: quinta abierta Re–La con Mi bemol como nota incómoda.
- Temas: `Cortesía rota` (La–Do–Si), `Galería de espejos` (Do–Mi bemol–Si) y
  `Después de hora` (Sol–Fa sostenido–Si bemol–La).
- Timbre: piano/campana FM con ataques secos.
- Entrada: entre 250 y 700 ms después del fundido de estado; al llegar desde la
  intro, el hall empieza a sonar aproximadamente en un segundo.
- Densidad: frases de siete u ocho notas y ciclos de 10–16 segundos. Quedan
  pausas respirables de unos 2–7 segundos, no vacíos de medio minuto.

La quinta conserva una elegancia reconocible, mientras el Mi bemol evita que
el acorde decida si está en reposo. Los tres temas alternan sin repetirse de
forma consecutiva. En habitaciones y pasillos privados suenan un 18 % más
bajos que en las zonas públicas.

### Investigación

- Tempo: 72 BPM.
- Pulsos alternos: Re–La bemol, Do–Sol y Fa–Si, según la variante.
- Tres células ascendentes incompletas, sin nota de resolución.
- Densidad: cinco a siete pulsos y ciclos de 7–12 segundos.

Entra al escoger un tema, escuchar, inspeccionar, afrontar una tirada o recibir
una pista. Permanece 25 segundos desde la última actividad y después vuelve al
hotel sin afectar al tiempo ficticio.

### Sótanos y Viejo Templo

- Pulso nominal: 61 BPM, sin cuadrícula audible estable.
- Tres pares de pedales incómodos, con pequeños desplazamientos de semitono.
- Timbre: operadores FM ligeramente divergentes y respiración de ruido de
  banda estrecha.
- Densidad: masas de 3–6 segundos dentro de ciclos irregulares de 7,5–13,5
  segundos.

No hay golpe de entrada ni tema del monstruo. El efecto buscado es el de un
chip antiguo forzado a sostener frecuencias que no encajan entre sí.

### Revelación y Cordura

Durante 2,4 segundos, las voces musicales activas se separan hasta ±42 cents,
el filtro se cierra y reaparece, y cuatro notas descienden cromáticamente sobre
ruido filtrado. Se usa ante una pérdida real de Cordura o cuando Edith decide
comprender la revelación de las orejas; apartar la vista no lo dispara.

El Disco Solar no tiene tema final. Mientras la escena permanece abierta usa
el estado de subsuelo y, al cerrar la demo, la música se funde a silencio.

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
daño, pista o éxito, reloj y finalmente cambio de sala. Los cruces de zona
siempre pueden señalarse; dentro de una zona solo suena uno de cada tres
desplazamientos y nunca con menos de veinte segundos entre ellos.

## Integración y recursos

- Un único `AudioContext`, creado después del primer gesto y reutilizado.
- Buses independientes de Música y Efectos, más silencio total.
- Preferencias en `la-broma-macabra.audio.v2`, con migración desde v1.
- Polifonía limitada a doce voces musicales y catorce de efectos.
- Un único temporizador de frase; cada fuente se detiene y desconecta al
  terminar. Al silenciar, ocultar la página o cambiar de estado se cancelan las
  voces que ya no sirven.
- `render_game_to_text()` expone estado del contexto, tema activo, número de
  frases, voces y siguiente espera para las pruebas de navegador.

Todo este material musical y sonoro fue compuesto para el prototipo y se
distribuye como parte de su código fuente. No deriva de melodías, arreglos ni
archivos de audio preexistentes.
