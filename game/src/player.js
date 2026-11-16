// player.js — the human fighter: pointer-lock mouse look and Quake-style
// ground movement (accelerate + friction, weak air control), so stopping
// to aim is a real decision: spread in weapons.js reads speed from here.

import { PLAYER } from './config.js';
import { collide } from './world.js';

export const input = {
  keys: new Set(),
  dx: 0, dy: 0,          // accumulated mouse movement, consumed per step
  locked: false,
  fireHeld: false,
  fireClicked: false,    // edge trigger for semi-auto weapons
  reloadPressed: false,
  grenadePressed: false,
  interactHeld: false,   // E: defuse
  buyPressed: null,      // '1'..'6' during the freeze phase
};

export function initInput(el, onLock) {
  el.addEventListener('click', () => {
    if (!input.locked) el.requestPointerLock();
  });
  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === el;
    if (onLock) onLock(input.locked);
  });
  document.addEventListener('mousemove', (e) => {
    if (!input.locked) return;
    input.dx += e.movementX || 0;
    input.dy += e.movementY || 0;
  });
  document.addEventListener('mousedown', (e) => {
    if (!input.locked || e.button !== 0) return;
    if (!input.fireHeld) input.fireClicked = true;
    input.fireHeld = true;
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.fireHeld = false;
  });
  document.addEventListener('keydown', (e) => {
    input.keys.add(e.code);
    if (e.code === 'KeyR') input.reloadPressed = true;
    if (e.code === 'KeyG') input.grenadePressed = true;
    if (/^Digit[1-6]$/.test(e.code)) input.buyPressed = e.code.slice(5);
    if (e.code === 'Space') e.preventDefault();
  });
  document.addEventListener('keyup', (e) => input.keys.delete(e.code));
}

export function eyeHeight(f) {
  return f.crouch ? PLAYER.eyeCrouch : PLAYER.eyeStand;
}

// One fixed step of movement for fighter f. Bots share the physics tail
// (gravity + collide) through stepBody below.
export function stepPlayer(f, dt) {
  // mouse look: 0.0022 rad per pixel, pitch clamped to just past vertical
  f.yaw -= input.dx * 0.0022;
  f.pitch -= input.dy * 0.0022;
  f.pitch = Math.max(-1.45, Math.min(1.45, f.pitch));
  input.dx = 0; input.dy = 0;

  const k = input.keys;
  f.crouch = k.has('KeyC') || k.has('ControlLeft');
  const sprint = k.has('ShiftLeft') && !f.crouch;
  f.sprinting = sprint;

  let fwd = 0, strafe = 0;
  if (k.has('KeyW')) fwd += 1;
  if (k.has('KeyS')) fwd -= 1;
  if (k.has('KeyD')) strafe += 1;
  if (k.has('KeyA')) strafe -= 1;
  const len = Math.hypot(fwd, strafe) || 1;
  fwd /= len; strafe /= len;

  const speed = f.crouch ? PLAYER.crouchSpeed : sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  const sy = Math.sin(f.yaw), cy = Math.cos(f.yaw);
  // yaw 0 looks down -z; forward vector is (-sin yaw, -cos yaw)
  const wishX = (-sy * fwd + cy * strafe);
  const wishZ = (-cy * fwd - sy * strafe);

  accelerate(f, wishX, wishZ, speed, dt);
  if (f.onGround && k.has('Space')) {
    f.vel.y = PLAYER.jumpSpeed;
    f.onGround = false;
  }
  stepBody(f, dt);
}

export function accelerate(f, wishX, wishZ, speed, dt) {
  if (f.onGround) {
    const drag = Math.max(0, 1 - PLAYER.friction * dt);
    f.vel.x *= drag; f.vel.z *= drag;
    f.vel.x += wishX * PLAYER.accel * dt;
    f.vel.z += wishZ * PLAYER.accel * dt;
    const sp = Math.hypot(f.vel.x, f.vel.z);
    if (sp > speed) { f.vel.x *= speed / sp; f.vel.z *= speed / sp; }
  } else {
    f.vel.x += wishX * PLAYER.airAccel * dt;
    f.vel.z += wishZ * PLAYER.airAccel * dt;
  }
}

export function stepBody(f, dt) {
  f.vel.y -= PLAYER.gravity * dt;
  f.pos.x += f.vel.x * dt;
  f.pos.z += f.vel.z * dt;
  collide(f.pos, PLAYER.radius);
  f.pos.y += f.vel.y * dt;
  if (f.pos.y <= 0) { f.pos.y = 0; f.vel.y = 0; f.onGround = true; }
  else f.onGround = false;
}
