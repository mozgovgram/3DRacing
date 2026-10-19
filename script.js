const tg = window.Telegram?.WebApp;
if (tg) tg.expand(); 

// Данные пользователя из Telegram
const tgUser = tg?.initDataUnsafe?.user || { id: 12345678, username: "TestPlayer" };

// Актуальная ссылка на твое веб-приложение Google Apps Script
const SERVER_URL = "https://script.google.com/macros/s/AKfycbzCg0RGIoz-DllCfroEQShTFZeE-nSWpAq0r-6hUdcPermh5qAWezt6lEPVDWsbs2Aw/exec";

function vibrate(style = 'light') {
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred(style);
    else if (navigator.vibrate) navigator.vibrate(style === 'heavy' ? 50 : 15);
}

// ---------------- 0. ШЛЮЗ ДЛЯ ОБХОДА CORS В GOOGLE APPS SCRIPT ----------------
async function sendServerRequest(payload) {
    const response = await fetch(SERVER_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'text/plain;charset=utf-8' // Отключает OPTIONS-запросы браузера
        },
        body: JSON.stringify(payload)
    });

    const textResult = await response.text();
    
    try {
        return JSON.parse(textResult);
    } catch (e) {
        console.error("Ответ сервера не JSON:", textResult);
        throw new Error("Ошибка ответа сервера: " + textResult);
    }
}

// ---------------- 1. АВАТАРКИ И СПРАЙТЫ ----------------
const roachSprites = [];
const spriteNames = ['bugs1.png', 'bugs2.png', 'bugs3.png', 'bugs4.png', 'bugs5.png'];

spriteNames.forEach((name, index) => {
    const img = new Image();
    img.src = `images/${name}`;
    img.onload = () => { updateAvatars(); };
    roachSprites[index] = img;
});

function updateAvatars() {
    document.querySelectorAll('.roach-avatar').forEach(div => {
        const spriteIdx = parseInt(div.dataset.sprite || 0);
        const spriteName = spriteNames[spriteIdx % spriteNames.length];
        const sprite = roachSprites[spriteIdx % spriteNames.length];
        
        if (sprite && sprite.complete && sprite.naturalWidth > 0) {
            div.style.backgroundImage = `url('images/${spriteName}')`;
            div.style.backgroundSize = '200% 200%';
            div.style.backgroundPosition = '0% 0%';
            div.style.backgroundColor = 'transparent';
        }
    });
}

// ---------------- 2. ФОН И ОБЪЕКТЫ ОБОЧИН ----------------
const bgImage = new Image();
bgImage.src = 'images/bg.png';

const sideSprites = {};
const sideSpriteFiles = {
    'grass': 'obj_grass.png',
    'grass1': 'obj_grass1.png',
    'grass3': 'obj_grass3.png',
    'house': 'obj_house.png',
    'house1': 'obj_house1.png',
    'billboard': 'obj_billboard.png',
    'palm': 'obj_palm.png', 
    'sign': 'obj_sign.png',
    'barrier': 'obj_barrier.png',
    'pole': 'obj_pole.png'
};

Object.keys(sideSpriteFiles).forEach(key => {
    const img = new Image();
    img.src = `images/${sideSpriteFiles[key]}`;
    img.onload = () => { sideSprites[key] = img; };
});

// ---------------- 3. МУЗЫКА И ЗВУКИ ----------------
let audioCtx, raceGainNode, isMuted = false, trackStartTime = 0, musicTimerId = null;
const arpNotes = [220, 277.18, 329.63, 440, 329.63, 277.18, 220, 164.81];
const bassNotes = [110, 110, 138.59, 110, 164.81, 164.81, 110, 82.41];

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        raceGainNode = audioCtx.createGain();
        raceGainNode.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

function startRaceMusic() {
    if (isMuted) return;
    initAudio(); 
    stopRaceMusic(false);
    raceGainNode.gain.cancelScheduledValues(audioCtx.currentTime);
    raceGainNode.gain.setValueAtTime(1, audioCtx.currentTime);
    trackStartTime = audioCtx.currentTime;
    playMusicLoop();
}

