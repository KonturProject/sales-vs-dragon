import { Display, GameObjects, Scene, Tweens } from 'phaser';
import { HeroDef } from '../systems/RosterConfig';
import { FX, HERO } from '../core/Constants';
import { emitBurst, emitSparkles, addIdleBob, emitShockwaveRing, emitComicText } from '../systems/Fx';

export class HeroSprite extends GameObjects.Container {
    private sprite: GameObjects.Image;
    private baseX: number;
    private baseScale: number;
    private busy = false;
    private tintColor: number;
    private defaultTexture: string;
    private hitPoses: string[];
    private nextHitPoseIndex = 0;
    private victoryTween?: Tweens.Tween;
    private onImpactFx?: (objs: GameObjects.GameObject[]) => void;

    /**
     * `onImpactFx` lets the owning scene register every transient FX object
     * this hero spawns (shockwave ring, comic text, afterimage ghosts) with
     * the road-camera's ignore list — otherwise they'd also render on the
     * ~7%-zoom corner mini-map as visual noise (see RoadCamera.ignore()).
     */
    constructor(scene: Scene, x: number, y: number, def: HeroDef, onImpactFx?: (objs: GameObjects.GameObject[]) => void) {
        super(scene, x, y);
        this.baseX = x;
        this.tintColor = Display.Color.HexStringToColor(def.color).color;
        this.defaultTexture = def.sprite;
        this.onImpactFx = onImpactFx;

        // Alternate attack poses (e.g. `hero_red_hit1..N`), when the hero has
        // any — cycled round-robin across successive hits for visual variety.
        // Preloader tries HERO.MAX_HIT_POSES per hero and simply skips the
        // ones that don't exist, so filter down to what actually loaded.
        this.hitPoses = [];
        for (let i = 1; i <= HERO.MAX_HIT_POSES; i++) {
            const key = `${def.sprite}_hit${i}`;
            if (scene.textures.exists(key)) this.hitPoses.push(key);
        }

        this.sprite = scene.add.image(0, 0, def.sprite);
        this.add(this.sprite);

        const targetHeight = def.flying ? HERO.FLYING_TARGET_HEIGHT : HERO.GROUND_TARGET_HEIGHT;
        this.baseScale = targetHeight / this.sprite.height;
        this.setScale(this.baseScale);

        scene.add.existing(this);

        addIdleBob(scene, this, 3, 1600 + Math.random() * 500, Math.random() * 400);

        // Occasional idle tilt so the tableau doesn't look frozen between sales —
        // Valkyrie already has her own cheer/victory behaviors, so ground heroes only.
        if (!def.flying) this.scheduleNextEmote();
    }

    private scheduleNextEmote() {
        this.scene.time.delayedCall(20000 + Math.random() * 10000, () => {
            if (!this.busy) this.playEmote();
            this.scheduleNextEmote();
        });
    }

    /** Generic placeholder idle flourish (no dedicated wink/yawn art exists yet) — a small guarded-by-busy tilt. */
    private playEmote() {
        this.scene.tweens.chain({
            targets: this,
            tweens: [
                { angle: -6, duration: 140, ease: 'Quad.easeOut' },
                { angle: 0, duration: 260, ease: 'Sine.easeOut' },
            ],
        });
    }

    /** Swap to a different pose/mood texture. */
    private setPose(textureKey: string) {
        this.sprite.setTexture(textureKey);
    }

    private resetPoseLater(delayMs: number) {
        this.scene.time.delayedCall(delayMs, () => this.setPose(this.defaultTexture));
    }

