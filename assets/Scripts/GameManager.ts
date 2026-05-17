const { ccclass } = cc._decorator;

type RectKind = "ground" | "brick" | "question" | "pipe" | "step";
type BlockPayload = "coin" | "mushroom" | "";
type GameState = "menu" | "select" | "playing" | "paused" | "clear" | "gameover" | "win";

interface RectData {
    x: number;
    y: number;
    w: number;
    h: number;
    kind: RectKind;
    payload?: BlockPayload;
    used?: boolean;
    node?: cc.Node;
}

interface CoinData {
    x: number;
    y: number;
    taken?: boolean;
    node?: cc.Node;
}

interface EnemyData {
    type: "goomba" | "turtle" | "flower";
    x: number;
    y: number;
    w: number;
    h: number;
    vx: number;
    left: number;
    right: number;
    dead?: boolean;
    node?: cc.Node;
}

interface ItemData {
    type: "mushroom";
    x: number;
    y: number;
    w: number;
    h: number;
    vx: number;
    vy: number;
    node?: cc.Node;
    taken?: boolean;
}

interface LevelData {
    name: string;
    width: number;
    time: number;
    spawn: cc.Vec2;
    solids: RectData[];
    coins: CoinData[];
    enemies: EnemyData[];
    flagX: number;
    music: string;
}

interface PlayerData {
    x: number;
    y: number;
    w: number;
    h: number;
    vx: number;
    vy: number;
    facing: number;
    onGround: boolean;
    big: boolean;
    invincible: number;
    anim: number;
    node: cc.Node;
}

interface EffectData {
    node: cc.Node;
    ttl: number;
    rise: number;
}

const VIEW_W = 960;
const VIEW_H = 640;
const WORLD_Y = -320;
const GRAVITY = 2100;
const MAX_FALL = 980;
const RUN_ACCEL = 3800;
const FRICTION = 3200;
const MAX_RUN = 285;
const JUMP_V = 760;

@ccclass
export class GameManager extends cc.Component {
    private canvas: cc.Node = null;
    private world: cc.Node = null;
    private ui: cc.Node = null;
    private overlay: cc.Node = null;
    private hudLabels: { [key: string]: cc.Label } = {};
    private levels: LevelData[] = [];
    private levelIndex = 0;
    private state: GameState = "menu";
    private player: PlayerData = null;
    private cameraX = 0;
    private keys: { [key: string]: boolean } = {};
    private score = 0;
    private lives = 3;
    private coinCount = 0;
    private elapsed = 0;
    private currentTime = 0;
    private items: ItemData[] = [];
    private effects: EffectData[] = [];
    private progressFill: cc.Node = null;
    private highScore = 0;
    private audioClips: { [key: string]: cc.AudioClip } = {};
    private atlases: { [key: string]: cc.SpriteAtlas } = {};
    private frames: { [key: string]: cc.SpriteFrame } = {};

