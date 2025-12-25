import { GameConstants, Layer, ObjectCategory } from "@common/constants";
import { Guns } from "@common/definitions/items/guns";
import { HealingItems } from "@common/definitions/items/healingItems";
import { Scopes } from "@common/definitions/items/scopes";
import { Skins } from "@common/definitions/items/skins";
import { Emotes } from "@common/definitions/emotes";
import { Angle, Numeric } from "@common/utils/math";
import { Vec, type Vector } from "@common/utils/vector";
import { DefinitionType } from "@common/utils/objectDefinitions";
import type { Game } from "../game";
import { Player } from "../objects/player";
import { GamePlugin } from "../pluginManager";
import type { Obstacle } from "../objects/obstacle";
import type { Loot } from "../objects/loot";

// AI 봇 이름 목록
const BOT_NAMES = [
    "AI봇_루나", "AI봇_스타", "AI봇_노바", "AI봇_제로", "AI봇_엑스",
    "AI봇_알파", "AI봇_베타", "AI봇_감마", "AI봇_델타", "AI봇_오메가",
    "AI봇_마스터", "AI봇_킬러", "AI봇_헌터", "AI봇_스나이퍼", "AI봇_워리어",
    "AI봇_섀도우", "AI봇_고스트", "AI봇_닌자", "AI봇_사무라이", "AI봇_드래곤"
];

// 유틸리티 함수
function vecLen(v: Vector): number {
    return Math.sqrt(v.x * v.x + v.y * v.y);
}

function vecSub(a: Vector, b: Vector): Vector {
    return { x: a.x - b.x, y: a.y - b.y };
}

function vecAdd(a: Vector, b: Vector): Vector {
    return { x: a.x + b.x, y: a.y + b.y };
}

function vecScale(v: Vector, s: number): Vector {
    return { x: v.x * s, y: v.y * s };
}

function vecNormalize(v: Vector): Vector {
    const len = vecLen(v);
    if (len === 0) return { x: 0, y: 0 };
    return { x: v.x / len, y: v.y / len };
}

/**
 * 🤖 목표 지향적 AI 봇 클래스
 * 
 * 📋 핵심 목표 우선순위:
 * 1. 가스 회피 (생존)
 * 2. 무기 획득 (총 > 근접)
 * 3. 적 발견시 공격
 * 4. 탄약 없으면 근접 전환 → 새 무기 탐색
 * 5. 상자 파괴하며 아이템 획득
 */
class AIBot {
    player: Player;
    game: Game;

    // 타겟
    targetPlayer: Player | null = null;
    targetLoot: Loot | null = null;
    targetObstacle: Obstacle | null = null;

    // 상태
    state: "wander" | "chase" | "attack" | "flee" | "loot" | "break" | "escape_gas" | "healing" | "search_weapon" = "wander";

    // 타이머
    wanderDirection: number = Math.random() * Math.PI * 2;
    wanderTimer: number = 0;
    attackCooldown: number = 0;
    stuckTimer: number = 0;
    stuckCount: number = 0; // 🆕 연속 막힘 횟수
    weaponSwitchTimer: number = 0;

    // 인간적 행동 변수
    strafeDirection: number = 1;
    strafeTimer: number = 0;
    reactionDelay: number = 0;
    aimError: number = 0;
    aimErrorTimer: number = 0;
    healingTimer: number = 0;
    reloadCheckTimer: number = 0;

    // 🆕 목표 지향 변수
    needsWeapon: boolean = true; // 무기가 필요한지
    hasAmmo: boolean = false; // 탄약이 있는지
    searchDirection: number = 0; // 탐색 방향
    searchTimer: number = 0;
    lastStuckPos: Vector | null = null; // 막힌 위치 기억
    bestWeaponTier: number = 99; // 현재 보유 중 최고 무기 등급 (0=S, 4=D)
    wantsBetterWeapon: boolean = true; // 더 좋은 무기 필요

    // 🔥 스킬 레벨 대폭 상향
    skillLevel: number = 0.7 + Math.random() * 0.3; // 0.7~1.0 (기존 0.5~1.0)

    // 🔥 설정 - 탐색 범위 및 공격성 대폭 확대
    searchRadius: number = 150; // 적 탐색 범위 (기존 100)
    lootRadius: number = 120; // 아이템 탐색 범위 (기존 80)
    obstacleRadius: number = 80; // 상자 탐색 범위 (기존 50)
    attackRange: number = 60; // 공격 범위 (기존 45)

