# NAVIGATOR — читать первым

Справочник «что где лежит, за что отвечает, кто использует». Цель: не искать по репозиторию. Сначала сюда, потом
в нужный файл. Строки кода — примерные, ищи по имени. Обновлять при каждом добавлении/переносе файла.

Корень репозитория: `Dev Claude/sales vs dragon/` (GitHub `KonturProject/sales-vs-dragon`). Всё, что запускается, —
из `game/`. Игра: «Отделы против орды» (Phaser 4 + Vite + TS).

## 1. Я хочу… → иду сюда

| Задача | Файл(ы) |
|---|---|
| Поменять цифры раскладки/таймингов (позиции, масштабы, тайминги, пороги простоя, опрос) | `game/src/game/core/Constants.ts` (`HORDE`, `HERO`, `DRAGON`, `IDLE`, `HUD`, `FX`, `POLL`) |
| Что происходит с гоблинами/вождём/сокровищами/костром | `game/src/game/objects/Horde.ts` |
| Как герой бежит и бьёт, падает, засыпает | `game/src/game/objects/HeroSprite.ts` |
| Реакция на событие (продажа, потеря гоблина, победа, команда админа) в сцене | `game/src/game/scenes/PenScene.ts` (`onMoneyIn`, `onProgressChanged`, `onDragonHeadLost`, `onDragonDefeated`, `onAdminCommand`) |
| Полоса недели, счётчик гоблинов, баннер победы, рейтинг, конфетти | `game/src/game/scenes/HUDScene.ts` (+ `objects/Leaderboard.ts`) |
| Откуда берутся данные, diff, расчёт «голов» | `game/src/game/systems/DataPollingService.ts`, `core/GameState.ts` |
| Простой команды (герои падают, вождь рычит сам) | `game/src/game/systems/IdleMood.ts` |
| Частота кадров / лёгкость для слабых ноутбуков | `core/Quality.ts`, `core/PowerSaver.ts` |
| Звуки | `game/src/game/systems/Audio.ts` |
| Частицы, вспышки, конфетти, покачивание | `game/src/game/systems/Fx.ts` |
| Загрузка текстур, плейсхолдеры | `game/src/game/scenes/Preloader.ts` |
| Какой отдел → какой герой | `game/src/game/config/ropMapping.json`, `heroRoster.json`, `systems/RosterConfig.ts` |
| Админка (вкладки, кнопки анимаций, PIN) | `game/admin.html`, `game/src-admin/main.ts`, `api.ts`, `styles.css` |
| Бэкенд (таблица, план, команды, PIN) | `apps-script/Code.gs` (деплой руками!), тесты `apps-script/test/`, описание `apps-script/README.md` |
| Пересобрать героев/Круэллу | `game/tools/build-sprites.py` ← `assets-source/hero-sheets/`, `character-refs/` |
| Пересобрать гоблинов/вождя/сокровища | `game/tools/build-horde.py` ← `assets-source/horde/` |
| Пересобрать фон/костёр | `game/tools/build-background.py` ← `assets-source/background/` |
| Задеплоить | `cd game && npm run deploy` (только по явному «да» пользователя) |

## 2. Документы (что в каком)

| Файл | Что внутри | Когда читать |
|---|---|---|
| `CLAUDE.md` (корень) | Команды, архитектура, гочи, правила проекта. Грузится автоматически | всегда уже в контексте |
| `docs/NAVIGATOR.md` | этот файл | первым |
| `docs/MAP.md` | Дерево репо, таблица спрайтов, бэкенд (ссылки на таблицу и Web App), статус деплоя | нужны ссылки/деплой |
| `docs/horde-track.md` | **Текущая** концепция: правила орды, сокровища, сцена, ассеты, пайплайн, находки | правишь орду/фон/ассеты |
| `docs/gameplan.md` | Концепция, отделы→герои, чек-лист «готово/открыто» | статус работ |
| `docs/tech.md` | Технические решения и обоснования (рендер, текст, производительность, простой, админка, отладка, механика голов) | меняешь архитектуру |
| `docs/dragon-track.md` | История: прежний дракон (механика данных та же) | почти никогда |
| `apps-script/README.md` | Таблица API бэкенда, ручной деплой | меняешь бэкенд |
| `game/assets-source/horde/README.md` | Источники/ссылки/лицензии ассетов орды | докачка ассетов |
| `game/README.md`, `game/LICENSE` | **Остатки шаблона** phaserjs/template-vite-ts (не про наш проект) | не читать |

