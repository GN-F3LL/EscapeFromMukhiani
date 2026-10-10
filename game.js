'use strict';
// =====================================================================
//  გაქცევა მუხიანიდან — შაკუნკულას ისტორია
//  მუხიანი (ზომბები) → თემქა (ალქაჯი ლიზა) → ვაზისუბანი (სამოთხე)
// =====================================================================
(() => {

// ================== ზოგადი ==================
const FONT = "'Noto Sans Georgian', Sylfaen, 'Segoe UI', sans-serif";
const TAU = Math.PI * 2;
const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
const lightCv = document.createElement('canvas');
const lctx = lightCv.getContext('2d');
const LS = 0.5; // სინათლის ფენის გარჩევადობა
let W = 0, H = 0, DPR = 1;

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  lightCv.width = Math.ceil(W * LS); lightCv.height = Math.ceil(H * LS);
}
window.addEventListener('resize', resize);
resize();

const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
function angLerp(a, b, t) {
  const d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a + d * t;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function segDist2(x1, y1, x2, y2, px, py) {
  const dx = x2 - x1, dy = y2 - y1, l = dx * dx + dy * dy;
  let t = l ? ((px - x1) * dx + (py - y1) * dy) / l : 0;
  t = clamp(t, 0, 1);
  const ex = x1 + dx * t - px, ey = y1 + dy * t - py;
  return ex * ex + ey * ey;
}
function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function circle(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
function ellipse(c, x, y, rx, ry) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fill(); }
function wrapText(text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}
function fmtTime(s) {
  s = Math.floor(s);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

// სინათლის სპრაიტები (სწრაფი ნათება)
function glowSprite(r, g, b) {
  const c = mkCanvas(64, 64), x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, `rgba(${r},${g},${b},1)`);
  gr.addColorStop(0.35, `rgba(${r},${g},${b},0.45)`);
  gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  return c;
}
const GLOW = {
  fire: glowSprite(255, 120, 30),
  red: glowSprite(255, 40, 20),
  purple: glowSprite(170, 60, 255),
  green: glowSprite(60, 255, 130),
  gold: glowSprite(255, 210, 90),
  white: glowSprite(255, 250, 230),
  blue: glowSprite(120, 190, 255),
};
function glow(spr, x, y, r, a) {
  ctx.globalAlpha = a;
  ctx.drawImage(spr, x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

// ================== ხმა (WebAudio სინთეზი) ==================
let AC = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null, muted = false;
function initAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return;
  AC = new Ctor();
  master = AC.createGain(); master.gain.value = muted ? 0 : 0.6; master.connect(AC.destination);
  sfxBus = AC.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
  musicBus = AC.createGain(); musicBus.gain.value = 0.8; musicBus.connect(master);
  noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  mNext = AC.currentTime + 0.1;
}
function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.6;
  showMsg(muted ? 'ხმა გამორთულია' : 'ხმა ჩართულია', 1.2, '#ddd');
}
function note(f, dur, type, vol, when, ff, slide, bus) {
  if (!AC) return;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, when);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), when + dur);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(vol, when + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  let n = o;
  if (ff) { const fl = AC.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = ff; o.connect(fl); n = fl; }
  n.connect(g); g.connect(bus || sfxBus);
  o.start(when); o.stop(when + dur + 0.05);
}
function noise(dur, vol, ff, when, bus) {
  if (!AC) return;
  const s = AC.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const fl = AC.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = ff;
  const g = AC.createGain();
  g.gain.setValueAtTime(vol, when);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  s.connect(fl); fl.connect(g); g.connect(bus || sfxBus);
  s.start(when, Math.random() * 0.5); s.stop(when + dur + 0.05);
}
// დემონის ღრიალი: დაბალი ხერხისებური ტონები + ხმაური, ღრმა „ღრღრღრ“ ტრემოლოთი
function roarSound(t) {
  const dur = 1.6;
  const out = AC.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(0.85, t + 0.08);
  out.gain.setValueAtTime(0.85, t + dur * 0.55);
  out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const trem = AC.createGain(); trem.gain.value = 0.6;
  const lfo = AC.createOscillator(); lfo.frequency.value = 24;
  const lfoG = AC.createGain(); lfoG.gain.value = 0.45;
  lfo.connect(lfoG); lfoG.connect(trem.gain);
  const fl = AC.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = 5;
  fl.frequency.setValueAtTime(350, t);
  fl.frequency.linearRampToValueAtTime(1500, t + 0.25);
  fl.frequency.exponentialRampToValueAtTime(260, t + dur);
  fl.connect(trem); trem.connect(out); out.connect(sfxBus);
  for (const [f, v] of [[92, 0.32], [69, 0.3], [138, 0.14], [97, 0.22], [46, 0.25]]) {
    const o = AC.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f * 1.2, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.3);
    o.frequency.exponentialRampToValueAtTime(f * 0.6, t + dur);
    const g = AC.createGain(); g.gain.value = v;
    o.connect(g); g.connect(fl); o.start(t); o.stop(t + dur + 0.05);
  }
  const ns = AC.createBufferSource(); ns.buffer = noiseBuf; ns.loop = true;
  const ng = AC.createGain(); ng.gain.value = 0.55;
  ns.connect(ng); ng.connect(fl); ns.start(t); ns.stop(t + dur + 0.05);
  lfo.start(t); lfo.stop(t + dur + 0.05);
}

// ---------- ხმები / საუბარი ----------
// ჩაწერილი ხმის ფაილები (არასავალდებულო): თამაშის საქაღალდეში ჩადე, მაგ. shako_manqana.mp3
const VOICE = {};
function loadVoice(key, names) {
  const tryN = i => {
    if (i >= names.length) return;
    const a = new Audio();
    a.preload = 'auto';
    a.addEventListener('canplaythrough', () => { VOICE[key] = a; }, { once: true });
    a.addEventListener('error', () => tryN(i + 1), { once: true });
    a.src = names[i];
    a.load();
  };
  tryN(0);
}
loadVoice('manqana', ['shako_manqana.mp3', 'shako_manqana.m4a', 'shako_manqana.ogg', 'shako_manqana.wav', 'manqana.mp3', 'manqana.m4a', 'manqana.ogg', 'manqana.wav']);

function voice(who, text, key) {
  if (!AC || muted) return;
  const a = key && VOICE[key];
  if (a) { try { a.currentTime = 0; a.volume = 1; a.play().catch(() => babble(who, text)); } catch (e) { babble(who, text); } return; }
  // ქართული TTS ხმა, თუ სისტემაში არსებობს
  const ss = window.speechSynthesis;
  if (key && ss && ss.getVoices) {
    const v = ss.getVoices().find(v => /^ka/i.test(v.lang));
    if (v) { const u = new SpeechSynthesisUtterance(text); u.voice = v; u.lang = v.lang; u.rate = 1.05; ss.cancel(); ss.speak(u); return; }
  }
  babble(who, text);
}
// მულტფილმისებური „ბუტბუტი“ — თითოეულ პერსონაჟს თავისი ხმა აქვს
function babble(who, text) {
  const t0 = AC.currentTime + 0.02;
  const letters = text.replace(/[^ა-ჰa-zA-Z]/g, '').length;
  const n = clamp(Math.ceil(letters / 2.3), 3, 28);
  const mana = boss && boss.form === 'manatee';
  let base = 230, type = 'square', vol = 0.045, ff = 1600, step = 0.085;
  if (who === HERO_NAME) { base = 150; type = 'square'; vol = 0.05; ff = 1300; }
  else if (who === GIORGI_NAME) { base = 205; type = 'triangle'; vol = 0.08; ff = 2200; step = 0.075; }
  else if (who === NIKA_NAME) { base = 120; type = 'sawtooth'; vol = 0.04; ff = 900; step = 0.12; }
  else if (who === BOSS_NAME && mana) { base = 300; type = 'sine'; vol = 0.09; ff = 0; step = 0.11; }
  else if (who === BOSS_NAME) { base = 82; type = 'sawtooth'; vol = 0.08; ff = 900; step = 0.09; }
  for (let i = 0; i < n; i++) {
    const f = base * rand(0.85, 1.3) * (i === n - 1 ? 0.8 : 1);
    note(f, step * 0.85, type, vol, t0 + i * step, ff, f * rand(0.88, 1.08));
  }
}

const sfxLast = {};
function sfx(name) {
  if (!AC || muted) return;
  const t = AC.currentTime;
  if (sfxLast[name] && t - sfxLast[name] < 0.035) return;
  sfxLast[name] = t;
  switch (name) {
    case 'pistol': noise(0.07, 0.25, 3000, t); note(500, 0.07, 'square', 0.05, t, 0, 120); break;
    case 'rifle': noise(0.05, 0.2, 3500, t); note(380, 0.05, 'square', 0.04, t, 0, 100); break;
    case 'shotgun': noise(0.2, 0.45, 1600, t); note(180, 0.16, 'sawtooth', 0.09, t, 0, 50); break;
    case 'hit': note(170, 0.06, 'square', 0.06, t, 0, 70); break;
    case 'zdie': note(150, 0.35, 'sawtooth', 0.1, t, 900, 40); noise(0.18, 0.1, 700, t); break;
    case 'hurt': note(320, 0.22, 'sawtooth', 0.15, t, 1500, 90); break;
    case 'pickup': note(660, 0.08, 'triangle', 0.18, t); note(990, 0.14, 'triangle', 0.18, t + 0.08); break;
    case 'dash': noise(0.16, 0.14, 5000, t); break;
    case 'fireball': note(240, 0.25, 'sawtooth', 0.04, t, 900, 110); break;
    case 'boom': noise(0.7, 0.55, 500, t); note(90, 0.6, 'sine', 0.4, t, 0, 28); break;
    case 'smallboom': noise(0.35, 0.3, 800, t); note(120, 0.3, 'sine', 0.25, t, 0, 40); break;
    case 'groan': note(rand(70, 110), 0.7, 'sawtooth', 0.035, t, 500, rand(45, 60)); break;
    case 'laugh':
      for (let i = 0; i < 6; i++) note(620 - i * 45, 0.13, 'sawtooth', 0.09, t + i * 0.14, 2500, 480 - i * 45);
      break;
    case 'summon': note(110, 0.9, 'sawtooth', 0.08, t, 700, 440); noise(0.8, 0.12, 1200, t); break;
    case 'warn': note(880, 0.08, 'square', 0.04, t); break;
    case 'portal': [523, 659, 784, 1047, 1319].forEach((f, i) => note(f, 0.5, 'triangle', 0.1, t + i * 0.09)); break;
    case 'gate': [392, 523, 659].forEach((f, i) => note(f, 0.35, 'square', 0.06, t + i * 0.1, 2000)); break;
    case 'scream': note(900, 1.6, 'sawtooth', 0.12, t, 2500, 80); noise(1.2, 0.2, 1500, t); break;
    case 'step': noise(0.03, 0.03, 900, t); break;
    case 'roar': roarSound(t); break;
    case 'buzz': note(rand(190, 240), 0.35, 'sawtooth', 0.018, t, 1200, rand(170, 260)); break;
    case 'horn': [0, 0.22].forEach(d => { note(415, 0.16, 'square', 0.07, t + d, 1800); note(523, 0.16, 'square', 0.05, t + d, 1800); }); break;
  }
}

// --- მუსიკა ---
let musicMode = 'none', mNext = 0, mStep = 0;
function setMusic(m) {
  if (musicMode === m) return;
  musicMode = m; mStep = 0;
  if (AC) mNext = AC.currentTime + 0.15;
}
function kick(t) {
  if (!AC) return;
  note(130, 0.18, 'sine', 0.28, t, 0, 38, musicBus);
}
const MUSIC = {
  title: { step: 0.6, fn(i, t) {
    const n = [55, 51.9, 49, 46.2][Math.floor(i / 4) % 4];
    if (i % 4 === 0) note(n, 2.6, 'sawtooth', 0.05, t, 260, 0, musicBus);
    if (i % 4 === 2) note(n * 8, 0.9, 'triangle', 0.014, t, 3000, 0, musicBus);
  } },
  dark: { step: 0.42, fn(i, t) {
    const bass = [55, 55, 65.4, 55, 49, 49, 58.3, 51.9];
    const n = bass[Math.floor(i / 2) % 8];
    if (i % 2 === 0) note(n, 0.8, 'sawtooth', 0.055, t, 320, 0, musicBus);
    if (i % 8 === 4) note(n * (Math.random() < 0.5 ? 4 : 6), 1.4, 'triangle', 0.02, t, 2200, 0, musicBus);
    if (i % 16 === 0) kick(t);
  } },
  boss: { step: 0.19, fn(i, t) {
    const seq = [55, 55, 110, 55, 58.3, 58.3, 116.5, 58.3, 49, 49, 98, 49, 51.9, 51.9, 103.8, 65.4];
    note(seq[i % 16], 0.17, 'sawtooth', 0.06, t, 700, 0, musicBus);
    if (i % 4 === 0) kick(t);
    if (i % 8 === 6) noise(0.08, 0.06, 6000, t, musicBus);
    if (i % 16 === 8) note(seq[i % 16] * 8, 0.5, 'square', 0.015, t, 2200, 0, musicBus);
  } },
  light: { step: 0.3, fn(i, t) {
    const sc = [523.3, 587.3, 659.3, 784, 880];
    const ch = [[0, 2, 4], [1, 3, 4], [0, 2, 3], [2, 4, 0]][Math.floor(i / 8) % 4];
    note(sc[ch[i % 3]] * (i % 6 < 3 ? 1 : 0.5), 0.9, 'triangle', 0.03, t, 4000, 0, musicBus);
    if (i % 8 === 0) note(sc[ch[0]] / 4, 2.3, 'sine', 0.06, t, 1000, 0, musicBus);
    if (i % 32 === 20) note(sc[4] * 2, 0.25, 'sine', 0.02, t, 0, 0, musicBus);
  } },
};
function updateMusic() {
  if (!AC || musicMode === 'none' || muted) { if (AC) mNext = AC.currentTime + 0.1; return; }
  const m = MUSIC[musicMode];
  const now = AC.currentTime;
  if (mNext < now) mNext = now + 0.05;
  while (mNext < now + 0.25) { m.fn(mStep++, mNext); mNext += m.step; }
}

// ================== შეყვანა ==================
const keys = {};
const mouse = { x: 0, y: 0, down: false };
let usingTouch = false;
const tc = { move: null, aim: null };

window.addEventListener('keydown', e => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  const was = keys[e.code];
  keys[e.code] = true;
  if (was) return;
  usingTouch = false;
  initAudio();
  onPress(e.code);
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => {
  for (const k in keys) keys[k] = false;
  mouse.down = false;
  if (state === 'play') state = 'paused';
});
cv.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; usingTouch = false; });
cv.addEventListener('mousedown', e => {
  mouse.x = e.clientX; mouse.y = e.clientY; mouse.down = true; usingTouch = false;
  initAudio(); onPress('Click');
});
window.addEventListener('mouseup', () => { mouse.down = false; });
cv.addEventListener('contextmenu', e => e.preventDefault());

function dashBtn() { return { x: W - 80, y: H - 210, r: 36 }; }
function pauseBtn() { return { x: W - 34, y: 34, r: 22 }; }
cv.addEventListener('touchstart', e => {
  e.preventDefault();
  usingTouch = true;
  initAudio();
  for (const t of e.changedTouches) {
    const x = t.clientX, y = t.clientY;
    if (state !== 'play') { onPress('Click'); continue; }
    const pb = pauseBtn();
    if (Math.hypot(x - pb.x, y - pb.y) < pb.r + 10) { onPress('KeyP'); continue; }
    const d = dashBtn();
    if (Math.hypot(x - d.x, y - d.y) < d.r + 14) { tryDash(); continue; }
    if (x < W / 2 && !tc.move) tc.move = { id: t.identifier, sx: x, sy: y, x, y };
    else if (!tc.aim) tc.aim = { id: t.identifier, sx: x, sy: y, x, y };
  }
}, { passive: false });
cv.addEventListener('touchmove', e => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    for (const s of [tc.move, tc.aim]) if (s && s.id === t.identifier) { s.x = t.clientX; s.y = t.clientY; }
  }
}, { passive: false });
function touchEnd(e) {
  for (const t of e.changedTouches) {
    if (tc.move && tc.move.id === t.identifier) tc.move = null;
    if (tc.aim && tc.aim.id === t.identifier) tc.aim = null;
  }
}
cv.addEventListener('touchend', touchEnd);
cv.addEventListener('touchcancel', touchEnd);

function onPress(code) {
  if (code === 'KeyM') { toggleMute(); return; }
  if (fade.dir !== 0) return;
  const confirm = code === 'Enter' || code === 'Space' || code === 'Click' || code === 'NumpadEnter';
  switch (state) {
    case 'title':
      if (confirm) { resetRun(); startStory('intro', '#000'); }
      break;
    case 'story':
      if (confirm || code === 'KeyE') advanceStory();
      else if (code === 'Escape') skipStory();
      break;
    case 'play':
      if (code === 'KeyP' || code === 'Escape') state = 'paused';
      else if (code === 'ShiftLeft' || code === 'ShiftRight' || code === 'Space') tryDash();
      break;
    case 'paused':
      if (code === 'KeyP' || code === 'Escape' || confirm) state = 'play';
      break;
    case 'dead':
      if (deadT > 1.2 && (code === 'KeyR' || confirm)) fadeTo('#000', () => loadLevel(levelIdx));
      break;
    case 'end':
      if (endT > 2 && confirm) fadeTo('#000', () => { state = 'title'; setMusic('title'); });
      break;
  }
}

// ================== თამაშის მდგომარეობა ==================
let state = 'title';
let levelIdx = 0;
let level = null;
let player = null;
let zombies = [], bullets = [], ebullets = [], particles = [], pickups = [], hazards = [], decals = [];
let npcs = [], butterflies = [], birds = [];
let boss = null, portal = null;
const cam = { x: 0, y: 0, shake: 0 };
const view = { x: 0, y: 0 };
let stats = { kills: 0, time: 0, deaths: 0 };
let story = null;
let deadT = 0, endT = 0, gtime = 0, slowmo = 0, hurtFlash = 0, screenFlash = 0;
let msgs = [];
let dialog = null;
let titleCard = null;
const uiParts = [];

const fade = { a: 0, dir: 0, color: '#000', cb: null, speed: 1.6 };
function fadeTo(color, cb, speed = 1.6) {
  if (fade.dir === 1) return;
  fade.color = color; fade.cb = cb; fade.dir = 1; fade.speed = speed;
}
function updateFade(dt) {
  if (fade.dir === 1) {
    fade.a += dt * fade.speed;
    if (fade.a >= 1) {
      fade.a = 1; fade.dir = -1;
      const cb = fade.cb; fade.cb = null;
      if (cb) cb();
    }
  } else if (fade.dir === -1) {
    fade.a -= dt * fade.speed;
    if (fade.a <= 0) { fade.a = 0; fade.dir = 0; }
  }
}

function showMsg(text, dur = 2.5, color = '#ffd27a') { msgs.push({ text, t: 0, dur, color }); if (msgs.length > 3) msgs.shift(); }
function say(who, text, dur = 4, color = '#fff', vkey) { dialog = { who, text, t: 0, dur, color }; voice(who, text, vkey); }

function resetRun() { stats = { kills: 0, time: 0, deaths: 0 }; }

// ================== სიუჟეტი ==================
const STORIES = {
  intro: {
    theme: 'fire', music: 'title', portraits: ['hero'],
    lines: [
      'ღამეა. ჰაერში კვამლისა და დამწვარი რეზინის სუნი დგას...',
      'შაკუნკულა — უბრალო გლეხი — ცივ ასფალტზე იღვიძებს. თავი უსკდება.',
      'მისი თეთრი ალფა რომეო ჯულია გამქრალია. ის ვაზისუბნელმა გიორგიმ — სენიორ დეველოპერმა — მოპარა.',
      'ირგვლივ მუხიანი იწვის — სახლები, მანქანები, ქუჩები...',
      'ქუჩებში კი ზომბები დაეხეტებიან. ძალიან ბევრი ზომბი.',
      'ერთადერთი გზა გადარჩენისკენ — გაქცევა მუხიანიდან!',
    ],
    hint: 'WASD — სიარული  ·  მაუსი — დამიზნება და სროლა  ·  Shift / Space — ნახტომი  ·  P — პაუზა  ·  M — ხმა',
    next: () => loadLevel(0),
  },
  temqa: {
    theme: 'witch', music: 'title', portraits: ['hero', 'boss'],
    lines: [
      'შაკუნკულამ მუხიანს თავი დააღწია...',
      'მაგრამ გზა თემქაზე გადის — და აქ კიდევ უფრო ბნელა.',
      'ცა სისხლისფერია, მიწა სკდება და მისი ნაპრალებიდან ლავა ამოდის.',
      'თემქას ბოროტი ალქაჯი ლიზა, იგივე თავჯირკა, მართავს.',
      'ის ნამდვილი ეშმაკია — რქებიანი, ფრთოსანი, ბოროტი დემონი.',
      'სანამ თავჯირკა ცოცხალია, ამ ქალაქიდან ვერავინ გააღწევს.',
    ],
    next: () => loadLevel(1),
  },
  vazisubani: {
    theme: 'dawn', music: 'light', portraits: ['hero', 'manatee'],
    lines: [
      'ბოროტი ალქაჯი ლიზა, იგივე თავჯირკა, დამარცხებულია! მისი წყევლა ფერფლად იქცა.',
      'დემონი გაქრა — მის ადგილას ახლა უწყინარი ლამანტინი ბლუპუნებს.',
      'ცეცხლი ჩაქრა. ღრუბლებს შორის პირველმა მზის სხივმა გამოანათა.',
      'შაკუნკულას წინ ნათელი გზა იხსნება...',
      '...ვაზისუბნისკენ — სადაც გიორგი და მოპარული ჯულია იმალებიან.',
    ],
    next: () => loadLevel(2),
  },
  ending: {
    theme: 'dawn', music: 'title', portraits: ['hero'],
    lines: [
      'შაკუნკულა თავის თეთრ ალფა რომეო ჯულიას მიუახლოვდა...',
      'მაგრამ სენიორ დეველოპერმა გიორგიმ ერთი ბრძანება აკრიფა — და ჯულია აფეთქდა.',
      'გლეხი შაკუნკულა იქვე, ვაზისუბანში, დამარხეს.',
      'ზომბები გადაიტანა, დემონი დაამარცხა... სენიორ დეველოპერს კი ვერ აჯობა.',
      'სახლთან კი ისევ ზის ნიკა — უბრალო მათხოვარი — და გამვლელებს ხურდას სთხოვს.',
    ],
    next: () => { state = 'end'; endT = 0; setMusic('title'); },
  },
};
function startStory(key, color) {
  fadeTo(color, () => {
    const def = STORIES[key];
    story = { key, def, idx: 0, chars: 0, done: false, t: 0 };
    state = 'story';
    uiParts.length = 0;
    setMusic(def.music);
  });
}
function advanceStory() {
  if (!story || story.done) return;
  const line = story.def.lines[story.idx];
  if (story.chars < line.length) { story.chars = line.length; return; }
  if (story.idx < story.def.lines.length - 1) { story.idx++; story.chars = 0; return; }
  skipStory();
}
function skipStory() {
  if (!story || story.done) return;
  story.done = true;
  story.idx = story.def.lines.length - 1;
  story.chars = 9999;
  const light = story.def.theme === 'light' || story.def.theme === 'dawn';
  fadeTo(light ? '#fff' : '#000', story.def.next);
}

// ================== დონეები ==================
function addBuilding(L, x, y, w, h, rng, ruin) {
  const b = { x, y, w, h, kind: 'building', ruin: !!ruin, windows: [], vents: [], holes: [] };
  const n = Math.floor((w - 16) / 22);
  for (let i = 0; i < n; i++) {
    const fire = rng() < (ruin ? 0.25 : 0.1);
    b.windows.push({ x: x + 12 + i * 22, lit: rng() < 0.3, fire, ph: rng() * 10, broken: rng() < 0.3 });
    if (fire) L.fires.push({ x: x + 18 + i * 22, y: y + h - 14, s: 0.55 });
  }
  for (let k = 0; k < 3; k++) {
    b.vents.push({ x: x + 10 + rng() * Math.max(1, w - 40), y: y + 8 + rng() * Math.max(1, h - 70), w: 14 + rng() * 16, h: 10 + rng() * 12 });
  }
  if (ruin) {
    for (let k = 0; k < 3; k++) b.holes.push({ x: x + 10 + rng() * (w - 50), y: y + 8 + rng() * Math.max(1, h - 80), w: 20 + rng() * 30, h: 14 + rng() * 22 });
  }
  if (rng() < (ruin ? 0.6 : 0.35)) L.fires.push({ x: x + 20 + rng() * (w - 40), y: y + 15 + rng() * Math.max(1, h - 70), s: 1 + rng() * 0.8 });
  L.obstacles.push(b);
  return b;
}

