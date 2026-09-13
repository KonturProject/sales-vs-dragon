import { Display, GameObjects, Scene } from 'phaser';
import { EventBus, GameEvents, ProgressChangedPayload, FetchErrorPayload, PigReachedPenPayload, MoneyInPayload } from '../core/EventBus';
import { GameState } from '../core/GameState';
import { GAME, HUD, HeroSlug, POLL } from '../core/Constants';
import { emitConfettiBurst, flashScreen } from '../systems/Fx';
import { RosterConfig } from '../systems/RosterConfig';
import { Leaderboard } from '../objects/Leaderboard';
import { AudioSystem } from '../systems/Audio';

const BAR_X = HUD.BAR_X;
const BAR_Y = HUD.BAR_Y;
const BAR_WIDTH = HUD.BAR_WIDTH;
const BAR_HEIGHT = HUD.BAR_HEIGHT;
const BAR_RADIUS = 15;

const STATUS_X = GAME.WIDTH - 16;
const STATUS_Y = GAME.HEIGHT - 16;
const STATUS_TICK_MS = 30000;
const MUTE_X = STATUS_X - 190;
const MUTE_Y = GAME.HEIGHT - 16;

export class HUDScene extends Scene {
    private track!: GameObjects.Graphics;
    private fill!: GameObjects.Graphics;
    private label!: GameObjects.Text;
    private title!: GameObjects.Text;
    private statusDot!: GameObjects.Arc;
    private statusText!: GameObjects.Text;
    private muteIcon!: GameObjects.Text;
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
        this.title = this.add.text(GAME.WIDTH / 2, 4, 'НЕДЕЛЬНЫЙ ПЛАН ПРОДАЖ', {
            fontFamily: 'Arial Black, Arial, sans-serif',
            fontSize: '11px',
            color: '#8fb8d9',
        }).setOrigin(0.5, 0).setAlpha(0.85);
        this.title.setLetterSpacing?.(2);

        this.track = this.add.graphics();
        this.drawTrack();

        this.fill = this.add.graphics();

        this.label = this.add.text(BAR_X + BAR_WIDTH / 2, BAR_Y + BAR_HEIGHT / 2, '', {
            fontFamily: 'Arial Black, Arial, sans-serif',
            fontSize: '15px',
            color: '#ffffff',
        }).setOrigin(0.5).setShadow(0, 1, '#000000', 3, false, true);

