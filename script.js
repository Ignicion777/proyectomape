// =============================================================
//  SHOOTING GALLERY – Game Logic
// =============================================================

// ─── Configuration ───────────────────────────────────────────
const CONFIG = {
    gameDuration: 30,                   // seconds
    roundSpawnInterval: [3000, 5500],   // ms between round spawns
    firstRoundDelay: 800,               // ms before first round
    spawnPadding: 110,                  // px from area edges
    targetMinDistance: 110,             // px minimum between targets in a round
    expiringWarningTime: 1500,          // ms before expiry to start blinking
    comboResetOnMiss: true,
    countdownSeconds: 3,
};

// ─── Round Types ─────────────────────────────────────────────
// Each round type defines a template. The actual duration scales
// with the number of enemies:  duration = baseDuration + count * durationPerEnemy
// weight controls spawn probability relative to other types.
const ROUND_TYPES = [
    {
        name: 'standard',
        description: 'Ronda estándar',
        enemyCount: [3, 3],
        baseDuration: 5500,
        durationPerEnemy: 600,
        targetSize: 100,
        points: 100,
        weight: 4,
    },
    {
        name: 'patrol',
        description: 'Patrulla ligera',
        enemyCount: [3, 4],
        baseDuration: 6000,
        durationPerEnemy: 650,
        targetSize: 95,
        points: 100,
        weight: 3,
    },
    {
        name: 'rush',
        description: 'Oleada rápida',
        enemyCount: [4, 5],
        baseDuration: 5200,
        durationPerEnemy: 750,
        targetSize: 90,
        points: 110,
        weight: 2,
    },
    {
        name: 'blitz',
        description: 'Ataque relámpago',
        enemyCount: [3, 3],
        baseDuration: 3000,
        durationPerEnemy: 400,
        targetSize: 95,
        points: 180,
        weight: 2,
    },
    {
        name: 'swarm',
        description: 'Enjambre',
        enemyCount: [5, 5],
        baseDuration: 6500,
        durationPerEnemy: 800,
        targetSize: 80,
        points: 90,
        weight: 1,
    },
    {
        name: 'tiny',
        description: 'Objetivos diminutos',
        enemyCount: [3, 4],
        baseDuration: 5800,
        durationPerEnemy: 750,
        targetSize: 65,
        points: 220,
        weight: 1,
    },
    {
        name: 'heavy',
        description: 'Objetivos grandes',
        enemyCount: [3, 4],
        baseDuration: 4800,
        durationPerEnemy: 500,
        targetSize: 140,
        points: 70,
        weight: 2,
    },
    {
        name: 'cluster',
        description: 'Grupo concentrado',
        enemyCount: [4, 5],
        baseDuration: 4500,
        durationPerEnemy: 600,
        targetSize: 85,
        points: 100,
        weight: 2,
        cluster: true,   // spawn close together
    },
];

// ─── Game State ──────────────────────────────────────────────
let state = {
    score: 0,
    timeRemaining: CONFIG.gameDuration,
    isRunning: false,
    hits: 0,
    misses: 0,
    combo: 0,
    maxCombo: 0,
    targetIdCounter: 0,
    timerInterval: null,
    roundTimeout: null,
    activeTimeouts: [],     // to clear all on game end
};

// ─── DOM References ──────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const gameArea       = $('#game-area');
const scoreDisplay   = $('#score');
const timerDisplay   = $('#timer');
const comboDisplay   = $('#combo');
const startScreen    = $('#start-screen');
const endScreen      = $('#end-screen');
const countdownScreen = $('#countdown-screen');
const countdownNumber = $('#countdown-number');
const crosshair      = $('#crosshair');
const startBtn       = $('#start-btn');
const restartBtn     = $('#restart-btn');

// =============================================================
//  UTILITIES
// =============================================================
function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min, max) {
    return Math.random() * (max - min) + min;
}

/** Pick a random item using weighted probability. */
function weightedPick(items) {
    const total = items.reduce((s, i) => s + i.weight, 0);
    let r = Math.random() * total;
    for (const item of items) {
        r -= item.weight;
        if (r <= 0) return item;
    }
    return items[items.length - 1];
}

/** Register a timeout and keep a reference for cleanup. */
function safeTimeout(fn, ms) {
    const id = setTimeout(() => {
        // remove from tracking
        const idx = state.activeTimeouts.indexOf(id);
        if (idx !== -1) state.activeTimeouts.splice(idx, 1);
        fn();
    }, ms);
    state.activeTimeouts.push(id);
    return id;
}

