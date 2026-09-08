"""Genera laminas de contacto para la revision visual del paquete EGA."""
from pathlib import Path
import sys

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public" / "art"
QA = ROOT / "art" / "qa"


def files_for(group: str) -> list[Path]:
    if group == "retratos":
        return sorted((PUBLIC / "retratos").glob("*.png"))
    if group == "hojas":
        return sorted((PUBLIC / "hojas").glob("*.png"))
    roots = sorted(PUBLIC.glob("*.png"))
    if group == "escenas":
        return [p for p in roots if p.stem.startswith("escena_")]
    if group == "fondos":
        return [p for p in roots if not p.stem.startswith(("escena_", "mapa_"))]
    if group == "mapas":
        return [p for p in roots if p.stem.startswith("mapa_")]
    raise SystemExit("grupo: fondos | escenas | mapas | retratos | hojas")


def main() -> None:
    group = sys.argv[1] if len(sys.argv) > 1 else "fondos"
    paths = files_for(group)
    if not paths:
        raise SystemExit(f"No hay imagenes para {group}")

    cols = 3 if group not in {"retratos"} else 6
    scale = 2 if group != "retratos" else 3
    label_h = 28
    with Image.open(paths[0]) as first:
        tile_w, tile_h = first.width * scale, first.height * scale + label_h
    rows = (len(paths) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * tile_w, rows * tile_h), "#000000")
    draw = ImageDraw.Draw(sheet)

    for index, path in enumerate(paths):
        with Image.open(path) as image:
            image = image.convert("RGB").resize(
                (image.width * scale, image.height * scale), Image.Resampling.NEAREST
            )
        x = (index % cols) * tile_w
        y = (index // cols) * tile_h
        sheet.paste(image, (x, y))
        draw.text((x + 8, y + image.height + 6), path.stem, fill="#ffffff")

    QA.mkdir(parents=True, exist_ok=True)
    target = QA / f"contacto_{group}.png"
    sheet.save(target, optimize=True)
    print(target.relative_to(ROOT))


if __name__ == "__main__":
    main()
