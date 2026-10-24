import { GameObjects, Scene, TintModes, Tweens } from 'phaser';
import hordeConfig from '../config/horde.json';
import { BREATH, DAYS, DRAGON, HORDE } from '../core/Constants';
import { emitBurst, emitCoinBurst, emitShockwaveRing, emitSparkles } from '../systems/Fx';
import { AudioSystem } from '../systems/Audio';
import { Firelight } from './Firelight';
import { Breather } from '../systems/BreathRelay';

/** One creature's frames as tools/build-horde.py wrote them (config/horde.json). Lengths in texture px from the feet. */
export interface CreatureDef {
    key: string;
    frameWidth: number;
    frameHeight: number;
    originX: number;
    originY: number;
    /** Frame count per animation: idle (1), and when the free sheets have them: hurt, die (goblins), hurt, taunt (chief). */
    anims: Record<string, number>;
    frontPx: number;
    topPx: number;
    headDx: number;
    headDy: number;
    /** Chief only, with the 'sit' animation: where the tears start in each sitting frame, [dx, dy] from the feet. */
    sitEyes?: number[][][];
}

/** One piece of the goblins' treasure (a loot_* image). */
export interface TreasureDef {
    key: string;
    width: number;
    height: number;
    big: boolean;
}

export const HORDE_DEFS = {
    goblins: hordeConfig.goblins as CreatureDef[],
    chief: hordeConfig.chief as CreatureDef,
    treasures: hordeConfig.treasures as TreasureDef[],
};

const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)];

/** Texture key of a creature's animation (a spritesheet; see Preloader). */
export const animKey = (def: CreatureDef, anim: string) => `${def.key}_${anim}`;

/**
 * Plays frames 0..n-1 of an animation once. A counter tween rather than a Phaser animation on purpose: while it runs
 * PowerSaver sees a tween and keeps the active frame rate, so the frames do not stutter at the idle 10 fps.
 */
function playFrames(sprite: GameObjects.Sprite, def: CreatureDef, anim: string, ms: number, onComplete?: () => void): Tweens.Tween | null {
    const n = def.anims[anim];
    if (!n) return null;
    const key = animKey(def, anim);
    sprite.setTexture(key, 0);
    return sprite.scene.tweens.addCounter({
        from: 0,
        to: n - 1,
        duration: ms,
        // Another state may have taken the sprite over meanwhile (a reset, a new week): then this run just ends.
        onUpdate: tween => { if (sprite.texture.key === key) sprite.setFrame(Math.round(tween.getValue() ?? 0)); },
        onComplete: () => { if (sprite.texture.key === key) onComplete?.(); },
    });
}


/** Height factors of one breath of a creature that has no stance loop: a slight rise and settle about its feet, in timer steps (no tween). */
const BREATH_STEPS = [1.014, 1.0, 0.988, 1.0];

/** True while the creature stands idle with nothing else moving it. */
function isResting(sprite: GameObjects.Sprite, def: CreatureDef) {
    return sprite.visible && sprite.texture.key === animKey(def, 'idle') && !sprite.scene.tweens.isTweening(sprite);
}

function breatheScale(sprite: GameObjects.Sprite, def: CreatureDef, scale: number, onDone: () => void) {
    const step = (i: number) => {
        if (!isResting(sprite, def)) return onDone();
        sprite.setScale(scale, scale * BREATH_STEPS[i]);
        if (i === BREATH_STEPS.length - 1) return onDone();
        sprite.scene.time.delayedCall(BREATH.FRAME_MS, () => step(i + 1));
    };
    step(0);
}

/** A piece of a goblin's treasure: `at` = its place by the goblin, `pile` = in Cruella's pile (HORDE.TREASURE). */
interface LootPiece {
    image: GameObjects.Image;
    at: { dx: number; dy: number };
    pile: { dx: number; dy: number };
}

class Goblin implements Breather {
    readonly sprite: GameObjects.Sprite;
    alive = true;
    private readonly home: { x: number; y: number };
    /** Every goblin is drawn the same height (HORDE.GOBLIN_HEIGHT), whatever its sheet's size. */
    readonly scale: number;
    /** The big piece first, then the small ones. */
    private loot: LootPiece[] = [];

    constructor(private scene: Scene, readonly def: CreatureDef, readonly index: number) {
        this.scale = HORDE.GOBLIN_HEIGHT / def.topPx;
        this.home = HORDE.GOBLINS[index];
        this.sprite = scene.add.sprite(this.home.x, this.home.y, animKey(def, 'idle'), 0)
            .setOrigin(def.originX, def.originY).setScale(this.scale).setDepth(this.home.y);
        this.rollLoot();
    }

