// 게임 데이터 (실제 정의 파일에서 가져온 구조)
const gameData = {
    guns: [
        { id: "g19", name: "G19", ammo: "9mm", damage: 13, fireDelay: 110, tier: "D", capacity: 15, range: 120 },
        { id: "cz75a", name: "CZ-75A", ammo: "9mm", damage: 9, fireDelay: 60, tier: "D", capacity: 16, range: 70 },
        { id: "m1895", name: "M1895", ammo: "762mm", damage: 24.5, fireDelay: 375, tier: "D", capacity: 7, range: 160 },
        { id: "deagle", name: "DEagle", ammo: "50cal", damage: 37, fireDelay: 200, tier: "B", capacity: 7, range: 130 },
        { id: "rsh12", name: "RSh-12", ammo: "50cal", damage: 60, fireDelay: 600, tier: "A", capacity: 5, range: 120 },
        { id: "mp5k", name: "MP5k", ammo: "9mm", damage: 12.75, fireDelay: 62, tier: "D", capacity: 20, range: 100 },
        { id: "vector", name: "Vector", ammo: "9mm", damage: 9, fireDelay: 50, tier: "B", capacity: 33, range: 85 },
        { id: "ak47", name: "AK-47", ammo: "762mm", damage: 14.5, fireDelay: 90, tier: "C", capacity: 30, range: 160 },
        { id: "m16a4", name: "M16A4", ammo: "556mm", damage: 21, fireDelay: 75, tier: "C", capacity: 30, range: 180 },
        { id: "mosin", name: "Mosin-Nagant", ammo: "762mm", damage: 72, fireDelay: 1500, tier: "A", capacity: 5, range: 250 },
        { id: "tango51", name: "Tango 51", ammo: "762mm", damage: 79, fireDelay: 1750, tier: "S", capacity: 5, range: 280 },
        { id: "hp18", name: "HP-18", ammo: "12gauge", damage: 10, fireDelay: 300, tier: "D", capacity: 5, range: 40 },
        { id: "m590m", name: "M590M", ammo: "12gauge", damage: 12, fireDelay: 550, tier: "B", capacity: 8, range: 50 }
    ],
    melees: [
        { id: "fists", name: "주먹", damage: 20, cooldown: 250, range: 2.5 },
        { id: "kbar", name: "K-bar", damage: 25, cooldown: 225, range: 2.7 },
        { id: "baseball_bat", name: "야구 방망이", damage: 34, cooldown: 340, range: 3.5 },
        { id: "hatchet", name: "손도끼", damage: 27, cooldown: 285, range: 2.6 },
        { id: "sickle", name: "낫", damage: 30, cooldown: 200, range: 2.9 },
        { id: "kukri", name: "쿠크리", damage: 32, cooldown: 280, range: 2.8 },
        { id: "ice_pick", name: "빙벽 곡괭이", damage: 35, cooldown: 300, range: 3.0 },
        { id: "scythe", name: "대낫", damage: 50, cooldown: 450, range: 4.0 }
    ],
    perks: [
        { id: "second_wind", name: "세컨드 윈드", category: "Normal", quality: "positive", effect: "체력 50% 이하시 속도 40% 증가" },
        { id: "flechettes", name: "플레셰트", category: "Normal", quality: "neutral", effect: "샷건 탄환 3갈래로 분할, 피해 40%" },
        { id: "extended_mags", name: "확장 탄창", category: "Normal", quality: "positive", effect: "모든 총기 탄창 용량 증가" },
        { id: "demo_expert", name: "폭파 전문가", category: "Normal", quality: "positive", effect: "폭발 범위 2배, 10초마다 수류탄 회복" },
        { id: "berserker", name: "버서커", category: "Normal", quality: "positive", effect: "근접무기 속도/피해 20% 증가" },
        { id: "low_profile", name: "로우 프로파일", category: "Normal", quality: "positive", effect: "크기 20% 감소, 폭발 피해 50% 감소" },
        { id: "lycanthropy", name: "늑대인간 변신", category: "Halloween", quality: "positive", effect: "늑대인간 변신, 속도/체력/피해 증가" },
        { id: "infected", name: "감염됨", category: "Infection", quality: "negative", effect: "30초마다 랜덤 퍽 부여, 주변 감염" },
        { id: "hollow_points", name: "할로우 포인트", category: "Hunted", quality: "positive", effect: "피해 10% 증가, 맞은 적 5초간 표시" },
        { id: "thermal_goggles", name: "열화상 고글", category: "Hunted", quality: "positive", effect: "근처 플레이어 체력바 표시" }
    ],
    config: { hostname: "127.0.0.1", port: 8000, map: "normal", teamMode: "solo", maxPlayersPerGame: 80, maxGames: 5 }
};

