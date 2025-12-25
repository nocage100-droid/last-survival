// Suroi 관리자 API 서버
// 이 파일을 server 폴더에서 별도로 실행: bun run admin-api.ts

import { serve } from "bun";
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "fs";
import { join } from "path";

const PORT = 8080;
const BASE_PATH = join(import.meta.dir, "..");

// CORS 헤더
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

// 파일 경로들
const PATHS = {
    guns: join(BASE_PATH, "common/src/definitions/items/guns.ts"),
    melees: join(BASE_PATH, "common/src/definitions/items/melees.ts"),
    perks: join(BASE_PATH, "common/src/definitions/items/perks.ts"),
    config: join(BASE_PATH, "server/config.json"),
    news: join(BASE_PATH, "client/src/newsPosts"),
};

console.log("🔫 Suroi 관리자 API 서버 시작...");
console.log(`📁 기본 경로: ${BASE_PATH}`);

serve({
    port: PORT,
    async fetch(req) {
        const url = new URL(req.url);

        // CORS preflight
        if (req.method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders });
        }

        try {
            // GET /api/guns - 총기 목록 가져오기
            if (url.pathname === "/api/guns" && req.method === "GET") {
                const content = readFileSync(PATHS.guns, "utf-8");
                return Response.json({ success: true, content }, { headers: corsHeaders });
            }

            // POST /api/guns/add - 새 총기 추가
            if (url.pathname === "/api/guns/add" && req.method === "POST") {
                const body = await req.json();
                const { code, weaponId, spawnLocations, spawnWeight } = body;

                if (!code) {
                    return Response.json({ success: false, error: "코드가 필요합니다" }, { headers: corsHeaders });
                }

                // 백업 생성
                const backupPath = PATHS.guns + ".backup";
                copyFileSync(PATHS.guns, backupPath);
                console.log(`📦 백업 생성: ${backupPath}`);

                // guns.ts에 무기 정의 추가
                let content = readFileSync(PATHS.guns, "utf-8");
                const insertPoint = content.lastIndexOf("] as const");
                if (insertPoint === -1) {
                    return Response.json({ success: false, error: "guns.ts 파일 형식 오류" }, { headers: corsHeaders });
                }
                const newContent = content.slice(0, insertPoint) + "\n    " + code + "\n" + content.slice(insertPoint);
                writeFileSync(PATHS.guns, newContent);
                console.log(`✅ 새 총기 추가됨: ${weaponId}`);

                // 루트 테이블에 무기 추가
                if (weaponId && spawnLocations && spawnWeight) {
                    const lootPath = join(BASE_PATH, "server/src/data/lootTables.ts");
                    copyFileSync(lootPath, lootPath + ".backup");
                    let lootContent = readFileSync(lootPath, "utf-8");

                    const lootEntry = `{ item: "${weaponId}", weight: ${spawnWeight} }`;
                    const tableMapping: Record<string, string> = {
                        ground: "guns:",
                        crate: "regular_crate:",
                        aegis: "aegis_crate:",
                        flint: "flint_crate:",
                        airdrop: "airdrop_guns:",
                        goldAirdrop: "gold_airdrop_guns:",
                        gunLocker: "gun_locker:",
                        briefcase: "briefcase:"
                    };

                    for (const loc of spawnLocations) {
                        const tableKey = tableMapping[loc];
                        if (tableKey && lootContent.includes(tableKey)) {
                            // 해당 테이블의 마지막 항목 뒤에 추가
                            const regex = new RegExp(`(${tableKey.replace(":", "\\s*:\\s*")}[\\s\\S]*?)(\\]\\s*,)`, "m");
                            lootContent = lootContent.replace(regex, `$1,\n            ${lootEntry}\n        $2`);
                        }
                    }

                    writeFileSync(lootPath, lootContent);
                    console.log(`✅ 루트 테이블 업데이트됨: ${spawnLocations.join(", ")}`);
                }

                return Response.json({
                    success: true,
                    message: "총기가 추가되었습니다! 서버를 재빌드하세요: bun run build"
                }, { headers: corsHeaders });
            }

            // GET /api/config - 서버 설정 가져오기
            if (url.pathname === "/api/config" && req.method === "GET") {
                const content = readFileSync(PATHS.config, "utf-8");
                return Response.json({ success: true, config: JSON.parse(content) }, { headers: corsHeaders });
            }

            // POST /api/config - 서버 설정 저장
            if (url.pathname === "/api/config" && req.method === "POST") {
                const body = await req.json();

                // 백업
                copyFileSync(PATHS.config, PATHS.config + ".backup");

                writeFileSync(PATHS.config, JSON.stringify(body, null, 4));
                console.log(`✅ 서버 설정 저장됨!`);
                return Response.json({ success: true, message: "설정이 저장되었습니다!" }, { headers: corsHeaders });
            }

            // POST /api/news - 뉴스 추가
            if (url.pathname === "/api/news" && req.method === "POST") {
                const body = await req.json();
                const { version, content } = body;

                if (!version || !content) {
                    return Response.json({ success: false, error: "버전과 내용이 필요합니다" }, { headers: corsHeaders });
                }

                const newsPath = join(PATHS.news, "v0.21.0-v0.30.0", `${version}.md`);
                writeFileSync(newsPath, content);

                console.log(`✅ 뉴스 저장됨: ${newsPath}`);
                return Response.json({ success: true, message: "뉴스가 저장되었습니다!" }, { headers: corsHeaders });
            }

            // POST /api/melees/add - 새 근접무기 추가
            if (url.pathname === "/api/melees/add" && req.method === "POST") {
                const body = await req.json();
                const { code, meleeId, spawnLocations, spawnWeight } = body;

                if (!code) {
                    return Response.json({ success: false, error: "코드가 필요합니다" }, { headers: corsHeaders });
                }

                // 백업 생성
                copyFileSync(PATHS.melees, PATHS.melees + ".backup");
                console.log(`📦 백업 생성: ${PATHS.melees}.backup`);

                // melees.ts에 무기 정의 추가
                let content = readFileSync(PATHS.melees, "utf-8");
                const insertPoint = content.lastIndexOf("] as const");
                if (insertPoint === -1) {
                    return Response.json({ success: false, error: "melees.ts 파일 형식 오류" }, { headers: corsHeaders });
                }
                const newContent = content.slice(0, insertPoint) + "\n    " + code + "\n" + content.slice(insertPoint);
                writeFileSync(PATHS.melees, newContent);
                console.log(`✅ 새 근접무기 추가됨: ${meleeId}`);

                // 루트 테이블에 추가
                if (meleeId && spawnLocations && spawnWeight) {
                    const lootPath = join(BASE_PATH, "server/src/data/lootTables.ts");
                    copyFileSync(lootPath, lootPath + ".backup");
                    let lootContent = readFileSync(lootPath, "utf-8");

                    const lootEntry = `{ item: "${meleeId}", weight: ${spawnWeight} }`;
                    const tableMapping: Record<string, string> = {
                        meleeCrate: "melee_crate:",
                        regularCrate: "regular_crate:",
                        airdropMelee: "airdrop_melee:"
                    };

                    for (const loc of spawnLocations) {
                        const tableKey = tableMapping[loc];
                        if (tableKey && lootContent.includes(tableKey)) {
                            const regex = new RegExp(`(${tableKey.replace(":", "\\s*:\\s*")}[\\s\\S]*?)(\\]\\s*[,}])`, "m");
                            lootContent = lootContent.replace(regex, `$1,\n            ${lootEntry}\n        $2`);
                        }
                    }

                    writeFileSync(lootPath, lootContent);
                    console.log(`✅ 루트 테이블 업데이트됨: ${spawnLocations.join(", ")}`);
                }

                return Response.json({
                    success: true,
                    message: "근접무기가 추가되었습니다! 서버를 재빌드하세요: bun run build"
                }, { headers: corsHeaders });
            }

            // POST /api/perks/add - 새 퍽 추가
            if (url.pathname === "/api/perks/add" && req.method === "POST") {
                const body = await req.json();
                const { code, perkId } = body;

                if (!code) {
                    return Response.json({ success: false, error: "코드가 필요합니다" }, { headers: corsHeaders });
                }

                // 백업 생성
                copyFileSync(PATHS.perks, PATHS.perks + ".backup");
                console.log(`📦 백업 생성: ${PATHS.perks}.backup`);

                // perks.ts에 퍽 정의 추가
                let content = readFileSync(PATHS.perks, "utf-8");
                const insertPoint = content.lastIndexOf("] as const");
                if (insertPoint === -1) {
                    return Response.json({ success: false, error: "perks.ts 파일 형식 오류" }, { headers: corsHeaders });
                }
                const newContent = content.slice(0, insertPoint) + "\n    " + code + "\n" + content.slice(insertPoint);
                writeFileSync(PATHS.perks, newContent);
                console.log(`✅ 새 퍽 추가됨: ${perkId}`);

                return Response.json({
                    success: true,
                    message: "퍽이 추가되었습니다! 서버를 재빌드하세요: bun run build"
                }, { headers: corsHeaders });
            }

            // ========================================
            // AI 봇 관리 API
            // ========================================

            // POST /api/bots/add - AI 봇 추가
            if (url.pathname === "/api/bots/add" && req.method === "POST") {
                const body = await req.json();
                const { count = 1, serverPort = 8000 } = body;

                // 서버에 HTTP 요청으로 봇 추가 명령 전송
                try {
                    const response = await fetch(`http://127.0.0.1:${serverPort}/api/addBots?count=${count}`);
                    const result = await response.json();
                    return Response.json(result, { headers: corsHeaders });
                } catch (e) {
                    // 직접 파일 기반으로 봇 추가 명령 저장
                    const botCommandPath = join(BASE_PATH, "server/bot_command.json");
                    writeFileSync(botCommandPath, JSON.stringify({
                        action: "add",
                        count,
                        timestamp: Date.now()
                    }));

                    return Response.json({
                        success: true,
                        message: `${count}개의 AI 봇 추가 명령이 전송되었습니다. 서버 재시작 필요.`,
                        note: "게임 서버에 직접 연결할 수 없어 명령 파일을 생성했습니다."
                    }, { headers: corsHeaders });
                }
            }

            // POST /api/bots/remove - AI 봇 제거
            if (url.pathname === "/api/bots/remove" && req.method === "POST") {
                const body = await req.json();
                const { botId, removeAll = false, serverPort = 8000 } = body;

                try {
                    const endpoint = removeAll ? "removeAllBots" : `removeBot?id=${botId}`;
                    const response = await fetch(`http://127.0.0.1:${serverPort}/api/${endpoint}`);
                    const result = await response.json();
                    return Response.json(result, { headers: corsHeaders });
                } catch (e) {
                    return Response.json({
                        success: false,
                        error: "게임 서버에 연결할 수 없습니다."
                    }, { headers: corsHeaders });
                }
            }

            // GET /api/bots - 봇 목록 가져오기
            if (url.pathname === "/api/bots" && req.method === "GET") {
                const serverPort = url.searchParams.get("serverPort") || "8000";

                try {
                    const response = await fetch(`http://127.0.0.1:${serverPort}/api/bots`);
                    const result = await response.json();
                    return Response.json(result, { headers: corsHeaders });
                } catch (e) {
                    return Response.json({
                        success: true,
                        bots: [],
                        count: 0,
                        note: "게임 서버에 연결할 수 없습니다."
                    }, { headers: corsHeaders });
                }
            }

            // 404
            return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });

        } catch (error: any) {
            console.error("❌ 오류:", error);
            return Response.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
        }
    },
});

console.log(`✅ 관리자 API 서버 실행 중: http://localhost:${PORT}`);
console.log(`
📌 사용 가능한 API:
   GET  /api/guns      - 총기 정의 파일 가져오기
   POST /api/guns/add  - 새 총기 추가
   GET  /api/config    - 서버 설정 가져오기
   POST /api/config    - 서버 설정 저장
   POST /api/news      - 뉴스 추가
`);
