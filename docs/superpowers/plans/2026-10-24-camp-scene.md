# Лагерь гоблинов: широкая тёмная живая сцена + хэллоуинский HUD — план работ

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Игровая сцена шире и темнее, гоблины полукругом у костра с палаткой и тотемом, герои вольно вдоль тропы, дыхание по очереди, серии ударов, хэллоуинский HUD.

**Architecture:** `PenScene` получает отдельный «мировой» зум камеры (`WORLD.ZOOM` = 0.78): весь мир на ~28 % шире, логические координаты и текстуры персонажей не меняются, героям «уменьшение» достаётся даром. `HUDScene` — отдельная сцена со своей камерой, её это не затрагивает. Всё новое статично или живёт на таймерах/кадрах, а не на твинах, чтобы `PowerSaver` оставался на низкой частоте кадров.

**Tech Stack:** Phaser 4, Vite, TypeScript; Python + Pillow для сборки ассетов. Тест-раннера нет (`CLAUDE.md`), проверка — `npx tsc --noEmit -p tsconfig.json` + превью в браузере (`__debug`), как в разделе Verification в `CLAUDE.md`.

**Spec:** `docs/superpowers/specs/2026-10-24-camp-scene-design.md`

## Global Constraints

- Логический холст остаётся `GAME.WIDTH × GAME.HEIGHT` = 1280×720 (16:9), `RENDER_SCALE` выбирается `core/Quality.ts`; прокрутки нет.
- Не добавлять свечение и тени **на персонажах**; свет костра лежит на фоне/земле под персонажами.
- Механика данных не меняется: `DRAGON_HEAD_LOST`, `DRAGON_DEFEATED`, `PROGRESS_CHANGED`, baseline первого опроса, имена событий и полей.
- Любой `add.text` с `resolution: GAME.RENDER_SCALE`; новая сцена — первой строкой `fitCameraToGame`/`fitCameraToWorld`.
- Дыхание и мерцание — на таймерах/кадрах анимации, **не на твинах** (`PowerSaver.tweenMotion` считает любой обычный твин активным движением и держит 30 к/с).
- Не править `public/assets/sprites/` руками; всё собирается скриптами из `assets-source/`. Исходники коммитим.
- Не деплоить и не пушить без явного «да» владельца. Ветка работы: `camp-scene` от `master`.
- Размеры (мои решения из спеки): герой ≈ 195 мировых px; гоблины ≈ 190, вождь ≈ 234 (+20 %); мир видно 1641×923 при зуме 0.78.

## Review Focus

1. Загрузка страницы посреди недели: baseline без анимаций, побеждённых гоблинов уже нет, их добыча лежит в куче у Круэллы на новом месте (проверка в Task 3).
2. Несколько оплат разных отделов подряд: серии ударов не накладываются на гибель гоблина и не обрывают друг друга (Task 6).
3. Герой в состоянии `fallOver`/`doze` (простой) получает дыхание или оплату: дыхание его пропускает, оплата будит (Task 5).
4. Слабый ноутбук `?quality=low&scale=1`: на покое `__debug.power().mode` остаётся `idle`, а при дыхании не `active` (Task 5).
5. Баннер победы и счётчик остаются читаемыми на тёмном фоне при самых узком и самом широком `RENDER_SCALE` (Task 7).

---

## Task 0: Ветка и исходники в репозитории

**Files:**
- Create: `game/assets-source/stance-sheets/` (копии нужных листов из `heroes/Стойка/`)
- Add to git: `game/assets-source/camp/`, `game/assets-source/HUD/`, `docs/superpowers/`

**Interfaces:**
- Produces: `game/assets-source/stance-sheets/<hero_slug>.png` — 4 кадра в строку на героя, `lead_cruella.png` для Круэллы (определить по картинкам, какой лист чей; сомнительные показать владельцу).

