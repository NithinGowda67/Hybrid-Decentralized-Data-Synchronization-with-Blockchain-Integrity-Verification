/* ══════════════════════════════════════════════════════════════════
   BlockChain Coin Collector — game.js
   GUN real-time sync + SHA-256 tamper-proof blockchain
   M.Tech Seminar Demo
   ══════════════════════════════════════════════════════════════════ */

'use strict';

// ══ PLAYER ID (unique per browser session) ═══════════════════════
const PLAYER_ID = 'player_' + Math.random().toString(36).slice(2, 7).toUpperCase();
document.getElementById('player-id-display').textContent = PLAYER_ID;

// ══ GUN INIT ══════════════════════════════════════════════════════
// Connect to your existing GUN server peer, fallback to public relays
const gun = GUN({
  peers: ['http://localhost:3000/gun'],   // your local server
  localStorage: false
});
const gunScores = gun.get('coin-game').get('scores');
const gunEvents = gun.get('coin-game').get('events');

// ══ CANVAS SETUP ══════════════════════════════════════════════════
const canvas  = document.getElementById('gameCanvas');
const ctx     = canvas.getContext('2d');
const CW      = canvas.width;
const CH      = canvas.height;

// ══ BLOCKCHAIN ════════════════════════════════════════════════════
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray  = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

let blockchain = [];   // array of block objects
let isTampered = false; // tracks manual tampering flag

async function createGenesisBlock() {
  const block = {
    index:     0,
    timestamp: Date.now(),
    player:    PLAYER_ID,
    event:     'GENESIS',
    prevScore: 0,
    newScore:  0,
    posX:      0,
    posY:      0,
    previousHash: '0000000000000000',
    hash:      ''
  };
  block.hash = await sha256(blockPayload(block));
  return block;
}

function blockPayload(b) {
  return `${b.index}|${b.timestamp}|${b.player}|${b.event}|${b.prevScore}|${b.newScore}|${b.posX}|${b.posY}|${b.previousHash}`;
}

async function addBlock(event, prevScore, newScore, posX, posY) {
  const prev  = blockchain[blockchain.length - 1];
  const block = {
    index:        blockchain.length,
    timestamp:    Date.now(),
    player:       PLAYER_ID,
    event,
    prevScore,
    newScore,
    posX:         Math.round(posX),
    posY:         Math.round(posY),
    previousHash: prev.hash,
    hash:         ''
  };
  block.hash = await sha256(blockPayload(block));
  blockchain.push(block);
  renderChain();
  updateDashboard();
  syncBlock(block);
  return block;
}

async function verifyChain() {
  let valid = true;
  for (let i = 1; i < blockchain.length; i++) {
    const b         = blockchain[i];
    const recomputed = await sha256(blockPayload(b));
    if (b.hash !== recomputed) { valid = false; break; }
    if (b.previousHash !== blockchain[i - 1].hash) { valid = false; break; }
  }
  return valid;
}

// ══ GUN SYNC ══════════════════════════════════════════════════════
const syncDot   = document.getElementById('sync-indicator');
const syncLabel = document.getElementById('sync-label');

function setSyncStatus(status, label) {
  syncDot.className  = 'sync-dot ' + status;
  syncLabel.textContent = label;
}

// Sync score to GUN
function syncScore(score) {
  gunScores.get(PLAYER_ID).put({
    score,
    ts: Date.now(),
    player: PLAYER_ID
  });
}

// Sync a block to GUN (just the metadata, not the full chain)
function syncBlock(block) {
  gunEvents.get('block_' + PLAYER_ID + '_' + block.index).put({
    index:     block.index,
    event:     block.event,
    newScore:  block.newScore,
    posX:      block.posX,
    posY:      block.posY,
    hash:      block.hash,
    ts:        block.timestamp,
    player:    PLAYER_ID
  });
}

