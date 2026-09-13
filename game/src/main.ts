import StartGame from './game/main';
import { EventBus, GameEvents } from './game/core/EventBus';
import { GameState } from './game/core/GameState';
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
            reachPen: (delayMs = 0) => {
                EventBus.emit(GameEvents.PIG_REACHED_PEN, { delayMs });
            },
            pushStatus: (partial: Record<string, number>) => {
                Object.assign(GameState.byRop, partial);
                EventBus.emit(GameEvents.DATA_UPDATED, {
                    ok: true,
                    weekStart: '', weekEnd: '',
                    plan: GameState.plan,
                    totalThisWeek: GameState.totalThisWeek,
                    totalMeters: GameState.totalMeters,
                    metersRemaining: GameState.metersRemaining,
                    byRop: Object.entries(GameState.byRop).map(([ropName, amount]) => ({ ropName, amount })),
                    lastUpdated: new Date().toISOString(),
                });
            },
            audio: AudioSystem,
        };
    }

});