function playMusicLoop() {
    if (winnerId !== -1 || gameState !== 'racing') return;
    let elapsed = audioCtx.currentTime - trackStartTime;
    let maxZ = 0; roaches.forEach(r => { if(r.z > maxZ) maxZ = r.z; });
    let progress = Math.min(1, maxZ / trackLength);

    const tempo = Math.max(0.08, 0.15 - (progress * 0.07));
    const beatIndex = Math.floor(elapsed / tempo);
    
    const arpOsc = audioCtx.createOscillator();
    const arpGain = audioCtx.createGain();
    arpOsc.type = 'square';
    arpOsc.frequency.setValueAtTime(arpNotes[beatIndex % arpNotes.length], audioCtx.currentTime);
    arpGain.gain.setValueAtTime(0.04, audioCtx.currentTime);
    arpGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
    arpOsc.connect(arpGain); arpGain.connect(raceGainNode);
    arpOsc.start(); arpOsc.stop(audioCtx.currentTime + 0.1);
    
    if (beatIndex % 2 === 0) {
        const bassOsc = audioCtx.createOscillator();
        const bassGain = audioCtx.createGain();
        bassOsc.type = 'sawtooth';
        bassOsc.frequency.setValueAtTime(bassNotes[(beatIndex/2) % bassNotes.length], audioCtx.currentTime);
        bassGain.gain.setValueAtTime(0.06, audioCtx.currentTime);
        bassGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass'; 
        filter.frequency.setValueAtTime(600 + (progress * 1500), audioCtx.currentTime);
        bassOsc.connect(filter); filter.connect(bassGain); bassGain.connect(raceGainNode);
        bassOsc.start(); bassOsc.stop(audioCtx.currentTime + 0.25);
    }
    musicTimerId = setTimeout(playMusicLoop, tempo * 1000);
}

function stopRaceMusic(fade = true) { 
    if (musicTimerId) { clearTimeout(musicTimerId); musicTimerId = null; }
    if (fade && raceGainNode && audioCtx) {
        raceGainNode.gain.cancelScheduledValues(audioCtx.currentTime);
        raceGainNode.gain.setValueAtTime(raceGainNode.gain.value, audioCtx.currentTime);
        raceGainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 2.0);
    }
}

function playTone(freq, type, duration, vol=0.1) {
    if (!audioCtx || isMuted) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + duration);
}

function playClick() { playTone(800, 'sine', 0.05, 0.05); }
function playCountdown() { playTone(600, 'square', 0.15, 0.12); }
function playGo() { playTone(1200, 'square', 0.3, 0.15); }
function playWinFanfare() { 
    playTone(523.25, 'triangle', 0.15, 0.2); setTimeout(() => playTone(659.25, 'triangle', 0.15, 0.2), 150); 
    setTimeout(() => playTone(783.99, 'triangle', 0.3, 0.2), 300); setTimeout(() => playTone(1046.50, 'triangle', 0.5, 0.2), 450); 
}
function playLoseSound() { playTone(300, 'sawtooth', 0.2, 0.1); setTimeout(() => playTone(200, 'sawtooth', 0.4, 0.15), 200); }

document.getElementById('mute-btn')?.addEventListener('click', (e) => {
    isMuted = !isMuted;
    e.target.textContent = isMuted ? '🔇' : '🔊';
    if (!isMuted) { initAudio(); if(gameState === 'racing') startRaceMusic(); }
    else stopRaceMusic(false);
});

// ---------------- 4. ИГРОВОЙ ДВИЖОК ----------------
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Лимиты игры
const MIN_BET = 1;
const MIN_WITHDRAW = 25;

let gameState = 'bet', balance = 0, betAmount = 1, selectedRoach = 0;
let winnerId = -1, countdownValue = 0, countdownTimer = null;

// Загрузка реального баланса с сервера
async function fetchBalance() {
    try {
        let data = await sendServerRequest({ action: "get_balance", userId: tgUser.id });
        balance = data.balance || 0;
        document.getElementById('balance').textContent = balance;
    } catch (e) {
        console.log("Ошибка загрузки баланса:", e);
    }
}
// Запрашиваем реальный баланс при открытии
fetchBalance();

const segmentLength = 200;
const trackSegments = 1400; 
const trackLength = trackSegments * segmentLength;
const drawDistance = 80;
const cameraHeight = 1000;
const cameraDepth = 1 / Math.tan((100 * Math.PI / 180) / 2);
const roadWidth = 1600;

let cameraZ = 0, segments = [], particles = []; 
let lastTime = 0;
const TARGET_FPS = 60;
const TIME_STEP = 1000 / TARGET_FPS;

