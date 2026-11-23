#!/usr/bin/env python3
"""Gera todos os ícones Android a partir de uma imagem.

Uso:
    python3 scripts/generate_icons.py public/assets/fps_crown.png

Troque o argumento pela foto do ícone quando ela estiver disponível para
regenerar legacy, round e adaptive icons com a imagem desejada.
"""

import argparse
from pathlib import Path

from PIL import Image, ImageDraw

RES = Path(__file__).resolve().parents[1] / "android/app/src/main/res"
DENSITIES = {
    "mdpi": (48, 108),
    "hdpi": (72, 162),
    "xhdpi": (96, 216),
    "xxhdpi": (144, 324),
    "xxxhdpi": (192, 432),
}


def fit(source: Image.Image, size: int, fraction: float = 1.0) -> Image.Image:
    box = int(size * fraction)
    src = source.copy()
    src.thumbnail((box, box), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(src, ((size - src.width) // 2, (size - src.height) // 2))
    return canvas


def circle_mask(size: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    return mask


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("image", type=Path, help="imagem de origem do ícone")
    parser.add_argument("--background", default="#040102", help="cor de fundo dos ícones")
    args = parser.parse_args()

    source = Image.open(args.image).convert("RGBA")
    background = args.background.lstrip("#")
    bg = tuple(int(background[i : i + 2], 16) for i in (0, 2, 4)) + (255,)

    for density, (legacy_size, fg_size) in DENSITIES.items():
        folder = RES / f"mipmap-{density}"
        folder.mkdir(parents=True, exist_ok=True)

        legacy = fit(source, legacy_size)
        base = Image.new("RGBA", (legacy_size, legacy_size), bg)
        base.alpha_composite(legacy)
        base.convert("RGB").save(folder / "ic_launcher.png", optimize=True)

        round_icon = base.copy()
        round_icon.putalpha(circle_mask(legacy_size))
        round_icon.save(folder / "ic_launcher_round.png", optimize=True)

        fit(source, fg_size, fraction=0.66).save(
            folder / "ic_launcher_foreground.png", optimize=True
        )

    print(f"Ícones gerados em {RES}")


if __name__ == "__main__":
    main()
