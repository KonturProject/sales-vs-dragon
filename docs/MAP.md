# Карта проекта

Справочник по структуре репозитория. Для контекста/истории решений см. [gameplan.md](./gameplan.md) и [tech.md](./tech.md).

## Верхний уровень

```
claude first pr/                        <- корень (git-репозиторий, НИЧЕГО ещё не закоммичено)
├── ROP.jpg                              исходный референс-арт (фотореалистичный, больше не используется в игре)
├── docs/                                вся документация проекта
│   ├── gameplan.md                      текущее описание/статус (этот файл — сосед)
│   ├── tech.md                          технические решения и их обоснование
│   └── MAP.md                           ты здесь
├── apps-script/                         исходник бэкенда (копия того, что реально лежит в Apps Script)
│   ├── Code.gs
│   ├── appsscript.json
│   └── README.md                        инструкция по ручному деплою
├── game/                                Vite+Phaser+TS проект — вся игра
├── .claude/skills/                      установленные скиллы game-creator, caveman и др. (см. память/предыдущие обсуждения)
├── .agents/skills/                      установленные скиллы caveman (дубликат для другого раннера)
└── skills-lock.json                     служебный файл установщика скиллов
```

## `game/` — фронтенд (Phaser 4 + Vite + TS)

```
game/
├── index.html                           точка входа игры (canvas)
├── admin.html                           точка входа админки (PIN + форма плана)
├── public/
│   ├── config.json                      {appsScriptUrl, useMock} — читается в рантайме, правится без пересборки
│   ├── assets/
│   │   ├── sprites/                     ВСЕ спрайты игры (пиксель-арт), см. таблицу ниже
│   │   ├── mock/mock-status.json        фикстура для офлайн-разработки (useMock: true)
│   │   ├── bg.png, logo.png             неиспользуемые остатки шаблона phaserjs/template-vite-ts
│   └── style.css, favicon.png
├── src/
│   ├── main.ts                          bootstrap игры + dev-хук window.__debug (только import.meta.env.DEV)
│   ├── vite-env.d.ts
│   └── game/
│       ├── main.ts                      Phaser.Game config: pixelArt:true, roundPixels:true, список сцен
│       ├── core/
│       │   ├── Constants.ts             ВСЕ магические числа: GAME, PIG, PEN, HERO, ROAD, HUD, FX, POLL, HERO_SLUGS
│       │   ├── EventBus.ts              Phaser.Events.EventEmitter singleton + типы событий/payload'ов (включая MILESTONE_REACHED, PIG_REACHED_PEN{delayMs})
│       │   └── GameState.ts             plan/totalThisWeek/byRop/ratio/reachedPen/lastMilestoneRatio — источник истины для UI
│       ├── scenes/
│       │   ├── Boot.ts                  пустой, сразу стартует Preloader
│       │   ├── Preloader.ts             грузит все текстуры + рисует экран загрузки (Graphics/Text, без ассетов); при 404/ошибке — codegen-плейсхолдер под тем же ключом
│       │   ├── PenScene.ts              ГЛАВНАЯ сцена: тableau героев+свина+загона, дорога, камеры, мерцающий фон, оркестрация PIG_REACHED_PEN
│       │   └── HUDScene.ts              параллельная сцена: прогресс-бар (одометр), индикатор связи, mute-кнопка, Leaderboard, конфетти/виньетка/цвет.вспышки
│       ├── objects/
│       │   ├── HeroSprite.ts            Container(glow-ghost + sprite); playHit()/playCheer()/playCelebrate()/playVictory()/resetPose(), idle-эмоции
│       │   ├── Pig.ts                   Container(glow-ghost + sprite) + speech bubble; setProgress() (само-сброс celebrated), reactToHit(), celebrate()
│       │   ├── Leaderboard.ts           живой пересортируемый мини-рейтинг 6 отделов (Container)
│       │   └── RoadLayer.ts             длинная "дорога" (3200px, параллакс scrollFactor на bg/sky) — маркеры дистанции, свин-маркер, только для RoadCamera
│       ├── systems/
│       │   ├── DataPollingService.ts    fetch раз в 15с, diff по РОПам → money:in/progress-changed/pig:reached-pen/milestone-reached
│       │   ├── RoadCamera.ts            вторая Phaser-камера: докинг в угол ⇄ полноэкранный пролёт по дороге; ignore() passthrough для transient FX
│       │   ├── RosterConfig.ts          heroSlugForRop(), ropNameForSlug(), heroDef() — обёртка над config/*.json
│       │   ├── Audio.ts                 AudioSystem — процедурный звук через сырой AudioContext (без файлов), mute в localStorage
│       │   └── Fx.ts                    emitBurst/Sparkles/ConfettiBurst/ShockwaveRing/ComicText/FloatingAmount, flashScreen, addIdleBob/Flicker
│       └── config/
│           ├── heroRoster.json          фиксированный пул из 7 скинов (slug/sprite/color/flying)
│           └── ropMapping.json          РЕАЛЬНЫЙ маппинг: СР1→red, СР2→green, СР3→yellow, СР5→black, СР6→purple, СР9→blue
├── src-admin/
│   ├── main.ts                          логика админки: PIN-форма → форма плана → POST с text/plain (обход CORS preflight)
│   └── styles.css                       киберпанк-стиль карточки (Rajdhani/Manrope, неоновые углы)
├── assets-source/                       ИСХОДНИКИ ассетов, не публикуются в игру напрямую
│   └── raw-pixel/                       второй набор арта от пользователя + очищенные (`clean_*.png`) версии
├── vite/config.{dev,prod}.mjs           prod-конфиг собирает ДВЕ точки входа (index.html + admin.html)
├── package.json                         scripts: dev, build, dev-nolog, build-nolog (deploy-скрипт для gh-pages ЕЩЁ НЕ добавлен)
└── tsconfig.json
```

