// bots.js — the four bot fighters. Each runs the same brain:
//   perceive (vision cone + line of sight, hearing gunshots and sprint
//   footsteps, a 4-second last-known-position memory) -> decide (route to
//   the objective, seek the last known position, engage with strafing
//   burst fire, hold an angle) -> move on the shared physics.
// Routing is A* over the hand-authored waypoint graph in world.js.

import * as THREE from 'three';
import { BOTS, TEAM } from './config.js';
import { S, PHASE } from './state.js';
import { NODES, ADJ, NODE, SITES, losClear } from './world.js';
import { accelerate, stepBody, eyeHeight } from './player.js';
import { fireWeapon, startReload } from './weapons.js';

export function newBrain(role) {
  return {
    role,                 // 'carrier' | 'escort' | 'guard'
    state: 'route',
    path: [], pathI: 0,
    reactAt: 0,           // when the current target may first be shot at
    seenId: null,
    lkp: null, lkpUntil: 0,
    lastHeardT: -1,
    burstLeft: 0, burstWaitUntil: 0,
    strafeDir: 1, strafeFlipAt: 0,
    scanYaw: 0,
  };
}

export function makeBotMesh(team) {
  const g = new THREE.Group();
  const suit = new THREE.MeshLambertMaterial({ color: team === TEAM.GUARD ? 0x2e6f6a : 0xa4552f });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2b2f36 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), suit);
  torso.position.y = 0.98;
  g.add(torso);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.3), dark);
  legs.position.y = 0.32;
  g.add(legs);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.21, 12, 10),
    new THREE.MeshLambertMaterial({ color: 0xc9a186 }),
  );
  head.position.y = 1.52;
  g.add(head);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.62), dark);
  gun.position.set(0.18, 1.12, -0.3);
  g.add(gun);
  return g;
}

// ------------------------------------------------------------- routing
export function nearestNode(x, z) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < NODES.length; i++) {
    const d = (NODES[i][0] - x) ** 2 + (NODES[i][1] - z) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

function astar(from, to) {
  if (from === to) return [to];
  const open = new Set([from]);
  const came = new Map(), gs = new Map([[from, 0]]);
  const h = (n) => Math.hypot(NODES[n][0] - NODES[to][0], NODES[n][1] - NODES[to][1]);
  const fs = new Map([[from, h(from)]]);
  while (open.size) {
    let cur = null, bf = Infinity;
    for (const n of open) if (fs.get(n) < bf) { bf = fs.get(n); cur = n; }
    if (cur === to) {
      const path = [cur];
      while (came.has(cur)) { cur = came.get(cur); path.unshift(cur); }
      return path;
    }
    open.delete(cur);
    for (const nb of ADJ[cur]) {
      const g = gs.get(cur) + Math.hypot(NODES[nb][0] - NODES[cur][0], NODES[nb][1] - NODES[cur][1]);
      if (g < (gs.get(nb) ?? Infinity)) {
        came.set(nb, cur); gs.set(nb, g); fs.set(nb, g + h(nb)); open.add(nb);
      }
    }
  }
  return [from];
}

function setPath(bot, nodeId) {
  const b = bot.brain;
  b.path = astar(nearestNode(bot.pos.x, bot.pos.z), nodeId);
  b.pathI = 0;
}

// Move along the current path; returns true when the path is finished.
// Stall guard: if a corner snags the bot (barely moved for 1.5 s), skip
// to the next node — the graph is dense enough that this always recovers.
function followPath(bot, dt, speed) {
  const b = bot.brain;
  if (b.stallX === undefined) { b.stallX = bot.pos.x; b.stallZ = bot.pos.z; b.stallT = 0; }
  b.stallT += dt;
  if (b.stallT > 1.5) {
    const moved = Math.hypot(bot.pos.x - b.stallX, bot.pos.z - b.stallZ);
    if (moved < 0.15 && b.pathI < b.path.length) b.pathI++;
    b.stallX = bot.pos.x; b.stallZ = bot.pos.z; b.stallT = 0;
  }
  while (b.pathI < b.path.length) {
    const [tx, tz] = NODES[b.path[b.pathI]];
    const dx = tx - bot.pos.x, dz = tz - bot.pos.z;
    if (Math.hypot(dx, dz) < 0.7) { b.pathI++; continue; }
    moveToward(bot, tx, tz, speed, dt);
    return false;
  }
  return true;
}

function moveToward(bot, tx, tz, speed, dt) {
  const dx = tx - bot.pos.x, dz = tz - bot.pos.z;
  const d = Math.hypot(dx, dz) || 1;
  faceToward(bot, dx / d, dz / d, dt);
  accelerate(bot, dx / d, dz / d, speed, dt);
}

function faceToward(bot, dx, dz, dt) {
  const want = Math.atan2(-dx, -dz);
  let diff = want - bot.yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const turn = 4.2 * dt;
  bot.yaw += Math.max(-turn, Math.min(turn, diff));
}

function facePoint(bot, x, z, dt) {
  faceToward(bot, x - bot.pos.x, z - bot.pos.z, dt);
}

// ---------------------------------------------------------- perception
function visibleEnemy(bot) {
  let best = null, bd = Infinity;
  const fx = -Math.sin(bot.yaw), fz = -Math.cos(bot.yaw);
  for (const e of S.fighters) {
    if (!e.alive || e.team === bot.team) continue;
    const dx = e.pos.x - bot.pos.x, dz = e.pos.z - bot.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > BOTS.visionRange || dist >= bd) continue;
    if (dist > 2.5) { // point blank is always noticed
      const dot = (dx * fx + dz * fz) / (dist || 1);
      if (dot < BOTS.visionCos) continue;
    }
    if (!losClear(bot.pos.x, bot.pos.y + 1.5, bot.pos.z, e.pos.x, e.pos.y + 1.2, e.pos.z)) continue;
    best = e; bd = dist;
  }
  return best;
}

