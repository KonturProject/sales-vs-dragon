import { GameObjects, Scene } from 'phaser';
import { ROAD } from '../core/Constants';

/**
 * The long "road" world-layer: a distance strip from the team's starting
 * point to the pen, rendered only by the corner/flythrough camera (see
 * PenScene) — never by the main camera, so it can be as long as it needs to
 * be to actually feel like a journey without disturbing the hero tableau.
 */
export class RoadLayer {
    readonly objects: GameObjects.GameObject[] = [];
    readonly pigMarker: GameObjects.Image;
    private endX: number;

    constructor(scene: Scene) {
        this.endX = ROAD.START_X + ROAD.LENGTH;

        // Background and skyline scroll slower than the road itself (Phaser
        // per-object scrollFactor) for a depth-of-field parallax effect during
        // the flythrough. Safe to use here specifically because the whole
        // RoadLayer is rendered only by the dedicated road camera — the main
        // camera ignores it entirely (see PenScene/RoadCamera.setup()), so
        // there's no risk of this leaking into the hero tableau's rendering.
        // A reduced scrollFactor means the camera "outruns" content drawn only
        // across the road's own start..end range, so both layers are drawn
        // across a wider span than the pan actually covers, proportional to
        // (1 - scrollFactor), to avoid empty gaps at either end of the pan.
        const BG_SCROLL_FACTOR = 0.25;
        const SKY_SCROLL_FACTOR = 0.5;
        const bgMargin = ROAD.LENGTH * (1 - BG_SCROLL_FACTOR);
        const skyMargin = ROAD.LENGTH * (1 - SKY_SCROLL_FACTOR);

        const bg = scene.add.graphics();
        bg.fillGradientStyle(0x0c0e1a, 0x0c0e1a, 0x241830, 0x241830, 1);
        bg.fillRect(ROAD.START_X - 60 - bgMargin, 0, ROAD.LENGTH + 120 + bgMargin * 2, ROAD.Y + 160);
        bg.setScrollFactor(BG_SCROLL_FACTOR);
        this.objects.push(bg);

        // Distant skyline silhouette, repeated along the whole strip (and
        // beyond, per skyMargin above).
        const sky = scene.add.graphics();
        sky.fillStyle(0x161022, 1);
        for (let x = ROAD.START_X - 40 - skyMargin; x < this.endX + 40 + skyMargin; x += 70) {
            const h = 40 + ((x * 37) % 90);
            sky.fillRect(x, ROAD.Y - h, 46, h);
        }
        sky.setScrollFactor(SKY_SCROLL_FACTOR);
        this.objects.push(sky);

        // Road surface.
        const road = scene.add.graphics();
        road.fillStyle(0x1c1f2c, 1);
        road.fillRect(ROAD.START_X - 60, ROAD.Y + 30, ROAD.LENGTH + 120, 60);
        road.lineStyle(3, 0x3a5a7a, 0.7);
        road.lineBetween(ROAD.START_X - 60, ROAD.Y + 30, this.endX + 60, ROAD.Y + 30);
        this.objects.push(road);

        // Distance marker posts along the way, evenly spaced.
        for (let x = ROAD.START_X; x <= this.endX; x += ROAD.MARKER_SPACING) {
            const post = scene.add.graphics();
            post.fillStyle(0xc9a227, 1);
            post.fillRect(x - 3, ROAD.Y - 30, 6, 60);
            post.fillStyle(0xffe89a, 1);
            post.fillCircle(x, ROAD.Y - 32, 6);
            this.objects.push(post);
        }

        // Start marker (where the team stands) and end marker (the pen).
        const startFlag = scene.add.image(ROAD.START_X, ROAD.Y, 'hero_red').setScale(0.15).setTint(0xffffff);
        this.objects.push(startFlag);

        const penMarker = scene.add.image(this.endX, ROAD.Y, 'pen').setScale(0.28);
        this.objects.push(penMarker);

        this.pigMarker = scene.add.image(ROAD.START_X, ROAD.Y - 10, 'pig').setScale(0.22);
        this.objects.push(this.pigMarker);
    }

    worldXForRatio(ratio: number): number {
        const clamped = Math.min(1, Math.max(0, ratio));
        return ROAD.START_X + clamped * ROAD.LENGTH;
    }

    setRatio(ratio: number) {
        this.pigMarker.x = this.worldXForRatio(ratio);
    }
}
