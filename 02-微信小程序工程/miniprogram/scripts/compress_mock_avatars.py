"""Compress bundled mock avatars to 96x96 JPEG (target <=20KB each) for miniprogram package size."""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / 'assets' / 'mock-avatars'
SIZE = 96
JPEG_QUALITY = 78
COUNT = 10


def draw_default(path):
    img = Image.new('RGB', (SIZE, SIZE), (241, 245, 249))
    draw = ImageDraw.Draw(img)
    cx, cy = SIZE // 2, SIZE // 2 - 4
    draw.ellipse((cx - 22, cy - 22, cx + 22, cy + 22), fill=(203, 213, 225))
    draw.rounded_rectangle((cx - 16, cy + 18, cx + 16, cy + 46), radius=10, fill=(203, 213, 225))
    img.save(path, 'JPEG', quality=JPEG_QUALITY, optimize=True)


def compress_one(src, dest):
    img = Image.open(src).convert('RGB')
    img = img.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
    img.save(dest, 'JPEG', quality=JPEG_QUALITY, optimize=True)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for i in range(1, COUNT + 1):
        name = 'mock-avatar-%02d' % i
        png = OUT / (name + '.png')
        jpg = OUT / (name + '.jpg')
        if png.is_file():
            compress_one(png, jpg)
            png.unlink()
        elif not jpg.is_file():
            print('missing', name)
    default_jpg = OUT / 'default-avatar.jpg'
    default_png = OUT / 'default-avatar.png'
    if default_png.is_file():
        compress_one(default_png, default_jpg)
        default_png.unlink()
    elif not default_jpg.is_file():
        draw_default(default_jpg)
    for legacy in OUT.glob('mock-avatar-[0-9].*'):
        legacy.unlink(missing_ok=True)
    total = 0
    for f in sorted(OUT.glob('*.jpg')):
        kb = f.stat().st_size / 1024
        total += f.stat().st_size
        print('%s  %.1f KB' % (f.name, kb))
    print('total %.1f KB (%d files)' % (total / 1024, len(list(OUT.glob('*.jpg')))))


if __name__ == '__main__':
    main()