    /**
     * Wind-up + lunge punch toward the pig with a bounce-back overshoot, plus a
     * colored particle burst timed to the impact frame. Used by the hero whose
     * department (СР-код) the incoming sale is mapped to. Slower / weightier
     * than the first pass so the motion reads clearly instead of flickering.
     */
    playHit(towardX: number, delta = 0) {
        if (this.busy) return;
        this.busy = true;

        const s = this.baseScale;
        const lungeX = this.baseX + (towardX - this.baseX) * 0.28;
        const leanAngle = towardX > this.baseX ? 8 : -8;
        let ghostTick = 0;

        this.scene.tweens.chain({
            targets: this,
            tweens: [
                // anticipation: brief squat/wind-up
                { x: this.baseX - (lungeX - this.baseX) * 0.2, scaleX: s * 0.92, scaleY: s * 1.08, angle: -leanAngle * 0.4, duration: 160, ease: 'Quad.easeOut' },
                // strike
                {
                    x: lungeX, scaleX: s * 1.2, scaleY: s * 0.85, angle: leanAngle, duration: 190, ease: 'Quad.easeIn',
                    onStart: () => {
                        if (this.hitPoses.length > 0) {
                            this.setPose(this.hitPoses[this.nextHitPoseIndex]);
                            this.nextHitPoseIndex = (this.nextHitPoseIndex + 1) % this.hitPoses.length;
                        }
                        const impactX = this.x;
                        const impactY = this.y - this.sprite.displayHeight * this.baseScale * 0.3;
                        emitBurst(this.scene, impactX, impactY, this.tintColor, 14);
                        this.scene.cameras.main.shake(100, 0.0035);

                        const fxObjs: GameObjects.GameObject[] = [emitShockwaveRing(this.scene, impactX, impactY, this.tintColor)];
                        if (delta >= FX.COMIC_TEXT_MIN_DELTA) {
                            fxObjs.push(emitComicText(this.scene, impactX, impactY - 20));
                        }
                        this.onImpactFx?.(fxObjs);
                    },
                    onUpdate: () => {
                        // Low-alpha afterimage trail, throttled so it doesn't spawn one every frame.
                        if (++ghostTick % 4 !== 0) return;
                        const ghost = this.scene.add.image(this.x, this.y, this.sprite.texture.key)
                            .setScale(this.scaleX, this.scaleY)
                            .setAngle(this.angle)
                            .setAlpha(0.22)
                            .setTint(this.tintColor)
                            .setDepth((this.depth || 0) - 1);
                        this.scene.tweens.add({
                            targets: ghost,
                            alpha: 0,
                            duration: 220,
                            onComplete: () => ghost.destroy(),
                        });
                        this.onImpactFx?.([ghost]);
                    },
                },
                // overshoot recoil back to rest
                { x: this.baseX - 3, scaleX: s * 0.97, scaleY: s * 1.03, angle: -leanAngle * 0.25, duration: 220, ease: 'Sine.easeOut' },
                { x: this.baseX, scaleX: s, scaleY: s, angle: 0, duration: 240, ease: 'Sine.easeInOut' },
            ],
            onComplete: () => {
                if (this.hitPoses.length > 0) this.setPose(this.defaultTexture);
                this.busy = false;
            },
        });
    }

    /**
     * The team's leader isn't tied to one department — she reacts to *every*
     * sale with a small motivating flourish (and a mood-pose swap) instead of
     * a punch.
     */
    playCheer() {
        const s = this.baseScale;
        this.setPose('hero_boss_flying_celebrate');
        this.resetPoseLater(900);

        // Note: only scale here, never `y` — the idle-bob tween already owns `y`
        // continuously, and two tweens fighting over the same property causes
        // a visible jump when this one ends.
        this.scene.tweens.add({
            targets: this,
            scaleX: s * 1.1,
            scaleY: s * 1.1,
            duration: 260,
            yoyo: true,
            ease: 'Quad.easeOut',
        });
        emitSparkles(this.scene, this.x, this.y - this.sprite.displayHeight * this.baseScale * 0.5, this.sprite.displayWidth * this.baseScale * 0.6, 8);
    }

    /**
     * Weekly-goal finale for every ground heroine — a squash/stretch bounce,
     * repeated a few times. Deliberately never touches `y` (only scale), same
     * reason as playHit/playCheer: the idle-bob tween already owns `y`.
     */
    playCelebrate() {
        const s = this.baseScale;
        this.scene.tweens.chain({
            targets: this,
            tweens: [
                { scaleX: s * 0.9, scaleY: s * 1.15, duration: 120, ease: 'Quad.easeOut' },
                { scaleX: s * 1.15, scaleY: s * 0.85, duration: 140, ease: 'Quad.easeIn' },
                { scaleX: s, scaleY: s, duration: 200, ease: 'Bounce.easeOut' },
            ],
            repeat: 2,
        });
        emitSparkles(this.scene, this.x, this.y - this.sprite.displayHeight * this.baseScale * 0.5, this.sprite.displayWidth * this.baseScale * 0.6, 10);
    }

    /**
     * Boss-only weekly-goal finale — switches to the dedicated victory pose and
     * holds a gentle pulse indefinitely until resetPose() is called (when the
     * ratio drops back under 100%, e.g. a new week starting).
     */
    playVictory() {
        this.victoryTween?.stop();
        this.setPose('hero_boss_flying_victory');
        const s = this.baseScale;
        this.setScale(s);
        this.victoryTween = this.scene.tweens.add({
            targets: this,
            scaleX: s * 1.12,
            scaleY: s * 1.12,
            duration: 500,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });
        emitSparkles(this.scene, this.x, this.y - this.sprite.displayHeight * this.baseScale * 0.5, this.sprite.displayWidth * this.baseScale * 0.8, 20);
    }

    /** Companion to playVictory() — call when the celebration should end (ratio dropped back below 100%). */
    resetPose() {
        this.victoryTween?.stop();
        this.victoryTween = undefined;
        this.setScale(this.baseScale);
        this.setPose(this.defaultTexture);
    }
}