let currentUser = null, editingItem = null, editType = null;

// 로그인
function login() {
    const role = document.getElementById('login-role').value;
    const password = document.getElementById('login-password').value;
    const validPasswords = { developr: 'developr', administratr: 'administratr' };
    if (validPasswords[role] === password) {
        currentUser = role;
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('admin-panel').style.display = 'block';
        document.getElementById('current-user').textContent = `👤 ${role}`;
        loadAllData();
    } else {
        document.getElementById('login-alert').innerHTML = '<div class="alert alert-error">❌ 비밀번호가 올바르지 않습니다.</div>';
    }
}

function logout() {
    currentUser = null;
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('admin-panel').style.display = 'none';
}

// 페이지 전환
document.querySelectorAll('.sidebar-menu a').forEach(link => {
    link.addEventListener('click', e => {
        e.preventDefault();
        document.querySelectorAll('.sidebar-menu a').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById(link.dataset.page).classList.add('active');
    });
});

// 데이터 로드
function loadAllData() {
    document.getElementById('stat-guns').textContent = gameData.guns.length;
    document.getElementById('stat-melees').textContent = gameData.melees.length;
    document.getElementById('stat-perks').textContent = gameData.perks.length;
    loadGuns(); loadMelees(); loadPerks();
    refreshBotList(); // 봇 목록 로드
    refreshPlayerStats(); // 플레이어 통계 로드
}

// ========================================
// 📊 플레이어 통계 (유저 수, IP 목록)
// ========================================
async function refreshPlayerStats() {
    const ports = [4001, 4011, 4021];
    let totalUsers = 0;
    let totalBots = 0;
    let totalPlayers = 0;
    let allIPs = [];

    for (const port of ports) {
        try {
            const response = await fetch(`http://127.0.0.1:${port}/api/players/stats`);
            const data = await response.json();
            if (data.success && data.stats) {
                totalUsers += data.stats.realUsers || 0;
                totalBots += data.stats.bots || 0;
                totalPlayers += data.stats.totalPlayers || 0;

                // IP 목록에 서버 정보 추가
                if (data.ipList) {
                    const serverName = port === 4001 ? '솔로' : port === 4011 ? '듀오' : '스쿼드';
                    data.ipList.forEach(item => {
                        allIPs.push({
                            ...item,
                            server: serverName,
                            port: port
                        });
                    });
                }
            }
        } catch (e) {
            // 서버 연결 실패 무시
        }
    }

    // 통계 카드 업데이트
    const usersEl = document.getElementById('stat-users');
    const botsEl = document.getElementById('stat-bots');
    const totalEl = document.getElementById('stat-total');

    if (usersEl) usersEl.textContent = totalUsers;
    if (botsEl) botsEl.textContent = totalBots;
    if (totalEl) totalEl.textContent = totalPlayers;

    // IP 목록 렌더링
    const listDiv = document.getElementById('connected-users-list');
    if (listDiv) {
        if (allIPs.length > 0) {
            listDiv.innerHTML = allIPs.map(item => `
                <div style="padding: 5px 0; border-bottom: 1px solid #222;">
                    <span style="color: #0ff;">${item.server}</span>
                    <span style="color: #888; margin: 0 8px;">|</span>
                    <span style="color: #ff0;">${item.ip}</span>
                    <span style="color: #888; margin: 0 8px;">→</span>
                    <span style="color: #0f0;">${item.names.join(', ')}</span>
                    <span style="color: #666; margin-left: 8px;">(${item.count}명)</span>
                </div>
            `).join('');
        } else {
            listDiv.innerHTML = '<div style="color: #888;">현재 접속자가 없습니다.</div>';
        }
    }
}

// 자동 갱신 (10초마다)
setInterval(refreshPlayerStats, 10000);