- [ ] **Step 1:** `git switch -c camp-scene`.
- [ ] **Step 2:** Просмотреть 7 листов в `heroes/Стойка/` и `game/assets-source/camp/`, соотнести листы с `hero_lion…hero_minion` и `lead_cruella`; файл `grok-image-…` (2048×512) и «снежная леди» определить по виду; скопировать листы в `stance-sheets/` под именами слагов. Если соответствие неочевидно — показать владельцу таблицу «файл → герой» и ждать ответа.
- [ ] **Step 3:** Commit: `git add game/assets-source docs/superpowers && git commit -m "Add camp, HUD and breathing-sheet sources; scene design and plan"`.

---

## Task 1: Мировая камера PenScene

**Files:**
- Modify: `game/src/game/core/Constants.ts` (новый `WORLD`), `game/src/game/core/Render.ts`, `game/src/game/scenes/PenScene.ts`, `game/src/game/systems/Fx.ts:119` (`emitFloatingAmount`)

**Interfaces:**
- Produces in `Constants.ts`: `export const WORLD = { ZOOM: 0.78, W: GAME.WIDTH / 0.78, H: GAME.HEIGHT / 0.78, X0: -(W - GAME.WIDTH) / 2, Y0: -(H - GAME.HEIGHT) / 2 }` (числа как константы, не вычисляемые поля с `this`).
- Produces in `Render.ts`: `fitCameraToWorld(scene: Scene): void` — `setOrigin(0,0).setZoom(GAME.RENDER_SCALE * WORLD.ZOOM).setScroll(WORLD.X0, WORLD.Y0)`; `worldToHud(x: number, y: number): { x: number; y: number }` — перевод мировой точки PenScene в логические координаты экрана HUD (`(x − X0) · ZOOM`, `(y − Y0) · ZOOM`).
- Consumes: `fitCameraToGame` остаётся для остальных сцен.

- [ ] **Step 1:** Добавить `WORLD` и обе функции в `Render.ts`.
- [ ] **Step 2:** В `PenScene.create()` заменить `fitCameraToGame(this)` на `fitCameraToWorld(this)`; фон временно растянуть на весь мир: `add.image(WORLD.X0 + WORLD.W/2, WORLD.Y0 + WORLD.H/2, 'bg_forest').setDisplaySize(WORLD.W, WORLD.H)`.
- [ ] **Step 3:** `PenScene.onMoneyIn`: цель летящей суммы (сейчас `HUD.BAR_X + …`, HUD-координаты) пропустить через `worldToHud` в обратную сторону (`hudToWorld`): сумма из мира летит к полосе в HUD. Добавить `hudToWorld(x, y)` в `Render.ts` по формуле, обратной `worldToHud`.
- [ ] **Step 4:** Проверка: `cd game && npx tsc --noEmit -p tsconfig.json` — без ошибок; `npm run dev`, в браузере `__debug.poller.stop(); __debug.hit('hero_lion', 60000)` — герои меньше, чем были, сумма летит к полосе HUD.
- [ ] **Step 5:** Commit: `feat: PenScene camera shows a wider world (WORLD.ZOOM)`.

---

## Task 2: Широкий тёмный фон

**Files:**
- Modify: `game/tools/build-background.py`, затем пересборка `public/assets/sprites/bg_forest.jpg`
- Modify: `game/src/game/scenes/PenScene.ts` (размер фона), `game/src/game/scenes/Preloader.ts` (заглушка фона — размер мира)

**Interfaces:**
- Produces: `bg_forest.jpg` размером 2461×1384 (= `WORLD.W·1.5 × WORLD.H·1.5`, та же плотность 1,5 px на мировую единицу); покрывает мир от `(WORLD.X0, WORLD.Y0)`. Исходное 1920×1080-полотно кладётся так, чтобы его кадр, где раньше лежал экран 1280×720, совпал с мировыми координатами 0..1280×0..720 (то есть со смещением `−X0·1.5`, `−Y0·1.5` пикселей). Дерево-лицо остаётся там, где стоит за героями (`TREE_X`).