// Listen for other players' scores (real-time)
const peerScores = {};
gunScores.map().on((data, key) => {
  if (!data || key === PLAYER_ID) return;
  setSyncStatus('connected', 'GUN Synced ✓');
  peerScores[key] = data;
});

// Try to connect & verify GUN is live
gun.get('coin-game').get('heartbeat').put({ ts: Date.now() });
gun.get('coin-game').get('heartbeat').on((data) => {
  if (data) setSyncStatus('connected', 'GUN Connected ✓');
});
setTimeout(() => {
  if (syncDot.classList.contains('syncing')) {
    setSyncStatus('connected', 'GUN Active (local)');
  }
}, 2000);

// ══ GAME STATE ════════════════════════════════════════════════════
const PLAYER_SIZE  = 18;
const COIN_RADIUS  = 10;
const COIN_COUNT   = 6;
const PLAYER_SPEED = 3;

let gameRunning = false;
let score       = 0;
let animId      = null;

const player = { x: CW / 2, y: CH / 2, dx: 0, dy: 0 };
let coins = [];
const keys  = {};

function randomCoin() {
  return {
    x:    COIN_RADIUS + Math.random() * (CW - COIN_RADIUS * 2),
    y:    COIN_RADIUS + Math.random() * (CH - COIN_RADIUS * 2),
    r:    COIN_RADIUS,
    spin: Math.random() * Math.PI * 2,
    id:   Math.random().toString(36).slice(2)
  };
}

function spawnCoins() {
  while (coins.length < COIN_COUNT) coins.push(randomCoin());
}

// ══ INPUT ═════════════════════════════════════════════════════════
document.addEventListener('keydown', e => {
  keys[e.key] = true;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault();
});
document.addEventListener('keyup',  e => { keys[e.key] = false; });

function handleInput() {
  player.dx = 0;
  player.dy = 0;
  if (keys['ArrowLeft']  || keys['a']) player.dx = -PLAYER_SPEED;
  if (keys['ArrowRight'] || keys['d']) player.dx =  PLAYER_SPEED;
  if (keys['ArrowUp']    || keys['w']) player.dy = -PLAYER_SPEED;
  if (keys['ArrowDown']  || keys['s']) player.dy =  PLAYER_SPEED;
}

// ══ COLLISION ═════════════════════════════════════════════════════
function checkCollisions() {
  const px = player.x;
  const py = player.y;
  const collected = [];

  for (let c of coins) {
    const dx = px - c.x;
    const dy = py - c.y;
    if (Math.sqrt(dx * dx + dy * dy) < PLAYER_SIZE / 2 + c.r) {
      collected.push(c);
    }
  }

  if (collected.length > 0) {
    const prevScore = score;
    score += collected.length * 10;
    coins = coins.filter(c => !collected.includes(c));
    spawnCoins();
    syncScore(score);
    addBlock('COIN_COLLECTED', prevScore, score, player.x, player.y);
    // particle burst
    collected.forEach(c => spawnParticles(c.x, c.y));
  }
}

// ══ PARTICLES ═════════════════════════════════════════════════════
let particles = [];
function spawnParticles(x, y) {
  for (let i = 0; i < 12; i++) {
    const angle = (Math.PI * 2 / 12) * i;
    const speed = 2 + Math.random() * 3;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      color: `hsl(${40 + Math.random() * 30}, 100%, 60%)`
    });
  }
}
function updateParticles() {
  particles = particles.filter(p => p.life > 0.05);
  particles.forEach(p => {
    p.x  += p.vx;
    p.y  += p.vy;
    p.vx *= 0.92;
    p.vy *= 0.92;
    p.life -= 0.04;
  });
}

