import { Scene } from 'phaser';
import { EventBus, GameEvents, MoneyInPayload } from '../core/EventBus';
import { GameState } from '../core/GameState';
import { HERO, blowsFor, hitDurationMs } from '../core/Constants';

/**
 * One queue of hero strikes for the whole game. Every strike reserves "its series + a pause" and starts no earlier than the
 * previous one has ended, so heroes never rush the same goblin together (a file import changes the totals of several
 * departments at once). The reservations are shared by everything that makes a hero strike: sales found by a poll, strikes asked
 * for from the admin page, the monitor's «Показать последний удар» button.
 */
let freeAt = 0; // performance.now() when the last reserved strike (plus its pause) is over

/** How long the hero of `delta` roubles is busy (its blow series, to standing back at the slot). */
export function strikeDurationMs(delta: number): number {
    return hitDurationMs(blowsFor(delta, GameState.avgCheck));
}

/** Reserves the next slot; returns the delay in ms from now until the strike may start (0 when nobody is striking). */
export function reserveStrike(durationMs: number, gapMs: number = HERO.STRIKE_GAP_MS): number {
    const now = performance.now();
    const start = Math.max(now, freeAt);
    freeAt = start + durationMs + gapMs;
    return start - now;
}

/** MONEY_IN for a shown (demo) strike, queued behind the strikes already planned. Returns when it ends, ms from now. */
export function emitQueuedStrike(scene: Scene, payload: MoneyInPayload): number {
    const duration = strikeDurationMs(payload.delta);
    const delay = reserveStrike(duration);
    scene.time.delayedCall(delay, () => EventBus.emit(GameEvents.MONEY_IN, payload));
    return delay + duration;
}
