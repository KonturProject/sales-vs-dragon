import { GameObjects, Scene, Tweens } from 'phaser';
import { BREATH, HERO } from '../core/Constants';
import { emitSparkles, Swayable } from '../systems/Fx';
import { Breather } from '../systems/BreathRelay';

/**
 * The branch lead (Cruella). Not tied to any department: she stands apart from
 * the fighters, never throws a punch, cheers on every sale and celebrates the
 * victory. Has a single pose, so all reactions are code-driven (scale/sparkles).
 */
export class LeadSprite extends GameObjects.Container implements Swayable, Breather {
    private sprite: GameObjects.Image;
    private victoryTween?: Tweens.Tween;
    private baseScale: number;
    private stance: string;
    private breathFrames: string[] = [];

    constructor(scene: Scene, x: number, y: number, textureKey: string, scaleMul = 1, breathFrames = 1) {
        super(scene, x, y);
        this.stance = textureKey;
        for (let i = 2; i <= breathFrames; i++) {
            if (scene.textures.exists(`${textureKey}_breath${i}`)) this.breathFrames.push(`${textureKey}_breath${i}`);
        }
        this.baseScale = HERO.TEXTURE_SCALE * scaleMul;
        this.sprite = scene.add.image(0, 0, textureKey).setOrigin(0.5, 1);
        this.add(this.sprite);
        this.setScale(this.baseScale);
        scene.add.existing(this);
    }

    canSway() {
        return !this.victoryTween;
    }

    canBreathe() {
        return this.breathFrames.length > 0 && this.canSway();
    }

    /** One breath: the weight-shift frames in turn, then the stance (see HeroSprite.breathe). */
    breathe(onDone: () => void) {
        const frames = [...this.breathFrames, this.stance];
        const step = (i: number) => {
            if (!this.canSway()) return onDone();
            this.sprite.setTexture(frames[i]);
            if (i === frames.length - 1) return onDone();
            this.scene.time.delayedCall(BREATH.FRAME_MS, () => step(i + 1));
        };
        step(0);
    }

    /** Horizontal extent on screen. */
    span(): [number, number] {
        const half = (this.sprite.width * this.baseScale) / 2;
        return [this.x - half, this.x + half];
    }

    private sparkleOrigin() {
        return {
            x: this.x,
            y: this.y - this.sprite.height * this.baseScale * 0.6,
            spread: this.sprite.width * this.baseScale * 0.9,
        };
    }

    /** Small motivating flourish on every sale (scale only — the idle bob owns `y`). */
    playCheer() {
        const s = this.baseScale;
        this.scene.tweens.add({ targets: this, scaleX: s * 1.06, scaleY: s * 1.06, duration: 220, yoyo: true, ease: 'Quad.easeOut' });
        const o = this.sparkleOrigin();
        emitSparkles(this.scene, o.x, o.y, o.spread, 6);
    }

    /** Held victory pulse until resetPose() (ratio dropped back under 100%). */
    playVictory() {
        this.victoryTween?.stop();
        const s = this.baseScale;
        this.setScale(s);
        this.victoryTween = this.scene.tweens.add({
            targets: this,
            scaleX: s * 1.08,
            scaleY: s * 1.08,
            duration: 500,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });
        const o = this.sparkleOrigin();
        emitSparkles(this.scene, o.x, o.y, o.spread * 1.4, 20);
    }

    resetPose() {
        this.victoryTween?.stop();
        this.victoryTween = undefined;
        this.setScale(this.baseScale);
    }
}