function noiseTile(size, base, cols, n, rng, maxS = 3) {
  const c = mkCanvas(size, size), g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  for (let i = 0; i < n; i++) {
    g.fillStyle = cols[Math.floor(rng() * cols.length)];
    const s = 1 + rng() * maxS;
    g.fillRect(rng() * size, rng() * size, s, s);
  }
  return c;
}

// ---------- 1. მუხიანი ----------
function buildMukhiani() {
  const rng = mulberry32(1337);
  const CW = 520, CH = 440, COLS = 6, ROWS = 5;
  const L = {
    key: 'mukhiani', name: 'მუხიანი', sub: 'გააღწიე ზომბებით სავსე უბნიდან',
    w: CW * COLS, h: CH * ROWS, dark: true, type: 'escape',
    obstacles: [], fires: [], cracks: [], crackLights: [],
    kills: 0, goal: 30, spawnT: 1.5, bg: '#120f0d',
    ambient: () => 'rgba(6,3,3,0.9)',
  };
  L.start = { x: 220, y: CH * 2 };
  L.exit = { x: L.w - 70, y: CH * 2, r: 60, open: false };

  for (let cx = 0; cx < COLS; cx++) {
    for (let cy = 0; cy < ROWS; cy++) {
      const x0 = cx * CW + 70, y0 = cy * CH + 70, iw = CW - 140, ih = CH - 140;
      const r = rng();
      if (r < 0.12) {
        const bx = x0 + iw / 2, by = y0 + ih / 2;
        L.obstacles.push({ c: true, x: bx, y: by, r: 15, kind: 'barrel' });
        L.fires.push({ x: bx, y: by - 4, s: 1 });
        continue;
      }
      if (r < 0.55) {
        const w = iw - rng() * 60, h = 120 + rng() * 40;
        addBuilding(L, x0 + (iw - w) / 2, y0 + (ih - h) / 2 + (rng() - 0.5) * 50, w, h, rng);
      } else if (r < 0.85) {
        const w = 110 + rng() * 20, h = ih - 10 - rng() * 40;
        addBuilding(L, x0 + 10, y0 + (ih - h) / 2, w, h, rng);
        addBuilding(L, x0 + iw - 10 - w, y0 + (ih - h) / 2, w, h, rng);
      } else {
        const s = 190 + rng() * 60;
        addBuilding(L, x0 + (iw - s) / 2, y0 + (ih - s) / 2, s, s, rng);
      }
    }
  }
  // დამწვარი მანქანები
  let placed = 0;
  for (let i = 0; i < 200 && placed < 28; i++) {
    const horiz = rng() < 0.5;
    let x, y, w, h;
    if (horiz) {
      const k = 1 + Math.floor(rng() * (ROWS - 1));
      x = 100 + rng() * (L.w - 200); y = k * CH + (rng() < 0.5 ? -40 : 6); w = 76; h = 34;
    } else {
      const k = 1 + Math.floor(rng() * (COLS - 1));
      y = 100 + rng() * (L.h - 200); x = k * CW + (rng() < 0.5 ? -40 : 6); w = 34; h = 76;
    }
    if (Math.hypot(x - L.start.x, y - L.start.y) < 320) continue;
    if (Math.hypot(x - L.exit.x, y - L.exit.y) < 260) continue;
    if (L.obstacles.some(o => !o.c && x < o.x + o.w + 30 && x + w > o.x - 30 && y < o.y + o.h + 30 && y + h > o.y - 30)) continue;
    const burning = rng() < 0.6;
    L.obstacles.push({ x, y, w, h, kind: 'car', col: ['#3a3f45', '#4a2a26', '#2d3a2c', '#3d3527', '#2a2d40'][Math.floor(rng() * 5)], burning });
    if (burning) L.fires.push({ x: x + w / 2, y: y + h / 2, s: 1.3 });
    placed++;
  }
  L.ground = groundMukhiani(L, rng, CW, CH, COLS, ROWS);
  return L;
}

function groundMukhiani(L, rng, CW, CH, COLS, ROWS) {
  const c = mkCanvas(L.w, L.h), g = c.getContext('2d');
  g.fillStyle = g.createPattern(noiseTile(256, '#1d1915', ['#25201a', '#15120f', '#2b2218', '#1e1d13', '#2a2620'], 1400, rng), 'repeat');
  g.fillRect(0, 0, L.w, L.h);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(${60 + rng() * 40},${50 + rng() * 25},20,0.13)`;
    ellipse(g, rng() * L.w, rng() * L.h, 30 + rng() * 70, 20 + rng() * 50);
  }
  // ტროტუარი + ასფალტი
  g.fillStyle = '#2e2a26';
  for (let k = 0; k <= ROWS; k++) g.fillRect(0, k * CH - 68, L.w, 136);
  for (let k = 0; k <= COLS; k++) g.fillRect(k * CW - 68, 0, 136, L.h);
  g.fillStyle = g.createPattern(noiseTile(128, '#202022', ['#29292b', '#18181a', '#2f2d2a'], 700, rng, 2), 'repeat');
  for (let k = 0; k <= ROWS; k++) g.fillRect(0, k * CH - 58, L.w, 116);
  for (let k = 0; k <= COLS; k++) g.fillRect(k * CW - 58, 0, 116, L.h);
  // ხაზები
  g.fillStyle = 'rgba(140,120,70,0.35)';
  for (let k = 0; k <= ROWS; k++) for (let x = 0; x < L.w; x += 60) {
    const m = x % CW; if (m < 80 || m > CW - 80) continue;
    g.fillRect(x, k * CH - 2, 30, 4);
  }
  for (let k = 0; k <= COLS; k++) for (let y = 0; y < L.h; y += 60) {
    const m = y % CH; if (m < 80 || m > CH - 80) continue;
    g.fillRect(k * CW - 2, y, 4, 30);
  }
  // ბზარები
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1.5;
  for (let i = 0; i < 160; i++) {
    let x = rng() * L.w, y = rng() * L.h;
    g.beginPath(); g.moveTo(x, y);
    for (let j = 0; j < 5; j++) { x += (rng() - 0.5) * 40; y += (rng() - 0.5) * 40; g.lineTo(x, y); }
    g.stroke();
  }
  // ნამწვი ლაქები
  for (let i = 0; i < 70; i++) {
    const x = rng() * L.w, y = rng() * L.h, r = 30 + rng() * 60;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(0,0,0,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // ნაგავი / ქაღალდები
  for (let i = 0; i < 300; i++) {
    g.fillStyle = ['#3a342b', '#4a4035', '#2e3a2a', '#463030'][Math.floor(rng() * 4)];
    g.save(); g.translate(rng() * L.w, rng() * L.h); g.rotate(rng() * TAU);
    g.fillRect(-3, -2, 4 + rng() * 6, 3 + rng() * 3); g.restore();
  }
  // გასასვლელის წარწერა
  g.fillStyle = 'rgba(200,190,150,0.25)';
  g.font = `bold 40px ${FONT}`; g.textAlign = 'center';
  g.fillText('თემქა →', L.exit.x - 160, L.exit.y + 14);
  return c;
}

// ---------- 2. თემქა ----------
function buildTemqa() {
  const rng = mulberry32(666);
  const L = {
    key: 'temqa', name: 'თემქა', sub: 'ბოროტი დემონის ბუნაგი',
    w: 2400, h: 1800, dark: true, type: 'boss',
    obstacles: [], fires: [], cracks: [], crackLights: [],
    calm: 0, pickT: 8, bg: '#140a09',
  };
  L.ambient = () => `rgba(10,0,8,${0.93 - 0.35 * L.calm})`;
  const cx = L.w / 2, cy = L.h / 2;
  L.center = { x: cx, y: cy };
  // ნანგრევები პერიმეტრზე
  for (let i = 0; i < 400 && L.obstacles.length < 28; i++) {
    const w = 110 + rng() * 170, h = 100 + rng() * 140;
    const x = 20 + rng() * (L.w - w - 40), y = 20 + rng() * (L.h - h - 40);
    const mx = x + w / 2, my = y + h / 2;
    if (Math.hypot(mx - cx, my - cy) < Math.max(w, h) / 2 + 700) continue;
    if (L.obstacles.some(o => x < o.x + o.w + 50 && x + w > o.x - 50 && y < o.y + o.h + 50 && y + h > o.y - 50)) continue;
    addBuilding(L, x, y, w, h, rng, true);
  }
  // სვეტები მანგლებით
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU + Math.PI / 6;
    const x = cx + Math.cos(a) * 380, y = cy + Math.sin(a) * 330;
    L.obstacles.push({ c: true, x, y, r: 26, kind: 'pillar' });
    L.fires.push({ x, y: y - 6, s: 0.9 });
  }
  // ლავის ნაპრალები
  for (let i = 0; i < 16; i++) {
    const a0 = rng() * TAU, r0 = 120 + rng() * 520;
    let x = cx + Math.cos(a0) * r0, y = cy + Math.sin(a0) * r0 * 0.8, a = rng() * TAU;
    const pts = [{ x, y }];
    const n = 10 + Math.floor(rng() * 16);
    for (let j = 0; j < n; j++) {
      a += (rng() - 0.5) * 1.1;
      x += Math.cos(a) * 28; y += Math.sin(a) * 28;
      pts.push({ x, y });
      if (j % 4 === 2) L.crackLights.push({ x, y, ph: rng() * 10 });
    }
    L.cracks.push(pts);
  }
  // ცეცხლები
  for (let i = 0; i < 60 && L.fires.length < 70; i++) {
    const a = rng() * TAU, r = 560 + rng() * 500;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.75;
    if (x < 40 || y < 40 || x > L.w - 40 || y > L.h - 40) continue;
    if (blockedIn(L, x, y, 20)) continue;
    L.fires.push({ x, y, s: 0.8 + rng() * 0.9 });
  }
  L.start = { x: cx, y: cy + 470 };
  L.ground = groundTemqa(L, rng);
  return L;
}

function groundTemqa(L, rng) {
  const c = mkCanvas(L.w, L.h), g = c.getContext('2d');
  g.fillStyle = g.createPattern(noiseTile(256, '#1c0f0c', ['#28120d', '#120807', '#2e1810', '#1f1414', '#331a12'], 1600, rng), 'repeat');
  g.fillRect(0, 0, L.w, L.h);
  for (let i = 0; i < 120; i++) {
    const x = rng() * L.w, y = rng() * L.h, r = 40 + rng() * 90;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // ქვაფენილი მოედანი
  const cx = L.center.x, cy = L.center.y;
  g.fillStyle = 'rgba(60,40,45,0.5)';
  ellipse(g, cx, cy, 560, 470);
  g.strokeStyle = 'rgba(20,10,10,0.6)'; g.lineWidth = 2;
  for (let r = 80; r < 560; r += 55) { g.beginPath(); g.ellipse(cx, cy, r, r * 0.84, 0, 0, TAU); g.stroke(); }
  for (let i = 0; i < 36; i++) {
    const a = i / 36 * TAU;
    g.beginPath(); g.moveTo(cx + Math.cos(a) * 80, cy + Math.sin(a) * 67); g.lineTo(cx + Math.cos(a) * 560, cy + Math.sin(a) * 470); g.stroke();
  }
  // რიტუალური წრე
  g.strokeStyle = 'rgba(150,40,180,0.45)'; g.lineWidth = 5;
  g.beginPath(); g.arc(cx, cy, 250, 0, TAU); g.stroke();
  g.lineWidth = 3;
  g.beginPath(); g.arc(cx, cy, 215, 0, TAU); g.stroke();
  g.beginPath();
  for (let i = 0; i <= 5; i++) {
    const a = -Math.PI / 2 + (i * 2 % 5) / 5 * TAU;
    const x = cx + Math.cos(a) * 215, y = cy + Math.sin(a) * 215;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.stroke();
  g.fillStyle = 'rgba(170,60,200,0.5)';
  g.font = `bold 18px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const runes = 'ლიზაალქაჯიბნელიცეცხლი';
  for (let i = 0; i < 22; i++) {
    const a = i / 22 * TAU;
    g.save(); g.translate(cx + Math.cos(a) * 233, cy + Math.sin(a) * 233); g.rotate(a + Math.PI / 2);
    g.fillText(runes[i % runes.length], 0, 0); g.restore();
  }
  // ნაპრალები
  for (const pts of L.cracks) {
    for (const [w, col] of [[10, 'rgba(90,10,0,0.9)'], [4, '#e2561a'], [1.5, '#ffd27a']]) {
      g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke();
    }
  }
  // ძვლები / ქვები
  for (let i = 0; i < 220; i++) {
    g.fillStyle = rng() < 0.3 ? 'rgba(200,190,170,0.35)' : 'rgba(10,5,5,0.6)';
    g.save(); g.translate(rng() * L.w, rng() * L.h); g.rotate(rng() * TAU);
    g.fillRect(-4, -1.5, 6 + rng() * 8, 3); g.restore();
  }
  return c;
}

// ---------- 3. ვაზისუბანი ----------
function buildVazisubani() {
  const rng = mulberry32(77);
  const L = {
    key: 'vazisubani', name: 'ვაზისუბანი', sub: 'სამოთხე დედამიწაზე',
    w: 2600, h: 1700, dark: false, type: 'peace',
    obstacles: [], fires: [], cracks: [], crackLights: [], bg: '#6db94e',
    done: false,
  };
  const cx = 1300, cy = 850;
  L.goal = { x: cx, y: cy, r: 170 };
  L.pathsH = [300, 850, 1400];
  L.pathsV = [400, 1300, 2200];
  L.plazaR = 300;
  L.vineyards = [{ x: 30, y: 920, w: 330, h: 400 }, { x: 2260, y: 370, w: 310, h: 400 }, { x: 1360, y: 1460, w: 760, h: 220 }];
  L.obstacles.push({ c: true, x: cx, y: cy, r: 70, kind: 'fountain' });
  L.giulia = { x: 700, y: cy - 44, w: 112, h: 50, kind: 'giulia', found: false, blink: 0 };
  L.obstacles.push(L.giulia);
  L.giorgi = { x: L.giulia.x + L.giulia.w + 34, y: L.giulia.y + L.giulia.h / 2 + 4, a: Math.PI, t: 0, tx: null, ty: null, dig: 0 };

  const onPath = (x, y, w, h, m) => {
    for (const py of L.pathsH) if (y < py + 45 + m && y + h > py - 45 - m) return true;
    for (const px of L.pathsV) if (x < px + 45 + m && x + w > px - 45 - m) return true;
    return false;
  };
  const inPlaza = (x, y, w, h, m) => {
    const nx = clamp(cx, x, x + w), ny = clamp(cy, y, y + h);
    return Math.hypot(nx - cx, ny - cy) < L.plazaR + m;
  };
  const inVine = (x, y, w, h) => L.vineyards.some(v => x < v.x + v.w && x + w > v.x && y < v.y + v.h && y + h > v.y);
  const walls = ['#f6e3c1', '#f3d6d6', '#d9ecf5', '#e8f3d6', '#fbeec9', '#efe0f5'];
  const houses = [];
  for (let i = 0; i < 900 && houses.length < 26; i++) {
    const w = 150 + rng() * 80, h = 120 + rng() * 60;
    const x = 30 + rng() * (L.w - w - 60), y = 30 + rng() * (L.h - h - 60);
    if (onPath(x, y, w, h, 20) || inPlaza(x, y, w, h, 40) || inVine(x, y, w, h)) continue;
    if (houses.some(o => x < o.x + o.w + 40 && x + w > o.x - 40 && y < o.y + o.h + 40 && y + h > o.y - 40)) continue;
    const hs = { x, y, w, h, kind: 'house', wall: walls[Math.floor(rng() * walls.length)], roof: rng() < 0.7 ? '#c8553d' : '#a0522d', windows: [] };
    const n = Math.floor((w - 30) / 30);
    for (let k = 0; k < n; k++) hs.windows.push({ x: x + 18 + k * 30, flowers: rng() < 0.7 });
    hs.door = x + w / 2 - 9;
    houses.push(hs); L.obstacles.push(hs);
  }
  // ნიკა — სახლის კართან, მანქანის ახლოს
  {
    let best = null, bd = 1e9;
    for (const h of houses) {
      const d = Math.hypot(h.door - 560, h.y + h.h - 830);
      if (h.y + h.h < cy && d < bd) { bd = d; best = h; }
    }
    if (best) L.nika = { x: best.door + 9, y: best.y + best.h + 17, t: 0, line: 0 };
  }
  // ჩაძაღლებული ლამანტინი — გზის პირას, ბალახზე
  const spots = [];
  for (const y of [948, 975, 752, 725]) for (let x = 600; x <= 1000; x += 25) spots.push([x, y]);
  spots.sort((u, v) => Math.hypot(u[0] - 760, u[1] - 850) - Math.hypot(v[0] - 760, v[1] - 850));
  for (const [x, y] of spots) {
    if (!blockedIn(L, x, y, 50) && Math.hypot(x - cx, y - cy) > L.plazaR + 70) {
      L.carcass = { c: true, x, y, r: 30, kind: 'carcass', said: false };
      L.obstacles.push(L.carcass);
      break;
    }
  }
  // ხეები
  let trees = 0;
  for (let i = 0; i < 2000 && trees < 90; i++) {
    const r = 18 + rng() * 16;
    const x = r + rng() * (L.w - r * 2), y = r + rng() * (L.h - r * 2);
    if (onPath(x - r, y - r, r * 2, r * 2, 8) || inPlaza(x - r, y - r, r * 2, r * 2, 20) || inVine(x - r, y - r, r * 2, r * 2)) continue;
    if (blockedIn(L, x, y, r + 14)) continue;
    L.obstacles.push({ c: true, x, y, r, kind: 'tree', grapes: rng() < 0.3, fruit: rng() < 0.25, shade: rng() });
    trees++;
  }
  L.start = { x: 120, y: cy };
  // მაცხოვრებლები
  const greets = ['გამარჯობა, შაკუნკულა!', 'კეთილი იყოს შენი მობრძანება!', 'აქ ყოველთვის მზეა!', 'ზომბები აქ არ არიან, დაისვენე!', 'თავჯირკა დაამარცხე? გმირი ხარ!', 'ყურძენს ხომ არ მიირთმევ?', 'გიორგი შენს მანქანასთან დგას... ფრთხილად!'];
  for (let i = 0; i < 9; i++) {
    const onH = rng() < 0.6;
    const x = onH ? 200 + rng() * (L.w - 400) : L.pathsV[Math.floor(rng() * 3)];
    const y = onH ? L.pathsH[Math.floor(rng() * 3)] : 150 + rng() * (L.h - 300);
    if (Math.hypot(x - cx, y - cy) < 200) continue;
    npcs.push({ x, y, r: 14, a: rng() * TAU, t: rng() * 5, walk: 0, col: ['#e05a7a', '#4a90d9', '#f2b134', '#7bc96f', '#9b6ad6'][i % 5], hair: ['#3b2412', '#d9a441', '#1a1a1a', '#8b3a1a'][i % 4], text: greets[i % greets.length], wave: 0 });
  }
  L.ground = groundVazisubani(L, rng);
  return L;
}

function groundVazisubani(L, rng) {
  const c = mkCanvas(L.w, L.h), g = c.getContext('2d');
  const tile = noiseTile(256, '#6cb94c', ['#62ad43', '#78c75a', '#5a9f3d', '#82d065'], 2400, rng, 3);
  const tg = tile.getContext('2d');
  for (let i = 0; i < 70; i++) {
    tg.fillStyle = ['#ffffff', '#ffe066', '#ff8fb1', '#c59bff', '#ff6b6b'][Math.floor(rng() * 5)];
    circle(tg, rng() * 256, rng() * 256, 1.6 + rng() * 1.4);
  }
  g.fillStyle = g.createPattern(tile, 'repeat');
  g.fillRect(0, 0, L.w, L.h);
  // ჩრდილოვანი ლაქები ბალახზე
  for (let i = 0; i < 120; i++) {
    g.fillStyle = `rgba(${rng() < 0.5 ? '255,255,200' : '40,90,30'},0.08)`;
    ellipse(g, rng() * L.w, rng() * L.h, 40 + rng() * 90, 30 + rng() * 60);
  }
  // ვენახები
  for (const v of L.vineyards) {
    g.fillStyle = 'rgba(120,90,50,0.35)'; g.fillRect(v.x, v.y, v.w, v.h);
    for (let y = v.y + 25; y < v.y + v.h - 10; y += 40) {
      g.strokeStyle = '#6b4a2a'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(v.x + 10, y); g.lineTo(v.x + v.w - 10, y); g.stroke();
      for (let x = v.x + 20; x < v.x + v.w - 15; x += 22) {
        g.fillStyle = '#3f8f35'; circle(g, x, y - 2, 9);
        g.fillStyle = '#5cb04a'; circle(g, x - 3, y - 5, 5);
        if (rng() < 0.55) {
          g.fillStyle = rng() < 0.7 ? '#6a2c8a' : '#9acd32';
          for (let k = 0; k < 5; k++) circle(g, x + 3 + (k % 2) * 3, y + 4 + Math.floor(k / 2) * 3, 2.2);
        }
      }
    }
  }
  // ბილიკები
  const drawPaths = (w, col) => {
    g.fillStyle = col;
    for (const py of L.pathsH) g.fillRect(0, py - w / 2, L.w, w);
    for (const px of L.pathsV) g.fillRect(px - w / 2, 0, w, L.h);
  };
  drawPaths(100, '#bfa97a');
  drawPaths(88, '#e9dbb2');
  g.fillStyle = 'rgba(190,170,120,0.35)';
  for (let i = 0; i < 1600; i++) {
    const onH = rng() < 0.5;
    const x = onH ? rng() * L.w : L.pathsV[Math.floor(rng() * 3)] + (rng() - 0.5) * 80;
    const y = onH ? L.pathsH[Math.floor(rng() * 3)] + (rng() - 0.5) * 80 : rng() * L.h;
    g.fillRect(x, y, 3, 3);
  }
  // მოედანი
  const { x: cx, y: cy } = L.goal;
  g.fillStyle = '#bfa97a'; circle(g, cx, cy, L.plazaR + 8);
  g.fillStyle = '#f1e6c8'; circle(g, cx, cy, L.plazaR);
  g.strokeStyle = 'rgba(180,150,100,0.5)'; g.lineWidth = 2;
  for (let r = 100; r < L.plazaR; r += 40) { g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke(); }
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * TAU;
    g.beginPath(); g.moveTo(cx + Math.cos(a) * 100, cy + Math.sin(a) * 100); g.lineTo(cx + Math.cos(a) * L.plazaR, cy + Math.sin(a) * L.plazaR); g.stroke();
  }
  // ყვავილნარები მოედნის ირგვლივ
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU + Math.PI / 8;
    const x = cx + Math.cos(a) * 200, y = cy + Math.sin(a) * 200;
    g.fillStyle = '#7a5a3a'; circle(g, x, y, 30);
    g.fillStyle = '#4f9a38'; circle(g, x, y, 26);
    for (let k = 0; k < 26; k++) {
      g.fillStyle = ['#ff5d8f', '#ffd23f', '#ffffff', '#b388ff', '#ff7b39'][Math.floor(rng() * 5)];
      const aa = rng() * TAU, rr = rng() * 22;
      circle(g, x + Math.cos(aa) * rr, y + Math.sin(aa) * rr, 3);
    }
  }
  g.fillStyle = 'rgba(120,90,40,0.35)';
  g.font = `bold 34px ${FONT}`; g.textAlign = 'center';
  g.fillText('ვაზისუბნის მოედანი', cx, cy + L.plazaR - 30);
  return c;
}

const BUILDERS = [buildMukhiani, buildTemqa, buildVazisubani];

