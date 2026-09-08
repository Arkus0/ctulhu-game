# Biblia visual de La Broma Macabra

Referencia de producción del paquete de arte original. Si una lámina nueva
contradice este documento, se discute aquí antes de dibujarla.

El paquete sustituye a las imágenes temporales recortadas del PDF del módulo.
Ninguna lámina nueva calca, recorta ni reencuadra ese material: el PDF se usa
para verificar hechos, arquitectura, vestuario y tono, nunca como plantilla.

## 1. Formato

| Tipo | Tamaño exacto | Carpeta |
| --- | --- | --- |
| Fondo de localización | 320×152 (40:19) | `public/art/<id>.png` |
| Ilustración de escena | 320×152 | `public/art/<id>.png` |
| Mapa | 320×152 | `public/art/<id>.png` |
| Retrato | 72×96 (3:4) | `public/art/retratos/<id>.png` |

Píxel cuadrado, bordes duros, sin suavizado, sin canal alfa. Objetivo de peso:
por debajo de 40 KB; en la práctica una lámina limpia ronda los 4 KB.

## 2. Paleta

Las dieciséis tintas EGA, y ninguna más. Son las mismas que declara
`src/ui/art.ts`, de modo que el arte y el fondo procedimental hablan el mismo
idioma.

```
#000000 negro     #0000aa azul      #00aa00 verde     #00aaaa cian
#aa0000 rojo      #aa00aa magenta   #aa5500 marrón    #aaaaaa gris claro
#555555 gris      #5555ff azul cl.  #55ff55 verde cl. #55ffff cian claro
#ff5555 rojo cl.  #ff55ff magenta c.#ffff55 amarillo  #ffffff blanco
```

Usos habituales:

- **Piedra al sol**: `#ffffff` → `#aaaaaa` → `#555555`.
- **Piedra en penumbra**: `#555555` → `#0000aa` → `#000000`. El negro puro se
  reserva para lo que de verdad es un agujero.
- **Piel**: `#ffffff` / `#ffff55` iluminada, `#aa5500` en sombra.
- **Luz cálida** (sol, farol, el propio Disco): `#ffff55` con núcleo `#ffffff`.
- **Luz fría** (subsuelo, salidas, noche): `#00aaaa` y `#55ffff`.
- **Sangre y librea del hotel**: `#aa0000`.

## 3. Tramado

Bayer 4×4 ordenado, el mismo patrón que usa el renderizador procedimental.
Nunca Floyd-Steinberg: reparte el error por los vecinos y sobre arte vectorial
produce sal y pimienta. El tramado tiene que parecer dibujado, no fotografiado:
dos zonas del mismo tono deben mostrar el mismo patrón de puntos.

## 4. Luz por franja horaria

| Franja | Cielo / ambiente | Sombras | Acento |
| --- | --- | --- | --- |
| Mañana (09:00–12:00) | `#ffffff` con calima `#aaaaaa` | `#555555` largas y duras | `#ffff55` |
| Mediodía | `#ffffff` plano, poco contraste | cortas, casi bajo el objeto | `#ffff55` |
| Tarde | `#aa5500` cálido | `#555555` alargadas | `#ff5555` |
| Noche | `#0000aa` sobre `#000000` | masa | `#ffff55` puntual |
| Subsuelo (sin hora) | `#0000aa` y `#555555` | `#000000` solo en huecos | farol `#ffff55` |

Cada lámina tiene **un** foco narrativo y una sola fuente principal de luz. Si
hay dos, una manda y la otra acompaña.

## 5. Composición

- Masas grandes y siluetas legibles antes que detalle diminuto. Todo lo que
  mida menos de dos píxeles en la lámina final desaparece: se compone a 4× y se
  reduce, así que nada por debajo de 8 px en el maestro.
- Profundidad por planos superpuestos y perspectiva, no por degradados. Un
  elemento recortado por el marco en primer término da escala de golpe.
- Las líneas que convergen (toldos, techos, arcadas) se truncan antes del punto
  de fuga. Si llegan al punto, dejan de leerse como objeto y se convierten en un
  estallido de rayos.
- **Zonas tranquilas obligatorias**, porque la interfaz escribe encima:
  - **inferior izquierda**: el rótulo de la localización (`#scene-title`);
  - **superior derecha**: el aviso de decisión crítica y el retrato.
