import { Display, GameObjects, Geom, Scene } from 'phaser';
import { EventBus, GameEvents, ProgressChangedPayload, FetchErrorPayload, DragonHeadLostPayload, DragonDefeatedPayload, MoneyInPayload, AdminCommandPayload } from '../core/EventBus';
import { GameState } from '../core/GameState';
import { fitCameraToGame } from '../core/Render';
import { DAYS, DRAGON, GAME, HUD, HeroSlug, POLL } from '../core/Constants';
import { emitConfettiBurst, flashScreen } from '../systems/Fx';
import { RosterConfig } from '../systems/RosterConfig';
import { Leaderboard } from '../objects/Leaderboard';
import { AudioSystem } from '../systems/Audio';
import { LastStrikeButton } from '../objects/LastStrikeButton';
import { emitQueuedStrike } from '../systems/StrikeQueue';

const BAR_X = HUD.BAR_X;
const BAR_Y = HUD.BAR_Y;
const BAR_WIDTH = HUD.BAR_WIDTH;
const BAR_HEIGHT = HUD.BAR_HEIGHT;
const BAR_RADIUS = 10; // the rounded inner ends of the frame's track
/** The part of the dark track the fill (and the day dividers) use: right of the pumpkin, left of the lantern. */
const TRACK_X = BAR_X + HUD.TRACK_INSET_LEFT;
const TRACK_WIDTH = BAR_WIDTH - HUD.TRACK_INSET_LEFT - HUD.TRACK_INSET_RIGHT;
const GOTHIC = HUD.FONT;

const STATUS_X = GAME.WIDTH - 16;
const STATUS_Y = GAME.HEIGHT - 16;
const STATUS_TICK_MS = 30000;
const MUTE_X = 28; // bottom-left: the offline message grows to the left of the status dot and must not run into it
const MUTE_Y = GAME.HEIGHT - 16;

export class HUDScene extends Scene {
    private fill!: GameObjects.Graphics;
    private label!: GameObjects.Text;
    private labelPlate!: GameObjects.Graphics;
    private headsText!: GameObjects.Text;
    private headsPlate!: GameObjects.Graphics;
    private banner: GameObjects.Container | null = null;
    private statusDot!: GameObjects.Arc;
    private statusText!: GameObjects.Text;
    private muteIcon!: GameObjects.Graphics;
    private lastStrikeButton!: LastStrikeButton;
    private leaderboard!: Leaderboard;
    private displayedRatio = 0;
    private displayedTotal = 0;
    private displayedPlan = 0;
    private consecutiveFailures = 0;
    private lastGoodAt = Date.now();

    constructor() {
        super('HUDScene');
    }

