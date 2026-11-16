// hud.js — every DOM element the player reads: health and armour, ammo,
// money, the round clock and score, hitmarker, kill feed, the buy menu,
// objective progress bars, and the start / round-end / match-end screens.
// Pure presentation: it reads state.js and never changes it (the one
// exception is the Play Again button, which calls back into main).

import { WEAPONS, GRENADE, ARMOUR, DEFUSE_KIT, ROUNDS } from './config.js';
import { S, PHASE } from './state.js';

const el = {};
let onPlayAgain = null;

export function initHud(playAgain) {
  onPlayAgain = playAgain;
  const root = document.getElementById('hud');
  root.innerHTML = `
    <div id="topbar">
      <div id="score-guard" class="score"></div>
      <div id="clock"><div id="timer">0:00</div><div id="round-label"></div></div>
      <div id="score-breaker" class="score"></div>
    </div>
    <div id="feed"></div>
    <div id="announce"></div>
    <div id="crosshair"><i></i><i></i><i></i><i></i></div>
    <div id="hitmarker"><i></i><i></i><i></i><i></i></div>
    <div id="vitals">
      <div id="hp-row"><span id="hp-num">100</span><div id="hp-bar"><div id="hp-fill"></div></div></div>
      <div id="armour-row">ARMOUR <span id="armour-num">0</span></div>
    </div>
    <div id="gunbox">
      <div id="money">$800</div>
      <div id="weapon-name">P9 Sidearm</div>
      <div id="ammo"><span id="ammo-mag">12</span><span id="ammo-res">/ 60</span></div>
      <div id="grenade-row"></div>
    </div>
    <div id="objective"><div id="objective-label"></div><div id="objective-bar"><div id="objective-fill"></div></div></div>
    <div id="buy-menu"></div>
    <div id="overlay"></div>
    <div id="vignette"></div>`;
  for (const id of ['score-guard', 'score-breaker', 'timer', 'round-label', 'feed',
                    'announce', 'hitmarker', 'hp-num', 'hp-fill', 'armour-num',
                    'money', 'weapon-name', 'ammo-mag', 'ammo-res', 'grenade-row',
                    'objective', 'objective-label', 'objective-fill', 'buy-menu',
                    'overlay', 'vignette', 'crosshair']) {
    el[id] = document.getElementById(id);
  }
}

const fmtTime = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

function buyMenuHtml(p) {
  const rows = [];
  const item = (key, name, price, owned, afford) =>
    `<div class="buy-row ${owned ? 'owned' : afford ? '' : 'poor'}"><b>${key}</b><span>${name}</span><em>${owned ? 'OWNED' : '$' + price.toLocaleString('en-US')}</em></div>`;
  for (const w of Object.values(WEAPONS)) {
    if (!w.buyKey) continue;
    rows.push(item(w.buyKey, w.name, w.price, !!p.weapons[
      Object.keys(WEAPONS).find((k) => WEAPONS[k] === w)], p.money >= w.price));
  }
  rows.push(item(ARMOUR.buyKey, 'Armour vest', ARMOUR.price, p.armour >= ARMOUR.points, p.money >= ARMOUR.price));
  rows.push(item(GRENADE.buyKey, 'M-Frag grenade', GRENADE.price, p.grenades >= 2, p.money >= GRENADE.price));
  rows.push(item(DEFUSE_KIT.buyKey, 'Defuse kit', DEFUSE_KIT.price, p.hasKit, p.money >= DEFUSE_KIT.price));
  return `<div class="buy-title">BUY — freeze ${fmtTime(S.phaseTime)} · $${p.money.toLocaleString('en-US')}</div>${rows.join('')}`;
}