## 3. Поток данных и событий

```
Google Sheet ──> apps-script/Code.gs (Web App) ──GET раз в 15с──> DataPollingService
   ▲                    ▲                                              │ diff byRop
   │ addSale/setPlan    │ POST (PIN)                                   ▼
   └────────── admin.html + src-admin ─ command ─> (команды в GET)   EventBus  (core/EventBus.ts)
                                                                        │ MONEY_IN, PROGRESS_CHANGED,
                                                                        │ DRAGON_HEAD_LOST, DRAGON_DEFEATED,
                                                                        │ ADMIN_COMMAND, DATA_UPDATED, FETCH_ERROR
                                          ┌─────────────────────────────┴───────────┐
                                          ▼                                         ▼
                                      PenScene (герои, орда, Круэлла)          HUDScene (интерфейс)
```
Сцены друг друга не вызывают — только через EventBus. `GameState` — единственный источник истины (в т.ч.
`headsRemaining` = сколько гоблинов стоит; «голова» = гоблин, имена событий остались от дракона намеренно).

Команды админки (`type`): `hit`, `fall` (режимы fall/doze), `wake`, `growl` (вождь рычит), `confetti`, `celebrate` —
обрабатывают `PenScene.onAdminCommand` и `HUDScene`; описаны в `admin.html` (`data-cmd`) и `src-admin/main.ts`.

## 4. Исходный код `game/src/` — кто за что и кто использует

Точки входа: `game/index.html` → `src/main.ts` (bootstrap + dev-хук `window.__debug`) → `src/game/main.ts` (конфиг
Phaser, список сцен Boot→Preloader→PenScene+HUDScene, PowerSaver). `game/admin.html` → `src-admin/main.ts`.

### core/ (без игровой логики сцен)
| Файл | Отвечает за | Используют |
|---|---|---|
| `Constants.ts` | все числа: `GAME` (+`RENDER_SCALE`), `DAYS`=5, `DRAGON` (тайминги гоблинов/рыка), `HORDE` (позиции, сокровища, куча `LOOT`, костёр), `HERO` (слоты, фазы удара), `IDLE`, `HUD`, `FX`, `POLL`, `HERO_SLUGS` | почти все |
| `EventBus.ts` | EventEmitter-синглтон, `GameEvents`, типы payload | сцены, DataPollingService, IdleMood, PowerSaver, main |
| `GameState.ts` | план, сумма, `byRop`, `ratio`, `headsRemaining`, `lastHeads`, `dragonDefeated`, `hasBaseline`, типы `StatusResponse`/`BackendCommand` | сцены, DataPollingService |
| `Quality.ts` | профиль устройства low/high, `RENDER_SCALE`, fps; URL `?quality ?scale ?fps ?idlefps` | Constants, PowerSaver, main |
| `PowerSaver.ts` | частота кадров на лету: active / ambient / idle | `game/main.ts` |
| `Render.ts` | `fitCameraToGame(scene)` — первой строкой в каждой сцене | все сцены |

