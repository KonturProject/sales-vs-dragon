#!/usr/bin/env python
"""Builds game sprites in public/assets/sprites from the hand-finished art in assets-source.
Run from game/:  python tools/build-sprites.py [--only heroes lead dragon mountain bg] [--mount-clip F] [--out DIR]
By default only the heroes and the branch lead: the dragon, the gold mountain and the cave are no longer in the game
(since 2026-10 it is the goblin horde in a forest — tools/build-horde.py, tools/build-background.py); their parts are
kept here for reference and are built only when asked for with --only.
Needs Python with Pillow, numpy and scipy (scipy only for the hero sheets).

Sources are already transparent, so no background removal here — only cropping, scaling (LANCZOS, to 2x the
on-screen size: Phaser renders them at scale 0.5) and alignment:
  - heroes: one 4x4 sheet per hero in assets-source/hero-sheets/<group>/sheet.png (stance + attack frames, the user's
    Halloween versions, 2026-10). The standing pose and four two-frame attacks (wind-up, blow) are cut out, scaled
    together and anchored on the feet so swapping frames never makes a hero jump; see build_hero_sheet;
  - the branch lead (and the old dragon, gold mountain and cave) from assets-source/character-refs.
"""
import argparse, os, sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets-source', 'character-refs')
SHEETS = os.path.join(ROOT, 'assets-source', 'hero-sheets')
TEX = 2  # texture px per on-screen px (game renders at scale 1/TEX)

# Folder prefix in hero-sheets -> (slug, on-screen standing height px, stance cell, attacks).
# Cells are (row, col) of the 4x4 sheet. Each attack is (wind-up cell, blow cell): the hero shows the wind-up while
# it dashes and the blow (with its fire / glow / slash effect) on arrival — config/heroRoster.json `hits` = 4 attacks,
# used one after another on successive sales. Chosen by eye from the sheets; the standing heights are the old ones.
HERO_SHEETS = {
    'СР1': ('hero_lion', 200, (0, 0), [((0, 1), (0, 2)), ((1, 1), (1, 2)), ((2, 1), (2, 2)), ((3, 1), (3, 2))]),
    'СР2': ('hero_scrooge', 190, (0, 3), [((1, 0), (1, 2)), ((0, 0), (0, 2)), ((2, 0), (2, 2)), ((3, 0), (3, 2))]),
    'СР3': ('hero_grinch', 205, (0, 0), [((0, 1), (0, 2)), ((1, 1), (1, 2)), ((2, 1), (2, 2)), ((3, 1), (3, 2))]),
    'СР5': ('hero_yoda', 175, (0, 0), [((0, 1), (0, 2)), ((1, 1), (1, 2)), ((2, 1), (2, 2)), ((3, 1), (3, 2))]),
    'СР6': ('hero_neznaika', 195, (0, 0), [((0, 1), (0, 2)), ((1, 1), (1, 2)), ((2, 1), (2, 2)), ((3, 1), (3, 2))]),
    'СР9': ('hero_minion', 165, (2, 3), [((0, 0), (0, 2)), ((1, 0), (1, 2)), ((2, 0), (2, 2)), ((3, 0), (3, 2))]),
}
LEAD = ('lead_cruella', 205)
BG_SIZE = (1280, 720)   # must equal GAME.WIDTH/HEIGHT in Constants.ts
BG_CROP_X = 380         # source-px offset of the crop window (cover-fit): keeps the dark tunnel on the right, behind the dragon
DRAGON_W = 500   # on-screen width of the (union-bbox) dragon canvas
MOUNT_W = 385    # on-screen width of the gold mountain (was 440; shrunk a bit so its right edge stays on the platform)
# Share of the mountain's width cut off its right side: the pile's right tip used to hang over the
# dark rock wall at the platform edge. 0 = the original, uncropped art (rollback: --mount-clip 0).
MOUNT_CLIP_RIGHT = 0.0


def crop(im):
    a = np.array(im.getchannel('A'))
    ys, xs = np.where(a > 8)
    return im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


def find(dirname, pred):
    d = os.path.join(SRC, dirname)
    hits = [f for f in sorted(os.listdir(d)) if pred(f.lower())]
    if not hits:
        raise SystemExit(f'no file in {dirname} matching predicate')
    return os.path.join(d, hits[0])


def folder(prefix):
    for n in sorted(os.listdir(SRC)):
        if n == prefix or n.startswith(prefix + ' ') or n.startswith(prefix + '-'):
            return n
    raise SystemExit('folder not found: ' + prefix)


def resized(im, scale):
    w, h = max(1, round(im.width * scale)), max(1, round(im.height * scale))
    return im.resize((w, h), Image.LANCZOS)