function hearNoise(bot) {
  const b = bot.brain;
  const shot = S.lastShot;
  if (shot && shot.t > b.lastHeardT && shot.team !== bot.team) {
    b.lastHeardT = shot.t;
    const d = Math.hypot(shot.x - bot.pos.x, shot.z - bot.pos.z);
    if (d < BOTS.hearingGunshot) {
      b.lkp = { x: shot.x, z: shot.z };
      b.lkpUntil = S.time + BOTS.memorySeconds;
    }
  }
  // sprinting footsteps carry less far but pinpoint the runner
  for (const e of S.fighters) {
    if (!e.alive || e.team === bot.team || !e.sprinting) continue;
    const d = Math.hypot(e.pos.x - bot.pos.x, e.pos.z - bot.pos.z);
    if (d < BOTS.hearingSprint) {
      b.lkp = { x: e.pos.x, z: e.pos.z };
      b.lkpUntil = S.time + BOTS.memorySeconds;
    }
  }
}

// -------------------------------------------------------------- combat
function engage(bot, enemy, dt) {
  const b = bot.brain;
  facePoint(bot, enemy.pos.x, enemy.pos.z, dt);
  const dist = Math.hypot(enemy.pos.x - bot.pos.x, enemy.pos.z - bot.pos.z);
  // strafe sideways while shooting; close or back off to a comfort band
  if (S.time >= b.strafeFlipAt) {
    b.strafeDir = Math.random() < 0.5 ? -1 : 1;
    b.strafeFlipAt = S.time + 0.7 + Math.random() * 0.6;
  }
  const fx = -Math.sin(bot.yaw), fz = -Math.cos(bot.yaw);
  let mx = -fz * b.strafeDir, mz = fx * b.strafeDir;
  if (dist > 18) { mx += fx * 0.8; mz += fz * 0.8; }
  if (dist < 5) { mx -= fx * 0.8; mz -= fz * 0.8; }
  const ml = Math.hypot(mx, mz) || 1;
  accelerate(bot, mx / ml, mz / ml, 3.1, dt);

  if (S.time < b.reactAt) return;
  if (b.burstLeft <= 0) {
    if (S.time < b.burstWaitUntil) return;
    b.burstLeft = BOTS.burstMin + Math.floor(Math.random() * (BOTS.burstMax - BOTS.burstMin + 1));
    b.burstWaitUntil = S.time + 0.45 + Math.random() * 0.45;
  }
  if (fireWeapon(bot)) b.burstLeft--;
}

