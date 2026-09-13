import { Events } from 'phaser';

export interface MoneyInPayload {
    heroSlug: string;
    ropName: string;
    delta: number;
}

export interface ProgressChangedPayload {
    ratio: number;
    metersRemaining: number;
    totalThisWeek: number;
    plan: number;
    /** How long PenScene should wait before opening the road flythrough, so hit animations read first. */
    roadDelayMs: number;
}

export interface FetchErrorPayload {
    consecutiveFailures: number;
    error: string;
}

export interface PigReachedPenPayload {
    /** Wait this long before playing the finale — lets any still-unfolding hit animations from the same poll finish first. */
    delayMs: number;
}

export interface MilestoneReachedPayload {
    ratio: number;
}

/**
 * Single shared emitter connecting DataPollingService (data layer) to the
 * Phaser scenes (PenScene draws hits/pig movement, HUDScene draws the bar).
 */
export const EventBus = new Events.EventEmitter();

export const GameEvents = {
    DATA_UPDATED: 'data:updated',
    MONEY_IN: 'money:in',
    PIG_REACHED_PEN: 'pig:reached-pen',
    PROGRESS_CHANGED: 'pig:progress-changed',
    FETCH_ERROR: 'data:fetch-error',
    MILESTONE_REACHED: 'pig:milestone-reached',
} as const;
