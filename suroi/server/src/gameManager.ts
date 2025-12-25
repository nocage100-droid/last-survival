import { TeamMode } from "@common/constants";
import { ModeName } from "@common/definitions/modes";
import { pickRandomInArray } from "@common/utils/random";
import Cluster, { type Worker } from "node:cluster";
import { Game } from "./game";
import { PlayerSocketData } from "./objects/player";
import { resetTeams } from "./server";
import { Config } from "./utils/config";
import { modeFromMap } from "./utils/misc";
import { getIP, getPunishment, parseRole, RateLimiter, serverLog, serverWarn, StaticOrSwitched, Switcher } from "./utils/serverHelpers";
import { AIBotManager } from "./plugins/aiBotPlugin";
import { initSettings, setAutoSpawnBotCount, getAutoSpawnBotCount } from "./utils/adminSettings";

export enum WorkerMessages {
    UpdateTeamMode,
    UpdateMap,
    UpdateMapOptions,
    NewGame
}

export type WorkerMessage =
    | {
        readonly type: WorkerMessages.UpdateTeamMode
        readonly teamMode: TeamMode
    }
    | {
        readonly type: WorkerMessages.UpdateMap
        readonly map: string
    }
    | {
        readonly type: WorkerMessages.UpdateMapOptions
        readonly mapScaleRange: number
    }
    | {
        readonly type: WorkerMessages.NewGame
    };

export interface GameData {
    aliveCount: number
    allowJoin: boolean
    over: boolean
    startedTime: number
}

export class GameContainer {
    readonly worker: Worker;

    readonly promiseCallbacks: Array<(game: GameContainer) => void> = [];

    private _data: GameData = {
        aliveCount: 0,
        allowJoin: false,
        over: false,
        startedTime: -1
    };

    get aliveCount(): number { return this._data.aliveCount; }
    get allowJoin(): boolean { return this._data.allowJoin; }
    get over(): boolean { return this._data.over; }
    get startedTime(): number { return this._data.startedTime; }

    constructor(
        readonly id: number,
        gameManager: GameManager,
        resolve: (game: GameContainer) => void
    ) {
        this.promiseCallbacks.push(resolve);
        this.worker = Cluster.fork({
            id,
            teamMode: gameManager.teamMode.current,
            map: gameManager.map.current,
            mapScaleRange: gameManager.mapScaleRange
        }).on("message", (data: Partial<GameData>): void => {
            this._data = { ...this._data, ...data };

            if (data.allowJoin === true) { // This means the game was just created
                gameManager.creating = undefined;
                for (const resolve of this.promiseCallbacks) resolve(this);
                this.promiseCallbacks.length = 0;
            }
        });
    }

    sendMessage(message: WorkerMessage): void {
        this.worker.send(message);
    }
}

export class GameManager {
    readonly games: Array<GameContainer | undefined> = [];
    creating: GameContainer | undefined;

    get playerCount(): number {
        return this.games.filter(g => !g?.over).reduce((a, b) => (a + (b?.aliveCount ?? 0)), 0);
    }

    teamMode: Switcher<TeamMode>;
    map: Switcher<string>;
    mode: ModeName;
    nextMode?: ModeName;
    mapScaleRange = -1;

    constructor() {
        const stringToTeamMode = (teamMode: string): TeamMode => {
            switch (teamMode) {
                case "solo": default: return TeamMode.Solo;
                case "duo": return TeamMode.Duo;
                case "squad": return TeamMode.Squad;
            }
        };

        let teamModeSchedule: StaticOrSwitched<TeamMode>;
        if (typeof Config.teamMode === "string") {
            teamModeSchedule = stringToTeamMode(Config.teamMode);
        } else {
            const { rotation, cron } = Config.teamMode;
            teamModeSchedule = { rotation: rotation.map(t => stringToTeamMode(t)), cron };
        }

        const humanReadableTeamModes = {
            [TeamMode.Solo]: "solos",
            [TeamMode.Duo]: "duos",
            [TeamMode.Squad]: "squads"
        };

        this.teamMode = new Switcher("teamMode", teamModeSchedule, teamMode => {
            for (const game of this.games) {
                game?.sendMessage({ type: WorkerMessages.UpdateTeamMode, teamMode });
            }

            resetTeams();

            serverLog(`Switching to ${humanReadableTeamModes[teamMode] ?? `team mode ${teamMode}`}`);
        });

        this.map = new Switcher("map", Config.map, (map, nextMap) => {
            this.mode = modeFromMap(map);
            this.nextMode = modeFromMap(nextMap);

            for (const game of this.games) {
                game?.sendMessage({ type: WorkerMessages.UpdateMap, map });
            }

            resetTeams();

            serverLog(`Switching to "${map}" map`);
        });

        this.mode = modeFromMap(this.map.current);
        this.nextMode = this.map.next ? modeFromMap(this.map.next) : undefined;
    }

