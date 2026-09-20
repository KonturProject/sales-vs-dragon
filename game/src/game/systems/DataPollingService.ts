import { EventBus, GameEvents, MoneyInPayload, ProgressChangedPayload } from '../core/EventBus';
import { GameState, StatusResponse } from '../core/GameState';
import { DRAGON, HERO, POLL } from '../core/Constants';
import { RosterConfig } from './RosterConfig';

interface RuntimeConfig {
    appsScriptUrl: string;
    useMock?: boolean;
}

/** Pause after the last hit animation of a poll before the dragon starts losing heads, so the blow reads first. */
const HEAD_LOSS_LEAD_MS = 600;

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let consecutiveFailures = 0;
let config: RuntimeConfig | null = null;

async function loadRuntimeConfig(): Promise<RuntimeConfig> {
    const res = await fetch('config.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`config.json fetch failed: ${res.status}`);
    return res.json();
}

async function fetchStatus(): Promise<StatusResponse> {
    if (!config) throw new Error('DataPollingService not started');

    if (config.useMock || !config.appsScriptUrl) {
        const res = await fetch('assets/mock/mock-status.json', { cache: 'no-store' });
        return res.json();
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), POLL.TIMEOUT_MS);
    try {
        const res = await fetch(config.appsScriptUrl, { signal: controller.signal });
        if (!res.ok) throw new Error(`status fetch failed: ${res.status}`);
        return res.json();
    } finally {
        clearTimeout(timeout);
    }
}

function diffAndEmit(previous: Record<string, number> | null, status: StatusResponse) {
    let hitCount = 0;

    if (previous !== null) {
        let staggerIndex = 0;
        for (const row of status.byRop) {
            const before = previous[row.ropName] ?? 0;
            const delta = row.amount - before;
            if (delta > 0) {
                const heroSlug = RosterConfig.heroSlugForRop(row.ropName);
                const payload: MoneyInPayload = { heroSlug: heroSlug ?? 'overflow', ropName: row.ropName, delta };
                const fireAt = staggerIndex * HERO.HIT_STAGGER_MS;
                staggerIndex++;
                hitCount++;
                setTimeout(() => EventBus.emit(GameEvents.MONEY_IN, payload), fireAt);
            }
        }
    }

    // Head loss / victory should only play once every staggered hit from this
    // poll has had time to land — otherwise it steals attention from the blow.
    const hitsFinishAt = hitCount > 0 ? (hitCount - 1) * HERO.HIT_STAGGER_MS + HERO.HIT_DURATION_MS : 0;
    const settleDelayMs = hitCount > 0 ? hitsFinishAt + HEAD_LOSS_LEAD_MS : 0;

    const isBaseline = previous === null;
    const heads = GameState.headsRemaining;
    const previousHeads = GameState.lastHeads;

    const progress: ProgressChangedPayload = {
        ratio: GameState.ratio,
        totalThisWeek: status.totalThisWeek,
        plan: status.plan,
        headsRemaining: heads,
    };
    EventBus.emit(GameEvents.PROGRESS_CHANGED, progress);
    EventBus.emit(GameEvents.DATA_UPDATED, status);

    // The first poll after page load is only a baseline: PenScene puts the
    // dragon straight into the right state, no head-loss animation for
    // progress that was made before this tab opened.
    let lostCount = 0;
    if (!isBaseline && heads < previousHeads) {
        for (let h = previousHeads - 1; h >= heads; h--) {
            const delayMs = settleDelayMs + lostCount * DRAGON.HEAD_LOSS_STAGGER_MS;
            lostCount++;
            EventBus.emit(GameEvents.DRAGON_HEAD_LOST, { heads: h, delayMs });
        }
    }
    GameState.lastHeads = heads;

    if (GameState.ratio >= 1 && !GameState.dragonDefeated) {
        GameState.dragonDefeated = true;
        const delayMs = isBaseline ? 0 : settleDelayMs + lostCount * DRAGON.HEAD_LOSS_STAGGER_MS;
        EventBus.emit(GameEvents.DRAGON_DEFEATED, { delayMs });
    } else if (GameState.ratio < 1 && GameState.dragonDefeated) {
        // New week (or a raised plan) dropped us back under 100% — un-latch so
        // crossing the goal again later re-fires the victory.
        GameState.dragonDefeated = false;
    }
}

async function tick() {
    try {
        const status = await fetchStatus();
        const previous = GameState.applyStatus(status);
        consecutiveFailures = 0;
        diffAndEmit(previous, status);
    } catch (err) {
        console.error('[DataPollingService] tick failed:', err);
        consecutiveFailures++;
        GameState.lastFetchOk = false;
        EventBus.emit(GameEvents.FETCH_ERROR, { consecutiveFailures, error: String(err) });
        // Keep polling regardless of failure count — a long-lived kiosk tab should
        // recover on its own once connectivity/the endpoint comes back.
    }
}

export const DataPollingService = {
    async start() {
        if (intervalHandle !== null) return;
        config = await loadRuntimeConfig();
        await tick();
        intervalHandle = setInterval(tick, POLL.INTERVAL_MS);
    },

    /** Dev-only entry point: runs a synthetic status through exactly the same apply/diff path as a real poll. */
    applyForDebug(status: StatusResponse) {
        const previous = GameState.applyStatus(status);
        diffAndEmit(previous, status);
    },

    stop() {
        if (intervalHandle !== null) {
            clearInterval(intervalHandle);
            intervalHandle = null;
        }
    },
};
