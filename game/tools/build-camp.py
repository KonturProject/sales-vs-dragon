#!/usr/bin/env python
"""Builds the goblins' camp props (tent, totem) from assets-source/camp/ into public/assets/sprites/.
Run from game/:  python tools/build-camp.py     Needs Python with Pillow.

The sources are small painted pictures; they are enlarged with a smooth filter to 2x their on-screen size (the game shows
them at scale 0.5, like the hero textures) and lightly sharpened. TENT_H / TOTEM_H are the on-screen heights in world px
(the chief is 330, a hero ~215).
"""
import os
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets-source', 'camp')
OUT = os.path.join(ROOT, 'public', 'assets', 'sprites')

PROPS = [
    ('dino_tribe_camp_hide_tent_hut_01.png', 'camp_tent.png', 190),
    ('dino_tribe_camp_bone_skull_totem_01.png', 'camp_totem.png', 190),
]
TEXTURE_SCALE = 2  # texture px per on-screen px
DARKEN = (0.55, 0.58, 0.68)  # per-channel brightness: the props must sit in the dark evening scene, cool-toned


def main():
    for src, out, screen_h in PROPS:
        im = Image.open(os.path.join(SRC, src)).convert('RGBA')
        im = im.crop(im.getbbox())  # the pictures carry transparent padding: the feet line must be the picture's bottom edge
        h = screen_h * TEXTURE_SCALE
        w = round(im.width * h / im.height)
        im = im.resize((w, h), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=1.2, percent=60, threshold=2))
        r, g, b, a = im.split()
        r, g, b = (c.point(lambda v, k=k: round(v * k)) for c, k in zip((r, g, b), DARKEN))
        im = Image.merge('RGBA', (r, g, b, a))
        im.save(os.path.join(OUT, out), optimize=True)
        print(out, im.size)


if __name__ == '__main__':
    main()
