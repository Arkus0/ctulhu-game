# Procedencia y licencia del arte

## Declaración de origen

Las 58 láminas de `art/manifest.csv` se crearon expresamente para este
proyecto. El paquete final comprende 22 fondos, 2 mapas, 13 ilustraciones de
escena, 11 retratos y 10 hojas de continuidad.

Las composiciones maestras raster, incluidos ambos mapas, se generaron con el
generador de imágenes integrado de Codex a partir de las descripciones
originales versionadas en `art/prompts.json`. Los PNG publicados se obtienen
reduciendo esos maestros y cuantizándolos con `tools/ega.py`.

El PDF del módulo y las imágenes que antiguamente servían de referencia local
se consultaron para hechos históricos, cronología, arquitectura, vestuario y
función narrativa. No se adjuntaron al generador. Ninguna imagen de este
paquete es un calco, recorte, reencuadre, collage, filtro ni recomposición de
una ilustración publicada, y no se conservaron sus poses, encuadres o diseños
reconocibles.

## Método verificable

1. Generación maestra a alta resolución, una petición independiente por
   activo, usando la dirección común y las fichas de `art/prompts.json`.
2. Revisión de anatomía, continuidad, arquitectura de 1922, foco narrativo y
   composición 40:19. `escena_disco_solar` recibió una edición dirigida para
   bajar el objeto, mantener la salida y situar la acción dentro del templo.
3. Recorte centrado, reducción LANCZOS a 320×152 (retratos: 72×96) y
   cuantización opaca a la paleta EGA estricta con Bayer 4×4.
4. Verificación automatizada con `tools/check_art.py` y revisión visual en
   hojas de contacto y dentro del cliente.

Los maestros generados permanecen localmente en `art/master/` y se excluyen de
Git por tamaño. El conjunto de instrucciones, el pipeline y todos los finales
sí quedan versionados. Si falta un final, el juego conserva
su fallback procedimental EGA.

## Sustitución del material temporal

Los PNG temporales derivados del PDF que ocupaban `public/art/` fueron
reemplazados por finales originales después de comprobar sus referencias. Ya
no existe ninguna excepción individual de `public/art/*.png` en `.gitignore`.
El PDF, `art/raw/` y los materiales de comparación permanecen ignorados y no
forman parte del paquete público.

## Licencia

Salvo decisión distinta del titular antes de la primera distribución pública,
las láminas finales y las descripciones originales de este
paquete se publican bajo **CC BY-SA 4.0**.

Autoría: proyecto El Disco Egipcio, producido con asistencia del generador de
imágenes integrado de Codex bajo la dirección artística del repositorio.

Esta licencia cubre exclusivamente el arte original descrito aquí. No alcanza
al módulo de rol consultado como fuente documental, cuyos derechos pertenecen
a sus autores y editores.
