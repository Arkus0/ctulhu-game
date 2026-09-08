"""
Reduce un render maestro a una lamina EGA de 320x152 con tramado Bayer.

Este es el segundo paso del pipeline de arte original:

    imagegen o art/src/<id>.svg  -->  art/master/<id>.png  --ega.py-->  public/art/<id>.png

La diferencia con `quantize.py` (que cocinaba recortes del PDF) es el tramado.
Floyd-Steinberg reparte el error a los vecinos y sobre una fotografia produce
grano y, sobre masas planas, produce sal y pimienta, que es justo lo que la
direccion artistica prohibe. Aqui se usa una matriz Bayer 4x4 ordenada: el
patron es regular, se repite, y a 320x152 se lee como el tramado deliberado de
una aventura de finales de los ochenta.

Uso:
    python tools/ega.py                      # todos los maestros
    python tools/ega.py terraza              # solo ese
    python tools/ega.py --retrato edith      # formato de retrato, 72x96
    python tools/ega.py --hoja edith         # hoja de continuidad, 320x152
    python tools/ega.py terraza --floyd      # solo para comparar; nunca para finales
"""
import os
import sys

from PIL import Image

from quantize import EGA, preparar

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAESTROS = os.path.join(RAIZ, 'art', 'master')
SALIDA = os.path.join(RAIZ, 'public', 'art')

FONDO = (320, 152)
RETRATO = (72, 96)

# Matriz de Bayer 4x4, la misma que usa el fondo procedimental de src/ui/art.ts.
BAYER = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
]

# Cuanto se desplaza un pixel antes de buscar su tinta mas cercana. Con la
# paleta EGA los saltos entre tintas contiguas son de 0x55, asi que un empujon
# de +-40 mezcla las dos vecinas sin llegar a inventarse una tercera.
DISPERSION = 80


def encajar(img, tamano):
    """Reescala llenando el marco y devuelve tambien el recorte reproducible."""
    ancho, alto = tamano
    objetivo = ancho / alto
    actual = img.width / img.height
    if actual > objetivo:
        nuevo_ancho = int(img.height * objetivo)
        x = (img.width - nuevo_ancho) // 2
        caja = (x, 0, x + nuevo_ancho, img.height)
        img = img.crop(caja)
    elif actual < objetivo:
        nuevo_alto = int(img.width / objetivo)
        y = (img.height - nuevo_alto) // 2
        caja = (0, y, img.width, y + nuevo_alto)
        img = img.crop(caja)
    else:
        caja = (0, 0, img.width, img.height)
    return img.resize(tamano, Image.LANCZOS), caja


def tinta_mas_cercana(r, g, b, paleta=EGA):
    """Indice de la tinta de la paleta mas proxima, por distancia euclidea."""
    mejor, mejor_d = 0, None
    for i, (pr, pg, pb) in enumerate(paleta):
        d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2
        if mejor_d is None or d < mejor_d:
            mejor, mejor_d = i, d
    return mejor


def tramar(img, paleta=EGA, dispersion=DISPERSION):
    """
    Cuantiza a la paleta con tramado ordenado.

    A cada pixel se le suma un desplazamiento que depende solo de su posicion
    en la matriz de Bayer. Dos zonas planas de color intermedio acaban, por
    tanto, con el mismo patron de puntos, y no con ruido distinto en cada una:
    eso es lo que hace que el tramado parezca dibujado y no fotografiado.
    """
    ancho, alto = img.size
    fuente = img.load()
    salida = Image.new('P', (ancho, alto))

    plano = []
    for c in paleta:
        plano.extend(c)
    plano.extend([0, 0, 0] * (256 - len(paleta)))
    salida.putpalette(plano)
    destino = salida.load()

    cache = {}
    for y in range(alto):
        fila = BAYER[y & 3]
        for x in range(ancho):
            r, g, b = fuente[x, y][:3]
            ajuste = int((fila[x & 3] / 16 - 0.5) * dispersion)
            clave = (
                min(255, max(0, r + ajuste)),
                min(255, max(0, g + ajuste)),
                min(255, max(0, b + ajuste)),
            )
            tinta = cache.get(clave)
            if tinta is None:
                tinta = tinta_mas_cercana(*clave, paleta=paleta)
                cache[clave] = tinta
            destino[x, y] = tinta

    return salida