function loadLevel(i) {
  levelIdx = i;
  zombies = []; bullets = []; ebullets = []; particles = []; pickups = []; hazards = []; decals = [];
  npcs = []; butterflies = []; birds = [];
  boss = null; portal = null; msgs = []; dialog = null; slowmo = 0; hurtFlash = 0;
  tc.move = tc.aim = null;
  level = BUILDERS[i]();
  player = {
    x: level.start.x, y: level.start.y, r: 15, hp: 100, maxHp: 100, angle: 0,
    speed: 235, fireCd: 0, weapon: 'pistol', weaponTime: 0,
    dashCd: 0, dashT: 0, dvx: 0, dvy: 0, inv: 1, walk: 0, flash: 0, dead: false, armed: level.type !== 'peace', stepT: 0,
  };
  cam.x = player.x - W / 2; cam.y = player.y - H / 2; cam.shake = 0;
  clampCam();
  titleCard = { name: level.name, sub: level.sub, t: 0 };
  state = 'play';

  if (level.type === 'escape') {
    setMusic('dark');
    for (let k = 0; k < 12; k++) spawnZombieNear(true);
    say(HERO_NAME, 'სადაა ჩემი მანქანა?! ჩემი ჯულია სადაა?!', 4, '#fff', 'manqana');
    const lvl = level;
    setTimeout(() => { if (level === lvl && player && !player.dead) say(HERO_NAME, 'სად ვარ?.. რა ხდება აქ?! უნდა გავიქცე აქედან!', 3.8); }, 4200);
    setTimeout(() => { if (level === lvl) showMsg(`მოკალი ${level.goal} ზომბი — გასასვლელი გაიხსნება აღმოსავლეთით →`, 5); }, 8200);
  } else if (level.type === 'boss') {
    setMusic('boss');
    boss = {
      x: level.center.x, y: level.center.y - 160, r: 36, hp: 320, maxHp: 320,
      t: 0, phase: 1, state: 'intro', introT: 4.2, atk: null, atkT: 1.5, lastAtk: '',
      tx: 0, ty: 0, moveT: 0, tauntT: 6, tauntN: 0, roarT: 4, roarFx: 0, spin: 0, flash: 0, inv: 0, alpha: 0, bob: 0, dead: false, deadT: 0,
    };
    sfx('laugh');
    say(BOSS_NAME, 'ჰა-ჰა-ჰა! შაკუნკულა! მუხიანს გაექეცი, მაგრამ თემქიდან ცოცხალი ვერ წახვალ!', 4.5, '#ffb3a0');
  } else {
    setMusic('light');
    for (let k = 0; k < 16; k++) butterflies.push(makeButterfly(player.x + rand(-500, 500), player.y + rand(-400, 400)));
    say('შაკუნკულა', 'ეს... სამოთხეა? აქ ზომბები აღარ არიან...', 4.5);
    setTimeout(() => { if (level && level.key === 'vazisubani') showMsg('იპოვე გიორგი და შენი მოპარული ალფა რომეო ჯულია!', 5, '#fff3c4'); }, 4800);
  }
}

// ================== შეჯახებები ==================
function blockedIn(L, x, y, r) {
  for (const o of L.obstacles) {
    if (o.c) { if ((x - o.x) ** 2 + (y - o.y) ** 2 < (r + o.r) ** 2) return true; }
    else if (x > o.x - r && x < o.x + o.w + r && y > o.y - r && y < o.y + o.h + r) return true;
  }
  return false;
}
const blocked = (x, y, r) => blockedIn(level, x, y, r);

function collide(e, r) {
  for (const o of level.obstacles) {
    if (o.c) {
      const dx = e.x - o.x, dy = e.y - o.y, m = r + o.r;
      const d2 = dx * dx + dy * dy;
      if (d2 < m * m) {
        const d = Math.sqrt(d2) || 0.01;
        e.x = o.x + dx / d * m; e.y = o.y + dy / d * m;
      }
    } else {
      if (e.x < o.x - r || e.x > o.x + o.w + r || e.y < o.y - r || e.y > o.y + o.h + r) continue;
      const cx = clamp(e.x, o.x, o.x + o.w), cy = clamp(e.y, o.y, o.y + o.h);
      const dx = e.x - cx, dy = e.y - cy, d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        e.x = cx + dx / d * r; e.y = cy + dy / d * r;
      } else {
        const l = e.x - o.x, rr = o.x + o.w - e.x, t = e.y - o.y, b = o.y + o.h - e.y;
        const m = Math.min(l, rr, t, b);
        if (m === l) e.x = o.x - r; else if (m === rr) e.x = o.x + o.w + r;
        else if (m === t) e.y = o.y - r; else e.y = o.y + o.h + r;
      }
    }
  }
  e.x = clamp(e.x, r, level.w - r);
  e.y = clamp(e.y, r, level.h - r);
}

// ================== ნაწილაკები ==================
function addP(p) {
  if (particles.length > 1600) return;
  p.max = p.life;
  particles.push(p);
}
function burst(x, y, n, opt) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), s = rand(opt.smin || 40, opt.smax || 200);
    addP({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(opt.lmin || 0.3, opt.lmax || 0.8),
      size: rand(opt.szmin || 2, opt.szmax || 4), kind: opt.kind || 'spark', col: opt.col, glow: opt.glow !== false, drag: opt.drag ?? 3, grow: opt.grow || 0,
    });
  }
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles[i] = particles[particles.length - 1]; particles.pop(); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; }
    if (p.grow) p.size += p.grow * dt;
    if (p.grav) p.vy += p.grav * dt;
  }
}
function drawParticles(glowPass) {
  for (const p of particles) {
    if (p.glow !== glowPass) continue;
    if (p.x < view.x - 40 || p.x > view.x + W + 40 || p.y < view.y - 40 || p.y > view.y + H + 40) continue;
    const k = p.life / p.max;
    if (p.kind === 'fire') {
      ctx.fillStyle = `hsla(${8 + 42 * k},100%,${28 + 32 * k}%,${Math.min(0.85, k * 1.2)})`;
      circle(ctx, p.x, p.y, p.size * (0.4 + k * 0.6));
    } else if (p.kind === 'smoke') {
      ctx.fillStyle = `rgba(${p.col || '40,36,34'},${0.28 * k})`;
      circle(ctx, p.x, p.y, p.size);
    } else {
      ctx.fillStyle = `rgba(${p.col || '255,200,120'},${k})`;
      circle(ctx, p.x, p.y, p.size * (p.kind === 'blood' ? 1 : 0.5 + k * 0.5));
    }
  }
}

// ================== მოთამაშე ==================
const BOSS_NAME = 'ბოროტი ალქაჯი ლიზა იგივე თავჯირკა';
const HERO_NAME = 'შაკუნკულა';
const GIORGI_NAME = 'გიორგი — სენიორ დეველოპერი';
const NIKA_NAME = 'ნიკა — მათხოვარი';

// პერსონაჟების ფოტოები (თამაშის საქაღალდეში): SHAKO.jpg / LIZA.jpg (ან .png)
const IMG = {};
function loadImg(key, names) {
  const tryN = i => {
    if (i >= names.length) return;
    const im = new Image();
    im.onload = () => { IMG[key] = im; };
    im.onerror = () => tryN(i + 1);
    im.src = names[i];
  };
  tryN(0);
}
loadImg('hero', ['SHAKO.jpg', 'SHAKO.png', 'shako.jpg', 'shako.png', 'SHAKO.jpeg']);
loadImg('boss', ['LIZA.jpg', 'LIZA.png', 'liza.jpg', 'liza.png', 'LIZA.jpeg']);

function drawPortrait(key, cx, cy, r, alpha, showName = true) {
  const mana = key === 'manatee';
  const who = key === 'hero' ? 'hero' : 'boss';
  const hero = who === 'hero';
  const col = hero ? '#5aa0ff' : mana ? '#8fc3e0' : '#ff4a2a';
  const im = IMG[who];
  // ლიზას ფოტო სრულად (ტანიანად) — მაღალი ჩარჩო; სხვა შემთხვევაში მრგვალი
  const tall = !hero && !!im;
  const fh = tall ? r * 2.5 : r * 2;
  const fw = tall ? fh * im.width / im.height : r * 2;
  if (tall) cy = Math.max(cy, fh / 2 + 8);
  const fx = cx - fw / 2, fy = cy - fh / 2;
  const shape = () => {
    if (tall) roundRect(ctx, fx, fy, fw, fh, Math.min(fw, fh) * 0.12);
    else { ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); }
  };
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'lighter';
  glow(hero || mana ? GLOW.blue : GLOW.red, cx, cy, Math.max(fw, fh) * 0.85, 0.45 * alpha);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = alpha;
  shape();
  ctx.fillStyle = hero ? '#05070c' : mana ? '#0c2a3a' : '#1a0404'; ctx.fill();
  ctx.save();
  ctx.clip();
  if (im && hero) {
    const sc = Math.max(2 * r / im.width, 2 * r / im.height) * 1.04;
    const w = im.width * sc, h = im.height * sc;
    ctx.drawImage(im, cx - w / 2, cy - h / 2, w, h);
  } else if (im) {
    ctx.drawImage(im, fx, fy, fw, fh);
    if (!mana) {
      // დემონური შეფერილობა
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = '#ff5a3c'; ctx.fillRect(fx, fy, fw, fh);
      ctx.globalCompositeOperation = 'source-over';
      const fg = ctx.createLinearGradient(0, fy + fh, 0, fy + fh * 0.4);
      fg.addColorStop(0, `rgba(255,${120 + Math.sin(gtime * 8) * 30},20,0.6)`); fg.addColorStop(1, 'rgba(255,60,0,0)');
      ctx.fillStyle = fg; ctx.fillRect(fx, fy, fw, fh);
      // რქები თავზე (ფოტოს კოორდინატებში)
      const P = (u, v) => [fx + u * fw, fy + v * fh];
      for (const [b1, b2, tip, ctl] of [
        [[0.4, 0.088], [0.48, 0.078], [0.33, 0.022], [0.32, 0.065]],
        [[0.58, 0.075], [0.66, 0.088], [0.72, 0.025], [0.75, 0.06]],
      ]) {
        const [x1, y1] = P(...b1), [x2, y2] = P(...b2), [tx, ty] = P(...tip), [qx, qy] = P(...ctl);
        const hg = ctx.createLinearGradient(x1, y1, tx, ty);
        hg.addColorStop(0, '#e8dcc0'); hg.addColorStop(1, '#4a3020');
        ctx.fillStyle = hg;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(qx, qy, tx, ty); ctx.quadraticCurveTo((qx + x2) / 2, (qy + y2) / 2, x2, y2); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(60,30,20,0.6)'; ctx.lineWidth = 1; ctx.stroke();
      }
    }
  } else if (!hero) {
    // ფოტო არ არის — დახატული ალქაჯი
    const k = r / 58;
    ctx.translate(cx, cy); ctx.scale(k, k); ctx.translate(0, mana ? 50 : 62);
    drawLiza({ x: 0, y: 0, bob: 0, t: gtime, alpha: 1, flash: 0, inv: 0, dead: false, form: mana ? 'manatee' : 'demon' });
  } else {
    ctx.fillStyle = '#2f5d8a'; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  ctx.restore();
  ctx.lineWidth = Math.max(3, r * 0.06);
  ctx.strokeStyle = col;
  shape(); ctx.stroke();
  if (showName) {
    const name = hero ? HERO_NAME : BOSS_NAME;
    const by = cy + fh / 2;
    let fsz = Math.max(13, Math.min(20, r * 0.17));
    ctx.font = `bold ${fsz}px ${FONT}`;
    while (fsz > 11 && ctx.measureText(name).width > Math.max(r * 2.8, 160)) { fsz--; ctx.font = `bold ${fsz}px ${FONT}`; }
    const tw = ctx.measureText(name).width + 22;
    cx = clamp(cx, tw / 2 + 8, W - tw / 2 - 8);
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    roundRect(ctx, cx - tw / 2, by - fsz * 0.4, tw, fsz * 1.7, fsz * 0.6); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = hero ? '#bfe0ff' : mana ? '#d6f0ff' : '#ffc2b0';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(name, cx, by + fsz * 0.45);
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();
}

const WEAPONS = {
  pistol: { name: 'პისტოლეტი', cd: 0.2, n: 1, spread: 0, jit: 0.03, spd: 950, dmg: 1, len: 14, snd: 'pistol' },
  shotgun: { name: 'თოფი', cd: 0.55, n: 7, spread: 0.55, jit: 0.04, spd: 850, dmg: 1, len: 24, snd: 'shotgun' },
  rifle: { name: 'ავტომატი', cd: 0.075, n: 1, spread: 0, jit: 0.07, spd: 1050, dmg: 1, len: 26, snd: 'rifle' },
};

function nearestEnemy(x, y, maxD) {
  let best = null, bd = maxD * maxD;
  for (const z of zombies) { const d = (z.x - x) ** 2 + (z.y - y) ** 2; if (d < bd) { bd = d; best = z; } }
  if (boss && !boss.dead && boss.state === 'fight') {
    const d = (boss.x - x) ** 2 + (boss.y - 20 - y) ** 2;
    if (d < bd) best = { x: boss.x, y: boss.y - 20 };
  }
  return best;
}

function tryDash() {
  const p = player;
  if (state !== 'play' || !p || p.dead || p.dashCd > 0) return;
  let mx = p.mvx || 0, my = p.mvy || 0;
  if (!mx && !my) { mx = Math.cos(p.angle); my = Math.sin(p.angle); }
  const l = Math.hypot(mx, my) || 1;
  p.dvx = mx / l * 760; p.dvy = my / l * 760;
  p.dashT = 0.17; p.dashCd = 0.85;
  sfx('dash');
}

function updatePlayer(dt) {
  const p = player;
  if (p.dead) return;
  if (p.frozen) { p.mvx = p.mvy = 0; return; }
  let mx = 0, my = 0;
  if (keys.KeyW) my -= 1;
  if (keys.KeyS) my += 1;
  if (keys.KeyA) mx -= 1;
  if (keys.KeyD) mx += 1;
  if (!p.armed) {
    if (keys.ArrowUp) my -= 1;
    if (keys.ArrowDown) my += 1;
    if (keys.ArrowLeft) mx -= 1;
    if (keys.ArrowRight) mx += 1;
    mx = clamp(mx, -1, 1); my = clamp(my, -1, 1);
  }
  if (tc.move) {
    const dx = tc.move.x - tc.move.sx, dy = tc.move.y - tc.move.sy, l = Math.hypot(dx, dy);
    if (l > 8) { const k = Math.min(1, l / 60); mx = dx / l * k; my = dy / l * k; }
  } else if (mx || my) {
    const l = Math.hypot(mx, my); mx /= l; my /= l;
  }
  p.mvx = mx; p.mvy = my;

  // დამიზნება
  let firing = false, aim = p.angle;
  const ax = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0);
  const ay = (keys.ArrowDown ? 1 : 0) - (keys.ArrowUp ? 1 : 0);
  if (p.armed && (ax || ay)) { aim = Math.atan2(ay, ax); firing = true; }
  else if (tc.aim) {
    const dx = tc.aim.x - tc.aim.sx, dy = tc.aim.y - tc.aim.sy;
    if (Math.hypot(dx, dy) > 14) aim = Math.atan2(dy, dx);
    else { const e = nearestEnemy(p.x, p.y, 650); if (e) aim = Math.atan2(e.y - p.y, e.x - p.x); }
    firing = true;
  } else if (usingTouch) {
    if (mx || my) aim = Math.atan2(my, mx);
  } else if (p.armed) {
    aim = Math.atan2(mouse.y + view.y - p.y, mouse.x + view.x - p.x);
    firing = mouse.down;
  } else if (mx || my) aim = Math.atan2(my, mx);
  p.angle = p.armed ? aim : angLerp(p.angle, aim, Math.min(1, dt * 10));
  if (!p.armed) firing = false;

  if (p.dashT > 0) {
    p.dashT -= dt;
    p.x += p.dvx * dt; p.y += p.dvy * dt;
    addP({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.25, size: 13, kind: 'spark', col: level.dark ? '120,170,255' : '255,255,255', glow: level.dark });
  } else {
    p.x += mx * p.speed * dt; p.y += my * p.speed * dt;
  }
  if (mx || my) {
    p.walk += dt * 13;
    p.stepT -= dt;
    if (p.stepT <= 0) { p.stepT = 0.32; sfx('step'); }
  }
  collide(p, p.r);

  p.fireCd -= dt; p.dashCd -= dt; p.inv -= dt; p.flash -= dt;
  if (p.weaponTime > 0) {
    p.weaponTime -= dt;
    if (p.weaponTime <= 0) { p.weapon = 'pistol'; showMsg('ისევ პისტოლეტი', 1.5, '#ccc'); }
  }
  if (firing && p.fireCd <= 0) shoot();
}

function shoot() {
  const p = player, w = WEAPONS[p.weapon];
  p.fireCd = w.cd;
  const tx = p.x + Math.cos(p.angle) * (16 + w.len), ty = p.y + Math.sin(p.angle) * (16 + w.len);
  for (let i = 0; i < w.n; i++) {
    const a = p.angle + (w.n > 1 ? (i / (w.n - 1) - 0.5) * w.spread : 0) + rand(-w.jit, w.jit);
    const s = w.spd * rand(0.92, 1.05);
    bullets.push({ x: tx, y: ty, px: tx, py: ty, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.75, dmg: w.dmg });
  }
  p.flash = 0.06;
  cam.shake = Math.max(cam.shake, p.weapon === 'shotgun' ? 7 : 2.5);
  sfx(w.snd);
  for (let i = 0; i < 4; i++) addP({ x: tx, y: ty, vx: Math.cos(p.angle + rand(-0.6, 0.6)) * rand(100, 300), vy: Math.sin(p.angle + rand(-0.6, 0.6)) * rand(100, 300), life: rand(0.08, 0.18), size: 2, kind: 'spark', col: '255,220,140', glow: true, drag: 6 });
}

function hurtPlayer(d, src) {
  const p = player;
  if (p.dead || p.inv > 0 || p.dashT > 0) return;
  p.hp -= d; p.inv = 0.55;
  cam.shake = Math.max(cam.shake, 9);
  hurtFlash = 0.4;
  sfx('hurt');
  burst(p.x, p.y, 10, { kind: 'blood', col: '140,10,10', glow: false, smax: 160, lmax: 0.6 });
  if (src) {
    const a = Math.atan2(p.y - src.y, p.x - src.x);
    p.x += Math.cos(a) * 14; p.y += Math.sin(a) * 14;
    collide(p, p.r);
  }
  if (p.hp <= 0) {
    p.hp = 0; p.dead = true;
    state = 'dead'; deadT = 0; stats.deaths++;
    burst(p.x, p.y, 40, { kind: 'blood', col: '120,0,0', glow: false, smax: 260, lmax: 1.2, szmax: 5 });
    decals.push({ x: p.x, y: p.y, r: 26, col: 'rgba(90,0,0,0.7)' });
    tc.move = tc.aim = null;
  }
}

// ================== ზომბები ==================
const ZTYPES = {
  normal: { r: 15, hp: 3, spd: [62, 92], dmg: 12, skins: ['#8fae6b', '#9bb27a', '#7f9e62'], cols: ['#4f6b3a', '#5a4a3a', '#3a4a5a', '#5e3b3b', '#4a4a4a'] },
  runner: { r: 13, hp: 2, spd: [140, 168], dmg: 10, skins: ['#a3b37a'], cols: ['#6b2f2f', '#7a3a20'] },
  brute: { r: 25, hp: 14, spd: [48, 60], dmg: 22, skins: ['#6f8f55'], cols: ['#2f3b2a', '#3a2f2a'] },
};
function makeZombie(x, y, type) {
  const T = ZTYPES[type];
  zombies.push({
    x, y, type, r: T.r, hp: T.hp, maxHp: T.hp, speed: rand(T.spd[0], T.spd[1]) * (level.type === 'boss' ? 1.1 : 1), dmg: T.dmg,
    skin: pick(T.skins), col: pick(T.cols), angle: rand(0, TAU), walk: rand(0, 10), hit: 0, atkCd: 0,
    spawnT: 0.7, stuck: 0, detourT: 0, detourDir: 1, wa: rand(0, TAU),
  });
  for (let i = 0; i < 8; i++) addP({ x: x + rand(-12, 12), y: y + rand(-12, 12), vx: rand(-40, 40), vy: rand(-60, -10), life: rand(0.4, 0.8), size: rand(2, 4), kind: 'blood', col: '70,55,40', glow: false, drag: 2 });
}
function pickZType() {
  const k = level.type === 'escape' ? level.kills : 20;
  const r = Math.random();
  if (k > 14 && r < 0.13) return 'brute';
  if (k > 5 && r < 0.38) return 'runner';
  return 'normal';
}
function spawnZombieNear(initial) {
  const p = player;
  for (let i = 0; i < 25; i++) {
    const a = rand(0, TAU), d = initial ? rand(550, 1400) : rand(480, 820);
    const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
    if (x < 30 || y < 30 || x > level.w - 30 || y > level.h - 30) continue;
    if (blocked(x, y, 28)) continue;
    makeZombie(x, y, initial ? 'normal' : pickZType());
    return true;
  }
  return false;
}
function killZombie(z, quiet) {
  const i = zombies.indexOf(z);
  if (i < 0) return;
  zombies.splice(i, 1);
  stats.kills++;
  if (level.type === 'escape') {
    level.kills++;
    if (!level.exit.open && level.kills >= level.goal) {
      level.exit.open = true;
      sfx('gate');
      showMsg('გასასვლელი გაიხსნა! გაიქეცი აღმოსავლეთით — თემქისკენ →', 4, '#9dff9d');
      say('შაკუნკულა', 'გზა თავისუფალია! ახლა — გავიქცე!', 3);
    }
  }
  burst(z.x, z.y, quiet ? 10 : 18, { kind: 'blood', col: '70,90,20', glow: false, smax: 180, lmax: 0.7, szmax: 4 });
  if (decals.length > 220) decals.shift();
  decals.push({ x: z.x + rand(-4, 4), y: z.y + rand(-4, 4), r: z.r * rand(0.9, 1.4), col: 'rgba(60,70,15,0.55)' });
  if (!quiet) {
    sfx('zdie');
    const r = Math.random();
    const big = z.type === 'brute';
    if (r < (big ? 0.35 : 0.09)) pickups.push({ x: z.x, y: z.y, type: 'hp', t: 0, life: 16 });
    else if (r < (big ? 0.6 : 0.14)) pickups.push({ x: z.x, y: z.y, type: Math.random() < 0.5 ? 'shotgun' : 'rifle', t: 0, life: 16 });
  }
}
function updateZombies(dt) {
  const p = player;
  for (const z of zombies) {
    z.hit -= dt; z.atkCd -= dt;
    if (z.spawnT > 0) { z.spawnT -= dt; continue; }
    let tx, ty, d = 1e9;
    if (p.dead) {
      z.wa += rand(-1, 1) * dt; tx = Math.cos(z.wa) * 0.3; ty = Math.sin(z.wa) * 0.3;
    } else {
      const dx = p.x - z.x, dy = p.y - z.y;
      d = Math.hypot(dx, dy) || 1;
      tx = dx / d; ty = dy / d;
      if (d > 900 && level.type === 'escape') { tx *= 0.5; ty *= 0.5; }
    }
    if (z.detourT > 0) {
      z.detourT -= dt;
      const a = Math.atan2(ty, tx) + z.detourDir * 1.35;
      tx = Math.cos(a); ty = Math.sin(a);
    }
    let sx = 0, sy = 0;
    for (const o of zombies) {
      if (o === z) continue;
      const ddx = z.x - o.x, ddy = z.y - o.y, m = z.r + o.r;
      const d2 = ddx * ddx + ddy * ddy;
      if (d2 < m * m && d2 > 0.01) { const dd = Math.sqrt(d2); sx += ddx / dd * (m - dd) * 0.5; sy += ddy / dd * (m - dd) * 0.5; }
    }
    const ox = z.x, oy = z.y;
    z.x += tx * z.speed * dt + sx; z.y += ty * z.speed * dt + sy;
    collide(z, z.r);
    const moved = Math.hypot(z.x - ox, z.y - oy);
    z.stuck = moved < z.speed * dt * 0.35 ? z.stuck + dt : 0;
    if (z.stuck > 0.35 && z.detourT <= 0) { z.detourT = 0.9; z.detourDir = Math.random() < 0.5 ? -1 : 1; z.stuck = 0; }
    if (tx || ty) z.angle = angLerp(z.angle, Math.atan2(ty, tx), Math.min(1, dt * 6));
    z.walk += dt * z.speed * 0.11;
    if (!p.dead && d < z.r + p.r + 5 && z.atkCd <= 0) { hurtPlayer(z.dmg, z); z.atkCd = 0.8; }
    if (Math.random() < dt * 0.04 && d < 450) sfx('groan');
  }
}

