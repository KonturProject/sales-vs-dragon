# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Отделы против дракона" (repo/Pages URL still `svin-i-zagon`) — a Phaser 4 + Vite + TypeScript browser game that visualizes a sales department's weekly plan on an office display. Six pixel-art department mascots hit a five-headed dragon sitting on a gold mountain whenever real sales land in a private Google Sheet; each of the 5 equal daily plans crossed (20/40/60/80/100 % of the weekly plan) cuts off one head, and at 100 % a victory banner appears. A non-departmental branch lead (Cruella) cheers on every sale. A separate PIN-gated admin page sets the weekly plan. Live at https://konturproject.github.io/svin-i-zagon/ (admin: `/admin.html`); note the deployed site lags the code until `npm run deploy` is run.

Full project narrative, mechanics rules and rationale for every design decision live in `docs/` — read these before making non-trivial changes, they are kept current:
- `docs/gameplan.md` — concept, department→hero mapping, status checklist (done/open gaps)
- `docs/dragon-track.md` — the dragon concept in detail: exact mechanics, asset inventory, what changed vs. the old "pig into the pen" game
- `docs/MAP.md` — full repo file tree with per-file descriptions, sprite table, Apps Script/backend reference (real Sheet URL, Web App URL), deploy status
- `docs/tech.md` — technical decisions and their reasoning (asset pipeline, dragon mechanics, Fooocus generation findings)

## Commands

All commands run from `game/` (the actual Vite project; the repo root is just a wrapper around it).

```bash
npm run dev            # dev server on :8080, hot reload
npm run build           # production build to game/dist (multi-entry: index.html + admin.html)
npx tsc --noEmit -p tsconfig.json   # type-check — there is no lint/test suite in this project; this is the only automated check
npm run deploy          # build + publish dist/ to the gh-pages branch (GitHub Pages)
python tools/build-sprites.py       # rebuild public/assets/sprites from assets-source/character-refs (Python + Pillow); `--only heroes lead dragon mountain bg` to rebuild a part; gold-mountain size is `MOUNT_W` in the script (+ `DRAGON.MOUNT_X`); `--mount-clip F` optionally cuts its right side (default 0 — a straight cut looked bad) (dragon alignment takes minutes)
```

There is no test runner and no linter configured — `tsc --noEmit` is the only thing to run after a change, and manual verification in a browser is expected for anything visual (see Verification below).

## Architecture

**Two independent Vite entry points build from one project**: `index.html` (the Phaser game, `src/main.ts` → `src/game/`) and `admin.html` (a plain-DOM PIN-gated settings page, `src-admin/main.ts`, no Phaser). Both are configured in `vite/config.{dev,prod}.mjs`, not a root `vite.config.ts`.

**Data flow**: a private Google Sheet → a standalone Google Apps Script Web App (`apps-script/Code.gs`, deployed separately — the copy in this repo is a mirror, not auto-synced) → `DataPollingService` (`src/game/systems/DataPollingService.ts`) polls it every 15s, diffs `byRop` against the previous snapshot, and emits events on the shared `EventBus` (`src/game/core/EventBus.ts`): `MONEY_IN` (per department, staggered), `PROGRESS_CHANGED`, `DRAGON_HEAD_LOST` (one per head, staggered), `DRAGON_DEFEATED`, `DATA_UPDATED`, `FETCH_ERROR`. `GameState` (`src/game/core/GameState.ts`) is the single source of truth both scenes read from; `GameState.headsRemaining = DAYS − floor(ratio × DAYS)` is the one place that defines how many heads the dragon has. `RosterConfig` (`src/game/systems/RosterConfig.ts`) maps real department codes (`config/ropMapping.json`, e.g. `"СР1"`) to hero slugs (`config/heroRoster.json`).

**Two parallel Phaser scenes**, both launched from `Preloader`: `PenScene` (heroes + dragon + lead tableau) and `HUDScene` (week bar with day dividers, head counter, victory banner, leaderboard, connectivity indicator, full-screen FX, mute button) — they communicate only through the EventBus, never call each other directly.

**Baseline gotcha**: the first poll after page load is a baseline — it must put the dragon straight into the right state with no head-loss animation. `PenScene.create()` also calls `onProgressChanged` once with an *empty* GameState; that call must not consume the baseline (the flag is only set when `GameState.hasBaseline` is true), otherwise the dragon loads with 5 heads while the data says 4. Heads only ever *decrease* through `DRAGON_HEAD_LOST` (delayed so the hits read first) and only *increase* through `PROGRESS_CHANGED` (new week regrows them) — keep it that way.

