import { Cameras, GameObjects, Scene } from 'phaser';
import { GAME, ROAD } from '../core/Constants';
import { RoadLayer } from '../objects/RoadLayer';
import { AudioSystem } from './Audio';

const DOCK_X = GAME.WIDTH - ROAD.CORNER_WIDTH - ROAD.CORNER_MARGIN;
const DOCK_Y = ROAD.CORNER_MARGIN;
const DOCK_ZOOM = Math.min(
    ROAD.CORNER_WIDTH / (ROAD.LENGTH + 300),
    ROAD.CORNER_HEIGHT / 260
);
const ROAD_CENTER_X = ROAD.START_X + ROAD.LENGTH / 2;

/**
 * Owns the small "road mini-map" camera: docked in the top-right corner by
 * default (zoomed out to show the whole journey), and briefly expanding into
 * a large flythrough that pans along the road on every progress update,
 * before shrinking back to its dock. Runs alongside the main camera, which
 * never sees the road layer at all (mutual `ignore()` calls in setup()).
 */
export class RoadCamera {
    private scene: Scene;
    private cam: Cameras.Scene2D.Camera;
    private road: RoadLayer;
    private busy = false;
    private pendingRatio: number | null = null;
    private currentRatio = 0;

    constructor(scene: Scene, road: RoadLayer) {
        this.scene = scene;
        this.road = road;
        this.cam = scene.cameras.add(DOCK_X, DOCK_Y, ROAD.CORNER_WIDTH, ROAD.CORNER_HEIGHT);
        this.cam.setBackgroundColor('#0c0e1a');
        this.cam.setZoom(DOCK_ZOOM);
        this.cam.centerOn(ROAD_CENTER_X, ROAD.Y);
        this.cam.setRoundPixels(true);

        // Decorative frame around the docked corner viewport — drawn by the
        // main camera only (fixed screen position), not by the road camera
        // itself, which would otherwise render its own border recursively.
        const border = scene.add.graphics().setDepth(1000);
        border.lineStyle(2, 0x3a5a7a, 0.9);
        border.strokeRoundedRect(DOCK_X - 2, DOCK_Y - 2, ROAD.CORNER_WIDTH + 4, ROAD.CORNER_HEIGHT + 4, 6);
        this.cam.ignore(border);
    }

    /** Main camera never renders the road; road camera never renders the tableau. */
    setup(mainCamera: Cameras.Scene2D.Camera, tableauObjects: GameObjects.GameObject[]) {
        mainCamera.ignore(this.road.objects);
        this.cam.ignore(tableauObjects);
    }

    /**
     * Passthrough for transient FX objects created after setup() (shockwave
     * rings, comic text, afterimage ghosts, floating amounts) — without this
     * they'd also render on the ~7%-zoom corner mini-map as visual noise.
     */
    ignore(obj: GameObjects.GameObject | GameObjects.GameObject[]) {
        this.cam.ignore(obj);
    }

    /**
     * Queue a flythrough from the current position to `toRatio`. If one is
     * already playing, the new target is remembered and picked up when the
     * current flythrough finishes, rather than fighting it mid-tween.
     */
    flyTo(toRatio: number) {
        if (this.busy) {
            this.pendingRatio = toRatio;
            return;
        }
        this.busy = true;
        this.runFlythrough(toRatio);
    }

    private runFlythrough(toRatio: number) {
        AudioSystem.playWhoosh();

        const fromRatio = this.currentRatio;
        const fromX = this.road.worldXForRatio(fromRatio);

        this.road.pigMarker.x = fromX;
        this.cam.centerOn(fromX, ROAD.Y);

        this.scene.tweens.add({
            targets: this.cam,
            x: ROAD.FLYOVER_X,
            y: ROAD.FLYOVER_Y,
            width: ROAD.FLYOVER_WIDTH,
            height: ROAD.FLYOVER_HEIGHT,
            zoom: ROAD.FLY_ZOOM,
            duration: ROAD.DOCK_DURATION,
            ease: 'Sine.easeInOut',
            onComplete: () => this.panAlongRoad(fromRatio, toRatio),
        });
    }

    private panAlongRoad(fromRatio: number, toRatio: number) {
        const progress = { t: fromRatio };
        this.scene.tweens.add({
            targets: progress,
            t: toRatio,
            duration: ROAD.PAN_DURATION,
            ease: 'Sine.easeInOut',
            onUpdate: () => {
                const worldX = this.road.worldXForRatio(progress.t);
                this.road.pigMarker.x = worldX;
                this.cam.centerOn(worldX, ROAD.Y);
            },
            onComplete: () => {
                this.currentRatio = toRatio;
                this.scene.time.delayedCall(ROAD.HOLD_DURATION, () => this.dock());
            },
        });
    }

    private dock() {
        this.scene.tweens.add({
            targets: this.cam,
            x: DOCK_X,
            y: DOCK_Y,
            width: ROAD.CORNER_WIDTH,
            height: ROAD.CORNER_HEIGHT,
            zoom: DOCK_ZOOM,
            duration: ROAD.DOCK_DURATION,
            ease: 'Sine.easeInOut',
            onUpdate: () => this.cam.centerOn(ROAD_CENTER_X, ROAD.Y),
            onComplete: () => {
                this.cam.centerOn(ROAD_CENTER_X, ROAD.Y);
                this.busy = false;
                if (this.pendingRatio !== null) {
                    const next = this.pendingRatio;
                    this.pendingRatio = null;
                    this.runFlythrough(next);
                }
            },
        });
    }
}