// =============================================================
//  CROSSHAIR
// =============================================================
document.addEventListener('mousemove', (e) => {
    crosshair.style.left = e.clientX + 'px';
    crosshair.style.top  = e.clientY + 'px';
});

document.addEventListener('mousedown', () => crosshair.classList.add('firing'));
document.addEventListener('mouseup', () => crosshair.classList.remove('firing'));

// =============================================================
//  GAME FLOW
// =============================================================
startBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    beginCountdown();
});
restartBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    endScreen.classList.add('hidden');
    beginCountdown();
});

// ─── Countdown ───────────────────────────────────────────────
function beginCountdown() {
    startScreen.classList.add('hidden');
    endScreen.classList.add('hidden');
    countdownScreen.classList.remove('hidden');

    let count = CONFIG.countdownSeconds;
    countdownNumber.textContent = count;
    // Force animation restart
    countdownNumber.style.animation = 'none';
    void countdownNumber.offsetHeight;
    countdownNumber.style.animation = '';

    const interval = setInterval(() => {
        count--;
        if (count <= 0) {
            clearInterval(interval);
            countdownScreen.classList.add('hidden');
            startGame();
        } else {
            countdownNumber.textContent = count;
            countdownNumber.style.animation = 'none';
            void countdownNumber.offsetHeight;
            countdownNumber.style.animation = '';
        }
    }, 900);
}

// ─── Start ───────────────────────────────────────────────────
function startGame() {
    // Reset state
    state = {
        score: 0,
        timeRemaining: CONFIG.gameDuration,
        isRunning: true,
        hits: 0,
        misses: 0,
        combo: 0,
        maxCombo: 0,
        targetIdCounter: 0,
        timerInterval: null,
        roundTimeout: null,
        activeTimeouts: [],
    };

    // Clear game area of any old elements
    clearGameArea();
    updateHUD();

    // Timer
    state.timerInterval = setInterval(() => {
        state.timeRemaining--;
        updateHUD();
        if (state.timeRemaining <= 10) {
            timerDisplay.classList.add('warning');
        }
        if (state.timeRemaining <= 0) {
            endGame();
        }
    }, 1000);

    // Start miss listener
    gameArea.addEventListener('click', onAreaClick);

    // First round comes quickly
    safeTimeout(() => spawnRound(), CONFIG.firstRoundDelay);
    scheduleNextRound();
}

// ─── End ─────────────────────────────────────────────────────
function endGame() {
    state.isRunning = false;
    clearInterval(state.timerInterval);
    state.activeTimeouts.forEach(clearTimeout);
    state.activeTimeouts = [];

    gameArea.removeEventListener('click', onAreaClick);

    // Expire remaining targets with smooth disappearance
    document.querySelectorAll('.target').forEach(t => {
        t.classList.add('despawning');
        setTimeout(() => t.remove(), 250);
    });

    // Stats
    const totalShots = state.hits + state.misses;
    const accuracy = totalShots > 0 ? Math.round((state.hits / totalShots) * 100) : 0;

    $('#final-score').textContent    = state.score.toLocaleString();
    $('#final-hits').textContent     = state.hits;
    $('#final-misses').textContent   = state.misses;
    $('#final-accuracy').textContent = accuracy + '%';
    $('#final-combo').textContent    = 'x' + state.maxCombo;

    setTimeout(() => {
        endScreen.classList.remove('hidden');
    }, 600);
}

function clearGameArea() {
    // Remove targets, effects, popups — keep the grid bg
    gameArea.querySelectorAll('.target, .hit-effect, .score-popup, .miss-effect, .hit-particle, .round-flash, .shatter-piece')
        .forEach(el => el.remove());
}

// =============================================================
//  ROUND SYSTEM
// =============================================================
function scheduleNextRound() {
    if (!state.isRunning) return;
    const delay = randInt(CONFIG.roundSpawnInterval[0], CONFIG.roundSpawnInterval[1]);
    state.roundTimeout = safeTimeout(() => {
        spawnRound();
        scheduleNextRound();
    }, delay);
}

