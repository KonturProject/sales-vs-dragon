import { Scene } from 'phaser';
import { HORDE } from '../core/Constants';

/** The still furniture of the goblin camp: a hide tent behind the campfire and a bone totem at the camp's near edge (HORDE.TENT / TOTEM). */
export class CampProps {
    constructor(scene: Scene) {
        for (const [key, at] of [['camp_tent', HORDE.TENT], ['camp_totem', HORDE.TOTEM]] as const) {
            // The tent's door looks right in the picture; the camp is entered from the heroes' side, on the left.
            scene.add.image(at.x, at.y, key).setOrigin(0.5, 1).setScale(0.5).setDepth(at.y).setFlipX(key === 'camp_tent');
        }
    }
}