let roaches = [
    { id: 0, name: "Шустрик", color: "#ff5252", x: -0.8, z: 0, speed: 0, targetSpeed: 100, baseSpeed: 150 },
    { id: 1, name: "Броня", color: "#34ace0", x: -0.4, z: 0, speed: 0, targetSpeed: 100, baseSpeed: 150 },
    { id: 2, name: "Ураган", color: "#33d9b2", x: 0.0, z: 0, speed: 0, targetSpeed: 100, baseSpeed: 150 },
    { id: 3, name: "Босс", color: "#ffb142", x: 0.4, z: 0, speed: 0, targetSpeed: 100, baseSpeed: 150 },
    { id: 4, name: "Метеор", color: "#706fd3", x: 0.8, z: 0, speed: 0, targetSpeed: 100, baseSpeed: 150 }
];

let trackCurveAccumulation = 0;

for(let n = 0; n < trackSegments; n++) {
    let curve = 0;
    if (n > 50 && n < trackSegments - 50) {
        let section = Math.floor(n / 100);
        if (section % 2 !== 0) curve = (section % 4 === 1) ? 2.2 : -2.2;
    }
    
    let sprite = null;
    if (n > 10 && n % 3 === 0) {
        const types = ['grass', 'grass1', 'grass3', 'house', 'house1', 'billboard', 'palm', 'pole', 'sign', 'barrier'];
        const type = types[Math.floor(n / 3) % types.length];
        const side = (Math.floor(n / 3) % 2 === 0) ? -1 : 1;
        const distance = (type.includes('house') || type.includes('billboard')) ? 4.0 : 2.5;
        sprite = { type: type, x: side * distance };
    }
    
    segments.push({
        index: n, 
        p1: { world: {x: 0, y: 0, z: n * segmentLength}, camera: {}, screen: {} },
        p2: { world: {x: 0, y: 0, z: (n + 1) * segmentLength}, camera: {}, screen: {} },
        curve: curve, sprite: sprite,
        color: Math.floor(n / 3) % 2 ? 
            { grass: '#060810', road: '#131722', rumble: '#ff007f' } : 
            { grass: '#060810', road: '#1c2333', rumble: '#00f0ff' }
    });
}
for(let n = trackSegments - 10; n < trackSegments; n++) segments[n].color.road = '#fbc531';

function project(p, cameraX, cameraY, cameraZ, width, height) {
    p.camera.x = (p.world.x || 0) - cameraX; 
    p.camera.y = (p.world.y || 0) - cameraY; 
    p.camera.z = (p.world.z || 0) - cameraZ;
    if (p.camera.z <= 0) p.camera.z = 1;
    p.screen.scale = cameraDepth / p.camera.z;
    p.screen.x = Math.round((width / 2) + (p.screen.scale * p.camera.x * width / 2));
    p.screen.y = Math.round((height / 2) - (p.screen.scale * p.camera.y * height / 2));
    p.screen.w = Math.round((p.screen.scale * roadWidth * width / 2));
}

function drawProgressBar(ctx) {
    if (gameState !== 'racing' && gameState !== 'countdown') return;
    const barW = canvas.width * 0.8;
    const barH = 6;
    const barX = (canvas.width - barW) / 2;
    const barY = 20;

    ctx.save();
    ctx.fillStyle = 'rgba(15, 20, 32, 0.85)'; ctx.strokeStyle = '#00f0ff'; ctx.lineWidth = 1;
    ctx.fillRect(barX, barY, barW, barH); ctx.strokeRect(barX, barY, barW, barH);
    ctx.fillStyle = '#fbc531'; ctx.fillRect(barX + barW - 3, barY - 3, 3, barH + 6);
    roaches.forEach(r => {
        let p = Math.min(1, Math.max(0, r.z / trackLength));
        let iconX = barX + (p * barW);
        ctx.fillStyle = r.color; ctx.shadowColor = r.color; ctx.shadowBlur = 6;
        ctx.beginPath(); ctx.arc(iconX, barY + barH / 2, 5, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.stroke();
    });
    ctx.restore();
}

function drawPolygon(ctx, x1, y1, x2, y2, x3, y3, x4, y4, color) {
    ctx.fillStyle = color; ctx.beginPath(); 
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4); ctx.fill();
}