    /** A new random set of treasure: one big piece and 0..SMALL_MAX different small ones. */
    private rollLoot() {
        this.loot.forEach(p => p.image.destroy());
        const T = HORDE.TREASURE;
        const small = HORDE_DEFS.treasures.filter(t => !t.big);
        const pieces = [pick(HORDE_DEFS.treasures.filter(t => t.big))];
        const count = Math.floor(Math.random() * (T.SMALL_MAX + 1));
        while (pieces.length < 1 + count && small.length) pieces.push(small.splice(Math.floor(Math.random() * small.length), 1)[0]);
        this.loot = pieces.map((t, i) => ({
            image: this.scene.add.image(0, 0, t.key).setOrigin(0.5, 1).setScale(T.SCALE),
            at: i === 0 ? T.BIG : T.SMALL[i - 1],
            pile: i === 0 ? { dx: 0, dy: 0 } : T.PILE_SMALL[i - 1],
        }));
        this.lootAtSide();
    }

    get x() { return this.home.x; }

    canBreathe() {
        return this.alive && isResting(this.sprite, this.def);
    }

    breathe(onDone: () => void) {
        breatheScale(this.sprite, this.def, this.scale, onDone);
    }

    /** Where a hero's leading edge stops when it hits this goblin. */
    frontX() {
        return this.home.x - this.def.frontPx * this.scale - HORDE.STRIKE_GAP;
    }

    chestY() {
        return this.home.y - this.def.topPx * this.scale * 0.55;
    }

    /** At the goblin's feet, in front of it. */
    private lootAtSide() {
        this.loot.forEach(({ image, at }) => {
            image.setPosition(this.home.x + at.dx, this.home.y + at.dy).setDepth(this.home.y + at.dy)
                .setAngle(0).setScale(HORDE.TREASURE.SCALE).setAlpha(1).setVisible(true);
        });
    }

    private pileSpot(pile: { dx: number; dy: number }) {
        const slot = HORDE.LOOT[this.index];
        return { x: slot.x + pile.dx, y: slot.y + pile.dy };
    }

    private lootInPile() {
        this.loot.forEach(({ image, pile }) => {
            const p = this.pileSpot(pile);
            image.setPosition(p.x, p.y).setDepth(p.y).setAngle(0).setScale(HORDE.TREASURE.SCALE).setAlpha(1).setVisible(true);
        });
    }

    private reset() {
        this.scene.tweens.killTweensOf(this.sprite);
        this.loot.forEach(p => this.scene.tweens.killTweensOf(p.image));
        this.sprite.setTexture(animKey(this.def, 'idle'), 0).clearTint()
            .setPosition(this.home.x, this.home.y).setAngle(0).setScale(this.scale);
    }

    /** Standing with its treasure. `animate` (a new week brings the goblins back): a fresh random treasure, faded in. */
    standUp(animate: boolean) {
        this.reset();
        this.alive = true;
        this.sprite.setVisible(true).setAlpha(animate ? 0 : 1);
        if (animate) this.rollLoot();
        else this.lootAtSide();
        if (animate) {
            const images = this.loot.map(p => p.image.setAlpha(0));
            this.scene.tweens.add({ targets: [this.sprite, ...images], alpha: 1, duration: 500 });
        }
    }

    /** Already beaten (page load mid-week): no goblin, its treasure already in Cruella's pile. */
    goneInstant() {
        this.reset();
        this.alive = false;
        this.sprite.setVisible(false);
        this.lootInPile();
    }

    /** The chief's taunt: the goblin swings its weapon too (its attack sheet), then stands again. */
    brandish(delay: number) {
        const n = this.def.anims.attack;
        if (!this.alive || !n) return;
        this.scene.time.delayedCall(delay, () => {
            if (!this.alive || this.sprite.texture.key !== animKey(this.def, 'idle')) return;
            playFrames(this.sprite, this.def, 'attack', n * 55, () => this.sprite.setTexture(animKey(this.def, 'idle'), 0));
        });
    }

