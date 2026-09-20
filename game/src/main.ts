import StartGame from './game/main';
import { EventBus, GameEvents } from './game/core/EventBus';
import { GameState, StatusResponse } from './game/core/GameState';
import { DataPollingService } from './game/systems/DataPollingService';
import { AudioSystem } from './game/systems/Audio';

document.addEventListener('DOMContentLoaded', () => {

    const game = StartGame('game-container');

    if (import.meta.env.DEV) {
        // Manual test hook: from the devtools console, e.g.
        //   __debug.hit('hero_blue', 50000)
        // fires a money:in event without waiting on a real poll cycle.
        (window as any).__debug = {
            EventBus,
            GameEvents,
            GameState,
            game,
            hit: (heroSlug: string, delta = 10000) => {
                EventBus.emit(GameEvents.MONEY_IN, { heroSlug, ropName: 'debug', delta });
            },
            /** Simulate the weekly total reaching `ratio` (0..1) of the plan: fires the same diff/events a real poll would. */
            setRatio: (ratio: number) => {
                const plan = GameState.plan || 5000000;
                const total = Math.round(plan * ratio);
                const rows = Object.keys(GameState.byRop).length
                    ? Object.entries(GameState.byRop).map(([ropName, amount]) => ({ ropName, amount }))
                    : [{ ropName: 'СР1', amount: 0 }];
                const first = rows[0];
                first.amount += total - GameState.totalThisWeek;
                (window as any).__debug.injectStatus({
                    ok: true, weekStart: '', weekEnd: '', plan, totalThisWeek: total, byRop: rows,
                    lastUpdated: new Date().toISOString(),
                });
            },
            /** Feed a status object through the real poll pipeline (diff -> hits, head loss, victory) without any network. */
            injectStatus: (status: StatusResponse) => {
                DataPollingService.applyForDebug(status);
            },
            /** `__debug.poller.stop()` freezes real polling so injected states aren't overwritten every 15s. */
            poller: DataPollingService,
            audio: AudioSystem,
        };
    }

});
