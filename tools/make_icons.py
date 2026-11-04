"""Genera le icone dell'estensione in icons/ (richiede Pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "icons"
S = 1024  # disegno ad alta risoluzione, poi ridimensiono


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def draw(simple: bool) -> Image.Image:
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))

    # Sfondo: quadrato arrotondato con gradiente diagonale blu.
    grad = Image.new("RGBA", (S, S))
    top, bottom = (66, 133, 244), (23, 78, 166)
    gd = ImageDraw.Draw(grad)
    for y in range(S):
        gd.line([(0, y), (S, y)], fill=lerp(top, bottom, y / S) + (255,))
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=S * 0.22, fill=255)
    img.paste(grad, (0, 0), mask)

    d = ImageDraw.Draw(img)
    white = (255, 255, 255, 255)

    # Angoli del mirino.
    m, L, w = S * 0.14, S * 0.17, S * (0.07 if simple else 0.05)
    for cx, cy, sx, sy in [(m, m, 1, 1), (S - m, m, -1, 1), (m, S - m, 1, -1), (S - m, S - m, -1, -1)]:
        d.rectangle([min(cx, cx + sx * L), min(cy, cy + sy * w), max(cx, cx + sx * L), max(cy, cy + sy * w)], fill=white)
        d.rectangle([min(cx, cx + sx * w), min(cy, cy + sy * L), max(cx, cx + sx * w), max(cy, cy + sy * L)], fill=white)

    # Pagina lunga con angolo piegato.
    px0, py0, px1, py1 = S * 0.32, S * 0.24, S * 0.68, S * 0.76
    fold = S * 0.10
    d.polygon([(px0, py0), (px1 - fold, py0), (px1, py0 + fold), (px1, py1), (px0, py1)], fill=white)
    d.polygon([(px1 - fold, py0), (px1 - fold, py0 + fold), (px1, py0 + fold)], fill=(200, 216, 245, 255))

    if not simple:
        # Righe di testo sulla pagina.
        line = (66, 133, 244, 255)
        lh = S * 0.028
        x0, x1 = px0 + S * 0.05, px1 - S * 0.05
        for i, y in enumerate([0.36, 0.42, 0.48, 0.54, 0.60]):
            end = x1 - (S * 0.08 if i % 2 else 0)
            d.rounded_rectangle([x0, S * y, end, S * y + lh], radius=lh / 2, fill=line)

        # Sigillo di verifica (hash) in basso a destra.
        r = S * 0.13
        cx, cy = S * 0.70, S * 0.72
        d.ellipse([cx - r - S * 0.02, cy - r - S * 0.02, cx + r + S * 0.02, cy + r + S * 0.02], fill=(23, 78, 166, 255))
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(52, 168, 83, 255))
        d.line([(cx - r * 0.45, cy + r * 0.02), (cx - r * 0.1, cy + r * 0.38), (cx + r * 0.5, cy - r * 0.35)],
               fill=white, width=round(S * 0.04), joint="curve")
    return img


def main():
    OUT.mkdir(exist_ok=True)
    full, simple = draw(False), draw(True)
    for size in (16, 32, 48, 128):
        src = simple if size <= 16 else full
        src.resize((size, size), Image.LANCZOS).save(OUT / f"icon-{size}.png")
    full.resize((512, 512), Image.LANCZOS).save(OUT / "icon-512.png")
    print("icone generate in", OUT)


if __name__ == "__main__":
    main()
