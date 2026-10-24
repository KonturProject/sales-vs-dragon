import { GameObjects, Scene } from 'phaser';
import { GAME, HUD, HeroSlug } from '../core/Constants';
import { RosterConfig } from '../systems/RosterConfig';

const ROW_HEIGHT = 20;
const PANEL = HUD.PANEL;
/** On-screen height of a hero's head icon in a leaderboard row. */
const HEAD_ICON_HEIGHT = 20;

interface Row {
    row: GameObjects.Container;
    amountText: GameObjects.Text;
}

/** Live-updating, re-sorting mini-leaderboard of the 6 ground departments' weekly totals. */
export class Leaderboard extends GameObjects.Container {
    private rows = new Map<HeroSlug, Row>();

    constructor(scene: Scene, x: number, y: number) {
        super(scene, x, y);

        const groundHeroes = RosterConfig.heroes.filter(h => !h.lead);

        const panel = scene.add.image(0, 0, 'hud_panel_small').setOrigin(0, 0);
        panel.setDisplaySize(PANEL.WIDTH, PANEL.HEIGHT);
        this.add(panel);

        groundHeroes.forEach((def, i) => {
            const rowY = PANEL.ROWS_Y + i * ROW_HEIGHT;

            const swatch = this.headIcon(scene, def.sprite, 14, ROW_HEIGHT / 2);
            const label = scene.add.text(34, ROW_HEIGHT / 2, RosterConfig.ropNameForSlug(def.slug) ?? def.slug, {
                fontFamily: HUD.FONT,
                fontSize: '13px',
                resolution: GAME.RENDER_SCALE,
                color: HUD.COLORS.label,
            }).setOrigin(0, 0.5);
            const amountText = scene.add.text(PANEL.ROWS_WIDTH, ROW_HEIGHT / 2, '0 ₽', {
                fontFamily: HUD.FONT,
                fontStyle: 'bold',
                fontSize: '13px',
                resolution: GAME.RENDER_SCALE,
                color: HUD.COLORS.text,
            }).setOrigin(1, 0.5);

            const row = scene.add.container(PANEL.ROWS_X, rowY, [swatch, label, amountText]);
            this.add(row);
            this.rows.set(def.slug, { row, amountText });
        });

        scene.add.existing(this);
    }

    /**
     * The hero's head from its stance picture, as a small static icon: the picture cropped to its top part, with the origin at the
     * crop's centre. (Not a new frame on the hero's texture: a named frame there would become the texture's default frame and
     * every hero on the stage would turn into a head.)
     */
    private headIcon(scene: Scene, textureKey: string, x: number, y: number): GameObjects.Image {
        const icon = scene.add.image(x, y, textureKey);
        const crop = { x: icon.width * 0.2, y: 0, w: icon.width * 0.6, h: icon.height * 0.3 };
        icon.setCrop(crop.x, crop.y, crop.w, crop.h);
        icon.setOrigin((crop.x + crop.w / 2) / icon.width, (crop.y + crop.h / 2) / icon.height);
        icon.setScale(HEAD_ICON_HEIGHT / crop.h);
        return icon;
    }

    /** Re-sorts rows by amount (descending) and tweens each to its new rank, updating displayed totals. */
    update(byRop: Record<string, number>) {
        const amounts = new Map<HeroSlug, number>();
        for (const [ropName, amount] of Object.entries(byRop)) {
            const slug = RosterConfig.heroSlugForRop(ropName);
            if (!slug) continue;
            amounts.set(slug, (amounts.get(slug) ?? 0) + amount);
        }

        const sorted = [...this.rows.keys()].sort(
            (a, b) => (amounts.get(b) ?? 0) - (amounts.get(a) ?? 0)
        );

        sorted.forEach((slug, rank) => {
            const entry = this.rows.get(slug);
            if (!entry) return;

            // Unchanged rank/amount (most polls) => no tween and no text redraw, so an idle display stays idle.
            const targetY = PANEL.ROWS_Y + rank * ROW_HEIGHT;
            if (entry.row.y !== targetY) {
                this.scene.tweens.add({
                    targets: entry.row,
                    y: targetY,
                    duration: 400,
                    ease: 'Sine.easeInOut',
                });
            }
            const amountLabel = `${Math.round(amounts.get(slug) ?? 0).toLocaleString('ru-RU')} ₽`;
            if (entry.amountText.text !== amountLabel) entry.amountText.setText(amountLabel);
        });
    }
}
