"""
Convierte un recorte de una lamina a una imagen EGA de 320x152 con tramado.

El destino es el aspecto Sierra de finales de los 80 (King's Quest IV, Larry 2
y 3): 320x200 de pantalla completa, dieciseis tintas fijas y mucho tramado
Floyd-Steinberg. Bajar de ~900 px a 320 es una reduccion brutal, y eso juega a
favor: se come el ruido del escaneo y deja el grano correcto.

Detalle que importa: cuantizar directamente a EGA sale turbio, porque la paleta
tiene solo tres niveles por canal y las pinturas del libro son oscuras y poco
saturadas. Por eso antes se sube contraste y saturacion, y se aclara un poco.
Sin ese paso previo, todo acaba en negro y gris oscuro.

Uso:
    python tools/quantize.py                  # procesa crops.csv entero
    python tools/quantize.py terraza          # solo esa entrada
    python tools/quantize.py --paleta cpc     # modo Amstrad en vez de EGA
"""
import csv
import os
import sys

from PIL import Image, ImageEnhance

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CRUDO = os.path.join(RAIZ, 'art', 'raw')
CROPS = os.path.join(RAIZ, 'tools', 'crops.csv')
SALIDA = os.path.join(RAIZ, 'public', 'art')

ANCHO, ALTO = 320, 152

# Paleta EGA de 16 tintas: la de King's Quest y Leisure Suit Larry.
EGA = [
    (0x00, 0x00, 0x00), (0x00, 0x00, 0xAA), (0x00, 0xAA, 0x00), (0x00, 0xAA, 0xAA),
    (0xAA, 0x00, 0x00), (0xAA, 0x00, 0xAA), (0xAA, 0x55, 0x00), (0xAA, 0xAA, 0xAA),
    (0x55, 0x55, 0x55), (0x55, 0x55, 0xFF), (0x55, 0xFF, 0x55), (0x55, 0xFF, 0xFF),
    (0xFF, 0x55, 0x55), (0xFF, 0x55, 0xFF), (0xFF, 0xFF, 0x55), (0xFF, 0xFF, 0xFF),
]

# Amstrad CPC modo 0: 16 tintas de una paleta de 27, mas terrosa y apagada.
CPC = [
    (0x00, 0x00, 0x00), (0x00, 0x00, 0x80), (0x00, 0x00, 0xFF), (0x80, 0x00, 0x00),
    (0x80, 0x00, 0x80), (0x80, 0x80, 0x00), (0xFF, 0x00, 0x00), (0xFF, 0x00, 0x80),
    (0x00, 0x80, 0x00), (0x00, 0x80, 0x80), (0x00, 0xFF, 0x00), (0x80, 0x80, 0x80),
    (0xFF, 0x80, 0x00), (0xFF, 0x80, 0x80), (0xFF, 0xFF, 0x00), (0xFF, 0xFF, 0xFF),
]

PALETAS = {'ega': EGA, 'cpc': CPC}


def imagen_paleta(colores):
    """Imagen de un pixel por tinta, que es lo que PIL espera como paleta."""
    p = Image.new('P', (1, 1))
    plano = []
    for c in colores:
        plano.extend(c)
    plano.extend([0, 0, 0] * (256 - len(colores)))
    p.putpalette(plano)
    return p


def preparar(img, contraste=1.18, saturacion=1.12, brillo=1.0):
    """
    Sube contraste, saturacion y brillo antes de cuantizar.

    Las laminas del libro son oscuras y terrosas. La paleta EGA no tiene medios
    tonos: o hay color o no lo hay. Si no se empuja antes, el resultado es una
    mancha negra con cuatro pixeles grises.
    """
    img = ImageEnhance.Color(img).enhance(saturacion)
    img = ImageEnhance.Contrast(img).enhance(contraste)
    img = ImageEnhance.Brightness(img).enhance(brillo)
    return img


def encajar(img, ancho=ANCHO, alto=ALTO):
    """Reescala llenando el marco y recorta lo que sobra, centrado."""
    objetivo = ancho / alto
    actual = img.width / img.height
    if actual > objetivo:
        nuevo_ancho = int(img.height * objetivo)
        x = (img.width - nuevo_ancho) // 2
        img = img.crop((x, 0, x + nuevo_ancho, img.height))
    else:
        nuevo_alto = int(img.width / objetivo)
        y = (img.height - nuevo_alto) // 2
        img = img.crop((0, y, img.width, y + nuevo_alto))
    return img.resize((ancho, alto), Image.LANCZOS)


def cocinar(origen, destino, caja=None, paleta='ega', **ajustes):
    img = Image.open(origen).convert('RGB')
    if caja:
        img = img.crop(caja)
    img = encajar(preparar(img, **ajustes))

    pal = imagen_paleta(PALETAS[paleta])
    salida = img.quantize(palette=pal, dither=Image.Dither.FLOYDSTEINBERG)

    os.makedirs(os.path.dirname(destino), exist_ok=True)
    salida.save(destino, optimize=True)
    return salida


def procesar(solo=None, paleta='ega'):
    if not os.path.exists(CROPS):
        raise SystemExit('Falta %s' % CROPS)

    hechas = 0
    with open(CROPS, encoding='utf-8') as f:
        for fila in csv.DictReader(f):
            if not fila.get('nombre') or fila['nombre'].startswith('#'):
                continue
            if solo and fila['nombre'] != solo:
                continue

            origen = os.path.join(CRUDO, 'p%03d.png' % int(fila['pagina']))
            if not os.path.exists(origen):
                print('  falta %s (ejecuta extract_pages.py %s)' % (origen, fila['pagina']))
                continue

            caja = None
            if fila.get('x'):
                x, y = int(fila['x']), int(fila['y'])
                caja = (x, y, x + int(fila['w']), y + int(fila['h']))

            ajustes = {}
            for clave in ('contraste', 'saturacion', 'brillo'):
                if fila.get(clave):
                    ajustes[clave] = float(fila[clave])

            destino = os.path.join(SALIDA, fila['nombre'] + '.png')
            cocinar(origen, destino, caja, paleta, **ajustes)
            hechas += 1
            print('  p%03s -> %s.png' % (fila['pagina'], fila['nombre']))

    print('\n%d laminas cocinadas en %s' % (hechas, SALIDA))


if __name__ == '__main__':
    args = [a for a in sys.argv[1:]]
    paleta = 'ega'
    if '--paleta' in args:
        i = args.index('--paleta')
        paleta = args[i + 1]
        del args[i:i + 2]
    procesar(args[0] if args else None, paleta)
