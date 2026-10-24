# Карта проекта

Подробное дерево репозитория. **Быстрый вход — [NAVIGATOR.md](./NAVIGATOR.md)** (кто за что отвечает и кто что использует). Концепция и механика — [gameplan.md](./gameplan.md) и [horde-track.md](./horde-track.md) (прежний дракон — [dragon-track.md](./dragon-track.md)), технические решения — [tech.md](./tech.md).

## Верхний уровень

```
sales vs dragon/                        <- корень (git-репозиторий, GitHub: KonturProject/sales-vs-dragon)
├── CLAUDE.md                            инструкции для Claude Code (команды, архитектура, гочи) — читается автоматически
├── ROP.jpg                              исходный референс-арт первой версии (в игре не используется)
├── heroes/                              рабочая папка пользователя с артом героев — в .gitignore, не коммитить
├── docs/                                вся документация проекта
│   ├── NAVIGATOR.md                     НАВИГАТОР: куда идти за чем, кто что использует — читать первым
│   ├── gameplan.md                      концепция, ростер, статус
│   ├── horde-track.md                   трек «Орда» (текущий): гоблины, вождь, сокровища, лесной фон — правила, ассеты, пайплайн
│   ├── dragon-track.md                  трек «Дракон» (история, до 2026-10-22): правила механики, инвентаризация ассетов
│   ├── tech.md                          технические решения и их обоснование (пайплайн ассетов, механика, Fooocus)
│   └── MAP.md                           ты здесь
├── apps-script/                         исходник бэкенда (копия того, что реально лежит в Apps Script)
│   ├── Code.gs                          API: публичный GET (итоги + команды) и POST по action (login/setPlan/listSales/addSale/changePin/command)
│   ├── appsscript.json
│   ├── README.md                        инструкция по ручному деплою + таблица API
│   └── test/                            gas-harness.mjs (Code.gs на имитации Google) и backend.test.mjs (20 тестов: `npm run test:backend`)
├── game/                                Vite+Phaser+TS проект — вся игра
├── .claude/skills/                      установленные скиллы game-creator, caveman и др. — исключены из git
├── .agents/skills/                      установленные скиллы (дубликат для другого раннера) — исключены из git
└── skills-lock.json                     служебный файл установщика скиллов — исключён из git
```

Fooocus (генератор картинок) лежит **вне** репозитория — его запускает пользователь; операционный справочник — скилл `~/.claude/skills/fooocus/SKILL.md`.

## `game/` — фронтенд (Phaser 4 + Vite + TS)

