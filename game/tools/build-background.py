#!/usr/bin/env python
"""Builds the stage background — a forest with the old face-tree on the heroes' side — and the goblins' campfire.
Run from game/:  python tools/build-background.py
Needs Python with Pillow.

Sources (assets-source/background/):
  Battleground3/<Bright|Pale>/*.png   CraftPix «Free Forest Battle Backgrounds», background 3: 1920x1080 layers
  CampFireFinished.png                campfire, 5 frames of 64x64 in a row

The layers are composited in the order of the pack's own picture, except that the face-tree (its own layer) is moved
from the middle to the left: the heroes stand in front of it, the goblins on the open road on the right. Every other
layer spans the whole width, so nothing has to be repeated and the tree appears once.

Output: public/assets/sprites/bg_forest.jpg (1920x1080 — the game shows it at 1280x720 logical, up to 2x render scale)
and public/assets/sprites/campfire.png (the frames 4x larger with hard pixels, so smooth filtering keeps them crisp).
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets-source', 'background')
OUT = os.path.join(ROOT, 'public', 'assets', 'sprites')

VARIANT = 'Pale'  # 'Bright' is more saturated; the pale one lets the green goblins and the heroes stand out
# The pack's own order has the tree under 'grasses' and 'grass&road' — both leave a hole where it used to stand. Moved,
# the tree has to go over them instead (only the fireflies stay in front).
ORDER = ['sky', 'jungle_bg', 'trees&bushes', 'lianas', 'grasses', 'grass&road', 'tree_face', 'fireflys']
TREE_SRC_X = 970  # the trunk's middle in the pack's picture (1920 px wide)
TREE_X = 500      # where it goes: behind the heroes (logical x ~330 of 1280)
CAMPFIRE_FRAME = 64
CAMPFIRE_UPSCALE = 4


def build_forest():
    layers = os.path.join(SRC, 'Battleground3', VARIANT)
    out = None
    for name in ORDER:
        im = Image.open(os.path.join(layers, f'{name}.png')).convert('RGBA')
        if out is None:
            out = Image.new('RGBA', im.size, (0, 0, 0, 255))
        if name == 'tree_face':
            out.alpha_composite(im, (TREE_X - TREE_SRC_X, 0))
        else:
            out.alpha_composite(im)
    out.convert('RGB').save(os.path.join(OUT, 'bg_forest.jpg'), quality=92)
    print('bg_forest.jpg', out.size, VARIANT, 'tree at x', TREE_X)


def build_campfire():
    im = Image.open(os.path.join(SRC, 'CampFireFinished.png')).convert('RGBA')
    im = im.resize((im.width * CAMPFIRE_UPSCALE, im.height * CAMPFIRE_UPSCALE), Image.NEAREST)
    im.save(os.path.join(OUT, 'campfire.png'), optimize=True)
    print('campfire.png', im.size, 'frames', im.width // (CAMPFIRE_FRAME * CAMPFIRE_UPSCALE))


if __name__ == '__main__':
    build_forest()
    build_campfire()
