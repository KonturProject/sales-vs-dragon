import { GameObjects, Scene } from 'phaser';
import { EventBus, GameEvents, MoneyInPayload, ProgressChangedPayload, PigReachedPenPayload } from '../core/EventBus';
import { GameState } from '../core/GameState';
import { GAME, HERO, HUD, PEN } from '../core/Constants';
import { RosterConfig, HeroDef } from '../systems/RosterConfig';
import { DataPollingService } from '../systems/DataPollingService';
import { Pig } from '../objects/Pig';
import { HeroSprite } from '../objects/HeroSprite';
import { RoadLayer } from '../objects/RoadLayer';
import { RoadCamera } from '../systems/RoadCamera';
import { emitFloatingAmount, addIdleFlicker } from '../systems/Fx';
import { AudioSystem } from '../systems/Audio';

export class PenScene extends Scene {
    private pig!: Pig;
    private heroes = new Map<string, HeroSprite>();
    private flyingHeroSlug: string | null = null;
    private roadCamera!: RoadCamera;
    private hasAppliedFirstProgress = false;
    private lastRatio = 0;
    private hasPlayedVictory = false;

    constructor() {
        super('PenScene');
    }

    create() {
        this.cameras.main.setBackgroundColor('#08090f');

        const tableauObjects: GameObjects.GameObject[] = [];

        tableauObjects.push(
            this.add.image(GAME.WIDTH / 2, GAME.HEIGHT / 2, 'bg_city')
                .setDisplaySize(GAME.WIDTH, GAME.HEIGHT)
        );
        this.addAmbientBackground(tableauObjects);

        tableauObjects.push(
            this.add.image(PEN.X, PEN.Y, 'pen').setDisplaySize(PEN.DISPLAY_WIDTH, PEN.DISPLAY_HEIGHT)
        );

        this.pig = new Pig(this);
        tableauObjects.push(this.pig);

        const ground = RosterConfig.heroes.filter((h: HeroDef) => !h.flying);
        const flying = RosterConfig.heroes.filter((h: HeroDef) => h.flying);

        const onImpactFx = (objs: GameObjects.GameObject[]) => this.roadCamera.ignore(objs);

        ground.forEach((def: HeroDef, i: number) => {
            const x = HERO.GROUND_START_X + i * HERO.GROUND_SPACING;
            const hero = new HeroSprite(this, x, HERO.GROUND_Y, def, onImpactFx);
            this.heroes.set(def.slug, hero);
            tableauObjects.push(hero);
        });

        flying.forEach((def: HeroDef) => {
            const hero = new HeroSprite(this, HERO.FLYING_X, HERO.FLYING_Y, def, onImpactFx);
            this.heroes.set(def.slug, hero);
            this.flyingHeroSlug = def.slug;
            tableauObjects.push(hero);
        });

        const road = new RoadLayer(this);
        this.roadCamera = new RoadCamera(this, road);
        this.roadCamera.setup(this.cameras.main, tableauObjects);

        EventBus.on(GameEvents.MONEY_IN, this.onMoneyIn, this);
        EventBus.on(GameEvents.PROGRESS_CHANGED, this.onProgressChanged, this);
        EventBus.on(GameEvents.PIG_REACHED_PEN, this.onPigReachedPen, this);

        this.events.once('shutdown', () => {
            EventBus.off(GameEvents.MONEY_IN, this.onMoneyIn, this);
            EventBus.off(GameEvents.PROGRESS_CHANGED, this.onProgressChanged, this);
            EventBus.off(GameEvents.PIG_REACHED_PEN, this.onPigReachedPen, this);
        });

        // Apply whatever GameState already holds (e.g. if a poll landed before this
        // scene finished creating), then start/continue polling.
        this.onProgressChanged({
            ratio: GameState.ratio,
            metersRemaining: GameState.metersRemaining,
            totalThisWeek: GameState.totalThisWeek,
            plan: GameState.plan,
            roadDelayMs: 0,
        });

        DataPollingService.start();
    }

    /**
     * A few low-alpha neon glow strips and twinkling stars layered over the
     * static bg_city image — slow, narrow-range flicker so the background
     * reads as alive without being distracting on an always-on office display.
     */
    private addAmbientBackground(tableauObjects: GameObjects.GameObject[]) {
        const neonColors = [0x2fd0e0, 0xff4fa3, 0xc9a227];
        const neonX = [150, 450, 780];
        neonX.forEach((x, i) => {
            const strip = this.add.rectangle(x, 175, 36, 320, neonColors[i % neonColors.length], 0.14);
            addIdleFlicker(this, strip, 0.06, 0.16, 3500 + i * 900, i * 500);
            tableauObjects.push(strip);
        });

        for (let i = 0; i < 8; i++) {
            const star = this.add.circle(60 + i * 115 + Math.random() * 40, 20 + Math.random() * 110, 1.5, 0xffffff, 0.7);
            addIdleFlicker(this, star, 0.25, 0.85, 2000 + Math.random() * 2000, Math.random() * 1500);
            tableauObjects.push(star);
        }
    }

    private onMoneyIn(payload: MoneyInPayload) {
        AudioSystem.playHitThud();

        const hero = this.heroes.get(payload.heroSlug);
        if (hero) {
            hero.playHit(this.pig.x, payload.delta);
            const floatingAmount = emitFloatingAmount(
                this, hero.x, hero.y, payload.delta,
                HUD.BAR_X + HUD.BAR_WIDTH / 2, HUD.BAR_Y + HUD.BAR_HEIGHT / 2
            );
            this.roadCamera.ignore(floatingAmount);
        }

        this.pig.reactToHit();

        // The branch lead isn't tied to one department — she cheers on every sale.
        if (this.flyingHeroSlug && payload.heroSlug !== this.flyingHeroSlug) {
            this.heroes.get(this.flyingHeroSlug)?.playCheer();
        }
    }

    private onProgressChanged(payload: ProgressChangedPayload) {
        this.pig.setProgress(payload.ratio, payload.metersRemaining);

        // Skip the very first application (just establishing the baseline on
        // load), and skip polls that didn't actually move the pig — otherwise
        // every unchanged poll (every ~15s) would still pop the flythrough.
        const ratioChanged = Math.abs(payload.ratio - this.lastRatio) > 1e-6;
        if (this.hasAppliedFirstProgress && ratioChanged) {
            // Wait for the staggered hit animations to finish playing on the
            // tableau before the flythrough steals the screen.
            this.time.delayedCall(payload.roadDelayMs, () => this.roadCamera.flyTo(payload.ratio));
        }
        // If the finale already played and we've dropped back under 100% (a
        // new week starting, or the plan being raised), let the boss's held
        // victory pose/pulse relax back to normal.
        if (this.hasPlayedVictory && payload.ratio < 1) {
            this.hasPlayedVictory = false;
            if (this.flyingHeroSlug) this.heroes.get(this.flyingHeroSlug)?.resetPose();
        }

        this.hasAppliedFirstProgress = true;
        this.lastRatio = payload.ratio;
    }

    private onPigReachedPen(payload: PigReachedPenPayload) {
        this.time.delayedCall(payload.delayMs, () => {
            AudioSystem.playFanfare();
            this.hasPlayedVictory = true;
            this.heroes.forEach((hero, slug) => {
                if (slug === this.flyingHeroSlug) hero.playVictory();
                else hero.playCelebrate();
            });
            this.cameras.main.shake(300, 0.008);
        });
    }
}
