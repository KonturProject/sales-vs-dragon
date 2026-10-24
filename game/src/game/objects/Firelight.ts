import { BlendModes, Animations, GameObjects, Scene } from 'phaser';
import { HORDE } from '../core/Constants';

const TEXTURE = 'firelight';
const TEXTURE_SIZE = 512;
/** Below every character (their depth is their feet's y, > 400) and above the background (-10). */
const DEPTH = -5;

/**
 * The campfire's light on the ground (HORDE.FIRELIGHT). One soft radial texture drawn once, additive blend; the flicker
 * follows the fire sprite's own frame changes — no tween and no timer of its own, so it costs nothing extra at idle.
 */
export class Firelight {
    private readonly glow: GameObjects.Image;

    constructor(scene: Scene, fire: GameObjects.Sprite) {
        const F = HORDE.FIRELIGHT;
        if (!scene.textures.exists(TEXTURE)) {
            const tex = scene.textures.createCanvas(TEXTURE, TEXTURE_SIZE, TEXTURE_SIZE);
            const ctx = tex!.getContext();
            const r = TEXTURE_SIZE / 2;
            const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
            grad.addColorStop(0, 'rgba(255, 190, 100, 0.95)');
            grad.addColorStop(0.3, 'rgba(255, 140, 60, 0.45)');
            grad.addColorStop(0.65, 'rgba(255, 100, 30, 0.14)');
            grad.addColorStop(1, 'rgba(255, 80, 20, 0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
            tex!.refresh();
        }
        this.glow = scene.add.image(fire.x, fire.y - F.LIFT, TEXTURE)
            .setBlendMode(BlendModes.ADD)
            .setDepth(DEPTH)
            .setDisplaySize((F.RADIUS * 2) * F.SCALE[0], (F.RADIUS * 1.35) * F.SCALE[0])
            .setAlpha(F.ALPHA[0]);
        fire.on(Animations.Events.ANIMATION_UPDATE, (_anim: unknown, frame: { index: number }) => this.flicker(frame.index));
    }

    private flicker(frameIndex: number) {
        const F = HORDE.FIRELIGHT;
        const i = frameIndex % F.ALPHA.length;
        this.glow.setAlpha(F.ALPHA[i]).setDisplaySize(F.RADIUS * 2 * F.SCALE[i], F.RADIUS * 1.35 * F.SCALE[i]);
    }
}