// ================== ტყვიები ==================
function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.px = b.x; b.py = b.y;
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    let dead = b.life <= 0 || b.x < 0 || b.y < 0 || b.x > level.w || b.y > level.h;
    if (!dead && blocked(b.x, b.y, 0)) {
      dead = true;
      burst(b.x, b.y, 4, { col: '255,200,120', smax: 120, lmax: 0.25, szmax: 2 });
    }
    if (!dead) {
      for (const z of zombies) {
        if (z.spawnT > 0.3) continue;
        if (segDist2(b.px, b.py, b.x, b.y, z.x, z.y) < (z.r + 3) ** 2) {
          z.hp -= b.dmg; z.hit = 0.08;
          const l = Math.hypot(b.vx, b.vy);
          z.x += b.vx / l * (z.type === 'brute' ? 3 : 8); z.y += b.vy / l * (z.type === 'brute' ? 3 : 8);
          burst(z.x, z.y, 5, { kind: 'blood', col: '90,110,30', glow: false, smax: 140, lmax: 0.4 });
          sfx('hit');
          if (z.hp <= 0) killZombie(z);
          dead = true; break;
        }
      }
    }
    if (!dead && boss && !boss.dead && boss.alpha > 0.5) {
      if (segDist2(b.px, b.py, b.x, b.y, boss.x, boss.y - 20) < (boss.r + 4) ** 2) {
        dead = true;
        if (boss.state === 'fight' && boss.inv <= 0) {
          boss.hp -= b.dmg; boss.flash = 0.08;
          burst(b.x, b.y, 5, { col: '255,90,50', smax: 160, lmax: 0.35 });
          sfx('hit');
          if (boss.hp <= 0) bossDie();
        } else {
          burst(b.x, b.y, 6, { col: '120,255,170', smax: 200, lmax: 0.3 });
        }
      }
    }
    if (dead) bullets.splice(i, 1);
  }
}
function updateEBullets(dt) {
  const p = player;
  for (let i = ebullets.length - 1; i >= 0; i--) {
    const e = ebullets[i];
    e.x += e.vx * dt; e.y += e.vy * dt; e.life -= dt; e.t = (e.t || 0) + dt;
    if (Math.random() < dt * 30) addP({ x: e.x, y: e.y, vx: rand(-20, 20), vy: rand(-20, 20), life: rand(0.2, 0.4), size: e.r * 0.7, kind: 'fire', glow: true, drag: 2 });
    let dead = e.life <= 0 || e.x < 0 || e.y < 0 || e.x > level.w || e.y > level.h;
    if (!dead && blocked(e.x, e.y, 2)) { dead = true; burst(e.x, e.y, 8, { kind: 'fire', smax: 120, lmax: 0.4, szmax: 6 }); }
    if (!dead && !p.dead && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 < (e.r + p.r - 3) ** 2) {
      if (p.dashT <= 0 && p.inv <= 0) { hurtPlayer(e.dmg, e); dead = true; burst(e.x, e.y, 10, { kind: 'fire', smax: 160, lmax: 0.4, szmax: 6 }); }
    }
    if (dead) ebullets.splice(i, 1);
  }
}
function fireball(x, y, a, s, r = 10, dmg = 14) {
  ebullets.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r, life: 6, dmg });
}

function updateHazards(dt) {
  const p = player;
  for (let i = hazards.length - 1; i >= 0; i--) {
    const h = hazards[i];
    h.t += dt;
    if (h.t >= h.delay) {
      sfx('smallboom');
      cam.shake = Math.max(cam.shake, 8);
      burst(h.x, h.y, 26, { kind: 'fire', smax: 260, lmax: 0.7, szmin: 4, szmax: 10 });
      burst(h.x, h.y, 8, { kind: 'smoke', glow: false, col: '30,20,20', smax: 80, lmax: 1.2, szmin: 10, szmax: 20, grow: 20 });
      if (!p.dead && Math.hypot(p.x - h.x, p.y - h.y) < h.r + p.r * 0.5) hurtPlayer(22, h);
      decals.push({ x: h.x, y: h.y, r: h.r * 0.8, col: 'rgba(0,0,0,0.5)' });
      hazards.splice(i, 1);
    }
  }
}

function updatePickups(dt) {
  const p = player;
  for (let i = pickups.length - 1; i >= 0; i--) {
    const k = pickups[i];
    k.t += dt; k.life -= dt;
    if (k.life <= 0) { pickups.splice(i, 1); continue; }
    if (!p.dead && Math.hypot(k.x - p.x, k.y - p.y) < p.r + 20) {
      if (k.type === 'hp') {
        p.hp = Math.min(p.maxHp, p.hp + 35);
        showMsg('+35 სიცოცხლე', 1.4, '#ff8a8a');
      } else {
        p.weapon = k.type; p.weaponTime = 18;
        showMsg(`აიღე: ${WEAPONS[k.type].name}!`, 1.6, '#9ad7ff');
      }
      sfx('pickup');
      burst(k.x, k.y, 12, { col: k.type === 'hp' ? '255,90,90' : '120,200,255', smax: 160, lmax: 0.5 });
      pickups.splice(i, 1);
    }
  }
}

// ================== ბოსი: ალქაჯი ლიზა ==================
function updateBoss(dt) {
  const b = boss, p = player, L = level;
  b.t += dt;
  b.bob = Math.sin(b.t * 2.2) * 6;
  b.flash -= dt; b.inv -= dt;
  if (b.dead) {
    b.deadT += dt;
    b.alpha = 1;
    if (b.form !== 'manatee') {
      if (Math.random() < dt * 40) burst(b.x + rand(-30, 30), b.y - 20 + rand(-50, 30), 3, { col: pick(['255,90,50', '255,200,80', '255,160,60']), smax: 220, lmax: 0.8 });
      if (b.deadT > 1.6) {
        // დემონი ლამანტინად იქცევა
        b.form = 'manatee'; b.popT = 0;
        sfx('smallboom'); sfx('pickup');
        cam.shake = 12;
        burst(b.x, b.y - 20, 50, { kind: 'smoke', glow: false, col: '230,230,240', smin: 60, smax: 260, lmin: 0.8, lmax: 1.6, szmin: 10, szmax: 22, grow: 30 });
        burst(b.x, b.y - 20, 40, { col: '150,210,255', smin: 80, smax: 360, lmax: 1 });
        say(BOSS_NAME, 'ბლუპ?.. რა მომივიდა?! ლამანტინად ვიქეცი?!', 4, '#d6f0ff');
        showMsg('დემონი ლამანტინად იქცა!', 3, '#bfe6ff');
      }
    } else b.popT += dt;
    L.calm = Math.min(1, L.calm + dt * 0.3);
    if (b.deadT > 3.4 && !portal) {
      let px = b.x, py = b.y;
      let best = -1;
      for (const [dx, dy] of [[0, 170], [170, 0], [-170, 0], [0, -170], [130, 130], [-130, 130], [130, -130], [-130, -130]]) {
        const x = b.x + dx, y = b.y + dy;
        if (x < 60 || y < 60 || x > L.w - 60 || y > L.h - 60 || blocked(x, y, 40)) continue;
        const d = Math.hypot(x - player.x, y - player.y);
        if (d > best) { best = d; px = x; py = y; }
      }
      portal = { x: px, y: py, t: 0 };
      sfx('portal');
      showMsg('ნათელი კარიბჭე გაიხსნა — გზა ვაზისუბნისკენ!', 4, '#fff1a8');
    }
    return;
  }
  if (b.state === 'intro') {
    b.alpha = Math.min(1, b.alpha + dt * 0.6);
    b.introT -= dt;
    if (Math.random() < dt * 30) addP({ x: b.x + rand(-40, 40), y: b.y + rand(-60, 30), vx: 0, vy: rand(-80, -20), life: 0.8, size: 3, kind: 'spark', col: '255,80,40', glow: true, drag: 1 });
    if (b.introT <= 0) { b.state = 'fight'; b.atkT = 1; demonRoar(b); }
    return;
  }
  // ფაზები
  const ratio = b.hp / b.maxHp;
  const np = ratio > 0.66 ? 1 : ratio > 0.33 ? 2 : 3;
  if (np > b.phase) {
    b.phase = np; b.inv = 1.4; b.atk = null; b.atkT = 1.6; b.alpha = 1;
    sfx('summon'); demonRoar(b);
    cam.shake = 16;
    say(BOSS_NAME, np === 2 ? 'გეგონა, ასე ადვილად დამამარცხებდი?! ადექით, ჩემო მკვდრებო!' : 'საკმარისია! ჩემი ცეცხლი ფერფლად გაქცევს!', 3.5, '#ffb3a0');
    showMsg('თავჯირკა განრისხდა!', 2, '#ff8a6a');
    burst(b.x, b.y - 20, 60, { col: '255,80,40', smin: 150, smax: 500, lmax: 0.9, szmax: 5 });
    const a = Math.atan2(p.y - b.y, p.x - b.x);
    if (!p.dead && Math.hypot(p.x - b.x, p.y - b.y) < 260) { p.x += Math.cos(a) * 110; p.y += Math.sin(a) * 110; collide(p, p.r); }
    ebullets.length = 0;
    for (let i = 0; i < 2 + np; i++) { const aa = i / (2 + np) * TAU; const zx = b.x + Math.cos(aa) * 110, zy = b.y + Math.sin(aa) * 110; if (!blocked(zx, zy, 20)) makeZombie(zx, zy, pick(['normal', 'runner'])); }
  }
  // მოძრაობა
  // ღრიალი
  b.roarFx = Math.max(0, b.roarFx - dt);
  b.roarT -= dt;
  if (b.roarT <= 0) {
    b.roarT = rand(8, 13) - b.phase;
    demonRoar(b);
  }
  // ყვირილი ბრძოლისას
  b.tauntT -= dt;
  if (b.tauntT <= 0 && !dialog) {
    b.tauntT = rand(6, 9);
    say(BOSS_NAME, b.tauntN++ % 2 === 0 ? 'აქ თემქაა ძმა!' : 'ძმებო, თემქელებო, დამეხმარეთ!', 2.6, '#ffb3a0');
  }
  b.moveT -= dt;
  const c = L.center;
  if (b.moveT <= 0 || Math.hypot(b.tx - b.x, b.ty - b.y) < 15) {
    b.moveT = rand(2, 4);
    for (let i = 0; i < 10; i++) {
      const a = rand(0, TAU), r = rand(0, 380);
      b.tx = c.x + Math.cos(a) * r; b.ty = c.y + Math.sin(a) * r * 0.8;
      if (!blocked(b.tx, b.ty, 40)) break;
    }
  }
  const spd = 55 + b.phase * 28;
  const dx = b.tx - b.x, dy = b.ty - b.y, dl = Math.hypot(dx, dy) || 1;
  if (!b.atk || b.atk.type !== 'teleport') { b.x += dx / dl * spd * dt; b.y += dy / dl * spd * dt; }
  // შეტევები
  if (b.atk) runAttack(dt);
  else {
    b.atkT -= dt;
    if (b.atkT <= 0) startAttack();
  }
  if (!p.dead && Math.hypot(p.x - b.x, p.y - (b.y - 10)) < b.r + p.r) hurtPlayer(20, b);
  if (Math.random() < dt * 8) addP({ x: b.x + rand(-25, 25), y: b.y + 30 + b.bob, vx: rand(-20, 20), vy: rand(-40, -10), life: 0.7, size: 4, kind: 'spark', col: '255,60,20', glow: true, drag: 1 });

  // დახმარება მოთამაშეს
  L.pickT -= dt;
  if (L.pickT <= 0) {
    L.pickT = 11;
    for (let i = 0; i < 10; i++) {
      const a = rand(0, TAU), r = rand(150, 480);
      const x = c.x + Math.cos(a) * r, y = c.y + Math.sin(a) * r * 0.8;
      if (blocked(x, y, 20)) continue;
      pickups.push({ x, y, type: player.hp < 60 && Math.random() < 0.6 ? 'hp' : pick(['shotgun', 'rifle', 'hp']), t: 0, life: 14 });
      break;
    }
  }
}
function demonRoar(b) {
  sfx('roar');
  b.roarFx = 1.4;
  cam.shake = Math.max(cam.shake, 14);
  burst(b.x, b.y - 30, 30, { kind: 'fire', smin: 120, smax: 380, lmax: 0.7, szmax: 8 });
}
function startAttack() {
  const b = boss;
  const opts = b.phase === 1 ? ['spiral', 'ring', 'aimed', 'aimed']
    : b.phase === 2 ? ['spiral', 'ring', 'aimed', 'summon', 'circles', 'teleport']
    : ['spiral', 'ring', 'aimed', 'summon', 'circles', 'circles', 'teleport'];
  let t;
  do { t = pick(opts); } while (t === b.lastAtk && opts.length > 1);
  if (t === 'summon' && zombies.length > 8) t = 'circles';
  b.lastAtk = t;
  b.atk = { type: t, t: 0, n: 0, cd: 0 };
  if (t === 'summon') { sfx('summon'); say(BOSS_NAME, 'ძმებო, თემქელებო, დამეხმარეთ!', 2.4, '#ffb3a0'); b.tauntT = Math.max(b.tauntT, 4); }
  if (t === 'teleport') sfx('laugh');
}
function endAttack() {
  const b = boss;
  b.atk = null;
  b.atkT = b.phase === 1 ? 1.3 : b.phase === 2 ? 0.95 : 0.65;
}
function runAttack(dt) {
  const b = boss, a = b.atk, p = player, ph = b.phase;
  a.t += dt; a.cd -= dt;
  const ox = b.x, oy = b.y - 20;
  switch (a.type) {
    case 'spiral':
      if (a.cd <= 0) {
        a.cd = 0.1 - ph * 0.012;
        b.spin += 0.31;
        fireball(ox, oy, b.spin, 165 + ph * 18);
        if (ph >= 2) fireball(ox, oy, b.spin + Math.PI, 165 + ph * 18);
        if (ph >= 3) fireball(ox, oy, -b.spin * 0.8, 150);
        if (a.n++ % 4 === 0) sfx('fireball');
      }
      if (a.t > 2.6) endAttack();
      break;
    case 'ring': {
      const max = ph === 1 ? 2 : ph === 2 ? 3 : 4;
      if (a.cd <= 0 && a.n < max) {
        a.cd = 0.7; a.n++;
        const k = 12 + ph * 4, off = a.n * 0.21;
        for (let i = 0; i < k; i++) fireball(ox, oy, off + i / k * TAU, 150 + ph * 18);
        sfx('fireball');
        burst(ox, oy, 14, { kind: 'fire', smax: 200, lmax: 0.4 });
      }
      if (a.n >= max && a.cd <= 0) endAttack();
      break;
    }
    case 'aimed': {
      const max = 3 + ph;
      if (a.cd <= 0 && a.n < max) {
        a.cd = 0.5 - ph * 0.05; a.n++;
        const ang = Math.atan2(p.y - oy, p.x - ox);
        const cnt = ph === 1 ? 3 : 5;
        for (let j = 0; j < cnt; j++) fireball(ox, oy, ang + (j - (cnt - 1) / 2) * 0.17, 250 + ph * 25, 9, 12);
        sfx('fireball');
      }
      if (a.n >= max && a.cd <= 0) endAttack();
      break;
    }
    case 'summon':
      if (Math.random() < dt * 60) addP({ x: ox + rand(-60, 60), y: oy + rand(-60, 60), vx: 0, vy: -60, life: 0.6, size: 4, kind: 'spark', col: '120,255,150', glow: true, drag: 0 });
      if (a.n === 0 && a.t > 0.7) {
        a.n = 1;
        const cnt = 2 + ph;
        for (let i = 0; i < cnt; i++) {
          const aa = rand(0, TAU), r = rand(90, 220);
          const zx = clamp(ox + Math.cos(aa) * r, 40, level.w - 40), zy = clamp(oy + Math.sin(aa) * r, 40, level.h - 40);
          if (!blocked(zx, zy, 20)) makeZombie(zx, zy, ph === 3 && Math.random() < 0.25 ? 'brute' : pick(['normal', 'runner']));
        }
      }
      if (a.t > 1.3) endAttack();
      break;
    case 'circles': {
      const max = ph === 2 ? 4 : 6;
      if (a.cd <= 0 && a.n < max) {
        a.cd = 0.42; a.n++;
        const lead = 0.6;
        hazards.push({ x: p.x + (p.mvx || 0) * p.speed * lead * rand(0.5, 1) + rand(-40, 40), y: p.y + (p.mvy || 0) * p.speed * lead * rand(0.5, 1) + rand(-40, 40), r: 72, t: 0, delay: 1.15 });
        sfx('warn');
      }
      if (a.n >= max && a.t > max * 0.42 + 0.6) endAttack();
      break;
    }
    case 'teleport':
      if (a.t < 0.45) b.alpha = Math.max(0.05, 1 - a.t / 0.45);
      else if (a.n === 0) {
        a.n = 1;
        burst(b.x, b.y - 20, 30, { col: '255,80,40', smax: 300, lmax: 0.6 });
        for (let i = 0; i < 20; i++) {
          const aa = rand(0, TAU), r = rand(150, 420);
          const x = level.center.x + Math.cos(aa) * r, y = level.center.y + Math.sin(aa) * r * 0.8;
          if (!blocked(x, y, 40) && Math.hypot(x - p.x, y - p.y) > 300) { b.x = x; b.y = y; b.tx = x; b.ty = y; break; }
        }
        burst(b.x, b.y - 20, 30, { col: '255,80,40', smax: 300, lmax: 0.6 });
      } else {
        b.alpha = Math.min(1, b.alpha + dt * 3);
        if (a.t > 0.6 && a.n === 1) {
          a.n = 2;
          const k = 10 + ph * 3;
          for (let i = 0; i < k; i++) fireball(b.x, b.y - 20, i / k * TAU, 170);
          sfx('fireball');
        }
        if (a.t > 1) { b.alpha = 1; endAttack(); }
      }
      break;
  }
}
function bossDie() {
  const b = boss;
  b.dead = true; b.deadT = 0; b.hp = 0;
  slowmo = 1.6;
  cam.shake = 26;
  sfx('scream'); sfx('boom');
  b.alpha = 1;
  say(BOSS_NAME, 'კანალიზაცია გახსენით მტკვარზე!!!', 3, '#ffb3a0');
  burst(b.x, b.y - 20, 120, { col: '255,90,50', smin: 100, smax: 600, lmax: 1.4, szmax: 6 });
  burst(b.x, b.y - 20, 80, { kind: 'fire', smin: 100, smax: 500, lmax: 1.2, szmax: 9 });
  ebullets.length = 0; hazards.length = 0;
  for (const z of [...zombies]) killZombie(z, true);
  level.fires.forEach(f => { f.s *= 0.5; });
}

// ================== ვაზისუბანი: ცოცხალი სამყარო ==================
function makeButterfly(x, y) {
  return { x, y, a: rand(0, TAU), t: rand(0, 10), c: pick(['#ff7eb6', '#ffd23f', '#7ec8ff', '#ffffff', '#b388ff', '#ff9f43']) };
}
function updatePeace(dt) {
  const p = player, L = level;
  for (const n of npcs) {
    n.t -= dt;
    const d = Math.hypot(p.x - n.x, p.y - n.y);
    if (d < 150) {
      n.a = angLerp(n.a, Math.atan2(p.y - n.y, p.x - n.x), dt * 5);
      n.wave += dt;
    } else {
      n.wave = 0;
      if (n.t <= 0) { n.t = rand(1.5, 4); n.a += rand(-2, 2); n.moving = Math.random() < 0.6; }
      if (n.moving) {
        const ox = n.x, oy = n.y;
        n.x += Math.cos(n.a) * 40 * dt; n.y += Math.sin(n.a) * 40 * dt; n.walk += dt * 8;
        collide(n, n.r);
        if (Math.hypot(n.x - ox, n.y - oy) < 40 * dt * 0.5) n.a += Math.PI * 0.7;
      }
    }
  }
  for (const b of butterflies) {
    b.t += dt;
    b.a += rand(-3, 3) * dt;
    b.x += Math.cos(b.a) * 45 * dt; b.y += Math.sin(b.a) * 45 * dt + Math.sin(b.t * 4) * 0.4;
    if (Math.hypot(b.x - p.x, b.y - p.y) > 700) { const a = rand(0, TAU); b.x = p.x + Math.cos(a) * rand(300, 600); b.y = p.y + Math.sin(a) * rand(250, 450); }
  }
  if (Math.random() < dt * 0.15 && birds.length < 3) {
    const y = view.y + rand(40, H * 0.5);
    birds.push({ x: view.x - 80, y, vx: rand(90, 140), flock: Array.from({ length: 5 }, (_, i) => ({ dx: -i * 26 + rand(-6, 6), dy: (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 18 + rand(-4, 4) })), t: 0 });
  }
  for (let i = birds.length - 1; i >= 0; i--) {
    const b = birds[i]; b.x += b.vx * dt; b.t += dt;
    if (b.x > view.x + W + 300) birds.splice(i, 1);
  }
  // ფოთლები/მტვერი
  if (Math.random() < dt * 25) addP({ x: view.x + rand(0, W), y: view.y + rand(0, H), vx: rand(-10, 10), vy: rand(-15, -5), life: rand(2, 4), size: rand(1.2, 2.4), kind: 'spark', col: '255,250,200', glow: false, drag: 0 });
  if (Math.random() < dt * 4) addP({ x: view.x + rand(-100, W), y: view.y - 10, vx: rand(20, 50), vy: rand(30, 60), life: rand(5, 9), size: 3, kind: 'blood', col: pick(['255,170,200', '255,255,255', '255,210,230']), glow: false, drag: 0 });
  // შადრევანი
  const g = L.goal;
  if (Math.random() < dt * 40) { const a = rand(0, TAU); addP({ x: g.x, y: g.y - 10, vx: Math.cos(a) * rand(20, 60), vy: rand(-120, -60), grav: 220, life: 0.9, size: 2.5, kind: 'blood', col: '200,235,255', glow: false, drag: 0 }); }
  // ნიკა
  if (L.nika) {
    const n = L.nika;
    n.t += dt;
    n.near = !p.dead && Math.hypot(p.x - n.x, p.y - n.y) < 150;
    if (n.near && !n.wasNear) n.line = (n.line + 1) % 4;
    n.wasNear = n.near;
  }
  // ლამანტინის ლეში ყარს
  if (L.carcass) {
    const m = L.carcass;
    if (Math.random() < dt * 5) addP({ x: m.x + rand(-25, 25), y: m.y - 10, vx: rand(-8, 8), vy: rand(-30, -15), life: rand(1.5, 2.5), size: rand(6, 10), kind: 'smoke', col: '120,170,50', glow: false, drag: 0.2, grow: 10 });
    const d = Math.hypot(p.x - m.x, p.y - m.y);
    if (!m.said && !L.cut && !p.dead && d < 170) {
      m.said = true;
      say(HERO_NAME, pick(['ფუუუ... ეს ლამანტინი უკვე ყარს!', 'ვაიმე, რა სუნია! ლამანტინი ჩაძაღლებულა...']), 3);
    }
    if (d < 220 && Math.random() < dt * 2.5) sfx('buzz');
  }
  // გიორგი მიდის
  const gi = L.giorgi;
  if (gi.tx !== null) {
    const dx = gi.tx - gi.x, dy = gi.ty - gi.y, d = Math.hypot(dx, dy);
    if (d > 3) { gi.x += dx / d * 80 * dt; gi.y += dy / d * 80 * dt; gi.walk = (gi.walk || 0) + dt * 8; }
  }
  const car = L.giulia;
  if (car.blink > 0) car.blink -= dt;
  const ccx = car.x + car.w / 2, ccy = car.y + car.h / 2;
  // შაკუნკულა უახლოვდება გიორგის — იწყება ბოლო სცენა
  if (!L.cut && !p.dead && (Math.hypot(p.x - gi.x, p.y - gi.y) < 170 || Math.hypot(p.x - ccx, p.y - ccy) < 110)) {
    L.cut = { t: 0, step: 0 };
    p.frozen = true;
    car.found = true; car.blink = 1.5;
    sfx('horn');
  }
  if (!L.cut) return;
  const c = L.cut;
  c.t += dt;
  const at = (time, fn) => { if (c.step === time.i && c.t >= time.t) { c.step++; fn(); } };
  let i = 0;
  const T = t => ({ i: i++, t });
  at(T(0), () => say(HERO_NAME, 'ჩემი ჯულია!!! გიორგი, დამიბრუნე ჩემი მანქანა!', 2.8));
  at(T(2.9), () => say(GIORGI_NAME, 'ჯულია ახლა ჩემია, გლეხო. კოდი უკვე დაწერილია...', 2.8, '#c8f7c5'));
  at(T(5.8), () => { say(GIORGI_NAME, 'sudo explode --force ჯულია', 1.6, '#7dff9a'); gi.typing = 1.4; });
  at(T(7.3), () => {
    // აფეთქება
    car.destroyed = true;
    sfx('boom'); sfx('smallboom');
    cam.shake = 34; screenFlash = 1.2;
    burst(ccx, ccy, 140, { kind: 'fire', smin: 100, smax: 620, lmin: 0.5, lmax: 1.4, szmin: 5, szmax: 14 });
    burst(ccx, ccy, 50, { kind: 'smoke', glow: false, col: '40,36,34', smin: 40, smax: 240, lmin: 1.5, lmax: 3, szmin: 14, szmax: 28, grow: 26 });
    for (let k = 0; k < 40; k++) { const a = rand(0, TAU), sp = rand(150, 520); addP({ x: ccx, y: ccy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.6, 1.4), size: rand(2, 5), kind: 'blood', col: pick(['230,230,235', '60,60,60', '30,30,30']), glow: false, drag: 2.5 }); }
    L.fires.push({ x: ccx - 20, y: ccy, s: 1.3 }, { x: ccx + 20, y: ccy - 4, s: 1.1 }, { x: ccx, y: ccy + 6, s: 1.5 });
    decals.push({ x: ccx, y: ccy, r: 90, col: 'rgba(20,15,10,0.55)' });
    // შაკუნკულა იღუპება
    p.dead = true; p.hp = 0; p.frozen = true;
    burst(p.x, p.y, 40, { kind: 'blood', col: '120,0,0', glow: false, smax: 260, lmax: 1.2, szmax: 5 });
    decals.push({ x: p.x, y: p.y, r: 30, col: 'rgba(25,15,10,0.6)' });
    L.graveAt = { x: p.x, y: p.y + 6 };
  });
  at(T(9.6), () => say(GIORGI_NAME, 'ჰმ. ბაგი გასწორებულია.', 2.4, '#c8f7c5'));
  at(T(11.4), () => { gi.tx = L.graveAt.x + 34; gi.ty = L.graveAt.y; });
  at(T(13.4), () => { gi.dig = 2.6; say(GIORGI_NAME, 'ახლა დავმარხოთ... ვაზისუბანში ადგილი ბევრია.', 2.6, '#c8f7c5'); });
  if (gi.dig > 0) {
    gi.dig -= dt;
    if (Math.random() < dt * 18) addP({ x: L.graveAt.x + rand(-14, 14), y: L.graveAt.y + rand(-8, 8), vx: rand(-60, 60), vy: rand(-140, -60), grav: 300, life: 0.6, size: rand(2, 4), kind: 'blood', col: pick(['110,80,45', '90,65,35', '130,95,55']), glow: false, drag: 0 });
    if (Math.random() < dt * 3) sfx('step');
  }
  at(T(16.2), () => {
    L.grave = { x: L.graveAt.x, y: L.graveAt.y, t: 0 };
    showMsg('აქ განისვენებს შაკუნკულა — უბრალო გლეხი', 4.5, '#fff3c4');
    sfx('pickup');
  });
  at(T(18.4), () => { if (L.nika) say(NIKA_NAME, '...ძმაო, ერთი ლარი ხომ არ დარჩა მისგან?', 3, '#f2e2c0'); });
  at(T(22), () => startStory('ending', '#000'));
  if (L.grave) L.grave.t += dt;
}