- [ ] **Step 1:** В `build-background.py` ввести `WORLD_SCALE = 0.78`, размер холста и смещение, как выше; слои собирать на увеличенном холсте.
- [ ] **Step 2:** Достройка краёв: по бокам — зеркалирование крайних 540 px каждого слоя со смещением (чтобы не было видимого шва); сверху/снизу — растянуть верхнюю/нижнюю строки слоёв `sky`/`jungle_bg`/`grass&road` и размыть; всё это скроет затемнение виньетки в следующем шаге.
- [ ] **Step 3:** Затемнение: умножить итог на вечерний тон (≈ ×0.55 яркости, сдвиг к синему) и добавить виньетку по краям; параметры вынести в константы `DARKEN`, `VIGNETTE` вверху скрипта.
- [ ] **Step 4:** Запустить `python tools/build-background.py`; ожидаемый вывод: `bg_forest.jpg (2461, 1384)`.
- [ ] **Step 5:** В `PenScene` фон ставится на `(WORLD.X0 + WORLD.W/2, WORLD.Y0 + WORLD.H/2)` с `setDisplaySize(WORLD.W, WORLD.H)`; заглушка в `Preloader.onLoadError` делает текстуру размером `WORLD.W × WORLD.H`.
- [ ] **Step 6:** Скриншоты превью (`mcp__Claude_Browser__computer screenshot`) на `?scale=1` и `?scale=2`; швов и пустоты нет.
- [ ] **Step 7:** Commit: `feat: wider, darker forest background`.

---

## Task 3: Новая расстановка, размеры, лагерь — **контрольная точка с владельцем**

**Files:**
- Modify: `game/src/game/core/Constants.ts` (`HERO.SLOTS`, `HERO.LEAD`, `HORDE.*`), `game/src/game/objects/Horde.ts`, `game/src/game/scenes/PenScene.ts`, `game/src/game/scenes/Preloader.ts`
- Create: `game/tools/build-camp.py`, `game/public/assets/sprites/camp_tent.png`, `camp_totem.png`
- Create: `game/src/game/objects/CampProps.ts`

**Interfaces:**
- Produces in `Constants.ts`: `HORDE.GOBLIN_HEIGHT = 190` и `HORDE.CHIEF.height = 234` (масштаб считается как `height / def.topPx`, чтобы тяжёлый Шаман не вырос), `HORDE.CAMP = { x, y }` — центр костра, `HORDE.GOBLINS[5]` — полукругом вокруг костра лицом к героям (передний край первого гоблина слева), `HORDE.CHIEF` за спинами, `HORDE.TENT`, `HORDE.TOTEM` — позиции/масштабы, `HERO.SLOTS[6]` — вольный разброс вдоль тропы (разные `x`/`y`, каждый шаг ≥ ширины героя ≈ 120, не по шахматке).
- Produces: `class CampProps { constructor(scene: Scene) }` — палатка и тотем с `depth = y` основания.
- `Horde.strikeFrontX()` и `LOOT[5]` пересчитываются под новые позиции (куча у Круэллы не налезает на героев).

- [ ] **Step 1:** `build-camp.py`: масштабировать `dino_tribe_camp_hide_tent_hut_01.png` и `…bone_skull_totem_01.png` в 2× экранный размер (палатка ≈ по плечо вождя, тотем ≈ 1,5 гоблина), сохранить палитровыми PNG в `public/assets/sprites/`; запустить, ожидать две строки с размерами.
- [ ] **Step 2:** `Preloader` грузит `camp_tent`, `camp_totem`; `CampProps` рисует их; создаётся в `PenScene.create()` до `Horde`.
- [ ] **Step 3:** `Horde.ts`: масштабы гоблинов/вождя берутся из `GOBLIN_HEIGHT / def.topPx` и `CHIEF.height / def.topPx`; костёр на `HORDE.CAMP` в центре полукруга.
- [ ] **Step 4:** Расставить `HERO.SLOTS`, `HERO.LEAD`, `HORDE.GOBLINS`, `HORDE.CHIEF`, `HORDE.LOOT`, `HORDE.TENT/TOTEM`; все ноги героев и гоблинов на проходимой дороге (на фоне она проходит примерно по мировым y 460–600; проверить по скриншоту, фон был сдвинут).
- [ ] **Step 5:** Проверка baseline (Review Focus 1): `__debug.poller.stop(); __debug.setRatio(0.45)` после перезагрузки страницы — гоблины 0 и 1 уже побеждены (их нет на сцене), их добыча лежит в куче у Круэллы.
- [ ] **Step 6:** Проверка удара: `__debug.hit('hero_yoda', 80000)` — герой добегает до переднего края ближайшего гоблина и бьёт, не проваливаясь за костёр.
- [ ] **Step 7:** Скриншоты сцены (покой, удар, победа `setRatio(1)`) и **показать владельцу, ждать «да»** (контрольная точка спеки). Не переходить к Task 4 без ответа.
- [ ] **Step 8:** Commit: `feat: new camp layout, sizes, tent and totem`.

