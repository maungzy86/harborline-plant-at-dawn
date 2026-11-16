// config.js — every balance number for Harborline lives in this one file.
// Weapons, economy, round timing, bot tuning: if a designer wants to change
// how the game feels, this is the only module they should have to open.
// Nothing here imports anything; the other modules read these tables.

// ---------------------------------------------------------------- weapons
// damage is per hit (shotgun: per pellet), headshot multiplies it, legs pay
// 0.75x. falloffStart: beyond this range SMG/shotgun damage fades to 40%.
export const WEAPONS = {
  pistol: {
    name: 'P9 Sidearm', price: 0, damage: 22, headshot: 2.0,
    rpm: 300, auto: false, mag: 12, reserve: 60,
    spreadBase: 0.006, spreadMove: 0.020, pellets: 1,
    falloffStart: 999, reloadMs: 1100, buyKey: null,
  },
  rifle: {
    name: 'RK-7 Carbine', price: 2700, damage: 34, headshot: 2.5,
    rpm: 600, auto: true, mag: 30, reserve: 90,
    spreadBase: 0.004, spreadMove: 0.030, pellets: 1,
    falloffStart: 999, reloadMs: 2100, buyKey: '3',
  },
  smg: {
    name: 'Kestrel-9', price: 1500, damage: 24, headshot: 1.8,
    rpm: 900, auto: true, mag: 32, reserve: 96,
    spreadBase: 0.010, spreadMove: 0.018, pellets: 1,
    falloffStart: 25, reloadMs: 1800, buyKey: '2',
  },
  shotgun: {
    name: 'Dockhand 12', price: 1100, damage: 12, headshot: 1.5,
    rpm: 70, auto: false, mag: 6, reserve: 24,
    spreadBase: 0.045, spreadMove: 0.030, pellets: 8,
    falloffStart: 12, reloadMs: 2600, buyKey: '1',
  },
};

// The frag grenade: thrown in an arc, bounces, 1.6 s fuse, radial damage
// checked against line of sight so cover genuinely protects you.
export const GRENADE = {
  price: 300, buyKey: '5', fuse: 1.6, radius: 5,
  damageMin: 10, damageMax: 85, throwSpeed: 17, gravity: 18,
};

export const ARMOUR = { price: 650, buyKey: '4', points: 100, absorb: 0.5 };
export const DEFUSE_KIT = { price: 400, buyKey: '6' };

// ---------------------------------------------------------------- economy
export const ECONOMY = {
  startMoney: 800,
  winElimination: 1400,   // round won by wiping the other team
  winObjective: 1650,     // detonation (Breakers) or defuse (Guard)
  lossBase: 1100,         // plus lossStep per consecutive loss, capped
  lossStep: 150,
  lossStepMax: 450,
  killReward: 150,
  plantReward: 250,       // paid to the planter personally, win or lose
  maxMoney: 16000,
};

// ----------------------------------------------------------------- rounds
export const ROUNDS = {
  freezeSeconds: 12,      // buy phase
  liveSeconds: 100,       // round clock before the charge is planted
  endSeconds: 4,          // scoreboard pause between rounds
  winsNeeded: 3,          // best of five
  plantSeconds: 3.5,      // channel time to plant
  chargeSeconds: 40,      // planted charge countdown to detonation
  defuseSeconds: 10,      // 5 with the defuse kit
  defuseKitSeconds: 5,
};

// ------------------------------------------------------------------- bots
export const BOTS = {
  visionRange: 28,        // metres
  visionCos: 0.5,         // cos(60deg): a 120deg total cone, forgiving
  reactionMin: 0.25,      // seconds between seeing you and first burst
  reactionMax: 0.45,
  hearingGunshot: 22,     // metres: your shots give you away
  hearingSprint: 10,      // metres: sprinting footsteps
  memorySeconds: 4,       // last-known-position lifetime
  burstMin: 3,
  burstMax: 5,
  health: 100,
};

// ---------------------------------------------------------------- player
export const PLAYER = {
  health: 100,
  walkSpeed: 4.3,
  sprintSpeed: 6.4,
  crouchSpeed: 2.2,
  accel: 40,
  airAccel: 6,
  friction: 10,
  jumpSpeed: 4.6,
  gravity: 13,
  eyeStand: 1.62,
  eyeCrouch: 1.05,
  radius: 0.38,
};

// ------------------------------------------------------------------- misc
export const FIXED_DT = 1 / 60;         // simulation step; rendering is free
export const TEAM = { GUARD: 'guard', BREAKER: 'breaker' };
