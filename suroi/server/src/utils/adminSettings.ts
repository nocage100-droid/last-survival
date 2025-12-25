/**
 * 🔧 관리자 설정 영속화 시스템
 * 서버 재시작 후에도 설정값 유지
 */

import * as fs from "fs";
import * as path from "path";

// 설정 파일 경로
const SETTINGS_FILE = path.join(__dirname, "../../admin-settings.json");

// 기본 설정값
export interface AdminSettings {
    autoSpawnBotCount: number;
    lastUpdated: string;
}

const DEFAULT_SETTINGS: AdminSettings = {
    autoSpawnBotCount: 0,
    lastUpdated: new Date().toISOString()
};

/**
 * 설정 로드
 */
export function loadSettings(): AdminSettings {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            const data = fs.readFileSync(SETTINGS_FILE, "utf-8");
            const settings = JSON.parse(data) as AdminSettings;
            console.log(`[Settings] 설정 로드: autoBots=${settings.autoSpawnBotCount}`);
            return { ...DEFAULT_SETTINGS, ...settings };
        }
    } catch (e) {
        console.error("[Settings] 설정 로드 실패:", e);
    }
    return DEFAULT_SETTINGS;
}

/**
 * 설정 저장
 */
export function saveSettings(settings: Partial<AdminSettings>): boolean {
    try {
        const current = loadSettings();
        const updated = {
            ...current,
            ...settings,
            lastUpdated: new Date().toISOString()
        };
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2), "utf-8");
        console.log(`[Settings] 설정 저장 완료: autoBots=${updated.autoSpawnBotCount}`);
        return true;
    } catch (e) {
        console.error("[Settings] 설정 저장 실패:", e);
        return false;
    }
}

/**
 * 자동 봇 수 가져오기
 */
export function getAutoSpawnBotCount(): number {
    const settings = loadSettings();
    return settings.autoSpawnBotCount;
}

/**
 * 자동 봇 수 설정
 */
export function setAutoSpawnBotCount(count: number): boolean {
    const saved = saveSettings({ autoSpawnBotCount: count });
    if (saved) {
        (global as any).autoSpawnBotCount = count;
    }
    return saved;
}

/**
 * 서버 시작 시 설정 초기화
 */
export function initSettings(): void {
    const settings = loadSettings();
    (global as any).autoSpawnBotCount = settings.autoSpawnBotCount;
    console.log(`[Settings] 초기화 완료: autoSpawnBotCount=${settings.autoSpawnBotCount}`);
}