    // 이전 위치 (막힘 감지)
    lastPosition: Vector;
    escapeDirection: number = 0;

    constructor(game: Game, player: Player) {
        this.game = game;
        this.player = player;
        this.lastPosition = { x: player.position.x, y: player.position.y };

        // 스킬에 따른 설정 조정
        this.searchRadius = 50 + this.skillLevel * 30;
        this.attackRange = 25 + this.skillLevel * 25;
        this.searchDirection = Math.random() * Math.PI * 2;
    }

    update(dt: number): void {
        if (this.player.dead || this.player.disconnected) return;

        // 타이머 감소
        this.wanderTimer -= dt;
        this.attackCooldown -= dt;
        this.weaponSwitchTimer -= dt;
        this.strafeTimer -= dt;
        this.reactionDelay -= dt;
        this.aimErrorTimer -= dt;
        this.healingTimer -= dt;
        this.reloadCheckTimer -= dt;
        this.searchTimer -= dt;

        // 조준 오차 업데이트
        if (this.aimErrorTimer <= 0) {
            const maxError = 0.12 * (1 - this.skillLevel * 0.6);
            this.aimError = (Math.random() - 0.5) * maxError;
            this.aimErrorTimer = 80 + Math.random() * 150;
        }

        // 🆕 무기 상태 체크
        this.checkWeaponStatus();

        // 1️⃣ 최우선: 가스 회피
        if (this.checkGas()) {
            this.doEscapeGas();
            this.player.setPartialDirty();
            return;
        }

        // 2️⃣ 막힘 감지 (더 빠르게)
        this.checkStuck(dt);

        // 3️⃣ 힐링 체크
        if (this.shouldHeal() && !this.targetPlayer) {
            this.doHealing();
            this.player.setPartialDirty();
            return;
        }

        // 4️⃣ 무기 전환 및 리로드
        this.smartWeaponSwitch();
        this.checkReload();

        // 5️⃣ 주변 탐색
        if (this.reactionDelay <= 0) {
            this.findTarget();
            this.findLoot();
            this.findObstacle();
            this.reactionDelay = 30 + (1 - this.skillLevel) * 100;
        }

        // 6️⃣ 목표 지향적 상태 결정
        this.decideStateGoalOriented();

        // 7️⃣ 상태에 따른 행동
        switch (this.state) {
            case "wander": this.doSmartWander(); break; // 🆕 스마트 배회
            case "search_weapon": this.doSearchWeapon(); break; // 🆕 무기 탐색
            case "chase": this.doChase(); break;
            case "attack": this.doAttack(); break;
            case "flee": this.doFlee(); break;
            case "loot": this.doLoot(); break;
            case "break": this.doBreak(); break;
        }

        // 위치 저장
        this.lastPosition = { x: this.player.position.x, y: this.player.position.y };
        this.player.setPartialDirty();
    }

    // ========================================
    // 🆕 무기 상태 체크 (등급 포함)
    // ========================================
    checkWeaponStatus(): void {
        try {
            const inv = this.player.inventory;

            // 총이 있는지 확인
            let hasGun = false;
            let gunHasAmmo = false;
            let bestTier = 99; // D=4, C=3, B=2, A=1, S=0

            for (let i = 0; i < 2; i++) {
                const weapon = inv.getWeapon(i);
                if (weapon && (weapon as any).definition?.defType === DefinitionType.Gun) {
                    hasGun = true;
                    const gunDef = (weapon as any).definition;

                    // 무기 등급 확인 (tier: S=0, A=1, B=2, C=3, D=4)
                    const tier = gunDef.tier ?? 4;
                    if (tier < bestTier) {
                        bestTier = tier;
                    }

                    const ammo = (weapon as any).ammo || 0;
                    const reserveAmmo = inv.items.getItem(gunDef.ammoType) || 0;
                    if (ammo > 0 || reserveAmmo > 0) {
                        gunHasAmmo = true;
                    }
                }
            }

            this.needsWeapon = !hasGun;
            this.hasAmmo = gunHasAmmo;
            this.bestWeaponTier = bestTier;

            // B등급(2) 이상 없으면 더 좋은 무기 필요
            this.wantsBetterWeapon = bestTier > 2;

        } catch (e) {
            this.needsWeapon = true;
            this.hasAmmo = false;
            this.bestWeaponTier = 99;
            this.wantsBetterWeapon = true;
        }
    }

