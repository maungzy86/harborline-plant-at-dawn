// weapons.js — hitscan gunfire against body zones, spread that punishes
// movement, recoil, reloads, and the M-Frag grenade (arc, bounce, fuse,
// line-of-sight-checked radial damage). One damage path for everyone:
// applyDamage is the only place health ever changes.

import * as THREE from 'three';
import { WEAPONS, GRENADE, ARMOUR, PLAYER } from './config.js';
import { S } from './state.js';
import { rayHit, losClear } from './world.js';
import { eyeHeight } from './player.js';

let killHandler = null;
export function setKillHandler(fn) { killHandler = fn; }

// ------------------------------------------------------------- fx pools
const tracers = [];   // {line, t}
let tracerPool = [];
let flashMesh = null;
const flashes = [];   // explosion flashes {mesh, t}
export const grenades = []; // live grenades {pos, vel, t, by, mesh}

export function initFx(scene) {
  for (let i = 0; i < 28; i++) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.85 }));
    line.visible = false;
    scene.add(line);
    tracerPool.push(line);
  }
  flashMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xffc46b }),
  );
  flashMesh.visible = false;
  scene.add(flashMesh);
}

function showTracer(ax, ay, az, bx, by, bz) {
  const line = tracerPool.pop();
  if (!line) return;
  const p = line.geometry.attributes.position.array;
  p[0] = ax; p[1] = ay; p[2] = az; p[3] = bx; p[4] = by; p[5] = bz;
  line.geometry.attributes.position.needsUpdate = true;
  line.visible = true;
  tracers.push({ line, t: 0.07 });
}

// -------------------------------------------------------------- damage
export function applyDamage(target, dmg, zone, attacker) {
  if (!target.alive) return;
  let rest = dmg;
  if (zone === 'torso' && target.armour > 0) {
    const absorbed = Math.min(target.armour, dmg * ARMOUR.absorb);
    target.armour -= absorbed;
    rest = dmg - absorbed;
  }
  target.health -= rest;
  target.lastHitAt = S.time;
  target.lastAttacker = attacker;
  if (target.health <= 0) {
    target.health = 0;
    target.alive = false;
    target.deaths++;
    if (attacker && attacker !== target) attacker.kills++;
    if (killHandler) killHandler(attacker, target, zone);
  }
}

// -------------------------------------------------------------- firing
function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, maxT) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return -1;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  if (d2 > r * r) return -1;
  const t = tca - Math.sqrt(r * r - d2);
  return t > 0 && t < maxT ? t : -1;
}

export function spreadFor(f, w) {
  const hSpeed = Math.hypot(f.vel.x, f.vel.z);
  let sp = w.spreadBase + w.spreadMove * (hSpeed / PLAYER.sprintSpeed);
  if (!f.onGround) sp += w.spreadBase * 2;              // airborne x3 total
  if (hSpeed < 0.5 && (f.stillTime || 0) > 0.25) sp *= 0.5; // settled bonus
  return sp;
}