// ========================================
// AI 봇 관리 기능
// ========================================
// 게임은 워커 프로세스에서 실행됨 (포트 = 메인포트 + 게임ID + 1)
// 솔로: 4001, 듀오: 4011, 스쿼드: 4021
const GAME_WORKER_PORTS = {
    solo: 4001,
    duo: 4011,
    squad: 4021
};

// 대시보드에서 봇 추가 (서버 선택 포함)
async function addBotsFromDashboard(count) {
    const selectedPort = document.getElementById('dashboard-server-port')?.value || '4000';
    const workerPort = parseInt(selectedPort) + 1;

    try {
        const response = await fetch(`http://127.0.0.1:${workerPort}/api/addBots?count=${count}`);
        const result = await response.json();
        alert(`🤖 ${result.message}`);
        refreshBotList();
    } catch (e) {
        console.error('봇 추가 실패:', e);
        alert('❌ 게임 서버에 연결할 수 없습니다.\n서버가 실행 중인지 확인하세요.');
    }
}

// 대시보드에서 모든 봇 제거
async function removeAllBotsFromDashboard() {
    const selectedPort = document.getElementById('dashboard-server-port')?.value || '8000';
    const workerPort = parseInt(selectedPort) + 1;

    if (!confirm('정말 모든 AI 봇을 제거하시겠습니까?')) return;

    try {
        const response = await fetch(`http://127.0.0.1:${workerPort}/api/removeAllBots`);
        const result = await response.json();
        alert(`🗑️ ${result.message}`);
        refreshBotList();
    } catch (e) {
        console.error('봇 제거 실패:', e);
        alert('❌ 게임 서버에 연결할 수 없습니다.');
    }
}

async function addBots(count) {
    const port = GAME_WORKER_PORTS.solo; // 기본: 솔로 서버
    try {
        const response = await fetch(`http://127.0.0.1:${port}/api/addBots?count=${count}`);
        const result = await response.json();
        alert(`🤖 ${result.message}`);
        refreshBotList();
    } catch (e) {
        console.error('봇 추가 실패:', e);
        alert('❌ 게임 서버에 연결할 수 없습니다.\n서버가 실행 중인지 확인하세요.');
    }
}

async function addBotsFromForm() {
    const count = parseInt(document.getElementById('bot-count').value) || 3;
    const selectedPort = document.getElementById('bot-server-port').value;
    // 메인 포트를 워커 포트로 변환 (메인 + 1)
    const workerPort = parseInt(selectedPort) + 1;

    try {
        const response = await fetch(`http://127.0.0.1:${workerPort}/api/addBots?count=${count}`);
        const result = await response.json();
        alert(`🤖 ${result.message}`);
        refreshBotList();
    } catch (e) {
        console.error('봇 추가 실패:', e);
        alert('❌ 게임 서버에 연결할 수 없습니다.\n서버가 실행 중인지 확인하세요.');
    }
}

async function removeBot(id) {
    const selectedPort = document.getElementById('bot-server-port')?.value || '8000';
    const workerPort = parseInt(selectedPort) + 1;

    try {
        const response = await fetch(`http://127.0.0.1:${workerPort}/api/removeBot?id=${id}`);
        const result = await response.json();
        alert(`🗑️ ${result.message}`);
        refreshBotList();
    } catch (e) {
        console.error('봇 제거 실패:', e);
        alert('❌ 게임 서버에 연결할 수 없습니다.');
    }
}

async function removeAllBots() {
    const selectedPort = document.getElementById('bot-server-port')?.value || '8000';
    const workerPort = parseInt(selectedPort) + 1;

    if (!confirm('정말 모든 AI 봇을 제거하시겠습니까?')) return;

    try {
        const response = await fetch(`http://127.0.0.1:${workerPort}/api/removeAllBots`);
        const result = await response.json();
        alert(`🗑️ ${result.message}`);
        refreshBotList();
    } catch (e) {
        console.error('봇 제거 실패:', e);
        alert('❌ 게임 서버에 연결할 수 없습니다.');
    }
}

