import { Events } from 'phaser';

export interface MoneyInPayload {
    heroSlug: string;
    ropName: string;
    delta: number;
}

export interface ProgressChangedPayload {
    ratio: number;
    totalThisWeek: number;
    plan: number;
    /** Dragon heads left after this poll (DAYS at 0%, 0 at 100%). */
    headsRemaining: number;
}

export interface FetchErrorPayload {
    consecutiveFailures: number;
    error: string;
}

export interface DragonHeadLostPayload {
    /** Heads left once this one is gone. */
    heads: number;
    /** Wait this long before playing it — lets the hit animations from the same poll read first. */
    delayMs: number;
}

export interface DragonDefeatedPayload {
    delayMs: number;
}

/**
 * Single shared emitter connecting DataPollingService (data layer) to the
 * Phaser scenes (PenScene draws hits and the dragon, HUDScene draws the bar and the victory banner).
 */
export const EventBus = new Events.EventEmitter();

export const GameEvents = {
    DATA_UPDATED: 'data:updated',
    MONEY_IN: 'money:in',
    PROGRESS_CHANGED: 'progress:changed',
    FETCH_ERROR: 'data:fetch-error',
    DRAGON_HEAD_LOST: 'dragon:head-lost',
    DRAGON_DEFEATED: 'dragon:defeated',
} as const;