### scenes/
| Файл | Отвечает за |
|---|---|
| `Boot.ts` | пустой, стартует Preloader |
| `Preloader.ts` | грузит `bg_forest`, `campfire`, листы орды, `loot_*`, героев (`hero_x`, `_hitN`, `_hitN_windup`), Круэллу; экран загрузки; плейсхолдер при ошибке; LINEAR-фильтр |
| `PenScene.ts` | главная сцена: фон, герои, Круэлла, `Horde`, `IdleMood`; реакции на события, удары героев по `horde.strikeFrontX()` |
| `HUDScene.ts` | полоса недели с «день 1…5», «ГОБЛИНОВ: n / 5» / «ОРДА ПОВЕРЖЕНА», баннер «ОТДЕЛЫ ПОБЕДИЛИ!», рейтинг, индикатор связи, mute, конфетти |

### objects/
| Файл | Отвечает за | Используют |
|---|---|---|
| `Horde.ts` | `Goblin`×5 (сокровища у ног, ранение, смерть, полёт добычи, замах), `Chief` (рык, «сидит и плачет»), `Horde` (`setHeads`, `strikeFrontX`, `reactToHit`, `loseHead`, `defeat`, `growl`, `span`, костёр), `HORDE_DEFS`, `animKey`, `playFrames` | PenScene, Preloader, IdleMood |
| `HeroSprite.ts` | герой: `playHit` (рывок→удар→возврат, 4 атаки по кругу), `playCelebrate`, `fallOver`, `doze`, `wakeUp`, редкий наклон | PenScene, IdleMood |
| `LeadSprite.ts` | Круэлла: `playCheer`, `playVictory`, `resetPose` | PenScene |
| `Leaderboard.ts` | мини-рейтинг 6 отделов | HUDScene |

### systems/
| Файл | Отвечает за | Используют |
|---|---|---|
| `DataPollingService.ts` | опрос бэкенда (hedge, таймауты), diff → `MONEY_IN`, `DRAGON_HEAD_LOST/DEFEATED`, `ADMIN_COMMAND`; baseline | PenScene, main |
| `IdleMood.ts` | простой: герои падают/засыпают через час без продаж; вождь рычит по расписанию | PenScene |
| `RosterConfig.ts` | код отдела → герой, `heroDef()` над `config/*.json` | HeroSprite, Leaderboard, HUDScene, PenScene, Preloader, DataPollingService |
| `Audio.ts` | процедурный звук, mute в localStorage | HeroSprite, Horde, HUDScene, PenScene, main |
| `Fx.ts` | `emitBurst/Sparkles/ConfettiBurst/ShockwaveRing/ComicText/FloatingAmount/CoinBurst`, `flashScreen`, `startIdleSway`, `addIdleFlicker` | HeroSprite, Horde, LeadSprite, HUDScene, PenScene |

### config/ (`game/src/game/config/`)
| Файл | Что | Кто пишет |
|---|---|---|
| `ropMapping.json` | СР1→lion, СР2→scrooge, СР3→grinch, СР5→yoda, СР6→neznaika, СР9→minion | руками |
| `heroRoster.json` | slug/sprite/цвет/lead/`hits` (4 атаки у героев, 0 у Круэллы) | руками |
| `horde.json` | кадры гоблинов и вождя, глаза сидящего вождя, список сокровищ | **генерирует** `build-horde.py`, руками не править |

### Админка и сервисное
| Файл | Что |
|---|---|
| `game/src-admin/main.ts` | логика админки: вход по PIN, вкладки (план / таблица / оплата / анимации / PIN) |
| `game/src-admin/api.ts` | `callBackend(action, pin, payload)`, в dev подмена `?backend=` |
| `game/public/config.json` | `{appsScriptUrl, useMock}`, читается в рантайме |
| `game/public/assets/mock/mock-status.json` | фикстура для офлайн (`useMock: true`) |
| `game/public/style.css` | стиль страницы (`image-rendering: auto` на canvas) |
| `game/vite/config.{dev,prod}.mjs` | сборка; prod — две точки входа (index + admin) |
| `game/tools/mock-backend.mjs` | локальный бэкенд на :8787 (настоящий `Code.gs` на имитации Google) |
| `game/log.js` | аналитика шаблона Phaser (`npm run dev/build`); при `-nolog` не нужен |
| `apps-script/Code.gs` | API: публичный GET (итоги+команды); POST по `action`: login/setPlan/listSales/addSale/changePin/command |
| `apps-script/test/` | `gas-harness.mjs` (Google-имитация), `backend.test.mjs` (`npm run test:backend`) |