function drawSegment(ctx, width, x1, y1, w1, x2, y2, w2, color) {
    let r1 = w1 / 15, r2 = w2 / 15;
    ctx.fillStyle = color.grass; ctx.fillRect(0, y2, width, y1 - y2);
    drawPolygon(ctx, x1-w1-r1, y1, x1-w1, y1, x2-w2, y2, x2-w2-r2, y2, color.rumble);
    drawPolygon(ctx, x1+w1+r1, y1, x1+w1, y1, x2+w2, y2, x2+w2+r2, y2, color.rumble);
    drawPolygon(ctx, x1-w1, y1, x1+w1, y1, x2+w2, y2, x2-w2, y2, color.road);
}

function drawObstacle(ctx, x, y, size, type) {
    const img = sideSprites[type];
    if (!img) return;
    ctx.save();
    const sizeMultiplier = (type.includes('house') || type.includes('billboard')) ? 6.0 : 3.0;
    const drawH = size * sizeMultiplier;
    const w = img.width || img.naturalWidth || 100;
    const h = img.height || img.naturalHeight || 100;
    const aspect = w / h;
    const drawW = drawH * aspect;
    ctx.drawImage(img, Math.round(x - drawW / 2), Math.round(y - drawH), Math.round(drawW), Math.round(drawH));
    ctx.restore();
}

function drawSpriteRoach(ctx, x, y, size, roach) {
    ctx.save();
    let spriteW = size * 2.5, spriteH = size * 2.5;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.beginPath(); ctx.ellipse(Math.round(x), Math.round(y), spriteW * 0.35, spriteH * 0.1, 0, 0, Math.PI * 2); ctx.fill();
    
    const spriteImg = roachSprites[roach.id % roachSprites.length];
    if (spriteImg && spriteImg.complete && spriteImg.naturalWidth > 0) {
        let frameIndex = (gameState === 'racing' && roach.speed > 50) ? Math.floor(Date.now() / (150 / Math.max(1, roach.speed * 0.04))) % 4 : 0;
        let col = frameIndex % 2, row = Math.floor(frameIndex / 2);
        let fw = spriteImg.width / 2, fh = spriteImg.height / 2;
        ctx.drawImage(spriteImg, col * fw, row * fh, fw, fh, Math.round(x - spriteW / 2), Math.round(y - spriteH * 0.9), Math.round(spriteW), Math.round(spriteH));
    } else {
        ctx.fillStyle = roach.color; ctx.beginPath(); ctx.arc(Math.round(x), Math.round(y - spriteH * 0.5), spriteW * 0.3, 0, Math.PI * 2); ctx.fill();
    }
    
    ctx.fillStyle = '#fff'; 
    ctx.font = `900 ${Math.max(10, Math.floor(size * 0.35))}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
    ctx.fillText((roach.id + 1).toString(), Math.round(x), Math.round(y - spriteH * 0.95));
    ctx.restore();
}

function drawCountdown() {
    if (countdownValue <= 0) return;
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const text = countdownValue > 0 ? countdownValue.toString() : 'GO!';
    ctx.font = `900 120px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = '#66fcf1'; ctx.shadowBlur = 30; ctx.fillStyle = '#66fcf1';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    ctx.shadowBlur = 0; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
    ctx.restore();
}

function spawnFireworks() {
    for (let i = 0; i < 150; i++) {
        particles.push({ x: canvas.width / 2, y: canvas.height - 100, vx: (Math.random() - 0.5) * 15, vy: (Math.random() - 1) * 15 - 5, life: 1, color: `hsl(${Math.random() * 360}, 100%, 60%)`, size: Math.random() * 4 + 2 });
    }
}

function drawFireworks() {
    particles.forEach((p, i) => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.3; p.life -= 0.015;
        ctx.fillStyle = p.color; ctx.globalAlpha = Math.max(0, p.life); 
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
        if (p.life <= 0) particles.splice(i, 1);
    });
    ctx.globalAlpha = 1;
}