    async findGame(): Promise<number | undefined> {
        if (this.creating) return this.creating.id;

        const eligibleGames = this.games.filter((g?: GameContainer): g is GameContainer =>
            // biome-ignore lint/complexity/useOptionalChain: can't use an optional chain because the return type must be a boolean
            g !== undefined
            && g.allowJoin
            && g.aliveCount < (Config.maxPlayersPerGame ?? Infinity)
        );

        return (
            eligibleGames.length
                ? pickRandomInArray(eligibleGames)
                : await this.newGame(undefined)
        )?.id;
    }

    newGame(id: number | undefined): Promise<GameContainer | undefined> {
        return new Promise<GameContainer | undefined>(resolve => {
            if (this.creating) {
                this.creating.promiseCallbacks.push(resolve);
            } else if (id !== undefined) {
                serverLog(`Creating new game with ID ${id}`);
                const game = this.games[id];
                if (!game) {
                    this.creating = this.games[id] = new GameContainer(id, this, resolve);
                } else if (game.over) {
                    game.promiseCallbacks.push(resolve);
                    game.sendMessage({ type: WorkerMessages.NewGame });
                    this.creating = game;
                } else {
                    serverWarn(`Game with ID ${id} already exists`);
                    resolve(game);
                }
            } else {
                const maxGames = Config.maxGames;
                for (let i = 0; i < maxGames; i++) {
                    const game = this.games[i];
                    serverLog(
                        "Game", i,
                        "exists:", !!game,
                        "over:", game?.over ?? "-",
                        "runtime:", game ? `${Math.round((Date.now() - (game.startedTime ?? 0)) / 1000)}s` : "-",
                        "aliveCount:", game?.aliveCount ?? "-"
                    );
                    if (!game || game.over) {
                        void this.newGame(i).then(resolve);
                        return;
                    }
                }
                serverWarn("Unable to create new game, no slots left");
                resolve(undefined);
            }
        });
    }

    updateMapScaleRange(): void {
        const mapScaleRanges = Config.mapScaleRanges;
        if (!mapScaleRanges) return;

        const playerCount = this.playerCount;
        this.mapScaleRange = -1;
        for (let i = 0, len = mapScaleRanges.length; i < len; i++) {
            const { minPlayers, maxPlayers } = mapScaleRanges[i];
            if (playerCount < minPlayers || playerCount > maxPlayers) continue;
            this.mapScaleRange = i;
        }

        for (const game of this.games) {
            game?.sendMessage({ type: WorkerMessages.UpdateMapOptions, mapScaleRange: this.mapScaleRange });
        }
    }
}