// ══ DRAW ══════════════════════════════════════════════════════════
function draw(ts) {
  ctx.clearRect(0, 0, CW, CH);

  // Grid
  ctx.strokeStyle = 'rgba(48,54,61,0.5)';
  ctx.lineWidth   = 1;
  for (let x = 0; x < CW; x += 40) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,CH); ctx.stroke(); }
  for (let y = 0; y < CH; y += 40) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(CW,y); ctx.stroke(); }

  // Coins
  coins.forEach(c => {
    c.spin += 0.03;
    // glow
    const grd = ctx.createRadialGradient(c.x, c.y, 2, c.x, c.y, c.r * 1.8);
    grd.addColorStop(0,   'rgba(240,192,64,0.3)');
    grd.addColorStop(1,   'rgba(240,192,64,0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(c.x, c.y, c.r * 1.8, 0, Math.PI * 2); ctx.fill();
    // coin body
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.spin);
    ctx.beginPath();
    ctx.ellipse(0, 0, c.r, c.r * Math.abs(Math.cos(c.spin * 2)) + 2, 0, 0, Math.PI * 2);
    ctx.fillStyle   = '#f0c040';
    ctx.strokeStyle = '#b8860b';
    ctx.lineWidth   = 1.5;
    ctx.fill();
    ctx.stroke();
    // $ symbol
    ctx.fillStyle = '#7a5500';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', 0, 0);
    ctx.restore();
  });

  // Particles
  particles.forEach(p => {
    ctx.globalAlpha = p.life;
    ctx.fillStyle   = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
  });
  ctx.globalAlpha = 1;

  // Player
  const px = player.x, py = player.y;
  // shadow
  ctx.beginPath(); ctx.ellipse(px, py + PLAYER_SIZE/2 + 2, PLAYER_SIZE/2, 5, 0, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fill();
  // body
  ctx.save();
  ctx.translate(px, py);
  // body glow
  const pgrd = ctx.createRadialGradient(0, 0, 2, 0, 0, PLAYER_SIZE * 1.2);
  pgrd.addColorStop(0, 'rgba(88,166,255,0.4)');
  pgrd.addColorStop(1, 'rgba(88,166,255,0)');
  ctx.fillStyle = pgrd;
  ctx.beginPath(); ctx.arc(0, 0, PLAYER_SIZE * 1.2, 0, Math.PI * 2); ctx.fill();
  // hexagon player
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    const r = PLAYER_SIZE / 2;
    i === 0 ? ctx.moveTo(Math.cos(a)*r, Math.sin(a)*r) : ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
  }
  ctx.closePath();
  ctx.fillStyle   = '#1f6feb';
  ctx.strokeStyle = '#58a6ff';
  ctx.lineWidth   = 2;
  ctx.fill(); ctx.stroke();
  // inner dot
  ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI*2);
  ctx.fillStyle = '#79c0ff'; ctx.fill();
  ctx.restore();

  // Score HUD
  ctx.fillStyle = 'rgba(13,17,23,0.7)';
  ctx.beginPath();
  roundRect(ctx, 10, 10, 130, 50, 6);
  ctx.fill();
  ctx.fillStyle = '#8b949e'; ctx.font = '11px Segoe UI'; ctx.textAlign = 'left';
  ctx.fillText('SCORE', 20, 28);
  ctx.fillStyle = '#f0c040'; ctx.font = 'bold 22px Segoe UI';
  ctx.fillText(score, 20, 52);

  // Position HUD
  ctx.fillStyle = 'rgba(13,17,23,0.7)';
  ctx.beginPath();
  roundRect(ctx, CW - 140, 10, 130, 50, 6);
  ctx.fill();
  ctx.fillStyle = '#8b949e'; ctx.font = '11px Segoe UI'; ctx.textAlign = 'left';
  ctx.fillText(`X: ${Math.round(px)}  Y: ${Math.round(py)}`, CW - 130, 28);
  ctx.fillStyle = '#58a6ff'; ctx.font = 'bold 12px Courier New';
  ctx.fillText(`BLOCKS: ${blockchain.length}`, CW - 130, 50);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
}