function updateAndRender(timestamp) {
    if (!lastTime) lastTime = timestamp;
    let deltaTime = timestamp - lastTime;
    lastTime = timestamp;
    if (deltaTime > 50) deltaTime = 50;
    const timeScale = deltaTime / TIME_STEP;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    let baseIndex = Math.floor(cameraZ / segmentLength);
    if (baseIndex >= segments.length) baseIndex = segments.length - 1;
    if (baseIndex < 0) baseIndex = 0;
    let baseSegment = segments[baseIndex];
    let basePercent = (cameraZ % segmentLength) / segmentLength;
    if (basePercent < 0) basePercent += 1;

    if (bgImage.complete && bgImage.naturalWidth > 0) {
        trackCurveAccumulation += baseSegment.curve * timeScale;
        let bgH = canvas.height * 0.55; 
        let imgAspect = bgImage.naturalWidth / bgImage.naturalHeight;
        let bgW = Math.max(canvas.width, bgH * imgAspect);
        let bgOffset = -(trackCurveAccumulation * 0.5) % bgW;
        
        ctx.drawImage(bgImage, bgOffset - bgW, 0, bgW, bgH);
        ctx.drawImage(bgImage, bgOffset, 0, bgW, bgH);
        ctx.drawImage(bgImage, bgOffset + bgW, 0, bgW, bgH);
    } else {
        ctx.fillStyle = '#060810'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    let dx = -(baseSegment.curve * basePercent), x = 0, maxy = canvas.height, drawList = [];

    for (let n = 0; n < drawDistance; n++) {
        let segIdx = (baseSegment.index + n) % segments.length;
        let segment = segments[segIdx];
        segment.looped = segment.index < baseSegment.index; segment.clip = maxy;
        let camZ = cameraZ - (segment.looped ? trackLength : 0);
        
        project(segment.p1, -x, cameraHeight, camZ, canvas.width, canvas.height);
        project(segment.p2, -x - dx, cameraHeight, camZ, canvas.width, canvas.height);
        
        x += dx; dx += segment.curve;
        if (segment.p1.camera.z <= cameraDepth || segment.p2.screen.y >= maxy || segment.p2.screen.y >= segment.p1.screen.y) continue;
        
        drawSegment(ctx, canvas.width, segment.p1.screen.x, segment.p1.screen.y, segment.p1.screen.w, segment.p2.screen.x, segment.p2.screen.y, segment.p2.screen.w, segment.color);
        maxy = segment.p1.screen.y;
        
        if (segment.sprite) {
            let spriteScale = segment.p1.screen.scale;
            let spriteX = segment.p1.screen.x + (spriteScale * segment.sprite.x * roadWidth * canvas.width / 2);
            let spriteY = segment.p1.screen.y;
            let size = (spriteScale * roadWidth * canvas.width / 2) * 0.35; 
            if (spriteY < segment.clip) drawList.push({ y: spriteY, draw: () => drawObstacle(ctx, spriteX, spriteY, size, segment.sprite.type) });
        }
    }

    for (let n = (drawDistance - 1); n > 0; n--) {
        let segment = segments[(baseSegment.index + n) % segments.length];
        roaches.forEach(r => {
            if (Math.floor(r.z / segmentLength) % segments.length === segment.index) {
                let spriteScale = segment.p1.screen.scale;
                let spriteX = segment.p1.screen.x + (spriteScale * r.x * roadWidth * canvas.width / 2);
                let spriteY = segment.p1.screen.y;
                let size = (spriteScale * roadWidth * canvas.width / 2) * 0.35; 
                if (spriteY < segment.clip) drawList.push({ y: spriteY, draw: () => drawSpriteRoach(ctx, spriteX, spriteY, size, r) });
            }
        });
    }
    
    drawList.sort((a, b) => a.y - b.y); 
    drawList.forEach(obj => obj.draw());
    
    drawProgressBar(ctx);

    if (gameState === 'countdown') drawCountdown();

    if (gameState === 'racing') {
        let maxZ = 0; roaches.forEach(r => { if(r.z > maxZ) maxZ = r.z; });
        roaches.forEach(r => {
            if (r.z < trackLength - segmentLength) {
                if (Math.random() < 0.1) r.targetSpeed = r.baseSpeed + (Math.random() * 60 - 30); 
                let dist = maxZ - r.z;
                if (dist > 250) r.targetSpeed += 15; 
                else if (dist === 0 && maxZ > 1000) r.targetSpeed -= 10; 
                
                r.speed += (r.targetSpeed - r.speed) * 0.05 * timeScale; 
                r.z += r.speed * timeScale;
                
                if (r.z >= trackLength - segmentLength) {
                    r.z = trackLength - segmentLength;
                    if (winnerId === -1) { winnerId = r.id; endRace(); }
                }
            }
        });
        
        if (cameraZ < 0) {
            cameraZ += 35 * timeScale;
        } else {
            cameraZ += (maxZ - cameraZ - 500) * 0.1 * timeScale;
        }
        if (cameraZ < 0) cameraZ = 0;
    }
    
    if (gameState === 'result' && particles.length > 0) drawFireworks();
    requestAnimationFrame(updateAndRender);
}

// ---------------- 5. ОБРАБОТЧИКИ СОБЫТИЙ И ТРАНЗАЦИЙ ----------------

// Выбор таракана
document.querySelectorAll('.roach-item').forEach(card => {
    card.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        initAudio(); playClick(); vibrate('light');
        document.querySelectorAll('.roach-item').forEach(c => c.classList.remove('selected'));
        e.currentTarget.classList.add('selected');
        selectedRoach = parseInt(e.currentTarget.dataset.id);
    });
});