function spawnRound() {
    if (!state.isRunning) return;

    const roundType = weightedPick(ROUND_TYPES);
    const count = randInt(roundType.enemyCount[0], roundType.enemyCount[1]);
    const duration = roundType.baseDuration + count * roundType.durationPerEnemy;

    const areaRect = gameArea.getBoundingClientRect();
    const positions = [];

    // Optional: for cluster rounds, pick a center point and spawn near it
    let clusterCenter = null;
    if (roundType.cluster) {
        clusterCenter = {
            x: randInt(CONFIG.spawnPadding + 80, areaRect.width - CONFIG.spawnPadding - 80),
            y: randInt(CONFIG.spawnPadding + 80, areaRect.height - CONFIG.spawnPadding - 80),
        };
    }

    // Subtle flash on round spawn
    showRoundFlash();

    for (let i = 0; i < count; i++) {
        const pos = findSpawnPosition(areaRect, roundType.targetSize, positions, clusterCenter);
        if (!pos) continue;
        positions.push(pos);

        const target = createTarget(pos.x, pos.y, roundType);
        gameArea.appendChild(target);

        const tId = target.dataset.tid;

        // Auto-remove on expiry (smooth disappearance animation)
        safeTimeout(() => {
            const el = document.querySelector(`[data-tid="${tId}"]`);
            if (el && !el.classList.contains('hit') && !el.classList.contains('despawning')) {
                el.classList.add('despawning');
                setTimeout(() => el.remove(), 250);
            }
        }, duration);
    }
}

function findSpawnPosition(areaRect, size, existing, clusterCenter) {
    const pad = CONFIG.spawnPadding;
    const maxAttempts = 40;

    for (let a = 0; a < maxAttempts; a++) {
        let x, y;
        if (clusterCenter) {
            // Cluster: spawn within ~120px of center
            x = clusterCenter.x + randInt(-120, 120);
            y = clusterCenter.y + randInt(-120, 120);
            // Clamp to valid area
            x = Math.max(pad, Math.min(areaRect.width - pad - size, x));
            y = Math.max(pad, Math.min(areaRect.height - pad - size, y));
        } else {
            x = randInt(pad, areaRect.width - pad - size);
            y = randInt(pad, areaRect.height - pad - size);
        }

        let ok = true;
        for (const p of existing) {
            const dist = Math.hypot(x - p.x, y - p.y);
            if (dist < CONFIG.targetMinDistance + size * 0.5) {
                ok = false;
                break;
            }
        }

        // Also check against currently active targets on screen
        if (ok) {
            const activeTargets = document.querySelectorAll('.target:not(.hit):not(.expired)');
            for (const t of activeTargets) {
                const tx = parseFloat(t.style.left);
                const ty = parseFloat(t.style.top);
                const dist = Math.hypot(x - tx, y - ty);
                if (dist < CONFIG.targetMinDistance) {
                    ok = false;
                    break;
                }
            }
        }

        if (ok) return { x, y };
    }

    // Fallback
    return {
        x: randInt(pad, areaRect.width - pad - size),
        y: randInt(pad, areaRect.height - pad - size),
    };
}

// =============================================================
//  TARGETS
// =============================================================
function createTarget(x, y, roundType) {
    const size = roundType.targetSize;
    const tid = state.targetIdCounter++;

    const target = document.createElement('div');
    target.className = 'target';
    target.dataset.tid = tid;
    target.dataset.points = roundType.points;
    target.style.width = size + 'px';
    target.style.height = size + 'px';
    target.style.left = x + 'px';
    target.style.top = y + 'px';

    // Build bullseye rings
    const canvas = document.createElement('div');
    canvas.className = 'target-canvas';

    const rings = ['t-ring-1', 't-ring-2', 't-ring-3', 't-ring-4', 't-center'];
    for (const cls of rings) {
        const ring = document.createElement('div');
        ring.className = 't-ring ' + cls;
        canvas.appendChild(ring);
    }
    target.appendChild(canvas);

    // Click handler
    target.addEventListener('click', (e) => {
        e.stopPropagation();
        if (state.isRunning) onTargetHit(target);
    });

    return target;
}

