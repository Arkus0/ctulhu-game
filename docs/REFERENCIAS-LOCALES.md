# Referencias locales de producción

Este proyecto separa el código publicable de las referencias necesarias para adaptar el módulo. Los archivos de esta página existen en la carpeta de producción local, pero no viajan con un clon de GitHub.

## Inventario

| Ruta local | Uso permitido durante el desarrollo | En GitHub |
| --- | --- | --- |
| `pdfcoffee.com_la-broma-macabra-5-pdf-free.pdf` | Comprobar hechos, cronología, personajes, lugares y tono | No |
| `art/raw/*.png` | Localizar páginas e ilustraciones de referencia | No |
| `public/art/*.png` | Identificar qué imagen temporal sustituye cada recurso y comparar cobertura | No |
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
  'tools/crops.csv'
)
$required | ForEach-Object {
  [PSCustomObject]@{ Path = $_; Available = Test-Path -LiteralPath $_ }
}
```

Una sesión con todos los valores en `True` puede contrastar la adaptación y sustituir las imágenes. Una sesión basada solo en GitHub verá únicamente `tools/crops.csv`: puede implementar sistemas o trabajar desde la biblia visual, pero no comparar con el PDF ni certificar que ha reemplazado todo el arte temporal.

## Por qué no lo resuelve `.gitignore`

`.gitignore` significa «no incluir estos archivos en los commits». No es almacenamiento privado ni una forma de subir archivos ocultos. `git add -f` o Git LFS permitirían publicarlos, pero seguirían siendo accesibles a quienes puedan leer el repositorio; LFS solo cambia cómo se almacenan los archivos grandes.

Para una sesión remota que necesite las referencias hay tres opciones:

1. Ejecutarla sobre esta carpeta local completa.
2. Adjuntar o montar temporalmente una copia obtenida legalmente para esa sesión.
3. Usar un almacén privado separado con acceso controlado, si se dispone de los derechos necesarios.

No debe copiarse el paquete de referencias al repositorio público. Los nombres temporales actuales están ignorados de forma individual, de modo que una escena original con un nombre nuevo aparecerá normalmente en Git. Cuando se apruebe un sustituto original que reutilice uno de los nombres ignorados, hay que retirar esa entrada de `.gitignore` en el mismo commit —o añadir el archivo conscientemente con `git add -f`— y documentar su licencia.
