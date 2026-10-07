"""Turns raw generated PNGs (scripts/art-out) into optimised web assets in public/art.
Icons: cut the background (alpha already present, or flat white from OpenRouter), trim, square-pad, 256px webp.
Scenes: webp. hero-finance also replaces hero.webp and og.jpg."""
import glob, os
from PIL import Image

OUT = 'public/art'
os.makedirs(OUT, exist_ok=True)

def cut_white(im):
    # flat white background -> transparent, with a soft edge
    im = im.convert('RGBA'); px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            m = min(r, g, b)
            if m > 246: px[x, y] = (r, g, b, 0)
            elif m > 232: px[x, y] = (r, g, b, int(255 * (246 - m) / 14))
    return im

for f in sorted(glob.glob('scripts/art-out/*.png')):
    name = os.path.basename(f)[:-4]
    im = Image.open(f)
    if name.startswith('tpl-'):
        if name.endswith('.white'):
            name = name[:-6]; im = cut_white(im)
        im = im.convert('RGBA')
        a = im.split()[3].point(lambda v: 0 if v < 190 else min(255, int((v - 190) * 255 / 50)))  # drop faint glow halos
        im.putalpha(a)
        im = im.crop(im.getbbox())
        s = max(im.size); sq = Image.new('RGBA', (s, s), (0, 0, 0, 0)); sq.paste(im, ((s - im.width) // 2, (s - im.height) // 2))
        sq.resize((256, 256), Image.LANCZOS).save(f'{OUT}/{name}.webp', quality=90)
    else:
        im = im.convert('RGB'); w = 1280 if im.width > 1100 else 800
        im = im.resize((w, int(im.height * w / im.width)), Image.LANCZOS)
        im.save(f'{OUT}/{name}.webp', quality=84)
        if name == 'hero-finance':
            im.save(f'{OUT}/hero.webp', quality=84)
            im.resize((1200, int(1200 * im.height / im.width))).save('public/og.jpg', quality=85)
    print('wrote', name)