// ================== განახლება ==================
function updateCamera(dt) {
  const p = player;
  let tx = p.x - W / 2, ty = p.y - H / 2;
  if (!usingTouch && p.armed && !p.dead) { tx += (mouse.x - W / 2) * 0.16; ty += (mouse.y - H / 2) * 0.16; }
  const k = Math.min(1, dt * 6);
  cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
  clampCam();
  cam.shake = Math.max(0, cam.shake - dt * 40);
}
function clampCam() {
  cam.x = level.w < W ? (level.w - W) / 2 : clamp(cam.x, 0, level.w - W);
  cam.y = level.h < H ? (level.h - H) / 2 : clamp(cam.y, 0, level.h - H);
}
const inView = (x, y, m) => x > view.x - m && x < view.x + W + m && y > view.y - m && y < view.y + H + m;

function updateGame(dt) {
  const p = player, L = level;
  updatePlayer(dt);
  updateZombies(dt);
  updateBullets(dt);
  updateEBullets(dt);
  updateHazards(dt);
  if (boss) updateBoss(dt);
  updatePickups(dt);

  if (L.type === 'escape' && !p.dead) {
    L.spawnT -= dt;
    const maxAlive = Math.min(26, 10 + Math.floor(L.kills / 3)) + (L.exit.open ? 5 : 0);
    if (L.spawnT <= 0 && zombies.length < maxAlive) {
      L.spawnT = Math.max(0.35, 1.05 - L.kills * 0.02);
      spawnZombieNear(false);
    }
    const e = L.exit;
    if (Math.hypot(p.x - e.x, p.y - e.y) < e.r + 20) {
      if (e.open) { e.used = true; startStory('temqa', '#000'); }
      else if (!e.warnT || gtime - e.warnT > 3) {
        e.warnT = gtime;
        showMsg(`გასასვლელი ჩაკეტილია! მოკალი კიდევ ${L.goal - L.kills} ზომბი`, 2.5, '#ff9a7a');
      }
    }
  }
  if (portal) {
    portal.t += dt;
    if (Math.random() < dt * 40) { const a = rand(0, TAU); addP({ x: portal.x + Math.cos(a) * 70, y: portal.y + Math.sin(a) * 70, vx: -Math.cos(a) * 60, vy: -Math.sin(a) * 60, life: 1, size: 3, kind: 'spark', col: '255,230,150', glow: true, drag: 0 }); }
    if (!p.dead && !portal.used && Math.hypot(p.x - portal.x, p.y - portal.y) < 55) {
      portal.used = true;
      sfx('portal');
      startStory('vazisubani', '#fff');
    }
  }
  if (L.type === 'peace') updatePeace(dt);

  // ცეცხლი
  for (const f of L.fires) {
    if (!inView(f.x, f.y, 120)) continue;
    f.acc = (f.acc || 0) + dt * f.s * 26;
    while (f.acc > 1) {
      f.acc--;
      addP({ x: f.x + rand(-10, 10) * f.s, y: f.y + rand(-4, 4), vx: rand(-14, 14), vy: rand(-95, -40) * (0.6 + f.s * 0.4), life: rand(0.4, 0.9), size: rand(4, 8) * f.s, kind: 'fire', glow: true, drag: 0.5 });
    }
    if (Math.random() < dt * 2.5 * f.s) addP({ x: f.x + rand(-6, 6), y: f.y - 20 * f.s, vx: rand(-10, 15), vy: rand(-50, -25), life: rand(1.5, 2.5), size: rand(6, 12) * f.s, kind: 'smoke', glow: false, drag: 0.2, grow: 14 });
  }
  // ნაკვერჩხლები
  if (L.dark && Math.random() < dt * 22) addP({ x: view.x + rand(0, W), y: view.y + H + 10, vx: rand(-25, 25), vy: rand(-80, -30), life: rand(3, 6), size: rand(1, 2.2), kind: 'fire', glow: true, drag: 0 });

  updateParticles(dt);
  updateCamera(dt);

  for (const m of msgs) m.t += dt;
  msgs = msgs.filter(m => m.t < m.dur);
  if (dialog) { dialog.t += dt; if (dialog.t > dialog.dur) dialog = null; }
  if (titleCard) { titleCard.t += dt; if (titleCard.t > 4) titleCard = null; }
  hurtFlash = Math.max(0, hurtFlash - dt);
  screenFlash = Math.max(0, screenFlash - dt * 1.2);
}

function update(dt) {
  gtime += dt;
  updateFade(dt);
  updateMusic();
  if (state === 'title') {
    if (musicMode !== 'title' && AC) setMusic('title');
    updateUiParts(dt, 'fire');
  } else if (state === 'story') {
    if (story) { story.chars += dt * 38; story.t += dt; }
    updateUiParts(dt, story ? story.def.theme : 'fire');
  } else if (state === 'end') {
    endT += dt;
    updateUiParts(dt, 'light');
  } else if (state === 'play' || state === 'dead') {
    if (state === 'dead') deadT += dt;
    if (state === 'play' && fade.dir === 1) return;
    let ts = 1;
    if (slowmo > 0) { slowmo -= dt; ts = 0.3; }
    if (state === 'play') stats.time += dt;
    updateGame(dt * ts);
  }
}

function updateUiParts(dt, theme) {
  const light = theme === 'light' || theme === 'dawn';
  const rate = light ? 18 : 40;
  if (Math.random() < dt * rate && uiParts.length < 200) {
    uiParts.push(light
      ? { x: rand(0, W), y: H + 10, vx: rand(-10, 10), vy: rand(-40, -15), life: rand(5, 9), max: 9, size: rand(1.5, 3.5), col: theme === 'dawn' ? '255,220,150' : '255,240,180' }
      : { x: rand(0, W), y: H + 10, vx: rand(-30, 30), vy: rand(-110, -40), life: rand(3, 6), max: 6, size: rand(1, 3), col: theme === 'witch' ? pick(['255,80,40', '255,120,40']) : pick(['255,140,40', '255,90,20', '255,200,90']) });
  }
  for (let i = uiParts.length - 1; i >= 0; i--) {
    const u = uiParts[i];
    u.life -= dt; u.x += u.vx * dt + Math.sin(gtime * 2 + i) * 0.3; u.y += u.vy * dt;
    if (u.life <= 0 || u.y < -20) uiParts.splice(i, 1);
  }
}
function drawUiParts() {
  ctx.globalCompositeOperation = 'lighter';
  for (const u of uiParts) {
    ctx.fillStyle = `rgba(${u.col},${Math.min(1, u.life / 2)})`;
    circle(ctx, u.x, u.y, u.size);
  }
  ctx.globalCompositeOperation = 'source-over';
}