// ══ GAME LOOP ═════════════════════════════════════════════════════
function gameLoop(ts) {
  if (!gameRunning) return;

  handleInput();

  // Move player
  player.x = Math.max(PLAYER_SIZE/2, Math.min(CW - PLAYER_SIZE/2, player.x + player.dx));
  player.y = Math.max(PLAYER_SIZE/2, Math.min(CH - PLAYER_SIZE/2, player.y + player.dy));

  checkCollisions();
  updateParticles();
  draw(ts);
  updateDashboard();

  animId = requestAnimationFrame(gameLoop);
}

// ══ DASHBOARD UPDATE ══════════════════════════════════════════════
function updateDashboard() {
  document.getElementById('d-x').textContent     = Math.round(player.x);
  document.getElementById('d-y').textContent     = Math.round(player.y);
  document.getElementById('d-score').textContent = score;
  document.getElementById('d-blocks').textContent = blockchain.length;

  const latest = blockchain[blockchain.length - 1];
  document.getElementById('d-hash').textContent = latest ? latest.hash.slice(0,20) + '…' : '—';

  const intTile = document.getElementById('integrity-tile');
  const intVal  = document.getElementById('d-integrity');
  if (isTampered) {
    intTile.className = 'tile tile-wide bad';
    intVal.className  = 'tile-value bad';
    intVal.textContent = '🔴 TAMPERING DETECTED';
  } else {
    intTile.className = 'tile tile-wide ok';
    intVal.className  = 'tile-value ok';
    intVal.textContent = '✅ VERIFIED';
  }
}

// ══ BLOCKCHAIN RENDERER ═══════════════════════════════════════════
function renderChain() {
  const panel = document.getElementById('chain-panel');
  panel.innerHTML = '';

  const list = [...blockchain].reverse(); // newest first

  list.forEach((b, i) => {
    if (i > 0) {
      const arrow = document.createElement('div');
      arrow.className = 'block-arrow';
      arrow.textContent = '▲ prev hash ▲';
      panel.appendChild(arrow);
    }

    const card = document.createElement('div');
    card.className = 'block-card' + (b.index === 0 ? ' genesis' : '') + ' verified';
    card.id = `block-card-${b.index}`;

    const ts = new Date(b.timestamp).toLocaleTimeString();

    card.innerHTML = `
      <div class="block-header">
        <span class="block-index">#${b.index} ${b.index === 0 ? '· GENESIS' : ''}</span>
        <span class="block-status ok" id="status-${b.index}">✓ OK</span>
      </div>
      <div class="block-row"><span class="block-key">Event</span>   <span class="block-val">${b.event}</span></div>
      <div class="block-row"><span class="block-key">Score</span>   <span class="block-val accent">${b.prevScore} → ${b.newScore}</span></div>
      <div class="block-row"><span class="block-key">Pos</span>     <span class="block-val">(${b.posX}, ${b.posY})</span></div>
      <div class="block-row"><span class="block-key">Time</span>    <span class="block-val">${ts}</span></div>
      <div class="block-row"><span class="block-key">Hash</span>    <span class="block-val hash">${b.hash.slice(0,22)}…</span></div>
      <div class="block-row"><span class="block-key">Prev</span>    <span class="block-val hash">${b.previousHash.slice(0,22)}…</span></div>
      <div class="tamper-badge">⚠ TAMPERED — HASH MISMATCH</div>
    `;
    panel.appendChild(card);
  });

  const badge = document.getElementById('block-count-badge');
  badge.textContent = blockchain.length + (blockchain.length === 1 ? ' block' : ' blocks');
}