    onLoad() {
        cc.macro.ENABLE_MULTI_TOUCH = false;
        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_UP, this.onKeyUp, this);
        this.highScore = Number(cc.sys.localStorage.getItem("webMarioHighScore") || 0);
        this.prepareLevels();
        this.loadVisuals();
        this.loadAudio();
    }

    start() {
        this.setupScene();
        this.showOverlay("menu");
    }

    onDestroy() {
        cc.systemEvent.off(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
        cc.systemEvent.off(cc.SystemEvent.EventType.KEY_UP, this.onKeyUp, this);
    }

    update(dt: number) {
        if (this.state !== "playing") return;
        dt = Math.min(dt, 1 / 30);
        this.elapsed += dt;
        this.currentTime = Math.max(0, this.levels[this.levelIndex].time - Math.floor(this.elapsed));
        if (this.currentTime <= 0) this.hurt(true);

        this.updatePlayer(dt);
        this.updateEnemies(dt);
        this.updateItems(dt);
        this.updateCoins();
        this.updateEffects(dt);
        this.updateWorldAnimations();
        this.updateCamera();
        this.updateHud();

        if (this.player.x > this.levels[this.levelIndex].flagX) {
            this.score += this.currentTime * 10;
            this.playEffect("clear");
            if (this.levelIndex >= this.levels.length - 1) this.showOverlay("win");
            else this.showOverlay("clear");
        }

        if (this.player.y < -180) this.hurt(true);
    }

    private setupScene() {
        const oldCanvas = cc.find("Canvas");
        if (oldCanvas) {
            oldCanvas.active = false;
            oldCanvas.destroy();
        }

        this.canvas = new cc.Node("Canvas");
        const canvasComp = this.canvas.addComponent(cc.Canvas);
        canvasComp.fitWidth = true;
        canvasComp.fitHeight = true;
        this.canvas.setContentSize(VIEW_W, VIEW_H);
        this.node.parent.addChild(this.canvas);

        this.createCamera();

        this.world = new cc.Node("World");
        this.world.zIndex = 0;
        this.canvas.addChild(this.world);

        this.ui = new cc.Node("UI");
        this.ui.zIndex = 100;
        this.canvas.addChild(this.ui);
        this.createHud();
        this.createOverlay();
    }

    private createCamera() {
        const camNode = new cc.Node("Main Camera");
        const cam = camNode.addComponent(cc.Camera);
        cam.clearFlags = cc.Camera.ClearFlags.COLOR;
        cam.backgroundColor = new cc.Color(108, 198, 255);
        camNode.setPosition(0, 0);
        this.canvas.addChild(camNode);
    }

    private createHud() {
        const bg = this.rectNode("HudBar", 0, 0, VIEW_W * 3, 58, new cc.Color(20, 40, 58, 155));
        bg.setPosition(-VIEW_W * 1.5, VIEW_H / 2 - 58);
        this.ui.addChild(bg);

        this.hudLabels.world = this.label("World", -448, 260, 22, cc.Color.WHITE, cc.Label.HorizontalAlign.LEFT);
        this.hudLabels.score = this.label("Score", -250, 260, 22, cc.Color.WHITE, cc.Label.HorizontalAlign.LEFT);
        this.hudLabels.coins = this.label("Coins", -30, 260, 22, cc.Color.WHITE, cc.Label.HorizontalAlign.LEFT);
        this.hudLabels.lives = this.label("Lives", 150, 260, 22, cc.Color.WHITE, cc.Label.HorizontalAlign.LEFT);
        this.hudLabels.time = this.label("Time", 300, 260, 22, cc.Color.WHITE, cc.Label.HorizontalAlign.LEFT);
        this.hudLabels.best = this.label("Best", 420, 260, 18, new cc.Color(255, 224, 112), cc.Label.HorizontalAlign.LEFT);
        Object.keys(this.hudLabels).forEach((k) => this.ui.addChild(this.hudLabels[k].node));

        const progressBack = this.rectNode("ProgressBack", 0, 0, 300, 8, new cc.Color(0, 0, 0, 130));
        progressBack.setPosition(300, 232);
        this.ui.addChild(progressBack);
        this.progressFill = this.rectNode("ProgressFill", 0, 0, 1, 8, new cc.Color(255, 211, 76, 235));
        this.progressFill.setPosition(300, 232);
        this.ui.addChild(this.progressFill);
    }

    private createOverlay() {
        this.overlay = new cc.Node("Overlay");
        this.ui.addChild(this.overlay);
    }

    private showOverlay(next: GameState) {
        this.state = next;
        cc.audioEngine.stopMusic();
        this.overlay.removeAllChildren();
        this.overlay.active = true;

        const shade = this.rectNode("Shade", 0, 0, VIEW_W, VIEW_H, new cc.Color(20, 34, 58, 220));
        shade.setPosition(-VIEW_W / 2, -VIEW_H / 2);
        this.overlay.addChild(shade);

        const copy = {
            menu: ["Web Mario", `Cocos Creator edition. Best score: ${this.highScore}`, "START", "LEVEL SELECT"],
            select: ["Level Select", "Choose a world.", "WORLD 1-1", "WORLD 1-2"],
            paused: ["Paused", "Timer stopped. Ready when you are.", "RESUME", "RESTART"],
            clear: ["Level Clear", "Nice run. Continue to the next stage.", "NEXT", "LEVEL SELECT"],
            gameover: ["Game Over", "Mario ran out of lives.", "RETRY", "LEVEL SELECT"],
            win: ["You Win", `All worlds cleared. Best score: ${Math.max(this.highScore, this.score)}`, "PLAY AGAIN", "LEVEL SELECT"]
        }[next];

        const title = this.label(copy[0], 0, 128, 66, new cc.Color(255, 211, 76), cc.Label.HorizontalAlign.CENTER);
        title.node.width = 760;
        this.overlay.addChild(title.node);

        const body = this.label(copy[1], 0, 62, 24, cc.Color.WHITE, cc.Label.HorizontalAlign.CENTER);
        body.node.width = 780;
        this.overlay.addChild(body.node);

        this.makeButton(copy[2], -120, -35, () => this.primaryAction());
        this.makeButton(copy[3], 120, -35, () => this.secondaryAction());
    }

    private primaryAction() {
        if (this.state === "select") this.startLevel(0);
        else if (this.state === "clear") this.startLevel(this.levelIndex + 1);
        else if (this.state === "paused") this.resume();
        else this.startLevel(this.state === "win" ? 0 : this.levelIndex);
    }

    private secondaryAction() {
        if (this.state === "select") this.startLevel(1);
        else if (this.state === "paused") this.startLevel(this.levelIndex);
        else this.showOverlay("select");
    }

    private makeButton(text: string, x: number, y: number, cb: Function) {
        const node = this.rectNode(`Button ${text}`, 0, 0, 196, 54, new cc.Color(246, 170, 55));
        node.setPosition(x - 98, y - 27);
        const button = node.addComponent(cc.Button);
        button.transition = cc.Button.Transition.COLOR;
        button.normalColor = new cc.Color(246, 170, 55);
        button.hoverColor = new cc.Color(255, 203, 91);
        button.pressedColor = new cc.Color(204, 102, 34);
        node.on(cc.Node.EventType.TOUCH_END, cb, this);
        const label = this.label(text, 98, 15, 22, new cc.Color(42, 20, 4), cc.Label.HorizontalAlign.CENTER);
        label.node.width = 180;
        node.addChild(label.node);
        this.overlay.addChild(node);
    }

    private startLevel(index: number) {
        this.prepareLevels();
        this.levelIndex = Math.max(0, Math.min(this.levels.length - 1, index));
        const source = this.levels[this.levelIndex];
        this.currentTime = source.time;
        this.elapsed = 0;
        this.score = 0;
        this.lives = 3;
        this.coinCount = 0;
        this.items = [];
        this.effects.forEach((effect) => effect.node.destroy());
        this.effects = [];
        this.cameraX = 0;
        this.world.removeAllChildren();
        this.overlay.active = false;
        this.buildLevel(source);
        this.player = this.createPlayer(source.spawn.x, source.spawn.y);
        this.state = "playing";
        this.playMusic(source.music);
        this.updateHud();
    }

    private resume() {
        this.overlay.active = false;
        this.state = "playing";
        this.playMusic(this.levels[this.levelIndex].music);
    }

    private buildLevel(level: LevelData) {
        this.world.setPosition(-VIEW_W / 2, WORLD_Y);
        const sky = this.rectNode("Sky", -1400, -160, level.width + 2800, VIEW_H + 340, new cc.Color(108, 198, 255));
        this.world.addChild(sky);
        for (let i = 0; i < 10; i++) this.cloud(220 + i * 420, 445 + (i % 3) * 32);

        level.solids.forEach((solid) => this.drawSolid(solid));
        level.coins.forEach((coin) => {
            coin.taken = false;
            const n = this.circleNode("Coin", 14, new cc.Color(255, 218, 72));
            n.setPosition(coin.x + 14, coin.y + 14);
            this.world.addChild(n);
            coin.node = n;
        });
        level.enemies.forEach((e) => {
            e.dead = false;
            e.node = this.entityNode(e.type, this.getEnemyFrame(e), e.w, e.h, this.enemyColor(e.type));
            e.node.setPosition(e.x, e.y);
            this.world.addChild(e.node);
        });

        const flag = this.entityNode("Flag", this.singleFrame("flag"), 92, 220, new cc.Color(229, 57, 53));
        flag.setPosition(level.flagX, 88);
        this.world.addChild(flag);
    }

    private createPlayer(x: number, y: number): PlayerData {
        const node = this.entityNode("Mario", this.getMarioFrame(false, 0), 42, 48, new cc.Color(229, 57, 53));
        node.setPosition(x, y);
        this.world.addChild(node);
        return { x, y, w: 42, h: 48, vx: 0, vy: 0, facing: 1, onGround: false, big: false, invincible: 0, anim: 0, node };
    }

    private updatePlayer(dt: number) {
        const p = this.player;
        p.anim += dt;
        p.invincible = Math.max(0, p.invincible - dt);
        const left = this.keys[cc.macro.KEY.a] || this.keys[cc.macro.KEY.left];
        const right = this.keys[cc.macro.KEY.d] || this.keys[cc.macro.KEY.right];
        const jump = this.keys[cc.macro.KEY.w] || this.keys[cc.macro.KEY.up] || this.keys[cc.macro.KEY.space];

        if (left) { p.vx -= RUN_ACCEL * dt; p.facing = -1; }
        if (right) { p.vx += RUN_ACCEL * dt; p.facing = 1; }
        if (!left && !right) p.vx -= Math.sign(p.vx) * Math.min(Math.abs(p.vx), FRICTION * dt);
        p.vx = cc.misc.clampf(p.vx, -MAX_RUN, MAX_RUN);

        if (jump && p.onGround) {
            p.vy = JUMP_V;
            p.onGround = false;
            this.playEffect("jump");
        }

        p.vy = Math.max(-MAX_FALL, p.vy - GRAVITY * dt);
        p.x += p.vx * dt;
        this.resolvePlayer("x");
        p.y += p.vy * dt;
        p.onGround = false;
        this.resolvePlayer("y");
        p.x = cc.misc.clampf(p.x, 0, this.levels[this.levelIndex].width - p.w);
        p.node.setPosition(p.x, p.y);
        p.node.opacity = p.invincible > 0 && Math.floor(p.invincible * 14) % 2 === 0 ? 90 : 255;
        this.updatePlayerSprite();
    }

    private resolvePlayer(axis: "x" | "y") {
        const p = this.player;
        this.levels[this.levelIndex].solids.forEach((s) => {
            if (!this.overlap(p, s)) return;
            if (axis === "x") {
                if (p.vx > 0) p.x = s.x - p.w;
                else if (p.vx < 0) p.x = s.x + s.w;
                p.vx = 0;
            } else {
                if (p.vy < 0) {
                    p.y = s.y + s.h;
                    p.vy = 0;
                    p.onGround = true;
                } else if (p.vy > 0) {
                    p.y = s.y - p.h;
                    p.vy = -70;
                    if (s.kind === "question") this.hitQuestion(s);
                }
            }
        });
    }

    private hitQuestion(block: RectData) {
        if (block.used) return;
        block.used = true;
        this.score += 100;
        this.bumpNode(block.node);
        if (block.node) this.repaintRect(block.node, new cc.Color(128, 96, 66));
        if (block.payload === "mushroom") {
            const item: ItemData = { type: "mushroom", x: block.x + 8, y: block.y + block.h + 4, w: 34, h: 34, vx: 80, vy: 260 };
            item.node = this.entityNode("Mushroom", this.getItemFrame("mushroom"), item.w, item.h, new cc.Color(238, 75, 55));
            item.node.setPosition(item.x, item.y);
            this.world.addChild(item.node);
            this.items.push(item);
            this.playEffect("powerAppear");
        } else {
            this.coinCount++;
            this.score += 200;
            this.spawnText("+200", block.x + 12, block.y + 56, new cc.Color(255, 236, 92));
            this.playEffect("coin");
        }
    }

    private updateEnemies(dt: number) {
        const p = this.player;
        this.levels[this.levelIndex].enemies.forEach((e) => {
            if (e.dead) return;
            if (e.type !== "flower") {
                e.x += e.vx * dt;
                if (e.x < e.left || e.x + e.w > e.right) {
                    e.vx *= -1;
                    e.x = cc.misc.clampf(e.x, e.left, e.right - e.w);
                }
            } else {
                e.y += Math.sin(Date.now() / 180) * 0.55;
            }
            e.node.setPosition(e.x, e.y);
            this.setEntityFrame(e.node, this.getEnemyFrame(e), e.w, e.h, e.vx > 0);
            if (this.overlap(p, e)) {
                if (p.vy < -110 && p.y < e.y + e.h) {
                    e.dead = true;
                    e.node.destroy();
                    p.vy = 430;
                    this.score += e.type === "turtle" ? 300 : 200;
                    this.spawnSmoke(e.x + e.w / 2, e.y + e.h / 2);
                    this.spawnText(e.type === "turtle" ? "+300" : "+200", e.x, e.y + 52, cc.Color.WHITE);
                    this.playEffect("stomp");
                } else {
                    this.hurt(false);
                }
            }
        });
    }

    private updateItems(dt: number) {
        const p = this.player;
        this.items.forEach((item) => {
            item.vy = Math.max(-MAX_FALL, item.vy - GRAVITY * dt);
            item.x += item.vx * dt;
            item.y += item.vy * dt;
            this.levels[this.levelIndex].solids.forEach((s) => {
                if (!this.overlap(item, s)) return;
                if (item.vy < 0) {
                    item.y = s.y + s.h;
                    item.vy = 0;
                } else item.vx *= -1;
            });
            item.node.setPosition(item.x, item.y);
            if (this.overlap(p, item)) {
                item.node.destroy();
                item.taken = true;
                this.powerUp();
            }
        });
        this.items = this.items.filter((i) => !i.taken);
    }

    private updateCoins() {
        const p = this.player;
        this.levels[this.levelIndex].coins.forEach((coin) => {
            if (coin.taken) return;
            if (this.overlap(p, { x: coin.x, y: coin.y, w: 28, h: 28 })) {
                coin.taken = true;
                coin.node.destroy();
                this.coinCount++;
                this.score += 100;
                this.spawnText("+100", coin.x, coin.y + 30, new cc.Color(255, 236, 92));
                this.playEffect("coin");
            }
        });
    }

    private updateEffects(dt: number) {
        this.effects.forEach((effect) => {
            effect.ttl -= dt;
            effect.node.y += effect.rise * dt;
            effect.node.opacity = Math.max(0, Math.floor(effect.ttl * 255));
        });
        this.effects = this.effects.filter((effect) => {
            if (effect.ttl > 0) return true;
            effect.node.destroy();
            return false;
        });
    }

    private updateWorldAnimations() {
        const t = Date.now() / 220;
        this.levels[this.levelIndex].coins.forEach((coin) => {
            if (coin.taken || !coin.node) return;
            coin.node.scaleX = 0.72 + Math.abs(Math.sin(t + coin.x * 0.02)) * 0.5;
            coin.node.y = coin.y + 14 + Math.sin(t + coin.x * 0.01) * 5;
        });
        this.items.forEach((item) => {
            if (item.node) item.node.angle += 2;
        });
    }

    private updateCamera() {
        const level = this.levels[this.levelIndex];
        this.cameraX = cc.misc.clampf(this.player.x - VIEW_W * 0.42, 0, level.width - VIEW_W);
        this.world.setPosition(-VIEW_W / 2 - this.cameraX, WORLD_Y);
    }

    private updateHud() {
        if (this.score > this.highScore) {
            this.highScore = this.score;
            cc.sys.localStorage.setItem("webMarioHighScore", String(this.highScore));
        }
        this.hudLabels.world.string = this.levels[this.levelIndex].name;
        this.hudLabels.score.string = `Score ${("000000" + this.score).slice(-6)}`;
        this.hudLabels.coins.string = `Coins ${this.coinCount}`;
        this.hudLabels.lives.string = `Lives ${this.lives}`;
        this.hudLabels.time.string = `Time ${this.currentTime}`;
        this.hudLabels.best.string = `Best ${this.highScore}`;
        if (this.progressFill) {
            const level = this.levels[this.levelIndex];
            const progress = cc.misc.clampf(this.player.x / level.flagX, 0, 1);
            this.progressFill.width = Math.max(1, progress * 300);
            this.repaintRect(this.progressFill, new cc.Color(255, 211, 76, 235));
        }
    }

    private hurt(forceDeath: boolean) {
        const p = this.player;
        if (!forceDeath && p.invincible > 0) return;
        if (!forceDeath && p.big) {
            p.big = false;
            p.h = 48;
            p.w = 42;
            p.node.setContentSize(p.w, p.h);
            p.invincible = 1.5;
            this.playEffect("hurt");
            return;
        }
        this.lives--;
        this.playEffect("hurt");
        if (this.lives <= 0) {
            this.playEffect("gameover");
            this.showOverlay("gameover");
            return;
        }
        const spawn = this.levels[this.levelIndex].spawn;
        p.x = spawn.x; p.y = spawn.y; p.vx = 0; p.vy = 0; p.invincible = 1.8;
    }

    private powerUp() {
        if (!this.player.big) {
            this.player.big = true;
            this.player.h = 72;
            this.player.w = 48;
            this.player.node.setContentSize(this.player.w, this.player.h);
            this.updatePlayerSprite();
        }
        this.score += 500;
        this.spawnText("POWER UP", this.player.x - 18, this.player.y + this.player.h + 22, new cc.Color(255, 224, 112));
        this.playEffect("power");
    }

    private overlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
        return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    }

    private onKeyDown(event: cc.Event.EventKeyboard) {
        this.keys[event.keyCode] = true;
        if (event.keyCode === cc.macro.KEY.p && this.state === "playing") this.showOverlay("paused");
    }

    private onKeyUp(event: cc.Event.EventKeyboard) {
        this.keys[event.keyCode] = false;
    }

    private label(text: string, x: number, y: number, size: number, color: cc.Color, align: cc.Label.HorizontalAlign) {
        const node = new cc.Node(text);
        const label = node.addComponent(cc.Label);
        label.string = text;
        label.fontSize = size;
        label.lineHeight = Math.round(size * 1.2);
        label.horizontalAlign = align;
        node.color = color;
        node.setPosition(x, y);
        node.width = 190;
        return label;
    }

    private rectNode(name: string, x: number, y: number, w: number, h: number, color: cc.Color) {
        const node = new cc.Node(name);
        node.setAnchorPoint(0, 0);
        node.setContentSize(w, h);
        node.color = color;
        node.setPosition(x, y);
        const graphics = node.addComponent(cc.Graphics);
        graphics.fillColor = color;
        graphics.rect(0, 0, w, h);
        graphics.fill();
        return node;
    }

    private circleNode(name: string, radius: number, color: cc.Color) {
        const node = new cc.Node(name);
        const graphics = node.addComponent(cc.Graphics);
        graphics.fillColor = color;
        graphics.circle(0, 0, radius);
        graphics.fill();
        return node;
    }

    private drawSolid(s: RectData) {
        const color = s.kind === "question" ? new cc.Color(244, 191, 56) :
            s.kind === "pipe" ? new cc.Color(31, 168, 76) :
            s.kind === "ground" ? new cc.Color(119, 82, 42) :
            new cc.Color(181, 91, 42);
        const node = this.rectNode(s.kind, s.x, s.y, s.w, s.h, color);
        this.world.addChild(node);
        s.node = node;
        if (s.kind === "question") {
            const q = this.label("?", s.w / 2, s.h / 2 - 14, 32, cc.Color.WHITE, cc.Label.HorizontalAlign.CENTER);
            q.node.width = s.w;
            node.addChild(q.node);
        }
    }

    private cloud(x: number, y: number) {
        const a = this.circleNode("Cloud", 28, cc.Color.WHITE);
        a.opacity = 220; a.setPosition(x, y); this.world.addChild(a);
        const b = this.circleNode("Cloud", 34, cc.Color.WHITE);
        b.opacity = 220; b.setPosition(x + 34, y + 8); this.world.addChild(b);
        const c = this.circleNode("Cloud", 26, cc.Color.WHITE);
        c.opacity = 220; c.setPosition(x + 70, y); this.world.addChild(c);
    }

    private loadAudio() {
        const paths: { [key: string]: string } = {
            bgm1: "AS2_source/audio/bgm_1",
            bgm2: "AS2_source/audio/bgm_2",
            jump: "AS2_source/audio/jump",
            coin: "AS2_source/audio/coin",
            stomp: "AS2_source/audio/stomp",
            hurt: "AS2_source/audio/loseOneLife",
            clear: "AS2_source/audio/levelClear",
            gameover: "AS2_source/audio/Game Over",
            power: "AS2_source/audio/PowerUp",
            powerAppear: "AS2_source/audio/powerUpAppear"
        };
        Object.keys(paths).forEach((key) => {
            cc.loader.loadRes(paths[key], cc.AudioClip, (err, clip: cc.AudioClip) => {
                if (!err) this.audioClips[key] = clip;
            });
        });
    }

    private playMusic(key: string) {
        const clip = this.audioClips[key];
        if (clip) cc.audioEngine.playMusic(clip, true);
    }

    private playEffect(key: string) {
        const clip = this.audioClips[key];
        if (clip) cc.audioEngine.playEffect(clip, false);
    }

    private loadVisuals() {
        this.loadAtlas("marioSmall", "AS2_source/player/mario_small");
        this.loadAtlas("marioBig", "AS2_source/player/mario_big");
        this.loadAtlas("goomba", "AS2_source/enemies/Goomba");
        this.loadAtlas("turtle", "AS2_source/enemies/Turtle");
        this.loadAtlas("flower", "AS2_source/enemies/Flower");
        this.loadAtlas("items", "AS2_source/effects_UI_tiles/items");
        this.loadFrame("flag", "AS2_source/pictures/flag");
        this.loadFrame("smoke", "AS2_source/pictures/smoke");
    }

    private loadAtlas(key: string, path: string) {
        cc.loader.loadRes(path, cc.SpriteAtlas, (err, atlas: cc.SpriteAtlas) => {
            if (!err && atlas) this.atlases[key] = atlas;
        });
    }

    private loadFrame(key: string, path: string) {
        cc.loader.loadRes(path, cc.SpriteFrame, (err, frame: cc.SpriteFrame) => {
            if (!err && frame) this.frames[key] = frame;
        });
    }

    private atlasFrame(atlasKey: string, frameName: string): cc.SpriteFrame {
        const atlas = this.atlases[atlasKey];
        if (!atlas) return null;
        return atlas.getSpriteFrame(frameName) || atlas.getSpriteFrame(`${frameName}.png`);
    }

    private singleFrame(key: string): cc.SpriteFrame {
        return this.frames[key] || null;
    }

    private entityNode(name: string, frame: cc.SpriteFrame, w: number, h: number, fallback: cc.Color): cc.Node {
        const node = new cc.Node(name);
        node.setAnchorPoint(0, 0);
        node.setContentSize(w, h);

        const fallbackNode = this.rectNode("Fallback", 0, 0, w, h, fallback);
        node.addChild(fallbackNode);

        const visual = new cc.Node("Visual");
        visual.setAnchorPoint(0.5, 0.5);
        visual.setPosition(w / 2, h / 2);
        visual.setContentSize(w, h);
        const sprite = visual.addComponent(cc.Sprite);
        sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
        node.addChild(visual);

        this.setEntityFrame(node, frame, w, h, false);
        return node;
    }

    private setEntityFrame(node: cc.Node, frame: cc.SpriteFrame, w: number, h: number, flip = false) {
        const visual = node.getChildByName("Visual");
        const fallback = node.getChildByName("Fallback");
        if (!visual) return;
        visual.setPosition(w / 2, h / 2);
        visual.setContentSize(w, h);
        visual.scaleX = flip ? -1 : 1;
        const sprite = visual.getComponent(cc.Sprite);
        if (sprite && frame) {
            sprite.spriteFrame = frame;
            sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
            if (fallback) fallback.active = false;
        } else if (fallback) {
            fallback.active = true;
        }
    }

    private getMarioFrame(big: boolean, index: number): cc.SpriteFrame {
        const atlasKey = big ? "marioBig" : "marioSmall";
        const prefix = big ? "mario_big" : "mario_small";
        return this.atlasFrame(atlasKey, `${prefix}_${index}`) || this.atlasFrame(atlasKey, `${prefix}_0`);
    }

    private updatePlayerSprite() {
        const p = this.player;
        let index = 0;
        if (!p.onGround) index = 5;
        else if (Math.abs(p.vx) > 30) index = 1 + (Math.floor(p.anim * 12) % 3);
        this.setEntityFrame(p.node, this.getMarioFrame(p.big, index), p.w, p.h, p.facing < 0);
    }

    private getEnemyFrame(e: EnemyData): cc.SpriteFrame {
        if (e.type === "goomba") {
            return this.atlasFrame("goomba", `Goomba_${Math.floor(Date.now() / 160) % 2}`) || this.atlasFrame("goomba", "Goomba_0");
        }
        if (e.type === "turtle") {
            return this.atlasFrame("turtle", `turtle_${Math.floor(Date.now() / 160) % 2}`) || this.atlasFrame("turtle", "turtle_0");
        }
        return this.atlasFrame("flower", `flower_${Math.floor(Date.now() / 220) % 2}`) || this.atlasFrame("flower", "flower_0");
    }

    private getItemFrame(type: "mushroom"): cc.SpriteFrame {
        return this.atlasFrame("items", type === "mushroom" ? "items_0" : "items_0");
    }

    private enemyColor(type: "goomba" | "turtle" | "flower"): cc.Color {
        if (type === "turtle") return new cc.Color(42, 165, 83);
        if (type === "flower") return new cc.Color(220, 38, 53);
        return new cc.Color(139, 83, 38);
    }

    private repaintRect(node: cc.Node, color: cc.Color) {
        const graphics = node.getComponent(cc.Graphics);
        if (!graphics) return;
        graphics.clear();
        graphics.fillColor = color;
        graphics.rect(0, 0, node.width, node.height);
        graphics.fill();
    }

    private spawnText(text: string, x: number, y: number, color: cc.Color) {
        const label = this.label(text, x, y, 22, color, cc.Label.HorizontalAlign.CENTER);
        label.node.width = 120;
        this.world.addChild(label.node);
        this.effects.push({ node: label.node, ttl: 0.95, rise: 46 });
    }

    private spawnSmoke(x: number, y: number) {
        const node = this.entityNode("Smoke", this.singleFrame("smoke"), 46, 36, new cc.Color(235, 235, 235));
        node.setPosition(x - 23, y - 18);
        this.world.addChild(node);
        node.runAction(cc.sequence(cc.scaleTo(0.18, 1.25), cc.scaleTo(0.25, 0.7)));
        this.effects.push({ node, ttl: 0.58, rise: 26 });
    }

    private bumpNode(node: cc.Node) {
        if (!node) return;
        node.stopAllActions();
        node.runAction(cc.sequence(cc.moveBy(0.06, 0, 10), cc.moveBy(0.10, 0, -10)));
    }

    private prepareLevels() {
        this.levels = [
            {
                name: "World 1-1", width: 4300, time: 180, spawn: cc.v2(96, 88), flagX: 4050, music: "bgm1",
                solids: [
                    this.s(0, 0, 1250, 88, "ground"), this.s(1380, 0, 960, 88, "ground"), this.s(2460, 0, 1840, 88, "ground"),
                    this.s(520, 210, 48, 48, "brick"), this.s(568, 210, 48, 48, "question", "coin"), this.s(616, 210, 48, 48, "brick"),
                    this.s(960, 278, 48, 48, "question", "mushroom"), this.s(1008, 278, 48, 48, "brick"),
                    this.s(1560, 88, 48, 92, "pipe"), this.s(1850, 210, 48, 48, "question", "coin"),
                    this.s(2220, 88, 48, 112, "pipe"),
                    this.s(2860, 88, 48, 48, "step"), this.s(2908, 88, 48, 96, "step"), this.s(2956, 88, 48, 144, "step"), this.s(3004, 88, 48, 192, "step"),
                    this.s(3250, 210, 48, 48, "question", "mushroom"), this.s(3298, 210, 48, 48, "brick"), this.s(3346, 210, 48, 48, "question", "coin")
                ],
                coins: [{ x: 700, y: 190 }, { x: 750, y: 215 }, { x: 800, y: 190 }, { x: 1730, y: 185 }, { x: 2100, y: 190 }, { x: 3550, y: 205 }],
                enemies: [this.e("goomba", 840, 88, 760, 1060), this.e("goomba", 1780, 88, 1500, 2040), this.e("turtle", 2600, 88, 2480, 2860)]
            },
            {
                name: "World 1-2", width: 5200, time: 220, spawn: cc.v2(96, 88), flagX: 4930, music: "bgm2",
                solids: [
                    this.s(0, 0, 900, 88, "ground"), this.s(1020, 0, 1040, 88, "ground"), this.s(2180, 0, 840, 88, "ground"), this.s(3150, 0, 2050, 88, "ground"),
                    this.s(430, 210, 48, 48, "question", "coin"), this.s(478, 210, 48, 48, "brick"),
                    this.s(1260, 230, 48, 48, "brick"), this.s(1308, 230, 48, 48, "question", "mushroom"), this.s(1356, 230, 48, 48, "brick"),
                    this.s(1700, 300, 48, 48, "question", "coin"), this.s(1748, 300, 48, 48, "question", "coin"),
                    this.s(2320, 88, 48, 118, "pipe"), this.s(2750, 220, 48, 48, "brick"), this.s(2798, 220, 48, 48, "question", "coin"), this.s(2846, 220, 48, 48, "brick"),
                    this.s(3460, 88, 48, 48, "step"), this.s(3508, 88, 48, 96, "step"), this.s(3556, 88, 48, 144, "step"), this.s(3604, 88, 48, 192, "step"),
                    this.s(3800, 88, 48, 192, "step"), this.s(3848, 88, 48, 144, "step"), this.s(3896, 88, 48, 96, "step"), this.s(3944, 88, 48, 48, "step"),
                    this.s(4320, 230, 48, 48, "question", "mushroom")
                ],
                coins: [{ x: 260, y: 190 }, { x: 760, y: 235 }, { x: 1530, y: 260 }, { x: 1940, y: 205 }, { x: 2510, y: 220 }, { x: 4130, y: 215 }, { x: 4460, y: 250 }],
                enemies: [this.e("goomba", 640, 88, 420, 800), this.e("turtle", 1480, 88, 1160, 1900), this.e("goomba", 2500, 88, 2220, 2940), this.e("flower", 2325, 206, 2325, 2325), this.e("goomba", 4200, 88, 4020, 4540)]
            }
        ];
    }

    private s(x: number, y: number, w: number, h: number, kind: RectKind, payload: BlockPayload = ""): RectData {
        return { x, y, w, h, kind, payload };
    }

    private e(type: "goomba" | "turtle" | "flower", x: number, y: number, left: number, right: number): EnemyData {
        return { type, x, y, w: type === "flower" ? 42 : 46, h: type === "flower" ? 56 : 42, vx: type === "turtle" ? -82 : -68, left, right };
    }
}
