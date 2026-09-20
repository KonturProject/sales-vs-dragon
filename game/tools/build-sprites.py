#!/usr/bin/env python
"""Builds game sprites in public/assets/sprites from the hand-finished PNGs in
assets-source/character-refs. Run from game/:  python tools/build-sprites.py [--only heroes lead dragon mountain bg] [--mount-clip F] [--out DIR]

Sources are already transparent (Photoshop cut-outs), so no background removal
here — only: crop to alpha bbox, put every pose of a hero at one common pixel
scale, downscale with LANCZOS to 2x the on-screen size (Phaser renders them at
scale 0.5 with NEAREST; shrinking 1000px art 6x with NEAREST alone is noisy),
and align the six dragon states so heads swap in place.
"""
import argparse, os, sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets-source', 'character-refs')
TEX = 2  # texture px per on-screen px (game renders at scale 1/TEX)

# folder prefix -> (slug, on-screen standing height px, hit-pose scale factors relative to the standing sprite)
# Pose factors were tuned by eye: poses were drawn at a smaller scale than the standing sprite.
HEROES = {
    'СР1':  ('hero_lion',     200, [1.50, 1.62, 1.35]),
    'СР2':  ('hero_scrooge',  190, [1.00]),
    'СР3':  ('hero_grinch',   205, [2.35, 2.35, 2.35]),
    'СР 5': ('hero_yoda',     175, [1.60, 1.60, 1.60]),
    'СР6':  ('hero_neznaika', 195, [2.10, 2.10, 2.10]),
    'СР9':  ('hero_minion',   165, [1.00, 1.00, 1.00]),
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


def build_hero(out, prefix, slug, disp_h, factors):
    d = folder(prefix)
    stand = crop(Image.open(find(d, lambda f: f in ('персонаж.png',) or f.endswith('персонаж.png'))).convert('RGBA'))
    s = disp_h * TEX / stand.height
    resized(stand, s).save(os.path.join(out, slug + '.png'))
    poses = sorted(f for f in os.listdir(os.path.join(SRC, d)) if f.lower().startswith('анимация') and 'не трогать' not in f.lower())
    for i, f in enumerate(poses[:len(factors)]):
        pose = crop(Image.open(os.path.join(SRC, d, f)).convert('RGBA'))
        resized(pose, s * factors[i]).save(os.path.join(out, f'{slug}_hit{i + 1}.png'))
    print(slug, 'standing', stand.size, 'poses', len(poses))


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
    ap.add_argument('--only', choices=['heroes', 'lead', 'dragon', 'mountain', 'bg'], nargs='+',
                    help='rebuild only these parts (the dragon alignment takes minutes)')
    ap.add_argument('--mount-clip', type=float, default=MOUNT_CLIP_RIGHT,
                    help='share of the gold mountain cut off its right side (0 = original art)')
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    only = set(args.only or ['heroes', 'lead', 'dragon', 'mountain', 'bg'])
    if 'heroes' in only:
        for prefix, (slug, h, factors) in HEROES.items():
            build_hero(args.out, prefix, slug, h, factors)
    if 'lead' in only:
        build_lead(args.out)
    if 'dragon' in only:
        build_dragon(args.out)
    if 'mountain' in only:
        build_mountain(args.out, args.mount_clip)
    if 'bg' in only:
        build_background(args.out)
    print('done ->', args.out)
