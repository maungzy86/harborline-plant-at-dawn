// state.js — the single game-state object. Every module imports `S` and
// reads/writes fields on it; there are no other globals holding game truth.
// Rendering handles (three.js objects) live on the fighters themselves,
// never in here — this file stays pure data so the logic is easy to follow.

import { ECONOMY, TEAM } from './config.js';

export const PHASE = {
  FREEZE: 'freeze',   // buy window, nobody can leave spawn yards yet
  LIVE: 'live',       // round in play, charge not planted
  PLANTED: 'planted', // charge ticking, Guard must defuse or fall back
  END: 'end',         // scoreboard pause
  MATCH: 'match',     // match over screen
};

export const S = {
  phase: PHASE.FREEZE,
  phaseTime: 0,           // seconds left in the current phase
  round: 1,
  score: { guard: 0, breaker: 0 },
  winner: null,           // TEAM.* once the match is decided
  endReason: '',          // human line for the scoreboard ("Charge defused")
  lastRoundMoney: [],     // per-fighter earnings lines for the end screen

  player: null,           // the human fighter (team guard)
  fighters: [],           // everyone: player + bots
  bots: [],               // just the bots, for the AI step

  site: 'B',              // which site the Breakers picked this round
  carrier: null,          // breaker bot carrying the charge
  planted: false,
  plantPos: null,         // {x, z} of the planted charge
  plantTime: 0,           // seconds until detonation
  planting: null,         // {bot, t} while a plant channel is running
  defusing: null,         // {t, needed} while the player defuses

  // economy bookkeeping
  lossStreak: { guard: 0, breaker: 0 },

  // event queues the HUD drains each frame
  feed: [],               // kill feed lines {text, t}
  announcements: [],      // centre-screen lines {text, t}

  // per-round noise memory: last shot heard, for bot hearing
  lastShot: null,         // {x, z, team, t}
  time: 0,                // total simulated seconds (monotonic)
};

export function newFighter(team, isPlayer) {
  return {
    team, isPlayer: !!isPlayer,
    pos: { x: 0, y: 0, z: 0 },       // feet position
    vel: { x: 0, y: 0, z: 0 },
    yaw: 0, pitch: 0,
    health: 100, armour: 0,
    alive: true, onGround: true, crouch: false,
    weaponId: 'pistol',
    weapons: { pistol: { mag: 12, reserve: 60 } },
    grenades: 0, hasKit: false,
    money: ECONOMY.startMoney,
    reloadingUntil: 0, nextShotAt: 0,
    kills: 0, deaths: 0,
    mesh: null, name: isPlayer ? 'You' : '',
    // bot brain fields (unused for the player)
    brain: null,
  };
}

export function resetMatch() {
  S.round = 1;
  S.score.guard = 0; S.score.breaker = 0;
  S.winner = null;
  S.lossStreak.guard = 0; S.lossStreak.breaker = 0;
  for (const f of S.fighters) {
    f.money = ECONOMY.startMoney;
    f.kills = 0; f.deaths = 0;
    f.weapons = { pistol: { mag: 12, reserve: 60 } };
    f.weaponId = 'pistol';
    f.grenades = 0; f.hasKit = false; f.armour = 0;
  }
}

export function announce(text) {
  S.announcements.push({ text, t: 4 });
}

export function feedLine(text) {
  S.feed.push({ text, t: 6 });
  if (S.feed.length > 5) S.feed.shift();
}

export { TEAM };
