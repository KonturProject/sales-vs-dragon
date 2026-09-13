import { Boot } from './scenes/Boot';
import { Preloader } from './scenes/Preloader';
import { PenScene } from './scenes/PenScene';
import { HUDScene } from './scenes/HUDScene';
import { AUTO, Game, Scale } from 'phaser';
import { GAME } from './core/Constants';

//  Find out more information about the Game Config at:
//  https://docs.phaser.io/api-documentation/typedef/types-core#gameconfig
const config: Phaser.Types.Core.GameConfig = {
    type: AUTO,
    width: GAME.WIDTH,
    height: GAME.HEIGHT,
    parent: 'game-container',
    backgroundColor: '#0b1220',
    pixelArt: true,
    roundPixels: true,
    scale: {
        mode: Scale.FIT,
        autoCenter: Scale.CENTER_BOTH
    },
    scene: [
        Boot,
        Preloader,
        PenScene,
        HUDScene
    ]
};

const StartGame = (parent: string) => {

    return new Game({ ...config, parent });

}

export default StartGame;
