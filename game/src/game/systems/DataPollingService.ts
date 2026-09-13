import { EventBus, GameEvents, MoneyInPayload, ProgressChangedPayload } from '../core/EventBus';
import { GameState, StatusResponse } from '../core/GameState';
import { HERO, POLL, ROAD } from '../core/Constants';
import { RosterConfig } from './RosterConfig';

interface RuntimeConfig {
    appsScriptUrl: string;
    useMock?: boolean;
}

const MILESTONES = [0.25, 0.5, 0.75] as const;

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

    // The road flythrough should only open once every staggered hit has had
    // time to play out — otherwise it steals attention from the hit itself.
    const hitsFinishAt = hitCount > 0 ? (hitCount - 1) * HERO.HIT_STAGGER_MS + HERO.HIT_DURATION_MS : 0;
    const roadDelayMs = hitCount > 0 ? hitsFinishAt + ROAD.OPEN_DELAY_MS : 0;

    const progress: ProgressChangedPayload = {
        ratio: GameState.ratio,
        metersRemaining: status.metersRemaining,
        totalThisWeek: status.totalThisWeek,
        plan: status.plan,
        roadDelayMs,
    };
    EventBus.emit(GameEvents.PROGRESS_CHANGED, progress);
    EventBus.emit(GameEvents.DATA_UPDATED, status);

    if (GameState.ratio >= 1 && !GameState.reachedPen) {
        GameState.reachedPen = true;
        EventBus.emit(GameEvents.PIG_REACHED_PEN, { delayMs: roadDelayMs });
    } else if (GameState.ratio < 1 && GameState.reachedPen) {
        // New week (or a raised plan) dropped us back under 100% — un-latch so
        // crossing the goal again later re-fires the celebration.
        GameState.reachedPen = false;
    }

    // Smaller flourishes at 25/50/75% keep the screen alive throughout the
    // week, not just at the very end. Ratchets so each threshold fires once
    // per crossing; dropping back under 25% (new week) resets the ratchet.
    for (const m of MILESTONES) {
        if (GameState.ratio >= m && GameState.lastMilestoneRatio < m) {
            GameState.lastMilestoneRatio = m;
            EventBus.emit(GameEvents.MILESTONE_REACHED, { ratio: m });
        }
    }
    if (GameState.ratio < 0.25) {
        GameState.lastMilestoneRatio = 0;
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

    stop() {
        if (intervalHandle !== null) {
            clearInterval(intervalHandle);
            intervalHandle = null;
        }
    },
};