// ================== ხატვა: სამყარო ==================
function drawBuildingShadow(o) {
  ctx.fillStyle = level.dark ? 'rgba(0,0,0,0.55)' : 'rgba(30,60,20,0.28)';
  if (o.c) { ellipse(ctx, o.x + 8, o.y + 10, o.r * 1.05, o.r * 0.9); return; }
  ctx.fillRect(o.x + 12, o.y + 14, o.w, o.h);
}
function drawObstacle(o) {
  const t = gtime;
  if (o.kind === 'building') {
    const { x, y, w, h } = o, fh = 34;
    ctx.fillStyle = o.ruin ? '#2b2422' : '#3a3936';
    ctx.fillRect(x, y, w, h - fh);
    ctx.strokeStyle = o.ruin ? '#3d302b' : '#4d4b47'; ctx.lineWidth = 3;
    ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - fh - 3);
    for (const v of o.vents) {
      ctx.fillStyle = '#2a2927'; ctx.fillRect(v.x, v.y, v.w, v.h);
      ctx.fillStyle = '#4a4844'; ctx.fillRect(v.x, v.y, v.w, 3);
    }
    for (const hl of o.holes) { ctx.fillStyle = '#0c0807'; ctx.fillRect(hl.x, hl.y, hl.w, hl.h); }
    ctx.fillStyle = o.ruin ? '#3e3530' : '#56514b';
    ctx.fillRect(x, y + h - fh, w, fh);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let px = x + 44; px < x + w; px += 44) ctx.fillRect(px, y + h - fh, 2, fh);
    for (const win of o.windows) {
      const wy = y + h - fh + 9;
      if (win.fire) ctx.fillStyle = `rgba(255,${120 + Math.sin(t * 9 + win.ph) * 40},30,1)`;
      else if (win.lit) ctx.fillStyle = `rgba(200,160,70,${0.55 + Math.sin(t * 3 + win.ph) * 0.15})`;
      else ctx.fillStyle = '#121518';
      ctx.fillRect(win.x, wy, 12, 16);
      if (win.broken && !win.fire) { ctx.strokeStyle = '#333'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(win.x, wy); ctx.lineTo(win.x + 12, wy + 16); ctx.stroke(); }
    }
  } else if (o.kind === 'car') {
    ctx.save(); ctx.translate(o.x + o.w / 2, o.y + o.h / 2);
    if (o.h > o.w) ctx.rotate(Math.PI / 2);
    const L = Math.max(o.w, o.h), S = Math.min(o.w, o.h);
    ctx.fillStyle = o.col; roundRect(ctx, -L / 2, -S / 2, L, S, 7); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; roundRect(ctx, -L / 2 + 16, -S / 2 + 4, L - 34, S - 8, 4); ctx.fill();
    ctx.fillStyle = '#0d0d0d'; ctx.fillRect(L / 2 - 20, -S / 2 + 5, 6, S - 10);
    if (o.burning) { ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(-L / 2, -S / 2, L, S); }
    ctx.restore();
  } else if (o.kind === 'barrel') {
    ctx.fillStyle = '#3b2a20'; circle(ctx, o.x, o.y, o.r);
    ctx.strokeStyle = '#6a4a30'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(o.x, o.y, o.r - 3, 0, TAU); ctx.stroke();
  } else if (o.kind === 'pillar') {
    ctx.fillStyle = '#2b2326'; circle(ctx, o.x, o.y, o.r);
    ctx.fillStyle = '#3d3236'; circle(ctx, o.x - 3, o.y - 4, o.r - 6);
    ctx.fillStyle = '#1a1214'; circle(ctx, o.x, o.y - 4, o.r - 13);
  } else if (o.kind === 'house') {
    const { x, y, w, h } = o, fh = 40;
    ctx.fillStyle = o.roof; ctx.fillRect(x, y, w, h - fh);
    ctx.strokeStyle = 'rgba(80,20,10,0.45)'; ctx.lineWidth = 1;
    for (let yy = y + 8; yy < y + h - fh; yy += 8) { ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke(); }
    const ry = y + (h - fh) / 2;
    ctx.strokeStyle = 'rgba(90,25,10,0.8)'; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + (h - fh) / 2, ry); ctx.lineTo(x, y + h - fh);
    ctx.moveTo(x + w, y); ctx.lineTo(x + w - (h - fh) / 2, ry); ctx.lineTo(x + w, y + h - fh);
    ctx.moveTo(x + (h - fh) / 2, ry); ctx.lineTo(x + w - (h - fh) / 2, ry);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x, y, w, (h - fh) / 2);
    ctx.fillStyle = o.wall; ctx.fillRect(x, y + h - fh, w, fh);
    ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(x, y + h - fh, w, 4);
    for (const win of o.windows) {
      if (Math.abs(win.x + 8 - (o.door + 9)) < 18) continue;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(win.x - 2, y + h - fh + 8, 18, 18);
      ctx.fillStyle = '#7fb8de'; ctx.fillRect(win.x, y + h - fh + 10, 14, 14);
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(win.x + 2, y + h - fh + 12, 4, 4);
      if (win.flowers) for (let k = 0; k < 4; k++) { ctx.fillStyle = ['#ff5d8f', '#ffd23f', '#ff7b39'][k % 3]; circle(ctx, win.x + 1 + k * 4, y + h - fh + 29, 2.2); }
    }
    ctx.fillStyle = '#8a5a34'; ctx.fillRect(o.door, y + h - 28, 18, 28);
    ctx.fillStyle = '#e8c070'; circle(ctx, o.door + 14, y + h - 14, 1.6);
  } else if (o.kind === 'tree') {
    const sw = Math.sin(t * 1.2 + o.x) * 1.5;
    ctx.fillStyle = o.shade > 0.5 ? '#3f8f35' : '#367f2e'; circle(ctx, o.x + sw, o.y, o.r);
    ctx.fillStyle = '#4fa340'; circle(ctx, o.x - o.r * 0.25 + sw, o.y - o.r * 0.25, o.r * 0.7);
    ctx.fillStyle = '#6cc257'; circle(ctx, o.x - o.r * 0.38 + sw, o.y - o.r * 0.4, o.r * 0.35);
    if (o.grapes || o.fruit) {
      ctx.fillStyle = o.grapes ? '#6a2c8a' : '#e84a3a';
      for (let k = 0; k < 6; k++) { const a = k * 1.1 + o.x, rr = o.r * 0.6; circle(ctx, o.x + Math.cos(a) * rr + sw, o.y + Math.sin(a) * rr, o.grapes ? 3 : 2.6); }
    }
  } else if (o.kind === 'carcass') {
    drawCarcass(o);
  } else if (o.kind === 'giulia') {
    drawGiulia(o);
  } else if (o.kind === 'fountain') {
    ctx.fillStyle = '#cfc6b2'; circle(ctx, o.x, o.y, o.r);
    ctx.fillStyle = '#e9e2d0'; circle(ctx, o.x, o.y, o.r - 6);
    ctx.fillStyle = '#5bb8e8'; circle(ctx, o.x, o.y, o.r - 14);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
    for (let k = 0; k < 3; k++) {
      const rr = ((t * 18 + k * 18) % 54) + 8;
      ctx.globalAlpha = 1 - rr / 62;
      ctx.beginPath(); ctx.arc(o.x, o.y, rr, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ddd5c2'; circle(ctx, o.x, o.y, 14);
    ctx.fillStyle = '#bfe6ff'; circle(ctx, o.x, o.y - 4, 7);
  }
}

// თეთრი ალფა რომეო ჯულია (ზემოდან, წინა მხარე მარჯვნივ)
function drawGiulia(o) {
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2, L = o.w, S = o.h;
  if (o.destroyed) {
    // დამწვარი ნამსხვრევები
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(0.12);
    ctx.fillStyle = '#1b1b1b';
    for (const wx of [-L * 0.3, L * 0.28]) for (const sd of [-1, 1]) { roundRect(ctx, wx - 10, sd * S / 2 - (sd > 0 ? 4 : 2), 20, 6, 2); ctx.fill(); }
    ctx.fillStyle = '#2e2a27'; roundRect(ctx, -L / 2, -S / 2, L, S, 10); ctx.fill();
    ctx.fillStyle = '#4a4440'; roundRect(ctx, -L / 2 + 8, -S / 2 + 5, L - 30, S - 10, 6); ctx.fill();
    ctx.fillStyle = '#121010'; ctx.fillRect(-30, -S / 2 + 7, 46, S - 14);
    ctx.fillStyle = 'rgba(230,230,235,0.35)'; ctx.fillRect(L / 2 - 22, -S / 2 + 2, 14, 8);
    ctx.restore();
    return;
  }
  ctx.save(); ctx.translate(cx, cy);
  if (!o.found) {
    const pr = 0.5 + Math.sin(gtime * 3) * 0.5;
    ctx.strokeStyle = `rgba(255,215,90,${0.35 + pr * 0.4})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, 0, L / 2 + 14 + pr * 6, S / 2 + 14 + pr * 6, 0, 0, TAU); ctx.stroke();
  }
  // ბორბლები
  ctx.fillStyle = '#1b1b1b';
  for (const wx of [-L * 0.3, L * 0.28]) for (const sd of [-1, 1]) { roundRect(ctx, wx - 10, sd * S / 2 - (sd > 0 ? 4 : 2), 20, 6, 2); ctx.fill(); }
  // ძარა
  const g = ctx.createLinearGradient(0, -S / 2, 0, S / 2);
  g.addColorStop(0, '#dfe3e8'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(1, '#d5dae0');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-L / 2 + 10, -S / 2);
  ctx.lineTo(L / 2 - 16, -S / 2 + 1);
  ctx.quadraticCurveTo(L / 2, -S / 2 + 4, L / 2, -6);
  ctx.lineTo(L / 2, 6);
  ctx.quadraticCurveTo(L / 2, S / 2 - 4, L / 2 - 16, S / 2 - 1);
  ctx.lineTo(-L / 2 + 10, S / 2);
  ctx.quadraticCurveTo(-L / 2, S / 2, -L / 2, S / 2 - 10);
  ctx.lineTo(-L / 2, -S / 2 + 10);
  ctx.quadraticCurveTo(-L / 2, -S / 2, -L / 2 + 10, -S / 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,130,140,0.6)'; ctx.lineWidth = 1; ctx.stroke();
  // კაპოტის ხაზები
  ctx.strokeStyle = 'rgba(140,150,160,0.5)';
  ctx.beginPath(); ctx.moveTo(18, -S / 2 + 8); ctx.quadraticCurveTo(38, -8, L / 2 - 4, -5); ctx.moveTo(18, S / 2 - 8); ctx.quadraticCurveTo(38, 8, L / 2 - 4, 5); ctx.stroke();
  // მინები და სახურავი
  ctx.fillStyle = '#1d2733';
  ctx.beginPath(); ctx.moveTo(4, -S / 2 + 6); ctx.lineTo(16, -S / 2 + 9); ctx.lineTo(16, S / 2 - 9); ctx.lineTo(4, S / 2 - 6); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-34, -S / 2 + 8); ctx.lineTo(-26, -S / 2 + 6); ctx.lineTo(-26, S / 2 - 6); ctx.lineTo(-34, S / 2 - 8); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#eef1f4'; roundRect(ctx, -26, -S / 2 + 6, 30, S - 12, 6); ctx.fill();
  ctx.fillStyle = 'rgba(29,39,51,0.85)';
  ctx.fillRect(-24, -S / 2 + 3, 26, 3); ctx.fillRect(-24, S / 2 - 6, 26, 3);
  // სარკეები
  ctx.fillStyle = '#ffffff';
  ellipse(ctx, 8, -S / 2 - 3, 4, 3); ellipse(ctx, 8, S / 2 + 3, 4, 3);
  // ფარები
  const on = o.blink > 0 && Math.floor(o.blink * 8) % 2 === 0;
  ctx.fillStyle = on ? '#fffbd0' : '#bcd6ea';
  for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(L / 2 - 14, sd * (S / 2 - 3)); ctx.lineTo(L / 2 - 3, sd * (S / 2 - 9)); ctx.lineTo(L / 2 - 5, sd * (S / 2 - 12)); ctx.lineTo(L / 2 - 15, sd * (S / 2 - 6)); ctx.closePath(); ctx.fill(); }
  ctx.fillStyle = on ? '#ff2a2a' : '#b3141a';
  for (const sd of [-1, 1]) { roundRect(ctx, -L / 2 + 1, sd > 0 ? S / 2 - 12 : -S / 2 + 4, 5, 8, 2); ctx.fill(); }
  // ალფა რომეოს „სკუდეტო“ ფარი
  ctx.fillStyle = '#c9ccd0';
  ctx.beginPath(); ctx.moveTo(L / 2 + 1, -5); ctx.lineTo(L / 2 + 1, 5); ctx.lineTo(L / 2 - 7, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#c8102e'; circle(ctx, L / 2 - 1.5, 0, 1.6);
  // ფარების შუქი
  if (on) {
    ctx.globalCompositeOperation = 'lighter';
    glow(GLOW.gold, L / 2 + 10, -S / 2 + 8, 30, 0.8);
    glow(GLOW.gold, L / 2 + 10, S / 2 - 8, 30, 0.8);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
}

// გიორგი — ჰუდი, სათვალე, ლეპტოპი
function drawGiorgi(g) {
  const p = player;
  if (g.typing > 0) g.typing -= 1 / 60;
  const look = g.tx !== null && Math.hypot(g.tx - g.x, g.ty - g.y) > 3 ? Math.atan2(g.ty - g.y, g.tx - g.x) : g.dig > 0 ? Math.PI : Math.atan2(p.y - g.y, p.x - g.x);
  g.a = angLerp(g.a, look, 0.08);
  ctx.save(); ctx.translate(g.x, g.y);
  ctx.fillStyle = 'rgba(30,60,20,0.3)'; ellipse(ctx, 2, 6, 15, 10);
  ctx.rotate(g.a);
  ctx.fillStyle = '#2a2a33'; ellipse(ctx, 0, -6, 6, 4); ellipse(ctx, 0, 6, 6, 4);
  // ლეპტოპი წინ
  ctx.fillStyle = '#9aa3ad'; roundRect(ctx, 9, -11, 12, 22, 2); ctx.fill();
  ctx.fillStyle = g.typing > 0 ? `rgba(255,${80 + Math.sin(gtime * 30) * 60},60,1)` : `rgba(120,255,160,${0.6 + Math.sin(gtime * 6) * 0.2})`; ctx.fillRect(11, -9, 3, 18);
  if (g.dig > 0) { ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 3; const sw = Math.sin(gtime * 10) * 6; ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(26, sw); ctx.stroke(); ctx.fillStyle = '#8a8f96'; ellipse(ctx, 28, sw, 5, 4); }
  ctx.fillStyle = '#e8b98e'; circle(ctx, 10, -9, 3); circle(ctx, 10, 9, 3);
  // ჰუდი
  ctx.fillStyle = '#3b3f4a'; ellipse(ctx, 0, 0, 10, 14);
  ctx.fillStyle = '#2c2f38'; ctx.beginPath(); ctx.arc(-4, 0, 9, Math.PI * 0.5, Math.PI * 1.5); ctx.fill();
  // თავი, თმა, სათვალე
  ctx.fillStyle = '#e8b98e'; circle(ctx, 1, 0, 7.5);
  ctx.fillStyle = '#2b1a10'; ctx.beginPath(); ctx.arc(1, 0, 7.8, Math.PI * 0.55, Math.PI * 1.45); ctx.fill();
  ctx.strokeStyle = '#111'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(6, -5); ctx.lineTo(6, 5); ctx.stroke();
  ctx.fillStyle = 'rgba(20,20,20,0.85)'; ctx.fillRect(5, -5, 3, 3.5); ctx.fillRect(5, 1.5, 3, 3.5);
  ctx.restore();
}

// მკვდარი ლამანტინი: ზურგზე წევს, X თვალები, ბუზები და სუნის ტალღები
function drawCarcass(o) {
  ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(-0.15);
  // კუდი
  ctx.fillStyle = '#6d7a68'; ellipse(ctx, -40, 4, 13, 9);
  // სხეული
  const g = ctx.createRadialGradient(-4, -4, 4, 0, 0, 40);
  g.addColorStop(0, '#9aa592'); g.addColorStop(1, '#5f6c5a');
  ctx.fillStyle = g; ellipse(ctx, 0, 0, 36, 22);
  // მუცელი (ზემოთ არის)
  ctx.fillStyle = '#b4bca8'; ellipse(ctx, -2, -2, 24, 13);
  // ლპობის ლაქები
  ctx.fillStyle = 'rgba(70,85,45,0.7)';
  circle(ctx, -14, 6, 5); circle(ctx, 10, 9, 4); circle(ctx, -4, -12, 3.5); circle(ctx, 16, -8, 3);
  // ზემოთ აწეული ფარფლები
  ctx.fillStyle = '#5f6c5a';
  ctx.save(); ctx.translate(-6, -18); ctx.rotate(-0.4); ellipse(ctx, 0, -6, 5, 10); ctx.restore();
  ctx.save(); ctx.translate(8, -18); ctx.rotate(0.3); ellipse(ctx, 0, -6, 5, 10); ctx.restore();
  // თავი
  ctx.fillStyle = '#7d8a77'; circle(ctx, 34, 2, 14);
  ctx.fillStyle = '#a7b09c'; ellipse(ctx, 42, 5, 9, 7);
  // X თვალები
  ctx.strokeStyle = '#1e241c'; ctx.lineWidth = 1.8;
  for (const ey of [-5, 5]) { ctx.beginPath(); ctx.moveTo(29, ey - 3); ctx.lineTo(35, ey + 3); ctx.moveTo(35, ey - 3); ctx.lineTo(29, ey + 3); ctx.stroke(); }
  // გადმოგდებული ენა
  ctx.fillStyle = '#e88aa0'; ellipse(ctx, 50, 9, 5, 3);
  ctx.restore();
}

function drawStink(o) {
  // მწვანე სუნის ტალღები
  ctx.save();
  ctx.lineWidth = 3; ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const ph = (gtime * 0.6 + i * 0.25) % 1;
    const bx = o.x - 24 + i * 16, by = o.y - 14 - ph * 60;
    ctx.strokeStyle = `rgba(130,190,50,${0.75 * (1 - ph)})`;
    ctx.beginPath();
    for (let k = 0; k <= 10; k++) {
      const yy = by - k * 3, xx = bx + Math.sin(k * 0.9 + gtime * 4 + i) * 5;
      if (k === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
    }
    ctx.stroke();
  }
  // ბუზები
  for (let i = 0; i < 7; i++) {
    const a = gtime * (2.2 + i * 0.37) + i * 1.7;
    const fx = o.x + Math.cos(a) * (26 + (i % 3) * 10) + Math.sin(gtime * 13 + i) * 3;
    const fy = o.y - 6 + Math.sin(a * 1.3) * (18 + (i % 2) * 8) + Math.cos(gtime * 11 + i) * 3;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    const w = Math.abs(Math.sin(gtime * 40 + i)) * 2.5;
    ellipse(ctx, fx - 1.5, fy - 1.5, 1.6, w + 0.3); ellipse(ctx, fx + 1.5, fy - 1.5, 1.6, w + 0.3);
    ctx.fillStyle = '#111'; circle(ctx, fx, fy, 1.6);
  }
  ctx.restore();
}

function drawGrave(g) {
  const k = Math.min(1, g.t * 2);
  ctx.save(); ctx.translate(g.x, g.y);
  ctx.globalAlpha = k;
  ctx.fillStyle = '#5a3d22'; ellipse(ctx, 0, 6, 26, 14);
  ctx.fillStyle = '#7a5532'; ellipse(ctx, -2, 3, 22, 10);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ellipse(ctx, 0, -2, 12, 3);
  // ხის ჯვარი
  ctx.fillStyle = '#6b4a2a'; ctx.fillRect(-3, -40, 6, 40); ctx.fillRect(-13, -31, 26, 6);
  ctx.fillStyle = '#8a6438'; ctx.fillRect(-2, -40, 2, 40);
  // ყვავილები
  for (const [fx, fc] of [[-14, '#ff5d8f'], [12, '#ffd23f'], [0, '#ffffff']]) { ctx.fillStyle = '#3f8f35'; ctx.fillRect(fx - 0.5, 4, 1, 7); ctx.fillStyle = fc; circle(ctx, fx, 4, 3); }
  ctx.restore();
}

// ნიკა — სახლის კართან ზის და მათხოვრობს
function drawNika(n) {
  ctx.save(); ctx.translate(n.x, n.y);
  ctx.fillStyle = 'rgba(30,60,20,0.3)'; ellipse(ctx, 2, 6, 18, 9);
  // ფეხები წინ
  ctx.fillStyle = '#4a4036'; ellipse(ctx, -5, 10, 4, 8); ellipse(ctx, 5, 10, 4, 8);
  // ჭიქა ხურდით
  ctx.fillStyle = '#9aa0a6'; circle(ctx, 0, 22, 6);
  ctx.fillStyle = '#5a5f66'; circle(ctx, 0, 22, 4.2);
  ctx.fillStyle = `rgba(255,215,90,${0.7 + Math.sin(gtime * 5) * 0.3})`; circle(ctx, -1.5, 21, 1.4); circle(ctx, 1.6, 23, 1.2);
  // მკლავი გამოწვდილი
  const sw = Math.sin(gtime * 2.5) * 2;
  ctx.strokeStyle = '#6b5a45'; ctx.lineWidth = 4.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(8, -2); ctx.lineTo(12, 12 + sw); ctx.stroke();
  ctx.fillStyle = '#d9a777'; circle(ctx, 12, 13 + sw, 3.2);
  // დაკერებული ტანსაცმელი
  ctx.fillStyle = '#6b5a45'; ellipse(ctx, 0, 0, 13, 10);
  ctx.fillStyle = '#8a7656'; ctx.fillRect(-8, -4, 6, 5);
  ctx.fillStyle = '#4f4234'; ctx.fillRect(3, 1, 5, 4);
  // თავი + ქუდი
  ctx.fillStyle = '#d9a777'; circle(ctx, 0, -8, 7);
  ctx.fillStyle = '#3a3a52'; ctx.beginPath(); ctx.arc(0, -9, 7.4, Math.PI, TAU); ctx.fill();
  ctx.fillStyle = '#2a2a3a'; ctx.fillRect(-7.5, -10, 15, 2.5);
  ctx.fillStyle = '#5a4a3a'; ctx.beginPath(); ctx.arc(0, -5, 5, 0.1 * Math.PI, 0.9 * Math.PI); ctx.fill();
  ctx.restore();
  if (n.near) {
    const lines = ['ძმაო, ერთი ლარი ხომ არ გაქვს?', 'ხურდა ხომ არ გაქვს, ძმა?', 'ღმერთმა გიშველოს... ერთი ლარი...', 'ორი დღეა არაფერი მიჭამია...'];
    const text = lines[n.line % lines.length];
    ctx.font = `bold 14px ${FONT}`; ctx.textAlign = 'center';
    const tw = ctx.measureText(text).width + 18;
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; roundRect(ctx, n.x - tw / 2, n.y - 78, tw, 28, 10); ctx.fill();
    ctx.beginPath(); ctx.moveTo(n.x - 6, n.y - 51); ctx.lineTo(n.x + 6, n.y - 51); ctx.lineTo(n.x, n.y - 42); ctx.fill();
    ctx.fillStyle = '#3a2a10'; ctx.textBaseline = 'middle'; ctx.fillText(text, n.x, n.y - 64);
    ctx.textBaseline = 'alphabetic';
  }
}

function drawPlayer(p) {
  if (p.dead) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ellipse(ctx, 2, 6, 16, 11);
  if (p.inv > 0 && Math.floor(p.inv * 20) % 2) ctx.globalAlpha = 0.5;
  ctx.rotate(p.angle);
  const s = Math.sin(p.walk) * 6 * (p.mvx || p.mvy ? 1 : 0);
  ctx.fillStyle = '#1e2430'; ellipse(ctx, s, -6, 7, 4); ellipse(ctx, -s, 6, 7, 4);
  const w = WEAPONS[p.weapon];
  if (p.armed) {
    ctx.fillStyle = '#d9a777';
    circle(ctx, 13, 5, 3.5); circle(ctx, 10, -6, 3.5);
    ctx.fillStyle = '#1b1b1b'; ctx.fillRect(10, -2.5, w.len + 6, 5);
    if (p.weapon === 'shotgun') { ctx.fillStyle = '#5a3a1e'; ctx.fillRect(6, -3, 12, 6); }
    if (p.weapon === 'rifle') { ctx.fillStyle = '#2d2d2d'; ctx.fillRect(16, 2, 5, 7); }
  } else {
    const wv = Math.sin(gtime * 6) * 3;
    ctx.fillStyle = '#d9a777'; circle(ctx, 4 + wv * 0.3, -14, 3.5); circle(ctx, 4 - wv * 0.3, 14, 3.5);
  }
  ctx.fillStyle = '#2f5d8a'; ellipse(ctx, 0, 0, 10, 14);
  ctx.fillStyle = '#244a70'; ctx.fillRect(-2, -14, 4, 28);
  ctx.fillStyle = '#e0b48a'; circle(ctx, 1, 0, 8);
  ctx.fillStyle = '#2b1a10';
  ctx.beginPath(); ctx.arc(1, 0, 8.3, Math.PI * 0.55, Math.PI * 1.45); ctx.fill();
  ctx.beginPath(); ctx.arc(-1, 0, 7, 0, TAU); ctx.fill();
  ctx.fillStyle = '#e0b48a'; circle(ctx, 3, 0, 5.5);
  ctx.restore();
}

function drawZombie(z) {
  ctx.save();
  ctx.translate(z.x, z.y);
  let sc = 1;
  if (z.spawnT > 0) { sc = Math.max(0.05, 1 - z.spawnT / 0.7); ctx.globalAlpha = sc; }
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ellipse(ctx, 2, 6, z.r * 1.05, z.r * 0.75);
  ctx.rotate(z.angle);
  const k = sc * z.r / 15;
  ctx.scale(k, k);
  const sw = Math.sin(z.walk) * 5;
  ctx.fillStyle = '#2a2620'; ellipse(ctx, sw, -6, 6, 4); ellipse(ctx, -sw, 6, 6, 4);
  ctx.strokeStyle = z.hit > 0 ? '#fff' : z.skin; ctx.lineWidth = 4.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(2, -9); ctx.lineTo(18 + sw * 0.4, -8); ctx.moveTo(2, 9); ctx.lineTo(18 - sw * 0.4, 8); ctx.stroke();
  ctx.fillStyle = z.hit > 0 ? '#fff' : z.col; ellipse(ctx, 0, 0, 9, 13);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; circle(ctx, -3, 5, 3); circle(ctx, 2, -7, 2);
  ctx.fillStyle = z.hit > 0 ? '#fff' : z.skin; circle(ctx, 2, 0, 7.5);
  ctx.fillStyle = 'rgba(30,30,20,0.7)'; ctx.beginPath(); ctx.arc(1, 0, 7.6, Math.PI * 0.6, Math.PI * 1.3); ctx.fill();
  if (z.type === 'brute') { ctx.fillStyle = 'rgba(120,20,20,0.6)'; circle(ctx, -2, 3, 3); }
  ctx.restore();
  if (z.type === 'brute' && z.hp < z.maxHp) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(z.x - 20, z.y - z.r - 14, 40, 5);
    ctx.fillStyle = '#9acd32'; ctx.fillRect(z.x - 20, z.y - z.r - 14, 40 * z.hp / z.maxHp, 5);
  }
}
function drawZombieEyes(z) {
  if (z.spawnT > 0.2) return;
  const a = z.angle, s = z.r / 15;
  const hx = z.x + Math.cos(a) * 7 * s, hy = z.y + Math.sin(a) * 7 * s;
  const px = -Math.sin(a) * 3 * s, py = Math.cos(a) * 3 * s;
  ctx.fillStyle = 'rgba(255,40,20,0.95)';
  circle(ctx, hx + px, hy + py, 1.5 * s); circle(ctx, hx - px, hy - py, 1.5 * s);
  glow(GLOW.red, hx, hy, 10 * s, 0.35);
}

function drawLiza(b) {
  if (b.alpha <= 0.01) return;
  const s = 1.3;
  const manatee = b.form === 'manatee';
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.globalAlpha = b.alpha * 0.5;
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ellipse(ctx, 0, 34, 30, 10);
  ctx.globalAlpha = b.alpha;
  ctx.translate(0, b.bob - 12);
  if (b.dead && !manatee) {
    ctx.rotate(b.deadT * b.deadT * 2.5);
    const k = Math.max(0.2, 1 - Math.max(0, b.deadT - 1) * 1.3);
    ctx.scale(k, k);
  }
  if (manatee && b.popT !== undefined) {
    const k = Math.min(1, 0.2 + b.popT * 3);
    const sq = 1 + Math.sin(b.popT * 18) * 0.15 * Math.max(0, 1 - b.popT);
    ctx.scale(k * sq, k / sq);
  }
  ctx.scale(s, s);
  if (manatee) drawManateeBody(b); else drawDemonBody(b);
  if (b.flash > 0) { ctx.globalAlpha = b.alpha * 0.6; ctx.fillStyle = '#fff'; ellipse(ctx, 0, -10, 30, 44); }
  if (b.inv > 0 && !b.dead) { ctx.globalAlpha = 0.3 + Math.sin(gtime * 20) * 0.15; ctx.strokeStyle = '#7dffb0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, -18, 34, 58, 0, 0, TAU); ctx.stroke(); }
  ctx.restore();
}

function drawManateeBody(b) {
  // ლამანტინი-ალქაჯი
  const wv = Math.sin(b.t * 3);
  const skin = '#8a959c', skinD = '#5f6a71', skinL = '#aeb7bc';
  // კუდი (ნიჩბისებური)
  ctx.save(); ctx.translate(wv * 3, 36); ctx.rotate(wv * 0.18);
  ctx.fillStyle = skinD; ellipse(ctx, 0, 4, 22, 9);
  ctx.fillStyle = skin; ellipse(ctx, 0, 2, 19, 7);
  ctx.restore();
  // სხეული
  const g = ctx.createRadialGradient(-8, -12, 4, 0, 4, 40);
  g.addColorStop(0, skinL); g.addColorStop(0.6, skin); g.addColorStop(1, skinD);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, -42);
  ctx.bezierCurveTo(22, -42, 31, -14, 29, 8);
  ctx.bezierCurveTo(27, 28, 12, 38, 0, 38);
  ctx.bezierCurveTo(-12, 38, -27, 28, -29, 8);
  ctx.bezierCurveTo(-31, -14, -22, -42, 0, -42);
  ctx.fill();
  // მუცელი
  ctx.fillStyle = 'rgba(200,205,195,0.55)'; ellipse(ctx, 0, 12, 17, 21);
  // ნაოჭები
  ctx.strokeStyle = 'rgba(60,70,75,0.45)'; ctx.lineWidth = 1.2;
  for (const yy of [-2, 6, 14]) { ctx.beginPath(); ctx.arc(0, yy - 30, 26, Math.PI * 0.35, Math.PI * 0.65); ctx.stroke(); }
  // იისფერი მოსასხამი მხრებზე
  ctx.fillStyle = '#4a1466';
  ctx.beginPath(); ctx.moveTo(-27, -6); ctx.quadraticCurveTo(0, 6, 27, -6); ctx.lineTo(25, -12); ctx.quadraticCurveTo(0, -1, -25, -12); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#2bd96b'; circle(ctx, 0, 0, 3);
  // ფარფლები
  ctx.fillStyle = skinD;
  ctx.save(); ctx.translate(-26, -2); ctx.rotate(-0.5 + wv * 0.45);
  ellipse(ctx, -8, 6, 7, 13); ctx.restore();
  ctx.save(); ctx.translate(24, -6); ctx.rotate(-0.9);
  ellipse(ctx, 4, 0, 6, 11); ctx.restore();
  // დრუნჩი
  ctx.fillStyle = skinL; ellipse(ctx, 0, -20, 14, 10);
  ctx.fillStyle = 'rgba(70,80,85,0.7)';
  for (const [dx, dy] of [[-8, -21], [-5, -17], [-9, -16], [8, -21], [5, -17], [9, -16], [-3, -21], [3, -21]]) circle(ctx, dx, dy, 0.9);
  ctx.strokeStyle = 'rgba(40,45,50,0.6)'; ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (const sd of [-1, 1]) for (const k of [0, 1, 2]) { ctx.moveTo(sd * 11, -19 + k * 2); ctx.lineTo(sd * (19 + k), -21 + k * 3.5); }
  ctx.stroke();
  // ნესტოები
  ctx.fillStyle = '#3a4246'; ellipse(ctx, -3.5, -26, 1.8, 1.2); ellipse(ctx, 3.5, -26, 1.8, 1.2);
  // ბოროტი ღიმილი
  ctx.strokeStyle = '#3a4246'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.arc(0, -16, 6, 0.3, Math.PI - 0.3); ctx.stroke();
  // თვალები
  ctx.fillStyle = '#1a1f22'; circle(ctx, -9, -30, 2.4); circle(ctx, 9, -30, 2.4);
  ctx.fillStyle = '#39ff7a'; circle(ctx, -9, -30, 1.3); circle(ctx, 9, -30, 1.3);
  ctx.strokeStyle = '#2a3034'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-13, -35); ctx.lineTo(-5, -32.5); ctx.moveTo(13, -35); ctx.lineTo(5, -32.5); ctx.stroke();
  // ქუდი (გვერდზე გადახრილი)
  ctx.save(); ctx.translate(0, -40); ctx.rotate(0.35); ctx.translate(0, 40);
  ctx.fillStyle = '#120a14'; ellipse(ctx, 0, -40, 25, 6);
  ctx.beginPath(); ctx.moveTo(-13, -41); ctx.lineTo(13, -41);
  ctx.quadraticCurveTo(6, -59, 16 + Math.sin(b.t * 2) * 3, -79);
  ctx.quadraticCurveTo(-2, -61, -13, -41); ctx.fill();
  ctx.fillStyle = '#7a2aa8'; ctx.fillRect(-12, -47, 24, 4);
  ctx.fillStyle = '#e0c040'; ctx.fillRect(-3, -48, 6, 6);
  ctx.restore();
}

function drawDemonBody(b) {
  const t = b.t, fl = Math.sin(t * 6);
  // ღამურას ფრთები
  for (const sd of [-1, 1]) {
    ctx.save(); ctx.translate(sd * 8, -14); ctx.scale(sd * (0.85 + fl * 0.15), 1);
    ctx.fillStyle = '#3d0606';
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(20, -30, 46, -26);
    ctx.lineTo(40, -14); ctx.quadraticCurveTo(36, -4, 44, 4);
    ctx.quadraticCurveTo(32, 2, 28, 12); ctx.quadraticCurveTo(20, 6, 12, 16);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#7a1010'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(46, -26); ctx.moveTo(4, 0); ctx.lineTo(44, 4); ctx.moveTo(4, 2); ctx.lineTo(28, 12); ctx.stroke();
    ctx.restore();
  }
  // კუდი ისრისებური წვერით
  const tw = Math.sin(t * 3) * 8;
  ctx.strokeStyle = '#8a0d0d'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-6, 28); ctx.quadraticCurveTo(-30, 40 + tw, -34, 18 + tw); ctx.stroke();
  ctx.fillStyle = '#8a0d0d';
  ctx.beginPath(); ctx.moveTo(-34, 9 + tw); ctx.lineTo(-41, 22 + tw); ctx.lineTo(-28, 21 + tw); ctx.closePath(); ctx.fill();
  // შავი თმა
  ctx.fillStyle = '#140808';
  ctx.beginPath(); ctx.moveTo(-12, -30);
  ctx.quadraticCurveTo(-26, 0, -18 + Math.sin(t * 3) * 3, 14);
  ctx.lineTo(18 + Math.sin(t * 3 + 1) * 3, 14);
  ctx.quadraticCurveTo(26, 0, 12, -30); ctx.closePath(); ctx.fill();
  // სხეული
  const g = ctx.createLinearGradient(0, -20, 0, 36);
  g.addColorStop(0, '#b3141a'); g.addColorStop(1, '#2a0203');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(-10, -18); ctx.lineTo(10, -18); ctx.lineTo(26, 30);
  for (let i = 1; i <= 6; i++) ctx.lineTo(26 - i * 52 / 6, 30 + (i % 2 ? 8 + Math.sin(t * 6 + i) * 3 : 0));
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ff9a1a'; ctx.fillRect(-11, 2, 22, 3);
  // ხელები კლანჭებით
  const hy = 4 + Math.sin(t * 4) * 3;
  ctx.strokeStyle = '#7a0a0a'; ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-9, -12); ctx.lineTo(-22, hy); ctx.moveTo(9, -12); ctx.lineTo(22, -4); ctx.stroke();
  ctx.strokeStyle = '#f0e0c0'; ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (const k of [-1, 0, 1]) { ctx.moveTo(-22 + k * 2, hy + 2); ctx.lineTo(-24 + k * 3, hy + 7); }
  ctx.stroke();
  // სამკაპი
  ctx.strokeStyle = '#2a1a14'; ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.moveTo(24, 30); ctx.lineTo(24, -38); ctx.stroke();
  ctx.strokeStyle = '#4a4a4a'; ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(15, -38); ctx.lineTo(33, -38);
  ctx.moveTo(15, -38); ctx.lineTo(15, -52);
  ctx.moveTo(24, -38); ctx.lineTo(24, -58);
  ctx.moveTo(33, -38); ctx.lineTo(33, -52);
  ctx.stroke();
  ctx.fillStyle = '#ffb030'; circle(ctx, 24, -45, 3.5);
  ctx.fillStyle = '#c0201a'; circle(ctx, -22, hy, 3.5); circle(ctx, 23, -4, 3.5);
  // თავი
  ctx.fillStyle = '#c62a1e'; circle(ctx, 0, -28, 10.5);
  ctx.fillStyle = '#140808'; ctx.beginPath(); ctx.arc(0, -30, 11, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
  // რქები
  for (const sd of [-1, 1]) {
    ctx.fillStyle = '#e8dcc0';
    ctx.beginPath(); ctx.moveTo(sd * 4, -36);
    ctx.quadraticCurveTo(sd * 17, -40, sd * 15, -56);
    ctx.quadraticCurveTo(sd * 11, -45, sd * 9, -33);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3a2a20'; circle(ctx, sd * 15, -54, 1.6);
  }
  // თვალები
  ctx.fillStyle = '#ffe23a';
  for (const sd of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(sd * 1.5, -30); ctx.lineTo(sd * 7.5, -32.5); ctx.lineTo(sd * 6.5, -28); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = '#ff3b1a'; circle(ctx, -5, -29.7, 0.9); circle(ctx, 5, -29.7, 0.9);
  // პირი ეშვებით
  ctx.fillStyle = '#2a0000';
  ctx.beginPath(); ctx.arc(0, -23.5, 5, 0.15 * Math.PI, 0.85 * Math.PI); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff';
  for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sd * 3.6, -22.5); ctx.lineTo(sd * 2, -22.5); ctx.lineTo(sd * 2.8, -19.5); ctx.closePath(); ctx.fill(); }
}

function drawNpc(n) {
  ctx.save(); ctx.translate(n.x, n.y);
  ctx.fillStyle = 'rgba(30,60,20,0.3)'; ellipse(ctx, 2, 6, 15, 10);
  ctx.rotate(n.a);
  const s = n.moving ? Math.sin(n.walk) * 5 : 0;
  ctx.fillStyle = '#3a3a4a'; ellipse(ctx, s, -6, 6, 4); ellipse(ctx, -s, 6, 6, 4);
  const wv = n.wave > 0 ? Math.sin(gtime * 12) * 5 : 0;
  ctx.fillStyle = '#e8b98e'; circle(ctx, 4, -13 - (n.wave > 0 ? 3 : 0) + wv, 3.2); circle(ctx, 4, 13, 3.2);
  ctx.fillStyle = n.col; ellipse(ctx, 0, 0, 9, 13);
  ctx.fillStyle = '#e8b98e'; circle(ctx, 1, 0, 7.5);
  ctx.fillStyle = n.hair; ctx.beginPath(); ctx.arc(0, 0, 7.8, Math.PI * 0.55, Math.PI * 1.45); ctx.fill();
  ctx.restore();
  if (n.wave > 0) {
    ctx.font = `bold 14px ${FONT}`; ctx.textAlign = 'center';
    const tw = ctx.measureText(n.text).width + 18;
    const a = Math.min(1, n.wave * 3);
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; roundRect(ctx, n.x - tw / 2, n.y - 58, tw, 28, 10); ctx.fill();
    ctx.beginPath(); ctx.moveTo(n.x - 6, n.y - 31); ctx.lineTo(n.x + 6, n.y - 31); ctx.lineTo(n.x, n.y - 22); ctx.fill();
    ctx.fillStyle = '#3a2a10'; ctx.textBaseline = 'middle'; ctx.fillText(n.text, n.x, n.y - 44);
    ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic';
  }
}

function drawPickup(k) {
  const bob = Math.sin(k.t * 4) * 3;
  const blink = k.life < 4 && Math.floor(k.life * 6) % 2;
  if (blink) return;
  ctx.save(); ctx.translate(k.x, k.y + bob);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ellipse(ctx, 0, 14 - bob, 12, 4);
  if (k.type === 'hp') {
    ctx.fillStyle = '#f5f5f5'; roundRect(ctx, -12, -12, 24, 24, 5); ctx.fill();
    ctx.fillStyle = '#e02424'; ctx.fillRect(-3.5, -8, 7, 16); ctx.fillRect(-8, -3.5, 16, 7);
  } else {
    ctx.fillStyle = k.type === 'shotgun' ? '#7a4a20' : '#2d4a6a'; roundRect(ctx, -14, -11, 28, 22, 5); ctx.fill();
    ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = `bold 13px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(k.type === 'shotgun' ? 'თ' : 'ა', 0, 1);
  }
  ctx.restore();
  ctx.textBaseline = 'alphabetic';
}

function drawExit() {
  const e = level.exit;
  ctx.save(); ctx.translate(e.x, e.y);
  if (e.open) {
    const pulse = 0.6 + Math.sin(gtime * 5) * 0.2;
    ctx.strokeStyle = `rgba(120,255,140,${pulse})`; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(0, 0, e.r, 0, TAU); ctx.stroke();
    ctx.fillStyle = `rgba(120,255,140,${pulse * 0.25})`; circle(ctx, 0, 0, e.r);
    ctx.fillStyle = '#c8ffd0'; ctx.font = `bold 18px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillText('გასასვლელი', 0, -e.r - 12);
  } else {
    ctx.strokeStyle = '#b02a1a'; ctx.lineWidth = 8;
    for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(-10, k * 22 - 10); ctx.lineTo(10, k * 22 + 10); ctx.stroke(); }
    ctx.fillStyle = '#5a5a5a'; ctx.fillRect(-4, -e.r, 8, e.r * 2);
    ctx.fillStyle = '#ff9a7a'; ctx.font = `bold 15px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillText('ჩაკეტილია', 0, -e.r - 12);
  }
  ctx.restore();
}

function drawPortal() {
  const p = portal, k = Math.min(1, p.t / 1.2);
  ctx.save(); ctx.translate(p.x, p.y);
  for (let i = 0; i < 4; i++) {
    ctx.rotate(gtime * (i % 2 ? -1.5 : 1.2));
    ctx.strokeStyle = `rgba(255,${220 + i * 8},${140 + i * 30},${0.8 * k})`;
    ctx.lineWidth = 4 - i * 0.6;
    ctx.beginPath(); ctx.arc(0, 0, (60 - i * 12) * k, 0, TAU * 0.8); ctx.stroke();
  }
  ctx.fillStyle = `rgba(255,255,240,${0.85 * k})`; circle(ctx, 0, 0, 22 * k);
  ctx.restore();
}

function drawNameTag(x, y, name, color, alpha) {
  ctx.globalAlpha = alpha;
  ctx.font = `bold 13px ${FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(name).width + 14;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  roundRect(ctx, x - w / 2, y - 10, w, 20, 8); ctx.fill();
  ctx.fillStyle = color; ctx.fillText(name, x, y + 1);
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = 1;
}

function drawDecals() {
  for (const d of decals) {
    if (!inView(d.x, d.y, 40)) continue;
    ctx.fillStyle = d.col; ellipse(ctx, d.x, d.y, d.r, d.r * 0.8);
  }
}

function drawHazards() {
  for (const h of hazards) {
    const k = h.t / h.delay;
    ctx.strokeStyle = `rgba(255,${80 - k * 60},30,${0.4 + k * 0.5})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, TAU); ctx.stroke();
    ctx.fillStyle = `rgba(255,60,20,${0.12 + k * 0.25})`;
    circle(ctx, h.x, h.y, h.r * k);
  }
}

