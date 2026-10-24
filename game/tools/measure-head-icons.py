#!/usr/bin/env python
"""Writes `icon: [x, y, w, h]` (texture px of the hero's stance picture) into src/game/config/heroRoster.json: the box of the hero's
FACE that the leaderboard crops into its little icons.
Run from game/:  python tools/measure-head-icons.py

The boxes are picked by eye from the stance pictures (a crop from the top of the figure showed crowns, hats and hair instead of
faces, and cut faces in half). If a hero's picture changes (new art, another scale), re-pick its box: crop the stance picture with
the numbers below and look at the result.
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROSTER = os.path.join(ROOT, 'src', 'game', 'config', 'heroRoster.json')

# [x, y, w, h] in the stance picture's pixels: eyes, nose/mouth and the chin inside, hats/crowns/hair outside.
FACE_BOXES = {
    'hero_lion': [124, 36, 100, 92],
    'hero_scrooge': [116, 84, 100, 84],
    'hero_grinch': [104, 52, 120, 92],
    'hero_yoda': [88, 62, 84, 84],
    'hero_neznaika': [122, 62, 106, 84],
    'hero_minion': [96, 62, 146, 92],
}


def main():
    with open(ROSTER, encoding='utf-8') as f:
        roster = json.load(f)
    lines = ['{', '    "heroes": [']
    for i, hero in enumerate(roster['heroes']):
        if hero['slug'] in FACE_BOXES:
            hero['icon'] = FACE_BOXES[hero['slug']]
        comma = ',' if i < len(roster['heroes']) - 1 else ''
        lines.append('        ' + json.dumps(hero, ensure_ascii=False) + comma)
    lines += ['    ]', '}']
    with open(ROSTER, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')
    print('icon boxes written for', ', '.join(FACE_BOXES))


if __name__ == '__main__':
    main()
