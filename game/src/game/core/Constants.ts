export const GAME = {
    /** Logical size — every coordinate in the code is in these units. */
    WIDTH: 1280,
    HEIGHT: 720,
    /**
     * The canvas buffer is RENDER_SCALE × the logical size (camera zoom, see
     * core/Render.ts) and text is rasterised at the same factor, so text and the 2×
     * hero textures land on buffer pixels 1:1 instead of being stretched from a 720p
     * buffer by the browser (that made HUD text blurry). Set to 1 to go back.
     */
    RENDER_SCALE: 2,
} as const;

/** Weekly plan is split into this many equal daily plans; each one crossed costs the dragon a head. */
export const DAYS = 5;

/**
 * Dragon + gold mountain, on the paved platform at the right of the cave
 * background. Textures are built at 2x their on-screen size by
 * tools/build-sprites.py, so they render at scale 0.5. Static — no idle bob.
 */
export const DRAGON = {
    HEADS_MAX: DAYS,
    /** Mountain of gold (symbol of the plan) — bottom-center anchored. */
    MOUNT_X: 945,
    MOUNT_BOTTOM_Y: 530,
    /** The dragon body sits on the mountain top — bottom-center anchored, faces left. */
    BODY_X: 967,
    BODY_BOTTOM_Y: 412,
    /** Where hero lunges aim (the dragon's chest/front) and hit effects burst. */
    HIT_X: 823,
    HIT_Y: 292,
    /** Stagger between successive head-loss animations when one poll crosses several day plans. */
    HEAD_LOSS_STAGGER_MS: 1100,
    HEAD_LOSS_DURATION_MS: 900,
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
        { x: 240, y: 508, scale: 0.92 },
        { x: 338, y: 578, scale: 1 },
        { x: 436, y: 508, scale: 0.92 },
        { x: 534, y: 578, scale: 1 },
        { x: 632, y: 508, scale: 0.92 },
        { x: 730, y: 578, scale: 1 },
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
     * The hero runs along its own row until its leading edge (weapon/fist) reaches
     * this x — the foot of the gold mountain under the dragon — and hits from there.
     * (Sending everyone down to one spot in front of the pile was tried and
     * rejected: the heroes looked like they were hitting the gold.)
     */
    STRIKE_FRONT_X: 790,
    /** How far the hero steps back in the wind-up, px. */
    WINDUP_BACK: 24,
    /** Branch lead (Cruella) stands apart from the department heroes, far left. Her train makes her sprite wide, hence the smaller scale. */
    LEAD: { x: 118, y: 540, scale: 0.85 },
} as const;

export const HUD = {
    BAR_X: 32,
    BAR_Y: 22,
    BAR_WIDTH: GAME.WIDTH - 64,
    BAR_HEIGHT: 30,
} as const;

export const FX = {
    /** Comic onomatopoeia text only pops up for sales at/above this size — keeps
     * frequent small sales from making the screen "chatter" with text every hit. */
    COMIC_TEXT_MIN_DELTA: 50000,
} as const;

export const POLL = {
    INTERVAL_MS: 15000,
    TIMEOUT_MS: 15000,
    MAX_CONSECUTIVE_FAILURES: 5,
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