    // ========================================
    // 🆕 스마트 무기 전환
    // ========================================
    smartWeaponSwitch(): void {
        if (this.weaponSwitchTimer > 0) return;

        try {
            const inv = this.player.inventory;
            const activeWeapon = inv.activeWeapon;

            // 현재 총을 들고 있는데 탄약이 없으면
            if (activeWeapon?.definition?.defType === DefinitionType.Gun) {
                const gun = activeWeapon as any;
                if (gun.ammo <= 0 && inv.items.getItem(gun.definition.ammoType) <= 0) {
                    // 다른 총 찾기
                    for (let i = 0; i < 2; i++) {
                        const weapon = inv.getWeapon(i);
                        if (weapon !== activeWeapon && weapon && (weapon as any).definition?.defType === DefinitionType.Gun) {
                            const otherGun = weapon as any;
                            if (otherGun.ammo > 0 || inv.items.getItem(otherGun.definition.ammoType) > 0) {
                                inv.setActiveWeaponIndex(i);
                                this.weaponSwitchTimer = 300;
                                return;
                            }
                        }
                    }

                    // 다른 총도 없으면 근접무기로 전환
                    inv.setActiveWeaponIndex(2); // 근접 슬롯
                    this.weaponSwitchTimer = 300;
                    this.needsWeapon = true; // 새 무기 필요 플래그
                    return;
                }
                return; // 탄약 있으면 유지
            }

            // 총이 아니면 총 찾기
            for (let i = 0; i < 2; i++) {
                const weapon = inv.getWeapon(i);
                if (weapon && (weapon as any).definition?.defType === DefinitionType.Gun) {
                    const gun = weapon as any;
                    if (gun.ammo > 0 || inv.items.getItem(gun.definition.ammoType) > 0) {
                        inv.setActiveWeaponIndex(i);
                        this.weaponSwitchTimer = 300;
                        return;
                    }
                }
            }
        } catch (e) {
            // 무시
        }
    }

    // ========================================
    // 🆕 목표 지향적 상태 결정
    // ========================================
    decideStateGoalOriented(): void {
        const targetDist = this.targetPlayer ?
            vecLen(vecSub(this.targetPlayer.position, this.player.position)) : Infinity;
        const lootDist = this.targetLoot ?
            vecLen(vecSub(this.targetLoot.position, this.player.position)) : Infinity;
        const obstacleDist = this.targetObstacle ?
            vecLen(vecSub(this.targetObstacle.position, this.player.position)) : Infinity;

        // 체력 낮으면 도망 (적이 아주 가까울 때만)
        if (this.player.health < 20 && this.targetPlayer && targetDist < 15) {
            this.state = "flee";
            return;
        }

        // 🔥 무기 없거나 더 좋은 무기 필요 → 적극적으로 탐색
        if (this.needsWeapon || this.wantsBetterWeapon) {
            // 가까운 무기 아이템이 있으면 줍기 (적이 있어도!)
            if (this.targetLoot && lootDist < 30) { // 30 이내면 무조건 줍기
                const def = this.targetLoot.definition;
                if (def?.defType === DefinitionType.Gun) {
                    const gunTier = (def as any).tier ?? 4;
                    // 현재보다 좋은 무기면 줍기
                    if (gunTier < this.bestWeaponTier || this.needsWeapon) {
                        this.state = "loot";
                        return;
                    }
                }
            }

            // 🔥 상자가 있으면 적극적으로 부수기 (25 이내)
            if (this.targetObstacle && obstacleDist < 25 && !this.targetPlayer) {
                this.state = "break";
                return;
            }

            // 무기 없으면 탐색 모드
            if (this.needsWeapon && !this.targetPlayer) {
                this.state = "search_weapon";
                return;
            }
        }

        // 🔥 바로 앞에 아이템 있으면 줍기 (10 이내)
        if (lootDist < 10) {
            this.state = "loot";
            return;
        }

        // 적이 아주 가까우면 무조건 공격
        if (this.targetPlayer && targetDist < 8) {
            this.state = "attack";
            return;
        }

        // 🆕 탄약 없고 적 있으면 → 근접 공격하며 새 무기 찾기
        if (!this.hasAmmo && this.targetPlayer && targetDist < 15) {
            this.state = "attack"; // 근접으로 공격
            return;
        }

        // 총 있고 적 있으면 공격
        if (this.hasAmmo && this.targetPlayer && targetDist < this.attackRange) {
            this.state = targetDist < 12 ? "attack" : "chase";
            return;
        }

        // 무기 아이템 줍기 (총 우선)
        if (this.targetLoot && lootDist < 20) {
            const def = this.targetLoot.definition;
            if (def?.defType === DefinitionType.Gun ||
                (def?.defType === DefinitionType.Ammo && !this.hasAmmo)) {
                this.state = "loot";
                return;
            }
        }

        // 상자 부수기
        if (this.targetObstacle && obstacleDist < this.obstacleRadius) {
            this.state = "break";
            return;
        }

        // 아이템 줍기
        if (this.targetLoot && lootDist < 15) {
            this.state = "loot";
            return;
        }

        // 적 추격
        if (this.targetPlayer && targetDist < this.searchRadius) {
            this.state = "chase";
            return;
        }

        // 기본: 스마트 배회 (목적지 향해 이동)
        this.state = "wander";
    }