---

## Task 4: Свет костра

**Files:**
- Create: `game/src/game/objects/Firelight.ts`
- Modify: `game/src/game/objects/Horde.ts` (костёр), `game/src/game/scenes/PenScene.ts`, `game/src/game/scenes/Preloader.ts` (нет — текстура генерируется)

**Interfaces:**
- Produces: `class Firelight { constructor(scene: Scene, fire: Phaser.GameObjects.Sprite) }` — мягкий радиальный градиент тёплого цвета (`generateTexture` из `Graphics`/canvas один раз), `blendMode ADD`, `depth = fire.depth − 1` (под всеми персонажами; персонажи не подсвечиваются), мерцание — смена `alpha`/`scale` на событии `animationupdate` анимации `campfire` (8 к/с), без твинов и таймеров.
- Consumes: `HORDE.CAMP`, `HORDE.CAMPFIRE`.

- [ ] **Step 1:** Реализовать `Firelight`; параметры (радиус ≈ 260 мировых px, цвет `0xff8a3d`, диапазон alpha 0.35–0.55) в `HORDE.FIRELIGHT`.
- [ ] **Step 2:** Подключить в `Horde` после создания спрайта костра.
- [ ] **Step 3:** Проверка: скриншот покоя; `__debug.power()` → `mode: 'idle'`, `renderedFps` ≈ 8–10 (костёр сам даёт кадры, как раньше).
- [ ] **Step 4:** Commit: `feat: flickering firelight under the characters`.

---

## Task 5: Дыхание по очереди

**Files:**
- Modify: `game/tools/build-sprites.py` (+ `--only stance`), `game/src/game/config/heroRoster.json` (`breath`: число кадров), `game/src/game/systems/RosterConfig.ts`, `game/src/game/scenes/Preloader.ts`, `game/src/game/objects/HeroSprite.ts`, `game/src/game/objects/LeadSprite.ts`, `game/src/game/objects/Horde.ts`, `game/src/game/scenes/PenScene.ts`
- Create: `game/src/game/systems/BreathRelay.ts`

**Interfaces:**
- Produces: текстуры `<sprite>_breath1..4` (из `assets-source/stance-sheets/`, на той же линии ног и в том же масштабе, что `<sprite>`), `heroRoster.json` поле `"breath": 4`.
- Produces: `interface Breather { canBreathe(): boolean; breathe(onDone: () => void): void }` в `BreathRelay.ts`; `class BreathRelay { constructor(scene: Scene, breathers: Breather[]); start(): void }` — случайный порядок «по кругу», один дышащий за раз, пауза `BREATH.GAP_MS` (1500–3500) между передачами; пропускает тех, у кого `canBreathe()` ложно.
- Produces in `Constants.ts`: `BREATH = { FRAME_MS: 240, GAP_MS: [1500, 3500] }`.
- `HeroSprite.breathe(onDone)` / `LeadSprite.breathe(onDone)`: проигрывает `breath1→breath2→breath3→breath4→стойка` таймерами (`scene.time.delayedCall`, **без твинов**); `HeroSprite.canBreathe()` = `canSway()`.
- `Horde`: для гоблинов и вождя, у которых листов нет, `breathe(onDone)` делает 3 ступени `setScale` (1 → 1,012 → 1 по `y`) таймерами; вождь не дышит в позе сидя/рыка.

