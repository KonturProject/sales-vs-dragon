import { Scene } from 'phaser';
import {
    EventBus, GameEvents, MoneyInPayload, ProgressChangedPayload, DragonHeadLostPayload, DragonDefeatedPayload,
} from '../core/EventBus';
import { GameState } from '../core/GameState';
import { fitCameraToGame } from '../core/Render';
import { DRAGON, GAME, HERO, HUD } from '../core/Constants';
import { RosterConfig, HeroDef } from '../systems/RosterConfig';
import { DataPollingService } from '../systems/DataPollingService';
import { Dragon } from '../objects/Dragon';
import { HeroSprite } from '../objects/HeroSprite';
import { LeadSprite } from '../objects/LeadSprite';
import { emitFloatingAmount, startIdleSway } from '../systems/Fx';
import { AudioSystem } from '../systems/Audio';

/**
 * The tableau: department heroes on the left, the dragon on its gold mountain
 * on the right, the branch lead standing apart. Reacts to game events only —
 * decisions about *what* happens (which hero hit, how many heads are left) are
 * made upstream in DataPollingService / GameState.
 */
export class PenScene extends Scene {
    private dragon!: Dragon;
    private heroes = new Map<string, HeroSprite>();
    private lead: LeadSprite | null = null;
    private hasAppliedFirstProgress = false;
    private hasPlayedVictory = false;

    constructor() {
        super('PenScene');
    }

    create() {
        fitCameraToGame(this);
        this.cameras.main.setBackgroundColor('#08090f');

        // Cave picture, built to exactly the canvas size by tools/build-sprites.py.
        this.add.image(GAME.WIDTH / 2, GAME.HEIGHT / 2, 'bg_cave').setDisplaySize(GAME.WIDTH, GAME.HEIGHT).setDepth(-10);

        this.dragon = new Dragon(this);

        // Depth follows the feet's y so the front row draws over the back row.
        const fighters = RosterConfig.heroes.filter((h: HeroDef) => !h.lead);
        fighters.forEach((def: HeroDef, i: number) => {
            const slot = HERO.SLOTS[i];
            const hero = new HeroSprite(this, slot.x, slot.y, def, slot.scale);
            hero.setDepth(slot.y);
            this.heroes.set(def.slug, hero);
        });

        const leadDef = RosterConfig.heroes.find((h: HeroDef) => h.lead);
        if (leadDef) {
            this.lead = new LeadSprite(this, HERO.LEAD.x, HERO.LEAD.y, leadDef.sprite, HERO.LEAD.scale);
            this.lead.setDepth(HERO.LEAD.y);
        }

        startIdleSway(this, [...this.heroes.values(), ...(this.lead ? [this.lead] : [])]);

        EventBus.on(GameEvents.MONEY_IN, this.onMoneyIn, this);
        EventBus.on(GameEvents.PROGRESS_CHANGED, this.onProgressChanged, this);
        EventBus.on(GameEvents.DRAGON_HEAD_LOST, this.onDragonHeadLost, this);
        EventBus.on(GameEvents.DRAGON_DEFEATED, this.onDragonDefeated, this);

        this.events.once('shutdown', () => {
            EventBus.off(GameEvents.MONEY_IN, this.onMoneyIn, this);
            EventBus.off(GameEvents.PROGRESS_CHANGED, this.onProgressChanged, this);
            EventBus.off(GameEvents.DRAGON_HEAD_LOST, this.onDragonHeadLost, this);
            EventBus.off(GameEvents.DRAGON_DEFEATED, this.onDragonDefeated, this);
        });

        // Apply whatever GameState already holds (e.g. if a poll landed before this
        // scene finished creating), then start/continue polling.
        this.onProgressChanged({
            ratio: GameState.ratio,
            totalThisWeek: GameState.totalThisWeek,
            plan: GameState.plan,
            headsRemaining: GameState.headsRemaining,
        });

        DataPollingService.start();
    }

    private onMoneyIn(payload: MoneyInPayload) {
        // The hero dashes to the dragon; the thud, the dragon's reaction and the
        // lead's cheer all land with the blow, not with the sale event.
        this.time.delayedCall(HERO.IMPACT_MS, () => AudioSystem.playHitThud());

        const hero = this.heroes.get(payload.heroSlug);
        if (hero) {
            hero.playHit(payload.delta);
            this.time.delayedCall(HERO.IMPACT_MS, () => this.dragon.reactToHit());
            emitFloatingAmount(
                this, hero.x, hero.y - 150, payload.delta,
                HUD.BAR_X + HUD.BAR_WIDTH / 2, HUD.BAR_Y + HUD.BAR_HEIGHT / 2
            );
        }

        // The branch lead isn't tied to one department — she cheers on every sale.
        this.time.delayedCall(HERO.IMPACT_MS, () => this.lead?.playCheer());
    }

    private onProgressChanged(payload: ProgressChangedPayload) {
        // Heads only ever *drop* through DRAGON_HEAD_LOST (animated, delayed so the
        // blows read first). Here we handle the baseline on load and regrowth
        // (a new week or a raised plan pushed the ratio back down).
        // The baseline is the first application made *after real data has landed*
        // (create() also calls this once with an empty GameState — that one must not
        // count, or the first poll's lower head count would be treated as a drop).
        if (!this.hasAppliedFirstProgress) {
            this.dragon.setHeads(payload.headsRemaining, false);
            this.hasAppliedFirstProgress = GameState.hasBaseline;
        } else if (payload.headsRemaining > this.dragon.headCount) {
            this.dragon.setHeads(payload.headsRemaining, true);
        }

        // Finale already played and we've dropped back under 100%: relax the victory pose.
        if (this.hasPlayedVictory && payload.ratio < 1) {
            this.hasPlayedVictory = false;
            this.lead?.resetPose();
        }
    }

    // Both handlers are delayed (so the blows read first), and the data can move
    // on in the meantime — e.g. the plan is raised mid-cascade and the ratio drops
    // back. A stale event must then be dropped, or the dragon would end up
    // headless/grey while GameState says it still has heads.
    private onDragonHeadLost(payload: DragonHeadLostPayload) {
        this.time.delayedCall(payload.delayMs, () => {
            if (payload.heads < GameState.headsRemaining) return;
            this.dragon.loseHead(payload.heads);
        });
    }

    private onDragonDefeated(payload: DragonDefeatedPayload) {
        this.time.delayedCall(payload.delayMs + DRAGON.HEAD_LOSS_DURATION_MS, () => {
            if (!GameState.dragonDefeated) return;
            AudioSystem.playFanfare();
            this.hasPlayedVictory = true;
            this.dragon.defeat();
            this.heroes.forEach(hero => hero.playCelebrate());
            this.lead?.playVictory();
            this.cameras.main.shake(300, 0.008);
        });
    }
}