    /** A blow landed: the hurt animation if the free sheets have one, a jolt and a flash otherwise. */
    hurt() {
        if (!this.alive) return;
        this.scene.tweens.killTweensOf(this.sprite);
        this.sprite.setTint(0xffffff).setTintMode(TintModes.FILL);
        this.scene.time.delayedCall(80, () => this.sprite.clearTint());
        const played = playFrames(this.sprite, this.def, 'hurt', 420, () => {
            if (this.alive) this.sprite.setTexture(animKey(this.def, 'idle'), 0);
        });
        if (!played) {
            this.scene.tweens.add({ targets: this.sprite, x: this.home.x + 6, duration: 60, yoyo: true, repeat: 1, onComplete: () => { this.sprite.x = this.home.x; } });
        }
    }

    /** A daily plan is closed: the goblin goes down and its treasure flies over the field to Cruella's feet. */
    die() {
        if (!this.alive) return;
        this.alive = false;
        this.scene.tweens.killTweensOf(this.sprite);
        this.sprite.setTint(0xff3b1f).setTintMode(TintModes.FILL);
        this.scene.time.delayedCall(120, () => this.sprite.clearTint());

        const fadeOut = () => this.scene.tweens.add({ targets: this.sprite, alpha: 0, delay: 500, duration: 600, onComplete: () => this.sprite.setVisible(false) });
        const played = playFrames(this.sprite, this.def, 'die', 900, fadeOut);
        if (!played) {
            // No death sheet: it topples backward (away from the heroes) about its feet and fades.
            this.scene.tweens.add({ targets: this.sprite, angle: 84, duration: 520, ease: 'Quad.easeIn', onComplete: fadeOut });
        }
        this.loot.forEach((piece, i) => this.scene.time.delayedCall(250 + i * HORDE.TREASURE.FLIGHT_STAGGER_MS, () => this.fly(piece, i)));
    }

    /** One piece arcs over the field, spinning, and lands in the pile with a bounce, sparkles and a clink. */
    private fly(piece: LootPiece, i: number) {
        const { image } = piece;
        const to = this.pileSpot(piece.pile);
        const from = { x: image.x, y: image.y };
        const s = HORDE.TREASURE.SCALE;
        const lift = 190 - i * 25;
        image.setDepth(2000 + i);
        this.scene.tweens.addCounter({
            from: 0,
            to: 1,
            duration: HORDE.LOOT_FLIGHT_MS,
            ease: 'Sine.easeInOut',
            onUpdate: tween => {
                const t = tween.getValue() ?? 0;
                image.setPosition(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t - lift * Math.sin(Math.PI * t));
                image.setAngle(-540 * t).setScale(s * (1 + 0.35 * Math.sin(Math.PI * t)));
            },
            onComplete: () => {
                image.setPosition(to.x, to.y).setDepth(to.y).setAngle(0).setScale(s);
                emitSparkles(this.scene, to.x, to.y - 16, 30, i === 0 ? 8 : 4);
                if (i === 0) emitCoinBurst(this.scene, to.x, to.y - 10, 5, false);
                AudioSystem.playHitThud();
                this.scene.tweens.add({ targets: image, scaleY: s * 0.8, scaleX: s * 1.15, duration: 90, yoyo: true });
            },
        });
    }
}

class Chief implements Breather {
    readonly sprite: GameObjects.Sprite;
    private cryTimer: { remove(): void } | null = null;
    /** Drawn at HORDE.CHIEF.height — half as tall again as a hero. */
    readonly scale: number;

    constructor(private scene: Scene, readonly def: CreatureDef) {
        const c = HORDE.CHIEF;
        this.scale = c.height / def.topPx;
        this.sprite = scene.add.sprite(c.x, c.y, animKey(def, 'idle'), 0).setOrigin(def.originX, def.originY).setScale(this.scale).setDepth(c.y);
    }

    canBreathe() {
        return isResting(this.sprite, this.def);
    }

    breathe(onDone: () => void) {
        breatheScale(this.sprite, this.def, this.scale, onDone);
    }

    frontX() {
        return HORDE.CHIEF.x - this.def.frontPx * this.scale - HORDE.STRIKE_GAP;
    }

    chestY() {
        return HORDE.CHIEF.y - this.def.topPx * this.scale * 0.55;
    }

    reset() {
        this.scene.tweens.killTweensOf(this.sprite);
        this.cryTimer?.remove();
        this.cryTimer = null;
        const c = HORDE.CHIEF;
        this.sprite.setTexture(animKey(this.def, 'idle'), 0).clearTint().setPosition(c.x, c.y).setAngle(0).setScale(this.scale);
    }