## 5. Спрайты `game/public/assets/sprites/` (генерируются, руками не править)

| Файлы | Откуда | Куда используются |
|---|---|---|
| `hero_<lion|scrooge|grinch|yoda|neznaika|minion>.png`, `_hit1..4.png`, `_hit1..4_windup.png` (54) | `build-sprites.py` ← `assets-source/hero-sheets/<СРx>/sheet.png` | HeroSprite, Preloader |
| `lead_cruella.png` | `build-sprites.py` ← `character-refs/Круэлла…` | LeadSprite |
| `horde/goblin1..5_{idle,hurt,die,attack}.png` | `build-horde.py` | Horde (у Метателя `goblin4` нет hurt/die — код-замена) |
| `horde/goblin_chief_{idle,hurt,taunt,sit}.png` | `build-horde.py` (sit из `goblin-chief/sit.png`) | Horde (Chief) |
| `horde/loot_*.png` (11) | `build-horde.py` ← `gold-bag/` | Horde (сокровища, куча у Круэллы) |
| `bg_forest.jpg`, `campfire.png` | `build-background.py` | PenScene (фон), Horde (костёр) |

## 6. Исходники `game/assets-source/`

| Папка | Что | Статус |
|---|---|---|
| `hero-sheets/СРx - имя/sheet.png` | лист 4×4 на героя (хэллоуинские) | **в работе** |
| `horde/` | hsdsz-листы (`goblin-scout/shaman/thrower/chief`), `goblin-chief/sit.png` (нарисован для игры), `gold-bag/` (`game_icons_coin_set.png`, `sheet.png`; `bag-of-coins.png` не используется), `README.md` | **в работе**, в git |
| `background/` | `Battleground3/{Bright,Pale}/*.png` слои, `CampFireFinished.png`, `Battleground3.psd` (в git не кладём) | **в работе** |
| `character-refs/` | Круэлла (**нужна**), старые герои/дракон/гора/`фон.jfif` | только Круэлла; остальное — архив (собирается лишь по `--only`) |
| `raw-pixel/` | прежний арт первой версии | архив, не используется |

## 7. Остальное в корне
`ROP.jpg` — референс первой версии, не используется. `game/screenshot.png`, `game/public/assets/bg.png`, `logo.png` —
остатки шаблона. `heroes/` — рабочая папка пользователя (в `.gitignore`, не коммитить). `.claude/`, `.agents/`,
`skills-lock.json` — служебное, в `.gitignore`.

## 8. Гочи (самое частое, что ломают)
- Первый опрос — baseline: никаких анимаций, сразу правильное состояние; пустой `GameState` при `create()` baseline не «съедает».
- Гоблины убывают только через `DRAGON_HEAD_LOST`, возвращаются только через `PROGRESS_CHANGED`.
- Любая новая бесконечная анимация держит ноутбуки на повышенной частоте кадров — только конечные твины (исключение: костёр 8 к/с).
- `add.text` — всегда `resolution: GAME.RENDER_SCALE`; в новой сцене первой строкой `fitCameraToGame(this)`.
- Не править `public/assets/sprites/` руками; не вводить свечение/тени у персонажей; не гонять удаление фона по арту пользователя.
- Не удалять строки листа Google целиком (там список в колонке F); `Code.gs` деплоится вручную.
- PIN админки — только в Script Properties, никогда в репо/доках. Деплой и пуш — только по явному «да».
- Проверка: `cd game && npx tsc --noEmit -p tsconfig.json` + браузер (`__debug.poller.stop()`, `setRatio`, `hit`, `growl`).
