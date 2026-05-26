const { ccclass } = cc._decorator;

type RectKind = "ground" | "brick" | "question" | "pipe" | "step";
type BlockPayload = "coin" | "mushroom" | "";
type GameState = "menu" | "select" | "auth" | "scores" | "playing" | "paused" | "clear" | "gameover" | "win";
type ScoreScope = "world1" | "world2";
type ScoreUploadScope = "all" | ScoreScope;
type PlayerSlot = "p1" | "p2";

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
    slot: PlayerSlot;
    x: number;
    y: number;
    w: number;
    h: number;
    vx: number;
    vy: number;
    facing: number;
    onGround: boolean;
    big: boolean;
    crouching: boolean;
    jumpsUsed: number;
    jumpQueued: boolean;
    fastFallQueued: boolean;
    invincible: number;
    anim: number;
    node: cc.Node;
}

interface EffectData {
    node: cc.Node;
    ttl: number;
    rise: number;
}

interface ScoreEntry {
    uid: string;
    name: string;
    score: number;
    coins: number;
    world: string;
}

const VIEW_W = 960;
const VIEW_H = 640;
const WORLD_Y = -320;
const GRAVITY = 2100;
const MAX_FALL = 980;
const RUN_ACCEL = 3800;
const FRICTION = 3200;
const MAX_RUN = 285;
const CROUCH_MAX_RUN = 85;
const JUMP_V = 760;
const DOUBLE_JUMP_V = 690;
const FAST_FALL_V = 1180;
const FAST_FALL_GRAVITY = 3600;
const SMALL_W = 42;
const SMALL_H = 48;
const BIG_W = 48;
const BIG_H = 72;
const SMALL_CROUCH_H = 34;
const BIG_CROUCH_H = 44;
const KEY_I = 73;
const KEY_J = 74;
const KEY_K = 75;
const KEY_L = 76;
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDvjVrLkf7x-8jbe0iJYrdkDhD3TEsx8-o",
    authDomain: "softwaremario.firebaseapp.com",
    projectId: "softwaremario",
    storageBucket: "softwaremario.firebasestorage.app",
    messagingSenderId: "282301204175",
    appId: "1:282301204175:web:c9d89d57a2064f297899ba",
    measurementId: "G-74MNLBH27J"
};
const FIREBASE_SCRIPTS = [
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js",
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js",
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"
];

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
    private player2: PlayerData = null;
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
    private firebaseReady = false;
    private firebaseMessage = "Connecting to Firebase...";
    private currentUser: any = null;
    private firebaseAuth: any = null;
    private firestore: any = null;
    private authInputs: { email?: any; password?: any; name?: any } = {};
    private authDomInputs: any[] = [];
    private authDomResizeHandler: any = null;
    private authDraft = { email: "", password: "", name: "" };
    private authMessage = "";
    private topScores: ScoreEntry[] = [];
    private scoreboardMessage = "Loading scoreboard...";
    private bestUploadedScore = 0;
    private bestUploadedScores: { [key: string]: number } = { all: 0, world1: 0, world2: 0 };
    private scoreboardBackState: GameState = "menu";
    private scoreboardScope: ScoreScope = "world1";

    onLoad() {
        cc.macro.ENABLE_MULTI_TOUCH = false;
        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_UP, this.onKeyUp, this);
        this.highScore = Number(cc.sys.localStorage.getItem("webMarioHighScore") || 0);
        this.authDraft.email = cc.sys.localStorage.getItem("webMarioEmail") || "";
        this.authDraft.name = cc.sys.localStorage.getItem("webMarioDisplayName") || "";
        this.prepareLevels();
        this.loadVisuals();
        this.loadAudio();
        this.initFirebase();
    }

    start() {
        this.setupScene();
        this.showOverlay("menu");
    }

    onDestroy() {
        this.hideAuthDomInputs();
        cc.systemEvent.off(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
        cc.systemEvent.off(cc.SystemEvent.EventType.KEY_UP, this.onKeyUp, this);
    }

    update(dt: number) {
        if (this.state !== "playing") return;
        dt = Math.min(dt, 1 / 30);
        this.elapsed += dt;
        this.currentTime = Math.max(0, this.levels[this.levelIndex].time - Math.floor(this.elapsed));
        if (this.currentTime <= 0) this.hurt(true);

        this.updatePlayer(dt, this.player);
        this.updatePlayer(dt, this.player2);
        this.updateEnemies(dt);
        this.updateItems(dt);
        this.updateCoins();
        this.updateEffects(dt);
        this.updateWorldAnimations();
        this.updateCamera();
        this.keepPlayer2OnCamera();
        this.updateHud();

        if (this.player.x > this.levels[this.levelIndex].flagX) {
            this.score += this.currentTime * 10;
            this.playEffect("clear");
            if (this.levelIndex >= this.levels.length - 1) this.showOverlay("win");
            else this.showOverlay("clear");
        }

        if (this.player.y < -180) this.hurt(true, this.player);
        if (this.player2 && this.player2.y < -180) this.hurt(true, this.player2);
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

        this.hudLabels.world = this.label("World", -448, 290, 22, cc.Color.WHITE, cc.Label.HorizontalAlign.LEFT);
        this.hudLabels.score = this.label("Score", -250, 290, 22, cc.Color.WHITE, cc.Label.HorizontalAlign.LEFT);
        this.hudLabels.coins = this.label("Coins", -30, 290, 22, cc.Color.WHITE, cc.Label.HorizontalAlign.LEFT);
        this.hudLabels.lives = this.label("Lives", 150, 290, 22, cc.Color.WHITE, cc.Label.HorizontalAlign.LEFT);
        this.hudLabels.time = this.label("Time", 300, 290, 22, cc.Color.WHITE, cc.Label.HorizontalAlign.LEFT);
        this.hudLabels.best = this.label("Best", 420, 290, 18, new cc.Color(255, 224, 112), cc.Label.HorizontalAlign.LEFT);
        Object.keys(this.hudLabels).forEach((k) => this.ui.addChild(this.hudLabels[k].node));

        const progressBack = this.rectNode("ProgressBack", 0, 0, 300, 8, new cc.Color(0, 0, 0, 130));
        progressBack.setPosition(300, 264);
        this.ui.addChild(progressBack);
        this.progressFill = this.rectNode("ProgressFill", 0, 0, 1, 8, new cc.Color(255, 211, 76, 235));
        this.progressFill.setPosition(300, 264);
        this.ui.addChild(this.progressFill);
    }

    private createOverlay() {
        this.overlay = new cc.Node("Overlay");
        this.ui.addChild(this.overlay);
    }

    private showOverlay(next: GameState) {
        this.hideAuthDomInputs();
        this.state = next;
        cc.audioEngine.stopMusic();
        this.overlay.removeAllChildren();
        this.overlay.active = true;

        const shade = this.rectNode("Shade", 0, 0, VIEW_W, VIEW_H, new cc.Color(20, 34, 58, 220));
        shade.setPosition(-VIEW_W / 2, -VIEW_H / 2);
        this.overlay.addChild(shade);

        if (next === "menu") {
            this.showMenuOverlay();
            return;
        }
        if (next === "auth") {
            this.showAuthOverlay();
            return;
        }
        if (next === "scores") {
            this.showScoreboardOverlay();
            return;
        }
        if (next === "clear" || next === "gameover" || next === "win") this.submitScoreIfEligible();

        const copy = {
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
        this.makeCommonOverlayButtons(next, -105);
    }

    private showMenuOverlay() {
        const title = this.label("Web Mario", 0, 142, 66, new cc.Color(255, 211, 76), cc.Label.HorizontalAlign.CENTER);
        title.node.width = 760;
        this.overlay.addChild(title.node);

        const body = this.label(`Cocos Creator edition. Best score: ${this.highScore}`, 0, 82, 24, cc.Color.WHITE, cc.Label.HorizontalAlign.CENTER);
        body.node.width = 780;
        this.overlay.addChild(body.node);

        const account = this.label(this.accountSummary(), 0, 38, 20, new cc.Color(188, 229, 255), cc.Label.HorizontalAlign.CENTER);
        account.node.width = 820;
        this.overlay.addChild(account.node);

        this.makeButton("START", -120, -38, () => this.primaryAction());
        this.makeButton("LEVEL SELECT", 120, -38, () => this.secondaryAction());
        this.makeButton(this.currentUser ? "ACCOUNT" : "REGISTER / LOGIN", -120, -108, () => this.showOverlay("auth"), 220);
        this.makeButton("SCOREBOARD", 120, -108, () => {
            this.openScoreboard("menu");
        }, 220);
    }

    private showAuthOverlay() {
        const title = this.label("Account", 0, 168, 58, new cc.Color(255, 211, 76), cc.Label.HorizontalAlign.CENTER);
        title.node.width = 760;
        this.overlay.addChild(title.node);

        const body = this.label(this.authMessage || this.accountSummary(), 0, 112, 22, cc.Color.WHITE, cc.Label.HorizontalAlign.CENTER);
        body.node.width = 820;
        this.overlay.addChild(body.node);

        if (!this.firebaseReady) {
            const pending = this.label(this.firebaseMessage, 0, 38, 22, new cc.Color(188, 229, 255), cc.Label.HorizontalAlign.CENTER);
            pending.node.width = 820;
            this.overlay.addChild(pending.node);
            this.makeButton("BACK", 0, -74, () => this.showOverlay("menu"), 180);
            return;
        }

        if (this.currentUser) {
            const signedIn = this.label(`Signed in as ${this.displayName()} (${this.currentUser.email || "Firebase user"})`, 0, 42, 22, new cc.Color(188, 229, 255), cc.Label.HorizontalAlign.CENTER);
            signedIn.node.width = 820;
            this.overlay.addChild(signedIn.node);
            this.makeButton("LOG OUT", -170, -54, () => this.logoutAccount(), 180);
            this.makeButton("SCOREBOARD", 0, -54, () => {
                this.openScoreboard("auth");
            }, 190);
            this.makeButton("BACK", 170, -54, () => this.showOverlay("menu"), 180);
            return;
        }

        this.makeFormLabel("Email address", 72);
        this.authInputs.email = this.makeInput("you@example.com", "email", 0, 42, 430, 46, false, this.authDraft.email, true);
        this.makeFormLabel("Password (at least 6 characters)", 6);
        this.authInputs.password = this.makeInput("password", "password", 0, -24, 430, 46, true, this.authDraft.password);
        this.makeFormLabel("Display name on scoreboard", -60);
        this.authInputs.name = this.makeInput("player name", "name", 0, -90, 430, 46, false, this.authDraft.name);
        this.makeButton("REGISTER", -170, -170, () => this.registerAccount(), 180);
        this.makeButton("LOG IN", 0, -170, () => this.loginAccount(), 160);
        this.makeButton("BACK", 170, -170, () => this.showOverlay("menu"), 180);
    }

    private showScoreboardOverlay() {
        const title = this.label("Scoreboard", 0, 188, 54, new cc.Color(255, 211, 76), cc.Label.HorizontalAlign.CENTER);
        title.node.width = 760;
        this.overlay.addChild(title.node);

        const status = this.label(this.currentUser ? `Signed in: ${this.displayName()}` : "Register or log in to upload your score.", 0, 134, 20, cc.Color.WHITE, cc.Label.HorizontalAlign.CENTER);
        status.node.width = 820;
        this.overlay.addChild(status.node);

        const scope = this.label(`Showing ${this.scoreboardTitle(this.scoreboardScope)}`, 0, 102, 18, new cc.Color(188, 229, 255), cc.Label.HorizontalAlign.CENTER);
        scope.node.width = 820;
        this.overlay.addChild(scope.node);
        this.makeButton("1-1", -70, 54, () => this.setScoreboardScope("world1"), 110);
        this.makeButton("1-2", 70, 54, () => this.setScoreboardScope("world2"), 110);

        if (this.topScores.length === 0) {
            const empty = this.label(this.scoreboardMessage, 0, -20, 22, new cc.Color(188, 229, 255), cc.Label.HorizontalAlign.CENTER);
            empty.node.width = 820;
            this.overlay.addChild(empty.node);
        } else {
            this.topScores.forEach((entry, index) => {
                const line = `${index + 1}. ${entry.name}   ${entry.score} pts   ${entry.coins} coins   ${entry.world}`;
                const row = this.label(line, 0, -8 - index * 22, 18, index === 0 ? new cc.Color(255, 231, 112) : cc.Color.WHITE, cc.Label.HorizontalAlign.CENTER);
                row.node.width = 860;
                this.overlay.addChild(row.node);
            });
        }

        this.makeButton("REFRESH", -220, -260, () => this.loadScoreboard(), 180);
        this.makeButton("ACCOUNT", 0, -260, () => this.showOverlay("auth"), 180);
        this.makeButton("BACK", 220, -260, () => this.showOverlay(this.scoreboardBackState), 180);
    }

    private openScoreboard(backState: GameState) {
        this.scoreboardBackState = backState;
        this.scoreboardMessage = "Loading scoreboard...";
        this.showOverlay("scores");
        this.loadScoreboard();
    }

    private setScoreboardScope(scope: ScoreScope) {
        this.scoreboardScope = scope;
        this.scoreboardMessage = "Loading scoreboard...";
        this.showOverlay("scores");
        this.loadScoreboard();
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

    private makeButton(text: string, x: number, y: number, cb: Function, width = 196) {
        const node = this.rectNode(`Button ${text}`, 0, 0, width, 54, new cc.Color(246, 170, 55));
        node.setPosition(x - width / 2, y - 27);
        const button = node.addComponent(cc.Button);
        button.transition = cc.Button.Transition.COLOR;
        button.normalColor = new cc.Color(246, 170, 55);
        button.hoverColor = new cc.Color(255, 203, 91);
        button.pressedColor = new cc.Color(204, 102, 34);
        node.on(cc.Node.EventType.TOUCH_END, cb, this);
        const label = this.label(text, width / 2, 15, 22, new cc.Color(42, 20, 4), cc.Label.HorizontalAlign.CENTER);
        label.node.width = width - 16;
        node.addChild(label.node);
        this.overlay.addChild(node);
    }

    private makeCommonOverlayButtons(backState: GameState, y: number) {
        this.makeButton("ACCOUNT", -120, y, () => this.showOverlay("auth"), 220);
        this.makeButton("SCOREBOARD", 120, y, () => this.openScoreboard(backState), 220);
    }

    private makeFormLabel(text: string, y: number) {
        const formLabel = this.label(text, 0, y, 18, new cc.Color(188, 229, 255), cc.Label.HorizontalAlign.LEFT);
        formLabel.node.width = 430;
        this.overlay.addChild(formLabel.node);
    }

    private makeInput(placeholder: string, field: "email" | "password" | "name", x: number, y: number, w: number, h: number, password: boolean, value = "", email = false) {
        const node = this.rectNode(`Input ${placeholder}`, 0, 0, w, h, new cc.Color(245, 248, 255, 235));
        node.setPosition(x - w / 2, y - h / 2);
        this.overlay.addChild(node);

        if (!cc.sys.isBrowser || typeof document === "undefined") {
            const fallback = this.label(value || placeholder, x, y - 11, 18, value ? cc.Color.BLACK : new cc.Color(92, 105, 125), cc.Label.HorizontalAlign.LEFT);
            fallback.node.width = w - 24;
            this.overlay.addChild(fallback.node);
            return { value, string: value };
        }

        const input = document.createElement("input");
        input.type = "text";
        input.value = value;
        input.placeholder = placeholder;
        input.maxLength = password ? 64 : 32;
        input.autocomplete = email ? "email" : field === "password" ? "current-password" : "nickname";
        input.style.position = "fixed";
        input.style.zIndex = "2147483647";
        input.style.boxSizing = "border-box";
        input.style.border = "0";
        input.style.outline = "0";
        input.style.background = "#f5f8ff";
        input.style.color = "#000000";
        (input.style as any).webkitTextFillColor = "#000000";
        input.style.padding = "0 12px";
        input.style.fontFamily = "Arial, sans-serif";
        input.style.pointerEvents = "auto";
        input.addEventListener("input", () => this.captureAuthInput(field, input));
        input.addEventListener("change", () => this.captureAuthInput(field, input));
        input.addEventListener("blur", () => this.captureAuthInput(field, input));
        document.body.appendChild(input);
        this.authDomInputs.push({ input, x, y, w, h });
        this.ensureAuthDomResizeHandler();
        this.positionAuthDomInputs();
        return input;
    }

    private captureAuthInput(field: "email" | "password" | "name", input: any) {
        this.authDraft[field] = this.inputValue(input);
        if (field === "email") cc.sys.localStorage.setItem("webMarioEmail", this.authDraft.email);
        if (field === "name") cc.sys.localStorage.setItem("webMarioDisplayName", this.authDraft.name);
    }

    private ensureAuthDomResizeHandler() {
        if (this.authDomResizeHandler || typeof window === "undefined") return;
        this.authDomResizeHandler = () => this.positionAuthDomInputs();
        window.addEventListener("resize", this.authDomResizeHandler);
    }

    private positionAuthDomInputs() {
        if (!cc.sys.isBrowser || typeof document === "undefined") return;
        const canvasElement = ((cc.game as any) && (cc.game as any).canvas) || document.querySelector("canvas");
        if (!canvasElement || !canvasElement.getBoundingClientRect) return;
        const rect = canvasElement.getBoundingClientRect();
        const scaleX = rect.width / VIEW_W;
        const scaleY = rect.height / VIEW_H;
        this.authDomInputs.forEach((entry) => {
            const left = rect.left + (VIEW_W / 2 + entry.x - entry.w / 2) * scaleX;
            const top = rect.top + (VIEW_H / 2 - entry.y - entry.h / 2) * scaleY;
            entry.input.style.left = `${left}px`;
            entry.input.style.top = `${top}px`;
            entry.input.style.width = `${entry.w * scaleX}px`;
            entry.input.style.height = `${entry.h * scaleY}px`;
            entry.input.style.fontSize = `${Math.max(14, 20 * Math.min(scaleX, scaleY))}px`;
            entry.input.style.lineHeight = `${entry.h * scaleY}px`;
        });
    }

    private hideAuthDomInputs() {
        this.captureAuthInputs();
        this.authDomInputs.forEach((entry) => {
            if (entry.input && entry.input.parentNode) entry.input.parentNode.removeChild(entry.input);
        });
        this.authDomInputs = [];
        if (this.authDomResizeHandler && typeof window !== "undefined") {
            window.removeEventListener("resize", this.authDomResizeHandler);
            this.authDomResizeHandler = null;
        }
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
        this.player = this.createPlayer(source.spawn.x, source.spawn.y, "p1", new cc.Color(229, 57, 53));
        this.player2 = this.createPlayer(source.spawn.x + 56, source.spawn.y, "p2", new cc.Color(68, 170, 255));
        this.state = "playing";
        this.playMusic(source.music);
        this.updateHud();
    }

    private resume() {
        this.overlay.active = false;
        this.state = "playing";
        this.playMusic(this.levels[this.levelIndex].music);
    }

    private initFirebase() {
        if (!cc.sys.isBrowser || typeof window === "undefined" || typeof document === "undefined") {
            this.firebaseMessage = "Firebase account features are available in the Web build.";
            return;
        }

        this.loadFirebaseScripts()
            .then(() => {
                const firebase = (window as any).firebase;
                if (!firebase) throw new Error("Firebase SDK did not load.");
                if (!firebase.apps || firebase.apps.length === 0) firebase.initializeApp(FIREBASE_CONFIG);
                this.firebaseAuth = firebase.auth();
                this.firestore = firebase.firestore();
                this.firebaseReady = true;
                this.firebaseMessage = "Firebase connected.";
                this.firebaseAuth.onAuthStateChanged((user: any) => this.onAuthChanged(user));
                this.loadScoreboard();
                this.refreshCurrentOverlay();
            })
            .catch((err: any) => {
                this.firebaseReady = false;
                this.firebaseMessage = this.firebaseErrorText(err);
                this.refreshCurrentOverlay();
            });
    }

    private loadFirebaseScripts(): Promise<void> {
        let chain = Promise.resolve();
        FIREBASE_SCRIPTS.forEach((src) => {
            chain = chain.then(() => this.loadScript(src));
        });
        return chain;
    }

    private loadScript(src: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const scripts = document.getElementsByTagName("script");
            for (let i = 0; i < scripts.length; i++) {
                if (scripts[i].src === src) {
                    resolve();
                    return;
                }
            }
            const script = document.createElement("script");
            script.src = src;
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Failed to load ${src}`));
            document.head.appendChild(script);
        });
    }

    private onAuthChanged(user: any) {
        this.currentUser = user;
        if (!user) {
            this.bestUploadedScore = 0;
            this.authMessage = "Not signed in.";
            this.refreshCurrentOverlay();
            return;
        }

        if (user.email) cc.sys.localStorage.setItem("webMarioEmail", user.email);
        this.authMessage = `Signed in as ${this.displayName()}.`;
        this.loadUserCloudScore();
        this.loadScoreboard();
        this.refreshCurrentOverlay();
    }

    private registerAccount() {
        if (!this.requireFirebase()) return;
        this.captureAuthInputs();
        const email = this.inputValue(this.authInputs.email);
        const password = this.inputValue(this.authInputs.password);
        const name = this.cleanName(this.inputValue(this.authInputs.name));
        if (!email || !password || !name) {
            this.authMessage = "Email, password, and display name are required.";
            this.showOverlay("auth");
            return;
        }
        if (password.length < 6) {
            this.authMessage = "Password must be at least 6 characters.";
            this.showOverlay("auth");
            return;
        }

        this.authMessage = "Registering account...";
        this.showOverlay("auth");
        this.firebaseAuth.createUserWithEmailAndPassword(email, password)
            .then((credential: any) => this.saveProfileName(credential.user, name))
            .then(() => {
                cc.sys.localStorage.setItem("webMarioDisplayName", name);
                this.authMessage = "Account created. Your scores will upload automatically.";
                this.showOverlay("auth");
            })
            .catch((err: any) => {
                this.authMessage = this.firebaseErrorText(err);
                this.showOverlay("auth");
            });
    }

    private loginAccount() {
        if (!this.requireFirebase()) return;
        this.captureAuthInputs();
        const email = this.inputValue(this.authInputs.email);
        const password = this.inputValue(this.authInputs.password);
        const name = this.cleanName(this.inputValue(this.authInputs.name));
        if (!email || !password) {
            this.authMessage = "Email and password are required.";
            this.showOverlay("auth");
            return;
        }

        this.authMessage = "Signing in...";
        this.showOverlay("auth");
        this.firebaseAuth.signInWithEmailAndPassword(email, password)
            .then((credential: any) => name ? this.saveProfileName(credential.user, name) : null)
            .then(() => {
                if (name) cc.sys.localStorage.setItem("webMarioDisplayName", name);
                this.authMessage = "Signed in. Your score can now be uploaded.";
                this.showOverlay("auth");
            })
            .catch((err: any) => {
                this.authMessage = this.firebaseErrorText(err);
                this.showOverlay("auth");
            });
    }

    private logoutAccount() {
        if (!this.requireFirebase()) return;
        this.firebaseAuth.signOut()
            .then(() => {
                this.authMessage = "Signed out.";
                this.showOverlay("auth");
            })
            .catch((err: any) => {
                this.authMessage = this.firebaseErrorText(err);
                this.showOverlay("auth");
            });
    }

    private saveProfileName(user: any, name: string): Promise<void> {
        if (!user || !name) return Promise.resolve();
        const firebase = (window as any).firebase;
        const profileScore = Math.max(0, this.bestUploadedScores.all || 0, this.score);
        this.bestUploadedScores.all = profileScore;
        this.bestUploadedScore = profileScore;
        return user.updateProfile({ displayName: name })
            .then(() => {
                const updates = this.scoreScopes().map((scope) => {
                    const ref = this.firestore.collection(this.scopeCollection(scope)).doc(user.uid);
                    return ref.get().then((doc: any) => {
                        if (doc.exists) {
                            return ref.set({
                                uid: user.uid,
                                name,
                                scope: this.scopeCollection(scope),
                                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                            }, { merge: true });
                        }
                        if (scope !== "all") return Promise.resolve();
                        return ref.set({
                            uid: user.uid,
                            name,
                            scope: this.scopeCollection(scope),
                            score: profileScore,
                            coins: profileScore === this.score ? this.coinCount : 0,
                            world: profileScore === this.score && this.levels[this.levelIndex] ? this.levels[this.levelIndex].name : "-",
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        }, { merge: true });
                    });
                });
                return Promise.all(updates).then(() => undefined);
            });
    }

    private loadUserCloudScore() {
        if (!this.firestore || !this.currentUser) return;
        const loads = this.scoreScopes().map((scope) => {
            return this.firestore.collection(this.scopeCollection(scope)).doc(this.currentUser.uid).get()
                .then((doc: any) => {
                    const data = doc.exists ? doc.data() : null;
                    this.bestUploadedScores[scope] = data && typeof data.score === "number" ? data.score : 0;
                });
        });
        Promise.all(loads)
            .then(() => {
                this.bestUploadedScore = this.bestUploadedScores.all || 0;
                this.submitScoreIfEligible();
            })
            .catch((err: any) => {
                this.firebaseMessage = this.firebaseErrorText(err);
            });
    }

    private loadScoreboard() {
        if (!this.firestore) {
            this.scoreboardMessage = this.firebaseMessage;
            this.refreshCurrentOverlay();
            return;
        }

        this.scoreboardMessage = "Loading scoreboard...";
        this.firestore.collection(this.scopeCollection(this.scoreboardScope)).orderBy("score", "desc").limit(10).get()
            .then((snapshot: any) => {
                this.topScores = [];
                snapshot.forEach((doc: any) => {
                    const data = doc.data();
                    this.topScores.push({
                        uid: data.uid || doc.id,
                        name: this.cleanName(data.name || "Player"),
                        score: Number(data.score || 0),
                        coins: Number(data.coins || 0),
                        world: data.world || "-"
                    });
                });
                this.scoreboardMessage = this.topScores.length ? "" : `No ${this.scoreboardTitle(this.scoreboardScope)} scores yet.`;
                this.refreshCurrentOverlay();
            })
            .catch((err: any) => {
                this.topScores = [];
                this.scoreboardMessage = this.firebaseErrorText(err);
                this.refreshCurrentOverlay();
            });
    }

    private submitScoreIfEligible() {
        if (!this.firestore || !this.currentUser) return;
        const firebase = (window as any).firebase;
        const uploadScore = this.score;
        const scopes = ["all", this.scoreScopeForLevel()] as ScoreUploadScope[];
        scopes.forEach((scope) => {
            if (uploadScore <= (this.bestUploadedScores[scope] || 0)) return;
            this.bestUploadedScores[scope] = uploadScore;
            if (scope === "all") {
                this.bestUploadedScore = uploadScore;
            }
            const entry = {
                uid: this.currentUser.uid,
                name: this.displayName(),
                scope: this.scopeCollection(scope),
                score: uploadScore,
                coins: this.coinCount,
                world: this.levels[this.levelIndex] ? this.levels[this.levelIndex].name : "-",
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            this.firestore.collection(this.scopeCollection(scope)).doc(this.currentUser.uid).set(entry, { merge: true })
                .then(() => {
                    this.scoreboardMessage = "Score uploaded.";
                    if (this.state === "scores") this.loadScoreboard();
                })
                .catch((err: any) => {
                    this.firebaseMessage = this.firebaseErrorText(err);
                });
        });
    }

    private requireFirebase() {
        if (this.firebaseReady) return true;
        this.authMessage = this.firebaseMessage;
        this.showOverlay("auth");
        return false;
    }

    private refreshCurrentOverlay() {
        if (!this.overlay || !this.overlay.active) return;
        if (this.state === "menu" || this.state === "auth" || this.state === "scores") this.showOverlay(this.state);
    }

    private inputValue(input?: any) {
        if (!input) return "";
        if (typeof (input as any).value === "string") return String((input as any).value || "").trim();
        return String((input as any).string || "").trim();
    }

    private captureAuthInputs() {
        if (this.authInputs.email) this.captureAuthInput("email", this.authInputs.email);
        if (this.authInputs.password) this.captureAuthInput("password", this.authInputs.password);
        if (this.authInputs.name) this.captureAuthInput("name", this.authInputs.name);
    }

    private scoreScopes(): ScoreUploadScope[] {
        return ["all", "world1", "world2"];
    }

    private scopeCollection(scope: ScoreUploadScope) {
        if (scope === "world1") return "scores_world_1_1";
        if (scope === "world2") return "scores_world_1_2";
        return "scores";
    }

    private scoreboardTitle(scope: ScoreScope) {
        if (scope === "world1") return "World 1-1";
        return "World 1-2";
    }

    private scoreScopeForLevel(): ScoreScope {
        return this.levelIndex === 0 ? "world1" : "world2";
    }

    private cleanName(name: string) {
        return (name || "Player").replace(/[<>]/g, "").trim().slice(0, 20) || "Player";
    }

    private displayName() {
        if (this.currentUser && this.currentUser.displayName) return this.cleanName(this.currentUser.displayName);
        if (this.currentUser && this.currentUser.email) return this.cleanName(String(this.currentUser.email).split("@")[0]);
        return this.cleanName(cc.sys.localStorage.getItem("webMarioDisplayName") || "Player");
    }

    private accountSummary() {
        if (this.currentUser) return `Signed in: ${this.displayName()}. Cloud best: ${this.bestUploadedScores.all || this.bestUploadedScore}`;
        return this.firebaseReady ? "Not signed in. Register to upload scores." : this.firebaseMessage;
    }

    private firebaseErrorText(err: any) {
        const code = err && err.code ? err.code : "";
        const message = err && err.message ? err.message : String(err || "Firebase error");
        if (code === "auth/configuration-not-found") return "Enable Firebase Auth Email/Password in Console first.";
        if (code === "auth/operation-not-allowed") return "Enable Email/Password sign-in in Firebase Authentication.";
        if (code === "permission-denied" || code === "firestore/permission-denied") return "Firestore permission denied. Deploy firestore.rules.";
        if (message.indexOf("PERMISSION_DENIED") >= 0) return "Firestore permission denied. Deploy firestore.rules.";
        if (message.indexOf("not been used") >= 0 || message.indexOf("not enabled") >= 0) return "Enable Cloud Firestore in Firebase Console.";
        return message.replace(/^Firebase:\s*/, "").slice(0, 140);
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

    private createPlayer(x: number, y: number, slot: PlayerSlot, fallbackColor: cc.Color): PlayerData {
        const node = this.entityNode(slot === "p1" ? "Mario P1" : "Mario P2", this.getMarioFrame(false, 0), SMALL_W, SMALL_H, fallbackColor);
        if (slot === "p2") this.tintEntity(node, new cc.Color(118, 205, 255));
        node.setPosition(x, y);
        this.world.addChild(node);
        return { slot, x, y, w: SMALL_W, h: SMALL_H, vx: 0, vy: 0, facing: 1, onGround: false, big: false, crouching: false, jumpsUsed: 0, jumpQueued: false, fastFallQueued: false, invincible: 0, anim: 0, node };
    }

    private updatePlayer(dt: number, p: PlayerData) {
        if (!p) return;
        p.anim += dt;
        p.invincible = Math.max(0, p.invincible - dt);
        const controls = this.playerControls(p);
        this.updateCrouchState(p, controls.down);

        const crouchLocked = p.crouching && p.onGround;
        const accel = crouchLocked ? RUN_ACCEL * 0.28 : RUN_ACCEL;
        if (controls.left) { p.vx -= accel * dt; p.facing = -1; }
        if (controls.right) { p.vx += accel * dt; p.facing = 1; }
        if (!controls.left && !controls.right) p.vx -= Math.sign(p.vx) * Math.min(Math.abs(p.vx), FRICTION * dt);
        const maxRun = crouchLocked ? CROUCH_MAX_RUN : MAX_RUN;
        p.vx = cc.misc.clampf(p.vx, -maxRun, maxRun);

        if (p.jumpQueued) {
            this.tryJump(p);
            p.jumpQueued = false;
        }

        if (p.fastFallQueued && !p.onGround) {
            p.vy = Math.min(p.vy, -FAST_FALL_V);
            this.spawnText("FAST", p.x + 4, p.y + p.h + 12, new cc.Color(170, 226, 255));
        }
        p.fastFallQueued = false;

        const fastFalling = controls.down && !p.onGround && p.vy < 0;
        const fallLimit = fastFalling ? FAST_FALL_V : MAX_FALL;
        const gravity = fastFalling ? FAST_FALL_GRAVITY : GRAVITY;
        p.vy = Math.max(-fallLimit, p.vy - gravity * dt);
        p.x += p.vx * dt;
        this.resolvePlayer(p, "x");
        p.y += p.vy * dt;
        p.onGround = false;
        this.resolvePlayer(p, "y");
        this.updateCrouchState(p, controls.down);
        p.x = cc.misc.clampf(p.x, 0, this.levels[this.levelIndex].width - p.w);
        p.node.setPosition(p.x, p.y);
        p.node.opacity = p.invincible > 0 && Math.floor(p.invincible * 14) % 2 === 0 ? 90 : 255;
        this.updatePlayerSprite(p);
    }

    private tryJump(p: PlayerData) {
        if (p.onGround) {
            if (p.crouching && this.canStand(p)) this.setPlayerPose(p, false);
            p.vy = JUMP_V;
            p.onGround = false;
            p.jumpsUsed = 1;
            this.playEffect("jump");
            return;
        }

        if (p.jumpsUsed < 2) {
            p.vy = DOUBLE_JUMP_V;
            p.jumpsUsed = 2;
            this.spawnSmoke(p.x + p.w / 2, p.y + 8);
            this.playEffect("jump");
        }
    }

    private updateCrouchState(p: PlayerData, down: boolean) {
        if (!p) return;
        const shouldCrouch = down && p.onGround;
        if (shouldCrouch) {
            this.setPlayerPose(p, true);
        } else if (p.crouching && this.canStand(p)) {
            this.setPlayerPose(p, false);
        }
    }

    private setPlayerPose(p: PlayerData, crouching: boolean) {
        const size = this.playerSize(p.big, crouching);
        p.crouching = crouching;
        p.w = size.w;
        p.h = size.h;
        p.node.setContentSize(p.w, p.h);
        this.setEntityFrame(p.node, this.getMarioFrame(p.big, crouching ? 14 : 0), p.w, p.h, p.facing < 0);
    }

    private playerSize(big: boolean, crouching: boolean) {
        return {
            w: big ? BIG_W : SMALL_W,
            h: crouching ? (big ? BIG_CROUCH_H : SMALL_CROUCH_H) : (big ? BIG_H : SMALL_H)
        };
    }

    private canStand(p: PlayerData) {
        const normal = this.playerSize(p.big, false);
        const probe = { x: p.x, y: p.y, w: normal.w, h: normal.h };
        return !this.levels[this.levelIndex].solids.some((s) => this.overlap(probe, s));
    }

    private playerControls(p: PlayerData) {
        if (p.slot === "p2") {
            return {
                left: !!this.keys[KEY_J],
                right: !!this.keys[KEY_L],
                down: !!this.keys[KEY_K]
            };
        }
        return {
            left: !!(this.keys[cc.macro.KEY.a] || this.keys[cc.macro.KEY.left]),
            right: !!(this.keys[cc.macro.KEY.d] || this.keys[cc.macro.KEY.right]),
            down: !!(this.keys[cc.macro.KEY.s] || this.keys[cc.macro.KEY.down])
        };
    }

    private resolvePlayer(p: PlayerData, axis: "x" | "y") {
        this.levels[this.levelIndex].solids.forEach((s) => {
            if (!this.overlap(p, s)) return;
            if (axis === "x") {
                if (s.kind === "question" && this.isHeadTouchingQuestion(p, s)) this.hitQuestion(s);
                if (p.vx > 0) p.x = s.x - p.w;
                else if (p.vx < 0) p.x = s.x + s.w;
                p.vx = 0;
            } else {
                if (p.vy < 0) {
                    p.y = s.y + s.h;
                    p.vy = 0;
                    p.onGround = true;
                    p.jumpsUsed = 0;
                } else if (p.vy > 0) {
                    p.y = s.y - p.h;
                    p.vy = -70;
                    if (s.kind === "question") this.hitQuestion(s);
                }
            }
        });
    }

    private isHeadTouchingQuestion(p: PlayerData, block: RectData) {
        return p.vy >= 0 && p.y + p.h > block.y && p.y + p.h < block.y + 18;
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
            this.activePlayers().some((p) => {
                if (e.dead || !this.overlap(p, e)) return false;
                if (p.vy < -110 && p.y < e.y + e.h) {
                    e.dead = true;
                    e.node.destroy();
                    p.vy = 430;
                    this.score += e.type === "turtle" ? 300 : 200;
                    this.spawnSmoke(e.x + e.w / 2, e.y + e.h / 2);
                    this.spawnText(e.type === "turtle" ? "+300" : "+200", e.x, e.y + 52, cc.Color.WHITE);
                    this.playEffect("stomp");
                } else {
                    this.hurt(false, p);
                }
                return true;
            });
        });
    }

    private updateItems(dt: number) {
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
            const receiver = this.activePlayers().filter((p) => this.overlap(p, item))[0];
            if (receiver) {
                item.node.destroy();
                item.taken = true;
                this.powerUp(receiver);
            }
        });
        this.items = this.items.filter((i) => !i.taken);
    }

    private updateCoins() {
        this.levels[this.levelIndex].coins.forEach((coin) => {
            if (coin.taken) return;
            if (this.activePlayers().some((p) => this.overlap(p, { x: coin.x, y: coin.y, w: 28, h: 28 }))) {
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

    private keepPlayer2OnCamera() {
        if (!this.player2) return;
        const p = this.player2;
        const left = this.cameraX + 8;
        const right = this.cameraX + VIEW_W - p.w - 8;
        const nextX = cc.misc.clampf(p.x, left, right);
        if (nextX !== p.x) {
            p.x = nextX;
            p.vx = 0;
            p.node.setPosition(p.x, p.y);
        }
    }

    private activePlayers() {
        const players: PlayerData[] = [];
        if (this.player) players.push(this.player);
        if (this.player2) players.push(this.player2);
        return players;
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

    private hurt(forceDeath: boolean, p: PlayerData = this.player) {
        if (!p) return;
        if (!forceDeath && p.invincible > 0) return;
        if (!forceDeath && p.big) {
            p.big = false;
            this.setPlayerPose(p, false);
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
        const spawnOffset = p.slot === "p2" ? 56 : 0;
        p.x = spawn.x + spawnOffset; p.y = spawn.y; p.vx = 0; p.vy = 0; p.invincible = 1.8; p.jumpsUsed = 0;
        this.setPlayerPose(p, false);
    }

    private powerUp(p: PlayerData) {
        if (!p.big) {
            p.big = true;
            this.setPlayerPose(p, p.crouching);
        }
        this.score += 500;
        this.spawnText("POWER UP", p.x - 18, p.y + p.h + 22, new cc.Color(255, 224, 112));
        this.playEffect("power");
    }

    private overlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
        return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    }

    private onKeyDown(event: cc.Event.EventKeyboard) {
        const wasDown = this.keys[event.keyCode];
        this.keys[event.keyCode] = true;
        if (!wasDown && this.state === "playing") {
            if (this.player && this.isP1JumpKey(event.keyCode)) this.player.jumpQueued = true;
            if (this.player2 && this.isP2JumpKey(event.keyCode)) this.player2.jumpQueued = true;
            if (this.player && this.isP1DownKey(event.keyCode)) this.player.fastFallQueued = true;
            if (this.player2 && this.isP2DownKey(event.keyCode)) this.player2.fastFallQueued = true;
        }
        if (event.keyCode === cc.macro.KEY.p && this.state === "playing") this.showOverlay("paused");
        if (event.keyCode === cc.macro.KEY.b && (this.state === "playing" || this.state === "paused")) this.openScoreboard("paused");
    }

    private onKeyUp(event: cc.Event.EventKeyboard) {
        this.keys[event.keyCode] = false;
    }

    private isP1JumpKey(keyCode: number) {
        return keyCode === cc.macro.KEY.w || keyCode === cc.macro.KEY.up || keyCode === cc.macro.KEY.space;
    }

    private isP2JumpKey(keyCode: number) {
        return keyCode === KEY_I;
    }

    private isP1DownKey(keyCode: number) {
        return keyCode === cc.macro.KEY.s || keyCode === cc.macro.KEY.down;
    }

    private isP2DownKey(keyCode: number) {
        return keyCode === KEY_K;
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
        if (fallback) {
            fallback.setContentSize(w, h);
            this.repaintRect(fallback, fallback.color);
        }
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

    private tintEntity(node: cc.Node, tint: cc.Color) {
        const visual = node.getChildByName("Visual");
        if (visual) visual.color = tint;
    }

    private getMarioFrame(big: boolean, index: number): cc.SpriteFrame {
        const atlasKey = big ? "marioBig" : "marioSmall";
        const prefix = big ? "mario_big" : "mario_small";
        return this.atlasFrame(atlasKey, `${prefix}_${index}`) || this.atlasFrame(atlasKey, `${prefix}_0`);
    }

    private updatePlayerSprite(p: PlayerData) {
        let index = 0;
        if (p.crouching && p.onGround) index = 14;
        else if (!p.onGround) index = 5;
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
