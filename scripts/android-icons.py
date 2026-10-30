# Android launcher icons from build/icon.png (run: uvx --with pillow python scripts/android-icons.py).
# Adaptive icon = the white "AOP" mark (foreground) on the tile's dark color (background);
# legacy icons (API < 26) are the two layers flattened, square and round.
from PIL import Image, ImageDraw

SRC = 'build/icon.png'
RES = 'android/app/src/main/res'
BG = (16, 16, 16, 255)  # the tile's color (#101010), also in values/ic_launcher_background.xml
MARK_BOX = (240, 377, 782, 604)  # "AOP" without the tagline, which is unreadable at launcher size
SAFE = 66 / 108 * 0.92  # the mark's diagonal stays inside the adaptive icon's safe circle
DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}


def mark() -> Image.Image:
    """The bright logo pixels as white with alpha, so it sits on any background."""
    crop = Image.open(SRC).convert('RGB').crop(MARK_BOX)
    lum = crop.convert('L').point(lambda v: max(0, min(255, (v - 40) * 255 // 180)))
    out = Image.new('RGBA', crop.size, (234, 243, 255, 0))
    out.putalpha(lum)
    return out


def foreground(size: int, logo: Image.Image) -> Image.Image:
    w, h = logo.size
    scale = size * SAFE / (w * w + h * h) ** 0.5
    logo = logo.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(logo, ((size - logo.width) // 2, (size - logo.height) // 2))
    return canvas


def legacy(size: int, logo: Image.Image, round_mask: bool) -> Image.Image:
    # Legacy icons get no system mask: draw the mark larger on a shape of our own.
    flat = Image.new('RGBA', (size, size), BG)
    flat.alpha_composite(foreground(size, logo).transform(
        (size, size), Image.AFFINE, (0.8, 0, size * 0.1, 0, 0.8, size * 0.1), Image.BICUBIC))
    mask = Image.new('L', (size * 4, size * 4), 0)
    draw = ImageDraw.Draw(mask)
    if round_mask:
        draw.ellipse((0, 0, size * 4 - 1, size * 4 - 1), fill=255)
    else:
        draw.rounded_rectangle((0, 0, size * 4 - 1, size * 4 - 1), radius=size * 4 * 0.18, fill=255)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(flat, (0, 0), mask.resize((size, size), Image.LANCZOS))
    return out


logo = mark()
for name, d in DENSITIES.items():
    folder = f'{RES}/mipmap-{name}'
    foreground(round(108 * d), logo).save(f'{folder}/ic_launcher_foreground.png')
    legacy(round(48 * d), logo, False).save(f'{folder}/ic_launcher.png')
    legacy(round(48 * d), logo, True).save(f'{folder}/ic_launcher_round.png')
print('icons written')
