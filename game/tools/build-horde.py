#!/usr/bin/env python
"""Builds the horde — five goblins guarding treasure, and their chief — for the stage.
Run from game/:  python tools/build-horde.py
Needs Python with Pillow and numpy.

Sources (assets-source/horde/, links in its README.md):
  goblin-scout/    idle_1, hurt_front, die, attack_1               hsdsz «Goblin Scout» (free sheets)
  goblin-shaman/   idle_1, hurt_top, die_1, attack_2 (+ walk_1)    hsdsz «Goblin Shaman»
  goblin-thrower/  idle_1, attack_1                                hsdsz «Goblin Thrower»
  goblin-chief/    idle_4, hurt_1, attack_1                        hsdsz «Goblin Chief»
                   sit.png                                         drawn for this game (ChatGPT + the user)
  gold-bag/        game_icons_coin_set.png, sheet.png              treasure icons (bag-of-coins.png is no longer used)
hsdsz sheets are grids of 400x400 cells with the figure at the same spot in every cell, facing right.

Output: public/assets/sprites/horde/<key>_<anim>.png (frames on a grid, palette PNG), loot_<name>.png (treasure) and
src/game/config/horde.json
(frame size, frame count, origin = the feet). Frames are mirrored here so the horde faces left, toward the heroes,
and every animation of one creature shares one frame box, so switching animations never moves it. Missing optional
sheets are skipped — the game then plays that reaction in code (a shake, a topple). A goblin whose source folder is
missing entirely falls back to a recoloured scout.
"""
import json, os, colorsys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets-source', 'horde')
OUT = os.path.join(ROOT, 'public', 'assets', 'sprites', 'horde')
CONFIG = os.path.join(ROOT, 'src', 'game', 'config', 'horde.json')
CELL = 400
MAX_TEX = 4096

# Front to back: index 0 stands closest to the heroes and falls first. (key, source folder, hue shift, saturation)
GOBLINS = [
    ('goblin1', 'goblin-scout', 0.0, 1.0),
    ('goblin2', 'goblin-shaman', 0.0, 1.0),
    ('goblin3', 'goblin-scout', -0.06, 1.1),
    ('goblin4', 'goblin-thrower', 0.0, 1.0),
    ('goblin5', 'goblin-scout', 0.07, 0.85),
]
FALLBACK = ('goblin-scout', -0.11, 1.0)
# anim -> candidate source files (first that exists)
GOBLIN_ANIMS = {
    'idle': ['idle_1.png'], 'hurt': ['hurt_front.png', 'hurt_top.png', 'hurt_1.png'], 'die': ['die.png', 'die_1.png'],
    'attack': ['attack_1.png', 'attack_2.png'],
}
CHIEF_ANIMS = {'idle': ['idle_4.png', 'idle_1.png'], 'hurt': ['hurt_1.png'], 'taunt': ['attack_1.png']}
# The beaten chief sits on the floor and cries. No free sheet has that, so it was drawn for this game: two poses side
# by side in goblin-chief/sit.png (wailing, sobbing), already facing left. Scaled to the standing chief by eye (by the
# skull on his belt it would be 0.24, but the drawing has a bigger skull — shoulders and head matched at 0.27), put in
# his frame box with pose 1's skull over the standing one's (skull_x in sit.png -> skull_frame_x in the frame) and its
# lowest point on the floor; pose 2 is laid over pose 1 by its legs and blades, which are drawn in the same place.
# `eyes`: where the tears come from, sit.png px, per pose.
CHIEF_SIT = {
    'file': 'sit.png', 'scale': 0.27, 'skull_x': 555, 'skull_frame_x': 160,
    'eyes': [[(553, 262), (488, 292)], [(1292, 412), (1340, 418)]],
}
# The treasure the goblins guard (gold-bag/): the painted icons of game_icons_coin_set.png, left to right (split at the
# empty gaps between them), with their height on screen; and pixel icons of sheet.png (box in it), shown at
# PIXEL_LOOT_SCALE screen px per art pixel — about the background's pixel size. Textures are saved at 2x. `big`: each
# goblin keeps one big piece at its back; the small ones lie by its feet.
PAINTED_LOOT = [('chest_silver', 46, True), ('chest_gold', 46, True), ('bag', 44, True), ('coin_stack', 34, False), ('coin', 20, False)]
PIXEL_LOOT = [
    ('gold_pile', (32, 16, 64, 32), True), ('crown', (1, 33, 15, 47), False), ('goblet', (18, 17, 30, 31), False),
    ('coin_heap', (0, 17, 16, 32), False), ('coin_tower', (50, 2, 62, 15), False), ('swords', (16, 32, 32, 48), False),
]
PIXEL_LOOT_SCALE = 3


