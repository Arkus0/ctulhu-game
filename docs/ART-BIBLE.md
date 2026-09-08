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
| Hoja de continuidad | 320×152 | `public/art/hojas/<id>.png` |

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
mida menos de dos píxeles en la lámina final desaparece: se compone a alta
resolución y se reduce, así que el detalle pequeño nunca sostiene la lectura.
- Profundidad por planos superpuestos y perspectiva, no por degradados. Un
  elemento recortado por el marco en primer término da escala de golpe.
- Las líneas que convergen (toldos, techos, arcadas) se truncan antes del punto
  de fuga. Si llegan al punto, dejan de leerse como objeto y se convierten en un
  estallido de rayos.
- **Zonas tranquilas obligatorias**, porque la interfaz escribe encima:
  - **inferior izquierda**: el rótulo de la localización (`#scene-title`);
  - **superior derecha**: el aviso de decisión crítica y el retrato.
- En una ilustración de escena, el objeto, la cara activa y la salida se
  concentran en los dos tercios inferiores. La situación se lee en la barra
  `OBJETIVO`; la antigua copia superpuesta se retiró al comprobar que ocultaba
  personajes sin aportar información.
- El retrato del interlocutor ocupa la banda derecha durante los diálogos, así
  que un fondo de localización no debe poner nada indispensable ahí.
- Cada lugar debe reconocerse solo por su silueta y su reparto de luz. Si dos
  salas se distinguen únicamente por el mobiliario pequeño, una de las dos está
  mal compuesta.
- El subsuelo debe separar siempre cuatro lecturas: **suelo**, **salida**,
  **peligro** y **objeto con el que se puede interactuar**.

## 6. Escala de personajes

En un fondo de 320×152, una persona de pie en el plano medio mide entre 45 y 60
píxeles de alto; en primer término, hasta 110. En los maestros horizontales
generados (aprox. 1820×864) se conserva esta relación, no una cifra absoluta.

- Los **fondos de localización** llevan figuras ambientales: siluetas simples,
  sin rasgos faciales, uno o dos colores de acento. El sitio manda.
- Las **ilustraciones de escena** llevan a los personajes implicados con cara
  reconocible y su vestuario fijo.
- Los **retratos** son busto a tres cuartos, luz desde la izquierda, sombra dura
  a la derecha y fondo oscuro verde azulado. El mismo esquema para los once,
  para que la serie se lea como una serie.

## 7. Vestuario y continuidad de personajes

El Cairo de 1922. Lino claro y salacot para el europeo de exterior; traje de
tres piezas oscuro para el negocio; galabeya blanca y tarbush granate para el
personal del hotel; librea granate con botonadura dorada para recepción.

Hojas fijadas hasta ahora (no se cambian entre escenas):

| Personaje | Rasgos que no cambian | Colores |
| --- | --- | --- |
| **Edith Harker** | pelo castaño oscuro a lo garçon, cara alargada, cejas rectas, cuaderno siempre a la vista | chaqueta `#0000aa`, blusa `#ffffff`, lazada `#aa0000` |
| **Nadia Farouk** | esbelta, pelo negro ondulado recogido, broche redondo, cartera de notas | vestido `#00aa00`, broche `#ffff55`, sombra `#0000aa` |
| **Samuel Vance** | atlético contenido, pelo castaño hacia atrás, libreta de bolsillo | chaqueta `#aa5500`, camisa `#ffffff`, corbata `#00aa00` |
| **Charles Behler** | ancho, pelo gris escaso, frente sudorosa, pañuelo bordado | traje `#ffffff`/`#aaaaaa`, corbata `#aa0000`, bordado `#00aaaa` |
| **Howard Carter** | delgado, ojos cansados, bigote fino, manos nerviosas | lino `#aa5500`/`#aaaaaa`, sombra `#555555` |
| **Cleveland Clinton** | cuello ancho, mandíbula cuadrada, bigote recortado, llave visible | librea `#aa0000`, botones y galón `#ffff55`, llave `#aaaaaa` |
| **Garth Weder** | alto y rígido, pelo muy claro, gafas redondas | traje `#0000aa`, camisa `#ffffff`, corbata `#aa0000` |
| **Mustafá ibn Mahadni** | corpulento, cabeza rapada, delantal manchado, cuchillo de carnicero | delantal `#aaaaaa` con `#aa0000`, piel `#aa5500` |
| **Olga Lounpeen** | alta, pelo cobrizo ondulado, mentón alto, mirada lateral | vestido `#aa0000`, chal `#00aaaa`, cabello `#aa5500` |
| **Dieter Lounpeen** | muy alto y enjuto, cabello gris severo, postura militar | traje `#aa5500`/`#555555`, chaleco `#ffff55` |
| **Gasparini** | ágil, pelo negro engominado, bigote fino, gesto encantador | chaleco `#000000`, camisa `#ffffff`, pajarita `#aa0000` |

Las diez hojas completas están en `public/art/hojas/`; Clinton tiene retrato y
ancla de continuidad en esta tabla, pero no se pidió hoja completa en este lote.

Ningún personaje debe parecerse a un actor real ni a un retrato del módulo.

## 8. Pipeline

1. `art/prompts.json` combina la dirección común con la descripción de cada
   activo y las anclas de personaje.
2. Imagegen produce una composición maestra grande. Se revisan encuadre,
   anatomía, ropa, foco, salida y zonas tranquilas; la revelación solar recibió
   una edición dirigida antes de aprobar su maestro.
3. El maestro local se guarda en `art/master/` (ignorado por peso). Los mapas
   también parten de maestros raster: maquetas seccionadas con cámara oblicua,
   volúmenes facetados, focos ámbar y recorridos cian; no diagramas de nodos.
4. `tools/ega.py` hace el recorte centrado 40:19, reducción LANCZOS y
   cuantización Bayer a la paleta cerrada. Sus modos son normal, `--retrato` y
   `--hoja`.
5. `tools/check_art.py` valida dimensiones, paleta, opacidad, peso, manifiesto y
   referencias; `tools/contact_art.py` recompone las cinco hojas de contacto.

```bash
python tools/ega.py
python tools/ega.py --retrato
python tools/ega.py --hoja
python tools/check_art.py
python tools/contact_art.py fondos
```

Nunca se pide una lámina «ya pixelada» de un solo golpe: primero la composición
grande, donde se corrigen anatomía, perspectiva y continuidad; la reducción va
después.

## 9. Estado y trazabilidad

`art/manifest.csv` lleva cada lámina con su uso, hora, personajes, foco y
estado: `pendiente`, `generado`, `revisado` o `aprobado`. Una lámina no pasa a
`aprobado` sin haberse mirado a tamaño real dentro del juego.

La auditoría detecta reutilización fuerte en `habitacion` (catorce cuartos),
`correos` (tres despachos) y reutilización doble en `salon_isis`, `cocina` y
`recepcion`. Es aceptable como gramática genérica de navegación, pero nunca
para un giro narrativo: por eso llegada, Lounpeen, Behler, Carter/Weder,
cocina-sótano, umbral, orejas, Disco Solar, tres cierres y dos informes tienen
composición propia.
