import { QUALITY } from './Quality';

export const GAME = {
    /** Logical size — every coordinate in the code is in these units. */
    WIDTH: 1280,
    HEIGHT: 720,
    /**
     * The canvas buffer is RENDER_SCALE × the logical size (camera zoom, see
     * core/Render.ts) and text is rasterised at the same factor, so text lands on
     * buffer pixels 1:1 instead of being stretched from a 720p buffer by the
     * browser (that made HUD text blurry). Chosen per device at load: it follows the
     * real on-screen size, capped at 2 (1.5 on weak machines) — see core/Quality.ts.
     */
    RENDER_SCALE: QUALITY.renderScale,
} as const;

/**
 * The stage (PenScene) shows more world than the 1280×720 the HUD is laid out in: its camera is zoomed out by ZOOM,
 * so the same coordinates and textures look ~22 % smaller and the view reaches `-X0` units past the left/right
 * edges and `-Y0` past the top/bottom (core/Render.ts: fitCameraToWorld). The background covers the whole view.
 */
const WORLD_ZOOM = 0.72;
export const WORLD = {
    ZOOM: WORLD_ZOOM,
    W: GAME.WIDTH / WORLD_ZOOM,
    H: GAME.HEIGHT / WORLD_ZOOM,
    X0: -(GAME.WIDTH / WORLD_ZOOM - GAME.WIDTH) / 2,
    Y0: -(GAME.HEIGHT / WORLD_ZOOM - GAME.HEIGHT) / 2,
} as const;

/** Weekly plan is split into this many equal daily plans; each one crossed costs the horde a goblin. */
export const DAYS = 5;

/**
 * Timing of the antagonist. It was a five-headed dragon; since 2026-10 it is the goblin horde (HORDE below):
 * a "head" in the code and the events (`headsRemaining`, DRAGON_HEAD_LOST, DRAGON_DEFEATED) is one goblin.
 */
export const DRAGON = {
    HEADS_MAX: DAYS,
    /** Stagger between successive goblin deaths when one poll crosses several day plans. */
    HEAD_LOSS_STAGGER_MS: 1100,
    HEAD_LOSS_DURATION_MS: 900,
    /** The chief's taunt (swings his blades, the ground rumbles). From time to time on its own, more often while the team is idle. */
    GROWL_MS: 1400,
    GROWL_MIN_MS: 90_000,
    GROWL_MAX_MS: 180_000,
    GROWL_IDLE_MIN_MS: 40_000,
    GROWL_IDLE_MAX_MS: 80_000,
} as const;

/**
 * The horde on the right of the forest road (objects/Horde.ts; art from tools/build-horde.py, which also writes the
 * frame sizes to config/horde.json). Five goblins guarding treasure; the chief behind them. Positions are the feet.
 * Goblins fall front first (index 0), each one's treasure flies to Cruella's feet (LOOT), and with the last one the
 * chief sits down and cries. Static between events — no idle animation (the office laptops stay at the idle frame rate).
 */