export function fireWeapon(f) {
  const w = WEAPONS[f.weaponId];
  const ammo = f.weapons[f.weaponId];
  if (!f.alive || !ammo || ammo.mag <= 0) return false;
  if (S.time < f.nextShotAt || S.time < (f.reloadEndsAt || 0)) return false;
  f.nextShotAt = S.time + 60 / w.rpm;
  ammo.mag--;

  const eye = eyeHeight(f);
  const ox = f.pos.x, oy = f.pos.y + eye, oz = f.pos.z;
  const sp = spreadFor(f, w);
  const cp = Math.cos(f.pitch), spp = Math.sin(f.pitch);
  const fx = -Math.sin(f.yaw) * cp, fy = spp, fz = -Math.cos(f.yaw) * cp;
  const rx = Math.cos(f.yaw), rz = -Math.sin(f.yaw); // right vector (y=0)

  for (let p = 0; p < w.pellets; p++) {
    const a = (Math.random() + Math.random() - 1) * sp;
    const b = (Math.random() + Math.random() - 1) * sp;
    let dx = fx + rx * a, dy = fy + b, dz = fz + rz * a;
    const dl = Math.hypot(dx, dy, dz);
    dx /= dl; dy /= dl; dz /= dl;

    const wallT = rayHit(ox, oy, oz, dx, dy, dz, 120);
    let bestT = wallT, bestF = null, bestZone = null;
    for (const t of S.fighters) {
      if (t === f || !t.alive || t.team === f.team) continue;
      const zones = [
        ['head', t.pos.y + eyeHeight(t) - 0.10, 0.24],
        ['torso', t.pos.y + 0.98, 0.44],
        ['legs', t.pos.y + 0.42, 0.38],
      ];
      for (const [zone, cy, r] of zones) {
        const hit = raySphere(ox, oy, oz, dx, dy, dz, t.pos.x, cy, t.pos.z, r, bestT);
        if (hit > 0) { bestT = hit; bestF = t; bestZone = zone; }
      }
    }
    showTracer(ox + fx * 0.85, oy - 0.08, oz + fz * 0.85,
               ox + dx * bestT, oy + dy * bestT, oz + dz * bestT);
    if (bestF) {
      let dmg = w.damage * (bestZone === 'head' ? w.headshot : bestZone === 'legs' ? 0.75 : 1);
      if (bestT > w.falloffStart) {
        dmg *= Math.max(0.4, 1 - 0.6 * (bestT - w.falloffStart) / 25);
      }
      const wasAlive = bestF.alive;
      applyDamage(bestF, dmg, bestZone, f);
      if (f.isPlayer && wasAlive) {
        f.hitmarkT = 0.12;
        f.hitmarkKill = !bestF.alive;
      }
    }
  }

  // recoil: a pitch kick the player feels; bots get the same in miniature
  f.pitch = Math.min(1.45, f.pitch + (f.isPlayer ? 0.011 : 0.004));
  if (flashMesh) {
    // the player's flash sits on the viewmodel barrel (right and low);
    // a bot's sits at its muzzle, straight ahead of its eye
    const side = f.isPlayer ? 0.22 : 0;
    const drop = f.isPlayer ? 0.26 : 0.08;
    flashMesh.position.set(
      ox + fx * 0.85 + rx * side, oy - drop, oz + fz * 0.85 + rz * side);
    flashMesh.visible = true;
    flashMesh.userData.t = 0.045;
  }
  S.lastShot = { x: f.pos.x, z: f.pos.z, team: f.team, t: S.time };
  if (ammo.mag === 0) startReload(f);
  return true;
}

export function startReload(f) {
  const w = WEAPONS[f.weaponId];
  const ammo = f.weapons[f.weaponId];
  if (!ammo || ammo.mag >= w.mag || ammo.reserve <= 0) return;
  if (S.time < (f.reloadEndsAt || 0)) return;
  f.reloadEndsAt = S.time + w.reloadMs / 1000;
}

// Per-fighter per-step upkeep: finish reloads, track stillness.
export function stepWeapons(f) {
  const hSpeed = Math.hypot(f.vel.x, f.vel.z);
  f.stillTime = hSpeed < 0.5 ? (f.stillTime || 0) + 1 / 60 : 0;
  if (f.reloadEndsAt && S.time >= f.reloadEndsAt) {
    const w = WEAPONS[f.weaponId];
    const ammo = f.weapons[f.weaponId];
    const take = Math.min(w.mag - ammo.mag, ammo.reserve);
    ammo.mag += take; ammo.reserve -= take;
    f.reloadEndsAt = 0;
  }
}

// ------------------------------------------------------------- grenade
const grenadeGeo = new THREE.SphereGeometry(0.11, 10, 8);
const grenadeMat = new THREE.MeshLambertMaterial({ color: 0x3a4a3a });

export function throwGrenade(f, scene) {
  if (f.grenades <= 0 || !f.alive) return;
  f.grenades--;
  const eye = eyeHeight(f);
  const cp = Math.cos(f.pitch);
  const dir = { x: -Math.sin(f.yaw) * cp, y: Math.sin(f.pitch) + 0.25, z: -Math.cos(f.yaw) * cp };
  const dl = Math.hypot(dir.x, dir.y, dir.z);
  const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
  mesh.position.set(f.pos.x, f.pos.y + eye, f.pos.z);
  scene.add(mesh);
  grenades.push({
    pos: { x: f.pos.x, y: f.pos.y + eye, z: f.pos.z },
    vel: {
      x: (dir.x / dl) * GRENADE.throwSpeed + f.vel.x * 0.5,
      y: (dir.y / dl) * GRENADE.throwSpeed,
      z: (dir.z / dl) * GRENADE.throwSpeed + f.vel.z * 0.5,
    },
    t: GRENADE.fuse, by: f, mesh,
  });
}

