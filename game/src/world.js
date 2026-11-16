// world.js — the Harborline map: one list of boxes is the single source of
// truth. The same COLLIDERS array builds the visible meshes, stops movement
// and stops bullets, so what you see is exactly what you can hide behind.
// Layout: a 64 m x 48 m harbour yard. A site on the SW dock, B site in the
// NE container yard, a warehouse (Mid) between them, three lanes joining
// the two spawns. North is -z.

import * as THREE from 'three';

// ------------------------------------------------------------- colliders
// {x, z} centre, w/d footprint, h height. Perimeter walls are included so
// bullets stop at the fence too.
export const COLLIDERS = [];
function box(x, z, w, d, h, color, kind) {
  const c = { x, z, w, d, h, color, kind: kind || 'box' };
  COLLIDERS.push(c);
  return c;
}

const TEAL = 0x3f6f6a, RUST = 0xa4552f, SLATE = 0x5a6570, CRATE = 0x8a6f4d;
const WALL = 0x87909a, SHELF = 0x77644a;

// perimeter fence
box(0, -24.3, 65, 0.6, 3.2, WALL); box(0, 24.3, 65, 0.6, 3.2, WALL);
box(-32.3, 0, 0.6, 49, 3.2, WALL); box(32.3, 0, 0.6, 49, 3.2, WALL);

// warehouse (Mid): walls with door gaps on all four sides
box(-6.5, -6, 7, 0.6, 3.2, WALL); box(6.5, -6, 7, 0.6, 3.2, WALL);
box(-6.5, 6, 7, 0.6, 3.2, WALL); box(6.5, 6, 7, 0.6, 3.2, WALL);
box(-10, -3.75, 0.6, 4.5, 3.2, WALL); box(-10, 3.75, 0.6, 4.5, 3.2, WALL);
box(10, -3.75, 0.6, 4.5, 3.2, WALL); box(10, 3.75, 0.6, 4.5, 3.2, WALL);
// shelf rows inside the warehouse
box(-5, -2, 1.2, 3.6, 2.4, SHELF, 'shelf'); box(-5, 2.4, 1.2, 2.8, 2.4, SHELF, 'shelf');
box(3, -2.6, 1.2, 2.6, 2.4, SHELF, 'shelf'); box(3, 1.8, 1.2, 3.2, 2.4, SHELF, 'shelf');
box(0, 0, 1.1, 1.1, 1.1, CRATE, 'crate');

// containers: B yard (NE)
box(14, -20, 6, 2.4, 2.6, TEAL, 'container'); box(20, -9, 2.4, 6, 2.6, RUST, 'container');
box(8, -14, 6, 2.4, 2.6, SLATE, 'container'); box(27, -6, 2.4, 6, 2.6, TEAL, 'container');
// containers: A dock (SW)
box(-14, 20, 6, 2.4, 2.6, RUST, 'container'); box(-20, 9, 2.4, 6, 2.6, TEAL, 'container');
box(-8, 14, 6, 2.4, 2.6, SLATE, 'container'); box(-27, 6, 2.4, 6, 2.6, RUST, 'container');
// containers: lane dressing
box(-16, -12, 6, 2.4, 2.6, SLATE, 'container'); box(16, 12, 6, 2.4, 2.6, TEAL, 'container');
box(-18, -2, 2.4, 6, 2.6, RUST, 'container'); box(18, 2, 2.4, 6, 2.6, SLATE, 'container');

// crates and props
for (const [x, z] of [[24, -12], [-24, 12], [0, -12], [0, 12], [12, 6], [-12, -6],
                      [26, 14], [-26, -14], [6, -18], [-6, 18], [23, -18.5], [26.5, -15]]) {
  box(x, z, 1.1, 1.1, 1.1, CRATE, 'crate');
}
// forklift near A: body + mast, boxes only
box(-18, 16, 2.2, 1.2, 1.0, 0xc7a23a, 'prop'); box(-19.1, 16, 0.3, 1.2, 2.2, 0x8a7422, 'prop');
// dock office block behind Guard spawn
box(-29.5, 11, 5, 5, 3.2, SLATE, 'building');