    hurt() {
        this.scene.tweens.killTweensOf(this.sprite);
        const played = playFrames(this.sprite, this.def, 'hurt', 450, () => this.sprite.setTexture(animKey(this.def, 'idle'), 0));
        if (!played) this.scene.tweens.add({ targets: this.sprite, x: HORDE.CHIEF.x + 5, duration: 60, yoyo: true, repeat: 1 });
    }

    /** The taunt: swings his blades (the attack sheet), the ground rumbles. */
    taunt(onDone: () => void): Tweens.Tween[] {
        this.scene.cameras.main.shake(DRAGON.GROWL_MS * 0.7, 0.0016);
        const tw = playFrames(this.sprite, this.def, 'taunt', DRAGON.GROWL_MS, () => {
            this.sprite.setTexture(animKey(this.def, 'idle'), 0);
            onDone();
        });
        if (tw) return [tw];
        onDone();
        return [];
    }

    /**
     * The horde is beaten: he flinches, plops down on his backside and cries — the two sitting frames (wailing,
     * sobbing; drawn for this game, see tools/build-horde.py) take turns with tears squirting out, then he stays
     * wailing, still (the tears are in the drawing). Without the sitting frames the standing pose just sinks down.
     */
    sitAndCry() {
        this.reset();
        const c = HORDE.CHIEF;
        const sits = !!this.def.anims.sit;
        const plop = () => {
            if (!sits) return;
            this.sprite.setTexture(animKey(this.def, 'sit'), 0).setY(c.y - 22);
            this.scene.tweens.add({
                targets: this.sprite,
                y: c.y,
                duration: 360,
                ease: 'Bounce.easeOut',
                onComplete: () => this.cry(),
            });
            this.scene.time.delayedCall(150, () => {
                emitBurst(this.scene, c.x - 10, c.y - 6, 0xcfc6b8, 12);
                AudioSystem.playFall();
            });
        };
        if (!playFrames(this.sprite, this.def, 'hurt', 380, plop)) plop();
        if (!sits) {
            this.scene.tweens.add({ targets: this.sprite, y: c.y + this.def.topPx * this.scale * 0.2, scaleY: this.scale * 0.8, delay: 380, duration: 520, ease: 'Bounce.easeOut' });
        }
    }

    /** Where the tears start in sitting frame `frame`, on screen. */
    private eyes(frame: number) {
        const s = this.scale;
        return (this.def.sitEyes?.[frame] ?? []).map(([dx, dy]) => ({ x: this.sprite.x + dx * s, y: this.sprite.y - dy * s }));
    }

    private cry() {
        const BEAT_MS = 450;
        let left = Math.round(HORDE.CRY_MS / BEAT_MS);
        this.cryTimer = this.scene.time.addEvent({
            delay: BEAT_MS,
            repeat: left - 1,
            callback: () => {
                left--;
                // Wailing and sobbing take turns every two beats; at the end he stays wailing.
                const frame = left === 0 ? 0 : Math.floor(left / 2) % 2;
                this.sprite.setFrame(frame);
                if (left === 0) return;
                for (const [i, e] of this.eyes(frame).entries()) {
                    // Cartoon tears: squirt out sideways from each eye and fall.
                    const side = i === 0 ? -1 : 1;
                    const drop = this.scene.add.circle(e.x, e.y, 3.2, 0x7fd3ff).setDepth(2100);
                    this.scene.tweens.add({
                        targets: drop,
                        x: { value: e.x + side * (16 + Math.random() * 12), ease: 'Sine.easeOut' },
                        y: { value: e.y + 44, ease: 'Quad.easeIn' },
                        alpha: { value: 0, ease: 'Quad.easeIn' },
                        duration: 650,
                        onComplete: () => drop.destroy(),
                    });
                }
                // A sob on every frame change: a little shudder of the shoulders.
                if (left % 2 === 0) this.scene.tweens.add({ targets: this.sprite, scaleY: this.scale * 1.03, duration: 120, yoyo: true });
            },
        });
    }
}

/**
 * The plan's guardians: five goblins, each guarding some treasure, and their chief behind them. The number of goblins
 * standing always mirrors GameState.headsRemaining (one goblin per daily plan) — PenScene decides *when* to change it
 * (straight away on load, animated when a poll crosses a daily plan), this class only knows *how*. The treasure of the
 * goblins already beaten lies in a pile at Cruella's feet.
 */