// =============================================================
//  HIT / MISS HANDLING
// =============================================================
function onTargetHit(target) {
    if (target.dataset.hit === 'true' || target.classList.contains('expired') || target.classList.contains('despawning')) return;
    target.dataset.hit = 'true';
    target.style.pointerEvents = 'none';

    // Obtener coordenadas y dimensiones exactas dentro de gameArea antes de remover
    const x = parseFloat(target.style.left) || 0;
    const y = parseFloat(target.style.top) || 0;
    const size = parseFloat(target.style.width) || target.offsetWidth || 100;
    const cx = x + size / 2;
    const cy = y + size / 2;

    // Combo
    state.combo++;
    if (state.combo > state.maxCombo) state.maxCombo = state.combo;

    // Puntos (multiplicador con tope x10)
    const basePoints = parseInt(target.dataset.points, 10) || 100;
    const multiplier = Math.min(state.combo, 10);
    const earned = basePoints * multiplier;
    state.score += earned;
    state.hits++;

    // Despachar la rotura en pedazos en la posición exacta del objetivo
    spawnShatterPieces(x, y, size);

    // Efectos adicionales y popup de puntos
    showHitEffect(cx, cy);
    spawnHitParticles(cx, cy);
    showScorePopup(cx, y - 5, earned, multiplier);
    bumpCombo();
    updateHUD();

    // Eliminar el objetivo intacto para dar paso a sus pedazos rotos
    target.remove();
}

function onAreaClick(e) {
    if (!state.isRunning) return;
    // If the click landed on a target, don't count a miss
    if (e.target.closest('.target')) return;

    state.misses++;
    if (CONFIG.comboResetOnMiss) state.combo = 0;
    updateHUD();

    const areaRect = gameArea.getBoundingClientRect();
    showMissEffect(e.clientX - areaRect.left, e.clientY - areaRect.top);
}

// =============================================================
//  VISUAL EFFECTS
// =============================================================
function showHitEffect(cx, cy) {
    const effect = document.createElement('div');
    effect.className = 'hit-effect';
    effect.style.width = '40px';
    effect.style.height = '40px';
    effect.style.left = cx + 'px';
    effect.style.top = cy + 'px';
    gameArea.appendChild(effect);
    setTimeout(() => effect.remove(), 450);
}