export const HORDE = {
    /**
     * Feet of the five goblins, in the order they fall (front first, nearest the heroes): a half-ring on the heroes'
     * side of the campfire (CAMPFIRE), the back ones higher up (perspective). The chief stands behind the fire.
     */
    GOBLINS: [
        { x: 930, y: 545 },
        { x: 1005, y: 585 },
        { x: 1005, y: 505 },
        { x: 1180, y: 600 },
        { x: 1180, y: 484 },
    ],
    /** On-screen height of every goblin, whatever its sheet's frame size (scale = height / the sheet's `topPx`), world px. A hero is ~195. */
    GOBLIN_HEIGHT: 170,
    /** The chief is half as tall again as a hero (a hero is ~215 world px). */
    CHIEF: { x: 1255, y: 478, height: 330 },
    /**
     * Each goblin's treasure, picked at random (again every new week): one big piece and up to SMALL_MAX small ones
     * at its feet, in front of it (behind it the goblins standing in front would hide it). Offsets from the goblin's
     * feet; in Cruella's pile the same pieces lie at PILE offsets from the goblin's LOOT slot. Textures are 2x.
     */
    TREASURE: {
        SCALE: 0.55,
        BIG: { dx: 20, dy: 14 },
        SMALL: [{ dx: 54, dy: 10 }, { dx: -22, dy: 18 }],
        SMALL_MAX: 2,
        PILE_SMALL: [{ dx: 24, dy: 7 }, { dx: -22, dy: 9 }],
        /** Gap between the pieces of one goblin taking off. */
        FLIGHT_STAGGER_MS: 130,
    },
    /** The pile of won treasure at Cruella's feet: where each goblin's big piece lands, in the order they fall. */
    LOOT: [
        { x: 24, y: 566 },
        { x: -32, y: 580 },
        { x: 72, y: 588 },
        { x: -86, y: 570 },
        { x: 14, y: 598 },
    ],
    LOOT_FLIGHT_MS: 950,
    /**
     * The goblins' campfire (feet = the bottom of the logs). Its five frames loop at FPS — below the idle frame rate
     * (core/PowerSaver.ts), so it costs the laptops nothing extra. Frame size of the 4x texture.
     */
    CAMPFIRE: { x: 1092, y: 550, scale: 0.36, FPS: 8, FRAME: 256 },
    /** Two tents and the totem of the camp (feet = bottom of the picture); textures are 2x their on-screen size. */
    /** `scale` is perspective: the nearer to the bottom of the picture, the bigger (1 = the texture's own size, 2x -> 0.5). */
    TENTS: [{ x: 1430, y: 468, scale: 0.85 }, { x: 1385, y: 655, scale: 1.2 }],
    /** Two totems on either side of the road: the gate of the camp. */
    TOTEMS: [{ x: 860, y: 470, scale: 0.85 }, { x: 880, y: 668, scale: 1.2 }],
    /**
     * The warm light of the campfire on the ground: a soft additive glow that lies *under* every character (depth
     * below them, so it brightens the forest and the road, never the characters), flickering with the fire's own frames.
     * RADIUS in world px; ALPHA/SCALE per fire frame (5 frames, 8 per second).
     */
    FIRELIGHT: {
        RADIUS: 300,
        LIFT: 24,
        ALPHA: [0.62, 0.5, 0.68, 0.56, 0.46],
        SCALE: [1, 0.94, 1.04, 0.97, 0.92],
    },
    /** The hero's leading edge stops this far in front of the target's front edge. */
    STRIKE_GAP: 6,
    /** After the chief sits down he cries for this long, then keeps a still, tearful pose (no endless animation). */
    CRY_MS: 14_000,
} as const;

/** Phases of HeroSprite.playHit: wind-up, dash to the dragon, recoil on contact, walk back. */
const HIT_PHASES = { WINDUP_MS: 160, RUN_MS: 280, RECOIL_MS: 140, RETURN_MS: 420 } as const;

export const HERO = {
    /**
     * Where each department hero stands (feet), in roster order left -> right.
     * Two staggered rows on the paved cave floor (its walkable depth is y≈450–605 in the 1280×720 background; below ≈610 is the platform's brick face — feet must stay above it): even slots are the back row (higher
     * up, slightly smaller = perspective), odd slots the front row. Neighbours
     * are then never on the same row, so wide sprites don't stack on each other;
     * PenScene sorts depth by `y` so the front row draws over the back row.
     */
    SLOTS: [
        { x: 125, y: 545, scale: 1.09 },
        { x: 228, y: 592, scale: 1.13 },
        { x: 335, y: 520, scale: 1.04 },
        { x: 430, y: 585, scale: 1.13 },
        { x: 540, y: 540, scale: 1.08 },
        { x: 640, y: 598, scale: 1.13 },
    ],
    /** All hero textures are 2x their on-screen size (see tools/build-sprites.py). */
    TEXTURE_SCALE: 0.5,
    HIT_STAGGER_MS: 300,
    ...HIT_PHASES,
    /** From the sale event to the blow landing on the dragon — hit effects, sound and the dragon's reaction key off this. */
    IMPACT_MS: HIT_PHASES.WINDUP_MS + HIT_PHASES.RUN_MS,
    /** Whole playHit chain, event to the hero standing back at its slot. */
    HIT_DURATION_MS: HIT_PHASES.WINDUP_MS + HIT_PHASES.RUN_MS + HIT_PHASES.RECOIL_MS + HIT_PHASES.RETURN_MS,
    /**
     * Fallback for where a hero's leading edge (weapon/fist/fire) stops. Normally the horde says it
     * (Horde.strikeFrontX: the front of the nearest goblin still standing, then of the chief).
     */
    STRIKE_FRONT_X: 870,
    /** How far the hero steps back in the wind-up, px. */
    WINDUP_BACK: 24,
    /** Branch lead (Cruella) stands apart from the department heroes, far left. Her train makes her sprite wide, hence the smaller scale. */
    LEAD: { x: -40, y: 540, scale: 0.95 },
} as const;