**Layout** lives in `Constants.ts` in logical 1280×720 units (the canvas *buffer* is `GAME.RENDER_SCALE`× that — see **Render scale** below): heroes stand in two staggered rows (`HERO.SLOTS`, depth = feet `y`) so neighbours never overlap, Cruella far left (`HERO.LEAD`), dragon + gold mountain on the right platform of the cave background. The dragon is deliberately static (no idle bob), and so are the heroes and Cruella: they stand on the floor and never bob up and down (removed at the user's request — they looked like they hovered); only a rare tilt (`Fx.addIdleSway`, every 20–30 s) is kept.

**Render scale**: the canvas buffer is 2560×1440 (`GAME.RENDER_SCALE = 2`) and every scene's camera is zoomed 2× via `fitCameraToGame(this)` (`core/Render.ts`) — call it first in the `create()`/`preload` of any new scene, or that scene fills only the top-left quarter. All coordinates stay logical 1280×720 (use `GAME.WIDTH/HEIGHT`, never `scene.scale.width/height`, for full-screen effects). Every `add.text` style needs `resolution: GAME.RENDER_SCALE` or the text is rasterised at 1× and comes out blurry again. `public/style.css` forces `image-rendering: auto` on the canvas (Phaser's `pixelArt` would set `pixelated`, which makes non-integer scaling uneven). This fixed the blurry HUD text.

**Delayed events go stale**: head loss and victory fire after a delay (so the hits read first) and the data can change meanwhile (plan raised mid-cascade). Handlers re-check `GameState` before showing anything, and `Dragon.headCount` is the *target* with an `epoch` guard on the delayed texture swap — keep those guards when touching `PenScene`/`HUDScene`/`Dragon` (see `docs/tech.md`).

**Tween ownership**: nothing tweens a hero's `y` any more (no idle bob). The hit chain (`HeroSprite.playHit`) owns `x`/scale/angle and kills other tweens on the hero when it starts (`killTweensOf`); the idle sway only touches `angle` and is skipped while `busy`. Cheer/celebrate reactions touch scale only. Two tweens on the same property make sprites visibly jump when one ends.

**Hero strike**: on a sale the hero runs along its own row until its leading edge (weapon/fist, from the hit pose's texture width) reaches `HERO.STRIKE_FRONT_X` (the foot of the gold mountain), the blow lands *on arrival* (`HERO.IMPACT_MS` after the event — burst, shake, ring, comic text, the dragon's reaction, the thud and Cruella's cheer all key off it), then the hero turns (`flipX`) and walks back. Phase lengths are `HERO.WINDUP_MS/RUN_MS/RECOIL_MS/RETURN_MS`; `HIT_DURATION_MS` (used by `DataPollingService` to time head loss after the blows) is derived from them — change the phases, not the sum. Sending every hero down to one spot in front of the pile was tried and rejected ("they hit the gold"); a front-row hero covering a back-row one during the run is accepted.

**Sprites are built, not loaded raw**: the game loads `public/assets/sprites/*`, which `game/tools/build-sprites.py` generates from the hand-finished PNGs in `game/assets-source/character-refs/`. The script crops, puts each hero's hit poses at one common scale (attack-pose counts are `hits` in `heroRoster.json`) (per-pose factors in the script were tuned by eye — re-check after art changes), downsizes to 2× screen size (game renders at scale 0.5; shrinking ~1000px art with `pixelArt` NEAREST is noisy), and aligns the six dragon states so heads swap in place. Don't hand-edit files in `public/assets/sprites/` — change the source art or the script and rebuild.

**No glow/shadow effects on characters** — deliberately removed per user feedback; don't reintroduce them without being asked. Character art is finished by the user (Fooocus generation + Photoshop cut-out with real alpha), so don't run background-removal scripts on it.

**Debug hooks** (`window.__debug`, only in dev builds): `hit(heroSlug, delta)`, `setRatio(0..1)` (pushes a synthetic status through the real diff pipeline: hits, head loss, victory), `injectStatus(status)`, `poller.stop()` (call this first when testing by hand — otherwise the next real poll overwrites your injected state), `audio`, plus direct access to `EventBus`/`GameEvents`/`GameState`/`game`.

**Image generation** (Fooocus, SDXL + pixel-art LoRA) runs locally outside this repo, started by the user; the operating guide is the `fooocus` skill in `~/.claude/skills/`. Findings that matter here are in `docs/tech.md`.

## Verification

This project has no automated visual tests. The established workflow for any UI/animation change: start the dev server, open it in a browser, `__debug.poller.stop()`, drive the relevant event with `__debug.hit`/`setRatio`, and confirm — screenshots are unreliable for fast animations, so also read object state (`texture.key`, `dragon.headCount`, `hud.banner`) via `__debug.game.scene.getScene('PenScene')`. `npx tsc --noEmit` catches type errors but proves nothing about runtime behavior.

## Backend / secrets

The Apps Script admin PIN lives only in that script's `PropertiesService`, never in this repo or its docs (the source in `apps-script/Code.gs` has a placeholder). The Apps Script Web App URL in `game/public/config.json` is intentionally public — it only serves aggregated totals, never raw sheet rows; this was an explicit, confirmed decision, not an oversight. See `docs/MAP.md` for the real Sheet URL, Web App URL, and deploy details.