```
game/
├── index.html                           точка входа игры (canvas)
├── admin.html                           точка входа админки: вход по PIN, вкладки «План / Таблица / Внести оплату / Анимации / PIN-код»
├── public/
│   ├── config.json                      {appsScriptUrl, useMock} — читается в рантайме, правится без пересборки
│   ├── assets/
│   │   ├── sprites/                     ВСЕ спрайты игры — результат tools/build-*.py, см. таблицу ниже (horde/ — орда и сокровища)
│   │   ├── mock/mock-status.json        фикстура для офлайн-разработки (useMock: true), коды отделов СР1/2/3/5/6/9
│   │   └── bg.png, logo.png             неиспользуемые остатки шаблона phaserjs/template-vite-ts (так же `game/README.md`, `game/LICENSE`, `game/screenshot.png`; `game/log.js` — аналитика шаблона, в `*-nolog` скриптах не нужна)
│   └── style.css, favicon.png
├── src/
│   ├── main.ts                          bootstrap игры + dev-хук window.__debug (только import.meta.env.DEV)
│   └── game/
│       ├── main.ts                      Phaser.Game config: pixelArt:true, roundPixels:true, буфер = 1280·scale × 720·scale (scale из Quality.ts), fps.limit, PowerSaver, список сцен
│       ├── core/
│       │   ├── Constants.ts             ВСЕ магические числа: GAME (+RENDER_SCALE), DAYS, DRAGON (тайминги «голов» и рыка), HORDE (гоблины, вождь, сокровища, куча у Круэллы, костёр), HERO (слоты, фазы удара), IDLE, HUD, FX, POLL, HERO_SLUGS
│       │   ├── Render.ts                fitCameraToGame(scene): зум камеры ×RENDER_SCALE — вызывать первой строкой в каждой сцене
│       │   ├── Quality.ts               профиль качества на загрузке: tier low/high, масштаб буфера, частоты кадров; URL-параметры ?quality ?scale ?fps ?idlefps
│       │   ├── PowerSaver.ts            частота кадров на лету: active / ambient / idle (см. tech.md «Производительность»)
│       │   ├── EventBus.ts              Events.EventEmitter singleton + типы событий (MONEY_IN, PROGRESS_CHANGED, DRAGON_HEAD_LOST, DRAGON_DEFEATED, DATA_UPDATED, FETCH_ERROR)
│       │   └── GameState.ts             plan/totalThisWeek/byRop/ratio/headsRemaining/lastHeads/dragonDefeated — источник истины для UI
│       ├── scenes/
│       │   ├── Boot.ts                  пустой, сразу стартует Preloader
│       │   ├── Preloader.ts             грузит все текстуры + экран загрузки; при 404 — цветной плейсхолдер под тем же ключом
│       │   ├── PenScene.ts              ГЛАВНАЯ сцена: лес, герои слева, орда справа, Круэлла в стороне; реакции на события
│       │   └── HUDScene.ts              параллельная сцена: полоса недели с делениями «день 1…5», счётчик гоблинов, победная надпись, рейтинг, индикатор связи, mute
│       ├── objects/
│       │   ├── Horde.ts                 Goblin ×5 (сокровища у ног, ранение, смерть, полёт добычи к Круэлле, замах), Chief (рык, «сидит и плачет»), Horde: setHeads(), strikeFrontX(), reactToHit(), loseHead(), defeat(), growl(); костёр
│       │   ├── HeroSprite.ts            Container(sprite, якорь у ног); playHit(): рывок до ближайшего гоблина (strikeFrontX), удар по прибытии, возврат; позы round-robin; playCelebrate(); редкий наклон (без покачивания по y)
│       │   ├── LeadSprite.ts            Круэлла: редкий наклон, playCheer() на каждую продажу, playVictory()/resetPose()
│       │   └── Leaderboard.ts           живой пересортируемый мини-рейтинг 6 отделов (Container)
│       ├── systems/
│       │   ├── DataPollingService.ts    fetch раз в 15с, diff по РОПам → MONEY_IN; расчёт голов → DRAGON_HEAD_LOST / DRAGON_DEFEATED
│       │   ├── RosterConfig.ts          heroSlugForRop(), ropNameForSlug(), heroDef() — обёртка над config/*.json
│       │   ├── Audio.ts                 AudioSystem — процедурный звук (удар, рык при потере головы, фанфара, падение героя, рычание дракона), mute в localStorage
│       │   ├── IdleMood.ts              режиссёр простоя: нет продаж час → герои падают/засыпают, продажа будит; рык вождя по расписанию
│       │   └── Fx.ts                    emitBurst/Sparkles/ConfettiBurst/ShockwaveRing/ComicText/FloatingAmount/CoinBurst, flashScreen, startIdleSway/addIdleFlicker
│       └── config/
│           ├── horde.json               генерируется tools/build-horde.py: кадры гоблинов и вождя, глаза сидящего вождя, список сокровищ
│           ├── heroRoster.json          ростер: slug/sprite/color/lead/hits — `hits` = число поз удара (6 героев + Круэлла)
│           └── ropMapping.json          СР1→lion, СР2→scrooge, СР3→grinch, СР5→yoda, СР6→neznaika, СР9→minion
├── src-admin/
│   ├── main.ts                          логика админки: вход (login), вкладки, чтение листа Sales, добавление оплаты, кнопки анимаций (команды), смена PIN
│   ├── api.ts                           callBackend(action, pin, payload): POST text/plain с PIN в теле, BackendError; в dev — подмена адреса ?backend=
│   └── styles.css                       киберпанк-стиль карточки
├── assets-source/                       ИСХОДНИКИ ассетов, не публикуются в игру напрямую
│   ├── raw-pixel/                       прежний арт (героини/свин/Валькирия) — больше не используется, лежит как архив
│   └── character-refs/                  ТЕКУЩИЙ арт (Fooocus + доработка в Photoshop, прозрачный PNG): `СР1 - Лев`, `СР2 - Скрудж`, `СР3 - Гринч`, `СР 5 - йода`, `СР6 - Незнайка с деньгами`, `СР9 - миньон` (персонаж + Анимация 1..3), `Дракон/` (6 состояний + гора золота), `Круэлла …/`, `фон.jfif` (пещера)
│   ├── hero-sheets/                     ГЕРОИ с 2026-10-22: лист 4×4 на героя (`СР1 - лев`, … `СР9 - Миньон`/sheet.png), хэллоуинские образы с атаками
│   ├── horde/                           ОРДА: листы hsdsz (goblin-scout/shaman/thrower/chief), `goblin-chief/sit.png` (нарисован для игры), `gold-bag/` (сокровища); README со ссылками
│   └── background/                      ФОН: CraftPix Battleground3 (слои Bright/Pale; PSD в git не кладём), `CampFireFinished.png`
├── tools/build-sprites.py               hero-sheets + character-refs → public/assets/sprites (герои, Круэлла; дракон/гора/пещера — только по `--only`); запуск: `python tools/build-sprites.py [--only heroes lead dragon mountain bg]`
├── tools/build-horde.py                 assets-source/horde → public/assets/sprites/horde + src/game/config/horde.json
├── tools/build-background.py            assets-source/background → bg_forest.jpg, campfire.png
├── tools/mock-backend.mjs               локальный бэкенд: настоящий Code.gs на имитации Google (`npm run mock-backend`, :8787, PIN 1234)
├── vite/config.{dev,prod}.mjs           prod-конфиг собирает ДВЕ точки входа (index.html + admin.html)
├── package.json                         scripts: dev, build, dev-nolog, build-nolog, deploy (gh-pages)
└── tsconfig.json
```

