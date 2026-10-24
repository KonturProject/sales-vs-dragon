import { Scene } from 'phaser';
import { BREATH } from '../core/Constants';

/** Something that can shift its weight once, on request. `breathe` calls `onDone` when it has finished or given up. */
export interface Breather {
    canBreathe(): boolean;
    breathe(onDone: () => void): void;
}

/**
 * The "breath" is passed from one character to the next: BREATH.LANES of them move at a time, the rest stand still.
 * A character that is busy (striking, asleep, a goblin hurt or beaten) is skipped. Timers only, no tweens — a tween
 * would keep PowerSaver at the active frame rate; texture swaps made on timers are drawn at the idle rate.
 */
export class BreathRelay {
    private queue: Breather[] = [];
    private active = new Set<Breather>();

    constructor(private scene: Scene, private breathers: Breather[]) {}

    start() {
        for (let lane = 0; lane < BREATH.LANES; lane++) this.rest(lane * (BREATH.GAP_MS[1] / BREATH.LANES));
    }

    private rest(extraMs = 0) {
        const [min, max] = BREATH.GAP_MS;
        this.scene.time.delayedCall(extraMs + min + Math.random() * (max - min), () => this.pass());
    }

    private pass() {
        const next = this.take();
        if (!next) return this.rest();
        this.active.add(next);
        next.breathe(() => {
            this.active.delete(next);
            this.rest();
        });
    }

    /** The next character in a shuffled round that can breathe now and is not already breathing in the other lane. */
    private take(): Breather | null {
        for (let tries = 0; tries <= this.breathers.length; tries++) {
            if (this.queue.length === 0) this.queue = [...this.breathers].sort(() => Math.random() - 0.5);
            const candidate = this.queue.shift()!;
            if (!this.active.has(candidate) && candidate.canBreathe()) return candidate;
        }
        return null;
    }
}
