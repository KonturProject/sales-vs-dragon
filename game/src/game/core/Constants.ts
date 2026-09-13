export const GAME = {
    WIDTH: 1024,
    HEIGHT: 576,
} as const;

export const PIG = {
    PATH_START_X: 760,
    PATH_END_X: 960,
    Y: 420,
    DEFAULT_TOTAL_METERS: 300,
    TARGET_HEIGHT: 150,
} as const;

export const PEN = {
    X: GAME.WIDTH - 130,
    Y: PIG.Y + 60,
    DISPLAY_WIDTH: 220,
    DISPLAY_HEIGHT: 160,
} as const;

export const HERO = {
    GROUND_Y: 460,
    GROUND_START_X: 140,
    GROUND_SPACING: 100,
    GROUND_TARGET_HEIGHT: 170,
    FLYING_X: 400,
    FLYING_Y: 155,
    FLYING_TARGET_HEIGHT: 220,
    HIT_STAGGER_MS: 300,
    /** Must match the summed duration of HeroSprite.playHit's tween chain (160+190+220+240). */
    HIT_DURATION_MS: 810,
    /** Upper bound tried per hero as `${sprite}_hit1..N.png` — heroes with fewer poses just 404 past their count. */
    MAX_HIT_POSES: 4,
} as const;

/**
 * The "road" is a second, much longer strip of the world that only the
 * corner mini-map / flythrough camera ever renders (the main camera ignores
 * it entirely, so the existing hero tableau is unaffected). It exists purely
 * to make "meters remaining" feel like an actual journey instead of the ~2px
 * of movement the tableau pig can physically afford on a 1024px screen.
 */
export const ROAD = {
    START_X: 1400,
    LENGTH: 3200,
    Y: 420,
    MARKER_SPACING: 320,
    CORNER_WIDTH: 240,
    CORNER_HEIGHT: 130,
    CORNER_MARGIN: 14,
    FLYOVER_X: 40,
    FLYOVER_Y: 70,
    FLYOVER_WIDTH: GAME.WIDTH - 80,
    FLYOVER_HEIGHT: 340,
    DOCK_DURATION: 450,
    PAN_DURATION: 1700,
    HOLD_DURATION: 550,
    FLY_ZOOM: 0.55,
    /** Pause after the last hit animation finishes before the flythrough opens, so the hit reads first. */
    OPEN_DELAY_MS: 1500,
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
    'hero_blue',
    'hero_green',
    'hero_purple',
    'hero_yellow',
    'hero_red',
    'hero_black',
    'hero_boss_flying',
] as const;

export type HeroSlug = typeof HERO_SLUGS[number];
