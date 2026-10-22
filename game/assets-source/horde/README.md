# Исходники орды

Из этих файлов `tools/build-horde.py` собирает `public/assets/sprites/horde/` и `src/game/config/horde.json`
(пересборка из `game/`: `python tools/build-horde.py`). Лежат в репозитории, чтобы орда собиралась на любой машине.

| Папка | Файлы | Откуда |
|---|---|---|
| `goblin-scout/` | `idle_1`, `hurt_front`, `die`, `attack_1` | hsdsz «Goblin Scout»: https://hsdsz.itch.io/goblin-scout-2d-animated-corrupted-marsh-enemy-pack |
| `goblin-shaman/` | `idle_1`, `hurt_top`, `die_1`, `attack_2` (`walk_1` пока не используется) | hsdsz «Goblin Shaman»: https://hsdsz.itch.io/goblin-shaman-2d-animated-dark-fantasy-enemy-pack |
| `goblin-thrower/` | `idle_1`, `attack_1` | hsdsz «Goblin Thrower»: https://hsdsz.itch.io/goblin-thrower-2d-animated-fantasy-enemy |
| `goblin-chief/` | `idle_4`, `hurt_1`, `attack_1` | hsdsz «Goblin Chief»: https://hsdsz.itch.io/goblin-chief-2d-animated-dual-blade-boss |
| `goblin-chief/` | `sit.png` | нарисован для этой игры (ChatGPT по кадру вождя + доработка): две позы «сидит и плачет», лицом влево |
| `gold-bag/` | `game_icons_coin_set.png` (рисованные: два сундука, мешок, стопка монет, монета), `sheet.png` (пиксельные 16×16: монеты, кубок, корона, слитки, мечи) | сокровища у ног гоблинов; `bag-of-coins.png` (OpenGameArt, CC0) больше не используется |

Листы hsdsz — сетка кадров 400×400, персонаж смотрит вправо (скрипт отзеркалит). Каких анимаций у кого нет
(у Метателя — ранения и смерти), то игра доигрывает кодом: вздрагивание, падение навзничь.