/**
 * Boredom when no sale comes in (measured across the whole team, not per department, so no
 * single department is singled out): after FIRST_MS one random hero falls over or dozes off,
 * then one more per STEP_MS, at most MAX_DOWN. Any sale wakes everybody. `?idle=<minutes>` in the
 * page URL shrinks FIRST_MS/STEP_MS to that many minutes — to show the effect without waiting an hour.
 */
const IDLE_MINUTES_OVERRIDE = Number(new URLSearchParams(typeof location !== 'undefined' ? location.search : '').get('idle'));
const IDLE_STEP_MS = IDLE_MINUTES_OVERRIDE > 0 ? IDLE_MINUTES_OVERRIDE * 60_000 : 60 * 60_000;

export const IDLE = {
    FIRST_MS: IDLE_STEP_MS,
    STEP_MS: IDLE_STEP_MS,
    MAX_DOWN: 4,
    /** How often the idle time is evaluated (game time, so it does not run while the tab is hidden). */
    CHECK_MS: Math.min(30_000, IDLE_STEP_MS / 4),
    /** Chance per check, once a hero is due to drop, that it happens now — so it does not happen to the second. */
    DROP_CHANCE: 0.4,
    /** Share of the drops that are a full fall (the rest doze off on their feet). */
    FALL_SHARE: 0.5,
    /** At most this many heroes lie on the floor at once — the rows are tight, more of them would pile onto each other. The rest doze standing. */
    MAX_LYING: 2,
    WAKE_STAGGER_MS: 140,
    /** A sleeper lets out a floating "Z" this often (the only movement while asleep — keeps the display in low-frame-rate idle). */
    SNORE_MIN_MS: 25_000,
    SNORE_MAX_MS: 40_000,
} as const;

export const HUD = {
    BAR_X: 32,
    BAR_Y: 22,
    BAR_WIDTH: GAME.WIDTH - 64,
    BAR_HEIGHT: 30,
} as const;

/**
 * "Breathing": every character in turn shifts its weight from foot to foot (systems/BreathRelay.ts). Driven by timers and
 * texture swaps, never tweens — a tween would pull PowerSaver up to the active frame rate. LANES characters breathe at once.
 */
export const BREATH = {
    FRAME_MS: 260,
    /** Pause before the next character takes over, random in [min, max]. */
    GAP_MS: [500, 1400],
    LANES: 2,
} as const;

export const FX = {
    /** Comic onomatopoeia text only pops up for sales at/above this size — keeps
     * frequent small sales from making the screen "chatter" with text every hit. */
    COMIC_TEXT_MIN_DELTA: 50000,
} as const;

export const POLL = {
    INTERVAL_MS: 15000,
    /**
     * Longer than the poll interval on purpose: Apps Script answers in ~3 s typically, but roughly one
     * request in ten takes 10–30 s (measured 2026-09-21). Giving up at 15 s turned each of those into a
     * failed poll; DataPollingService never runs two polls at once, so a slow one just delays the next.
     */
    TIMEOUT_MS: 30000,
    /**
     * If the status request has not answered after this long — a cold Apps Script instance can take 10–40 s,
     * which left the screen at zeros for a minute after opening the page — a second identical request is
     * started and whichever answers first wins. (A request that fails outright is retried at once.) At most
     * MAX_ATTEMPTS per poll, so the extra load only exists while the backend is being slow.
     */
    HEDGE_AFTER_MS: 6000,
    MAX_ATTEMPTS: 2,
    /** One failed poll in a row is normal noise and is not shown; from this many the HUD says "offline". */
    OFFLINE_AFTER_FAILURES: 2,
    MAX_CONSECUTIVE_FAILURES: 5,
    /** A command older than this when the display first sees it (it was offline) is not worth playing any more. */
    COMMAND_MAX_AGE_MS: 120_000,
    /** Gap between several commands that arrive in one poll, so they read one after another. */
    COMMAND_STAGGER_MS: 700,
} as const;

export const HERO_SLUGS = [
    'hero_lion',
    'hero_scrooge',
    'hero_grinch',
    'hero_yoda',
    'hero_neznaika',
    'hero_minion',
    'lead_cruella',
] as const;

export type HeroSlug = typeof HERO_SLUGS[number];