// Кнопка ВЫВОДА
document.getElementById('withdraw-stars-btn')?.addEventListener('click', () => {
    initAudio(); playClick(); vibrate('medium');
    
    if (balance < MIN_WITHDRAW) {
        vibrate('heavy');
        alert(`Вывод доступен от ${MIN_WITHDRAW} звезд! У вас: ${balance} ⭐️`);
        return;
    }
    
    let inputVal = prompt(`Введите количество Stars для вывода (мин. ${MIN_WITHDRAW}):`, balance.toString());
    if (!inputVal) return;
    
    let amount = parseInt(inputVal);
    if (isNaN(amount) || amount < MIN_WITHDRAW || amount > balance) {
        vibrate('heavy');
        alert("Некорректная сумма или недостаточно средств!");
        return;
    }

    alert(`Заявка на вывод ${amount} ⭐️ отправлена администратору!`);
    fetchBalance();
});

// СТАРТ И СПИСАНИЕ СТАВКИ ЧЕРЕЗ СЕРВЕР
document.getElementById('start-bet-btn')?.addEventListener('click', async () => {
    initAudio();
    
    let betInput = document.getElementById('bet-input');
    betAmount = parseInt(betInput?.value) || 1;
    
    if (betAmount < MIN_BET) {
        vibrate('heavy');
        alert(`Минимальная ставка — ${MIN_BET} ⭐️!`);
        return;
    }
    
    if (balance < betAmount) { 
        vibrate('heavy'); 
        alert("Недостаточно звезд на балансе!"); 
        return; 
    }
    
    const btn = document.getElementById('start-bet-btn');
    btn.disabled = true;
    btn.textContent = "Ожидание...";

    try {
        let data = await sendServerRequest({ 
            action: "bet", 
            userId: tgUser.id, 
            username: tgUser.username,
            amount: betAmount 
        });
        
        if (!data.success) {
            alert("Ошибка списания: " + (data.error || "Сбой сервера"));
            btn.disabled = false;
            btn.textContent = "НАЧАТЬ ГОНКУ";
            return;
        }

        balance = data.balance;
        document.getElementById('balance').textContent = balance;
        vibrate('medium');
        
        document.getElementById('bet-screen').classList.add('hidden');
        document.getElementById('game-container').classList.remove('hidden');
        roaches.forEach((r) => { r.z = 0; r.speed = 0; r.targetSpeed = 0; });
        cameraZ = 0; particles = []; winnerId = -1; trackCurveAccumulation = 0; 
        gameState = 'countdown'; countdownValue = 3;
        playCountdown();
        
        countdownTimer = setInterval(() => {
            countdownValue--;
            if (countdownValue > 0) { playCountdown(); vibrate('light'); } 
            else if (countdownValue === 0) { playGo(); vibrate('heavy'); } 
            else {
                clearInterval(countdownTimer);
                gameState = 'racing';
                roaches.forEach((r) => { r.speed = 100; r.targetSpeed = r.baseSpeed; });
                startRaceMusic();
            }
        }, 1000);

    } catch (e) {
        alert("Ошибка связи с сервером! Попробуйте еще раз.");
        console.error(e);
    } finally {
        btn.disabled = false;
        btn.textContent = "НАЧАТЬ ГОНКУ";
    }
});

document.getElementById('restart-btn')?.addEventListener('click', () => {
    initAudio(); playClick(); vibrate('light');
    document.getElementById('result-screen').classList.add('hidden');
    document.getElementById('game-container').classList.add('hidden');
    document.getElementById('bet-screen').classList.remove('hidden');
    gameState = 'bet'; particles = []; winnerId = -1; cameraZ = 0;
});