- [ ] **Step 1:** В `build-sprites.py` добавить режим `stance`: разрезать 4 кадра листа (по связным частям, как делает `build_hero_sheet`), поставить на холст стойки той же высоты и линии ног, сохранить `<slug>_breath1..4.png`; ожидаемый вывод — по 4 файла на героя, одинаковые размеры холстов.
- [ ] **Step 2:** `Preloader` грузит `_breathN`; отсутствие кадра — не ошибка (как у `_hit`).
- [ ] **Step 3:** Реализовать `Breather` у героя, Круэллы, гоблинов, вождя; убрать `startIdleSway` для героев/Круэллы (случайный наклон заменён дыханием; сама функция остаётся, если ею кто-то ещё пользуется, иначе удалить).
- [ ] **Step 4:** `PenScene`: `new BreathRelay(this, [...heroes, lead, ...goblins, chief]).start()`; гоблины/вождь отдают `Breather` через `Horde.breathers(): Breather[]`.
- [ ] **Step 5:** Проверка CPU (Review Focus 3 и 4): покой с дыханием — `__debug.power().mode === 'idle'` и `renderedFps` ≤ 12; `__debug.mood().dropOne()` — упавший герой не дышит, оплата его будит.
- [ ] **Step 6:** Commit: `feat: breathing relay (timer-driven, idle frame rate)`.

---

## Task 6: Серия ударов

**Files:**
- Modify: `game/src/game/core/Constants.ts` (`HERO`), `game/src/game/objects/HeroSprite.ts:234-310` (`playHit`), `game/src/game/scenes/PenScene.ts:90-107` (`onMoneyIn`), `game/src/game/objects/Horde.ts` (`reactToHit`)

**Interfaces:**
- Produces in `Constants.ts`: `HERO.BLOWS = { MIN: 2, MAX: 4, STEP_DELTA: 60_000, GAP_MS: 260 }`; функция `blowsFor(delta: number): number` = `clamp(MIN + floor(delta / STEP_DELTA), MIN, MAX)` (`delta` < 60 000 → 2, 60–119 тыс. → 3, ≥ 120 тыс. → 4; числа настраиваются).
- `HERO.HIT_DURATION_MS` пересчитывается **на максимальную серию**: `WINDUP + RUN + RECOIL + (MAX − 1)·GAP_MS + RETURN` (≈ 1,6 с) — от неё зависит задержка гибели гоблина в `DataPollingService.ts:120`; остаётся функцией фаз, не отдельным числом.
- `HeroSprite.playHit(delta: number, strikeFrontX: number, onBlow: (index: number, total: number) => void): void` — первый удар приходит в `IMPACT_MS` (как сейчас), следующие каждые `GAP_MS`: кадры берутся из следующих атак героя по кругу (`windup_k → blow_k`), эффекты (искры, кольцо, тряска) на каждый удар; `onBlow` вызывается в момент каждого удара.

- [ ] **Step 1:** Расширить `HERO` и `blowsFor`; пересчитать `HIT_DURATION_MS`.
- [ ] **Step 2:** Переписать цепочку `playHit`: после общего разбега — N ударов с мини-отскоком между ними, потом возврат. Кадры и `strikeX` вычислять от текущего blow-кадра.
- [ ] **Step 3:** `PenScene.onMoneyIn`: вместо `delayedCall(IMPACT_MS, …)` для `playHitThud`, `horde.reactToHit()`, `lead.playCheer()` — всё это в `onBlow` (`lead.playCheer()` только на первом ударе).
- [ ] **Step 4:** Проверка (Review Focus 2): `__debug.hit('hero_lion', 150000)` — 4 удара, гоблин реагирует четырежды; `__debug.setRatio(0.4)` с последующими `hit` из разных отделов — гоблин падает после серий, а не посередине (`horde.goblins[i].alive`).
- [ ] **Step 5:** `npx tsc --noEmit -p tsconfig.json`; Commit: `feat: strike series scaled by sale size`.

---

## Task 7: Хэллоуинский HUD

**Files:**
- Create: `game/tools/build-hud.py`, `game/public/assets/hud/hud_bar_left.png`, `hud_bar_mid.png`, `hud_bar_right.png`, `hud_frame_big.png`, `hud_panel_small.png`
- Modify: `game/src/game/core/Constants.ts` (`HUD`), `game/src/game/scenes/HUDScene.ts`, `game/src/game/objects/Leaderboard.ts`, `game/src/game/scenes/Preloader.ts`, `game/public/style.css` (шрифт, если нужен `@font-face`)

