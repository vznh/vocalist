"""Compose macOS app-icon art from the hand-drawn master logos."""
from PIL import Image, ImageDraw

SIZE = 1024
INSET = 100
RADIUS = 185
ART_SCALE = 0.72


def squircle_mask():
    mask = Image.new('L', (SIZE, SIZE), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (INSET, INSET, SIZE - INSET, SIZE - INSET), radius=RADIUS, fill=255
    )
    return mask


def art_alpha(path):
    """Turn a flat logo into an alpha mask of its line art."""
    gray = Image.open(path).convert('L')
    width, height = gray.size
    corners = [gray.getpixel(point) for point in [(0, 0), (width - 1, 0), (0, height - 1)]]
    light_background = sum(corners) / len(corners) > 128
    return gray.point(lambda value: 255 - value if light_background else value)


def compose(art_path, background, ink, out_path):
    mask = squircle_mask()
    canvas = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    canvas.paste(Image.new('RGBA', (SIZE, SIZE), background), mask=mask)

    art = art_alpha(art_path).resize((round(SIZE * ART_SCALE),) * 2, Image.LANCZOS)
    offset = ((SIZE - art.width) // 2, (SIZE - art.height) // 2)
    canvas.paste(Image.new('RGBA', art.size, ink), offset, art)
    canvas.save(out_path, optimize=True)
    print(out_path, canvas.size)


if __name__ == '__main__':
    compose('build/logo-black.png', (0, 0, 0, 255), (255, 255, 255, 255), 'build/icon.png')
    compose('build/logo-black.png', (0, 0, 0, 255), (255, 255, 255, 255), 'build/dock-dark.png')
    compose('build/logo-white.png', (255, 255, 255, 255), (0, 0, 0, 255), 'build/dock-light.png')