// ---------------- 6. ЛОГИКА МОДАЛЬНОГО ОКНА ПОПОЛНЕНИЯ ----------------
const depositModal = document.getElementById('deposit-modal');
const depositBtn = document.getElementById('deposit-stars-btn');
const closeDepositBtn = document.getElementById('close-deposit-modal');
const confirmDepositBtn = document.getElementById('confirm-deposit-btn');
const depositAmountInput = document.getElementById('deposit-amount-input');

// 1. Открытие модалки
depositBtn?.addEventListener('click', () => {
    initAudio(); playClick(); vibrate('light');
    depositModal?.classList.remove('hidden');
});

// 2. Закрытие модалки
closeDepositBtn?.addEventListener('click', () => {
    depositModal?.classList.add('hidden');
});

depositModal?.addEventListener('click', (e) => {
    if (e.target === depositModal) depositModal.classList.add('hidden');
});

// 3. Быстрый выбор суммы
document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        initAudio(); playClick(); vibrate('light');
        const val = e.currentTarget.dataset.amount;
        if (depositAmountInput) depositAmountInput.value = val;
        document.querySelectorAll('.quick-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
    });
});

// 4. Пополнение через Telegram Stars Invoice (ФИНАЛЬНАЯ ВЕРСИЯ)
confirmDepositBtn?.addEventListener('click', async () => {
    initAudio(); 
    playClick();
    vibrate('light');
    
    const amount = parseInt(depositAmountInput?.value || 0);
    if (isNaN(amount) || amount < 5) {
        vibrate('heavy');
        alert("Минимальная сумма пополнения — 5 ⭐️!");
        return;
    }

    confirmDepositBtn.disabled = true;
    confirmDepositBtn.textContent = "Обработка...";

    try {
        let data = await sendServerRequest({ 
            action: "create_invoice", 
            userId: tgUser.id,
            amount: amount
        });
        
        if (data.success && data.invoiceLink) {
            depositModal.classList.add('hidden');
            
            tg.openInvoice(data.invoiceLink, (status) => {
                if (status === 'paid') {
                    vibrate('heavy');
                    spawnFireworks();
                    alert(`✅ Успешно! Баланс пополнен на ${amount} ⭐️`);
                    setTimeout(fetchBalance, 1500);
                } else if (status === 'failed' || status === 'cancelled') {
                    alert("Оплата отменена или не завершена");
                }
            });
        } else {
            alert("Ошибка: " + (data.error || "Не удалось создать счет"));
        }
    } catch (e) {
        alert("Ошибка соединения с сервером");
        console.error(e);
    } finally {
        confirmDepositBtn.disabled = false;
        confirmDepositBtn.textContent = "ПОПОЛНИТЬ";
    }
});

// КОНЕЦ ГОНКИ И ЗАЧИСЛЕНИЕ ВЫИГРЫША
async function endRace() {
    gameState = 'result'; 
    stopRaceMusic(true);
    
    const resultScreen = document.getElementById('result-screen');
    const title = document.getElementById('result-title');
    const desc = document.getElementById('result-desc');

    if (winnerId === selectedRoach) {
        let winAmount = betAmount * 5; 
        
        try {
            let data = await sendServerRequest({ 
                action: "win", 
                userId: tgUser.id, 
                username: tgUser.username,
                amount: winAmount 
            });
            
            if (data.success) {
                balance = data.balance;
                document.getElementById('balance').textContent = balance;
            }
        } catch (e) {
            console.error("Не удалось зачислить выигрыш на сервер", e);
        }

        setTimeout(() => {
            title.textContent = "ПОБЕДА! 🎉"; title.style.color = "#fbc531";
            desc.innerHTML = `Гонщик <b>${roaches[winnerId].name} (№${winnerId + 1})</b> пришел ПЕРВЫМ!<br><br>Вы выиграли <span style="color:#fbc531; font-weight:bold;">${winAmount} ⭐️</span>`;
            playWinFanfare(); vibrate('heavy'); spawnFireworks();
            resultScreen.classList.remove('hidden');
        }, 1500);

    } else {
        setTimeout(() => {
            title.textContent = "ПОРАЖЕНИЕ"; title.style.color = "#ff5252";
            desc.innerHTML = `Победил <b>${roaches[winnerId].name} (№${winnerId + 1})</b>.<br>Удача улыбнется в следующий раз.`;
            playLoseSound(); vibrate('rigid');
            resultScreen.classList.remove('hidden');
        }, 1500);
    }
}

setTimeout(updateAvatars, 100);
requestAnimationFrame(updateAndRender);