if (!Cluster.isPrimary) {
    const data = process.env as {
        readonly id: string
        readonly teamMode: string
        readonly map: string
        readonly mapScaleRange: string
    };
    const id = parseInt(data.id);
    let teamMode = parseInt(data.teamMode);
    let map = data.map;
    let mapOptions = data.mapScaleRange ? Config.mapScaleRanges?.[parseInt(data.mapScaleRange)] : undefined;

    // 🔧 저장된 관리자 설정 로드
    initSettings();

    let game = new Game(id, teamMode, map, mapOptions);

    // 🤖 첫 번째 게임에도 자동 봇 투입
    const initialAutoBotCount = (global as any).autoSpawnBotCount || 0;
    if (initialAutoBotCount > 0) {
        game.log(`[자동봇] 첫 게임 시작 - ${initialAutoBotCount}개의 AI 봇을 자동 투입합니다.`);
        setTimeout(() => {
            try {
                const botManager = AIBotManager.getInstance();
                botManager.setGame(game);
                botManager.addBot(initialAutoBotCount);
            } catch (e) {
                game.error("[자동봇] 첫 게임 봇 생성 실패:", e);
            }
        }, 3000); // 맵 로딩 대기
    }

    // ========================================
    // 🤖 목표 지향적 AI 봇 시스템
    // ========================================
    interface AIBotState {
        player: ReturnType<typeof game.addPlayer>;
        targetPlayer: ReturnType<typeof game.addPlayer> | null;
        targetObstacle: any | null;
        targetLoot: any | null;
        wanderDirection: number;
        wanderTimer: number;
        attackCooldown: number;
        actionCooldown: number;
        state: "wander" | "chase" | "attack" | "flee" | "loot" | "break";
        lastActionTime: number;
        // 목표 지향 필드
        hasGun: boolean;
        needsWeapon: boolean;  // 무기가 필요한지
        lastObstaclePos: { x: number; y: number } | null;  // 마지막 장애물 위치 기억
        stuckTimer: number;  // 막힌 시간 추적
        lastPos: { x: number; y: number };  // 이전 위치 (막힘 감지용)
    }

    const aiBots: Map<number, AIBotState> = new Map();

    function updateAIBots(dt: number): void {
        for (const [botId, bot] of aiBots) {
            if (!bot.player || bot.player.dead || bot.player.disconnected) {
                aiBots.delete(botId);
                continue;
            }

            // 타이머 감소
            bot.wanderTimer -= dt;
            bot.attackCooldown -= dt;
            bot.actionCooldown -= dt;

            const pos = bot.player.position;
            const movement = bot.player.movement;

            // 1️⃣ 가장 가까운 적 찾기
            let closestPlayer: typeof bot.player | null = null;
            let closestPlayerDist = 80;

            for (const otherPlayer of game.livingPlayers) {
                if (otherPlayer === bot.player || otherPlayer.dead) continue;
                if (otherPlayer.name.startsWith("AI봇_")) continue;

                const dist = getDistance(pos, otherPlayer.position);
                if (dist < closestPlayerDist) {
                    closestPlayerDist = dist;
                    closestPlayer = otherPlayer;
                }
            }

            // 2️⃣ 가장 가까운 루트(아이템) 찾기
            let closestLoot: any = null;
            let closestLootDist = 30;

            try {
                // game.loot가 있으면 순회
                const lootItems = (game as any).loot || [];
                for (const obj of lootItems) {
                    if (obj && !obj.dead && obj.position) {
                        const dist = getDistance(pos, obj.position);
                        if (dist < closestLootDist) {
                            closestLootDist = dist;
                            closestLoot = obj;
                        }
                    }
                }
            } catch (e) {
                // 루트 검색 실패 시 무시
            }

            // 3️⃣ 가장 가까운 부술 수 있는 장애물 찾기
            let closestObstacle: any = null;
            let closestObstacleDist = 15;
            let blockingObstacle: any = null;

            try {
                // game.obstacles가 있으면 순회
                const obstacles = (game as any).obstacles || [];
                for (const obj of obstacles) {
                    if (!obj || obj.dead || !obj.position) continue;
                    const dist = getDistance(pos, obj.position);

                    // 부술 수 있는 장애물 (상자, 나무통, 문 등)
                    const def = obj.definition;
                    if (def && (def.material === "wood" || def.material === "cardboard" ||
                        def.idString?.includes("crate") || def.idString?.includes("barrel") ||
                        def.idString?.includes("door"))) {
                        if (dist < closestObstacleDist) {
                            closestObstacleDist = dist;
                            closestObstacle = obj;
                        }
                    }

                    // 막고 있는 장애물 감지 (이동 방향에 있는 장애물)
                    if (dist < 5 && def && !def.noCollisions) {
                        blockingObstacle = obj;
                    }
                }
            } catch (e) {
                // 장애물 검색 실패 시 무시
            }

            bot.targetPlayer = closestPlayer;
            bot.targetObstacle = closestObstacle;
            bot.targetLoot = closestLoot;

            // 🎯 무기 보유 여부 확인
            try {
                const inv = bot.player.inventory;
                bot.hasGun = !!(inv?.getWeapon(0) || inv?.getWeapon(1));
                bot.needsWeapon = !bot.hasGun;
            } catch (e) {
                bot.needsWeapon = true;
            }

            // 🚧 막힘 감지 - 움직이지 않으면 방향 전환
            const moved = getDistance(pos, bot.lastPos) > 0.5;
            if (!moved) {
                bot.stuckTimer += dt;
                if (bot.stuckTimer > 500) {
                    // 막혔으면 방향 변경
                    bot.wanderDirection = Math.random() * Math.PI * 2;
                    bot.stuckTimer = 0;
                }
            } else {
                bot.stuckTimer = 0;
            }
            bot.lastPos = { x: pos.x, y: pos.y };

            // 4️⃣ 상태 결정 (우선순위 개선)
            // 무기가 없으면 루트/상자 파괴 우선!
            if (closestPlayer && closestPlayerDist < 30 && bot.hasGun) {
                // 총이 있을 때만 적극적으로 싸움
                if (bot.player.health < 25) {
                    bot.state = "flee";
                } else if (closestPlayerDist < 15) {
                    bot.state = "attack";
                } else {
                    bot.state = "chase";
                }
            } else if (closestPlayer && closestPlayerDist < 10) {
                // 너무 가까우면 무조건 싸움
                bot.state = "attack";
            } else if (closestLoot && closestLootDist < 8) {
                // 아이템이 아주 가까우면 즉시 획득!
                bot.state = "loot";
            } else if (bot.needsWeapon && closestObstacle) {
                // 무기 없으면 상자 부수기 우선!
                bot.state = "break";
                bot.lastObstaclePos = closestObstacle.position ?
                    { x: closestObstacle.position.x, y: closestObstacle.position.y } : null;
            } else if (closestLoot && closestLootDist < 20) {
                // 아이템 줍기
                bot.state = "loot";
            } else if (closestObstacle && closestObstacleDist < 25) {
                // 근처 상자 파괴
                bot.state = "break";
            } else {
                bot.state = "wander";
            }

            // 5️⃣ 상태에 따른 행동
            switch (bot.state) {
                case "wander": {
                    if (bot.wanderTimer <= 0) {
                        bot.wanderDirection = Math.random() * Math.PI * 2;
                        bot.wanderTimer = 1500 + Math.random() * 2000;
                    }
                    setMovementFromAngle(movement, bot.wanderDirection);
                    bot.player.rotation = bot.wanderDirection;
                    stopAttacking(bot);

                    // 배회 중 주변 상자 탐색 - 가끔 공격
                    if (bot.actionCooldown <= 0 && Math.random() < 0.1) {
                        startAttacking(bot);
                        bot.actionCooldown = 500;
                    }
                    break;
                }

                case "chase": {
                    if (bot.targetPlayer) {
                        const angle = getAngleTo(pos, bot.targetPlayer.position);
                        setMovementFromAngle(movement, angle);
                        bot.player.rotation = angle;

                        // 추격 중에도 공격 시도
                        if (closestPlayerDist < 30 && bot.attackCooldown <= 0) {
                            startAttacking(bot);
                            bot.attackCooldown = 150 + Math.random() * 150;
                        } else {
                            stopAttacking(bot);
                        }
                    }
                    break;
                }

                case "attack": {
                    if (bot.targetPlayer) {
                        const angle = getAngleTo(pos, bot.targetPlayer.position);
                        bot.player.rotation = angle;

                        // 연속 공격
                        if (bot.attackCooldown <= 0) {
                            startAttacking(bot);
                            bot.attackCooldown = 100 + Math.random() * 150;
                        }

                        // 거리 조절 - 가까우면 뒤로, 멀면 앞으로
                        if (closestPlayerDist < 5) {
                            setMovementFromAngle(movement, angle + Math.PI);
                        } else if (closestPlayerDist > 10) {
                            setMovementFromAngle(movement, angle);
                        } else {
                            // 옆으로 이동 (스트레이핑)
                            setMovementFromAngle(movement, angle + (Math.random() > 0.5 ? Math.PI / 2 : -Math.PI / 2));
                        }
                    }
                    break;
                }

                case "flee": {
                    if (bot.targetPlayer) {
                        const angle = getAngleTo(pos, bot.targetPlayer.position);
                        setMovementFromAngle(movement, angle + Math.PI); // 반대 방향
                        bot.player.rotation = angle + Math.PI;
                        stopAttacking(bot);
                    }
                    if (bot.player.health > 50) bot.state = "wander";
                    break;
                }

                case "break": {
                    if (bot.targetObstacle && !bot.targetObstacle.dead) {
                        const obstaclePos = bot.targetObstacle.position;
                        const angle = getAngleTo(pos, obstaclePos);
                        bot.player.rotation = angle;

                        const dist = getDistance(pos, obstaclePos);

                        if (dist < 4) {
                            // 장애물에 충분히 가까움 - 빠르게 연속 공격!
                            startAttacking(bot);
                            bot.attackCooldown = 80; // 빠른 공격
                            // 멈추지 않고 조금씩 움직이며 공격
                            if (Math.random() > 0.7) {
                                setMovementFromAngle(movement, angle + (Math.random() - 0.5));
                            } else {
                                movement.up = movement.down = movement.left = movement.right = false;
                            }
                        } else {
                            // 장애물로 빠르게 이동
                            setMovementFromAngle(movement, angle);
                            // 이동하면서도 가끔 공격
                            if (dist < 8 && bot.attackCooldown <= 0) {
                                startAttacking(bot);
                                bot.attackCooldown = 150;
                            } else {
                                stopAttacking(bot);
                            }
                        }
                    } else {
                        // 장애물이 없거나 부서졌으면 아이템 찾기
                        bot.targetObstacle = null;
                        if (bot.lastObstaclePos) {
                            // 마지막 상자 위치 근처에서 아이템 찾기
                            bot.state = "loot";
                        } else {
                            bot.state = "wander";
                        }
                    }
                    break;
                }

                case "loot": {
                    if (bot.targetLoot && !bot.targetLoot.dead) {
                        const lootPos = bot.targetLoot.position;
                        const angle = getAngleTo(pos, lootPos);
                        const dist = getDistance(pos, lootPos);

                        // 빠르게 아이템으로 이동
                        setMovementFromAngle(movement, angle);
                        bot.player.rotation = angle;

                        if (dist < 2.5) {
                            // 루트 수집!
                            try {
                                if (typeof bot.targetLoot.interact === 'function') {
                                    bot.targetLoot.interact(bot.player);
                                }
                            } catch (e) {
                                // 무시
                            }
                            bot.targetLoot = null;
                            // 무기 획득 확인 후 다음 행동
                            bot.actionCooldown = 100;
                        }
                        stopAttacking(bot);
                    } else {
                        bot.targetLoot = null;
                        bot.state = "wander";
                    }
                    break;
                }
            }

            // 6️⃣ 독가스 회피 (최우선! - 모든 행동보다 우선)
            const gas = game.gas;
            const distFromSafeCenter = getDistance(pos, gas.currentPosition);
            const isOutsideSafeZone = distFromSafeCenter > gas.currentRadius; // 안전 지역 밖 = 가스 안
            const isNearGasEdge = distFromSafeCenter > gas.currentRadius * 0.85; // 가스 경계 근처

            if (isOutsideSafeZone) {
                // ☠️ 가스 안에 있음! 즉시 안전 지역 중심으로 달려가기!
                const angle = getAngleTo(pos, gas.currentPosition);
                setMovementFromAngle(movement, angle);
                bot.player.rotation = angle;
                stopAttacking(bot); // 공격 중단하고 도망
                bot.state = "wander"; // 다른 목표 무시
            } else if (isNearGasEdge) {
                // ⚠️ 가스 경계 근처! 안전 지역 안쪽으로 이동
                const angle = getAngleTo(pos, gas.currentPosition);
                setMovementFromAngle(movement, angle);
                bot.player.rotation = angle;
                // 다른 행동은 계속 가능하지만 이동은 안쪽으로
            }

            // 가스가 줄어들고 있으면 미리 대비 (새 안전 지역 중심으로)
            if (gas.newRadius < gas.currentRadius && gas.newPosition) {
                const distFromNewCenter = getDistance(pos, gas.newPosition);
                if (distFromNewCenter > gas.newRadius * 0.7) {
                    // 다음 안전 지역 중심으로 미리 이동
                    const angle = getAngleTo(pos, gas.newPosition);
                    setMovementFromAngle(movement, angle);
                    bot.player.rotation = angle;
                }
            }

            // 7️⃣ 무기 전환 - 총이 있으면 총 사용
            try {
                const inventory = bot.player.inventory;
                if (inventory) {
                    // 슬롯 0 또는 1에 총이 있으면 사용
                    const gun0 = inventory.getWeapon(0);
                    const gun1 = inventory.getWeapon(1);
                    if (gun0 && (gun0 as any).definition?.itemType === "gun" && (gun0 as any).ammo > 0) {
                        if (inventory.activeWeaponIndex !== 0) {
                            inventory.setActiveWeaponIndex(0);
                        }
                    } else if (gun1 && (gun1 as any).definition?.itemType === "gun" && (gun1 as any).ammo > 0) {
                        if (inventory.activeWeaponIndex !== 1) {
                            inventory.setActiveWeaponIndex(1);
                        }
                    }
                }
            } catch (e) {
                // 무기 전환 실패 시 무시
            }

            bot.player.setPartialDirty();
        }
    }

    function getDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
        return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
    }

    function getAngleTo(from: { x: number; y: number }, to: { x: number; y: number }): number {
        return Math.atan2(to.y - from.y, to.x - from.x);
    }

    function setMovementFromAngle(movement: { up: boolean; down: boolean; left: boolean; right: boolean }, angle: number): void {
        movement.up = angle > -Math.PI * 0.75 && angle < -Math.PI * 0.25;
        movement.down = angle > Math.PI * 0.25 && angle < Math.PI * 0.75;
        movement.left = Math.abs(angle) > Math.PI * 0.5;
        movement.right = Math.abs(angle) < Math.PI * 0.5;
    }

    function startAttacking(bot: AIBotState): void {
        if (!bot.player) return;
        const wasAttacking = bot.player.attacking;
        bot.player.attacking = true;
        bot.player.startedAttacking = !wasAttacking;
        try {
            bot.player.activeItem?.useItem();
        } catch (e) {
            // 무시
        }
    }

    function stopAttacking(bot: AIBotState): void {
        if (!bot.player) return;
        bot.player.attacking = false;
        bot.player.startedAttacking = false;
    }

    function createAIBot(player: NonNullable<ReturnType<typeof game.addPlayer>>): void {
        aiBots.set(player.id, {
            player,
            targetPlayer: null,
            targetObstacle: null,
            targetLoot: null,
            wanderDirection: Math.random() * Math.PI * 2,
            wanderTimer: 0,
            attackCooldown: 0,
            actionCooldown: 0,
            state: "wander",
            lastActionTime: Date.now(),
            // 목표 지향 필드 초기화
            hasGun: false,
            needsWeapon: true,
            lastObstaclePos: null,
            stuckTimer: 0,
            lastPos: { x: player.position.x, y: player.position.y }
        });
    }

    // AI 봇 업데이트 루프 (100ms마다)
    setInterval(() => {
        updateAIBots(100);
    }, 100);

    process.on("uncaughtException", e => {
        game.error("An unhandled error occurred. Details:", e);
        game.kill();
        // TODO Gracefully shut down the game
    });

    process.on("message", (message: WorkerMessage) => {
        switch (message.type) {
            case WorkerMessages.UpdateTeamMode: {
                teamMode = message.teamMode;
                break;
            }
            case WorkerMessages.UpdateMap: {
                map = message.map;
                game.kill();
                break;
            }
            case WorkerMessages.UpdateMapOptions: {
                mapOptions = Config.mapScaleRanges?.[message.mapScaleRange];
                break;
            }
            case WorkerMessages.NewGame: {
                game.kill();
                game = new Game(id, teamMode, map, mapOptions);
                game.setGameData({ allowJoin: true });
                aiBots.clear(); // 기존 봇 목록 초기화 (호환성)

                // 🤖 자동 봇 투입 (플러그인 사용)
                const autoBotCount = (global as any).autoSpawnBotCount || 0;
                if (autoBotCount > 0) {
                    game.log(`[자동봇] ${autoBotCount}개의 AI 봇을 자동 투입합니다.`);
                    setTimeout(() => {
                        try {
                            const botManager = AIBotManager.getInstance();
                            botManager.setGame(game);
                            botManager.addBot(autoBotCount);
                        } catch (e) {
                            game.error("[자동봇] 봇 생성 실패:", e);
                        }
                    }, 2000);
                }
                break;
            }
        }
    });

    setInterval(() => {
        const memoryUsage = process.memoryUsage().rss;
        game.log(`RAM usage: ${Math.round(memoryUsage / 1024 / 1024 * 100) / 100} MB`);
    }, 60000);

    const { maxSimultaneousConnections, maxJoinAttempts } = Config;
    const simultaneousConnections = maxSimultaneousConnections
        ? new RateLimiter(maxSimultaneousConnections)
        : undefined;
    const joinAttempts = maxJoinAttempts
        ? new RateLimiter(maxJoinAttempts.count, maxJoinAttempts.duration)
        : undefined;

    Bun.serve({
        hostname: Config.hostname,
        port: Config.port + id + 1,
        routes: {
            // AI 봇 추가 API (플러그인 사용)
            "/api/addBots": async req => {
                const searchParams = new URLSearchParams(req.url.slice(req.url.indexOf("?")));
                const count = Math.min(parseInt(searchParams.get("count") || "1"), 50);

                try {
                    const botManager = AIBotManager.getInstance();
                    botManager.setGame(game);
                    const addedPlayers = botManager.addBot(count);

                    const addedBots = addedPlayers.map(p => ({ id: p.id, name: p.name }));

                    return Response.json({
                        success: true,
                        message: `${addedBots.length}개의 AI 봇이 추가되었습니다.`,
                        addedCount: addedBots.length,
                        bots: addedBots,
                        playerCount: game.livingPlayers.size
                    }, { headers: { "Access-Control-Allow-Origin": "*" } });
                } catch (e) {
                    return Response.json({
                        success: false,
                        message: "봇 추가 실패",
                        error: String(e)
                    }, { headers: { "Access-Control-Allow-Origin": "*" } });
                }
            },
            // 모든 봇 제거 API (플러그인 사용)
            "/api/removeAllBots": async req => {
                try {
                    const botManager = AIBotManager.getInstance();
                    const removedCount = botManager.removeAllBots();

                    return Response.json({
                        success: true,
                        message: `${removedCount}개의 봇이 제거되었습니다.`,
                        removedCount
                    }, { headers: { "Access-Control-Allow-Origin": "*" } });
                } catch (e) {
                    return Response.json({
                        success: false,
                        message: "봇 제거 실패"
                    }, { headers: { "Access-Control-Allow-Origin": "*" } });
                }
            },
            // 📊 플레이어 통계 API
            "/api/players/stats": async req => {
                try {
                    const allPlayers = [...game.livingPlayers];
                    const bots = allPlayers.filter(p => p.name.startsWith("AI봇_"));
                    const realUsers = allPlayers.filter(p => !p.name.startsWith("AI봇_"));

                    // IP별 유저 목록 (봇 제외)
                    const usersByIP: { [ip: string]: { count: number; names: string[] } } = {};
                    for (const player of realUsers) {
                        const ip = (player as any).ip || "unknown";
                        if (!usersByIP[ip]) {
                            usersByIP[ip] = { count: 0, names: [] };
                        }
                        usersByIP[ip].count++;
                        usersByIP[ip].names.push(player.name);
                    }

                    // IP 목록 배열로 변환
                    const ipList = Object.entries(usersByIP).map(([ip, data]) => ({
                        ip: ip.substring(0, 20) + (ip.length > 20 ? "..." : ""),
                        count: data.count,
                        names: data.names
                    }));

                    return Response.json({
                        success: true,
                        stats: {
                            totalPlayers: allPlayers.length,
                            realUsers: realUsers.length,
                            bots: bots.length,
                            uniqueIPs: Object.keys(usersByIP).length
                        },
                        ipList: ipList,
                        players: realUsers.map(p => ({
                            id: p.id,
                            name: p.name,
                            health: p.health,
                            ip: ((p as any).ip || "unknown").substring(0, 20)
                        }))
                    }, { headers: { "Access-Control-Allow-Origin": "*" } });
                } catch (e) {
                    return Response.json({
                        success: false,
                        stats: { totalPlayers: 0, realUsers: 0, bots: 0 }
                    }, { headers: { "Access-Control-Allow-Origin": "*" } });
                }
            },
            // 봇 목록 API
            "/api/bots": async req => {
                const bots = [...game.livingPlayers]
                    .filter(p => p.name.startsWith("AI봇_"))
                    .map(p => ({
                        id: p.id,
                        name: p.name,
                        health: p.health,
                        state: p.dead ? "dead" : "alive",
                        position: p.position
                    }));

                return Response.json({
                    success: true,
                    bots,
                    count: bots.length
                }, { headers: { "Access-Control-Allow-Origin": "*" } });
            },
            // 🤖 자동 봇 투입 설정 API (파일 저장)
            "/api/autobots/set": async req => {
                if (req.method === "OPTIONS") {
                    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type" } });
                }
                const body = await req.json() as { count: number };
                const count = Math.max(0, Math.min(50, body.count || 0));

                // 파일에 저장 (서버 재시작 후에도 유지)
                const saved = setAutoSpawnBotCount(count);
                game.log(`[자동봇] 게임 시작 시 자동 봇 투입 수: ${count} (저장: ${saved ? '성공' : '실패'})`);

                return Response.json({
                    success: true,
                    message: `게임 시작 시 ${count}개의 봇이 자동 투입됩니다. (설정 저장됨)`,
                    count,
                    saved
                }, { headers: { "Access-Control-Allow-Origin": "*" } });
            },
            // 🤖 자동 봇 투입 설정 조회 API (파일에서 로드)
            "/api/autobots/get": async req => {
                if (req.method === "OPTIONS") {
                    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET", "Access-Control-Allow-Headers": "Content-Type" } });
                }
                // 파일에서 로드
                const count = getAutoSpawnBotCount();

                return Response.json({
                    success: true,
                    count
                }, { headers: { "Access-Control-Allow-Origin": "*" } });
            },
            // 📢 공지사항 API
            "/api/announcement": async req => {
                if (req.method === "OPTIONS") {
                    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type" } });
                }
                const body = await req.json() as {
                    message: string;
                    fontSize: string;
                    color: string;
                    bgColor: string;
                    position: string;
                    duration: string;
                    animation: string;
                    type: string;
                };

                // 공지사항 저장
                (game as any).pendingAnnouncement = {
                    ...body,
                    timestamp: Date.now()
                };

                game.log(`[공지사항] ${body.message}`);

                return Response.json({
                    success: true,
                    message: "공지사항이 전송되었습니다."
                }, { headers: { "Access-Control-Allow-Origin": "*" } });
            },
            // 💬 채팅 전송 API
            "/api/chat/send": async req => {
                if (req.method === "OPTIONS") {
                    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type" } });
                }
                const body = await req.json() as {
                    player: string;
                    message: string;
                };

                if (!body.message || !body.player) {
                    return Response.json({ success: false, error: "메시지와 플레이어 이름이 필요합니다." }, { headers: { "Access-Control-Allow-Origin": "*" } });
                }

                // 채팅 로그에 추가
                if (!(game as any).chatMessages) {
                    (game as any).chatMessages = [];
                }

                const chatMsg = {
                    player: body.player,
                    message: body.message.substring(0, 150),
                    timestamp: Date.now()
                };
                (game as any).chatMessages.push(chatMsg);

                // 최대 200개 유지
                if ((game as any).chatMessages.length > 200) {
                    (game as any).chatMessages = (game as any).chatMessages.slice(-200);
                }

                game.log(`[채팅] ${body.player}: ${body.message}`);

                return Response.json({
                    success: true,
                    message: "채팅이 전송되었습니다."
                }, { headers: { "Access-Control-Allow-Origin": "*" } });
            },
            // 💬 최근 채팅 조회 API
            "/api/chat/recent": async req => {
                if (req.method === "OPTIONS") {
                    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET", "Access-Control-Allow-Headers": "Content-Type" } });
                }

                const url = new URL(req.url);
                const since = parseInt(url.searchParams.get("since") || "0");

                const messages = ((game as any).chatMessages || [])
                    .filter((msg: any) => msg.timestamp > since)
                    .slice(-20); // 최대 20개

                return Response.json({
                    success: true,
                    messages
                }, { headers: { "Access-Control-Allow-Origin": "*" } });
            },
            // 🔇 채금 API
            "/api/mute": async req => {
                if (req.method === "OPTIONS") {
                    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type" } });
                }
                const body = await req.json() as {
                    target: string;
                    duration: number;
                    reason: string;
                };

                // 채금 목록에 추가
                if (!(game as any).muteList) {
                    (game as any).muteList = new Map();
                }

                (game as any).muteList.set(body.target.toLowerCase(), {
                    reason: body.reason,
                    expires: body.duration === -1 ? -1 : Date.now() + body.duration * 60000
                });

                game.log(`[채금] ${body.target} - ${body.reason} (${body.duration === -1 ? "영구" : body.duration + "분"})`);

                return Response.json({
                    success: true,
                    message: `${body.target}이(가) 채금되었습니다.`
                }, { headers: { "Access-Control-Allow-Origin": "*" } });
            },
            // 🔊 채금 해제 API
            "/api/unmute": async req => {
                if (req.method === "OPTIONS") {
                    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type" } });
                }
                const body = await req.json() as { target: string };

                if ((game as any).muteList) {
                    (game as any).muteList.delete(body.target.toLowerCase());
                }

                game.log(`[채금 해제] ${body.target}`);

                return Response.json({
                    success: true,
                    message: `${body.target}의 채금이 해제되었습니다.`
                }, { headers: { "Access-Control-Allow-Origin": "*" } });
            },
            // 💬 채팅 설정 API
            "/api/chat/settings": async req => {
                if (req.method === "OPTIONS") {
                    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type" } });
                }
                const body = await req.json() as {
                    enabled: boolean;
                    cooldown: number;
                    maxLength: number;
                    filter: boolean;
                    teamOnly: boolean;
                };

                (game as any).chatSettings = body;
                game.log(`[채팅 설정] 활성화: ${body.enabled}, 쿨다운: ${body.cooldown}초, 최대길이: ${body.maxLength}`);

                return Response.json({
                    success: true,
                    message: "채팅 설정이 저장되었습니다."
                }, { headers: { "Access-Control-Allow-Origin": "*" } });
            },
            // 📊 채팅 로그 API
            "/api/chat/log": async req => {
                const logs = (game as any).chatLogs || [];

                return Response.json({
                    success: true,
                    logs: logs.slice(-100)
                }, { headers: { "Access-Control-Allow-Origin": "*" } });
            },
            // 📢 공지사항 폴링 API (클라이언트용)
            "/api/pending-announcement": async req => {
                const announcement = (game as any).pendingAnnouncement;

                // 10초 이내의 공지사항만 반환
                if (announcement && Date.now() - announcement.timestamp < 10000) {
                    // 한 번 반환되면 삭제
                    (game as any).pendingAnnouncement = null;
                    return Response.json({
                        success: true,
                        announcement
                    }, { headers: { "Access-Control-Allow-Origin": "*" } });
                }

                return Response.json({
                    success: true,
                    announcement: null
                }, { headers: { "Access-Control-Allow-Origin": "*" } });
            },
            "/play": async (req, res) => {
                if (!game.allowJoin) {
                    return new Response("403 Forbidden");
                }

                const ip = getIP(req, res);
                const searchParams = new URLSearchParams(req.url.slice(req.url.indexOf("?")));

                if (simultaneousConnections?.isLimited(ip)) {
                    game.warn(ip, "exceeded maximum simultaneous connections");
                    return new Response("403 Forbidden");
                }
                if (joinAttempts?.isLimited(ip)) {
                    game.warn(ip, "exceeded maximum join attempts");
                    return new Response("403 Forbidden");
                }
                joinAttempts?.increment(ip);

                const punishment = await getPunishment(ip);
                if (punishment && punishment.message !== "noname") {
                    return new Response("403 Forbidden");
                }

                const { role, isDev, nameColor } = parseRole(searchParams);
                res.upgrade(req, {
                    data: {
                        ip,
                        teamID: searchParams.get("teamID") ?? undefined,
                        autoFill: Boolean(searchParams.get("autoFill")),
                        noName: punishment?.message === "noname",
                        role,
                        isDev,
                        nameColor,
                        lobbyClearing: searchParams.get("lobbyClearing") === "true",
                        weaponPreset: searchParams.get("weaponPreset") ?? ""
                    } satisfies PlayerSocketData
                });
            }
        },
        websocket: {
            open(socket: Bun.ServerWebSocket<PlayerSocketData>) {
                const data = socket.data;
                data.player = game.addPlayer(socket);
                if (data.player === undefined) return;

                simultaneousConnections?.increment(data.ip);
                // data.player.sendGameOverPacket(false); // uncomment to test game over screen
            },

            message(socket: Bun.ServerWebSocket<PlayerSocketData>, message: Buffer) {
                try {
                    game.onMessage(socket.data.player, message.buffer as ArrayBuffer);
                } catch (e) {
                    console.warn("Error parsing message:", e);
                }
            },

            close(socket: Bun.ServerWebSocket<PlayerSocketData>) {
                const { player, ip } = socket.data;

                if (player) game.removePlayer(player);
                if (ip) simultaneousConnections?.decrement(ip);
            }
        }
    });

    game.setGameData({ allowJoin: true });
    game.log(`Listening on ${Config.hostname}:${Config.port + id + 1}`);
}