def sheet_frames(sheet):
    """The 16 frames of a 4x4 sheet as {(row, col): RGBA crop + its offset}. Frames are cut by connected pieces, not by
    the nominal grid: a raised sword or a fire trail may reach over the cell line (the elf's sabre does), and each
    piece belongs to the cell its centre of mass lies in. Specks under 30 px are dropped (generator noise)."""
    from scipy import ndimage
    a = np.array(sheet.getchannel('A')) > 24
    labels, n = ndimage.label(a, structure=np.ones((3, 3)))
    H, W = a.shape
    cells = {}
    for i, (sy, sx) in enumerate(ndimage.find_objects(labels), start=1):
        piece = labels[sy, sx] == i
        size = int(piece.sum())
        if size < 30:
            continue
        ys, xs = np.nonzero(piece)
        cy, cx = sy.start + ys.mean(), sx.start + xs.mean()
        key = (min(3, int(cy // (H / 4))), min(3, int(cx // (W / 4))))
        cells.setdefault(key, []).append((sy, sx, i))
    frames = {}
    rgba = np.array(sheet)
    for key, pieces in cells.items():
        y0 = min(p[0].start for p in pieces); y1 = max(p[0].stop for p in pieces)
        x0 = min(p[1].start for p in pieces); x1 = max(p[1].stop for p in pieces)
        mask = np.isin(labels[y0:y1, x0:x1], [p[2] for p in pieces])
        crop_ = rgba[y0:y1, x0:x1].copy()
        crop_[~mask] = 0  # bits of neighbouring frames inside the box are not ours
        frames[key] = Image.fromarray(crop_, 'RGBA')
    return frames


def feet_anchor(im):
    """x of the body's centre, from the bottom fifth of the figure (the feet and legs): unlike the bounding box it does
    not slide when an arm, a sword or a fire trail sticks out to one side."""
    a = np.array(im.getchannel('A')) > 24
    h = a.shape[0]
    band = a[int(h * 0.8):]
    xs = np.nonzero(band)[1]
    return float(xs.mean()) if xs.size else im.width / 2


def anchored(im, scale):
    """Scaled frame on a canvas whose bottom edge is the feet line and whose centre column is the body (feet_anchor):
    the game draws heroes with origin (0.5, 1), so every frame of a hero then stands on the same spot."""
    ax = feet_anchor(im)
    half = max(ax, im.width - ax)
    canvas = Image.new('RGBA', (int(np.ceil(half * 2)) + 2, im.height), (0, 0, 0, 0))
    canvas.alpha_composite(im, (int(round(half - ax)) + 1, 0))
    # Resampled with premultiplied alpha, so glows and soft edges do not pick up a dark fringe.
    w, h = max(1, round(canvas.width * scale)), max(1, round(canvas.height * scale))
    return canvas.convert('RGBa').resize((w, h), Image.LANCZOS).convert('RGBA')


def save_png(im, path):
    """Palette PNG (256 colours, alpha kept): on pixel-art heroes nothing visible is lost and the files get ~3-4x
    smaller — 54 hero textures load on the office laptops, so it matters."""
    im.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(path, optimize=True)


def build_hero_sheet(out, prefix, slug, disp_h, stance, attacks):
    d = next(n for n in sorted(os.listdir(SHEETS)) if n == prefix or n.startswith(prefix + ' '))
    frames = sheet_frames(Image.open(os.path.join(SHEETS, d, 'sheet.png')).convert('RGBA'))
    if len(frames) != 16:
        raise SystemExit(f'{d}: expected 16 frames, found {len(frames)}')
    s = disp_h * TEX / frames[stance].height
    save_png(anchored(frames[stance], s), os.path.join(out, slug + '.png'))
    for i, (windup, blow) in enumerate(attacks, start=1):
        save_png(anchored(frames[windup], s), os.path.join(out, f'{slug}_hit{i}_windup.png'))
        save_png(anchored(frames[blow], s), os.path.join(out, f'{slug}_hit{i}.png'))
    print(slug, 'stance', frames[stance].size, 'scale', round(s, 3), 'attacks', len(attacks))


STANCE_SHEETS = os.path.join(ROOT, 'assets-source', 'stance-sheets')
BREATH_FRAMES = 4


def row_frames(sheet, n):
    """The n frames of a single-row sheet, left to right: pieces joined by connected parts, each belonging to the column
    its centre of mass lies in (like sheet_frames, for a 1 x n strip). Specks under 30 px are dropped."""
    from scipy import ndimage
    a = np.array(sheet.getchannel('A')) > 24
    labels, count = ndimage.label(a, structure=np.ones((3, 3)))
    W = a.shape[1]
    cols = {}
    for i, (sy, sx) in enumerate(ndimage.find_objects(labels), start=1):
        piece = labels[sy, sx] == i
        if int(piece.sum()) < 30:
            continue
        ys, xs = np.nonzero(piece)
        cols.setdefault(min(n - 1, int((sx.start + xs.mean()) // (W / n))), []).append((sy, sx, i))
    rgba = np.array(sheet)
    frames = []
    for c in range(n):
        pieces = cols.get(c)
        if not pieces:
            raise SystemExit(f'stance sheet: no figure in column {c + 1} of {n}')
        y0 = min(p[0].start for p in pieces); y1 = max(p[0].stop for p in pieces)
        x0 = min(p[1].start for p in pieces); x1 = max(p[1].stop for p in pieces)
        mask = np.isin(labels[y0:y1, x0:x1], [p[2] for p in pieces])
        crop_ = rgba[y0:y1, x0:x1].copy()
        crop_[~mask] = 0
        frames.append(Image.fromarray(crop_, 'RGBA'))
    return frames


def build_stance(out, slug, disp_h):
    """The user's 'breathing' strip for a hero (or Cruella): 4 frames of the standing pose shifting its weight. Frame 1 replaces the plain
    stance `<slug>.png` (the loop starts and ends on it); frames 2..4 become `<slug>_breath2..4`. One scale for all four frames (from frame 1), so the figure does not change size between them."""
    frames = row_frames(Image.open(os.path.join(STANCE_SHEETS, slug + '.png')).convert('RGBA'), BREATH_FRAMES)
    s = disp_h * TEX / frames[0].height
    for i, f in enumerate(frames[1:], start=2):
        save_png(anchored(f, s), os.path.join(out, f'{slug}_breath{i}.png'))
    save_png(anchored(frames[0], s), os.path.join(out, slug + '.png'))
    print(slug, 'breath', [f.size for f in frames], 'scale', round(s, 3))


def build_lead(out):
    d = folder('Круэлла')
    im = crop(Image.open(os.path.join(SRC, d, os.listdir(os.path.join(SRC, d))[0])).convert('RGBA'))
    resized(im, LEAD[1] * TEX / im.height).save(os.path.join(out, LEAD[0] + '.png'))


def dragon_states():
    d = folder('Дракон')
    keys = [('без голов', 0), ('без одной', 4), ('без двух', 3), ('без трёх', 2), ('без четырёх', 1), ('целый', 5)]
    st = {}
    for f in os.listdir(os.path.join(SRC, d)):
        low = f.lower()
        for k, v in keys:
            if low.startswith('дракон ' + k + ' '):
                st[v] = Image.open(os.path.join(SRC, d, f)).convert('RGBA')
    mount = Image.open(find(d, lambda f: f.startswith('гора'))).convert('RGBA')
    return st, mount


def alpha_mask(im, W, H):
    canvas = Image.new('L', (W, H), 0)
    canvas.paste(im.getchannel('A').point(lambda a: 255 if a > 8 else 0), (0, 0))
    return np.array(canvas) > 0


def best_shift(ref, mov, region_x0, search=140, step=4):
    """Translation (dx,dy) of `mov` that best overlaps `ref`, judged on the right part
    (tail/wing/hind legs) only — heads differ between states and must not steer it."""
    r = ref[:, region_x0:][::step, ::step]
    best, arg = -1, (0, 0)
    for dy in range(-search, search + 1, step):
        for dx in range(-search, search + 1, step):
            m = np.roll(np.roll(mov, dy, 0), dx, 1)[:, region_x0:][::step, ::step]
            score = (r & m).sum() / max(1, (r | m).sum())
            if score > best:
                best, arg = score, (dx, dy)
    # refine at full resolution around the coarse optimum
    r = ref[:, region_x0:]
    cx, cy = arg
    for dy in range(cy - step, cy + step + 1):
        for dx in range(cx - step, cx + step + 1):
            m = np.roll(np.roll(mov, dy, 0), dx, 1)[:, region_x0:]
            score = (r & m).sum() / max(1, (r | m).sum())
            if score > best:
                best, arg = score, (dx, dy)
    return arg, best


def build_mountain(out, clip):
    _, mount = dragon_states()
    m = resized(crop(mount), MOUNT_W * TEX / crop(mount).width)
    if clip > 0:
        keep = round(m.width * (1 - clip))
        arr = np.array(m)
        arr[:, keep:, 3] = 0
        m = Image.fromarray(arr)
        m = m.crop(m.getchannel('A').getbbox())
    m.save(os.path.join(out, 'gold_mountain.png'))
    print('gold_mountain.png clip', clip, 'size', m.size)


def build_dragon(out):
    st, _ = dragon_states()
    W, H = 1408, 768
    norm = {}
    for k, im in st.items():
        r = W / im.width
        norm[k] = im.resize((W, round(im.height * r)), Image.LANCZOS)
    ref_key = 4
    shifted = {}
    pad = 200
    ref_big = Image.new('RGBA', (W + 2 * pad, H + 2 * pad)); ref_big.paste(norm[ref_key], (pad, pad))
    ref_m = alpha_mask(ref_big, W + 2 * pad, H + 2 * pad)
    x0 = int((W + 2 * pad) * 0.5)
    for k, im in norm.items():
        best = None
        # heads differ between states so only the body (tail/wing/legs) is matched;
        # a state that doesn't line up at scale 1 gets a small scale search too
        for sc in ([1.0] if k == ref_key else [1.0] + [round(1 + d / 100, 2) for d in range(-6, 7) if d]):
            cand = im if sc == 1.0 else im.resize((round(im.width * sc), round(im.height * sc)), Image.LANCZOS)
            big = Image.new('RGBA', (W + 2 * pad, H + 2 * pad)); big.paste(cand, (pad, pad))
            (dx, dy), score = ((0, 0), 1.0) if k == ref_key else best_shift(ref_m, alpha_mask(big, W + 2 * pad, H + 2 * pad), x0)
            if best is None or score > best[0]:
                best = (score, sc, dx, dy, big)
            if sc == 1.0 and score > 0.95:
                break
        score, sc, dx, dy, big = best
        print(f'dragon state {k}: scale {sc} shift ({dx},{dy}) overlap {score:.3f}')
        shifted[k] = big.transform(big.size, Image.AFFINE, (1, 0, -dx, 0, 1, -dy), resample=Image.NEAREST)
    boxes = [np.array(im.getchannel('A')) > 8 for im in shifted.values()]
    union = np.any(boxes, axis=0)
    ys, xs = np.where(union)
    box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    s = DRAGON_W * TEX / (box[2] - box[0])
    for k, im in shifted.items():
        resized(im.crop(box), s).save(os.path.join(out, f'dragon_heads{k}.png'))
    print('dragon union box', box, 'size', (box[2] - box[0], box[3] - box[1]))


def build_background(out):
    """Cover-fits the cave picture to the game canvas (scale to canvas height, crop the sides)."""
    path = find_top(lambda f: f.startswith('фон'))
    im = Image.open(path).convert('RGB')
    scale = BG_SIZE[1] / im.height
    im = im.resize((round(im.width * scale), BG_SIZE[1]), Image.LANCZOS)
    x0 = min(max(0, round(BG_CROP_X * scale)), im.width - BG_SIZE[0])
    im.crop((x0, 0, x0 + BG_SIZE[0], BG_SIZE[1])).save(os.path.join(out, 'bg_cave.jpg'), quality=92)
    print('bg_cave.jpg', BG_SIZE, 'crop x0 =', x0, 'of', im.width)


def find_top(pred):
    for f in sorted(os.listdir(SRC)):
        if os.path.isfile(os.path.join(SRC, f)) and pred(f.lower()):
            return os.path.join(SRC, f)
    raise SystemExit('no top-level file in character-refs matching predicate')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(ROOT, 'public', 'assets', 'sprites'))
    ap.add_argument('--only', choices=['heroes', 'lead', 'stance', 'dragon', 'mountain', 'bg'], nargs='+',
                    help='build only these parts (default: heroes lead stance; the dragon alignment takes minutes)')
    ap.add_argument('--mount-clip', type=float, default=MOUNT_CLIP_RIGHT,
                    help='share of the gold mountain cut off its right side (0 = original art)')
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    only = set(args.only or ['heroes', 'lead', 'stance'])
    if 'heroes' in only:
        for prefix, (slug, h, stance, attacks) in HERO_SHEETS.items():
            build_hero_sheet(args.out, prefix, slug, h, stance, attacks)
    if 'lead' in only:
        build_lead(args.out)
    if 'stance' in only:
        for slug, h in [(v[0], v[1]) for v in HERO_SHEETS.values()] + [(LEAD[0], LEAD[1])]:
            build_stance(args.out, slug, h)
    if 'dragon' in only:
        build_dragon(args.out)
    if 'mountain' in only:
        build_mountain(args.out, args.mount_clip)
    if 'bg' in only:
        build_background(args.out)
    print('done ->', args.out)
