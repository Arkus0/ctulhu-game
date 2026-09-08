"""
Vuelca las paginas del PDF a PNG en art/raw/.

El PDF es un escaneo: cada pagina es UNA sola imagen con texto e ilustracion
juntos, asi que esto es solo el primer paso. Despues hay que recortar la zona
de la ilustracion (crops.csv) y cuantizar a EGA (quantize.py).

Uso:
    python tools/extract_pages.py                # todas
    python tools/extract_pages.py 3 5 6 40 41    # solo esas
"""
import io
import os
import sys

import pypdf
from PIL import Image

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF = os.path.join(RAIZ, 'pdfcoffee.com_la-broma-macabra-5-pdf-free.pdf')
SALIDA = os.path.join(RAIZ, 'art', 'raw')


def extraer(paginas=None):
    if not os.path.exists(PDF):
        raise SystemExit('No encuentro el PDF en %s' % PDF)

    os.makedirs(SALIDA, exist_ok=True)
    lector = pypdf.PdfReader(PDF)
    total = len(lector.pages)
    objetivo = paginas or range(1, total + 1)

    hechas = 0
    for n in objetivo:
        if n < 1 or n > total:
            print('  aviso: la pagina %d no existe (el PDF tiene %d)' % (n, total))
            continue
        pagina = lector.pages[n - 1]
        imagenes = list(pagina.images)
        if not imagenes:
            print('  pagina %3d: sin imagen embebida' % n)
            continue

        # Nos quedamos con la mas grande: es el escaneo de la pagina entera.
        mayor = max(imagenes, key=lambda im: len(im.data))
        img = Image.open(io.BytesIO(mayor.data)).convert('RGB')
        destino = os.path.join(SALIDA, 'p%03d.png' % n)
        img.save(destino)
        hechas += 1
        print('  pagina %3d -> %s  (%dx%d)' % (n, os.path.basename(destino), img.width, img.height))

    print('\n%d paginas volcadas en %s' % (hechas, SALIDA))


if __name__ == '__main__':
    args = [int(a) for a in sys.argv[1:] if a.isdigit()]
    extraer(args or None)