def difundir(img, paleta=EGA):
    """
    Cuantiza con difusion de error (Floyd-Steinberg), como `quantize.py`.

    Sobre un dibujo de masas planas esto produce sal y pimienta y por eso el
    tramado ordenado es mejor ahi. Pero sobre una composicion modelada con
    degradados, luz y textura, la difusion es justo lo que da el grano de las
    laminas pintadas de finales de los ochenta: el error se reparte y aparecen
    medios tonos que la paleta no tiene.
    """
    plano = []
    for c in paleta:
        plano.extend(c)
    plano.extend([0, 0, 0] * (256 - len(paleta)))
    referencia = Image.new('P', (1, 1))
    referencia.putpalette(plano)
    return img.quantize(palette=referencia, dither=Image.Dither.FLOYDSTEINBERG)


def cocinar(origen, destino, tamano=FONDO, tramado='bayer', contraste=1.0, saturacion=1.0, brillo=1.0):
    img = Image.open(origen).convert('RGB')
    img, caja = encajar(img, tamano)
    if (contraste, saturacion, brillo) != (1.0, 1.0, 1.0):
        img = preparar(img, contraste=contraste, saturacion=saturacion, brillo=brillo)
    salida = difundir(img) if tramado == 'fs' else tramar(img)
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    salida.save(destino, optimize=True)
    return salida, caja


def procesar(solo=None, modo='fondo', tramado='bayer'):
    if not os.path.isdir(MAESTROS):
        raise SystemExit('Falta %s (ejecuta antes tools/render_art.mjs)' % MAESTROS)

    tamano = RETRATO if modo == 'retrato' else FONDO
    subcarpeta = {'retrato': 'retratos', 'hoja': 'hojas'}.get(modo, '')
    prefijo = {'retrato': 'retrato_', 'hoja': 'hoja_'}.get(modo)

    hechas = 0
    for nombre in sorted(os.listdir(MAESTROS)):
        if not nombre.endswith('.png'):
            continue
        base = nombre[:-4]
        if base.endswith('_draft'):
            continue
        if prefijo:
            if not base.startswith(prefijo):
                continue
            limpio = base[len(prefijo):]
        else:
            if base.startswith(('retrato_', 'hoja_')):
                continue
            limpio = base
        if solo and limpio != solo:
            continue

        destino = os.path.join(SALIDA, subcarpeta, limpio + '.png')
        _, caja = cocinar(os.path.join(MAESTROS, nombre), destino, tamano, tramado)
        peso = os.path.getsize(destino)
        hechas += 1
        recorte = '%d,%d,%d,%d' % caja
        print('  %-32s -> %s (%d bytes; crop %s)' %
              (nombre, os.path.relpath(destino, RAIZ), peso, recorte))

    print('\n%d laminas cocinadas' % hechas)


if __name__ == '__main__':
    args = list(sys.argv[1:])
    modo = 'fondo'
    if '--retrato' in args:
        modo = 'retrato'
        args.remove('--retrato')
    if '--hoja' in args:
        if modo != 'fondo':
            raise SystemExit('Elige solo uno: --retrato o --hoja')
        modo = 'hoja'
        args.remove('--hoja')
    # Bayer es obligatorio por defecto para los finales. Floyd queda disponible
    # solo como comparativa explicita de desarrollo.
    tramado = 'fs' if '--floyd' in args else 'bayer'
    if '--floyd' in args:
        args.remove('--floyd')
    if '--bayer' in args:  # compatibilidad con comandos antiguos
        args.remove('--bayer')
    procesar(args[0] if args else None, modo, tramado)
