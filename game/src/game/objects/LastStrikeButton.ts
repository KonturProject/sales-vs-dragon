import { GameObjects, Geom, Scene } from 'phaser';
import { GAME, HUD } from '../core/Constants';
import { AudioSystem } from '../systems/Audio';

const PAD_X = 12;
const HEIGHT = 26;

/**
 * «Показать последний удар»: a small dark plate with a label, in the HUD's look (like the counter plate). Pressing it calls
 * `onPress`, which shows the strike and answers for how long (ms) it keeps the hero busy — until then the button stays pale and
 * ignores presses. Not available (pale) while there is nothing to show.
 */
export class LastStrikeButton {
    private readonly plate: GameObjects.Graphics;
    private readonly text: GameObjects.Text;
    private readonly width: number;
    private available = false;
    private busy = false;
    private hover = false;

    constructor(private scene: Scene, private x: number, private y: number, private onPress: () => number | null) {
        this.text = scene.add.text(x + PAD_X, y, 'Показать последний удар', {
            fontFamily: HUD.FONT,
            fontStyle: 'bold',
            fontSize: '14px',
            resolution: GAME.RENDER_SCALE,
            color: HUD.COLORS.label,
        }).setOrigin(0, 0.5).setStroke(HUD.COLORS.stroke, 3).setDepth(4);
        this.width = this.text.width + PAD_X * 2;
        this.plate = scene.add.graphics().setDepth(3.9);
        this.plate.setInteractive(new Geom.Rectangle(x, y - HEIGHT / 2, this.width, HEIGHT), Geom.Rectangle.Contains);
        this.plate.input!.cursor = 'pointer';
        this.plate.on('pointerover', () => { this.hover = true; this.draw(); });
        this.plate.on('pointerout', () => { this.hover = false; this.draw(); });
        this.plate.on('pointerdown', () => this.press());
        this.draw();
    }

    setAvailable(available: boolean) {
        if (this.available === available) return;
        this.available = available;
        this.draw();
    }

    private press() {
        if (!this.available || this.busy) return;
        AudioSystem.init(); // the first press may be the first user gesture of the page: unlock the sound
        const busyMs = this.onPress();
        if (!busyMs) return;
        this.busy = true;
        this.draw();
        this.scene.time.delayedCall(busyMs, () => { this.busy = false; this.draw(); });
    }

    private draw() {
        const usable = this.available && !this.busy;
        const lit = usable && this.hover;
        this.plate.clear();
        this.plate.fillStyle(HUD.COLORS.labelPlate, 0.85).fillRoundedRect(this.x, this.y - HEIGHT / 2, this.width, HEIGHT, HEIGHT / 2);
        this.plate.lineStyle(lit ? 2 : 1, lit ? 0xff9a3d : HUD.COLORS.dividerLight, lit ? 1 : 0.8)
            .strokeRoundedRect(this.x, this.y - HEIGHT / 2, this.width, HEIGHT, HEIGHT / 2);
        this.text.setColor(lit ? HUD.COLORS.text : HUD.COLORS.label);
        this.plate.setAlpha(usable ? 1 : 0.45);
        this.text.setAlpha(usable ? 1 : 0.45);
    }
}
