import { Scene } from 'phaser';
import { HORDE } from '../core/Constants';

/**
 * The still furniture of the goblin camp: two hide tents behind and beside the horde and two bone totems that stand like a gate across
 * the road at the camp's near edge (HORDE.TENTS / TOTEMS). All face left, toward the heroes — the pictures look right, so they are mirrored.
 */
export class CampProps {
    constructor(scene: Scene) {
        const place = (key: string, at: { x: number; y: number; scale: number }) =>
            scene.add.image(at.x, at.y, key).setOrigin(0.5, 1).setScale(0.5 * at.scale).setDepth(at.y).setFlipX(true);
        HORDE.TENTS.forEach(at => place('camp_tent', at));
        HORDE.TOTEMS.forEach(at => place('camp_totem', at));
    }
}