// ---------------------------------------------------------------- sites
export const SITES = {
  A: { x: -22, z: 14, r: 4 },
  B: { x: 22, z: -14, r: 4 },
};
export const SPAWNS = {
  guard: [{ x: -26, z: 18, yaw: -2.2 }, { x: -24, z: 20.5, yaw: -2.2 }],
  breaker: [{ x: 26, z: -18, yaw: 0.95 }, { x: 24, z: -20.5, yaw: 0.95 }, { x: 28.5, z: -15.5, yaw: 0.95 }],
};

// ------------------------------------------------------- waypoint graph
// Hand-authored nodes over the three lanes; bots route with A* over these
// edges only. Every edge was checked to run through open ground.
export const NODES = [
  [-26, 18], [-22, 14], [-14, 16], [-4, 13], [0, 8], [0, 0], [0, -8], [4, -13],
  [14, -16], [22, -14], [26, -18], [-24, 4], [-12, 0], [12, 0], [24, -4],
  [-12, 18], [12, -20], [-18, 10], [18, -10], [-6, -3], [6, 3], [-2, 20],
  [2, -20], [-28, -8], [28, 8],
];
const EDGE_PAIRS = [
  [0, 1], [0, 15], [1, 2], [1, 17], [2, 3], [2, 17], [3, 4], [3, 21], [4, 5],
  [5, 6], [5, 19], [5, 20], [6, 7], [7, 8], [7, 22], [8, 9], [8, 18], [9, 10],
  [9, 18], [10, 16], [11, 12], [11, 17], [11, 23], [12, 5], [13, 5], [13, 14],
  [13, 18], [14, 9], [14, 24], [15, 21], [16, 22], [17, 12], [20, 4],
  [23, 12], [24, 13], [21, 0], [22, 16],
];
// note: shelf node 19 routes via node 5 — the direct 19->6 line clips the
// warehouse's north wall, so it is deliberately not an edge.

export const ADJ = NODES.map(() => []);
for (const [a, b] of EDGE_PAIRS) { ADJ[a].push(b); ADJ[b].push(a); }

// Node ids that matter to the round logic.
export const NODE = {
  guardSpawn: 0, siteA: 1, siteB: 9, breakerSpawn: 10,
  holdA: 17, holdB: 18, holdMid: 5,
};

// ------------------------------------------------------------ collision
// Push a point (with radius) out of every box it overlaps, horizontally.
// Fighters stand on y=0 or jump below box height, so a 2D resolve is exact
// for every collider taller than a jump.
export function collide(pos, radius) {
  for (const c of COLLIDERS) {
    if (pos.y >= c.h) continue;
    const hw = c.w / 2 + radius, hd = c.d / 2 + radius;
    const dx = pos.x - c.x, dz = pos.z - c.z;
    if (Math.abs(dx) < hw && Math.abs(dz) < hd) {
      const px = hw - Math.abs(dx), pz = hd - Math.abs(dz);
      if (px < pz) pos.x = c.x + (dx >= 0 ? hw : -hw);
      else pos.z = c.z + (dz >= 0 ? hd : -hd);
    }
  }
  pos.x = Math.max(-31.5, Math.min(31.5, pos.x));
  pos.z = Math.max(-23.5, Math.min(23.5, pos.z));
}

// ---------------------------------------------------------------- rays
// Slab test against every collider plus the ground plane. Returns the
// nearest hit distance along the (normalised) ray, or Infinity.
export function rayHit(ox, oy, oz, dx, dy, dz, maxDist) {
  let best = maxDist;
  if (dy < -1e-6) {
    const t = -oy / dy;
    if (t > 0 && t < best) best = t;
  }
  for (const c of COLLIDERS) {
    const minX = c.x - c.w / 2, maxX = c.x + c.w / 2;
    const minZ = c.z - c.d / 2, maxZ = c.z + c.d / 2;
    let t0 = 0, t1 = best;
    if (Math.abs(dx) < 1e-8) { if (ox < minX || ox > maxX) continue; }
    else {
      let ta = (minX - ox) / dx, tb = (maxX - ox) / dx;
      if (ta > tb) { const q = ta; ta = tb; tb = q; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) continue;
    }
    if (Math.abs(dz) < 1e-8) { if (oz < minZ || oz > maxZ) continue; }
    else {
      let ta = (minZ - oz) / dz, tb = (maxZ - oz) / dz;
      if (ta > tb) { const q = ta; ta = tb; tb = q; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) continue;
    }
    if (Math.abs(dy) < 1e-8) { if (oy < 0 || oy > c.h) continue; }
    else {
      let ta = (0 - oy) / dy, tb = (c.h - oy) / dy;
      if (ta > tb) { const q = ta; ta = tb; tb = q; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) continue;
    }
    if (t0 > 0 && t0 < best) best = t0;
  }
  return best;
}