    // ========================================
    // 🆕 스마트 배회 (상자/아이템 방향으로)
    // ========================================
    doSmartWander(): void {
        // 가장 가까운 상자나 아이템 방향으로 이동
        let targetPos: Vector | null = null;

        // 상자가 있으면 그 방향으로
        if (this.targetObstacle) {
            targetPos = this.targetObstacle.position;
        }
        // 아이템이 있으면 그 방향으로
        else if (this.targetLoot) {
            targetPos = this.targetLoot.position;
        }

        if (targetPos) {
            const direction = vecSub(targetPos, this.player.position);
            const angle = Math.atan2(direction.y, direction.x);
            this.moveInDirection(angle);
            this.player.rotation = angle;
        } else {
            // 아무것도 없으면 탐색 방향으로 이동
            if (this.searchTimer <= 0) {
                this.searchDirection = Math.random() * Math.PI * 2;
                this.searchTimer = 3000 + Math.random() * 2000;
            }
            this.moveInDirection(this.searchDirection);
            this.player.rotation = this.searchDirection;
        }

        this.player.attacking = false;
    }

    // ========================================
    // 🆕 무기 탐색 모드
    // ========================================
    doSearchWeapon(): void {
        // 상자나 무기를 찾아 적극적으로 이동

        // 상자가 있으면 부수러 가기
        if (this.targetObstacle) {
            const direction = vecSub(this.targetObstacle.position, this.player.position);
            const distance = vecLen(direction);
            const angle = Math.atan2(direction.y, direction.x);

            this.moveInDirection(angle);
            this.player.rotation = angle;

            if (distance < 4) {
                this.player.attacking = true;
                this.player.startedAttacking = true;
            } else {
                this.player.attacking = false;
            }
            return;
        }

        // 무기 아이템이 있으면 줍기
        if (this.targetLoot) {
            const direction = vecSub(this.targetLoot.position, this.player.position);
            const distance = vecLen(direction);
            const angle = Math.atan2(direction.y, direction.x);

            this.moveInDirection(angle);
            this.player.rotation = angle;
            this.player.attacking = false;

            if (distance < 3) {
                try {
                    this.targetLoot.interact(this.player);
                } catch (e) { }
                this.targetLoot = null;
            }
            return;
        }

        // 아무것도 없으면 탐색
        this.doSmartWander();
    }

    // ========================================
    // 힐링 시스템
    // ========================================
    shouldHeal(): boolean {
        if (this.healingTimer > 0) return false;
        if (this.targetPlayer) {
            const dist = vecLen(vecSub(this.targetPlayer.position, this.player.position));
            if (dist < 25) return false;
        }
        return this.player.health < 50;
    }

    doHealing(): void {
        try {
            const inv = this.player.inventory;

            if (this.player.health < 75) {
                const bandageCount = inv.items.getItem("bandage");
                if (bandageCount > 0) {
                    this.stopMovement();
                    this.player.attacking = false;
                    this.state = "healing";
                    this.healingTimer = 2000;
                    this.player.health = Math.min(100, this.player.health + 15);
                    inv.items.setItem("bandage", bandageCount - 1);
                    return;
                }
            }

            if (this.player.health < 50) {
                const medkitCount = inv.items.getItem("medikit");
                if (medkitCount > 0) {
                    this.stopMovement();
                    this.player.attacking = false;
                    this.state = "healing";
                    this.healingTimer = 4000;
                    this.player.health = 100;
                    inv.items.setItem("medikit", medkitCount - 1);
                    return;
                }
            }
        } catch (e) { }

        this.healingTimer = 3000;
    }