function drawButterfly(b) {
  const f = Math.abs(Math.sin(b.t * 14));
  ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a);
  ctx.fillStyle = b.c;
  ellipse(ctx, 0, -5 * f - 1, 5, 4 * f + 0.5);
  ellipse(ctx, 0, 5 * f + 1, 5, 4 * f + 0.5);
  ctx.fillStyle = '#333'; ctx.fillRect(-4, -0.8, 8, 1.6);
  ctx.restore();
}

function collectLights() {
  const L = level, p = player, lights = [];
  if (!p.dead) {
    lights.push({ x: p.x, y: p.y, r: 470, a: 0.95, cone: 0.5, ang: p.angle });
    lights.push({ x: p.x, y: p.y, r: 165, a: 0.9 });
    if (p.flash > 0) lights.push({ x: p.x + Math.cos(p.angle) * 30, y: p.y + Math.sin(p.angle) * 30, r: 230, a: 0.9 });
  } else lights.push({ x: p.x, y: p.y, r: 120, a: 0.7 });
  for (const f of L.fires) {
    const fl = 0.88 + Math.sin(gtime * 13 + f.x) * 0.07 + Math.random() * 0.05;
    lights.push({ x: f.x, y: f.y, r: 150 * f.s * fl, a: 0.85 });
  }
  for (const c of L.crackLights) lights.push({ x: c.x, y: c.y, r: 75, a: 0.4 + Math.sin(gtime * 2 + c.ph) * 0.12 + L.calm * 0.3 });
  for (const e of ebullets) lights.push({ x: e.x, y: e.y, r: 75, a: 0.8 });
  for (const b of bullets) lights.push({ x: b.x, y: b.y, r: 34, a: 0.45 });
  for (const k of pickups) lights.push({ x: k.x, y: k.y, r: 60, a: 0.7 });
  for (const h of hazards) lights.push({ x: h.x, y: h.y, r: h.r * 1.4, a: 0.35 + (h.t / h.delay) * 0.4 });
  if (L.exit) lights.push({ x: L.exit.x, y: L.exit.y, r: L.exit.open ? 190 : 110, a: 0.85 });
  if (boss && boss.alpha > 0.05) lights.push({ x: boss.x, y: boss.y - 20, r: 210, a: 0.85 * boss.alpha });
  if (portal) lights.push({ x: portal.x, y: portal.y, r: 380 * Math.min(1, portal.t), a: 1 });
  return lights;
}

function drawDarkness(lights) {
  const lw = lightCv.width, lh = lightCv.height;
  lctx.setTransform(1, 0, 0, 1, 0, 0);
  lctx.globalCompositeOperation = 'source-over';
  lctx.clearRect(0, 0, lw, lh);
  lctx.fillStyle = level.ambient();
  lctx.fillRect(0, 0, lw, lh);
  lctx.globalCompositeOperation = 'destination-out';
  lctx.setTransform(LS, 0, 0, LS, -view.x * LS, -view.y * LS);
  for (const L of lights) {
    if (L.x + L.r < view.x || L.x - L.r > view.x + W || L.y + L.r < view.y || L.y - L.r > view.y + H) continue;
    const g = lctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r);
    g.addColorStop(0, `rgba(0,0,0,${L.a})`);
    g.addColorStop(L.cone ? 0.55 : 0.4, `rgba(0,0,0,${L.a * 0.6})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    lctx.fillStyle = g;
    lctx.beginPath();
    if (L.cone) { lctx.moveTo(L.x, L.y); lctx.arc(L.x, L.y, L.r, L.ang - L.cone, L.ang + L.cone); lctx.closePath(); }
    else lctx.arc(L.x, L.y, L.r, 0, TAU);
    lctx.fill();
  }
  lctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(lightCv, 0, 0, W, H);
}

function drawGlowPass() {
  const L = level, p = player;
  ctx.globalCompositeOperation = 'lighter';
  for (const f of L.fires) if (inView(f.x, f.y, 150)) glow(GLOW.fire, f.x, f.y, 110 * f.s, 0.22 + Math.sin(gtime * 11 + f.y) * 0.04);
  if (L.cracks.length) {
    ctx.strokeStyle = `rgba(255,110,30,${0.18 + Math.sin(gtime * 2) * 0.08})`;
    ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const pts of L.cracks) {
      ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.stroke();
    }
  }
  drawParticles(true);
  ctx.lineCap = 'round';
  for (const b of bullets) {
    ctx.strokeStyle = 'rgba(255,230,150,0.9)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(b.x - b.vx * 0.018, b.y - b.vy * 0.018); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  for (const e of ebullets) {
    glow(GLOW.fire, e.x, e.y, e.r * 3.2, 0.8);
    ctx.fillStyle = '#fff2b0'; circle(ctx, e.x, e.y, e.r * 0.55);
  }
  if (!p.dead && p.flash > 0) {
    const tx = p.x + Math.cos(p.angle) * (20 + WEAPONS[p.weapon].len), ty = p.y + Math.sin(p.angle) * (20 + WEAPONS[p.weapon].len);
    glow(GLOW.fire, tx, ty, 40, 0.9);
    glow(GLOW.white, tx, ty, 14, 1);
  }
  for (const k of pickups) glow(k.type === 'hp' ? GLOW.red : GLOW.blue, k.x, k.y, 36, 0.45 + Math.sin(k.t * 5) * 0.15);
  if (L.exit && L.exit.open) glow(GLOW.green, L.exit.x, L.exit.y, 120, 0.4 + Math.sin(gtime * 5) * 0.1);
  if (boss && boss.alpha > 0.05) {
    const b = boss;
    if (b.form === 'manatee') glow(GLOW.blue, b.x, b.y - 20, 100, 0.3);
    else {
      glow(GLOW.red, b.x, b.y - 20, 130, (0.4 + Math.sin(gtime * 3) * 0.1) * b.alpha);
      if (!b.dead) {
        const ox = b.x + 24 * 1.3, oy = b.y + b.bob - 12 - 45 * 1.3;
        glow(GLOW.fire, ox, oy, 30, 0.9 * b.alpha);
      }
    }
  }
  if (portal) {
    const k = Math.min(1, portal.t);
    glow(GLOW.gold, portal.x, portal.y, 200 * k, 0.6);
    glow(GLOW.white, portal.x, portal.y, 70 * k, 0.9);
  }
  ctx.globalCompositeOperation = 'source-over';
  for (const z of zombies) if (inView(z.x, z.y, 30)) drawZombieEyes(z);
}

function drawWorld() {
  const L = level, p = player;
  const sh = cam.shake;
  view.x = Math.round(cam.x + (sh ? rand(-sh, sh) : 0));
  view.y = Math.round(cam.y + (sh ? rand(-sh, sh) : 0));
  ctx.fillStyle = L.bg; ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(-view.x, -view.y);
  const sx = Math.max(0, view.x), sy = Math.max(0, view.y);
  const sw = Math.min(L.w - sx, W + 2), shh = Math.min(L.h - sy, H + 2);
  if (sw > 0 && shh > 0) ctx.drawImage(L.ground, sx, sy, sw, shh, sx, sy, sw, shh);
  drawDecals();
  drawHazards();
  if (L.exit) drawExit();
  if (L.type === 'peace') {
    const g = L.goal, pulse = 0.25 + Math.sin(gtime * 2) * 0.1;
    ctx.fillStyle = `rgba(255,230,120,${pulse})`;
    ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, TAU); ctx.fill();
  }
  for (const o of L.obstacles) {
    const ox = o.c ? o.x - o.r : o.x, oy = o.c ? o.y - o.r : o.y, ow = o.c ? o.r * 2 : o.w, oh = o.c ? o.r * 2 : o.h;
    if (ox > view.x + W + 20 || oy > view.y + H + 20 || ox + ow < view.x - 20 || oy + oh < view.y - 20) continue;
    drawBuildingShadow(o);
  }
  for (const o of L.obstacles) {
    const ox = o.c ? o.x - o.r : o.x, oy = o.c ? o.y - o.r : o.y, ow = o.c ? o.r * 2 : o.w, oh = o.c ? o.r * 2 : o.h;
    if (ox > view.x + W || oy > view.y + H || ox + ow < view.x || oy + oh < view.y) continue;
    drawObstacle(o);
  }
  for (const k of pickups) if (inView(k.x, k.y, 30)) drawPickup(k);
  drawParticles(false);
  for (const z of zombies) if (inView(z.x, z.y, 40)) drawZombie(z);
  for (const n of npcs) if (inView(n.x, n.y, 80)) drawNpc(n);
  if (L.carcass) drawStink(L.carcass);
  if (L.grave) drawGrave(L.grave);
  if (L.nika) drawNika(L.nika);
  if (L.giorgi) drawGiorgi(L.giorgi);
  drawPlayer(p);
  if (boss) drawLiza(boss);
  for (const e of ebullets) { ctx.fillStyle = '#ff7a1a'; circle(ctx, e.x, e.y, e.r); }
  if (portal) drawPortal();
  if (L.type === 'peace') {
    for (const b of butterflies) if (inView(b.x, b.y, 20)) drawButterfly(b);
    ctx.strokeStyle = 'rgba(40,40,50,0.7)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (const b of birds) for (const f of b.flock) {
      const x = b.x + f.dx, y = b.y + f.dy, w = Math.sin(b.t * 10 + f.dx) * 4;
      ctx.beginPath(); ctx.moveTo(x - 7, y - 3 - w); ctx.lineTo(x, y); ctx.lineTo(x + 7, y - 3 - w); ctx.stroke();
    }
  }
  ctx.restore();

  if (L.dark) {
    drawDarkness(collectLights());
    ctx.save(); ctx.translate(-view.x, -view.y);
    drawGlowPass();
    ctx.restore();
    // წითელი ვინეტი
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, L.key === 'temqa' ? `rgba(70,0,40,${0.55 - L.calm * 0.3})` : 'rgba(60,8,0,0.55)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    if (L.key === 'temqa' && L.calm > 0) {
      ctx.fillStyle = `rgba(255,230,170,${L.calm * 0.08})`; ctx.fillRect(0, 0, W, H);
    }
  } else {
    // მზის შუქი
    const sg = ctx.createRadialGradient(W * 0.1, -H * 0.1, 0, W * 0.1, -H * 0.1, Math.max(W, H) * 1.1);
    sg.addColorStop(0, 'rgba(255,245,200,0.45)');
    sg.addColorStop(0.5, 'rgba(255,240,190,0.12)');
    sg.addColorStop(1, 'rgba(255,240,190,0)');
    ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(W * 0.1, -H * 0.1);
    for (let i = 0; i < 6; i++) {
      const a = 0.35 + i * 0.2 + Math.sin(gtime * 0.3 + i) * 0.04;
      ctx.fillStyle = `rgba(255,250,220,${0.035 + (i % 2) * 0.02})`;
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a - 0.04) * 3000, Math.sin(a - 0.04) * 3000);
      ctx.lineTo(Math.cos(a + 0.04) * 3000, Math.sin(a + 0.04) * 3000);
      ctx.fill();
    }
    ctx.restore();
    ctx.save(); ctx.translate(-view.x, -view.y);
    ctx.globalCompositeOperation = 'lighter';
    drawParticles(true);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(255,255,240,0)'); vg.addColorStop(1, 'rgba(255,250,220,0.35)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }
  // სახელები — ყოველთვის ჩანს, სიბნელის ზემოთ
  ctx.save(); ctx.translate(-view.x, -view.y);
  if (!p.dead) drawNameTag(p.x, p.y - 30, HERO_NAME, '#8ac4ff', 1);
  if (level.giorgi) drawNameTag(level.giorgi.x, level.giorgi.y + 32, GIORGI_NAME, '#c8f7c5', 1);
  if (level.carcass) drawNameTag(level.carcass.x, level.carcass.y + 40, 'ჩაძაღლებული ლამანტინი', '#c8e08a', 1);
  if (level.nika) drawNameTag(level.nika.x, level.nika.y - 26, NIKA_NAME, '#f2e2c0', 1);
  if (level.grave) drawNameTag(level.grave.x, level.grave.y - 54, 'აქ განისვენებს შაკუნკულა', '#ffffff', Math.min(1, level.grave.t * 2));
  if (level.giulia && !level.giulia.destroyed) { const c = level.giulia; drawNameTag(c.x + c.w / 2, c.y - 22, 'ალფა რომეო ჯულია', '#ffffff', 1); }
  if (boss && boss.roarFx > 0 && !boss.dead) {
    const k = boss.roarFx / 1.4, rx = boss.x, ry = boss.y - 40;
    for (let i = 0; i < 3; i++) {
      const rr = (1 - k) * 260 + i * 40;
      ctx.strokeStyle = `rgba(255,${60 + i * 30},30,${k * (0.7 - i * 0.18)})`;
      ctx.lineWidth = 6 - i * 1.5;
      ctx.beginPath(); ctx.arc(rx, ry, rr, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = Math.min(1, k * 2);
    ctx.font = `900 ${Math.round(26 + (1 - k) * 10)}px ${FONT}`; ctx.textAlign = 'center';
    const jx = rand(-3, 3), jy = rand(-3, 3);
    ctx.lineWidth = 5; ctx.strokeStyle = '#2a0000'; ctx.strokeText('ღრრრააააა!!!', rx + jx, ry - 110 + jy);
    ctx.fillStyle = '#ff5a2a'; ctx.fillText('ღრრრააააა!!!', rx + jx, ry - 110 + jy);
    ctx.globalAlpha = 1;
  }
  if (boss && boss.alpha > 0.05) drawNameTag(boss.x, boss.y + boss.bob - (boss.form === 'manatee' ? 118 : 128), BOSS_NAME, boss.form === 'manatee' ? '#bfe6ff' : '#ff8a6a', boss.alpha);
  ctx.restore();
  if (hurtFlash > 0) {
    ctx.fillStyle = `rgba(200,0,0,${hurtFlash * 0.5})`; ctx.fillRect(0, 0, W, H);
  }
  if (!p.dead && p.hp < 30 && L.dark) {
    const a = (0.15 + Math.sin(gtime * 6) * 0.1);
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
    vg.addColorStop(0, 'rgba(150,0,0,0)'); vg.addColorStop(1, `rgba(150,0,0,${a})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }
}

// ================== HUD ==================
function txt(s, x, y, size, color, align = 'left', weight = 'bold', shadow = true) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  if (shadow) { ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillText(s, x + 1.5, y + 1.5); }
  ctx.fillStyle = color; ctx.fillText(s, x, y);
}

function drawArrowTo(tx, ty, color, label) {
  const sx = tx - view.x, sy = ty - view.y;
  const m = 46;
  if (sx > m && sx < W - m && sy > m && sy < H - m) return;
  const cx = W / 2, cy = H / 2, a = Math.atan2(sy - cy, sx - cx);
  const t = Math.min(Math.abs((W / 2 - m) / (Math.cos(a) || 1e-6)), Math.abs((H / 2 - m) / (Math.sin(a) || 1e-6)));
  const x = cx + Math.cos(a) * t, y = cy + Math.sin(a) * t;
  const pulse = 1 + Math.sin(gtime * 6) * 0.12;
  ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(pulse, pulse);
  ctx.fillStyle = color; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-10, -12); ctx.lineTo(-4, 0); ctx.lineTo(-10, 12); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  if (label) txt(label, x - Math.cos(a) * 34, y - Math.sin(a) * 34 + 5, 13, color, 'center');
}