export function updateHud() {
  const p = S.player;
  if (!p) return;
  // clock shows the charge timer instead once the plant is in
  const clock = S.phase === PHASE.PLANTED ? S.plantTime : S.phaseTime;
  el.timer.textContent = fmtTime(clock);
  el.timer.style.color = S.phase === PHASE.PLANTED ? '#ff5a3c' : '';
  el['round-label'].textContent =
    `ROUND ${S.round} · ${S.phase.toUpperCase()}${S.phase === PHASE.FREEZE ? ' — BUY' : ''}`;
  el['score-guard'].textContent = `GUARD ${S.score.guard}`;
  el['score-breaker'].textContent = `BREAKERS ${S.score.breaker}`;

  el['hp-num'].textContent = Math.ceil(p.health);
  el['hp-fill'].style.width = `${Math.max(0, p.health)}%`;
  el['hp-fill'].style.background = p.health > 35 ? '#7dc95e' : '#e0483c';
  el['armour-num'].textContent = Math.ceil(p.armour);
  el.money.textContent = `$${p.money.toLocaleString('en-US')}`;

  const w = WEAPONS[p.weaponId];
  const ammo = p.weapons[p.weaponId];
  el['weapon-name'].textContent = w.name + (S.time < (p.reloadEndsAt || 0) ? ' — RELOADING' : '');
  el['ammo-mag'].textContent = ammo ? ammo.mag : 0;
  el['ammo-res'].textContent = `/ ${ammo ? ammo.reserve : 0}`;
  el['grenade-row'].textContent = p.grenades ? `G · FRAG x${p.grenades}` : '';

  // hitmarker fades over ~120 ms, red on a kill
  const hm = p.hitmarkT > 0;
  el.hitmarker.style.opacity = hm ? 1 : 0;
  el.hitmarker.className = p.hitmarkKill ? 'kill' : '';

  // kill feed + announcements age out in main; render what is queued
  el.feed.innerHTML = S.feed.map((f) => `<div>${f.text}</div>`).join('');
  const ann = S.announcements[S.announcements.length - 1];
  el.announce.textContent = ann ? ann.text : '';
  el.announce.style.opacity = ann ? Math.min(1, ann.t) : 0;

  // damage vignette: fresh hit flashes, low health keeps a pulse
  const fresh = p.lastHitAt && S.time - p.lastHitAt < 0.35;
  el.vignette.style.opacity = fresh ? 0.55 : p.alive && p.health < 35 ? 0.3 : 0;
  el.crosshair.style.opacity = p.alive && S.phase !== PHASE.MATCH ? 1 : 0;

  // objective progress: defuse (yours), plant (the carrier's), charge state
  let obj = null;
  if (S.defusing) obj = { label: 'DEFUSING…', frac: S.defusing.t / (S.defusing.needed || ROUNDS.defuseSeconds) };
  else if (S.planting) obj = { label: 'CHARGE BEING PLANTED', frac: S.planting.t / ROUNDS.plantSeconds };
  else if (S.phase === PHASE.PLANTED) obj = { label: `CHARGE PLANTED AT ${S.site} — ${fmtTime(S.plantTime)}`, frac: S.plantTime / ROUNDS.chargeSeconds };
  el.objective.style.display = obj ? 'block' : 'none';
  if (obj) {
    el['objective-label'].textContent = obj.label;
    el['objective-fill'].style.width = `${Math.max(0, Math.min(1, obj.frac)) * 100}%`;
  }

  // buy menu only during the freeze, and only while alive to spend
  if (S.phase === PHASE.FREEZE && p.alive) {
    el['buy-menu'].style.display = 'block';
    el['buy-menu'].innerHTML = buyMenuHtml(p);
  } else {
    el['buy-menu'].style.display = 'none';
  }

  // overlays: round end scoreboard, match end, or the dead-spectate note
  if (S.phase === PHASE.END) {
    el.overlay.style.display = 'flex';
    el.overlay.innerHTML = `<div class="panel"><h2>${S.endReason}</h2>
      <p class="big">GUARD ${S.score.guard} — ${S.score.breaker} BREAKERS</p>
      <p>${S.lastRoundMoney.join('<br>')}</p></div>`;
  } else if (S.phase === PHASE.MATCH) {
    el.overlay.style.display = 'flex';
    el.overlay.innerHTML = `<div class="panel"><h2>${S.winner === 'guard' ? 'HARBOR HELD' : 'HARBOR LOST'}</h2>
      <p class="big">GUARD ${S.score.guard} — ${S.score.breaker} BREAKERS</p>
      <p>Your record: ${p.kills} kills · ${p.deaths} deaths</p>
      <button id="again">PLAY AGAIN</button></div>`;
    const btn = document.getElementById('again');
    if (btn && onPlayAgain) btn.onclick = () => onPlayAgain();
  } else if (!p.alive && (S.phase === PHASE.LIVE || S.phase === PHASE.PLANTED)) {
    el.overlay.style.display = 'flex';
    el.overlay.innerHTML = `<div class="panel small"><h2>YOU ARE DOWN</h2><p>Spectating until the round ends.</p></div>`;
  } else {
    el.overlay.style.display = 'none';
  }
}

export function showStartOverlay(onStart) {
  el.overlay.style.display = 'flex';
  el.overlay.innerHTML = `<div class="panel">
    <h1>HARBORLINE</h1><p class="sub">Plant at Dawn — a tactical FPS</p>
    <p>Defend the harbour. Breakers are coming to plant a charge on site A or B.<br>
    Buy in the freeze (keys 1–6), hold your angles, defuse with <b>E</b> if it plants.<br>
    WASD move · Shift sprint · C crouch · Space jump · R reload · G grenade · mouse aim, click fire.</p>
    <button id="again">CLICK TO PLAY</button></div>`;
  const btn = document.getElementById('again');
  if (btn) btn.onclick = () => onStart();
}