function spawnHitParticles(cx, cy) {
    const particleCount = randInt(6, 9);

    for (let i = 0; i < particleCount; i++) {
        const p = document.createElement('div');
        p.className = 'hit-particle';
        p.style.left = cx + 'px';
        p.style.top = cy + 'px';

        const angle = randFloat(0, Math.PI * 2);
        const dist = randFloat(30, 80);
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist;
        const dur = randFloat(300, 500);

        p.animate([
            { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
            { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0)`, opacity: 0 },
        ], { duration: dur, easing: 'ease-out', fill: 'forwards' });

        gameArea.appendChild(p);
        setTimeout(() => p.remove(), dur + 50);
    }
}

function spawnShatterPieces(originX, originY, targetSize) {
    const areaHeight = gameArea.clientHeight || window.innerHeight;

    // 6 cortes radiales angulares que completan la diana partida
    const sectors = [
        {
            clip: 'polygon(50% 50%, 15% 0%, 55% 0%)',
            angle: -Math.PI / 2 + 0.1,
            speed: randFloat(120, 220),
            upForce: randFloat(240, 380)
        },
        {
            clip: 'polygon(50% 50%, 55% 0%, 100% 0%, 100% 45%)',
            angle: -Math.PI / 4,
            speed: randFloat(160, 280),
            upForce: randFloat(200, 340)
        },
        {
            clip: 'polygon(50% 50%, 100% 45%, 100% 100%, 65% 100%)',
            angle: Math.PI / 6,
            speed: randFloat(150, 260),
            upForce: randFloat(90, 190)
        },
        {
            clip: 'polygon(50% 50%, 65% 100%, 15% 100%)',
            angle: Math.PI / 2,
            speed: randFloat(90, 190),
            upForce: randFloat(50, 140)
        },
        {
            clip: 'polygon(50% 50%, 15% 100%, 0% 100%, 0% 45%)',
            angle: (5 * Math.PI) / 6,
            speed: randFloat(150, 260),
            upForce: randFloat(110, 220)
        },
        {
            clip: 'polygon(50% 50%, 0% 45%, 0% 0%, 15% 0%)',
            angle: (-3 * Math.PI) / 4,
            speed: randFloat(160, 280),
            upForce: randFloat(200, 340)
        }
    ];

    const pieces = [];

    sectors.forEach(sec => {
        const piece = document.createElement('div');
        piece.className = 'shatter-piece';
        piece.style.width = targetSize + 'px';
        piece.style.height = targetSize + 'px';
        piece.style.left = originX + 'px';
        piece.style.top = originY + 'px';
        piece.style.clipPath = sec.clip;
        piece.style.webkitClipPath = sec.clip;

        // Construir los anillos de la diana dentro de cada pedazo
        const canvas = document.createElement('div');
        canvas.className = 'target-canvas';
        ['t-ring-1', 't-ring-2', 't-ring-3', 't-ring-4', 't-center'].forEach(cls => {
            const ring = document.createElement('div');
            ring.className = 't-ring ' + cls;
            canvas.appendChild(ring);
        });
        piece.appendChild(canvas);
        gameArea.appendChild(piece);

        const vx = Math.cos(sec.angle) * sec.speed;
        const vy = -sec.upForce;
        const rotSpeed = randFloat(260, 620) * (vx >= 0 ? 1 : -1);

        pieces.push({
            el: piece,
            x: 0,
            y: 0,
            vx: vx,
            vy: vy,
            rot: 0,
            rotSpeed: rotSpeed,
            opacity: 1
        });
    });

    // 4 esquirlas sólidas de impacto rojas y blancas
    for (let j = 0; j < 4; j++) {
        const shard = document.createElement('div');
        shard.className = 'shatter-shard';
        const sSize = randFloat(targetSize * 0.16, targetSize * 0.28);
        shard.style.width = sSize + 'px';
        shard.style.height = sSize + 'px';
        shard.style.left = (originX + targetSize / 2) + 'px';
        shard.style.top = (originY + targetSize / 2) + 'px';
        shard.style.background = j % 2 === 0 ? '#ff3c3c' : '#ffffff';
        shard.style.borderRadius = '3px';
        shard.style.boxShadow = '0 0 10px rgba(255, 60, 60, 0.9)';
        gameArea.appendChild(shard);

        const a = randFloat(0, Math.PI * 2);
        const spd = randFloat(200, 360);
        pieces.push({
            el: shard,
            x: 0,
            y: 0,
            vx: Math.cos(a) * spd,
            vy: -randFloat(180, 340),
            rot: 0,
            rotSpeed: randFloat(400, 900) * (Math.random() > 0.5 ? 1 : -1),
            opacity: 1
        });
    }

    let lastTime = performance.now();
    const gravity = 880; // px/s^2 (gravedad realista)
    const floorY = areaHeight + 250;

    function step(now) {
        const dt = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;

        let activeCount = 0;

        for (let i = 0; i < pieces.length; i++) {
            const p = pieces[i];
            if (!p.el.parentNode) continue;

            p.vy += gravity * dt; // Aceleración de gravedad hacia abajo
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.rot += p.rotSpeed * dt;

            // Desvanecer cuando ya está saliendo por la parte baja del área de juego
            if (originY + p.y > areaHeight - 50) {
                p.opacity -= dt * 2.2;
            }

            p.el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) rotate(${p.rot}deg)`;
            p.el.style.opacity = Math.max(0, p.opacity);

            if (p.opacity > 0 && originY + p.y < floorY) {
                activeCount++;
            } else {
                p.el.remove();
            }
        }

        if (activeCount > 0) {
            requestAnimationFrame(step);
        }
    }

    requestAnimationFrame(step);
}

function showScorePopup(cx, cy, points, multiplier) {
    const popup = document.createElement('div');
    popup.className = 'score-popup' + (multiplier >= 5 ? ' big-score' : '');
    popup.textContent = `+${points}`;
    if (multiplier > 1) popup.textContent += ` (x${multiplier})`;
    popup.style.left = cx + 'px';
    popup.style.top = cy + 'px';
    gameArea.appendChild(popup);
    setTimeout(() => popup.remove(), 900);
}

function showMissEffect(x, y) {
    const el = document.createElement('div');
    el.className = 'miss-effect';
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    gameArea.appendChild(el);
    setTimeout(() => el.remove(), 500);
}

function showRoundFlash() {
    const flash = document.createElement('div');
    flash.className = 'round-flash';
    gameArea.appendChild(flash);
    setTimeout(() => flash.remove(), 400);
}

function bumpCombo() {
    comboDisplay.classList.add('bump');
    setTimeout(() => comboDisplay.classList.remove('bump'), 150);
}

// =============================================================
//  HUD
// =============================================================
function updateHUD() {
    scoreDisplay.textContent = state.score.toLocaleString();
    timerDisplay.textContent = state.timeRemaining;
    comboDisplay.textContent = 'x' + Math.max(1, state.combo);
}
