// main.js — wires everything together: the fixed-step simulation loop
// (60 Hz, so gameplay is identical on every display), first-person and
// spectate cameras, the gun viewmodel, and the deterministic screenshot
// mode (?shot=<scene>&seed=<n>) used to produce the entry's screenshots.

import * as THREE from 'three';
import { FIXED_DT } from './config.js';
import { S, PHASE, resetMatch } from './state.js';
import { buildWorld, chargeMesh, SITES } from './world.js';
import { input, initInput, stepPlayer, eyeHeight } from './player.js';
import { initFx, fireWeapon, startReload, throwGrenade, stepWeapons, stepGrenades, updateFx, makeViewmodel } from './weapons.js';
import { stepBot } from './bots.js';
import { initMatch, stepRounds, startRound } from './rounds.js';
import { initHud, updateHud, showStartOverlay } from './hud.js';

// ---------------------------------------------------------- seeded shots
const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
if (params.has('seed')) { // deterministic Math.random for screenshot mode
  let a = (parseInt(params.get('seed'), 10) || 1) >>> 0;
  Math.random = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --------------------------------------------------------------- setup
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 1, 0.08, 300);
camera.rotation.order = 'YXZ';
scene.add(camera);

buildWorld(scene);
initFx(scene);
const viewmodel = makeViewmodel();
camera.add(viewmodel);

// the carrier's charge pack: one orange box riding on the carrier's back
const pack = new THREE.Mesh(
  new THREE.BoxGeometry(0.44, 0.3, 0.18),
  new THREE.MeshLambertMaterial({ color: 0xe07b2e }),
);
scene.add(pack);

initMatch(scene);
initHud(() => { resetMatch(); startRound(1); });

let started = !!shotName;
if (!shotName) {
  initInput(canvas, () => {});
  showStartOverlay(() => {
    started = true;
    resetMatch();
    startRound(1);
    canvas.requestPointerLock();
  });
} else {
  input.locked = true; // shot mode poses the camera directly
  setupShot(shotName);
}

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// --------------------------------------------------------- shot scenes
function pose(f, x, z, yaw) { f.pos.x = x; f.pos.z = z; f.yaw = yaw; }

function setupShot(name) {
  const p = S.player;
  const breakers = S.bots.filter((b) => b.team === 'breaker');
  const guardBot = S.bots.find((b) => b.team === 'guard');
  if (name === 'buy') {
    pose(p, -26, 18, -0.8); // freeze at Guard spawn, facing site A, menu open
    pose(guardBot, -19.5, 15.5, -0.8);
    S.phaseTime = 11;
  } else if (name === 'combat') {
    S.phase = PHASE.LIVE; S.phaseTime = 63;
    pose(p, 0, 9.5, -0.06);                   // south warehouse door
    pose(breakers[0], 0.5, 1.5, 3.08);        // caught mid-warehouse
    pose(guardBot, -3.2, 4.5, 0.4);
    p.weaponId = 'rifle';
    p.weapons.rifle = { mag: 24, reserve: 90 };
    p.hitmarkT = 0.12;
    fireWeapon(p);                            // live tracer + muzzle flash
    p.hitmarkT = 0.12;
  } else if (name === 'plant') {
    S.phase = PHASE.PLANTED; S.planted = true;
    S.site = 'B'; S.plantPos = { x: SITES.B.x, z: SITES.B.z };
    S.plantTime = 27; S.phaseTime = 27;
    chargeMesh.position.set(S.plantPos.x, 0, S.plantPos.z);
    chargeMesh.visible = true;
    pose(S.carrier, SITES.B.x, SITES.B.z, 2.4);
    pose(p, 15.5, -15.5, -1.8);               // pushing in to retake site B
    pose(breakers[1], 24.5, -17.5, 2.8);
  } else if (name === 'roundend') {
    S.phase = PHASE.END; S.phaseTime = 3.6;
    S.score.guard = 2; S.score.breaker = 1;
    S.endReason = 'Charge defused';
    S.lastRoundMoney = ['You: +$1,650', 'Vega: +$1,650', 'Rook: +$1,100', 'Sable: +$1,100', 'Orin: +$1,100'];
    pose(p, 20, -11, -0.59);
  }
  syncMeshes();
  for (let i = 0; i < 20; i++) renderer.render(scene, camera);
  window.__shotReady = true;
}

