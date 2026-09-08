"""
Control de calidad del paquete de arte.

Comprueba lo que un ojo humano no ve de un vistazo y una prueba automatica si:
tamano exacto, ninguna tinta fuera de la paleta EGA, ausencia de canal alfa,
peso razonable, y correspondencia entre el manifiesto, los ficheros de
`public/art` y los identificadores `art` que el contenido usa de verdad.

Salida distinta de cero si algo esta mal, para poder encadenarlo en un script.

Uso:
    python tools/check_art.py
"""
import csv
import json
import os
import sys

from PIL import Image

from quantize import EGA

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLICO = os.path.join(RAIZ, 'public', 'art')
RETRATOS = os.path.join(PUBLICO, 'retratos')
HOJAS = os.path.join(PUBLICO, 'hojas')
MANIFIESTO = os.path.join(RAIZ, 'art', 'manifest.csv')
CONTENIDO = os.path.join(RAIZ, 'src', 'content')

TAMANOS = {
    'fondo': (320, 152),
    'escena': (320, 152),
    'mapa': (320, 152),
    'retrato': (72, 96),
    'hoja': (320, 152),
}
PESO_MAXIMO = 40 * 1024
LISTOS = {'generado', 'revisado', 'aprobado'}


def cargar(ruta):
    with open(ruta, encoding='utf-8') as f:
        return json.load(f)


def arte_usado():
    """Identificadores `art` que el contenido referencia realmente."""
    usados = {}

    for loc in cargar(os.path.join(CONTENIDO, 'locations.json')):
        for nombre in [loc.get('art')] + [v.get('art') for v in loc.get('variants', [])]:
            if nombre:
                usados.setdefault(nombre, []).append('localizacion %s' % loc['id'])

    for escena in cargar(os.path.join(CONTENIDO, 'scenes.json')):
        if escena.get('art'):
            usados.setdefault(escena['art'], []).append('escena %s' % escena['id'])

    for evento in cargar(os.path.join(CONTENIDO, 'events', 'day1.json')):
        if evento.get('art'):
            usados.setdefault(evento['art'], []).append('evento %s' % evento['id'])

    mapas = cargar(os.path.join(CONTENIDO, 'map_art.json'))
    usados.setdefault(mapas['default'], []).append('mapa por defecto')
    for regla in mapas.get('rules', []):
        usados.setdefault(regla['art'], []).append('mapa plantas %s' % ','.join(regla['floors']))

    # Los informes viven en TypeScript porque sus tiradas y ventanas tambien
    # forman parte del motor. Extraemos solo el campo declarativo, sin mantener
    # una segunda lista de identificadores en este comprobador.
    with open(os.path.join(RAIZ, 'src', 'engine', 'adventure.ts'), encoding='utf-8') as f:
        import re
        for nombre in re.findall(r"reportArt:\s*'([^']+)'", f.read()):
            usados.setdefault(nombre, []).append('informe de companero')

    return usados


def retratos_usados():
    """Retratos que declaran las fichas de PNJ e investigadores."""
    usados = {}
    for npc in cargar(os.path.join(CONTENIDO, 'npcs.json')):
        if npc.get('portrait'):
            usados.setdefault(npc['portrait'], []).append('pnj %s' % npc['id'])
    for inv in cargar(os.path.join(CONTENIDO, 'investigators.json')):
        if inv.get('portrait'):
            usados.setdefault(inv['portrait'], []).append('investigador %s' % inv['id'])
    return usados


def revisar_imagen(ruta, tipo, problemas):
    esperado = TAMANOS[tipo]
    img = Image.open(ruta)

    if img.size != esperado:
        problemas.append('%s mide %dx%d y deberia medir %dx%d'
                         % (os.path.basename(ruta), img.width, img.height, *esperado))

    if 'A' in img.getbands() or img.mode in ('RGBA', 'LA'):
        problemas.append('%s tiene canal alfa; las laminas deben ser opacas'
                         % os.path.basename(ruta))

    fuera = set()
    for color in img.convert('RGB').getcolors(maxcolors=1 << 20) or []:
        if color[1] not in EGA:
            fuera.add(color[1])
    if fuera:
        muestra = ', '.join('#%02x%02x%02x' % c for c in sorted(fuera)[:4])
        problemas.append('%s usa %d tinta(s) fuera de la paleta EGA: %s'
                         % (os.path.basename(ruta), len(fuera), muestra))

    peso = os.path.getsize(ruta)
    if peso > PESO_MAXIMO:
        problemas.append('%s pesa %d bytes; el objetivo es menos de %d'
                         % (os.path.basename(ruta), peso, PESO_MAXIMO))


def main():
    problemas = []
    avisos = []

    if not os.path.exists(MANIFIESTO):
        raise SystemExit('Falta %s' % MANIFIESTO)

    filas = [f for f in csv.DictReader(open(MANIFIESTO, encoding='utf-8')) if f.get('archivo')]
    declarados = {}
    for fila in filas:
        tipo = fila['tipo']
        if tipo not in TAMANOS:
            problemas.append('El manifiesto declara el tipo desconocido "%s" en %s' % (tipo, fila['archivo']))
            continue
        declarados[(tipo, fila['archivo'])] = fila

        carpeta = {'retrato': RETRATOS, 'hoja': HOJAS}.get(tipo, PUBLICO)
        ruta = os.path.join(carpeta, fila['archivo'] + '.png')
        listo = fila['estado'] in LISTOS

        if listo and not os.path.exists(ruta):
            problemas.append('%s figura como "%s" pero no existe %s'
                             % (fila['archivo'], fila['estado'], os.path.relpath(ruta, RAIZ)))
        elif listo:
            revisar_imagen(ruta, tipo, problemas)
        elif os.path.exists(ruta):
            avisos.append('%s existe pero el manifiesto lo da por pendiente' % fila['archivo'])

    # Lo que el contenido pide y el manifiesto no contempla.
    usados = arte_usado()
    nombres = {f['archivo'] for f in filas}
    for nombre, donde in sorted(usados.items()):
        if nombre not in nombres:
            problemas.append('El contenido usa "%s" (%s) y no esta en el manifiesto'
                             % (nombre, donde[0]))
        elif not os.path.exists(os.path.join(PUBLICO, nombre + '.png')):
            avisos.append('"%s" (%s) todavia cae en el fondo procedimental'
                          % (nombre, donde[0]))

    # Retratos declarados por las fichas. Son decenas y todavia faltan casi
    # todos, asi que se resumen en una linea en vez de inundar la salida.
    faltan = [n for n in sorted(retratos_usados()) if not os.path.exists(os.path.join(RETRATOS, n + '.png'))]
    if faltan:
        avisos.append('faltan %d retratos declarados en las fichas: %s%s'
                      % (len(faltan), ', '.join(faltan[:6]), '...' if len(faltan) > 6 else ''))

    # Ficheros publicados que ya no referencia nadie.
    if os.path.isdir(PUBLICO):
        for fichero in sorted(os.listdir(PUBLICO)):
            if not fichero.endswith('.png'):
                continue
            nombre = fichero[:-4]
            if nombre not in usados and nombre not in nombres:
                avisos.append('%s esta publicado y no lo usa nadie' % fichero)

    for aviso in avisos:
        print('  aviso   %s' % aviso)
    for problema in problemas:
        print('  ERROR   %s' % problema)

    hechas = sum(1 for f in filas if f['estado'] in LISTOS)
    print('\n%d/%d laminas listas, %d aviso(s), %d error(es)'
          % (hechas, len(filas), len(avisos), len(problemas)))
    return 1 if problemas else 0


if __name__ == '__main__':
    sys.exit(main())