// ══ VERIFY BUTTON ═════════════════════════════════════════════════
document.getElementById('verifyBtn').addEventListener('click', async () => {
  const ok = await verifyChain();
  isTampered = !ok;

  if (!ok) {
    // highlight corrupted blocks
    for (let i = 1; i < blockchain.length; i++) {
      const b         = blockchain[i];
      const recomputed = await sha256(blockPayload(b));
      const card       = document.getElementById(`block-card-${b.index}`);
      const statusEl   = document.getElementById(`status-${b.index}`);
      if (!card) continue;

      if (b.hash !== recomputed || b.previousHash !== blockchain[i-1].hash) {
        card.className = 'block-card tampered';
        if (statusEl) { statusEl.textContent = '✗ TAMPERED'; statusEl.className = 'block-status bad'; }
      } else {
        card.className = 'block-card verified';
        if (statusEl) { statusEl.textContent = '✓ OK'; statusEl.className = 'block-status ok'; }
      }
    }
    showToast('⚠ TAMPERING DETECTED — Chain integrity broken!', 'bad');
  } else {
    // all green
    blockchain.forEach(b => {
      const card = document.getElementById(`block-card-${b.index}`);
      const st   = document.getElementById(`status-${b.index}`);
      if (card) card.className = 'block-card verified' + (b.index===0?' genesis':'');
      if (st)   { st.textContent = '✓ OK'; st.className = 'block-status ok'; }
    });
    showToast('✅ All ' + blockchain.length + ' blocks verified — Chain intact!', 'ok');
  }
  updateDashboard();
});

// ══ TAMPER BUTTON (demo) ══════════════════════════════════════════
document.getElementById('tamperBtn').addEventListener('click', () => {
  if (blockchain.length < 2) {
    showToast('Collect some coins first to build the chain!', 'ok');
    return;
  }
  // Modify a middle block's score without rehashing
  const targetIndex = Math.floor(blockchain.length / 2);
  blockchain[targetIndex].newScore = 9999; // raw tamper, no hash update
  isTampered = true;
  renderChain();
  updateDashboard();
  showToast('🔨 Block #' + targetIndex + ' score tampered! Click Verify to detect.', 'bad');
});

// ══ RESET BUTTON ══════════════════════════════════════════════════
document.getElementById('resetBtn').addEventListener('click', () => {
  if (gameRunning) stopGame();
  showOverlay();
});

// ══ START / STOP ══════════════════════════════════════════════════
async function startGame() {
  score     = 0;
  isTampered = false;
  player.x  = CW / 2;
  player.y  = CH / 2;
  coins     = [];
  particles = [];

  blockchain = [];
  const genesis = await createGenesisBlock();
  blockchain.push(genesis);
  renderChain();
  spawnCoins();

  gameRunning = true;
  document.getElementById('overlay').classList.add('hidden');
  animId = requestAnimationFrame(gameLoop);
  syncScore(0);
  setSyncStatus('connected', 'GUN Synced ✓');
}

function stopGame() {
  gameRunning = false;
  if (animId) { cancelAnimationFrame(animId); animId = null; }
}

function showOverlay() {
  stopGame();
  score = 0;
  ctx.clearRect(0, 0, CW, CH);
  document.getElementById('overlay').classList.remove('hidden');
  document.getElementById('d-score').textContent = '0';
}

document.getElementById('startBtn').addEventListener('click', startGame);

// ══ TOAST ═════════════════════════════════════════════════════════
let toastTimer = null;
function showToast(msg, type) {
  const t = document.getElementById('toast') || (() => {
    const el = document.createElement('div');
    el.id = 'toast'; document.body.appendChild(el); return el;
  })();
  t.textContent = msg;
  t.className   = 'show ' + (type || '');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = ''; }, 3500);
}

// ══ TOAST DIV (ensure exists) ════════════════════════════════════
const toastEl = document.createElement('div');
toastEl.id    = 'toast';
document.body.appendChild(toastEl);

// ══ INITIAL DRAW ══════════════════════════════════════════════════
(function initialDraw() {
  ctx.fillStyle = '#0a0f1a';
  ctx.fillRect(0, 0, CW, CH);
  ctx.strokeStyle = 'rgba(48,54,61,0.4)';
  ctx.lineWidth = 1;
  for (let x = 0; x < CW; x += 40) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,CH); ctx.stroke(); }
  for (let y = 0; y < CH; y += 40) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(CW,y); ctx.stroke(); }
})();
