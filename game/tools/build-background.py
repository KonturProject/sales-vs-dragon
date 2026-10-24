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

Output: public/assets/sprites/bg_forest.jpg (about 2667x1500: the pack picture plus mirrored, blurred, darkened margins —
the stage shows it over the whole zoomed-out view, WORLD in Constants.ts)
and public/assets/sprites/campfire.png (the frames 4x larger with hard pixels, so smooth filtering keeps them crisp).
"""
import os
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets-source', 'background')
OUT = os.path.join(ROOT, 'public', 'assets', 'sprites')

VARIANT = 'Pale'  # 'Bright' is more saturated; the pale one lets the green goblins and the heroes stand out
# The pack's own order has the tree under 'grasses' and 'grass&road' — both leave a hole where it used to stand. Moved,
# the tree has to go over them instead (only the fireflies stay in front).
ORDER = ['sky', 'jungle_bg', 'trees&bushes', 'lianas', 'grasses', 'grass&road', 'tree_face', 'fireflys']
TREE_SRC_X = 970  # the trunk's middle in the pack's picture (1920 px wide)
TREE_X = 500      # where it goes: behind the heroes (logical x ~330 of 1280)
# The stage shows a wider world than the 1280x720 the pack picture was laid out for (WORLD in Constants.ts). The picture
# keeps its place (it covered world 0..1280 x 0..720 at 1.5 px per unit); the margins around it are made by mirroring
# the edges, blurring them progressively and darkening everything, so no seam shows.
WORLD_ZOOM = 0.72            # must equal WORLD.ZOOM in Constants.ts
LOGICAL = (1280, 720)        # must equal GAME.WIDTH/HEIGHT
PX_PER_UNIT = 1.5            # the pack picture is 1920 px for 1280 logical units
MARGIN_BLUR_PX = 14
MARGIN_FADE_PX = 140         # the blur/darkening ramps up over this many px outside the original picture
DARKEN = 0.58                # evening: brightness multiplier ...
TINT = (0.92, 0.97, 1.12)    # ... and a cool shift per channel (R, G, B)
VIGNETTE = 0.55              # extra darkening in the corners (0 = none)
CAMPFIRE_FRAME = 64
CAMPFIRE_UPSCALE = 4


def widen(im):
    """The pack picture on a canvas covering the whole zoomed-out stage view, darkened (see the constants above)."""
    world_w = LOGICAL[0] / WORLD_ZOOM
    world_h = LOGICAL[1] / WORLD_ZOOM
    cw, ch = round(world_w * PX_PER_UNIT), round(world_h * PX_PER_UNIT)
    left = round((cw - im.width) / 2)
    top = round((ch - im.height) / 2)
    pad = ((top, ch - im.height - top), (left, cw - im.width - left), (0, 0))
    arr = np.pad(np.asarray(im), pad, mode='reflect')
    canvas = Image.fromarray(arr)

    # distance outside the original picture, in px (0 inside) -> blur mix and extra darkness in the margins
    yy, xx = np.mgrid[0:ch, 0:cw]
    dx = np.maximum(np.maximum(left - xx, xx - (left + im.width - 1)), 0)
    dy = np.maximum(np.maximum(top - yy, yy - (top + im.height - 1)), 0)
    ramp = np.clip(np.hypot(dx, dy) / MARGIN_FADE_PX, 0, 1)[..., None]
    blurred = np.asarray(canvas.filter(ImageFilter.GaussianBlur(MARGIN_BLUR_PX))).astype(np.float32)
    base = np.asarray(canvas).astype(np.float32)
    mixed = base * (1 - ramp) + blurred * ramp

    nx = (xx - cw / 2) / (cw / 2)
    ny = (yy - ch / 2) / (ch / 2)
    vig = 1 - VIGNETTE * np.clip((nx ** 2 + ny ** 2) / 2, 0, 1)[..., None]
    shade = DARKEN * vig * (1 - 0.25 * ramp) * np.array(TINT, dtype=np.float32)
    return Image.fromarray(np.clip(mixed * shade, 0, 255).astype(np.uint8))


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
    wide = widen(out.convert('RGB'))
    wide.save(os.path.join(OUT, 'bg_forest.jpg'), quality=92)
    print('bg_forest.jpg', wide.size, VARIANT, 'tree at x', TREE_X)


def build_campfire():
    im = Image.open(os.path.join(SRC, 'CampFireFinished.png')).convert('RGBA')
    im = im.resize((im.width * CAMPFIRE_UPSCALE, im.height * CAMPFIRE_UPSCALE), Image.NEAREST)
    im.save(os.path.join(OUT, 'campfire.png'), optimize=True)
    print('campfire.png', im.size, 'frames', im.width // (CAMPFIRE_FRAME * CAMPFIRE_UPSCALE))


if __name__ == '__main__':
    build_forest()
    build_campfire()
