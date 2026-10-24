import { Scene } from 'phaser';
import { GAME, WORLD } from './Constants';

/**
 * Make a scene's main camera show the logical GAME.WIDTH × GAME.HEIGHT world on a
 * canvas that is GAME.RENDER_SCALE times larger. Every scene must call this once
 * at the start (Preloader, PenScene, HUDScene), otherwise it would only fill the
 * top-left corner of the bigger canvas. Zoom pivots on the camera origin, so the
 * origin is moved to the top-left corner — world (0,0) stays at buffer (0,0).
 */
export function fitCameraToGame(scene: Scene) {
    scene.cameras.main.setOrigin(0, 0).setZoom(GAME.RENDER_SCALE).setScroll(0, 0);
}

/**
 * Like fitCameraToGame, but zoomed out by WORLD.ZOOM so the stage shows a wider world (see WORLD in Constants.ts).
 * Only PenScene uses it; the HUD keeps the plain 1280×720 camera.
 */
export function fitCameraToWorld(scene: Scene) {
    scene.cameras.main.setOrigin(0, 0).setZoom(GAME.RENDER_SCALE * WORLD.ZOOM).setScroll(WORLD.X0, WORLD.Y0);
}

/** A point on the HUD screen in stage (PenScene world) coordinates — for effects that fly from the stage to the HUD. */
export function hudToWorld(x: number, y: number): { x: number; y: number } {
    return { x: WORLD.X0 + x / WORLD.ZOOM, y: WORLD.Y0 + y / WORLD.ZOOM };
}