    // ========================================
    // 리로드 시스템
    // ========================================
    checkReload(): void {
        if (this.reloadCheckTimer > 0) return;
        this.reloadCheckTimer = 300;

        try {
            const weapon = this.player.inventory.activeWeapon;
            if (!weapon || weapon.definition?.defType !== DefinitionType.Gun) return;

            const gun = weapon as any;
            const ammoInMag = gun.ammo || 0;
            const maxAmmo = gun.definition?.capacity || 30;

            if (ammoInMag < maxAmmo * 0.3 && !this.targetPlayer) {
                gun.reload?.();
            }

            if (ammoInMag === 0) {
                gun.reload?.();
            }
        } catch (e) { }
    }

    // ========================================
    // 가스 처리
    // ========================================
    checkGas(): boolean {
        const gas = this.game.gas;
        const pos = this.player.position;
        const distFromCenter = vecLen(vecSub(pos, gas.currentPosition));
        return distFromCenter > gas.currentRadius * 0.95; // 95% 경계부터 피하기 시작
    }

    doEscapeGas(): void {
        const gas = this.game.gas;
        const pos = this.player.position;
        const toCenter = vecSub(gas.currentPosition, pos);
        const angle = Math.atan2(toCenter.y, toCenter.x);

        this.moveInDirection(angle);
        this.player.rotation = angle + this.aimError;
        this.player.attacking = false;
        this.state = "escape_gas";
    }

    // ========================================
    // 🆕 개선된 막힘 감지 + 문 열기
    // ========================================
    checkStuck(dt: number): void {
        const pos = this.player.position;
        const distMoved = vecLen(vecSub(pos, this.lastPosition));

        if (distMoved < 0.2) { // 더 민감하게
            this.stuckTimer += dt;
            if (this.stuckTimer > 200) { // 200ms로 단축
                this.stuckCount++;

                // 🚪 막혔을 때 주변 문 찾아서 열기 시도
                this.tryOpenNearbyDoor();

                // 연속으로 막히면 더 큰 각도로 방향 전환
                const angleOffset = (Math.PI / 2) + (this.stuckCount * Math.PI / 4);
                this.wanderDirection = this.wanderDirection + angleOffset;
                this.searchDirection = this.searchDirection + angleOffset;

                // 막힌 위치 기억
                this.lastStuckPos = { x: pos.x, y: pos.y };

                this.stuckTimer = 0;
                this.moveInDirection(this.wanderDirection);

                // 3번 이상 연속 막히면 완전히 새로운 방향
                if (this.stuckCount >= 3) {
                    this.wanderDirection = Math.random() * Math.PI * 2;
                    this.searchDirection = Math.random() * Math.PI * 2;
                    this.stuckCount = 0;
                }
            }
        } else {
            this.stuckTimer = 0;
            if (distMoved > 1) {
                this.stuckCount = 0; // 잘 이동하면 카운트 리셋
            }
        }
    }

    // ========================================
    // 타겟 찾기 (같은 팀은 제외)
    // ========================================
    findTarget(): void {
        let closestPlayer: Player | null = null;
        let closestDistance = this.searchRadius;

        for (const otherPlayer of this.game.livingPlayers) {
            if (otherPlayer === this.player || otherPlayer.dead) continue;

            // 🛡️ 같은 팀이면 공격하지 않음!
            if (this.player.isSameTeam(otherPlayer)) continue;

            const distance = vecLen(vecSub(otherPlayer.position, this.player.position));
            if (distance < closestDistance) {
                closestDistance = distance;
                closestPlayer = otherPlayer;
            }
        }

        this.targetPlayer = closestPlayer;
    }

    findLoot(): void {
        let closestLoot: Loot | null = null;
        let bestPriority = 0;

        try {
            // ObjectCategory.Loot = 3
            const loots = this.game.grid.pool.getCategory(ObjectCategory.Loot);

            for (const loot of loots) {
                if (!loot || loot.dead) continue;

                const distance = vecLen(vecSub(loot.position, this.player.position));
                if (distance > this.lootRadius) continue;

                const def = loot.definition;

                // 우선순위 계산 (더 좋은 총 > 탄약 > 치료템)
                let priority = 1;
                if (def?.defType === DefinitionType.Gun) {
                    const gunTier = (def as any).tier ?? 4; // S=0, A=1, B=2, C=3, D=4

                    // 현재 가진 것보다 좋은 무기만 관심
                    if (gunTier < this.bestWeaponTier) {
                        // 등급 차이가 클수록 높은 우선순위
                        const tierBonus = (this.bestWeaponTier - gunTier) * 5;
                        priority = 15 + tierBonus; // S급 무기는 최고 우선순위
                    } else if (this.needsWeapon) {
                        priority = 10; // 무기 없으면 아무 총이라도
                    } else {
                        priority = 1; // 이미 좋은 무기 있으면 낮은 우선순위
                    }
                } else if (def?.defType === DefinitionType.Ammo) {
                    priority = !this.hasAmmo ? 8 : 2; // 탄약 필요하면 높은 우선순위
                } else if (def?.defType === DefinitionType.HealingItem) {
                    priority = this.player.health < 70 ? 5 : 1;
                } else if (def?.defType === DefinitionType.Armor) {
                    priority = 6; // 방어구 우선순위 상향
                } else if (def?.defType === DefinitionType.Backpack) {
                    priority = 4; // 배낭
                }

                const score = priority / (distance + 0.1); // 거리 가중치
                if (score > bestPriority) {
                    bestPriority = score;
                    closestLoot = loot;
                }
            }
        } catch (e) {
            console.error("[AI Bot] findLoot 에러:", e);
        }

        this.targetLoot = closestLoot;
    }

