#!/usr/bin/env python
"""Measures where each hero's head is in its stance picture and writes `icon: [x, y, w, h]` (texture px) into
src/game/config/heroRoster.json — the leaderboard crops its little head icons from these boxes.
Run from game/ after the hero sprites are built:  python tools/measure-head-icons.py

The box is cut from the figure's top: its height is HEAD_SHARE of the figure's height, centred on where the opaque pixels of that
top part sit horizontally (hats, hair and manes are part of the head, so they stay inside), and a little wider than tall.
"""
import json
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPRITES = os.path.join(ROOT, 'public', 'assets', 'sprites')
ROSTER = os.path.join(ROOT, 'src', 'game', 'config', 'heroRoster.json')

HEAD_SHARE = 0.27   # of the figure's height
ASPECT = 1.15       # width / height of the box


def head_box(path):
    alpha = np.array(Image.open(path).convert('RGBA').getchannel('A')) > 24
    rows = np.nonzero(alpha.any(axis=1))[0]
    top, bottom = int(rows[0]), int(rows[-1])
    h = max(8, round((bottom - top + 1) * HEAD_SHARE))
    cols = np.nonzero(alpha[top:top + h].any(axis=0))[0]
    # the middle of the opaque part of the head rows, weighted by how much is opaque in each column
    weights = alpha[top:top + h].sum(axis=0)
    cx = float((np.arange(alpha.shape[1]) * weights).sum() / max(1, weights.sum()))
    w = min(round(h * ASPECT), alpha.shape[1])
    x = int(round(min(max(cx - w / 2, 0), alpha.shape[1] - w)))
    return [x, top, w, h]


def main():
    with open(ROSTER, encoding='utf-8') as f:
        roster = json.load(f)
    for hero in roster['heroes']:
        if hero['lead']:
            continue
        hero['icon'] = head_box(os.path.join(SPRITES, hero['sprite'] + '.png'))
        print(hero['slug'], hero['icon'])
    text = json.dumps(roster, ensure_ascii=False, indent=4)
    # keep the file's one-hero-per-line shape
    lines = ['{', '    "heroes": [']
    for i, hero in enumerate(roster['heroes']):
        comma = ',' if i < len(roster['heroes']) - 1 else ''
        lines.append('        ' + json.dumps(hero, ensure_ascii=False) .replace('": ', '": ').replace(', "', ', "') + comma)
    lines += ['    ]', '}']
    with open(ROSTER, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')


if __name__ == '__main__':
    main()