// ------------------------------------------------------------ main step
export function stepBot(bot, dt) {
  const b = bot.brain;
  if (!bot.alive || !b) return;
  if (S.phase !== PHASE.LIVE && S.phase !== PHASE.PLANTED) { stepBody(bot, dt); return; }

  hearNoise(bot);
  const enemy = visibleEnemy(bot);
  if (enemy) {
    if (b.seenId !== enemy) {
      b.seenId = enemy;
      b.reactAt = S.time + BOTS.reactionMin + Math.random() * (BOTS.reactionMax - BOTS.reactionMin);
    }
    b.lkp = { x: enemy.pos.x, z: enemy.pos.z };
    b.lkpUntil = S.time + BOTS.memorySeconds;
  } else if (b.seenId && S.time > b.lkpUntil) {
    b.seenId = null;
  }

  const site = SITES[S.site];
  const siteNode = S.site === 'A' ? NODE.siteA : NODE.siteB;
  const atSite = Math.hypot(bot.pos.x - site.x, bot.pos.z - site.z) < site.r - 0.8;

  // the carrier plants: rounds.js runs the channel while it stands here
  if (b.role === 'carrier' && !S.planted && atSite) {
    b.state = 'plant';
    stepBody(bot, dt);
    return;
  }

  if (enemy) {
    b.state = 'engage';
    engage(bot, enemy, dt);
  } else if (b.lkp && S.time < b.lkpUntil) {
    b.state = 'seek';
    const done = followPath(bot, dt, 3.9);
    if (done) { // arrived at the memory: look at it, then scan
      facePoint(bot, b.lkp.x, b.lkp.z, dt);
      if (Math.hypot(b.lkp.x - bot.pos.x, b.lkp.z - bot.pos.z) > 1.2) {
        moveToward(bot, b.lkp.x, b.lkp.z, 3.4, dt);
      }
    }
    if (!b.path.length) setPath(bot, nearestNode(b.lkp.x, b.lkp.z));
  } else {
    // objective routing
    let targetNode;
    if (bot.team === TEAM.BREAKER) {
      targetNode = S.planted ? siteNode : siteNode; // push the site, then hold it
      b.state = S.planted ? 'hold' : 'route';
    } else {
      // the guard teammate holds mid until the plant, then retakes the site
      targetNode = S.planted ? siteNode : NODE.holdMid;
      b.state = S.planted ? 'retake' : 'hold';
    }
    const [tx, tz] = NODES[targetNode];
    const distT = Math.hypot(tx - bot.pos.x, tz - bot.pos.z);
    if (distT > 1.6) {
      if (!b.path.length || b.path[b.path.length - 1] !== targetNode) setPath(bot, targetNode);
      followPath(bot, dt, b.state === 'retake' ? 4.1 : 3.7);
    } else {
      // hold: settle on the angle, slow scan across the likely approach
      b.scanYaw += dt * 0.5;
      faceToward(bot, Math.sin(b.scanYaw) * 0.8 + (site.x - bot.pos.x) * 0.02,
                 Math.cos(b.scanYaw) * 0.8 + (site.z - bot.pos.z) * 0.02, dt);
      stepBody(bot, dt);
      return;
    }
  }

  // an empty or near-empty magazine with nobody in sight: reload now
  const ammo = bot.weapons[bot.weaponId];
  if (ammo && ammo.mag <= 6 && !enemy) startReload(bot);
  stepBody(bot, dt);
}

export { eyeHeight };
