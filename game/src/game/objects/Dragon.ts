import { GameObjects, Scene, TintModes } from 'phaser';
import { DRAGON } from '../core/Constants';
import { emitBurst, emitCoinBurst, emitShockwaveRing } from '../systems/Fx';
import { AudioSystem } from '../systems/Audio';

const TEXTURE_SCALE = 0.5;

/**
 * The plan's guardian: a gold mountain with a five-headed dragon sitting on it.
 * The number of heads shown always mirrors GameState.headsRemaining — PenScene
 * decides *when* to change it (immediately on load, animated when a poll
 * crosses a daily plan), this class only knows *how*.
 */
export class Dragon extends GameObjects.Container {
    private mountain: GameObjects.Image;
    private bodyImg: GameObjects.Image;
    /** Heads the dragon is *heading to* — set the moment a loss starts, before its texture swap lands. */
    private heads: number = DRAGON.HEADS_MAX;
    /** Bumped by every state change; a delayed texture swap that finds it changed was superseded and must not apply. */
    private epoch = 0;
    private defeated = false;

    constructor(scene: Scene) {
        super(scene, 0, 0);

        this.mountain = scene.add.image(DRAGON.MOUNT_X, DRAGON.MOUNT_BOTTOM_Y, 'gold_mountain')
            .setOrigin(0.5, 1).setScale(TEXTURE_SCALE);
        this.bodyImg = scene.add.image(DRAGON.BODY_X, DRAGON.BODY_BOTTOM_Y, this.textureFor(this.heads))
            .setOrigin(0.5, 1).setScale(TEXTURE_SCALE);
        this.add([this.mountain, this.bodyImg]);
        scene.add.existing(this);
    }

    get headCount() {
        return this.heads;
    }

    private textureFor(heads: number) {
        return `dragon_heads${Math.max(0, Math.min(DRAGON.HEADS_MAX, heads))}`;
    }

    /** Puts the dragon straight into the state for `heads` heads; `animate` adds a small flash (used when heads grow back). */
    setHeads(heads: number, animate = false) {
        this.epoch++;
        this.heads = heads;
        this.bodyImg.setTexture(this.textureFor(heads));
        if (heads > 0 && this.defeated) this.clearDefeat();
        if (animate) this.flash(0xffffff, 140);
    }

    private flash(color: number, ms: number) {
        this.bodyImg.setTint(color).setTintMode(TintModes.FILL);
        this.scene.time.delayedCall(ms, () => {
            if (this.defeated) this.bodyImg.setTint(0x8a8a8a).setTintMode(TintModes.MULTIPLY);
            else this.bodyImg.clearTint();
        });
    }

    /** A department hero landed a blow: white flash, squash, shake and a spray of coins toward the attacker. */
    reactToHit() {
        if (this.defeated) return;
        this.flash(0xffffff, 90);
        emitCoinBurst(this.scene, DRAGON.HIT_X, DRAGON.HIT_Y + 40, 7, true);
        this.scene.tweens.add({
            targets: this.bodyImg,
            scaleX: TEXTURE_SCALE * 1.025,
            scaleY: TEXTURE_SCALE * 0.985,
            duration: 90,
            yoyo: true,
            ease: 'Quad.easeOut',
        });
        this.scene.tweens.add({
            targets: this.bodyImg,
            x: DRAGON.BODY_X + 5,
            duration: 55,
            yoyo: true,
            repeat: 1,
            ease: 'Sine.easeInOut',
            onComplete: () => { this.bodyImg.x = DRAGON.BODY_X; },
        });
    }

    /** One head falls: red flash + shockwave + a burst of fire-colored sparks, texture swaps at the flash peak. */
    loseHead(remaining: number) {
        AudioSystem.playHeadLost();
        this.scene.cameras.main.shake(320, 0.009);
        this.bodyImg.setTint(0xff3b1f).setTintMode(TintModes.FILL);

        const x = DRAGON.HIT_X - 10;
        const y = DRAGON.BODY_BOTTOM_Y - 170;
        emitBurst(this.scene, x, y, 0xff6a2a, 26);
        emitBurst(this.scene, x, y, 0xffd24a, 16);
        emitShockwaveRing(this.scene, x, y, 0xff6a2a);
        emitCoinBurst(this.scene, x, y + 20, 14, true);

        const epoch = ++this.epoch;
        this.heads = remaining;
        this.scene.time.delayedCall(140, () => {
            if (epoch !== this.epoch) return; // superseded (heads regrew / another change) while flashing
            this.bodyImg.setTexture(this.textureFor(remaining));
            this.bodyImg.setTint(0xffffff).setTintMode(TintModes.FILL);
        });
        this.scene.time.delayedCall(320, () => {
            if (this.defeated) this.bodyImg.setTint(0x8a8a8a).setTintMode(TintModes.MULTIPLY);
            else this.bodyImg.clearTint();
        });

        this.scene.tweens.add({
            targets: this.bodyImg,
            scaleX: TEXTURE_SCALE * 1.05,
            scaleY: TEXTURE_SCALE * 0.95,
            duration: 160,
            yoyo: true,
            ease: 'Quad.easeOut',
        });
    }

    /** Final head gone / plan closed: the dragon slumps and greys out until the next week regrows it. */
    defeat() {
        this.epoch++;
        this.defeated = true;
        this.heads = 0;
        this.bodyImg.setTexture(this.textureFor(0));
        this.bodyImg.setTint(0x8a8a8a).setTintMode(TintModes.MULTIPLY);
        this.scene.tweens.add({
            targets: this.bodyImg,
            angle: 1.5,
            duration: 700,
            ease: 'Sine.easeOut',
        });
    }

    private clearDefeat() {
        this.defeated = false;
        this.bodyImg.clearTint();
        this.bodyImg.setAngle(0);
    }
}
