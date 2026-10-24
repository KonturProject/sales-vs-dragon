import { Scene } from 'phaser';
import { HORDE } from '../core/Constants';

/**
 * The still furniture of the goblin camp: two hide tents behind and beside the horde and a bone totem at the camp's
 * near edge (HORDE.TENTS / TOTEM). All face left, toward the heroes — the pictures look right, so they are mirrored.
 */
export class CampProps {
    constructor(scene: Scene) {
        const place = (key: string, at: { x: number; y: number }) =>
            scene.add.image(at.x, at.y, key).setOrigin(0.5, 1).setScale(0.5).setDepth(at.y).setFlipX(true);
        HORDE.TENTS.forEach(at => place('camp_tent', at));
        place('camp_totem', HORDE.TOTEM);
    }
}
