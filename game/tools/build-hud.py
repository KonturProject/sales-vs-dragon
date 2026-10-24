#!/usr/bin/env python
"""Builds the Halloween HUD pieces from assets-source/HUD/ into public/assets/hud/.
Run from game/:  python tools/build-hud.py     Needs Python with Pillow, numpy, scipy.

Sources (assets-source/HUD/):
  Готическая хэллоуинская панель с тыквой и фонарём.png   the weekly bar, empty: pumpkin on the left, lantern on the right
  Хэллоуинские неоновые игровые рамки UI.png               a sheet with a bar (not used), a big frame and a small panel

Outputs (2x their on-screen size; HUDScene shows them at scale 0.5 of the texture, see HUD in Constants.ts):
  hud_bar_left.png / hud_bar_mid.png / hud_bar_right.png   the bar cut in three, all with the same height and the
      track's centre line at the vertical centre; the middle is stretched sideways to any width in the game
  hud_frame_big.png    the big frame (victory banner); its transparent hole is where the text goes
  hud_panel_small.png  the small dark panel (leaderboard, goblin counter)
Prints the geometry (cuts, inner insets) that Constants.ts HUD has to agree with.
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets-source', 'HUD')
OUT = os.path.join(ROOT, 'public', 'assets', 'hud')

BAR_FILE = 'Готическая хэллоуинская панель с тыквой и фонарём.png'
SHEET_FILE = 'Хэллоуинские неоновые игровые рамки UI.png'

BAR_DISPLAY_SCALE = 0.33     # on-screen px per source px (the bar's track comes out ~28 px thick)
TEXTURE_SCALE = 2            # texture px per on-screen px
TRACK_CENTER_Y = 437         # source y of the track's centre line
HALF_H = 215                 # source px kept above/below it (the pumpkin's top is ~212 above)
CUT_LEFT = 520               # source x where the pumpkin's cap ends and the middle begins (a plain stretch of rail)
CUT_RIGHT = 1700             # ... where the middle ends and the lantern's cap begins


def save(im, name):
    im.save(os.path.join(OUT, name), optimize=True)
    print(name, im.size)


def build_bar():
    im = Image.open(os.path.join(SRC, BAR_FILE)).convert('RGBA')
    bbox = im.getbbox()
    k = BAR_DISPLAY_SCALE * TEXTURE_SCALE
    y0, y1 = TRACK_CENTER_Y - HALF_H, TRACK_CENTER_Y + HALF_H
    pieces = {'left': (bbox[0], CUT_LEFT), 'mid': (CUT_LEFT, CUT_RIGHT), 'right': (CUT_RIGHT, bbox[2])}
    for name, (x0, x1) in pieces.items():
        crop = im.crop((x0, y0, x1, y1))
        w, h = round(crop.width * k), round(crop.height * k)
        save(crop.convert('RGBa').resize((w, h), Image.LANCZOS).convert('RGBA'), f'hud_bar_{name}.png')
    # the dark track's inner extent, in on-screen px from the bar's left / right end (the fill lives inside it)
    a = np.array(im.convert('RGB')).sum(axis=2)
    alpha = np.array(im.getchannel('A'))
    row = (alpha[TRACK_CENTER_Y] > 200) & (a[TRACK_CENTER_Y] < 150)
    xs = np.nonzero(row)[0]
    print('track dark x range (src):', xs.min(), xs.max(), 'bar bbox', bbox)
    print('inner insets on screen: left', round((xs.min() - bbox[0]) * BAR_DISPLAY_SCALE), 'right', round((bbox[2] - xs.max()) * BAR_DISPLAY_SCALE))
    col = (alpha[:, 900] > 200) & (a[:, 900] < 150)
    ys = np.nonzero(col)[0]
    ys = ys[(ys > TRACK_CENTER_Y - 80) & (ys < TRACK_CENTER_Y + 80)]
    print('track dark y range (src):', ys.min(), ys.max(), '-> thickness on screen', round((ys.max() - ys.min()) * BAR_DISPLAY_SCALE))


def components(sheet):
    a = np.array(sheet.getchannel('A')) > 24
    lab, n = ndimage.label(ndimage.binary_dilation(a, iterations=6))
    boxes = []
    for i, (sy, sx) in enumerate(ndimage.find_objects(lab), start=1):
        boxes.append((int((lab[sy, sx] == i).sum()), (sx.start, sy.start, sx.stop, sy.stop)))
    return boxes


def hole_of(im):
    """Inset (px of `im`) of the biggest empty (transparent) hole around the picture's centre, left/top/right/bottom."""
    a = np.array(im.getchannel('A'))
    cy, cx = a.shape[0] // 2, a.shape[1] // 2
    l = next(x for x in range(cx, -1, -1) if a[cy, x] > 24)
    r = next(x for x in range(cx, a.shape[1]) if a[cy, x] > 24)
    t = next(y for y in range(cy, -1, -1) if a[y, cx] > 24)
    b = next(y for y in range(cy, a.shape[0]) if a[y, cx] > 24)
    return l, t, a.shape[1] - r, a.shape[0] - b


def build_frames(big_display_w=560, small_display_w=230):
    sheet = Image.open(os.path.join(SRC, SHEET_FILE)).convert('RGBA')
    boxes = sorted(components(sheet), key=lambda c: -c[0])
    # by area: the bar with its fill (1st or 2nd), the big frame, the small panel — pick by shape instead
    bigs = [b for _, b in boxes if (b[2] - b[0]) / (b[3] - b[1]) < 2.0]
    big = max(bigs, key=lambda b: (b[2] - b[0]) * (b[3] - b[1]))
    small = min(bigs, key=lambda b: (b[2] - b[0]) * (b[3] - b[1]))
    for name, box, display_w in (('hud_frame_big.png', big, big_display_w), ('hud_panel_small.png', small, small_display_w)):
        crop = sheet.crop(box)
        w = display_w * TEXTURE_SCALE
        h = round(crop.height * w / crop.width)
        out = crop.convert('RGBa').resize((w, h), Image.LANCZOS).convert('RGBA')
        save(out, name)
        print('  display', display_w, 'x', round(h / TEXTURE_SCALE), '; inset l,t,r,b (display px):',
              [round(v / TEXTURE_SCALE) for v in hole_of(out)])


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    build_bar()
    build_frames()