export class Horde {
    private goblins: Goblin[];
    private chief: Chief;
    private heads = DAYS;
    private defeated = false;
    private growling = false;
    private growlTweens: Tweens.Tween[] = [];
    /** Scene time until which a hit / death animation owns the creatures (no taunt over it). */
    private busyUntil = 0;

    constructor(private scene: Scene) {
        const fire = HORDE.CAMPFIRE;
        if (!scene.anims.exists('campfire')) {
            scene.anims.create({ key: 'campfire', frames: scene.anims.generateFrameNumbers('campfire'), frameRate: fire.FPS, repeat: -1 });
        }
        const flames = scene.add.sprite(fire.x, fire.y, 'campfire').setOrigin(0.5, 1).setScale(fire.scale).setDepth(fire.y).play('campfire');
        new Firelight(scene, flames);
        this.chief = new Chief(scene, HORDE_DEFS.chief);
        this.goblins = HORDE_DEFS.goblins.slice(0, DAYS).map((def, i) => new Goblin(scene, def, i));
    }

    /** Everyone here who can shift their weight in the breath relay (BreathRelay); the ones that cannot right now say so themselves. */
    breathers(): Breather[] {
        return [...this.goblins, this.chief];
    }

    get headCount() {
        return this.heads;
    }

    /** Goblins standing = `heads`; the first DAYS - heads (front first) are already beaten, their treasure in the pile. */
    setHeads(heads: number, animate = false) {
        this.cancelGrowl();
        this.heads = heads;
        const beaten = DAYS - heads;
        this.goblins.forEach((g, i) => {
            if (i < beaten) g.goneInstant();
            else if (!g.alive || !animate) g.standUp(animate && !g.alive);
        });
        if (heads > 0 && this.defeated) {
            this.defeated = false;
            this.chief.reset();
        }
    }

    private target(): Goblin | null {
        return this.goblins.find(g => g.alive) ?? null;
    }

    /** Where the next hero's leading edge has to stop: the front of the nearest goblin still standing, else the chief. */
    strikeFrontX() {
        return this.target()?.frontX() ?? this.chief.frontX();
    }

    /** A department hero landed a blow on the front goblin (or on the chief when none is left). */
    reactToHit() {
        if (this.defeated) return;
        this.cancelGrowl();
        this.busyUntil = this.scene.time.now + 500;
        const g = this.target();
        if (g) {
            g.hurt();
            emitCoinBurst(this.scene, g.x, g.chestY(), 5, true);
        } else {
            this.chief.hurt();
        }
    }

    /** A daily plan is closed: the front goblin goes down and its treasure flies to Cruella. */
    loseHead(remaining: number) {
        this.cancelGrowl();
        this.busyUntil = this.scene.time.now + 1500;
        this.heads = remaining;
        const g = this.goblins[DAYS - remaining - 1];
        if (!g || !g.alive) return;
        AudioSystem.playHeadLost();
        this.scene.cameras.main.shake(260, 0.007);
        const y = g.chestY();
        emitBurst(this.scene, g.x, y, 0xff6a2a, 20);
        emitBurst(this.scene, g.x, y, 0xffd24a, 12);
        emitShockwaveRing(this.scene, g.x, y, 0xff6a2a);
        g.die();
    }

    /** All five beaten, the week's plan closed: the chief sits down and cries until the next week. */
    defeat() {
        this.cancelGrowl();
        this.defeated = true;
        this.heads = 0;
        this.goblins.forEach(g => { if (g.alive) g.goneInstant(); });
        this.chief.sitAndCry();
    }

    canGrowl() {
        return !this.defeated && this.heads > 0 && !this.growling && this.scene.time.now >= this.busyUntil;
    }

    /** The chief's taunt, unprovoked (IdleMood, the admin page's button). Any real event cuts it short. */
    growl(): boolean {
        if (!this.canGrowl()) return false;
        this.growling = true;
        AudioSystem.playGrowl();
        this.growlTweens = this.chief.taunt(() => { this.growling = false; this.growlTweens = []; });
        this.goblins.forEach((g, i) => g.brandish(250 + i * 90 + Math.random() * 120));
        return true;
    }

    private cancelGrowl() {
        if (!this.growling) return;
        this.growlTweens.forEach(t => t.stop());
        this.growlTweens = [];
        this.growling = false;
        this.chief.reset();
    }

    /** Horizontal stretch the horde covers — IdleMood keeps fallen heroes out of it. */
    span(): [number, number] {
        return [this.goblins[0].frontX() - 10, 1280];
    }
}