**Interfaces:**
- Consumes: `assets-source/HUD/Готическая хэллоуинская панель с тыквой и фонарём.png` (1933×814, непустая область `bbox (27,72,1915,773)`, готовая пустая полоса) и `Хэллоуинские неоновые игровые рамки UI.png` (большая рамка и малая панель).
- Produces in `build-hud.py`: полоса режется на левый край (тыква), правый (фонарь), и среднюю полосу (однородный кусок, растягивается по ширине); большая рамка и малая панель вырезаются по bbox с прозрачностью. Все — палитровые/PNG-24 в `public/assets/hud/`, двойной размер экранного.
- Produces in `Constants.ts`: `HUD = { BAR_X, BAR_Y, BAR_WIDTH (на всю ширину, как сейчас: GAME.WIDTH − 64), BAR_HEIGHT, FRAME_TRACK_INSET: { l, r, t, b }, TITLE_Y, PANEL_X, PANEL_Y, COLORS: { fillA, fillB, text, accent } }` — всё положение/размеры/цвета в одном объекте, как просил владелец («двигать как удобно»).
- `HUDScene.drawTrack()` рисует три картинки (левый, средний растянутый `setDisplaySize`, правый) на `BAR_X..BAR_X+BAR_WIDTH`; `drawFill(ratio)` рисует зелёную заливку (`fillGradientStyle`, цвета из `HUD.COLORS`) внутри `FRAME_TRACK_INSET`; `drawDayMarks()` ложится поверх.
- Баннер победы = `hud_frame_big`; рейтинг и счётчик гоблинов на `hud_panel_small`.
- Шрифт: готический с кириллицей, подключается как веб-шрифт локально (файл в `public/assets/fonts/`, лицензия свободная — OFL; конкретный шрифт выбрать и показать владельцу); если не загрузился — прежний `Arial Black`.

- [ ] **Step 1:** Написать `build-hud.py`, запустить, ожидать 5 файлов; визуально проверить срезы (края полосы без обрезанных шипов).
- [ ] **Step 2:** `Preloader` грузит `hud_*`; `HUDScene` строит полосу, заливку, баннер, панели из них; удалить `drawTrack` на `Graphics` и радиусы (`BAR_RADIUS`).
- [ ] **Step 3:** Перенести цвета текстов на `HUD.COLORS`; подключить шрифт; убедиться, что `emitFloatingAmount` летит к `HUD.BAR_X + BAR_WIDTH/2` (через `hudToWorld`).
- [ ] **Step 4:** Проверка (Review Focus 5): `setRatio(0.2/0.6/1.0)` — заливка растёт внутри рамки, деления «день 1…5» читаются, при `1.0` появляется баннер на большой рамке; `?scale=1` и `?scale=2`.
- [ ] **Step 5:** Commit: `feat: Halloween HUD built from the frame sheet`.

---

## Task 8: Документация и финальная проверка

**Files:**
- Modify: `CLAUDE.md`, `docs/NAVIGATOR.md`, `docs/horde-track.md`, `docs/MAP.md`, `docs/gameplan.md`, `docs/tech.md`

- [ ] **Step 1:** Обновить доки: `WORLD`, расстановка, свет, дыхание (`BreathRelay`), серии ударов, HUD, новые файлы и скрипты (`build-camp.py`, `build-hud.py`), правило «дыхание — таймеры, не твины».
- [ ] **Step 2:** `npx tsc --noEmit -p tsconfig.json` и `npm run build` — без ошибок.
- [ ] **Step 3:** Прогон по сценариям: покой, `hit` ×3 из разных отделов, `setRatio(0.4/0.8/1)`, простой (`?idle=1`), `growl`; `__debug.power()` в покое — `idle`.
- [ ] **Step 4:** Commit: `docs: camp scene, firelight, breathing, strike series, Halloween HUD`.
- [ ] **Step 5:** Сообщить владельцу, что ветка `camp-scene` готова; **деплой (`npm run deploy`) и слияние с `master` — только по его явному «да».**