### Спрайты в `public/assets/sprites/` (все пиксель-арт, второй набор от пользователя)

| Файл | Использование |
|---|---|
| `hero_blue/green/purple/yellow/red/black.png` | 6 героинь-отделов, статичные позы |
| `hero_boss_flying.png` | Валькирия, дефолтная поза |
| `hero_boss_flying_victory/celebrate/happy/sad.png` | эмоции Валькирии — `celebrate` играет в `playCheer()` (каждая продажа), `victory` в `playVictory()` (финал недели, держится до сброса); `happy/sad` **пока не используются** |
| `pig.png` | свин, дефолт = поза "calm" |
| `pig_dizzy.png` | играет 0.5с при каждом ударе (`reactToHit()`) |
| `pig_curled.png` | играет при достижении цели (`celebrate()`) |
| `pig_ko.png` | загружен, **пока не используется** — резерв под будущую механику (например "план провален") |
| `pen.png` | процедурный пиксельный загон (сгенерирован кодом, НЕ файл от пользователя — см. tech.md про несовпадение `Загон.jfif`) |
| `bg_city.png` | процедурный киберпанк-скайлайн (фон тableau) |
| `hero_<color>_hit1..N.png` | альтернативные позы удара (N=3 у red/green/yellow/black, N=4 у purple/blue) — чередуются round-robin в `HeroSprite.playHit()`, см. tech.md |

## `apps-script/` — бэкенд

Реальный деплой — **standalone Apps Script проект** на аккаунте `ignaton2001@gmail.com`, называется "Свин и загон backend", привязан к таблице по `SPREADSHEET_ID` внутри `Code.gs` (не через Extensions-меню — так проще автоматизировать, см. tech.md/gameplan.md).

- **Google Таблица**: https://docs.google.com/spreadsheets/d/1TQHdp3ylSog5pfmhIy1WEB0cG_YdSYB19V7FvnPlIWs/edit
  - Вкладка **Sales**: `Date | Amount | ROP` — one row per sale
  - Вкладка **Settings**: `Key | Value` — строки `WeeklyPlan`, `TotalMeters`
- **Web App URL** (уже прописан в `game/public/config.json`): `https://script.google.com/macros/s/AKfycbzc4aNiiEJLTO8HkCA79JD6ClYig3q5ao_DKrq6iqwv6D8EZDmGm56F02tKPUPFEdmLaA/exec`
- **PIN админки: `473920`** — хранится только в `PropertiesService` самого Apps Script проекта, нигде в репозитории.
- Деплой публичный (`Anyone`) — отдаёт только агрегаты (сумма, разбивка по РОПам), не сырые строки. Подтверждено пользователем как приемлемо.

## Статус деплоя игры

- Локальная разработка: `npm run dev` (или `dev-nolog`) из `game/`, либо `.claude/launch.json` → preview "sales-game-dev" (порт 8080).
- **GitHub Pages ещё НЕ настроен** — ни `gh-pages` в devDependencies, ни deploy-скрипт в `package.json`, ни публичный GitHub-репозиторий не созданы. Это осознанно отложено: требует явного разрешения пользователя (создание публичного репо + push).
- Git-репозиторий локально инициализирован (`git init` уже выполнен), но **ни одного коммита нет** — всё в рабочей директории как untracked/uncommitted.

## Что дальше (открытые пункты на момент этой карты)

1. Реальный пиксельный `pen.png` от пользователя (пока процедурный).
2. Подтвердить точный формат кода отдела в самой таблице (регистр/пробелы у "СР1" и т.д.) — если удар не анимируется, смотреть сюда первым делом.
3. Решить, нужны ли `hero_boss_flying_happy/sad`, `pig_ko` — либо подключить в новую механику, либо оставить как резерв.
4. Git commit + GitHub Pages деплой — ждёт явного "да" от пользователя.
