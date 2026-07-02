"""Download distinct portrait avatars into miniprogram/assets/mock-avatars (bundled with app)."""
from io import BytesIO
from pathlib import Path
import ssl
import urllib.request

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / 'assets' / 'mock-avatars'
SIZE = 256
UA = {'User-Agent': 'Mozilla/5.0 (compatible; GolfBuddyMockAvatar/1.0)'}

# Fixed pravatar ids → stable distinct faces (downloaded once, shipped in repo)
PORTRAIT_IDS = [11, 12, 13, 14, 15, 20, 23, 27, 32, 44]


def fetch_image(url):
    ctx = ssl.create_default_context()
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=45) as resp:
        return Image.open(BytesIO(resp.read())).convert('RGB')


def crop_square(img):
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    return img.crop((left, top, left + side, top + side)).resize((SIZE, SIZE), Image.Resampling.LANCZOS)


def draw_default():
    img = Image.new('RGBA', (SIZE, SIZE), (241, 245, 249, 255))
    draw = ImageDraw.Draw(img)
    cx, cy = SIZE // 2, SIZE // 2 - 8
    draw.ellipse((cx - 54, cy - 54, cx + 54, cy + 54), fill=(203, 213, 225))
    draw.rounded_rectangle((cx - 40, cy + 44, cx + 40, cy + 118), radius=24, fill=(203, 213, 225))
    return img.convert('RGB')


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    ok = 0
    for i, pid in enumerate(PORTRAIT_IDS, start=1):
        url = 'https://i.pravatar.cc/256?img=' + str(pid)
        try:
            img = crop_square(fetch_image(url))
            out = OUT / ('mock-avatar-%02d.png' % i)
            img.save(out, 'PNG', optimize=True)
            ok += 1
            print('saved', out.name, out.stat().st_size)
        except Exception as e:
            print('skip', url, e)
    draw_default().save(OUT / 'default-avatar.png', 'PNG', optimize=True)
    for legacy in OUT.glob('mock-avatar-[0-9].png'):
        legacy.unlink(missing_ok=True)
    print('done:', ok, 'portraits + default in', OUT)


if __name__ == '__main__':
    main()
