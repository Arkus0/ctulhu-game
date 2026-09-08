# Arte de la versión pública

Este directorio contiene el paquete original de la demo 09:00–13:00: fondos,
mapas e ilustraciones de escena a 320×152. `retratos/` contiene bustos a 72×96
y `hojas/` las hojas de continuidad a 320×152.

Todos los PNG son opacos y usan únicamente la paleta EGA de dieciséis tintas
de `src/ui/art.ts`. `art/manifest.csv` es el inventario canónico;
`art/prompts.json`, `docs/ART-BIBLE.md` y `LICENSE-ART.md` documentan método,
continuidad y procedencia.

Si un archivo falta o no se puede cargar, el renderizador conserva el fondo
procedimental EGA y el juego sigue siendo utilizable.