async function refreshBotList() {
    const selectedPort = document.getElementById('bot-server-port')?.value || '8000';
    const workerPort = parseInt(selectedPort) + 1;

    try {
        const response = await fetch(`http://127.0.0.1:${workerPort}/api/bots`);
        const result = await response.json();

        const tbody = document.getElementById('bots-list');
        const countDisplay = document.getElementById('bot-count-display');
        const statBots = document.getElementById('stat-bots');

        if (countDisplay) countDisplay.textContent = result.count || 0;
        if (statBots) statBots.textContent = result.count || 0;

        if (tbody) {
            if (result.bots && result.bots.length > 0) {
                tbody.innerHTML = result.bots.map(bot => `
                    <tr>
                        <td>${bot.id}</td>
                        <td>${bot.name}</td>
                        <td>${Math.round(bot.health)}%</td>
                        <td><span class="bot-state bot-state-${bot.state}">${bot.state}</span></td>
                        <td><button class="btn btn-danger btn-sm" onclick="removeBot(${bot.id})">🗑️ 제거</button></td>
                    </tr>
                `).join('');
            } else {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">활성 봇이 없습니다</td></tr>';
            }
        }
    } catch (e) {
        console.error('봇 목록 로드 실패:', e);
        const tbody = document.getElementById('bots-list');
        const statBots = document.getElementById('stat-bots');
        if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #ff6b6b;">서버에 연결할 수 없습니다</td></tr>';
        if (statBots) statBots.textContent = '-';
    }
}

// 봇 목록 자동 새로고침 (10초마다)
setInterval(refreshBotList, 10000);


function loadGuns() {
    const tbody = document.getElementById('guns-list');
    tbody.innerHTML = gameData.guns.map(g => `
        <tr>
            <td>${g.id}</td><td>${g.name}</td><td>${g.ammo}</td><td>${g.damage}</td>
            <td>${Math.round(1000 / g.fireDelay * 60)}RPM</td><td class="tier-${g.tier}">${g.tier}</td>
            <td><button class="btn btn-primary" onclick="editGun('${g.id}')">✏️ 수정</button></td>
        </tr>`).join('');
}

function loadMelees() {
    const tbody = document.getElementById('melees-list');
    tbody.innerHTML = gameData.melees.map(m => `
        <tr>
            <td>${m.id}</td><td>${m.name}</td><td>${m.damage}</td><td>${m.cooldown}ms</td><td>${m.range}</td>
            <td><button class="btn btn-primary" onclick="editMelee('${m.id}')">✏️ 수정</button></td>
        </tr>`).join('');
}

function loadPerks() {
    const tbody = document.getElementById('perks-list');
    tbody.innerHTML = gameData.perks.map(p => `
        <tr>
            <td>${p.id}</td><td>${p.name}</td><td>${p.category}</td>
            <td class="quality-${p.quality}">${p.quality}</td><td>${p.effect}</td>
            <td><button class="btn btn-primary" onclick="editPerk('${p.id}')">✏️ 수정</button></td>
        </tr>`).join('');
}

// 총기 편집
function editGun(id) {
    const gun = gameData.guns.find(g => g.id === id);
    if (!gun) return;
    editType = 'gun'; editingItem = gun;
    document.getElementById('modal-title').textContent = `🔫 총기 수정: ${gun.name}`;
    document.getElementById('modal-body').innerHTML = `
        <div class="form-row">
            <div class="form-group"><label>ID</label><input type="text" id="edit-id" value="${gun.id}" readonly></div>
            <div class="form-group"><label>이름</label><input type="text" id="edit-name" value="${gun.name}"></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label>탄약 종류</label>
                <select id="edit-ammo"><option ${gun.ammo === '9mm' ? 'selected' : ''}>9mm</option><option ${gun.ammo === '762mm' ? 'selected' : ''}>762mm</option>
                <option ${gun.ammo === '556mm' ? 'selected' : ''}>556mm</option><option ${gun.ammo === '50cal' ? 'selected' : ''}>50cal</option>
                <option ${gun.ammo === '12gauge' ? 'selected' : ''}>12gauge</option><option ${gun.ammo === '545mm' ? 'selected' : ''}>545mm</option></select></div>
            <div class="form-group"><label>티어</label>
                <select id="edit-tier"><option ${gun.tier === 'S' ? 'selected' : ''}>S</option><option ${gun.tier === 'A' ? 'selected' : ''}>A</option>
                <option ${gun.tier === 'B' ? 'selected' : ''}>B</option><option ${gun.tier === 'C' ? 'selected' : ''}>C</option><option ${gun.tier === 'D' ? 'selected' : ''}>D</option></select></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label>피해량</label><input type="number" id="edit-damage" value="${gun.damage}" step="0.1"></div>
            <div class="form-group"><label>발사 딜레이(ms)</label><input type="number" id="edit-firedelay" value="${gun.fireDelay}"></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label>탄창 용량</label><input type="number" id="edit-capacity" value="${gun.capacity}"></div>
            <div class="form-group"><label>사거리</label><input type="number" id="edit-range" value="${gun.range}"></div>
        </div>`;
    document.getElementById('edit-modal').style.display = 'flex';
}

