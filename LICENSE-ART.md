# Procedencia y licencia del arte

## Declaración de origen

Todas las láminas listadas como originales en `art/manifest.csv` se han creado
para este proyecto. No derivan de ninguna ilustración publicada: no hay calcos,
recortes, reencuadres, filtros ni recomposiciones de material ajeno.

Cada una tiene su fuente vectorial versionada en `art/src/<id>.svg`, escrita a
mano. Cualquiera puede reconstruir el PNG final desde esa fuente con el pipeline
del repositorio, lo que hace la procedencia comprobable y no una simple
afirmación:

```bash
node tools/render_art.mjs <id>
python tools/ega.py <id>
python tools/check_art.py
```

El módulo original de rol y su PDF se han utilizado únicamente como fuente de
hechos —cronología, arquitectura del Hotel Shepheard's, vestuario de 1922,
personajes y tono narrativo—, del mismo modo que se consultaría documentación
histórica. Ninguna imagen del módulo forma parte de este paquete.

## Método

Composición vectorial propia a 1280×608 (retratos a 288×384), renderizada con
Chromium mediante Playwright, reducida a 320×152 (retratos: 72×96) y cuantizada
a la paleta EGA de dieciséis tintas con tramado Bayer 4×4 ordenado. Los criterios
de paleta, luz, composición y continuidad están en `docs/ART-BIBLE.md`.

## Láminas originales incluidas

| Archivo | Fuente | Estado |
| --- | --- | --- |
| `public/art/escena_disco_solar.png` | `art/src/escena_disco_solar.svg` | provisional |
| `public/art/retratos/edith.png` | `art/src/retrato_edith.svg` | provisional |
| `public/art/retratos/clinton.png` | `art/src/retrato_clinton.svg` | provisional |

«Provisional» significa que la lámina es original y publicable, pero que su
calidad de dibujo no alcanza la del material que debe sustituir. Están en el
juego porque cubren huecos donde antes no había absolutamente nada: la escena
del Disco Solar no tenía ilustración propia y no existía ningún retrato.

Los intentos de sustituir `terraza`, `recepcion` y `sotano_palacio` se
descartaron tras compararlos con las láminas del módulo: las fuentes siguen en
`art/src/` como referencia del método, pero el juego vuelve a usar el recorte
temporal, que es mejor. El resto del manifiesto sigue en `pendiente`; ahí el
juego dibuja un fondo EGA procedimental (`src/ui/art.ts`) y es jugable.

## Material temporal que aún no se ha sustituido

Catorce ficheros de `public/art/` siguen siendo recortes del PDF del módulo,
conservados **solo como referencia local de sustitución**. Están excluidos de
Git uno a uno en `.gitignore` y no se distribuyen. `python tools/check_art.py`
los señala en cada ejecución.

Cuando una lámina original los reemplace, hay que retirar su línea de
`.gitignore` y añadirla a la tabla de arriba en el mismo cambio.

## Licencia

Las láminas originales de este paquete y sus fuentes SVG se publican bajo
**CC BY-SA 4.0**, salvo que el titular del repositorio decida otra cosa antes de
la primera distribución pública.

Autoría: proyecto La Broma Macabra. Producidas con asistencia de Claude Code
siguiendo la dirección artística de `docs/ART-BIBLE.md`.

Esta licencia cubre exclusivamente el arte original. No alcanza al módulo de rol
en el que se basa la aventura, cuyos derechos pertenecen a sus autores y
editores.