    findObstacle(): void {
        let closestObstacle: Obstacle | null = null;
        let closestDistance = this.obstacleRadius;

        try {
            // ObjectCategory.Obstacle = 1
            const obstacles = this.game.grid.pool.getCategory(ObjectCategory.Obstacle);

            for (const obj of obstacles) {
                if (!obj || obj.dead) continue;

                const def = obj.definition;
                // 상자, 나무 상자, 통 등 부술 수 있는 것만
                if (!def) continue;
                if (def.impenetrable || def.indestructible) continue;
                if (def.material !== "wood" && def.material !== "cardboard" && def.material !== "crate") continue;
                if (def.idString?.includes("door") || def.idString?.includes("wall")) continue;

                // 막힌 위치 근처 상자는 피하기
                if (this.lastStuckPos) {
                    const distFromStuck = vecLen(vecSub(obj.position, this.lastStuckPos));
                    if (distFromStuck < 5) continue;
                }

                const distance = vecLen(vecSub(obj.position, this.player.position));
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestObstacle = obj;
                }
            }
        } catch (e) {
            console.error("[AI Bot] findObstacle 에러:", e);
        }

        this.targetObstacle = closestObstacle;
    }

    hasGunEquipped(): boolean {
        try {
            const weapon = this.player.inventory.activeWeapon;
            return weapon?.definition?.defType === DefinitionType.Gun;
        } catch {
            return false;
        }
    }

    // 🚪 주변 문 열기 시도
    tryOpenNearbyDoor(): void {
        try {
            const obstacles = this.game.grid.pool.getCategory(ObjectCategory.Obstacle);

            for (const obj of obstacles) {
                if (!obj || obj.dead) continue;

                const def = obj.definition;
                const isDoor = def?.idString?.includes("door");
                if (!isDoor) continue;

                const distance = vecLen(vecSub(obj.position, this.player.position));
                if (distance < 8) { // 8 유닛 이내의 문
                    try {
                        if (typeof obj.interact === 'function') {
                            obj.interact(this.player);
                            console.log(`[AI Bot] ${this.player.name} opened nearby door`);
                        }
                    } catch (e) { }
                    break; // 하나만 열기
                }
            }
        } catch (e) { }
    }

    // ========================================
    // 행동 구현
    // ========================================
    doChase(): void {
        if (!this.targetPlayer) {
            this.state = "wander";
            return;
        }

        const direction = vecSub(this.targetPlayer.position, this.player.position);
        const angle = Math.atan2(direction.y, direction.x);
        const distance = vecLen(direction);

        this.moveInDirection(angle);
        this.player.rotation = angle + this.aimError;

        if (distance < this.attackRange && this.attackCooldown <= 0) {
            this.player.attacking = true;
            this.player.startedAttacking = true;
            this.attackCooldown = 60 + (1 - this.skillLevel) * 120 + Math.random() * 80;
        } else {
            this.player.attacking = false;
        }
    }

    doAttack(): void {
        if (!this.targetPlayer) {
            this.state = "wander";
            return;
        }

        const direction = vecSub(this.targetPlayer.position, this.player.position);
        const angle = Math.atan2(direction.y, direction.x);
        const distance = vecLen(direction);

        this.player.rotation = angle + this.aimError;

        // 현재 무기 타입 확인
        const activeWeapon = this.player.inventory.activeWeapon;
        const isMelee = !activeWeapon || activeWeapon.definition?.defType === DefinitionType.Melee;

        // 근접 무기면 아주 가까이 붙어서 공격 (2.5 이하)
        const meleeRange = 2.5;
        const gunRange = 15;
        const effectiveRange = isMelee ? meleeRange : gunRange;

        if (isMelee) {
            // 🥊 근접 무기: 바짝 붙어서 공격
            if (distance > meleeRange) {
                // 적에게 달려가기
                this.moveInDirection(angle);
                this.player.attacking = false;
            } else {
                // 충분히 가까우면 공격!
                if (this.attackCooldown <= 0) {
                    this.player.attacking = true;
                    this.player.startedAttacking = true;
                    this.attackCooldown = 100 + Math.random() * 100;
                }
                // 가까이 붙어있기 (약간 움직임)
                if (distance > 1.5) {
                    this.moveInDirection(angle);
                } else {
                    this.stopMovement();
                }
            }
        } else {
            // 🔫 총: 기존 로직
            if (this.attackCooldown <= 0) {
                this.player.attacking = true;
                this.player.startedAttacking = true;
                this.attackCooldown = 50 + (1 - this.skillLevel) * 80 + Math.random() * 60;
            }

            // 거리 조절 + A-D 스트레이핑
            if (distance < 4) {
                this.moveInDirection(angle + Math.PI);
            } else if (distance > 10 && distance < 20) {
                this.moveInDirection(angle);
            } else if (distance >= 20) {
                this.state = "chase";
            } else {
                if (this.strafeTimer <= 0) {
                    this.strafeDirection *= -1;
                    this.strafeTimer = 150 + Math.random() * 300;
                }
                const strafeAngle = angle + (this.strafeDirection * Math.PI / 2);
                this.moveInDirection(strafeAngle);
            }
        }
    }

    doFlee(): void {
        if (!this.targetPlayer) {
            this.state = "wander";
            return;
        }

        const direction = vecSub(this.targetPlayer.position, this.player.position);
        const angle = Math.atan2(direction.y, direction.x);

        // 도망하면서도 사격 (스킬 높은 봇만)
        if (this.skillLevel > 0.7 && Math.random() < 0.3) {
            this.player.rotation = angle + this.aimError;
            if (this.attackCooldown <= 0) {
                this.player.attacking = true;
                this.player.startedAttacking = true;
                this.attackCooldown = 150 + Math.random() * 200;
            }
        } else {
            this.player.attacking = false;
        }

        this.moveInDirection(angle + Math.PI);

        if (this.player.health > 50) {
            this.state = "chase";
        }
    }

    doLoot(): void {
        if (!this.targetLoot || this.targetLoot.dead) {
            this.targetLoot = null;
            this.state = "wander";
            return;
        }

        const direction = vecSub(this.targetLoot.position, this.player.position);
        const angle = Math.atan2(direction.y, direction.x);
        const distance = vecLen(direction);

        this.player.rotation = angle;
        this.player.attacking = false;

        // 아이템 줍기 거리 확대 (5 유닛 이내면 줍기 시도)
        if (distance < 5) {
            try {
                // 아이템 줍기!
                this.targetLoot.interact(this.player);
                console.log(`[AI Bot] ${this.player.name} picked up ${this.targetLoot.definition?.idString}`);
            } catch (e) {
                // 줍기 실패해도 계속 시도
            }

            // 확실하게 줍기 위해 멈추기
            if (distance < 2) {
                this.stopMovement();
                this.targetLoot = null;
                this.checkWeaponStatus(); // 무기 상태 즉시 업데이트
                this.state = "wander";
            } else {
                this.moveInDirection(angle); // 더 가까이 이동
            }
        } else {
            // 아이템까지 이동
            this.moveInDirection(angle);
        }
    }

    doBreak(): void {
        if (!this.targetObstacle || this.targetObstacle.dead) {
            this.targetObstacle = null;
            this.state = "wander";
            return;
        }

        const direction = vecSub(this.targetObstacle.position, this.player.position);
        const angle = Math.atan2(direction.y, direction.x);
        const distance = vecLen(direction);

        this.player.rotation = angle;

        const def = this.targetObstacle.definition;
        const isDoor = def?.idString?.includes("door");

        if (isDoor) {
            // 🚪 문 열기
            if (distance < 5) {
                try {
                    // 문 상호작용 시도
                    if (typeof this.targetObstacle.interact === 'function') {
                        this.targetObstacle.interact(this.player);
                        console.log(`[AI Bot] ${this.player.name} opened door`);
                    }
                } catch (e) { }
                this.targetObstacle = null;
                this.state = "wander";
            } else {
                this.moveInDirection(angle);
            }
        } else {
            // 📦 상자 부수기
            if (distance < 4) {
                // 공격!
                this.player.attacking = true;
                this.player.startedAttacking = true;

                // 근접 무기로 전환 (상자 부술 때)
                try {
                    const inv = this.player.inventory;
                    if (inv.activeWeaponIndex !== 2) {
                        inv.setActiveWeaponIndex(2); // 근접 무기 슬롯
                    }
                } catch (e) { }

                // 약간 움직이면서 공격 (충돌 회피)
                if (distance > 2) {
                    this.moveInDirection(angle);
                } else {
                    // 아주 가까우면 멈추고 때리기
                    this.stopMovement();
                }
            } else {
                // 상자로 이동
                this.moveInDirection(angle);
                this.player.attacking = false;
            }
        }
    }

    // ========================================
    // 이동 유틸리티
    // ========================================
    moveInDirection(angle: number): void {
        const movement = this.player.movement;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        movement.right = cos > 0.25;
        movement.left = cos < -0.25;
        movement.down = sin > 0.25;
        movement.up = sin < -0.25;
    }

    stopMovement(): void {
        const movement = this.player.movement;
        movement.up = movement.down = movement.left = movement.right = false;
    }
}