function editMelee(id) {
    const melee = gameData.melees.find(m => m.id === id);
    if (!melee) return;
    editType = 'melee'; editingItem = melee;
    document.getElementById('modal-title').textContent = `🗡️ 근접무기 수정: ${melee.name}`;
    document.getElementById('modal-body').innerHTML = `
        <div class="form-row">
            <div class="form-group"><label>ID</label><input type="text" id="edit-id" value="${melee.id}" readonly></div>
            <div class="form-group"><label>이름</label><input type="text" id="edit-name" value="${melee.name}"></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label>피해량</label><input type="number" id="edit-damage" value="${melee.damage}"></div>
            <div class="form-group"><label>공격 쿨다운(ms)</label><input type="number" id="edit-cooldown" value="${melee.cooldown}"></div>
        </div>
        <div class="form-group"><label>사거리</label><input type="number" id="edit-range" value="${melee.range}" step="0.1"></div>`;
    document.getElementById('edit-modal').style.display = 'flex';
}

function editPerk(id) {
    const perk = gameData.perks.find(p => p.id === id);
    if (!perk) return;
    editType = 'perk'; editingItem = perk;
    document.getElementById('modal-title').textContent = `⭐ 퍽 수정: ${perk.name}`;
    document.getElementById('modal-body').innerHTML = `
        <div class="form-row">
            <div class="form-group"><label>ID</label><input type="text" id="edit-id" value="${perk.id}" readonly></div>
            <div class="form-group"><label>이름</label><input type="text" id="edit-name" value="${perk.name}"></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label>카테고리</label>
                <select id="edit-category"><option ${perk.category === 'Normal' ? 'selected' : ''}>Normal</option>
                <option ${perk.category === 'Halloween' ? 'selected' : ''}>Halloween</option>
                <option ${perk.category === 'Hunted' ? 'selected' : ''}>Hunted</option>
                <option ${perk.category === 'Infection' ? 'selected' : ''}>Infection</option></select></div>
            <div class="form-group"><label>품질</label>
                <select id="edit-quality"><option ${perk.quality === 'positive' ? 'selected' : ''}>positive</option>
                <option ${perk.quality === 'neutral' ? 'selected' : ''}>neutral</option>
                <option ${perk.quality === 'negative' ? 'selected' : ''}>negative</option></select></div>
        </div>
        <div class="form-group"><label>효과 설명</label><textarea id="edit-effect" rows="3">${perk.effect}</textarea></div>`;
    document.getElementById('edit-modal').style.display = 'flex';
}

function closeModal() { document.getElementById('edit-modal').style.display = 'none'; }

function saveEdit() {
    if (editType === 'gun') {
        editingItem.name = document.getElementById('edit-name').value;
        editingItem.ammo = document.getElementById('edit-ammo').value;
        editingItem.tier = document.getElementById('edit-tier').value;
        editingItem.damage = parseFloat(document.getElementById('edit-damage').value);
        editingItem.fireDelay = parseInt(document.getElementById('edit-firedelay').value);
        editingItem.capacity = parseInt(document.getElementById('edit-capacity').value);
        editingItem.range = parseInt(document.getElementById('edit-range').value);
        loadGuns();
    } else if (editType === 'melee') {
        editingItem.name = document.getElementById('edit-name').value;
        editingItem.damage = parseInt(document.getElementById('edit-damage').value);
        editingItem.cooldown = parseInt(document.getElementById('edit-cooldown').value);
        editingItem.range = parseFloat(document.getElementById('edit-range').value);
        loadMelees();
    } else if (editType === 'perk') {
        editingItem.name = document.getElementById('edit-name').value;
        editingItem.category = document.getElementById('edit-category').value;
        editingItem.quality = document.getElementById('edit-quality').value;
        editingItem.effect = document.getElementById('edit-effect').value;
        loadPerks();
    }
    closeModal();
    alert('✅ 수정되었습니다!\n\n⚠️ 실제 적용하려면 정의 파일을 직접 수정하고 서버를 재빌드하세요.');
}