    create() {
        fitCameraToGame(this);

        this.drawTrack();

        // Above the frame's end caps (depth 3) on purpose: the caps' own track is opaque, and the fill has to start right
        // where the track starts (next to the pumpkin) and end right at the lantern's end, not at the seam between the pieces.
        this.fill = this.add.graphics().setDepth(3.5);
        this.drawDayMarks();

        this.headsText = this.add.text(GAME.WIDTH - 32, BAR_Y + BAR_HEIGHT + 52, '', {
            fontFamily: GOTHIC,
            fontStyle: 'bold',
            fontSize: '18px',
            resolution: GAME.RENDER_SCALE,
            color: HUD.COLORS.accent,
        }).setOrigin(1, 0).setStroke(HUD.COLORS.stroke, 4).setDepth(4);
        this.headsPlate = this.add.graphics().setDepth(3.9);
        this.renderHeads(GameState.headsRemaining);

        this.label = this.add.text(TRACK_X + TRACK_WIDTH / 2, BAR_Y + BAR_HEIGHT / 2, '', {
            fontFamily: HUD.FONT_NUM,
            fontStyle: 'bold',
            fontSize: '14px',
            resolution: GAME.RENDER_SCALE,
            color: HUD.COLORS.text,
        }).setOrigin(0.5).setStroke(HUD.COLORS.stroke, 3).setDepth(4);
        this.labelPlate = this.add.graphics().setDepth(3.4); // under the fill (3.5): the tip of the fill stays visible over the plate

        this.statusText = this.add.text(STATUS_X - 12, STATUS_Y, '', {
            fontFamily: GOTHIC,
            fontStyle: 'italic',
            fontSize: '13px',
            resolution: GAME.RENDER_SCALE,
            color: HUD.COLORS.label,
        }).setOrigin(1, 0.5).setAlpha(0.8);
        this.statusDot = this.add.circle(STATUS_X, STATUS_Y, 4, 0x36e08a);
        this.renderStatus();

        this.muteIcon = this.add.graphics({ x: MUTE_X, y: MUTE_Y }).setAlpha(0.9)
            .setInteractive(new Geom.Rectangle(-12, -12, 24, 24), Geom.Rectangle.Contains);
        this.muteIcon.input!.cursor = 'pointer';
        this.renderMuteIcon();
        this.muteIcon.on('pointerdown', () => {
            AudioSystem.init();
            AudioSystem.toggleMute();
            this.renderMuteIcon();
        });

        // «Показать последний удар»: the head of the group replays the newest payment of the table for the people in the room.
        this.lastStrikeButton = new LastStrikeButton(this, MUTE_X + 24, MUTE_Y, () => this.showLastStrike());
        this.lastStrikeButton.setAvailable(GameState.lastSale !== null);

        this.leaderboard = new Leaderboard(this, HUD.PANEL.X, HUD.PANEL.Y);
        this.leaderboard.update(GameState.byRop);

        const handler = (payload: ProgressChangedPayload) => this.render(payload);
        EventBus.on(GameEvents.PROGRESS_CHANGED, handler);

        const onDataUpdated = () => {
            this.consecutiveFailures = 0;
            this.lastGoodAt = Date.now();
            this.renderStatus();
            this.leaderboard.update(GameState.byRop);
            this.lastStrikeButton.setAvailable(GameState.lastSale !== null);
        };
        EventBus.on(GameEvents.DATA_UPDATED, onDataUpdated);

        const onFetchError = (payload: FetchErrorPayload) => {
            this.consecutiveFailures = payload.consecutiveFailures;
            this.renderStatus();
        };
        EventBus.on(GameEvents.FETCH_ERROR, onFetchError);

        const statusTimer = this.time.addEvent({
            delay: STATUS_TICK_MS,
            loop: true,
            callback: () => this.renderStatus(),
        });

        const onDragonDefeated = (payload: DragonDefeatedPayload) => {
            this.time.delayedCall(payload.delayMs + DRAGON.HEAD_LOSS_DURATION_MS, () => {
                if (!GameState.dragonDefeated) return; // ratio dropped back while we were waiting
                if (!payload.baseline) {
                    emitConfettiBurst(this, 120);
                    flashScreen(this, 0xffe89a, 0.35, 220, 3);
                }
                this.showVictoryBanner();
            });
        };
        EventBus.on(GameEvents.DRAGON_DEFEATED, onDragonDefeated);

        // Brief full-screen tint in the scoring department's color — reads as
        // "who just sold" even out of the corner of your eye across a room.
        const onMoneyIn = (payload: MoneyInPayload) => {
            const def = RosterConfig.heroDef(payload.heroSlug as HeroSlug);
            if (def) flashScreen(this, Display.Color.HexStringToColor(def.color).color, 0.18, 80);
        };
        EventBus.on(GameEvents.MONEY_IN, onMoneyIn);

        // Each lost head is a daily plan cleared — a quick confetti burst and a
        // bright pulse right on the bar (the final head also gets the full victory).
        const onHeadLost = (payload: DragonHeadLostPayload) => {
            this.time.delayedCall(payload.delayMs, () => {
                if (payload.heads < GameState.headsRemaining) return; // stale: the ratio dropped back meanwhile
                this.renderHeads(payload.heads);
                emitConfettiBurst(this, 30);
                // The flash follows the track's rounded ends (a plain rectangle showed white corners outside the frame).
                const pulse = this.add.graphics().setDepth(3.6).setAlpha(0);
                pulse.fillStyle(0xffffff, 1).fillRoundedRect(TRACK_X, BAR_Y, TRACK_WIDTH, BAR_HEIGHT, BAR_RADIUS);
                this.tweens.add({
                    targets: pulse,
                    alpha: 0.5,
                    duration: 150,
                    yoyo: true,
                    onComplete: () => pulse.destroy(),
                });
            });
        };
        EventBus.on(GameEvents.DRAGON_HEAD_LOST, onHeadLost);

        // Full-screen celebration on request from the admin page (visual only).
        const onAdminCommand = (cmd: AdminCommandPayload) => {
            if (cmd.type !== 'confetti' && cmd.type !== 'celebrate') return;
            emitConfettiBurst(this, 120);
            flashScreen(this, 0xffe89a, 0.3, 200, 2);
        };
        EventBus.on(GameEvents.ADMIN_COMMAND, onAdminCommand);

        this.events.once('shutdown', () => {
            EventBus.off(GameEvents.ADMIN_COMMAND, onAdminCommand);
            EventBus.off(GameEvents.PROGRESS_CHANGED, handler);
            EventBus.off(GameEvents.DATA_UPDATED, onDataUpdated);
            EventBus.off(GameEvents.FETCH_ERROR, onFetchError);
            EventBus.off(GameEvents.DRAGON_DEFEATED, onDragonDefeated);
            EventBus.off(GameEvents.MONEY_IN, onMoneyIn);
            EventBus.off(GameEvents.DRAGON_HEAD_LOST, onHeadLost);
            statusTimer.remove();
        });
    }