// ========================================
// AI 봇 관리자
// ========================================
export class AIBotManager {
    private static instance: AIBotManager | null = null;
    private bots: Map<number, AIBot> = new Map();
    private game: Game | null = null;

    static getInstance(): AIBotManager {
        if (!AIBotManager.instance) {
            AIBotManager.instance = new AIBotManager();
        }
        return AIBotManager.instance;
    }

    setGame(game: Game): void {
        this.game = game;
    }

    addBot(count: number = 1): Player[] {
        if (!this.game) return [];

        const addedPlayers: Player[] = [];

        for (let i = 0; i < count; i++) {
            const name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)] + "_" + Math.floor(Math.random() * 1000);

            const player = this.game.addPlayer(undefined);
            if (!player) continue;

            player.name = name;
            player.isMobile = false;

            const randomSkin = Skins.definitions[Math.floor(Math.random() * Skins.definitions.length)];
            if (randomSkin && !randomSkin.hideFromLoadout) {
                player.loadout.skin = randomSkin;
            }

            this.game.livingPlayers.add(player);
            this.game.spectatablePlayers.push(player);
            this.game.connectedPlayers.add(player);
            this.game.newPlayers.push(player);
            this.game.grid.addObject(player);
            player.setDirty();
            player.joined = true;
            this.game.aliveCountDirty = true;
            this.game.updateObjects = true;
            player.invulnerable = false;