function changeMap(map) { gameData.config.map = map; document.getElementById('stat-map').textContent = map; alert(`🗺️ 맵 "${map}"으로 변경!\n서버 재시작 필요`); }
function changeMode(mode) { gameData.config.teamMode = mode; alert(`👥 팀 모드 "${mode}"로 변경!\n서버 재시작 필요`); }
function filterGuns() { /* 검색 기능 */ }
function filterPerks() { /* 필터 기능 */ }
function showAddGunModal() { alert('새 총기는 common/src/definitions/items/guns.ts 파일에 추가하세요.'); }
function showAddMeleeModal() { alert('새 근접무기는 common/src/definitions/items/melees.ts 파일에 추가하세요.'); }
function showAddPerkModal() { alert('새 퍽는 common/src/definitions/items/perks.ts 파일에 추가하세요.'); }
function saveMapSettings() { alert('맵 설정이 저장되었습니다.\nserver/config.json 수정 및 서버 재시작 필요'); }
function saveModeSettings() { alert('모드 설정이 저장되었습니다.\nserver/config.json 수정 및 서버 재시작 필요'); }
function saveServerSettings() { alert('서버 설정이 저장되었습니다.\nserver/config.json 수정 및 서버 재시작 필요'); }
function createNews() {
    const title = document.getElementById('news-title').value;
    const author = document.getElementById('news-author').value;
    const version = document.getElementById('news-version').value;
    const content = document.getElementById('news-content').value;
    if (!title || !version || !content) { alert('모든 필드를 입력하세요.'); return; }
    const date = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
    const md = `---\ntitle: ${title}\nauthor: ${author}\ndate: ${date}\n---\n${content}`;
    navigator.clipboard.writeText(md).then(() => alert(`✅ 클립보드에 복사됨!\n\n저장 경로: client/src/newsPosts/v0.21.0-v0.30.0/${version}.md`));
}
document.getElementById('login-password').addEventListener('keypress', e => { if (e.key === 'Enter') login(); });

// ========================================
// 📢 공지사항 / 알림 기능
// ========================================
const announcementHistory = [];

function previewAnnouncement() {
    const message = document.getElementById('announce-message').value || '알림 미리보기';
    const fontSize = document.getElementById('announce-fontsize').value;
    const color = document.getElementById('announce-color').value;
    const bgColor = document.getElementById('announce-bgcolor').value;
    const position = document.getElementById('announce-position').value;

    const preview = document.getElementById('announce-preview');
    preview.style.fontSize = fontSize + 'px';
    preview.style.color = color;
    preview.style.backgroundColor = bgColor;
    preview.innerHTML = message;
}