    /**
     * Shows the newest payment of the table again: the hero of its department strikes as for a real sale (but flagged `demo`:
     * no idle-timer reset, no totals), queued behind the strikes already planned. Returns how long the hero is busy, ms.
     */
    private showLastStrike(): number | null {
        const sale = GameState.lastSale;
        if (!sale) return null;
        return emitQueuedStrike(this, {
            heroSlug: RosterConfig.heroSlugForRop(sale.rop) ?? 'overflow', ropName: sale.rop, delta: sale.amount, demo: true,
        });
    }

    /** A small speaker in the HUD's colours (drawn, not an emoji): sound waves when on, a cross when muted. */
    private renderMuteIcon() {
        const g = this.muteIcon;
        const color = Display.Color.HexStringToColor(HUD.COLORS.label).color;
        g.clear();
        g.fillStyle(color, 1);
        g.fillRect(-8, -3, 4, 6);
        g.fillTriangle(-4, -3, 2, -8, 2, 8).fillTriangle(-4, -3, -4, 3, 2, 8);
        g.lineStyle(2, color, 1);
        if (AudioSystem.isMuted) {
            g.lineBetween(5, -4, 11, 4).lineBetween(11, -4, 5, 4);
        } else {
            g.beginPath().arc(2, 0, 6, -0.9, 0.9).strokePath();
            g.beginPath().arc(2, 0, 10, -0.9, 0.9).strokePath();
        }
    }

    private renderStatus() {
        const minutesAgo = Math.floor((Date.now() - this.lastGoodAt) / 60000);

        // A single missed poll is routine (Apps Script sometimes answers very slowly) and is not shown.
        if (this.consecutiveFailures < POLL.OFFLINE_AFTER_FAILURES) {
            this.statusDot.setFillStyle(0x36e08a);
            this.statusText.setText('в эфире');
        } else {
            const color = this.consecutiveFailures >= POLL.MAX_CONSECUTIVE_FAILURES ? 0xe0483a : 0xe0b23a;
            this.statusDot.setFillStyle(color);
            this.statusText.setText(`офлайн, обновлено ${minutesAgo} мин назад`);
        }
    }

    /** The Halloween frame: pumpkin end, a stretched middle, lantern end (tools/build-hud.py); the fill lives inside it. */
    private drawTrack() {
        const cy = BAR_Y + BAR_HEIGHT / 2;
        const k = HUD.PICTURE_SCALE;
        const left = this.add.image(BAR_X, cy, 'hud_bar_left').setOrigin(0, 0.5).setScale(k).setDepth(3);
        const right = this.add.image(BAR_X + BAR_WIDTH, cy, 'hud_bar_right').setOrigin(1, 0.5).setScale(k).setDepth(3);
        const mid = this.add.image(BAR_X + left.displayWidth, cy, 'hud_bar_mid').setOrigin(0, 0.5).setDepth(1);
        mid.setDisplaySize(BAR_WIDTH - left.displayWidth - right.displayWidth, mid.height * k);
    }

