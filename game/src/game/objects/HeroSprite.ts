import { Display, GameObjects, Scene } from 'phaser';
import { HeroDef } from '../systems/RosterConfig';
import { FX, HERO } from '../core/Constants';
import { emitBurst, emitSparkles, emitShockwaveRing, emitComicText, Swayable } from '../systems/Fx';

/**
 * A department mascot. The sprite is anchored at its feet (bottom-center) and
 * every texture — standing and hit poses alike — is already at one common
 * pixel scale (tools/build-sprites.py), so swapping textures never changes the
 * character's size and squash/stretch tweens pivot around the feet.
 *
 * Standing, the hero never moves vertically (no bob) — it stands on the floor.
 */
export class HeroSprite extends GameObjects.Container implements Swayable {
    private sprite: GameObjects.Image;
    private baseX: number;
    private baseScale: number;
    private busy = false;
    private tintColor: number;
    private defaultTexture: string;
    private hitPoses: string[];
    private nextHitPoseIndex = 0;

    constructor(scene: Scene, x: number, y: number, def: HeroDef, scaleMul = 1) {
        super(scene, x, y);
        this.baseX = x;
        this.baseScale = HERO.TEXTURE_SCALE * scaleMul;
        this.tintColor = Display.Color.HexStringToColor(def.color).color;
        this.defaultTexture = def.sprite;

        // Alternate attack poses (`<sprite>_hit1..N`, N = def.hits), cycled
        // round-robin across successive hits; only those that actually loaded.
        this.hitPoses = [];
        for (let i = 1; i <= def.hits; i++) {
            const key = `${def.sprite}_hit${i}`;
            if (scene.textures.exists(key)) this.hitPoses.push(key);
        }

        this.sprite = scene.add.image(0, 0, def.sprite).setOrigin(0.5, 1);
        this.add(this.sprite);
        this.setScale(this.baseScale);

        scene.add.existing(this);
    }

    canSway() {
        return !this.busy;
    }

    private setPose(textureKey: string) {
        this.sprite.setTexture(textureKey);
    }

    /**
     * Wind-up, dash along the hero's own row until its leading edge reaches the
     * foot of the dragon's mountain (STRIKE_FRONT_X), blow + recoil there, then
     * walk back to the slot. The colored burst, shake and ring fire when the hero
     * *arrives* (HERO.IMPACT_MS after the call), which is also when PenScene makes
     * the dragon react. Used by the hero whose department (СР-код) the incoming
     * sale is mapped to. The run is along x only — the feet stay on the floor at
     * the slot's y (a front-row hero may cover a back-row one for a moment; that
     * reads better than running everyone down to one spot in front of the gold).
     */
    playHit(delta = 0) {
        if (this.busy) return;
        this.busy = true;
        // The idle sway may be mid-tilt; the chain below takes over angle/scale.
        this.scene.tweens.killTweensOf(this);

        const s = this.baseScale;
        const restDepth = this.depth;
        // Just in front of same-row neighbours the dash passes through, still behind the row in front.
        this.setDepth(restDepth + 1);

        // Pick the pose now: its width decides where the hero has to stop so the
        // weapon/fist — not the hero's centre — touches the dragon.
        const pose = this.hitPoses.length > 0 ? this.hitPoses[this.nextHitPoseIndex] : this.defaultTexture;
        if (this.hitPoses.length > 0) this.nextHitPoseIndex = (this.nextHitPoseIndex + 1) % this.hitPoses.length;
        const poseWidth = this.scene.textures.getFrame(pose).width;
        const strikeX = Math.max(this.baseX, HERO.STRIKE_FRONT_X - (poseWidth * s * 1.12) / 2);
        let ghostTick = 0;

        this.scene.tweens.chain({
            targets: this,
            tweens: [
                // anticipation: brief squat/wind-up, a step back
                { x: this.baseX - HERO.WINDUP_BACK, scaleX: s * 0.92, scaleY: s * 1.06, angle: -3, duration: HERO.WINDUP_MS, ease: 'Quad.easeOut' },
                // dash to the dragon, accelerating into the blow
                {
                    x: strikeX, scaleX: s * 1.12, scaleY: s * 0.92, angle: 6, duration: HERO.RUN_MS, ease: 'Quad.easeIn',
                    onStart: () => this.setPose(pose),
                    onUpdate: () => {
                        // Low-alpha afterimage trail, throttled so it doesn't spawn one every frame.
                        if (++ghostTick % 3 !== 0) return;
                        const ghost = this.scene.add.image(this.x, this.y, this.sprite.texture.key)
                            .setOrigin(0.5, 1)
                            .setScale(this.scaleX, this.scaleY)
                            .setAngle(this.angle)
                            .setAlpha(0.22)
                            .setTint(this.tintColor)
                            .setDepth(restDepth - 1);
                        this.scene.tweens.add({
                            targets: ghost,
                            alpha: 0,
                            duration: 220,
                            onComplete: () => ghost.destroy(),
                        });
                    },
                    onComplete: () => {
                        // Contact: effects at the leading edge, where the blow lands.
                        const impactX = this.x + this.sprite.width * this.scaleX * 0.35;
                        const impactY = this.y - this.sprite.height * this.baseScale * 0.55;
                        emitBurst(this.scene, impactX, impactY, this.tintColor, 14);
                        this.scene.cameras.main.shake(100, 0.0035);
                        emitShockwaveRing(this.scene, impactX, impactY, this.tintColor);
                        if (delta >= FX.COMIC_TEXT_MIN_DELTA) emitComicText(this.scene, impactX, impactY - 20);
                    },
                },
                // recoil off the dragon
                { x: strikeX - 8, scaleX: s * 0.98, scaleY: s * 1.02, angle: -1.5, duration: HERO.RECOIL_MS, ease: 'Sine.easeOut' },
                // turn around and walk back to the slot
                {
                    x: this.baseX, scaleX: s, scaleY: s, angle: 0, duration: HERO.RETURN_MS, ease: 'Sine.easeInOut',
                    onStart: () => {
                        this.setPose(this.defaultTexture);
                        this.sprite.setFlipX(true);
                    },
                },
            ],
            onComplete: () => {
                this.sprite.setFlipX(false);
                this.setDepth(restDepth);
                this.busy = false;
            },
        });
    }

    /**
     * Victory bounce — a squash/stretch, repeated a few times. Only scale is
     * touched, so the feet stay planted on the floor.
     */
    playCelebrate() {
        const s = this.baseScale;
        this.scene.tweens.chain({
            targets: this,
            tweens: [
                { scaleX: s * 0.92, scaleY: s * 1.1, duration: 120, ease: 'Quad.easeOut' },
                { scaleX: s * 1.08, scaleY: s * 0.92, duration: 140, ease: 'Quad.easeIn' },
                { scaleX: s, scaleY: s, duration: 200, ease: 'Bounce.easeOut' },
            ],
            repeat: 2,
        });
        emitSparkles(this.scene, this.x, this.y - this.sprite.height * this.baseScale * 0.5, this.sprite.width * this.baseScale * 0.9, 10);
    }
}
