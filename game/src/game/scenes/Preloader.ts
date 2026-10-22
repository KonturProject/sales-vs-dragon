import { Scene, Display, Loader, Textures } from 'phaser';
import { RosterConfig } from '../systems/RosterConfig';
import { GAME, HORDE } from '../core/Constants';
import { HORDE_DEFS, animKey } from '../objects/Horde';
import { fitCameraToGame } from '../core/Render';

/** Character, horde and background textures (everything except generated text canvases). */
const SMOOTH_TEXTURE_KEY = /^(hero_|lead_|goblin|loot_|campfire|bg_forest)/;

/**
 * Loads the real cropped sprites from public/assets/sprites/. Any file that
 * doesn't exist yet fails to load — on that
 * specific loaderror we generate a colored-shape placeholder texture under the
 * same key, so the scene is always fully playable regardless of which real
 * assets have landed. Real PNGs simply take priority once present; no code
 * change needed when they're dropped in.
 */
export class Preloader extends Scene {
    constructor() {
        super('Preloader');
    }

    preload() {
        this.drawLoadingScreen();

        this.load.on('loaderror', (file: Loader.File) => this.onLoadError(file.key));

        this.load.setPath('assets/sprites');
        // Forest and campfire: tools/build-background.py.
        this.load.image('bg_forest', 'bg_forest.jpg');
        this.load.spritesheet('campfire', 'campfire.png', { frameWidth: HORDE.CAMPFIRE.FRAME, frameHeight: HORDE.CAMPFIRE.FRAME });
        // The horde (tools/build-horde.py): every animation a spritesheet of equal frames, sizes from config/horde.json.
        for (const def of [...HORDE_DEFS.goblins, HORDE_DEFS.chief]) {
            for (const anim of Object.keys(def.anims)) {
                this.load.spritesheet(animKey(def, anim), `horde/${animKey(def, anim)}.png`, { frameWidth: def.frameWidth, frameHeight: def.frameHeight });
            }
        }
        for (const t of HORDE_DEFS.treasures) this.load.image(t.key, `horde/${t.key}.png`);
        for (const hero of RosterConfig.heroes) {
            this.load.image(hero.sprite, `${hero.sprite}.png`);
            // Each attack is two frames: the wind-up shown during the dash, the blow (with its effect) on arrival.
            for (let i = 1; i <= hero.hits; i++) {
                this.load.image(`${hero.sprite}_hit${i}_windup`, `${hero.sprite}_hit${i}_windup.png`);
                this.load.image(`${hero.sprite}_hit${i}`, `${hero.sprite}_hit${i}.png`);
            }
        }
    }

    create() {
        // The sprite art is painted and resampled, not true pixel art. `pixelArt: true` would sample it
        // with NEAREST, which at a non-integer render scale (1.25×, 1.5× — see core/Quality.ts) leaves
        // jagged, uneven edges; smooth filtering looks the same at 1:1 and better everywhere else.
        for (const key of this.textures.getTextureKeys()) {
            if (SMOOTH_TEXTURE_KEY.test(key)) this.textures.get(key).setFilter(Textures.FilterMode.LINEAR);
        }

        this.scene.start('PenScene');
        this.scene.launch('HUDScene');
    }

    /** Flat Graphics/Text splash + progress bar — same no-asset-needed approach as onLoadError's placeholders. */
    private drawLoadingScreen() {
        const w = GAME.WIDTH;
        const h = GAME.HEIGHT;
        const barW = 320;
        const barH = 18;
        const barX = w / 2 - barW / 2;
        const barY = h / 2 + 20;

        fitCameraToGame(this);
        this.cameras.main.setBackgroundColor('#08090f');

        const title = this.add.text(w / 2, h / 2 - 30, 'ОТДЕЛЫ ПРОТИВ ОРДЫ', {
            fontFamily: 'Arial Black, Arial, sans-serif',
            fontSize: '30px',
            color: '#ffffff',
            resolution: GAME.RENDER_SCALE,
        }).setOrigin(0.5);

        const track = this.add.graphics();
        track.fillStyle(0x0d1220, 0.9);
        track.fillRoundedRect(barX, barY, barW, barH, barH / 2);
        track.lineStyle(2, 0x3a5a7a, 0.9);
        track.strokeRoundedRect(barX, barY, barW, barH, barH / 2);

        const bar = this.add.graphics();

        this.load.on('progress', (value: number) => {
            bar.clear();
            const innerW = Math.max(0, (barW - 6) * value);
            if (innerW <= 1) return;
            bar.fillGradientStyle(0x2fd0e0, 0x2fd0e0, 0x36e08a, 0x36e08a, 1);
            bar.fillRoundedRect(barX + 3, barY + 3, innerW, barH - 6, (barH - 6) / 2);
        });

        this.load.on('complete', () => {
            title.destroy();
            track.destroy();
            bar.destroy();
        });
    }

    private onLoadError(key: string) {
        if (this.textures.exists(key)) return; // real file already loaded fine elsewhere

        // Attack poses are optional variety (HeroSprite checks texture existence
        // before using them), so a missing one gets no placeholder.
        if (/_hit\d+(_windup)?$/.test(key)) return;

        const g = this.make.graphics({ x: 0, y: 0 });

        if (key === 'bg_forest') {
            g.fillGradientStyle(0x0d1a12, 0x0d1a12, 0x34452a, 0x34452a, 1);
            g.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);
            g.generateTexture('bg_forest', GAME.WIDTH, GAME.HEIGHT);
        } else if (key.startsWith('goblin') || key.startsWith('loot_') || key === 'campfire') {
            g.fillStyle(key.startsWith('goblin') ? 0x5d8a2c : 0xc9a227, 1);
            g.fillRoundedRect(0, 0, 120, 160, 18);
            g.generateTexture(key, 120, 160);
        } else {
            const def = RosterConfig.heroDef(key as never);
            const color = def ? Display.Color.HexStringToColor(def.color).color : 0x888888;
            g.fillStyle(color, 1);
            g.fillCircle(60, 60, 55);
            g.lineStyle(4, 0xffffff, 1);
            g.strokeCircle(60, 60, 55);
            g.generateTexture(key, 120, 120);
        }

        g.destroy();
    }
}
