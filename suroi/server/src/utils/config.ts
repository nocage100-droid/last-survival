import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

// 명령줄 인수 또는 환경변수로 config 파일 선택
// 사용법: bun src/server.ts config-duo.json
const args = process.argv.slice(2);
const configArg = args.find(arg => arg.endsWith('.json'));
const configFile = (configArg || process.env.SUROI_CONFIG || "config.json").trim();

// process.cwd()는 서버가 실행되는 디렉토리 (server/)
const configPath = resolve(process.cwd(), configFile);

console.log(`[Config] 인수: ${args.join(', ')}`);
console.log(`[Config] 설정 파일: ${configFile}`);
console.log(`[Config] 경로: ${configPath}`);

let configExists = existsSync(configPath);
if (!configExists) {
    const defaultPath = resolve(process.cwd(), "config.json");
    const examplePath = resolve(process.cwd(), "config.example.json");

    if (!existsSync(defaultPath) && existsSync(examplePath)) {
        writeFileSync(defaultPath, readFileSync(examplePath, "utf8"));
    }
    console.log(`[Config] ${configFile} 없음, config.json 사용`);
}

import type { ConfigSchema } from "./config.d";

// JSON 파일을 직접 읽어서 파싱
const finalConfigPath = configExists ? configPath : resolve(process.cwd(), "config.json");
const configContent = readFileSync(finalConfigPath, "utf8");
export const Config = JSON.parse(configContent) as ConfigSchema;

console.log(`[Config] ✅ 로드 완료 - 포트: ${Config.port}, 모드: ${Config.teamMode}`);