- **En una ilustración de escena, el tercio superior desaparece.** Mientras la
  escena está abierta, `#scene-summary` cubre la franja de arriba con el texto
  de la situación. Comprobado en el recorrido de control: en la escena del
  Disco Solar el recuadro tapa desde el borde hasta cerca de la mitad. Todo lo
  que haya que ver —el objeto, la cara del que actúa, la salida— va en los dos
  tercios inferiores.
- El retrato del interlocutor ocupa la banda derecha durante los diálogos, así
  que un fondo de localización no debe poner nada indispensable ahí.
- Cada lugar debe reconocerse solo por su silueta y su reparto de luz. Si dos
  salas se distinguen únicamente por el mobiliario pequeño, una de las dos está
  mal compuesta.
- El subsuelo debe separar siempre cuatro lecturas: **suelo**, **salida**,
  **peligro** y **objeto con el que se puede interactuar**.

## 6. Escala de personajes

En un fondo de 320×152, una persona de pie en el plano medio mide entre 45 y 60
píxeles de alto; en primer término, hasta 110. En el maestro de 1280×608 eso son
180–240 px y 440 px respectivamente.

- Los **fondos de localización** llevan figuras ambientales: siluetas simples,
  sin rasgos faciales, uno o dos colores de acento. El sitio manda.
- Las **ilustraciones de escena** llevan a los personajes implicados con cara
  reconocible y su vestuario fijo.
- Los **retratos** son busto, luz desde la izquierda, sombra dura a la derecha y
  fondo tramado de `#00aaaa` a `#000000`. El mismo esquema para los once, para
  que la serie se lea como una serie.

## 7. Vestuario y continuidad de personajes

El Cairo de 1922. Lino claro y salacot para el europeo de exterior; traje de
tres piezas oscuro para el negocio; galabeya blanca y tarbush granate para el
personal del hotel; librea granate con botonadura dorada para recepción.

Hojas fijadas hasta ahora (no se cambian entre escenas):

| Personaje | Rasgos que no cambian | Colores |
| --- | --- | --- |
| **Edith Harker** | pelo castaño oscuro a lo garçon, cara alargada, cejas rectas, cuaderno siempre a la vista | chaqueta `#0000aa`, blusa `#ffffff`, lazada `#aa0000` |
| **Cleveland Clinton** | cuello ancho, mandíbula cuadrada, bigote recortado, calva de la bala junto a la oreja izquierda | librea `#aa0000`, botones y galón `#ffff55`, llave `#aaaaaa` |
| **Garth Weder** | alto y rígido, pelo muy claro, gafas redondas | traje `#0000aa`, camisa `#ffffff`, corbata `#aa0000` |
| **Mustafá ibn Mahadni** | corpulento, cabeza rapada, delantal manchado, cuchillo de carnicero | delantal `#aaaaaa` con `#aa0000`, piel `#aa5500` |

Pendientes de fijar: Nadia Farouk, Samuel Vance, Charles Behler, Howard Carter,
Olga y Dieter Lounpeen, Gasparini. Cada uno necesita rasgo, peinado, silueta y
color identificativo antes de aparecer en ninguna escena.

Ningún personaje debe parecerse a un actor real ni a un retrato del módulo.

## 8. Pipeline

```bash
node tools/render_art.mjs [id]     # art/src/<id>.svg  -> art/master/<id>.png (4x)
python tools/ega.py [id]           # maestro -> public/art/<id>.png (320x152, Bayer)
python tools/ega.py --retrato id   # maestro retrato_<id>.png -> public/art/retratos/<id>.png
python tools/check_art.py          # tamaño, paleta, alfa, peso, huérfanos
```

Se compone en SVG a 1280×608 (retratos: 288×384), se renderiza con el Chromium
de Playwright, se reduce con LANCZOS y se cuantiza con tramado ordenado. La
fuente vectorial se versiona en `art/src/`; los maestros no, porque se
regeneran.

Nunca se pide una lámina «ya pixelada» de un solo golpe: primero la composición
grande, donde se corrigen anatomía, perspectiva y continuidad; la reducción va
después.

## 9. Estado y trazabilidad

`art/manifest.csv` lleva cada lámina con su uso, hora, personajes, foco, origen
y estado: `pendiente`, `generado`, `revisado` o `aprobado`. Una lámina no pasa a
`aprobado` sin haberse mirado a tamaño real dentro del juego.

Reutilizaciones que el manifiesto marca como deuda: `habitacion` sirve a catorce
localizaciones, `correos` a tres, y `salon_isis`, `cocina` y `recepcion` a dos
cada una. Desdoblarlas es trabajo de los siguientes lotes.
