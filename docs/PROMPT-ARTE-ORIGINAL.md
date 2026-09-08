# Prompt para sustituir el arte por imágenes originales

Copia el bloque siguiente en una nueva sesión de Codex con generación de imágenes disponible:

```text
Sustituye el arte temporal de «La Broma Macabra» por un paquete visual completamente original y crea las escenas nuevas que necesita la demo 09:00–13:00.

Usa la skill imagegen para generar y editar imágenes. Antes de generar nada, lee completos:
- docs/DIRECCION-DE-DISENO.md
- progress.md
- src/ui/art.ts
- src/content/locations.json
- src/content/events/day1.json
- tools/crops.csv únicamente como inventario de nombres antiguos

Puedes consultar el PDF para hechos históricos, vestuario, arquitectura, personajes y tono narrativo. No calques, recortes, recompongas ni imites de cerca sus ilustraciones. No reutilices sus encuadres, poses o diseños reconocibles. El resultado debe ser una interpretación nueva del Hotel Shepheard’s y del Cairo de 1922.

Dirección artística:
- aventura gráfica de PC de finales de los años ochenta;
- resolución final exacta 320×152, formato panorámico 40:19;
- paleta EGA estricta de 16 colores: #000000, #0000aa, #00aa00, #00aaaa, #aa0000, #aa00aa, #aa5500, #aaaaaa, #555555, #5555ff, #55ff55, #55ffff, #ff5555, #ff55ff, #ffff55, #ffffff;
- píxel cuadrado, bordes duros, sin suavizado;
- tramado Bayer o manual coherente, sin ruido fotográfico;
- masas grandes y siluetas legibles antes que detalle diminuto;
- iluminación teatral, con un foco narrativo principal;
- nada de texto incrustado, marcos, logotipos, firmas ni interfaz;
- reserva zonas tranquilas en la esquina inferior izquierda y superior derecha para los rótulos del juego;
- rigor básico en arquitectura, mobiliario y ropa de 1922; nada moderno.

No pidas al generador que produzca píxel perfecto directamente como único paso. Genera una composición maestra original a mayor resolución, corrige anatomía y continuidad, recorta a 40:19 y después reduce y cuantiza mediante un pipeline reproducible. Verifica manualmente el resultado final de 320×152.

Fase 1. Auditoría y biblia visual
- Inventaría todos los valores `art` usados por localizaciones y escenas.
- Crea docs/ART-BIBLE.md con paleta, tramado, luz por franja horaria, escala de personajes, vestuario y reglas de continuidad.
- Crea un manifiesto JSON o CSV con nombre de archivo, uso, hora, personajes, foco y estado: pendiente, generado, revisado o aprobado.
- Identifica qué fondos genéricos se reutilizan demasiado y qué escenas necesitan composición propia.

Fase 2. Diseños consistentes de personajes
- Define hojas originales para Edith Harker, Nadia Farouk, Samuel Vance, Behler, Carter, Weder, Mahadni, Olga, Dieter y Gasparini.
- Mantén constantes rostro, complexión, peinado, ropa y colores identificativos.
- Evita parecidos con actores reales o retratos del PDF.
- Genera retratos verticales compatibles con el panel de conversación y versiones de cuerpo entero o medio cuerpo para escenas.

Fase 3. Fondos de localización
- Sustituye, como mínimo: recepcion, terraza, restaurante, cocina, correos, bar_largo, salon_isis, jardin, pasillo, habitacion, sotano_almacen, sotano_pasillo, sotano_palacio, sotano_escombros y viejo_templo.
- Crea también los fondos aún ausentes pero referenciados: salon_baile, tienda_joyas, tienda_cigarros, tienda_moda_caballeros, tienda_moda_mujer, tienda_relojes y tienda_suvenires.
- Cada lugar debe reconocerse solo por su silueta y distribución de luz.
- El sótano debe ser legible, no una mancha negra. Separa suelo, salida, peligro y objeto interactivo.
- Redibuja mapas propios, esquemáticos y funcionales; no copies los planos publicados.

Fase 4. Ilustraciones de escena para la demo
- Llegada al hall: Edith, Nadia y Vance frente al mostrador, con el león como detalle secundario y Clinton dominando la recepción.
- Registro de los Lounpeen: Dieter rígido, Olga explorando el hall con la mirada.
- Reunión con Behler: mesa para cuatro, calor visible, pañuelo bordado y tensión contenida.
- Carter y Weder: segunda mesa, conversación conspirativa, diferencia clara entre nerviosismo y falsa cordialidad.
- Weder cruza la cocina: Mahadni abandona el cuchillo y abre la ruta de servicio.
- Umbral del sótano: los investigadores ante una escalera demasiado antigua para el hotel.
- Las orejas: horror sugerido mediante manos, sombra y reacción humana; evita mostrar gore gratuito.
- Revelación del Disco Solar: Weder levanta el objeto, Mahadni vigila, salida visible y segundos para actuar.
- Tres cierres: Weder se lo lleva, Edith conserva el disco y Weder se retira ante la autorización.
- Informes de Nadia y Vance: composiciones pequeñas reutilizables que hagan sentir el reencuentro.

Añade soporte de `SceneView.art` o un equivalente basado en datos para que una escena pueda sustituir temporalmente el fondo de la localización. No codifiques nombres de escenas en la interfaz.

Fase 5. Integración
- Guarda las imágenes finales como public/art/<id>.png.
- Conserva el fallback procedimental para archivos ausentes.
- Presta atención al peso: objetivo menor de 40 KB por fondo de 320×152 cuando sea razonable.
- Añade créditos y una declaración de procedencia original en LICENSE-ART.md.
- Elimina del paquete público todos los recortes derivados del PDF cuando su sustituto esté aprobado.
- No borres una referencia hasta verificar que ya no se usa.

Fase 6. Control de calidad
- Genera una hoja de contacto con todos los fondos y otra con personajes.
- Comprueba continuidad de personajes entre escenas.
- Verifica dimensiones exactas, ausencia de colores fuera de paleta, transparencia accidental y nombres huérfanos.
- Ejecuta npm test y npm run build.
- Recorre la demo con el cliente Playwright y captura hall, terraza, sótano, Disco Solar, un diálogo y un panel móvil.
- Abre e inspecciona cada captura. Corrige contraste, recorte y legibilidad antes de aprobarla.
- Actualiza progress.md y el manifiesto de arte.

Entrega el paquete completo, no una sola imagen de muestra. Si el tiempo obliga a trabajar por lotes, termina y valida un lote coherente antes de iniciar el siguiente: protagonistas, localizaciones diurnas, sótano y escenas críticas.
```