async function sendAnnouncement() {
    const message = document.getElementById('announce-message').value;
    if (!message) {
        alert('메시지를 입력하세요.');
        return;
    }

    const data = {
        message: message,
        fontSize: document.getElementById('announce-fontsize').value,
        color: document.getElementById('announce-color').value,
        bgColor: document.getElementById('announce-bgcolor').value,
        position: document.getElementById('announce-position').value,
        duration: document.getElementById('announce-duration').value,
        animation: document.getElementById('announce-animation').value,
        type: document.getElementById('announce-type').value,
        server: document.getElementById('announce-server').value
    };

    const servers = data.server === 'all' ? [4001, 4011, 4021] : [parseInt(data.server) + 1];

    for (const port of servers) {
        try {
            await fetch(`http://127.0.0.1:${port}/api/announcement`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        } catch (e) {
            console.error(`서버 ${port}에 전송 실패:`, e);
        }
    }

    // 기록 저장
    announcementHistory.unshift({
        time: new Date().toLocaleTimeString('ko-KR'),
        message: message.substring(0, 30) + (message.length > 30 ? '...' : ''),
        server: data.server === 'all' ? '전체' : data.server,
        type: data.type
    });

    updateAnnouncementHistory();
    alert('📢 공지사항이 전송되었습니다!');
}

function updateAnnouncementHistory() {
    const tbody = document.getElementById('announcement-history');
    if (!tbody) return;

    tbody.innerHTML = announcementHistory.slice(0, 20).map(item => `
        <tr>
            <td>${item.time}</td>
            <td>${item.message}</td>
            <td>${item.server}</td>
            <td>${item.type}</td>
        </tr>
    `).join('');
}

// ========================================
// 💬 채팅 관리 기능
// ========================================
const muteList = [];
const chatLog = [];

async function mutePlayer() {
    const target = document.getElementById('mute-target').value;
    const duration = document.getElementById('mute-duration').value;
    const reason = document.getElementById('mute-reason').value || '사유 없음';

    if (!target) {
        alert('플레이어 이름 또는 IP를 입력하세요.');
        return;
    }

    const data = {
        target: target,
        duration: parseInt(duration),
        reason: reason
    };

    // 모든 서버에 전송
    const servers = [8000, 8010, 8020];
    for (const port of servers) {
        try {
            await fetch(`http://127.0.0.1:${port}/api/mute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        } catch (e) {
            console.error(`서버 ${port}에 전송 실패:`, e);
        }
    }

    // 로컬 목록에 추가
    const durationText = duration == -1 ? '영구' : `${duration}분`;
    muteList.push({
        target: target,
        reason: reason,
        duration: durationText,
        expires: duration == -1 ? null : Date.now() + duration * 60000
    });

    updateMuteList();
    document.getElementById('mute-target').value = '';
    document.getElementById('mute-reason').value = '';
    alert(`🔇 ${target} 플레이어가 채금되었습니다. (${durationText})`);
}

async function unmutePlayer(index) {
    const item = muteList[index];
    if (!item) return;

    // 모든 서버에 전송
    const servers = [8000, 8010, 8020];
    for (const port of servers) {
        try {
            await fetch(`http://127.0.0.1:${port}/api/unmute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target: item.target })
            });
        } catch (e) {
            console.error(`서버 ${port}에 전송 실패:`, e);
        }
    }

    muteList.splice(index, 1);
    updateMuteList();
    alert(`🔊 ${item.target} 플레이어의 채금이 해제되었습니다.`);
}

function updateMuteList() {
    const tbody = document.getElementById('mute-list');
    if (!tbody) return;

    const now = Date.now();
    tbody.innerHTML = muteList.map((item, index) => {
        let remaining = item.duration;
        if (item.expires) {
            const diff = item.expires - now;
            if (diff <= 0) {
                return ''; // 만료됨
            }
            remaining = Math.ceil(diff / 60000) + '분';
        }
        return `
            <tr>
                <td>${item.target}</td>
                <td>${item.reason}</td>
                <td>${remaining}</td>
                <td><button class="btn btn-success btn-sm" onclick="unmutePlayer(${index})">🔊 해제</button></td>
            </tr>
        `;
    }).join('');
}

async function saveChatSettings() {
    const data = {
        enabled: document.getElementById('chat-enabled').value === 'true',
        cooldown: parseInt(document.getElementById('chat-cooldown').value),
        maxLength: parseInt(document.getElementById('chat-maxlength').value),
        filter: document.getElementById('chat-filter').value === 'true',
        teamOnly: document.getElementById('chat-team-only').value === 'true'
    };

    // 모든 서버에 전송
    const servers = [8000, 8010, 8020];
    for (const port of servers) {
        try {
            await fetch(`http://127.0.0.1:${port}/api/chat/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        } catch (e) {
            console.error(`서버 ${port}에 전송 실패:`, e);
        }
    }

    alert('💬 채팅 설정이 저장되었습니다.');
}

async function refreshChatLog() {
    const logDiv = document.getElementById('chat-log');
    if (!logDiv) return;

    // 여러 서버에서 로그 가져오기
    const servers = [8000, 8010, 8020];
    let allLogs = [];

    for (const port of servers) {
        try {
            const response = await fetch(`http://127.0.0.1:${port}/api/chat/log`);
            const data = await response.json();
            if (data.logs) {
                allLogs = allLogs.concat(data.logs.map(log => ({ ...log, server: port })));
            }
        } catch (e) {
            console.error(`서버 ${port}에서 로그 가져오기 실패:`, e);
        }
    }

    // 시간순 정렬
    allLogs.sort((a, b) => new Date(b.time) - new Date(a.time));

    if (allLogs.length > 0) {
        logDiv.innerHTML = allLogs.slice(0, 100).map(log => `
            <div style="margin-bottom: 5px;">
                <span style="color: #666;">[${log.time}]</span>
                <span style="color: #888;">[${log.server}]</span>
                <span style="color: #00bcd4; font-weight: bold;">${log.player}:</span>
                <span style="color: #fff;">${log.message}</span>
            </div>
        `).join('');
    } else {
        logDiv.innerHTML = '<div style="color: #666;">채팅 로그가 없습니다.</div>';
    }
}

function clearChatLog() {
    const logDiv = document.getElementById('chat-log');
    if (logDiv) {
        logDiv.innerHTML = '<div style="color: #666;">채팅 로그가 지워졌습니다.</div>';
    }
}

// 미리보기 실시간 업데이트
document.addEventListener('DOMContentLoaded', () => {
    const inputs = ['announce-message', 'announce-fontsize', 'announce-color', 'announce-bgcolor'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', previewAnnouncement);
            el.addEventListener('change', previewAnnouncement);
        }
    });

    // 채금 목록 자동 업데이트
    setInterval(updateMuteList, 30000);

    // 자동 봇 설정 로드
    getAutoBots();
});

