(() => {
'use strict';
const canvas = document.getElementById('sky');
const ctx = canvas.getContext('2d');
const $ = id => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const params = {
  count: 1500, neighbors: 7, cohesion: 1.0, alignment: 1.2, separation: 1.0,
  speed: 3.2, fear: 1.0, trails: true, roost: true
};
const PRESETS = {
  murmuration: {neighbors: 7, cohesion: 1.0, alignment: 1.2, separation: 1.0, speed: 3.2},
  tight:       {neighbors: 12, cohesion: 2.2, alignment: 1.0, separation: 0.8, speed: 2.6},
  loose:       {neighbors: 4, cohesion: 0.35, alignment: 0.6, separation: 1.4, speed: 2.4},
  chaos:       {neighbors: 2, cohesion: 0.2, alignment: 0.1, separation: 2.0, speed: 4.6}
};
const SLIDERS = [
  ['count', 'Birds', 100, 4000, 50, 0], ['neighbors', 'Neighbours (topological)', 1, 20, 1, 0],
  ['cohesion', 'Cohesion', 0, 3, .05, 2], ['alignment', 'Alignment', 0, 3, .05, 2],
  ['separation', 'Separation', 0, 3, .05, 2], ['speed', 'Speed', 1, 6, .1, 1],
  ['fear', 'Falcon fear', 0, 3, .1, 1]
];
const MAX = 4000, CELL = 48, R = CELL; // perception radius
const px = new Float32Array(MAX), py = new Float32Array(MAX), vx = new Float32Array(MAX), vy = new Float32Array(MAX);
let N = 0, W = 0, H = 0, dpr = 1, cols = 1, rows = 1, head, next;
let t = 0;
const pointer = {x: 0, y: 0, active: false};
const falcon = {x: 0, y: 0, vx: 0, vy: 0, on: false, life: 0};

function resize() {
  dpr = Math.min(devicePixelRatio || 1, 2);
  W = innerWidth; H = innerHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cols = Math.ceil(W / CELL) + 1; rows = Math.ceil(H / CELL) + 1;
  head = new Int32Array(cols * rows);
  next = new Int32Array(MAX);
  if (N === 0) setCount(params.count);
}
function setCount(n) {
  n = Math.min(MAX, n);
  const cx = W / 2, cy = H / 2, s = Math.min(W, H) * .22;
  for (let i = N; i < n; i++) {
    const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * s;
    px[i] = cx + Math.cos(a) * r * 1.5; py[i] = cy + Math.sin(a) * r;
    const h = Math.random() * 6.283;
    vx[i] = Math.cos(h) * params.speed; vy[i] = Math.sin(h) * params.speed;
  }
  N = n;
  $('count').textContent = N;
}
function reset() { N = 0; ctx.clearRect(0, 0, W, H); setCount(params.count); }

const K_MAX = 20, kd = new Float32Array(K_MAX), ki = new Int32Array(K_MAX);

function step() {
  t += 0.016;
  const sp = params.speed, maxF = 0.12;
  head.fill(-1);
  for (let i = 0; i < N; i++) {
    const c = Math.max(0, Math.min(cols - 1, (px[i] / CELL) | 0)) + Math.max(0, Math.min(rows - 1, (py[i] / CELL) | 0)) * cols;
    next[i] = head[c]; head[c] = i;
  }
  // roost target wanders in a Lissajous path
  const rx = W / 2 + Math.sin(t * .23) * W * .3, ry = H / 2 + Math.sin(t * .37 + 1) * H * .22;
  const kN = params.neighbors, R2 = R * R * 4;
  const sepR = 9 + 4, sepR2 = sepR * sepR;
  const fearR = Math.min(W, H) * .28 * (1 + params.fear * .3);
  const threats = [];
  if (pointer.active) threats.push(pointer);
  if (falcon.on) threats.push(falcon);

  for (let i = 0; i < N; i++) {
    const x = px[i], y = py[i];
    const cx0 = (x / CELL) | 0, cy0 = (y / CELL) | 0;
    let cnt = 0;
    for (let gy = cy0 - 1; gy <= cy0 + 1; gy++) {
      if (gy < 0 || gy >= rows) continue;
      for (let gx = cx0 - 1; gx <= cx0 + 1; gx++) {
        if (gx < 0 || gx >= cols) continue;
        for (let j = head[gx + gy * cols]; j !== -1; j = next[j]) {
          if (j === i) continue;
          const dx = px[j] - x, dy = py[j] - y, d = dx * dx + dy * dy;
          if (d > R2) continue;
          if (cnt < kN) { let p = cnt++; while (p > 0 && kd[p - 1] > d) { kd[p] = kd[p - 1]; ki[p] = ki[p - 1]; p--; } kd[p] = d; ki[p] = j; }
          else if (d < kd[kN - 1]) { let p = kN - 1; while (p > 0 && kd[p - 1] > d) { kd[p] = kd[p - 1]; ki[p] = ki[p - 1]; p--; } kd[p] = d; ki[p] = j; }
        }
      }
    }
    let ax = 0, ay = 0;
    if (cnt) {
      let mx = 0, my = 0, mvx = 0, mvy = 0, sx = 0, sy = 0;
      for (let n = 0; n < cnt; n++) {
        const j = ki[n];
        mx += px[j]; my += py[j]; mvx += vx[j]; mvy += vy[j];
        if (kd[n] < sepR2 && kd[n] > 0.01) { const w = 1 - kd[n] / sepR2; sx -= (px[j] - x) * w; sy -= (py[j] - y) * w; }
      }
      mx = mx / cnt - x; my = my / cnt - y; mvx /= cnt; mvy /= cnt;
      ax += mx * 0.004 * params.cohesion + (mvx - vx[i]) * 0.08 * params.alignment + sx * 0.06 * params.separation;
      ay += my * 0.004 * params.cohesion + (mvy - vy[i]) * 0.08 * params.alignment + sy * 0.06 * params.separation;
    }
    if (params.roost) { ax += (rx - x) * 0.00012; ay += (ry - y) * 0.00012; }
    // soft walls
    const m = 60;
    if (x < m) ax += (m - x) * .004; else if (x > W - m) ax -= (x - (W - m)) * .004;
    if (y < m) ay += (m - y) * .004; else if (y > H - m) ay -= (y - (H - m)) * .004;
    // predators
    for (const th of threats) {
      const dx = x - th.x, dy = y - th.y, d2 = dx * dx + dy * dy;
      if (d2 < fearR * fearR && d2 > 1) {
        const d = Math.sqrt(d2), f = (1 - d / fearR) * 1.6 * params.fear;
        ax += dx / d * f; ay += dy / d * f;
      }
    }
    // tiny noise
    ax += (Math.random() - .5) * .03; ay += (Math.random() - .5) * .03;
    let nvx = vx[i] + ax, nvy = vy[i] + ay;
    const v = Math.hypot(nvx, nvy) || 1, target = sp * (1 + Math.min(1, ax * ax + ay * ay) * .3);
    const s = v + (target - v) * 0.1;
    vx[i] = nvx / v * s; vy[i] = nvy / v * s;
  }
  for (let i = 0; i < N; i++) { px[i] += vx[i]; py[i] += vy[i]; }
  // falcon: dives toward the flock centre, then leaves
  if (falcon.on) {
    falcon.life -= 0.016;
    const dx = rx - falcon.x, dy = ry - falcon.y, d = Math.hypot(dx, dy) || 1;
    falcon.vx += dx / d * .2; falcon.vy += dy / d * .2;
    const fv = Math.hypot(falcon.vx, falcon.vy), cap = 6.5;
    if (fv > cap) { falcon.vx *= cap / fv; falcon.vy *= cap / fv; }
    falcon.x += falcon.vx; falcon.y += falcon.vy;
    if (falcon.life <= 0) falcon.on = false;
  }
}

function draw() {
  if (params.trails && !reduced) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  } else ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(10,5,22,.92)';
  ctx.lineWidth = W < 600 ? 1.6 : 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  const L = 2.2;
  for (let i = 0; i < N; i++) {
    ctx.moveTo(px[i], py[i]);
    ctx.lineTo(px[i] - vx[i] * L, py[i] - vy[i] * L);
  }
  ctx.stroke();
  if (falcon.on) {
    const a = Math.atan2(falcon.vy, falcon.vx);
    ctx.save(); ctx.translate(falcon.x, falcon.y); ctx.rotate(a);
    ctx.fillStyle = '#ffd08a';
    ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, 8); ctx.lineTo(-3, 0); ctx.lineTo(-8, -8); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

// UI
const sl = $('sliders');
const inputs = {};
for (const [key, label, min, max, stepv, dec] of SLIDERS) {
  const d = document.createElement('div'); d.className = 'sl';
  d.innerHTML = `<label for="s-${key}">${label}<output></output></label><input type="range" id="s-${key}" min="${min}" max="${max}" step="${stepv}">`;
  sl.appendChild(d);
  const inp = d.querySelector('input'), out = d.querySelector('output');
  inputs[key] = {inp, out, dec};
  inp.addEventListener('input', () => {
    params[key] = +inp.value; out.textContent = (+inp.value).toFixed(dec);
    if (key === 'count') setCount(params.count);
    if (key === 'count' && N > params.count) N = params.count, $('count').textContent = N;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  });
}
function sync() { for (const k in inputs) { inputs[k].inp.value = params[k]; inputs[k].out.textContent = (+params[k]).toFixed(inputs[k].dec); } }
document.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => {
  Object.assign(params, PRESETS[c.dataset.preset]); sync();
  document.querySelectorAll('.chip').forEach(x => x.classList.toggle('active', x === c));
}));
$('trails').addEventListener('change', e => { params.trails = e.target.checked; });
$('roost').addEventListener('change', e => { params.roost = e.target.checked; });
$('reset').addEventListener('click', reset);
function releaseFalcon() {
  const side = Math.random() < .5 ? -1 : 1;
  falcon.x = side < 0 ? -30 : W + 30; falcon.y = Math.random() * H * .5;
  falcon.vx = -side * 5; falcon.vy = 1; falcon.life = 5; falcon.on = true;
}
$('falcon').addEventListener('click', releaseFalcon);
const panel = $('panel'), toggle = $('toggle');
toggle.classList.add('show');
function setPanel(open) {
  panel.classList.toggle('hidden', !open);
  toggle.classList.toggle('closed', !open);
  toggle.setAttribute('aria-expanded', open);
}
toggle.addEventListener('click', () => setPanel(panel.classList.contains('hidden')));
if (innerWidth <= 720) setPanel(false);
$('enter').addEventListener('click', () => $('hero').classList.add('gone'));

canvas.addEventListener('pointerdown', e => { pointer.active = true; pointer.x = e.clientX; pointer.y = e.clientY; });
canvas.addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse' || pointer.active) { pointer.active = true; pointer.x = e.clientX; pointer.y = e.clientY; }
});
const off = () => { pointer.active = false; };
canvas.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') off(); });
canvas.addEventListener('pointercancel', off);
canvas.addEventListener('pointerleave', off);
addEventListener('resize', () => { resize(); });
document.addEventListener('keydown', e => { if (e.key === 'f') releaseFalcon(); });

sync(); resize();
if (innerWidth < 720 || /Mobi/i.test(navigator.userAgent)) { params.count = 900; setCount(0); N = 0; setCount(900); sync(); }

let last = performance.now(), frames = 0, acc = 0;
function loop(now) {
  step(); draw();
  frames++; acc += now - last; last = now;
  if (acc > 500) { $('fps').textContent = Math.round(frames * 1000 / acc); frames = 0; acc = 0; }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
})();
