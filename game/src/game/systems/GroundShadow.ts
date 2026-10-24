import { GameObjects, Scene, Textures } from 'phaser';
import { GROUND_SHADOW } from '../core/Constants';

const TEXTURE = 'ground_shadow';

/**
 * A soft dark oval ON THE GROUND under a character (not a shadow effect on the character itself): one shared radial texture,
 * drawn once, one image per character, static unless its owner moves it. Depth sits just below the owner's feet line.
 */
export function createGroundShadow(scene: Scene, x: number, y: number, width: number): GameObjects.Image {
    if (!scene.textures.exists(TEXTURE)) {
        const tex = scene.textures.createCanvas(TEXTURE, 256, 64)!;
        const ctx = tex.getContext();
        ctx.save();
        ctx.translate(128, 32);
        ctx.scale(1, 0.25);
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 128);
        grad.addColorStop(0, 'rgba(0, 0, 0, 0.95)');
        grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.55)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(-128, -128, 256, 256);
        ctx.restore();
        tex.refresh();
        tex.setFilter(Textures.FilterMode.LINEAR);
    }
    const shadow = scene.add.image(x, y, TEXTURE).setAlpha(GROUND_SHADOW.ALPHA).setDepth(y - 0.4);
    placeGroundShadow(shadow, x, y, width);
    return shadow;
}

/** Centre `x`, feet line `y`, `width` of the oval (its height follows). */
export function placeGroundShadow(shadow: GameObjects.Image, x: number, y: number, width: number) {
    shadow.setPosition(x, y).setDisplaySize(width, Math.max(6, width * GROUND_SHADOW.FLATNESS));
}