// ============================================
// 🤖 자동 봇 투입 설정
// ============================================

async function setAutoBots() {
    const count = parseInt(document.getElementById('auto-bot-count').value) || 0;
    const serverSelect = document.getElementById('auto-bot-server');
    const selectedServer = serverSelect ? serverSelect.value : 'all';

    // 선택된 서버에 따라 포트 결정
    let ports = [];
    if (selectedServer === 'all') {
        ports = [4001, 4011, 4021];
    } else {
        ports = [parseInt(selectedServer)];
    }

    let successCount = 0;
    let successServers = [];

    for (const port of ports) {
        try {
            const response = await fetch(`http://127.0.0.1:${port}/api/autobots/set`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ count })
            });
            const data = await response.json();
            if (data.success) {
                successCount++;
                const serverName = port === 4001 ? '솔로' : port === 4011 ? '듀오' : '스쿼드';
                successServers.push(serverName);
            }
        } catch (e) {
            console.error(`포트 ${port} 설정 실패:`, e);
        }
    }

    if (successCount > 0) {
        alert(`✅ 자동 봇 설정 완료!\n\n서버: ${successServers.join(', ')}\n게임 시작 시 ${count}개의 봇이 자동 투입됩니다.`);
        getAutoBots();
    } else {
        alert('❌ 자동 봇 설정 실패. 서버 연결을 확인하세요.');
    }
}

async function getAutoBots() {
    const statusDiv = document.getElementById('auto-bot-status');
    const countInput = document.getElementById('auto-bot-count');

    if (!statusDiv) return;

    const ports = [4001, 4011, 4021];
    const serverNames = { 4001: '솔로', 4011: '듀오', 4021: '스쿼드' };
    let statusLines = [];

    for (const port of ports) {
        try {
            const response = await fetch(`http://127.0.0.1:${port}/api/autobots/get`);
            const data = await response.json();
            if (data.success) {
                const count = data.count || 0;
                statusLines.push(`<div style="margin: 3px 0;">
                    <span style="color: #0ff;">${serverNames[port]}</span>: 
                    <span style="color: ${count > 0 ? '#0f0' : '#888'};">${count}개</span>
                </div>`);

                // 첫 번째 값으로 입력 필드 설정
                if (countInput && countInput.value === '0' && count > 0) {
                    countInput.value = count;
                }
            } else {
                statusLines.push(`<div style="margin: 3px 0;">
                    <span style="color: #0ff;">${serverNames[port]}</span>: 
                    <span style="color: #888;">미연결</span>
                </div>`);
            }
        } catch (e) {
            statusLines.push(`<div style="margin: 3px 0;">
                <span style="color: #0ff;">${serverNames[port]}</span>: 
                <span style="color: #f44;">연결 실패</span>
            </div>`);
        }
    }

    if (statusLines.length > 0) {
        statusDiv.innerHTML = statusLines.join('');
    } else {
        statusDiv.innerHTML = '<span style="color: #f44;">서버 연결 실패</span>';
    }
}
