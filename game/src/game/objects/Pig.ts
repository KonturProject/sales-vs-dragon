import { GameObjects, Scene, TintModes } from 'phaser';
import { PIG } from '../core/Constants';
import { addIdleBob, emitSparkles } from '../systems/Fx';

const BUBBLE_COLOR = 0xd23a3a;
const BUBBLE_STROKE = 0xff9a9a;
const DEFAULT_TEXTURE = 'pig';

export class Pig extends GameObjects.Container {
    private sprite: GameObjects.Image;
    private baseScale: number;
    private bubbleBg: GameObjects.Graphics;
    private bubbleText: GameObjects.Text;
    private bubbleContainer: GameObjects.Container;
    private bubbleOffsetY: number;
    private celebrated = false;

    constructor(scene: Scene) {
        super(scene, PIG.PATH_START_X, PIG.Y);

        this.sprite = scene.add.image(0, 0, DEFAULT_TEXTURE);
        this.add(this.sprite);

        this.baseScale = PIG.TARGET_HEIGHT / this.sprite.height;
        this.setScale(this.baseScale);

        scene.add.existing(this);

        this.bubbleOffsetY = this.sprite.height * this.baseScale * 0.72;

        this.bubbleText = scene.add.text(0, 0, '', {
            fontFamily: 'Arial Black, Arial, sans-serif',
            fontSize: '17px',
            fontStyle: 'bold',
            color: '#fff5f5',
            align: 'center',
            wordWrap: { width: 220 },
        }).setOrigin(0.5);

        this.bubbleBg = scene.add.graphics();
        this.bubbleContainer = scene.add.container(this.x, this.y - this.bubbleOffsetY, [this.bubbleBg, this.bubbleText]);

        addIdleBob(scene, this, 3, 1900, 200);
    }

    private setPose(textureKey: string) {
        this.sprite.setTexture(textureKey);
    }

    private resetPoseLater(delayMs: number) {
        this.scene.time.delayedCall(delayMs, () => {
            if (!this.celebrated) this.setPose(DEFAULT_TEXTURE);
        });
    }

    setProgress(ratio: number, metersRemaining: number) {
        const clamped = Math.min(1, Math.max(0, ratio));

        // Ratio dropping back below 100% (a new week starting, or the plan
        // being raised) un-latches the celebration so it can fire again next
        // time the team hits the goal — otherwise `celebrated` stays true
        // forever and the pig never celebrates again after the first week.
        if (clamped < 1 && this.celebrated) {
            this.celebrated = false;
            this.setPose(DEFAULT_TEXTURE);
        }

        const targetX = PIG.PATH_START_X + clamped * (PIG.PATH_END_X - PIG.PATH_START_X);

        this.scene.tweens.add({
            targets: this,
            x: targetX,
            duration: 600,
            ease: 'Sine.easeOut',
            onUpdate: () => {
                this.bubbleContainer.setPosition(this.x, this.y - this.bubbleOffsetY);
            },
        });

        this.setBubbleText(
            metersRemaining > 0 ? `Херачим! Осталось ${metersRemaining} метров!` : 'Загон взят!'
        );

        if (clamped >= 1 && !this.celebrated) {
            this.celebrated = true;
            this.celebrate();
        }
    }

    private setBubbleText(text: string) {
        this.bubbleText.setText(text);
        const w = Math.min(230, this.bubbleText.width + 28);
        const h = this.bubbleText.height + 18;

        this.bubbleBg.clear();
        this.bubbleBg.fillStyle(BUBBLE_COLOR, 0.95);
        this.bubbleBg.lineStyle(2, BUBBLE_STROKE, 1);
        this.bubbleBg.fillRoundedRect(-w / 2, -h / 2, w, h, 10);
        this.bubbleBg.strokeRoundedRect(-w / 2, -h / 2, w, h, 10);
        this.bubbleBg.fillTriangle(-8, h / 2 - 1, 8, h / 2 - 1, 0, h / 2 + 12);
        this.bubbleBg.lineStyle(2, BUBBLE_STROKE, 1);
        this.bubbleBg.lineBetween(-8, h / 2 - 1, 0, h / 2 + 12);
        this.bubbleBg.lineBetween(8, h / 2 - 1, 0, h / 2 + 12);
    }

    /** Squash + white flash + brief "dizzy" pose swap so the pig visibly reacts to every hit. */
    reactToHit() {
        const s = this.baseScale;
        this.setPose('pig_dizzy');
        this.resetPoseLater(500);

        this.sprite.setTint(0xffffff).setTintMode(TintModes.FILL);
        this.scene.time.delayedCall(90, () => this.sprite.clearTint());

        this.scene.tweens.chain({
            targets: this,
            tweens: [
                { scaleX: s * 1.1, scaleY: s * 0.88, duration: 110, ease: 'Quad.easeOut' },
                { scaleX: s, scaleY: s, duration: 220, ease: 'Sine.easeOut' },
            ],
        });
    }

    private celebrate() {
        this.setPose('pig_curled');

        this.scene.tweens.add({
            targets: this,
            angle: { from: -8, to: 8 },
            duration: 160,
            yoyo: true,
            repeat: 5,
        });

        emitSparkles(this.scene, this.x, this.y - this.sprite.displayHeight * this.baseScale * 0.3, this.sprite.displayWidth * this.baseScale * 0.8, 24);
        this.scene.cameras.main.shake(220, 0.006);
    }
}
