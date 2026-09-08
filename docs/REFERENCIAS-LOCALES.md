# Referencias locales de producción

Este proyecto separa el código publicable de las referencias necesarias para adaptar el módulo. Los archivos de esta página existen en la carpeta de producción local, pero no viajan con un clon de GitHub.

## Inventario

| Ruta local | Uso permitido durante el desarrollo | En GitHub |
| --- | --- | --- |
| `pdfcoffee.com_la-broma-macabra-5-pdf-free.pdf` | Comprobar hechos, cronología, personajes, lugares y tono | No |
| `art/raw/*.png` | Localizar páginas e ilustraciones de referencia | No |
| copia previa de `public/art/*.png` | Identificar qué imagen temporal sustituía cada recurso y comparar cobertura | No |
| `art/contacto.png` | Revisar de un vistazo el paquete temporal | No |
| `art/ega_preview.png` | Referencia técnica de paleta y reducción | No |
| `tools/crops.csv` | Mapa versionado entre páginas, recortes e identificadores del juego | Sí |

Las imágenes temporales se pueden observar para conservar la gramática general del prototipo —paleta, densidad, legibilidad y función narrativa—, pero no se deben calcar sus personajes, encuadres o composición. La sustitución final debe ser original.

## Comprobación previa

En PowerShell:

```powershell
$required = @(
  'pdfcoffee.com_la-broma-macabra-5-pdf-free.pdf',
  'art/raw',
  'public/art',
  'art/contacto.png',
  'art/ega_preview.png',
  'tools/crops.csv'
)
$required | ForEach-Object {
  [PSCustomObject]@{ Path = $_; Available = Test-Path -LiteralPath $_ }
}
```

La auditoría del 8 de septiembre de 2026 se realizó con el paquete completo
disponible y quedó cerrada antes de sustituir los PNG públicos. Una sesión
futura que quiera repetir la comparación necesita conservar una copia local
separada de aquellos temporales; `public/art/` contiene desde entonces los
originales aprobados. Una sesión basada solo en GitHub puede validar el paquete
final, pero no rehacer la comparación histórica.

## Por qué no lo resuelve `.gitignore`

`.gitignore` significa «no incluir estos archivos en los commits». No es almacenamiento privado ni una forma de subir archivos ocultos. `git add -f` o Git LFS permitirían publicarlos, pero seguirían siendo accesibles a quienes puedan leer el repositorio; LFS solo cambia cómo se almacenan los archivos grandes.

Para una sesión remota que necesite las referencias hay tres opciones:

1. Ejecutarla sobre esta carpeta local completa.
2. Adjuntar o montar temporalmente una copia obtenida legalmente para esa sesión.
3. Usar un almacén privado separado con acceso controlado, si se dispone de los derechos necesarios.

No debe copiarse el paquete de referencias al repositorio público. Las
exclusiones individuales se retiraron cuando los sustitutos originales fueron
validados; el PDF, `art/raw/`, `art/contacto.png`, `art/ega_preview.png`, los
maestros pesados y las comparativas siguen ignorados.
