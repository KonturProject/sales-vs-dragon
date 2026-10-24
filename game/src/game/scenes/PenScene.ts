import { Scene } from 'phaser';
import {
    EventBus, GameEvents, MoneyInPayload, ProgressChangedPayload, DragonHeadLostPayload, DragonDefeatedPayload, AdminCommandPayload,
} from '../core/EventBus';
import { GameState } from '../core/GameState';
import { fitCameraToWorld, hudToWorld } from '../core/Render';
import { DRAGON, HERO, HUD, WORLD } from '../core/Constants';
import { RosterConfig, HeroDef } from '../systems/RosterConfig';
import { DataPollingService } from '../systems/DataPollingService';
import { Horde } from '../objects/Horde';
import { CampProps } from '../objects/CampProps';
import { HeroSprite } from '../objects/HeroSprite';
import { LeadSprite } from '../objects/LeadSprite';
import { IdleMood } from '../systems/IdleMood';
import { emitFloatingAmount } from '../systems/Fx';
import { BreathRelay } from '../systems/BreathRelay';
import { AudioSystem } from '../systems/Audio';

/**
 * The tableau: department heroes on the left, the goblin horde (five goblins with
 * treasure, their chief behind) on the right, the branch lead standing apart
 * with the treasure won so far at her feet. Reacts to game events only — decisions
 * about *what* happens (which hero hit, how many goblins are left) are made
 * upstream in DataPollingService / GameState.
 */
export class PenScene extends Scene {
    private horde!: Horde;
    private heroes = new Map<string, HeroSprite>();
    private lead: LeadSprite | null = null;
    private hasAppliedFirstProgress = false;
    private hasPlayedVictory = false;
    /** Falls asleep when nobody sells for a long time; makes the goblin chief taunt (see systems/IdleMood.ts). */
    mood!: IdleMood;

    constructor() {
        super('PenScene');
    }

    create() {
        fitCameraToWorld(this);
        this.cameras.main.setBackgroundColor('#08090f');

        // Forest with the face-tree behind the heroes (tools/build-background.py), covering the whole zoomed-out view.
        this.add.image(WORLD.X0 + WORLD.W / 2, WORLD.Y0 + WORLD.H / 2, 'bg_forest').setDisplaySize(WORLD.W, WORLD.H).setDepth(-10);

        new CampProps(this);
        this.horde = new Horde(this);

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
            this.lead = new LeadSprite(this, HERO.LEAD.x, HERO.LEAD.y, leadDef.sprite, HERO.LEAD.scale, leadDef.breath);
            this.lead.setDepth(HERO.LEAD.y);
        }

        new BreathRelay(this, [...this.heroes.values(), ...(this.lead ? [this.lead] : []), ...this.horde.breathers()]).start();
        this.mood = new IdleMood(this, [...this.heroes.values()], this.horde, this.lead ? [this.lead.span()] : []);

        EventBus.on(GameEvents.MONEY_IN, this.onMoneyIn, this);
        EventBus.on(GameEvents.PROGRESS_CHANGED, this.onProgressChanged, this);
        EventBus.on(GameEvents.DRAGON_HEAD_LOST, this.onDragonHeadLost, this);
        EventBus.on(GameEvents.DRAGON_DEFEATED, this.onDragonDefeated, this);
        EventBus.on(GameEvents.ADMIN_COMMAND, this.onAdminCommand, this);

        this.events.once('shutdown', () => {
            EventBus.off(GameEvents.ADMIN_COMMAND, this.onAdminCommand, this);
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
        // The hero dashes to the front goblin and lands a series of blows; the thud, the goblin's reaction and the
        // lead's cheer all land with the blows, not with the sale event.
        const hero = this.heroes.get(payload.heroSlug);
        if (hero) {
            hero.playHit(payload.delta, this.horde.strikeFrontX(), index => {
                AudioSystem.playHitThud();
                this.horde.reactToHit();
                if (index === 0) this.lead?.playCheer();
            });
            const bar = hudToWorld(HUD.BAR_X + HUD.TRACK_INSET_LEFT + (HUD.BAR_WIDTH - HUD.TRACK_INSET_LEFT - HUD.TRACK_INSET_RIGHT) / 2, HUD.BAR_Y + HUD.BAR_HEIGHT / 2);
            emitFloatingAmount(this, hero.x, hero.y - 150, payload.delta, bar.x, bar.y);
        } else {
            // A sale of no mapped department: no hero to run, but the thud and the lead's cheer still land together.
            this.time.delayedCall(HERO.IMPACT_MS, () => {
                AudioSystem.playHitThud();
                this.lead?.playCheer();
            });
        }
    }

    /**
     * An animation requested from the admin page. Everything here is visual only — no GameState,
     * no data. A `hit` goes through the normal MONEY_IN path (flagged `demo`, so it does not count as a sale).
     */
    private onAdminCommand(cmd: AdminCommandPayload) {
        switch (cmd.type) {
            case 'hit': {
                const rop = String(cmd.args.rop ?? '');
                const delta = Number(cmd.args.amount) || 50000;
                EventBus.emit(GameEvents.MONEY_IN, {
                    heroSlug: RosterConfig.heroSlugForRop(rop) ?? 'overflow', ropName: rop, delta, demo: true,
                } satisfies MoneyInPayload);
                break;
            }
            case 'fall':
                this.mood.drop(String(cmd.args.hero ?? 'random'), String(cmd.args.mode ?? 'random'));
                break;
            case 'wake':
                this.mood.wakeAll();
                break;
            case 'growl':
                this.horde.growl();
                break;
            case 'celebrate':
                AudioSystem.playFanfare();
                this.heroes.forEach(hero => { if (hero.canSway()) hero.playCelebrate(); });
                this.lead?.playCheer();
                break;
            // 'confetti' is drawn by HUDScene (full-screen effect).
        }
    }

    private onProgressChanged(payload: ProgressChangedPayload) {
        // Heads only ever *drop* through DRAGON_HEAD_LOST (animated, delayed so the
        // blows read first). Here we handle the baseline on load and regrowth
        // (a new week or a raised plan pushed the ratio back down).
        // The baseline is the first application made *after real data has landed*
        // (create() also calls this once with an empty GameState — that one must not
        // count, or the first poll's lower head count would be treated as a drop).
        if (!this.hasAppliedFirstProgress) {
            this.horde.setHeads(payload.headsRemaining, false);
            this.hasAppliedFirstProgress = GameState.hasBaseline;
        } else if (payload.headsRemaining > this.horde.headCount) {
            this.horde.setHeads(payload.headsRemaining, true);
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
            this.horde.loseHead(payload.heads);
        });
    }

    private onDragonDefeated(payload: DragonDefeatedPayload) {
        this.time.delayedCall(payload.delayMs + DRAGON.HEAD_LOSS_DURATION_MS, () => {
            if (!GameState.dragonDefeated) return;
            AudioSystem.playFanfare();
            this.hasPlayedVictory = true;
            this.horde.defeat();
            this.heroes.forEach(hero => hero.playCelebrate());
            this.lead?.playVictory();
            this.cameras.main.shake(300, 0.008);
        });
    }
}