    private render(payload: ProgressChangedPayload) {
        const target = Math.min(1, Math.max(0, payload.ratio));
        const isFirstRender = !this.hasBaseline; // hasBaseline is flipped below; the label must be drawn once even for 0 / 0

        // Regrown heads (new week / raised plan) show immediately; lost heads
        // are shown by the delayed head-loss handler so the counter matches the art.
        if (!this.hasBaseline || payload.headsRemaining > this.shownHeads) this.renderHeads(payload.headsRemaining);
        this.hasBaseline = true;
        if (payload.ratio < 1) this.hideVictoryBanner();

        // Every poll lands here, changed data or not. Starting a tween for an
        // unchanged value would wake the renderer (PowerSaver) for nothing.
        if (isFirstRender || this.displayedRatio !== target) {
            this.tweens.add({
                targets: this,
                displayedRatio: target,
                duration: 500,
                ease: 'Sine.easeOut',
                onUpdate: () => this.drawFill(this.displayedRatio),
            });
        }

        // Odometer-style count-up instead of snapping the number instantly —
        // same tween-a-plain-property trick already used for displayedRatio.
        if (isFirstRender || this.displayedTotal !== payload.totalThisWeek || this.displayedPlan !== payload.plan) {
            this.tweens.add({
                targets: this,
                displayedTotal: payload.totalThisWeek,
                displayedPlan: payload.plan,
                duration: 500,
                ease: 'Sine.easeOut',
                onUpdate: () => this.drawLabel(),
            });
        }
    }

    private shownHeads = DAYS;
    private hasBaseline = false;

    private renderHeads(heads: number) {
        this.shownHeads = heads;
        this.headsText.setText(heads > 0 ? `ОСТАЛОСЬ: ${heads} из ${DAYS}` : 'ОРДА ПОВЕРЖЕНА');
        // The same dark plate as the sum on the bar, so the counter does not float on the bare forest.
        const b = this.headsText.getBounds();
        this.headsPlate.clear();
        this.headsPlate.fillStyle(HUD.COLORS.labelPlate, 0.85).fillRoundedRect(b.x - 12, b.y - 5, b.width + 24, b.height + 10, 12);
        this.headsPlate.lineStyle(1, HUD.COLORS.dividerLight, 0.8).strokeRoundedRect(b.x - 12, b.y - 5, b.width + 24, b.height + 10, 12);
    }

    /**
     * Day marks on the weekly bar — each segment is a daily plan (weekly plan / DAYS). Everything stays inside the frame: a
     * groove cut into the dark track (a dark edge plus the frame's own purple, readable on the green fill and on the dark
     * track) and a small orange rivet on the lower rail, like the frame's own ornaments. Each «день N» sits centred under
     * its own segment.
     */
    private drawDayMarks() {
        const g = this.add.graphics();
        g.setDepth(3.5);
        const grooveTop = BAR_Y + 2;
        const grooveBottom = BAR_Y + BAR_HEIGHT - 2;
        const railY = BAR_Y + BAR_HEIGHT + 6; // the lower rail's middle
        for (let d = 1; d < DAYS; d++) {
            const x = Math.round(TRACK_X + (TRACK_WIDTH * d) / DAYS);
            g.lineStyle(2, HUD.COLORS.divider, 0.6).lineBetween(x, grooveTop, x, grooveBottom);
            g.lineStyle(1, HUD.COLORS.dividerLight, 0.9).lineBetween(x + 1.5, grooveTop, x + 1.5, grooveBottom);
            // a diamond: two triangles
            g.fillStyle(HUD.COLORS.rivet, 1);
            g.fillTriangle(x, railY - 3.5, x + 3, railY, x - 3, railY).fillTriangle(x - 3, railY, x + 3, railY, x, railY + 3.5);
            g.lineStyle(1, HUD.COLORS.divider, 0.9);
            g.strokeTriangle(x, railY - 3.5, x + 3, railY, x - 3, railY).strokeTriangle(x - 3, railY, x + 3, railY, x, railY + 3.5);
        }
        for (let d = 1; d <= DAYS; d++) {
            const centre = TRACK_X + (TRACK_WIDTH * (d - 0.5)) / DAYS;
            this.add.text(centre, BAR_Y + BAR_HEIGHT + 20, `день ${d}`, {
                fontFamily: GOTHIC,
                fontStyle: 'bold',
                fontSize: '14px',
                resolution: GAME.RENDER_SCALE,
                color: HUD.COLORS.label,
            }).setOrigin(0.5, 0).setStroke(HUD.COLORS.stroke, 3).setDepth(4);
        }
    }

