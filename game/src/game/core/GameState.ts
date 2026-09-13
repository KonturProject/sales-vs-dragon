export interface RopAmount {
    ropName: string;
    amount: number;
}

export interface StatusResponse {
    ok: boolean;
    weekStart: string;
    weekEnd: string;
    plan: number;
    totalThisWeek: number;
    totalMeters: number;
    metersRemaining: number;
    byRop: RopAmount[];
    lastUpdated: string;
    error?: string;
}

/**
 * Centralized mutable state, shared between the polling system and every scene.
 * Not a Phaser object — plain singleton, following the game-creator EventBus/GameState pattern.
 */
class GameStateStore {
    plan = 0;
    totalThisWeek = 0;
    totalMeters = 300;
    metersRemaining = 300;
    byRop: Record<string, number> = {};
    /** true once at least one poll has landed — first poll is a baseline, never diffed */
    hasBaseline = false;
    reachedPen = false;
    /** Highest 25/50/75% milestone already celebrated this week — ratchets down to 0 once ratio drops back under 0.25. */
    lastMilestoneRatio = 0;
    lastFetchOk = false;
    lastUpdated: string | null = null;

    /**
     * Applies a fresh status response and returns the previous byRop snapshot
     * (for the caller to diff against) — null on the very first call.
     */
    applyStatus(status: StatusResponse): Record<string, number> | null {
        const previous = this.hasBaseline ? this.byRop : null;

        const nextByRop: Record<string, number> = {};
        for (const row of status.byRop) {
            nextByRop[row.ropName] = row.amount;
        }

        this.byRop = nextByRop;
        this.plan = status.plan;
        this.totalThisWeek = status.totalThisWeek;
        this.totalMeters = status.totalMeters;
        this.metersRemaining = status.metersRemaining;
        this.lastUpdated = status.lastUpdated;
        this.lastFetchOk = true;
        this.hasBaseline = true;

        return previous;
    }

    get ratio(): number {
        if (this.plan <= 0) return 0;
        return Math.min(1, Math.max(0, this.totalThisWeek / this.plan));
    }

    reset() {
        this.plan = 0;
        this.totalThisWeek = 0;
        this.totalMeters = 300;
        this.metersRemaining = 300;
        this.byRop = {};
        this.hasBaseline = false;
        this.reachedPen = false;
        this.lastMilestoneRatio = 0;
        this.lastFetchOk = false;
        this.lastUpdated = null;
    }
}

export const GameState = new GameStateStore();