// Line of sight between two eye-level points: clear when no collider is
// closer than the target itself.
export function losClear(ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 1e-4) return true;
  const hit = rayHit(ax, ay, az, dx / dist, dy / dist, dz / dist, dist);
  return hit >= dist - 0.05;
}

// ------------------------------------------------------------ rendering
export let chargeMesh = null;

export function buildWorld(scene) {
  // dawn sky: a canvas gradient, deep blue up top warming to amber
  const cv = document.createElement('canvas'); cv.width = 4; cv.height = 256;
  const g = cv.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#2e3d55'); grad.addColorStop(0.62, '#7d6a58');
  grad.addColorStop(0.8, '#d9a05b'); grad.addColorStop(1, '#e8b06a');
  g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
  const skyTex = new THREE.CanvasTexture(cv);
  scene.background = skyTex;
  scene.fog = new THREE.Fog(0xc99a5e, 45, 120);

  scene.add(new THREE.HemisphereLight(0xffd9a0, 0x46536a, 1.35));
  const sun = new THREE.DirectionalLight(0xffb36b, 1.9);
  sun.position.set(-30, 18, 26);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xa8bce0, 0.55);
  fill.position.set(15, 26, 30);
  scene.add(fill);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(64, 48),
    new THREE.MeshLambertMaterial({ color: 0x4a5058 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // lane paint: pale strips down the three lanes
  const paintMat = new THREE.MeshBasicMaterial({ color: 0x9aa0a3 });
  for (const [x, z, w, d] of [[0, 17.5, 40, 0.25], [0, -17.5, 40, 0.25], [0, 0, 0.25, 30]]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), paintMat);
    p.rotation.x = -Math.PI / 2; p.position.set(x, 0.02, z);
    scene.add(p);
  }

  const geoCache = new Map();
  const matCache = new Map();
  for (const c of COLLIDERS) {
    const key = `${c.w}|${c.d}|${c.h}`;
    if (!geoCache.has(key)) geoCache.set(key, new THREE.BoxGeometry(c.w, c.h, c.d));
    if (!matCache.has(c.color)) matCache.set(c.color, new THREE.MeshLambertMaterial({ color: c.color }));
    const m = new THREE.Mesh(geoCache.get(key), matCache.get(c.color));
    m.position.set(c.x, c.h / 2, c.z);
    scene.add(m);
    if (c.kind === 'container') { // darker roof slab reads as a container lid
      const lid = new THREE.Mesh(
        new THREE.BoxGeometry(c.w * 0.96, 0.08, c.d * 0.92),
        new THREE.MeshLambertMaterial({ color: 0x2c3136 }),
      );
      lid.position.set(c.x, c.h + 0.04, c.z);
      scene.add(lid);
    }
  }

  // site markers: amber ring + translucent disc, unmistakable in shots
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(s.r - 0.35, s.r, 40),
      new THREE.MeshBasicMaterial({ color: 0xe0a32e, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2; ring.position.set(s.x, 0.03, s.z);
    scene.add(ring);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(s.r - 0.35, 40),
      new THREE.MeshBasicMaterial({ color: 0xe0a32e, transparent: true, opacity: 0.13 }),
    );
    disc.rotation.x = -Math.PI / 2; disc.position.set(s.x, 0.025, s.z);
    scene.add(disc);
  }

  // the charge: dark box with a red lamp, hidden until planted
  chargeMesh = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.35, 0.22),
    new THREE.MeshLambertMaterial({ color: 0x22262b }),
  );
  body.position.y = 0.18;
  chargeMesh.add(body);
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xff2a1a }),
  );
  lamp.position.y = 0.42; lamp.name = 'lamp';
  chargeMesh.add(lamp);
  chargeMesh.visible = false;
  scene.add(chargeMesh);
}