            const aiBot = new AIBot(this.game, player);
            this.bots.set(player.id, aiBot);

            addedPlayers.push(player);
            console.log(`[AI Bot] 봇 추가: ${name} (ID: ${player.id}, 스킬: ${Math.round(aiBot.skillLevel * 100)}%)`);
        }

        return addedPlayers;
    }

    removeBot(playerId: number): boolean {
        const bot = this.bots.get(playerId);
        if (!bot) return false;

        if (!bot.player.dead) {
            bot.player.health = 0;
            bot.player.dead = true;
        }

        this.bots.delete(playerId);
        console.log(`[AI Bot] 봇 제거: ${bot.player.name}`);
        return true;
    }

    removeAllBots(): number {
        let count = 0;
        for (const [id, bot] of this.bots) {
            if (!bot.player.dead) {
                bot.player.health = 0;
                bot.player.dead = true;
            }
            count++;
        }
        this.bots.clear();
        console.log(`[AI Bot] 모든 봇 제거: ${count}개`);
        return count;
    }

    update(dt: number): void {
        for (const [id, bot] of this.bots) {
            if (bot.player.dead || bot.player.disconnected) {
                this.bots.delete(id);
                continue;
            }
            bot.update(dt);
        }
    }

    getBotCount(): number {
        return this.bots.size;
    }

    getBots(): AIBot[] {
        return Array.from(this.bots.values());
    }
}

/**
 * AI 봇 플러그인
 */
export default class AIBotPlugin extends GamePlugin {
    private botManager: AIBotManager = AIBotManager.getInstance();

    protected override initListeners(): void {
        this.on("game_tick", (game) => {
            this.botManager.setGame(game);
            this.botManager.update(game.dt);
        });

        this.on("player_disconnect", (player) => {
            if (this.botManager.getBots().find(b => b.player.id === player.id)) {
                this.botManager.removeBot(player.id);
            }
        });
    }
}

// 전역 봇 매니저 접근용
export const botManager = AIBotManager.getInstance();