export function stepGrenades(dt, scene) {
  for (let i = grenades.length - 1; i >= 0; i--) {
    const g = grenades[i];
    g.t -= dt;
    g.vel.y -= GRENADE.gravity * dt;
    g.pos.x += g.vel.x * dt; g.pos.y += g.vel.y * dt; g.pos.z += g.vel.z * dt;
    if (g.pos.y < 0.11) { // bounce off the ground
      g.pos.y = 0.11;
      g.vel.y = Math.abs(g.vel.y) * 0.35;
      g.vel.x *= 0.7; g.vel.z *= 0.7;
      if (Math.abs(g.vel.y) < 0.6) g.vel.y = 0;
    }
    g.mesh.position.set(g.pos.x, g.pos.y, g.pos.z);
    if (g.t <= 0) {
      explode(g, scene);
      scene.remove(g.mesh);
      grenades.splice(i, 1);
    }
  }
}

function explode(g, scene) {
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(1, 14, 10),
    new THREE.MeshBasicMaterial({ color: 0xffa63e, transparent: true, opacity: 0.9 }),
  );
  flash.position.set(g.pos.x, g.pos.y + 0.3, g.pos.z);
  scene.add(flash);
  flashes.push({ mesh: flash, t: 0.28 });
  for (const t of S.fighters) {
    if (!t.alive) continue;
    const d = Math.hypot(t.pos.x - g.pos.x, t.pos.z - g.pos.z);
    if (d > GRENADE.radius) continue;
    // cover protects: no line of sight from the blast, no damage
    if (!losClear(g.pos.x, g.pos.y + 0.3, g.pos.z, t.pos.x, t.pos.y + 0.9, t.pos.z)) continue;
    const dmg = GRENADE.damageMin + (GRENADE.damageMax - GRENADE.damageMin) * (1 - d / GRENADE.radius);
    applyDamage(t, dmg, 'torso', g.by);
    if (g.by.isPlayer && t.team !== g.by.team) { g.by.hitmarkT = 0.12; g.by.hitmarkKill = !t.alive; }
  }
}

// ------------------------------------------------------------ viewmodel
export function makeViewmodel() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.13, 0.52),
    new THREE.MeshLambertMaterial({ color: 0x23272c }),
  );
  body.position.set(0.24, -0.22, -0.5);
  group.add(body);
  const barrel = new THREE.Mesh(
    new THREE.BoxGeometry(0.045, 0.045, 0.34),
    new THREE.MeshLambertMaterial({ color: 0x14171a }),
  );
  barrel.position.set(0.24, -0.17, -0.85);
  barrel.name = 'barrel';
  group.add(barrel);
  const grip = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.16, 0.09),
    new THREE.MeshLambertMaterial({ color: 0x3a2f26 }),
  );
  grip.position.set(0.24, -0.33, -0.38);
  group.add(grip);
  return group;
}

export function updateFx(dt) {
  for (let i = tracers.length - 1; i >= 0; i--) {
    const tr = tracers[i];
    tr.t -= dt;
    if (tr.t <= 0) {
      tr.line.visible = false;
      tracerPool.push(tr.line);
      tracers.splice(i, 1);
    }
  }
  if (flashMesh && flashMesh.visible) {
    flashMesh.userData.t -= dt;
    if (flashMesh.userData.t <= 0) flashMesh.visible = false;
  }
  for (let i = flashes.length - 1; i >= 0; i--) {
    const fl = flashes[i];
    fl.t -= dt;
    const k = Math.max(0, fl.t / 0.28);
    fl.mesh.scale.setScalar(1 + (1 - k) * 4.5);
    fl.mesh.material.opacity = k * 0.9;
    if (fl.t <= 0) {
      fl.mesh.parent && fl.mesh.parent.remove(fl.mesh);
      flashes.splice(i, 1);
    }
  }
}