    private showVictoryBanner() {
        if (this.banner) return;
        // Between the leaderboard and the horde, above the heroes' heads (HUD.BANNER). The big frame's hole is dark-filled
        // and holds the text.
        const { X: cx, Y: cy, WIDTH } = HUD.BANNER;
        const frame = this.add.image(0, 0, 'hud_frame_big');
        const k = WIDTH / frame.width;
        frame.setScale(k);
        // The frame's transparent hole as fractions of the picture (860 x 458 at offset 10, 3 of 1120 x 728 — tools/build-hud.py
        // prints its insets), so a missing texture's placeholder cannot blow the dark bed up over the whole screen.
        const holeW = frame.width * k * (860 / 1120);
        const holeH = frame.height * k * (458 / 728);
        const bed = this.add.graphics();
        bed.fillStyle(0x120a1c, 0.92);
        bed.fillRoundedRect(frame.width * k * (10 / 1120) - holeW / 2, frame.height * k * (3 / 728) - holeH / 2, holeW, holeH, 10);
        const title = this.add.text(0, -30, 'ОТДЕЛЫ ПОБЕДИЛИ!', {
            fontFamily: GOTHIC,
            fontStyle: 'bold',
            fontSize: '22px',
            resolution: GAME.RENDER_SCALE,
            color: '#ffc864',
        }).setOrigin(0.5).setStroke('#3a1500', 6);
        const sub = this.add.text(0, 8, 'План недели выполнен', {
            fontFamily: GOTHIC,
            fontStyle: 'bold',
            fontSize: '19px',
            resolution: GAME.RENDER_SCALE,
            color: '#b6f23a',
        }).setOrigin(0.5).setStroke(HUD.COLORS.stroke, 4);
        // A third line so the frame's hole is filled and says something: the week's best department.
        const best = Object.entries(GameState.byRop).sort((a, b) => b[1] - a[1])[0];
        const lines: GameObjects.Text[] = [title, sub];
        if (best && best[1] > 0) {
            lines.push(this.add.text(0, 42, `Лучший отдел: ${best[0]} — ${Math.round(best[1]).toLocaleString('ru-RU')} ₽`, {
                fontFamily: GOTHIC,
                fontStyle: 'italic',
                fontSize: '15px',
                resolution: GAME.RENDER_SCALE,
                color: HUD.COLORS.text,
            }).setOrigin(0.5).setStroke(HUD.COLORS.stroke, 3));
        }
        this.banner = this.add.container(cx, cy, [bed, frame, ...lines]).setDepth(3000).setAlpha(0).setScale(0.6);
        this.tweens.add({ targets: this.banner, alpha: 1, scale: 1, duration: 450, ease: 'Back.easeOut' });
        this.tweens.add({ targets: this.banner, scale: 1.03, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: 500 });
    }

    private hideVictoryBanner() {
        if (!this.banner) return;
        const b = this.banner;
        this.banner = null;
        this.tweens.killTweensOf(b);
        this.tweens.add({ targets: b, alpha: 0, duration: 300, onComplete: () => b.destroy() });
    }

    private drawLabel() {
        this.label.setText(
            `${Math.round(this.displayedTotal).toLocaleString('ru-RU')} / ${Math.round(this.displayedPlan).toLocaleString('ru-RU')} ₽`
        );
        // A dark plate behind the sum, so the groove of a day mark never runs through the digits; it stays inside one day's segment.
        const width = this.label.width + 16;
        const cx = TRACK_X + TRACK_WIDTH / 2;
        this.labelPlate.clear();
        this.labelPlate.fillStyle(HUD.COLORS.labelPlate, 0.85).fillRoundedRect(cx - width / 2, BAR_Y + 1, width, BAR_HEIGHT - 2, (BAR_HEIGHT - 2) / 2);
        this.labelPlate.lineStyle(1, HUD.COLORS.dividerLight, 0.8).strokeRoundedRect(cx - width / 2, BAR_Y + 1, width, BAR_HEIGHT - 2, (BAR_HEIGHT - 2) / 2);
    }

    private drawFill(ratio: number) {
        this.fill.clear();
        const innerW = TRACK_WIDTH * ratio;
        if (innerW <= 1) return;

        // Flat shapes, not a gradient: Phaser splits a gradient rounded rect into triangles and a lighter diagonal shows.
        const radius = Math.min(BAR_RADIUS, innerW / 2);
        this.fill.fillStyle(HUD.COLORS.fillBase, 1).fillRoundedRect(TRACK_X, BAR_Y, innerW, BAR_HEIGHT, radius);
        this.fill.fillStyle(HUD.COLORS.fillUpper, 1).fillRoundedRect(TRACK_X, BAR_Y, innerW, BAR_HEIGHT * 0.68, { tl: radius, tr: radius, bl: 0, br: 0 });
        // A slimy highlight line along the top edge (not for a sliver).
        if (innerW >= 14) {
            this.fill.fillStyle(HUD.COLORS.fillShine, 0.35).fillRoundedRect(TRACK_X + 6, BAR_Y + 2, innerW - 12, 4, 2);
        }
    }
}