function drawHUD() {
  const p = player, L = level;
  const light = !L.dark;
  ctx.fillStyle = light ? 'rgba(60,40,10,0.35)' : 'rgba(0,0,0,0.5)';
  roundRect(ctx, 12, 12, 262, p.armed ? 92 : 60, 12); ctx.fill();
  txt('შაკუნკულა', 26, 36, 16, '#fff');
  const hpw = 228, hk = p.hp / p.maxHp;
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; roundRect(ctx, 26, 44, hpw, 14, 7); ctx.fill();
  const hg = ctx.createLinearGradient(26, 0, 26 + hpw, 0);
  hg.addColorStop(0, '#b3121b'); hg.addColorStop(1, '#ff5a4a');
  ctx.fillStyle = hg; roundRect(ctx, 26, 44, Math.max(0.01, hpw * hk), 14, 7); ctx.fill();
  txt(`${Math.ceil(p.hp)} / ${p.maxHp}`, 26 + hpw / 2, 55.5, 11, '#fff', 'center');
  if (p.armed) {
    const w = WEAPONS[p.weapon];
    txt(`იარაღი: ${w.name}${p.weaponTime > 0 ? `  (${Math.ceil(p.weaponTime)}წმ)` : ''}`, 26, 78, 13, p.weaponTime > 0 ? '#9ad7ff' : '#ddd', 'left', '700');
    const dk = clamp(1 - p.dashCd / 0.85, 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(26, 88, 100, 5);
    ctx.fillStyle = dk >= 1 ? '#7ec8ff' : '#4a6a8a'; ctx.fillRect(26, 88, 100 * dk, 5);
    txt('ნახტომი', 134, 94, 10, '#aac', 'left', '700', false);
  }
  // მიზანი
  let obj = '', oc = '#ffd27a';
  if (L.type === 'escape') { obj = L.exit.open ? 'გაიქეცი გასასვლელისკენ →' : `ზომბები: ${L.kills} / ${L.goal}`; oc = L.exit.open ? '#9dff9d' : '#ffd27a'; }
  else if (L.type === 'boss') obj = portal ? 'შედი ნათელ კარიბჭეში' : 'დაამარცხე ალქაჯი თავჯირკა';
  else obj = L.cut ? '...' : 'იპოვე გიორგი და შენი ალფა რომეო ჯულია';
  ctx.font = `bold 16px ${FONT}`;
  const ow = ctx.measureText(obj).width + 28;
  const ox = usingTouch ? W - ow - 66 : W - ow - 12;
  ctx.fillStyle = light ? 'rgba(60,40,10,0.35)' : 'rgba(0,0,0,0.5)'; roundRect(ctx, ox, 12, ow, 34, 10); ctx.fill();
  txt(obj, ox + 14, 35, 16, oc);
  txt(`მოკლული: ${stats.kills}   ·   ${fmtTime(stats.time)}`, W - 14, 66, 12, light ? '#5a4a20' : '#aaa', 'right', '700', !light);

  // ისრები
  if (L.type === 'escape') drawArrowTo(L.exit.x, L.exit.y, L.exit.open ? '#7dff8a' : '#ff8a6a', L.exit.open ? 'გასასვლელი' : '');
  if (boss && !boss.dead && boss.alpha > 0.3) drawArrowTo(boss.x, boss.y, '#ff7a5a', 'თავჯირკა');
  if (portal) drawArrowTo(portal.x, portal.y, '#ffe27a', 'კარიბჭე');
  if (L.type === 'peace') {
    if (!L.cut) drawArrowTo(L.giulia.x + L.giulia.w / 2, L.giulia.y + L.giulia.h / 2, '#ffffff', 'ჯულია');
  }

  // ბოსის ზოლი
  if (boss && !boss.dead && boss.state === 'fight') {
    const bw = Math.min(560, W - 80), bx = (W - bw) / 2, by = H - 52;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; roundRect(ctx, bx - 8, by - 28, bw + 16, 50, 10); ctx.fill();
    txt(BOSS_NAME, W / 2, by - 8, 15, '#ffb0a0', 'center');
    ctx.fillStyle = '#300a06'; roundRect(ctx, bx, by, bw, 14, 7); ctx.fill();
    const bg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    bg.addColorStop(0, '#8a0a0a'); bg.addColorStop(1, '#ff4a2a');
    ctx.fillStyle = bg; roundRect(ctx, bx, by, Math.max(0.01, bw * boss.hp / boss.maxHp), 14, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(bx + bw * 0.33, by, 2, 14); ctx.fillRect(bx + bw * 0.66, by, 2, 14);
  }

  // სათაური დონის დასაწყისში
  if (titleCard) {
    const t = titleCard.t, a = t < 0.6 ? t / 0.6 : t > 3.2 ? Math.max(0, (4 - t) / 0.8) : 1;
    ctx.globalAlpha = a;
    const sz = Math.min(72, W / 9);
    txt(titleCard.name, W / 2, H * 0.3, sz, light ? '#fff6d0' : '#ffb347', 'center', '900');
    txt(titleCard.sub, W / 2, H * 0.3 + sz * 0.6, Math.max(14, sz * 0.3), light ? '#fff' : '#ddd', 'center', '700');
    ctx.globalAlpha = 1;
  }

  // შეტყობინებები
  msgs.forEach((m, i) => {
    const a = Math.min(1, m.t * 4, (m.dur - m.t) * 2);
    ctx.globalAlpha = Math.max(0, a);
    ctx.font = `bold 18px ${FONT}`;
    const lines = wrapText(m.text, W - 60);
    lines.forEach((ln, j) => txt(ln, W / 2, (titleCard ? H * 0.3 + Math.min(72, W / 9) * 0.6 + 50 : H * 0.17) + i * 30 + j * 24, 18, m.color, 'center'));
  });
  ctx.globalAlpha = 1;

  // დიალოგი
  if (dialog) {
    const d = dialog, a = Math.min(1, d.t * 4, (d.dur - d.t) * 3);
    ctx.globalAlpha = Math.max(0, a);
    ctx.font = `bold 17px ${FONT}`;
    const bw = Math.min(640, W - 30);
    const pk = d.who === HERO_NAME ? 'hero' : d.who === BOSS_NAME ? (boss && boss.form === 'manatee' ? 'manatee' : 'boss') : null;
    const pr = 32, tx0 = pk ? 20 + pr * 2 + 14 : 20;
    const lines = wrapText(d.text, bw - tx0 - 20);
    const bh = Math.max(46 + lines.length * 24, pk ? pr * 2 + 20 : 0);
    const bx = (W - bw) / 2, by = H - bh - (boss && !boss.dead && boss.state === 'fight' ? 92 : 26) - (usingTouch ? 120 : 0);
    ctx.fillStyle = pk === 'manatee' ? 'rgba(8,30,45,0.88)' : d.who === BOSS_NAME ? 'rgba(40,6,4,0.88)' : 'rgba(10,15,25,0.85)';
    roundRect(ctx, bx, by, bw, bh, 12); ctx.fill();
    ctx.strokeStyle = pk === 'manatee' ? '#8fc3e0' : d.who === BOSS_NAME ? '#d0402a' : '#5a8ac0'; ctx.lineWidth = 2; ctx.stroke();
    if (pk) drawPortrait(pk, bx + 20 + pr, by + bh / 2, pr, Math.max(0, a), false);
    ctx.globalAlpha = Math.max(0, a);
    txt(d.who, bx + tx0, by + 26, 15, pk === 'manatee' ? '#bfe6ff' : d.who === BOSS_NAME ? '#ff8a6a' : '#8ac4ff');
    lines.forEach((ln, j) => txt(ln, bx + tx0, by + 52 + j * 24, 17, d.color, 'left', '700'));
    ctx.globalAlpha = 1;
  }

  // სენსორული მართვა
  if (usingTouch && state === 'play') {
    ctx.globalAlpha = 0.5;
    for (const [s, col] of [[tc.move, '#fff'], [tc.aim, '#ffb07a']]) {
      if (!s) continue;
      ctx.strokeStyle = col; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(s.sx, s.sy, 60, 0, TAU); ctx.stroke();
      const dx = s.x - s.sx, dy = s.y - s.sy, l = Math.hypot(dx, dy), k = l > 60 ? 60 / l : 1;
      ctx.fillStyle = col; circle(ctx, s.sx + dx * k, s.sy + dy * k, 24);
    }
    const d = dashBtn();
    ctx.fillStyle = p.dashCd > 0 ? '#555' : '#7ec8ff'; circle(ctx, d.x, d.y, d.r);
    ctx.globalAlpha = 1;
    txt('ნახტ.', d.x, d.y + 5, 13, '#fff', 'center');
    const pb = pauseBtn();
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; circle(ctx, pb.x, pb.y, pb.r);
    ctx.fillStyle = '#fff'; ctx.fillRect(pb.x - 7, pb.y - 8, 5, 16); ctx.fillRect(pb.x + 2, pb.y - 8, 5, 16);
    if (!tc.move && !tc.aim && L.type !== 'peace') {
      txt('მარცხენა მხარე — სიარული', W * 0.25, H - 30, 13, 'rgba(255,255,255,0.6)', 'center', '700');
      txt('მარჯვენა მხარე — სროლა', W * 0.75, H - 30, 13, 'rgba(255,255,255,0.6)', 'center', '700');
    }
  }
}

// ================== ეკრანები ==================
function drawFireTitle(text, x, y, size) {
  ctx.font = `900 ${size}px ${FONT}`;
  ctx.textAlign = 'center';
  const g = ctx.createLinearGradient(0, y - size, 0, y + size * 0.2);
  g.addColorStop(0, '#fff3b0'); g.addColorStop(0.45, '#ff9a1a'); g.addColorStop(1, '#b3150a');
  ctx.shadowColor = 'rgba(255,90,0,0.9)';
  ctx.shadowBlur = 25 + Math.sin(gtime * 9) * 6 + Math.random() * 4;
  ctx.fillStyle = g; ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(60,0,0,0.6)'; ctx.strokeText(text, x, y);
}

function drawCity(baseY, seed, col, winCol) {
  const rng = mulberry32(seed);
  let x = -20;
  while (x < W + 20) {
    const w = 60 + rng() * 110, h = 80 + rng() * 200;
    ctx.fillStyle = col; ctx.fillRect(x, baseY - h, w - 6, h + 300);
    for (let wy = baseY - h + 14; wy < baseY - 10; wy += 22) {
      for (let wx = x + 10; wx < x + w - 20; wx += 18) {
        const r = rng();
        if (r < 0.18) {
          const fl = r < 0.04 ? 0.6 + Math.sin(gtime * 12 + wx) * 0.4 : 0.5 + Math.sin(gtime * 2 + wx * wy) * 0.2;
          ctx.fillStyle = r < 0.04 ? `rgba(255,120,30,${fl})` : `rgba(${winCol},${fl})`;
          ctx.fillRect(wx, wy, 8, 11);
        }
      }
    }
    x += w;
  }
}

function drawTitle() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#050000'); g.addColorStop(0.6, '#1d0402'); g.addColorStop(1, '#3a0a02');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const hg = ctx.createRadialGradient(W / 2, H * 1.05, 0, W / 2, H * 1.05, W * 0.8);
  hg.addColorStop(0, `rgba(255,110,20,${0.55 + Math.sin(gtime * 3) * 0.05})`); hg.addColorStop(1, 'rgba(255,60,0,0)');
  ctx.fillStyle = hg; ctx.fillRect(0, 0, W, H);
  // მთვარე
  ctx.fillStyle = 'rgba(255,120,80,0.8)'; circle(ctx, W * 0.82, H * 0.16, Math.min(W, H) * 0.06);
  glow(GLOW.red, W * 0.82, H * 0.16, Math.min(W, H) * 0.2, 0.5);
  drawCity(H * 0.78, 11, '#120404', '200,140,60');
  drawCity(H * 0.9, 22, '#060101', '220,160,70');
  // ზომბების სილუეტები
  ctx.fillStyle = '#000';
  for (let i = 0; i < 6; i++) {
    const x = ((gtime * (18 + i * 4) + i * 260) % (W + 200)) - 100, y = H * 0.93 + (i % 2) * 14;
    const bob = Math.sin(gtime * 4 + i) * 2;
    ctx.save(); ctx.translate(x, y + bob);
    ctx.fillRect(-7, -38, 14, 30); circle(ctx, 1, -46, 8);
    ctx.fillRect(4, -34, 20, 5); ctx.fillRect(4, -26, 18, 5);
    ctx.fillRect(-6, -10, 5, 12 + Math.sin(gtime * 5 + i) * 3); ctx.fillRect(2, -10, 5, 12 - Math.sin(gtime * 5 + i) * 3);
    ctx.fillStyle = 'rgba(255,40,20,0.9)'; ctx.fillRect(4, -48, 2, 2); ctx.fillRect(8, -48, 2, 2);
    ctx.fillStyle = '#000';
    ctx.restore();
  }
  drawUiParts();
  const title = 'გაქცევა მუხიანიდან';
  let sz = Math.min(96, W / 8);
  ctx.font = `900 ${sz}px ${FONT}`;
  const twoLines = ctx.measureText(title).width > W * 0.92;
  let subY;
  if (twoLines) {
    sz = Math.min(96, W / 6);
    drawFireTitle('გაქცევა', W / 2, H * 0.3, sz);
    drawFireTitle('მუხიანიდან', W / 2, H * 0.3 + sz * 1.05, sz);
    subY = H * 0.3 + sz * 1.65;
  } else {
    drawFireTitle(title, W / 2, H * 0.36, sz);
    subY = H * 0.36 + sz * 0.65;
  }
  txt('შაკუნკულას ისტორია', W / 2, subY, Math.max(16, sz * 0.32), '#ffcf9a', 'center', '700');
  if (Math.floor(gtime * 1.8) % 2 === 0) txt(usingTouch ? 'შეეხე ეკრანს დასაწყებად' : 'დააჭირე ENTER-ს ან დააკლიკე დასაწყებად', W / 2, H * 0.62, Math.min(22, W / 26), '#fff', 'center', '700');
  txt('მუხიანი  →  თემქა  →  ვაზისუბანი', W / 2, H * 0.68, 14, 'rgba(255,200,160,0.7)', 'center', '700', false);
  txt('WASD — სიარული · მაუსი — სროლა · Shift — ნახტომი · M — ხმა', W / 2, H - 16, 12, 'rgba(255,255,255,0.45)', 'center', '400', false);
}

function drawStory() {
  const th = story.def.theme;
  let g;
  if (th === 'fire') { g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#050000'); g.addColorStop(1, '#2e0702'); }
  else if (th === 'witch') { g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#07000c'); g.addColorStop(1, '#2a0626'); }
  else if (th === 'dawn') { g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#3a2a5a'); g.addColorStop(0.5, '#e08a5a'); g.addColorStop(1, '#ffd88a'); }
  else { g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#bfe6ff'); g.addColorStop(1, '#fff3cf'); }
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (th === 'fire') drawCity(H * 1.0, 33, '#0a0202', '200,140,60');
  if (th === 'witch') {
    ctx.fillStyle = 'rgba(200,40,40,0.75)'; circle(ctx, W * 0.5, H * 0.18, Math.min(W, H) * 0.08);
    glow(GLOW.red, W * 0.5, H * 0.18, Math.min(W, H) * 0.3, 0.4);
    // ალქაჯის სილუეტი მთვარეზე
    const mx = W * 0.5 + Math.sin(gtime * 0.7) * W * 0.25, my = H * 0.18 + Math.sin(gtime * 1.3) * 10;
    ctx.fillStyle = '#000';
    ctx.fillRect(mx - 30, my, 60, 3);
    ctx.beginPath(); ctx.moveTo(mx - 8, my); ctx.lineTo(mx + 8, my); ctx.lineTo(mx, my - 24); ctx.fill();
    ctx.beginPath(); ctx.moveTo(mx - 4, my - 18); ctx.lineTo(mx + 4, my - 18); ctx.lineTo(mx + 2, my - 34); ctx.fill();
    drawCity(H * 1.0, 44, '#080006', '170,80,200');
  }
  if (th === 'dawn' || th === 'light') {
    const sx = W / 2, sy = th === 'dawn' ? H * 0.75 : H * 0.2;
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(gtime * 0.1);
    for (let i = 0; i < 16; i++) {
      ctx.rotate(TAU / 16);
      ctx.fillStyle = 'rgba(255,255,220,0.12)';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.max(W, H), -40); ctx.lineTo(Math.max(W, H), 40); ctx.fill();
    }
    ctx.restore();
    glow(GLOW.gold, sx, sy, Math.min(W, H) * 0.35, 0.8);
    ctx.fillStyle = '#fff7d0'; circle(ctx, sx, sy, Math.min(W, H) * 0.07);
  }
  drawUiParts();
  const dark = th === 'fire' || th === 'witch';
  let fs = clamp(W / 38, 17, 26);
  ctx.font = `700 ${fs}px ${FONT}`;
  const ps = story.def.portraits || [];
  const side = ps.length > 0 && W >= 900;
  const pr = side ? Math.min(H * 0.19, 130) : Math.min(H * 0.11, W * 0.2, 80);
  const pa = clamp(story.t * 1.5, 0, 1);
  const float = Math.sin(gtime * 1.5) * 5;
  let topShift = 0;
  if (ps.length) {
    if (side) {
      ps.forEach((k, i) => {
        const left = i === 0;
        const slide = (1 - pa) * 60 * (left ? -1 : 1);
        drawPortrait(k, (left ? pr + 60 : W - pr - 60) + slide, H / 2 - 10 + (left ? float : -float), pr, pa);
      });
    } else {
      ps.forEach((k, i) => {
        const x = ps.length === 1 ? W / 2 : W / 2 + (i === 0 ? -1 : 1) * pr * 1.35;
        drawPortrait(k, x, pr + 24 + (1 - pa) * -30 + (i ? -float : float) * 0.5, pr, pa);
      });
      topShift = pr * 1.25;
    }
  }
  ctx.font = `700 ${fs}px ${FONT}`;
  const maxW = side ? Math.min(W - 2 * (pr * 2 + 90), 760) : Math.min(W - 60, 820);
  const build = () => {
    ctx.font = `700 ${fs}px ${FONT}`;
    const bl = [];
    for (let i = 0; i <= story.idx; i++) {
      const full = story.def.lines[i];
      const shown = i < story.idx ? full : full.slice(0, Math.floor(story.chars));
      bl.push({ lines: wrapText(shown || ' ', maxW), cur: i === story.idx });
    }
    return bl;
  };
  // ტექსტი ეკრანზე უნდა დაეტიოს (ქვემოთ მინიშნებას ადგილი დარჩეს)
  const room = H - topShift - (story.def.hint ? 150 : 110);
  let blocks, lh, total;
  for (;;) {
    blocks = build(); lh = fs * 1.55;
    total = blocks.reduce((s, b) => s + b.lines.length * lh + fs * 0.6, 0);
    if (total <= room || fs <= 12) break;
    fs--;
  }
  let y = Math.max(20 + fs, (H - (story.def.hint ? 60 : 20)) / 2 - total / 2 + fs) + topShift;
  const col = dark ? '#f2e2d0' : '#3a2a10';
  for (const b of blocks) {
    ctx.globalAlpha = b.cur ? 1 : 0.55;
    for (const ln of b.lines) { txt(ln, W / 2, y, fs, col, 'center', '700', dark); y += lh; }
    y += fs * 0.6;
  }
  ctx.globalAlpha = 1;
  if (story.def.hint && story.idx === story.def.lines.length - 1) {
    ctx.font = `700 14px ${FONT}`;
    const hl = wrapText(story.def.hint, W - 40);
    hl.forEach((ln, i) => txt(ln, W / 2, H - 70 - (hl.length - 1 - i) * 20, 14, dark ? '#ffcf9a' : '#5a4a20', 'center', '700', dark));
  }
  const line = story.def.lines[story.idx];
  if (story.chars >= line.length && Math.floor(gtime * 2) % 2 === 0) {
    txt(usingTouch ? 'შეეხე გასაგრძელებლად ▸' : 'Enter ▸', W - 30, H - 26, 15, dark ? '#fff' : '#3a2a10', 'right', '700', dark);
  }
  if (!usingTouch) txt('Esc — გამოტოვება', 20, H - 26, 12, dark ? 'rgba(255,255,255,0.4)' : 'rgba(60,40,10,0.5)', 'left', '400', false);
}

function drawEnd() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#9fd8ff'); g.addColorStop(0.6, '#e8f6ff'); g.addColorStop(1, '#fff1c4');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const sx = W * 0.5, sy = H * 0.22;
  ctx.save(); ctx.translate(sx, sy); ctx.rotate(gtime * 0.08);
  for (let i = 0; i < 18; i++) {
    ctx.rotate(TAU / 18);
    ctx.fillStyle = 'rgba(255,250,210,0.25)';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.max(W, H), -50); ctx.lineTo(Math.max(W, H), 50); ctx.fill();
  }
  ctx.restore();
  glow(GLOW.gold, sx, sy, 220, 0.8);
  ctx.fillStyle = '#fff6c0'; circle(ctx, sx, sy, 60);
  // ბორცვები და ვენახი
  for (const [yy, col, amp, f] of [[0.72, '#8ed36b', 30, 0.006], [0.8, '#6cb94c', 22, 0.009], [0.9, '#4f9a38', 16, 0.013]]) {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W + 10; x += 10) ctx.lineTo(x, H * yy + Math.sin(x * f + yy * 10) * amp);
    ctx.lineTo(W, H); ctx.fill();
  }
  for (let x = 20; x < W; x += 40) {
    const y = H * 0.9 + Math.sin(x * 0.013 + 9) * 16 - 8;
    ctx.fillStyle = '#3f8f35'; circle(ctx, x, y, 10);
    ctx.fillStyle = '#6a2c8a'; circle(ctx, x + 4, y + 6, 3); circle(ctx, x + 1, y + 9, 3); circle(ctx, x + 7, y + 9, 3);
  }
  // საფლავი ბორცვზე
  {
    const gx = W * 0.8, gy = H * 0.8 + Math.sin(W * 0.8 * 0.009 + 8) * 22 - 4;
    ctx.fillStyle = '#5a3d22'; ellipse(ctx, gx, gy + 4, 30, 10);
    ctx.fillStyle = '#6b4a2a'; ctx.fillRect(gx - 4, gy - 46, 8, 48); ctx.fillRect(gx - 16, gy - 34, 32, 7);
    ctx.fillStyle = '#ff5d8f'; circle(ctx, gx - 14, gy + 2, 3.5); ctx.fillStyle = '#ffd23f'; circle(ctx, gx + 13, gy + 3, 3.5);
  }
  // ჩიტები
  ctx.strokeStyle = 'rgba(40,40,60,0.7)'; ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    const x = (gtime * 50 + i * 40) % (W + 200) - 100, y = H * 0.35 + (i % 2) * 18 + i * 6, w = Math.sin(gtime * 10 + i) * 4;
    ctx.beginPath(); ctx.moveTo(x - 8, y - 3 - w); ctx.lineTo(x, y); ctx.lineTo(x + 8, y - 3 - w); ctx.stroke();
  }
  drawUiParts();
  const a = Math.min(1, endT / 1.5);
  ctx.globalAlpha = a;
  const sz = Math.min(90, W / 7);
  ctx.font = `900 ${sz}px ${FONT}`; ctx.textAlign = 'center';
  ctx.lineWidth = 6; ctx.strokeStyle = '#fff'; ctx.strokeText('დასასრული', W / 2, H * 0.47);
  const tg = ctx.createLinearGradient(0, H * 0.47 - sz, 0, H * 0.47);
  tg.addColorStop(0, '#ffcc33'); tg.addColorStop(1, '#d4880f');
  ctx.fillStyle = tg; ctx.fillText('დასასრული', W / 2, H * 0.47);
  txt('შაკუნკულა ვაზისუბანში განისვენებს...', W / 2, H * 0.47 + sz * 0.55, Math.max(18, sz * 0.32), '#6a4a10', 'center', '700', false);
  ctx.globalAlpha = Math.min(1, Math.max(0, (endT - 1) / 1.2));
  const by = H * 0.47 + sz * 0.95;
  ctx.fillStyle = 'rgba(255,255,255,0.7)'; roundRect(ctx, W / 2 - 160, by, 320, 96, 14); ctx.fill();
  txt(`დრო: ${fmtTime(stats.time)}`, W / 2, by + 28, 17, '#4a3a10', 'center', '700', false);
  txt(`მოკლული ზომბები: ${stats.kills}`, W / 2, by + 54, 17, '#4a3a10', 'center', '700', false);
  txt(`დაცემები: ${stats.deaths}`, W / 2, by + 80, 17, '#4a3a10', 'center', '700', false);
  if (endT > 2 && Math.floor(gtime * 1.8) % 2 === 0) txt(usingTouch ? 'შეეხე — მთავარ მენიუში' : 'Enter — მთავარ მენიუში', W / 2, H - 30, 16, '#3a2a10', 'center', '700', false);
  ctx.globalAlpha = 1;
}

function drawDeadOverlay() {
  const a = Math.min(1, deadT / 1.2);
  ctx.fillStyle = `rgba(40,0,0,${a * 0.6})`; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = a;
  const sz = Math.min(64, W / 10);
  txt('შაკუნკულა დაეცა...', W / 2, H * 0.42, sz, '#ff4a3a', 'center', '900');
  ctx.globalAlpha = 1;
  if (deadT > 1.2 && Math.floor(gtime * 1.8) % 2 === 0) txt(usingTouch ? 'შეეხე — თავიდან ცდა' : 'R ან Enter — თავიდან ცდა', W / 2, H * 0.42 + sz, 20, '#fff', 'center', '700');
}

function drawPaused() {
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H);
  txt('პაუზა', W / 2, H * 0.4, Math.min(64, W / 9), '#fff', 'center', '900');
  txt(usingTouch ? 'შეეხე გასაგრძელებლად' : 'P / Esc — გაგრძელება  ·  M — ხმა', W / 2, H * 0.4 + 50, 18, '#ddd', 'center', '700');
  ctx.font = `700 14px ${FONT}`;
  const help = ['WASD — სიარული', 'მაუსი — დამიზნება · მარცხენა ღილაკი — სროლა', 'ისრები — სროლა მიმართულებით', 'Shift / Space — ნახტომი (დროებით უვნებელი ხარ)', 'თ — თოფი · ა — ავტომატი · თეთრი ყუთი — სიცოცხლე'];
  help.forEach((h, i) => txt(h, W / 2, H * 0.4 + 100 + i * 24, 14, '#bbb', 'center', '700'));
}

function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.textBaseline = 'alphabetic';
  if (state === 'title') drawTitle();
  else if (state === 'story' && story) drawStory();
  else if (state === 'end') drawEnd();
  else if (level) {
    drawWorld();
    drawHUD();
    if (state === 'dead') drawDeadOverlay();
    if (state === 'paused') drawPaused();
  }
  if (screenFlash > 0 && (state === 'play' || state === 'paused')) {
    ctx.fillStyle = `rgba(255,250,235,${Math.min(1, screenFlash)})`; ctx.fillRect(0, 0, W, H);
  }
  if (fade.a > 0) {
    ctx.globalAlpha = clamp(fade.a, 0, 1);
    ctx.fillStyle = fade.color; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
}

// ================== მთავარი ციკლი ==================
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// სწრაფი გადასვლა დონეზე (ტესტირებისთვის): index.html#1, #2, #3
const jump = /^#\d$/.test(location.hash) ? parseInt(location.hash.slice(1), 10) : 0;
if (jump >= 1 && jump <= 3) loadLevel(jump - 1);
if (location.hash === '#2win' || location.hash === '#2demon' || location.hash === '#2mana') { loadLevel(1); player.y = boss.y + 150; player.x = boss.x - 120; cam.y = player.y - H / 2; boss.state = 'fight'; boss.alpha = 1; dialog = null; titleCard = null; if (location.hash === '#2win') bossDie(); if (location.hash === '#2mana') { bossDie(); boss.deadT = 3.3; boss.form = 'manatee'; boss.popT = 1; slowmo = 0; } }
if (location.hash === '#3car') { loadLevel(2); player.x = 600; player.y = 860; dialog = null; titleCard = null; }
if (location.hash === '#3end') { loadLevel(2); player.x = 600; player.y = 860; dialog = null; titleCard = null; level.cut = { t: 17, step: 0 }; player.frozen = true; level.giulia.found = true; }
const sk = location.hash.startsWith('#story-') ? location.hash.slice(7) : '';
if (STORIES[sk]) { story = { key: sk, def: STORIES[sk], idx: STORIES[sk].lines.length - 1, chars: 9999, done: false, t: 5 }; state = 'story'; }

// შრიფტის ჩატვირთვის შემდეგ ზოგიერთი ტექსტი (მიწაზე დახატული) სწორად გამოჩნდება
if (document.fonts && document.fonts.load) document.fonts.load(`700 20px 'Noto Sans Georgian'`).catch(() => {});

})();
