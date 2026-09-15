# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Свин и загон" ("Pig and Pen") — a Phaser 4 + Vite + TypeScript browser game that visualizes a sales department's weekly plan on an office display. Six pixel-art heroines (one per department) punch a pig mascot toward a pen as real sales land in a private Google Sheet; a non-departmental "Valkyrie" boss cheers on every sale. A separate PIN-gated admin page sets the weekly plan. Live at https://konturproject.github.io/svin-i-zagon/ (admin: `/admin.html`).

Full project narrative, status checklist, and rationale for every design decision live in `docs/` — read these before making non-trivial changes, they are kept current:
- `docs/gameplan.md` — concept, department→hero color mapping, status checklist (done/open gaps)
- `docs/MAP.md` — full repo file tree with per-file descriptions, sprite usage table, Apps Script/backend reference (real Sheet URL, Web App URL, PIN location)
- `docs/tech.md` — technical decisions and their reasoning (asset pipeline, camera architecture, reliability fixes)

## Commands

All commands run from `game/` (the actual Vite project; the repo root is just a wrapper around it).

```bash
npm run dev            # dev server on :8080, hot reload
npm run build           # production build to game/dist (multi-entry: index.html + admin.html)
npx tsc --noEmit -p tsconfig.json   # type-check — there is no lint/test suite in this project; this is the only automated check
npm run deploy          # build + publish dist/ to the gh-pages branch (GitHub Pages)
```

There is no test runner and no linter configured — `tsc --noEmit` is the only thing to run after a change, and manual verification in a browser is expected for anything visual (see Verification below).

## Architecture

**Two independent Vite entry points build from one project**: `index.html` (the Phaser game, `src/main.ts` → `src/game/`) and `admin.html` (a plain-DOM PIN-gated settings page, `src-admin/main.ts`, no Phaser). Both are configured in `vite/config.{dev,prod}.mjs`, not a root `vite.config.ts`.

**Data flow**: a private Google Sheet → a standalone Google Apps Script Web App (`apps-script/Code.gs`, deployed separately — the copy in this repo is a mirror, not auto-synced) → `DataPollingService` (`src/game/systems/DataPollingService.ts`) polls it every 15s, diffs `byRop` against the previous snapshot, and emits events on the shared `EventBus` (`src/game/core/EventBus.ts`): `MONEY_IN` (per department, staggered), `PROGRESS_CHANGED`, `PIG_REACHED_PEN`, `MILESTONE_REACHED`, `FETCH_ERROR`, `DATA_UPDATED`. `GameState` (`src/game/core/GameState.ts`) is the single source of truth both scenes read from. `RosterConfig` (`src/game/systems/RosterConfig.ts`) maps real department codes (`config/ropMapping.json`, e.g. `"СР1"`) to hero slugs (`config/heroRoster.json`).

**Two parallel Phaser scenes**, both launched from `Preloader`: `PenScene` (the hero/pig/pen tableau, dual-camera road system) and `HUDScene` (progress bar, connectivity indicator, leaderboard, full-screen FX, mute button) — they communicate only through the EventBus, never call each other directly.

**Dual-camera "road" system** (`RoadLayer.ts` + `RoadCamera.ts`) is the trickiest piece: a second, much longer (3200px) world layer exists purely to make "meters remaining" feel like a real journey. It's rendered *only* by a second Phaser camera docked as a corner mini-map; the main camera calls `.ignore()` on it and vice versa, so the two never leak into each other. Any new transient FX object (particles, comic text, floating numbers) created after scene setup must be explicitly registered with `RoadCamera.ignore()` (see the `onImpactFx` callback threaded through `HeroSprite`'s constructor) or it will also render on the mini-map as noise — this is the one gotcha that's bitten every VFX addition so far.

**No glow/shadow effects on characters** — an earlier "ghost" rim-glow (tinted duplicate image, `BlendMode.ADD`) and shadow ellipses under each character were deliberately removed per user feedback; don't reintroduce them without being asked. Character sprites are Photoshop-cropped by the user directly (`assets-source/raw-pixel/clean_hero_*.png` → copied verbatim into `public/assets/sprites/`) — when the user drops new crops there, copy them over, don't re-run background-removal scripts on them unless they specifically still have a white/checkerboard background (check corner + a broad near-white-pixel sample, not just the four corner pixels — see `docs/tech.md` for why a corners-only check previously missed a large opaque-white background).

**Debug hooks** (`window.__debug`, only in dev builds): `hit(heroSlug, delta)`, `reachPen(delayMs)`, `pushStatus(partial)`, `audio` (the `AudioSystem` singleton), plus direct access to `EventBus`/`GameEvents`/`GameState`/`game`. These are the primary way to manually trigger and verify animations/events without waiting on a real poll cycle or real sheet edits.

## Verification

This project has no automated visual tests. The established workflow for any UI/animation change: start the dev server, open it in a browser, and either wait for a real poll or use `window.__debug` to fire the relevant event, then confirm visually (and check the corner mini-map specifically stays clean of any new FX). `npx tsc --noEmit` catches type errors but proves nothing about runtime behavior.

## Backend / secrets

The Apps Script PIN lives only in that script's `PropertiesService`, never in this repo (the source in `apps-script/Code.gs` has a placeholder). The Apps Script Web App URL in `game/public/config.json` is intentionally public — it only serves aggregated totals, never raw sheet rows; this was an explicit, confirmed decision, not an oversight. See `docs/MAP.md` for the real Sheet URL, Web App URL, and deploy details.