        this.statusText = this.add.text(STATUS_X - 12, STATUS_Y, '', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '10px',
            color: '#8fb8d9',
        }).setOrigin(1, 0.5).setAlpha(0.85);
        this.statusDot = this.add.circle(STATUS_X, STATUS_Y, 4, 0x36e08a);
        this.renderStatus();

        this.muteIcon = this.add.text(MUTE_X, MUTE_Y, '', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '14px',
        }).setOrigin(0.5).setAlpha(0.85).setInteractive({ useHandCursor: true });
        this.renderMuteIcon();
        this.muteIcon.on('pointerdown', () => {
            AudioSystem.init();
            AudioSystem.toggleMute();
            this.renderMuteIcon();
        });

        this.leaderboard = new Leaderboard(this, 16, 70);
        this.leaderboard.update(GameState.byRop);

        const handler = (payload: ProgressChangedPayload) => this.render(payload);
        EventBus.on(GameEvents.PROGRESS_CHANGED, handler);

        const onDataUpdated = () => {
            this.consecutiveFailures = 0;
            this.lastGoodAt = Date.now();
            this.renderStatus();
            this.leaderboard.update(GameState.byRop);
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

        const onPigReachedPen = (payload: PigReachedPenPayload) => {
            this.time.delayedCall(payload.delayMs, () => {
                emitConfettiBurst(this, 120);
                flashScreen(this, 0xffe89a, 0.35, 220, 3);
            });
        };
        EventBus.on(GameEvents.PIG_REACHED_PEN, onPigReachedPen);

        // Brief full-screen tint in the scoring department's color — reads as
        // "who just sold" even out of the corner of your eye across a room.
        const onMoneyIn = (payload: MoneyInPayload) => {
            const def = RosterConfig.heroDef(payload.heroSlug as HeroSlug);
            if (def) flashScreen(this, Display.Color.HexStringToColor(def.color).color, 0.18, 80);
        };
        EventBus.on(GameEvents.MONEY_IN, onMoneyIn);

        // Smaller flourish at the 25/50/75% quartiles — a quick confetti burst
        // and a bright pulse right on the bar itself — keeps the screen alive
        // throughout the week, not just at the 100% finale.
        const onMilestoneReached = () => {
            emitConfettiBurst(this, 30);
            const pulse = this.add.rectangle(
                BAR_X + BAR_WIDTH / 2, BAR_Y + BAR_HEIGHT / 2, BAR_WIDTH, BAR_HEIGHT, 0xffffff, 0
            );
            this.tweens.add({
                targets: pulse,
                alpha: 0.5,
                duration: 150,
                yoyo: true,
                onComplete: () => pulse.destroy(),
            });
        };
        EventBus.on(GameEvents.MILESTONE_REACHED, onMilestoneReached);

        this.events.once('shutdown', () => {
            EventBus.off(GameEvents.PROGRESS_CHANGED, handler);
            EventBus.off(GameEvents.DATA_UPDATED, onDataUpdated);
            EventBus.off(GameEvents.FETCH_ERROR, onFetchError);
            EventBus.off(GameEvents.PIG_REACHED_PEN, onPigReachedPen);
            EventBus.off(GameEvents.MONEY_IN, onMoneyIn);
            EventBus.off(GameEvents.MILESTONE_REACHED, onMilestoneReached);
            statusTimer.remove();
        });
    }

    private renderMuteIcon() {
        this.muteIcon.setText(AudioSystem.isMuted ? '🔇' : '🔊');
    }

    private renderStatus() {
        const minutesAgo = Math.floor((Date.now() - this.lastGoodAt) / 60000);

        if (this.consecutiveFailures === 0) {
            this.statusDot.setFillStyle(0x36e08a);
            this.statusText.setText('в эфире');
        } else {
            const color = this.consecutiveFailures >= POLL.MAX_CONSECUTIVE_FAILURES ? 0xe0483a : 0xe0b23a;
            this.statusDot.setFillStyle(color);
            this.statusText.setText(`офлайн, обновлено ${minutesAgo} мин назад`);
        }
    }

    private drawTrack() {
        this.track.clear();
        this.track.fillStyle(0x0d1220, 0.85);
        this.track.fillRoundedRect(BAR_X, BAR_Y, BAR_WIDTH, BAR_HEIGHT, BAR_RADIUS);
        this.track.lineStyle(2, 0x3a5a7a, 0.9);
        this.track.strokeRoundedRect(BAR_X, BAR_Y, BAR_WIDTH, BAR_HEIGHT, BAR_RADIUS);
    }

    private render(payload: ProgressChangedPayload) {
        const target = Math.min(1, Math.max(0, payload.ratio));

        this.tweens.add({
            targets: this,
            displayedRatio: target,
            duration: 500,
            ease: 'Sine.easeOut',
            onUpdate: () => this.drawFill(this.displayedRatio),
        });

        // Odometer-style count-up instead of snapping the number instantly —
        // same tween-a-plain-property trick already used for displayedRatio.
        this.tweens.add({
            targets: this,
            displayedTotal: payload.totalThisWeek,
            displayedPlan: payload.plan,
            duration: 500,
            ease: 'Sine.easeOut',
            onUpdate: () => this.drawLabel(),
        });
    }

    private drawLabel() {
        this.label.setText(
            `${Math.round(this.displayedTotal).toLocaleString('ru-RU')} / ${Math.round(this.displayedPlan).toLocaleString('ru-RU')} ₽`
        );
    }

    private drawFill(ratio: number) {
        this.fill.clear();
        const innerW = (BAR_WIDTH - 6) * ratio;
        if (innerW <= 1) return;

        this.fill.fillGradientStyle(0x2fd0e0, 0x2fd0e0, 0x36e08a, 0x36e08a, 1);
        this.fill.fillRoundedRect(BAR_X + 3, BAR_Y + 3, innerW, BAR_HEIGHT - 6, BAR_RADIUS - 3);

        // Glassy highlight along the top edge.
        this.fill.fillStyle(0xffffff, 0.18);
        this.fill.fillRoundedRect(BAR_X + 4, BAR_Y + 4, Math.max(0, innerW - 2), (BAR_HEIGHT - 6) * 0.4, BAR_RADIUS - 4);
    }
}