// ------------------------------------------------------------ stepping
function step(dt) {
  S.time += dt;
  stepRounds(dt);
  const p = S.player;
  if (p.alive && (S.phase === PHASE.LIVE || S.phase === PHASE.PLANTED || S.phase === PHASE.FREEZE)) {
    stepPlayer(p, dt);
    if (S.phase === PHASE.LIVE || S.phase === PHASE.PLANTED) {
      const w = p.weaponId;
      const auto = w && ['rifle', 'smg'].includes(w);
      if ((auto && input.fireHeld) || input.fireClicked) fireWeapon(p);
      if (input.reloadPressed) startReload(p);
      if (input.grenadePressed) throwGrenade(p, scene);
    }
  }
  input.fireClicked = false;
  input.reloadPressed = false;
  input.grenadePressed = false;
  for (const b of S.bots) stepBot(b, dt);
  for (const f of S.fighters) {
    stepWeapons(f);
    if (f.hitmarkT > 0) f.hitmarkT -= dt;
  }
  stepGrenades(dt, scene);
  for (const f of S.feed) f.t -= dt;
  S.feed = S.feed.filter((f) => f.t > 0);
  for (const a of S.announcements) a.t -= dt;
  S.announcements = S.announcements.filter((a) => a.t > 0);
}

function syncMeshes() {
  for (const b of S.bots) {
    if (!b.mesh) continue;
    b.mesh.position.set(b.pos.x, b.alive ? 0 : 0.22, b.pos.z);
    b.mesh.rotation.set(b.alive ? 0 : -Math.PI / 2, b.yaw, 0);
  }
  const c = S.carrier;
  if (c && c.alive && !S.planted && c.mesh) {
    pack.visible = true;
    pack.position.set(
      c.pos.x + Math.sin(c.yaw) * 0.28,
      1.05,
      c.pos.z + Math.cos(c.yaw) * 0.28,
    );
    pack.rotation.y = c.yaw;
  } else {
    pack.visible = false;
  }
  if (chargeMesh && S.planted) {
    const lamp = chargeMesh.getObjectByName('lamp');
    if (lamp) {
      const urgent = S.plantTime < 10;
      lamp.visible = (S.time * (urgent ? 6 : 2)) % 1 < 0.62;
    }
  }
}

function render() {
  const p = S.player;
  if (p.alive) {
    camera.position.set(p.pos.x, p.pos.y + eyeHeight(p), p.pos.z);
    camera.rotation.y = p.yaw;
    camera.rotation.x = p.pitch;
    camera.rotation.z = 0;
    // viewmodel sway: gentle bob while moving, kick while firing
    const sp = Math.hypot(p.vel.x, p.vel.z);
    viewmodel.position.y = Math.sin(S.time * 9) * 0.006 * Math.min(1, sp / 3);
    viewmodel.position.z = S.time < p.nextShotAt + 0.03 ? 0.05 : 0;
    viewmodel.visible = true;
  } else {
    // spectate: slow orbit over the harbour
    const t = S.time * 0.07;
    camera.position.set(Math.sin(t) * 27, 19, Math.cos(t) * 27);
    camera.lookAt(0, 0, 0);
    viewmodel.visible = false;
  }
  syncMeshes();
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- loop
let last = performance.now(), acc = 0, shotFrames = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let delta = (now - last) / 1000;
  last = now;
  if (delta > 0.25) delta = 0.25;
  if (shotName) {
    // screenshots: render the posed scene; keep hitmarker/flash alive
    if (shotName === 'combat' && S.player) S.player.hitmarkT = 0.12;
    render();
    updateHud();
    if (++shotFrames > 30) window.__shotReady = true;
    return;
  }
  if (started) {
    acc += delta;
    while (acc >= FIXED_DT) { step(FIXED_DT); acc -= FIXED_DT; }
  }
  updateFx(Math.min(delta, 0.05));
  render();
  if (started) updateHud();
}
requestAnimationFrame(frame);