### Спрайты в `public/assets/sprites/` (генерируются скриптом; текстуры вдвое крупнее экранного размера, в игре `scale 0.5`)

| Файл | Использование |
|---|---|
| `hero_lion / hero_scrooge / hero_grinch / hero_yoda / hero_neznaika / hero_minion.png` | 6 героев-отделов, стоячая поза (idle) |
| `hero_<имя>_hit1..4.png`, `hero_<имя>_hit1..4_windup.png` | четыре атаки: кадр удара и кадр замаха (из листа `assets-source/hero-sheets/`), идут по кругу в `HeroSprite.playHit()` — замах на рывке, удар в момент попадания |
| `lead_cruella.png` | Круэлла, руководитель филиала (одна поза) |
| `horde/goblin1..5_<anim>.png` | гоблины: спрайт-листы idle / hurt / die / attack (какие есть у листа), рамка общая на все анимации, смотрят влево |
| `horde/goblin_chief_<anim>.png` | вождь: idle, hurt, taunt (рык), sit (2 кадра: ревёт / трёт глаза) |
| `horde/loot_<имя>.png` | сокровища: chest_silver, chest_gold, bag, gold_pile (крупные), coin_stack, coin, crown, goblet, coin_heap, coin_tower, swords (мелкие) |
| `bg_forest.jpg` | лес 1920×1080 (в игре 1280×720), дерево с лицом слева за героями, справа дорога под лагерь |
| `campfire.png` | костёр, 5 кадров 256×256 (×4 от оригинала) |

## `apps-script/` — бэкенд

Реальный деплой — **standalone Apps Script проект** на аккаунте `ignaton2001@gmail.com`, в аккаунте пока называется "Свин и загон backend" (название от первой версии; на работу не влияет, переименовывается вручную в редакторе Apps Script), привязан к таблице по `SPREADSHEET_ID` внутри `Code.gs` (не через Extensions-меню — так проще автоматизировать).

- **Google Таблица**: https://docs.google.com/spreadsheets/d/1TQHdp3ylSog5pfmhIy1WEB0cG_YdSYB19V7FvnPlIWs/edit
  - Вкладка **Sales**: `Date | Amount | ROP` — one row per sale
  - Вкладка **Settings**: `Key | Value` — строки `WeeklyPlan`, `TotalMeters` (метры остались с прошлой концепции; фронтенд их игнорирует)
- **Web App URL** (уже прописан в `game/public/config.json`): `https://script.google.com/macros/s/AKfycbzc4aNiiEJLTO8HkCA79JD6ClYig3q5ao_DKrq6iqwv6D8EZDmGm56F02tKPUPFEdmLaA/exec`
- **PIN админки** хранится только в `PropertiesService` Apps Script проекта (задаётся функцией `setAdminPin_()` в редакторе Apps Script) и известен пользователю. В репозитории и документации его быть не должно.
- Деплой публичный (`Anyone`) — отдаёт только агрегаты (сумма, разбивка по РОПам), не сырые строки. Подтверждено пользователем как приемлемо.

## Статус деплоя игры

- Локальная разработка: `npm run dev` (или `dev-nolog`) из `game/`, либо `.claude/launch.json` → preview "sales-game-dev" (порт 8080).
- **Задеплоено на GitHub Pages** (репозиторий https://github.com/KonturProject/sales-vs-dragon, публичный). Игра: https://konturproject.github.io/sales-vs-dragon/. Админка: https://konturproject.github.io/sales-vs-dragon/admin.html. **Опубликована версия с драконом** (деплой 2026-09-20, коммит `aba4f65`). Орда (локальные коммиты `93f9618`, `326f777` и позже) на сайт **ещё не выкатывалась** — деплой и пуш только по явному «да» пользователя.
- `game/package.json` → `npm run deploy` = `npm run build-nolog && gh-pages -d dist` (пакет `gh-pages` в devDependencies). Vite `base: './'` — пути в собранном HTML относительные, под-путь Pages не требует настройки.
- GitHub Pages включился автоматически при первом пуше в ветку `gh-pages` (source: `gh-pages` branch, path `/`) — проверять через `gh api repos/KonturProject/sales-vs-dragon/pages`.
- Авторизация: `gh auth status` под аккаунтом `KonturProject` (GitHub CLI установлен через winget).
- Корневой `.gitignore` исключает `node_modules`, `dist`, `.claude/`, `.agents/`, `skills-lock.json`, `heroes/`; `game/.gitignore` — `*.psd` в `assets-source`.

## Что дальше

0. Выкатить орду на сайт (по «да» пользователя): `cd game && npm run deploy`.
1. Подтвердить точный формат кода отдела в самой таблице (регистр/пробелы у «СР1» и т.д.) — если удар не анимируется, смотреть сюда первым делом.
2. Реакции Круэллы (арт одна поза — только код-анимации); Метателю дорисовать ранение/смерть (в паке нет), лист ходьбы Шамана (`walk_1`) не используется.