def frames_of(path):
    """Non-empty 400x400 cells of a sheet, in reading order."""
    im = Image.open(path).convert('RGBA')
    cols, rows = im.width // CELL, im.height // CELL
    out = []
    for i in range(cols * rows):
        f = im.crop(((i % cols) * CELL, (i // cols) * CELL, (i % cols + 1) * CELL, (i // cols + 1) * CELL))
        if f.getbbox():
            out.append(f)
    return out


def recolour(im, dh, ds):
    if dh == 0 and ds == 1:
        return im
    a = np.array(im).astype(np.float32) / 255
    rgb, alpha = a[..., :3], a[..., 3:]
    mx, mn = rgb.max(-1), rgb.min(-1)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    out = rgb.copy()
    mask = (sat > 0.18) & (alpha[..., 0] > 0)
    ys, xs = np.nonzero(mask)
    for y, x in zip(ys, xs):  # a few thousand pixels per frame — plain loop is fine for a build step
        h, s, v = colorsys.rgb_to_hsv(*rgb[y, x])
        out[y, x] = colorsys.hsv_to_rgb((h + dh) % 1.0, min(1.0, s * ds), v)
    return Image.fromarray((np.concatenate([out, alpha], -1) * 255).round().astype(np.uint8), 'RGBA')


def feet(frame):
    """(x, y) of the feet in a cell: centre of the bottom fifth of the figure, its lowest row."""
    a = np.array(frame.getchannel('A')) > 24
    ys, xs = np.nonzero(a)
    top, bottom = ys.min(), ys.max()
    band = ys >= bottom - (bottom - top) * 0.2
    return float(xs[band].mean()), float(bottom + 1)


def save_png(im, path):
    im.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(path, optimize=True)


def build_creature(key, folder, anims, dh=0.0, ds=1.0):
    src = os.path.join(SRC, folder)
    sets = {}
    for anim, names in anims.items():
        name = next((n for n in names if os.path.exists(os.path.join(src, n))), None)
        if name is None:
            if anim == 'idle':
                raise SystemExit(f'{folder}: no idle sheet')
            continue
        fr = frames_of(os.path.join(src, name))
        sets[anim] = fr[:1] if anim == 'idle' else fr
    # One frame box for every animation (union of the figures), mirrored so the creature faces left.
    boxes = [f.getbbox() for fr in sets.values() for f in fr]
    box = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
    fx, fy = feet(sets['idle'][0])
    w, h = box[2] - box[0], box[3] - box[1]
    origin_x = 1 - (fx - box[0]) / w  # mirrored
    origin_y = (fy - box[1]) / h
    meta = {'key': key, 'frameWidth': w, 'frameHeight': h, 'originX': round(origin_x, 4), 'originY': round(origin_y, 4), 'anims': {}}
    # Where things are on the standing figure, in texture px from the feet (x < 0 = toward the heroes): its front
    # edge (heroes stop there), its top, and its head (the chief's tears start there).
    idle = sets['idle'][0].crop(box).transpose(Image.FLIP_LEFT_RIGHT)
    a = np.array(idle.getchannel('A')) > 24
    ys, xs = np.nonzero(a)
    feet_x, feet_y = origin_x * w, origin_y * h
    head_rows = ys <= ys.min() + (feet_y - ys.min()) * 0.14
    meta.update({
        'frontPx': round(feet_x - xs.min(), 1),
        'topPx': round(feet_y - ys.min(), 1),
        'headDx': round(float(xs[head_rows].mean()) - feet_x, 1),
        'headDy': round(feet_y - float(ys[head_rows].mean()), 1),
    })
    for anim, fr in sets.items():
        save_anim(meta, anim, [recolour(f.crop(box), dh, ds).transpose(Image.FLIP_LEFT_RIGHT) for f in fr])
    print(key, folder, 'frame', (w, h), {a: n for a, n in meta['anims'].items()})
    return meta


def save_anim(meta, anim, frames):
    w, h = meta['frameWidth'], meta['frameHeight']
    cols = max(1, min(len(frames), MAX_TEX // w))
    rows = -(-len(frames) // cols)
    sheet = Image.new('RGBA', (cols * w, rows * h), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.alpha_composite(f, ((i % cols) * w, (i // cols) * h))
    save_png(sheet, os.path.join(OUT, f"{meta['key']}_{anim}.png"))
    meta['anims'][anim] = len(frames)


def lay_over(ref, part, guess, r=25, frac=0.35):
    """Where in ref's frame `part` best covers what is already there with its lower part (legs, blades): (x, y)."""
    ra = np.array(ref.getchannel('A')) > 24
    pa = np.array(part.getchannel('A')) > 24
    oy = int(pa.shape[0] * (1 - frac))
    pa = pa[oy:]
    best = None
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            x, y = guess[0] + dx, guess[1] + dy + oy
            if x < 0 or y < 0 or x + pa.shape[1] > ra.shape[1] or y + pa.shape[0] > ra.shape[0]:
                continue
            win = ra[y:y + pa.shape[0], x:x + pa.shape[1]]
            score = np.count_nonzero(win & pa) / max(1, np.count_nonzero(win | pa))
            if best is None or score > best[0]:
                best = (score, guess[0] + dx, guess[1] + dy)
    return best[1], best[2]


def add_chief_sit(meta, sit):
    """The chief's 'sit' animation (see CHIEF_SIT), in his frame box, and where his tears start (px from the feet)."""
    path = os.path.join(SRC, 'goblin-chief', sit['file'])
    if not os.path.exists(path):
        print('chief: no', sit['file'], '— the game sinks the standing pose instead')
        return
    a = np.array(Image.open(path).convert('RGBA'))
    a[..., 3][a[..., 3] <= 24] = 0  # faint haze left around the cut-out
    im = Image.fromarray(a, 'RGBA')
    xs = np.nonzero((a[..., 3] > 0).sum(0) > 2)[0]
    split = int(xs[np.argmax(np.diff(xs))]) + 1  # the widest empty gap between the poses
    w, h = meta['frameWidth'], meta['frameHeight']
    feet_x, feet_y = meta['originX'] * w, meta['originY'] * h
    k = sit['scale']
    frames, eyes = [], []
    for i, (x0, x1) in enumerate([(0, split), (split, im.width)]):
        part = im.crop((x0, 0, x1, im.height))
        bx = part.getbbox()
        part = part.crop(bx).convert('RGBa')
        part = part.resize((round(part.width * k), round(part.height * k)), Image.LANCZOS).convert('RGBA')
        if not frames:
            pos = (round(sit['skull_frame_x'] - (sit['skull_x'] - x0 - bx[0]) * k), round(feet_y) - part.height)
        else:
            pos = lay_over(frames[0], part, (frames[0].getbbox()[0], round(feet_y) - part.height))
        assert pos[0] >= 0 and pos[1] >= 0 and pos[0] + part.width <= w and pos[1] + part.height <= h, 'sit pose leaves the frame box'
        f = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        f.alpha_composite(part, pos)
        frames.append(f)
        eyes.append([[round(pos[0] + (ex - x0 - bx[0]) * k - feet_x, 1), round(feet_y - pos[1] - (ey - bx[1]) * k, 1)]
                     for ex, ey in sit['eyes'][i]])
    save_anim(meta, 'sit', frames)
    meta['sitEyes'] = eyes
    print('chief sit', [f.getbbox() for f in frames])


def build_treasures():
    """Every treasure as its own image, 2x its height on screen; returns their list for horde.json."""
    out = []

    def save(key, im, big):
        save_png(im, os.path.join(OUT, f'loot_{key}.png'))
        out.append({'key': f'loot_{key}', 'width': im.width, 'height': im.height, 'big': big})

    painted = Image.open(os.path.join(SRC, 'gold-bag', 'game_icons_coin_set.png')).convert('RGBA')
    a = np.array(painted.getchannel('A')) > 24
    xs = np.nonzero(a.any(0))[0]
    cuts = [0] + [int(xs[i] + xs[i + 1]) // 2 for i in range(len(xs) - 1) if xs[i + 1] - xs[i] > 5] + [painted.width]
    assert len(cuts) - 1 == len(PAINTED_LOOT), f'{len(cuts) - 1} painted icons, expected {len(PAINTED_LOOT)}'
    for (key, h, big), x0, x1 in zip(PAINTED_LOOT, cuts, cuts[1:]):
        icon = painted.crop((x0, 0, x1, painted.height))
        icon = icon.crop(icon.getbbox()).convert('RGBa')
        k = h * 2 / icon.height
        save(key, icon.resize((round(icon.width * k), h * 2), Image.LANCZOS).convert('RGBA'), big)
    pixel = Image.open(os.path.join(SRC, 'gold-bag', 'sheet.png')).convert('RGBA')
    for key, box, big in PIXEL_LOOT:
        icon = pixel.crop(box)
        icon = icon.crop(icon.getbbox())
        save(key, icon.resize((icon.width * PIXEL_LOOT_SCALE * 2, icon.height * PIXEL_LOOT_SCALE * 2), Image.NEAREST), big)
    print('treasures', [(t['key'], t['big']) for t in out])
    return out


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for name in os.listdir(OUT):  # a sheet that is gone from the sources must not linger in the game
        if name.endswith('.png'):
            os.remove(os.path.join(OUT, name))
    goblins = []
    for key, folder, dh, ds in GOBLINS:
        if not os.path.exists(os.path.join(SRC, folder, 'idle_1.png')):
            print(f'{key}: {folder} not downloaded yet — a recoloured scout stands in')
            folder, dh, ds = FALLBACK
        goblins.append(build_creature(key, folder, GOBLIN_ANIMS, dh, ds))
    chief = build_creature('goblin_chief', 'goblin-chief', CHIEF_ANIMS)
    add_chief_sit(chief, CHIEF_SIT)
    config = {'_comment': 'Generated by tools/build-horde.py — do not edit by hand.', 'goblins': goblins, 'chief': chief, 'treasures': build_treasures()}
    with open(CONFIG, 'w', encoding='utf-8') as f:
        json.dump(config, f, ensure_ascii=False, indent=2)
    print('done ->', OUT, CONFIG)
