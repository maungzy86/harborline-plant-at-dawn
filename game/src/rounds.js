// rounds.js — the round state machine and everything it owns: freeze/buy,
// live, planted, end, match. Economy awards, the plant channel, the defuse,
// kill rewards and the carrier hand-off when the carrier drops all live
// here, driven one fixed step at a time from main.js.

import { WEAPONS, GRENADE, ARMOUR, DEFUSE_KIT, ECONOMY, ROUNDS, TEAM } from './config.js';
import { S, PHASE, newFighter, resetMatch, announce, feedLine } from './state.js';
import { SPAWNS, SITES, chargeMesh } from './world.js';
import { newBrain, makeBotMesh } from './bots.js';
import { setKillHandler, grenades } from './weapons.js';
import { input } from './player.js';

let SCENE = null;
const BOT_NAMES = { guard: ['Vega'], breaker: ['Rook', 'Sable', 'Orin'] };

export function initMatch(scene) {
  SCENE = scene;
  S.player = newFighter(TEAM.GUARD, true);
  S.fighters = [S.player];
  S.bots = [];
  const guardBot = newFighter(TEAM.GUARD, false);
  guardBot.name = BOT_NAMES.guard[0];
  guardBot.brain = newBrain('guard');
  S.bots.push(guardBot); S.fighters.push(guardBot);
  BOT_NAMES.breaker.forEach((name, i) => {
    const b = newFighter(TEAM.BREAKER, false);
    b.name = name;
    b.brain = newBrain(i === 0 ? 'carrier' : 'escort');
    S.bots.push(b); S.fighters.push(b);
  });
  for (const b of S.bots) {
    b.mesh = makeBotMesh(b.team);
    scene.add(b.mesh);
  }
  setKillHandler(onKill);
  resetMatch();
  startRound(1);
}

// ---------------------------------------------------------------- kills
function onKill(attacker, target, zone) {
  if (attacker && attacker.team !== target.team) {
    attacker.money = Math.min(ECONOMY.maxMoney, attacker.money + ECONOMY.killReward);
  }
  feedLine(`${attacker ? attacker.name : 'Blast'}  ▸  ${target.name}${zone === 'head' ? '  (headshot)' : ''}`);
  if (target.isPlayer) announce('You are down — spectating');
  // the charge drops with the carrier: the nearest living Breaker takes it
  if (target === S.carrier && !S.planted) {
    const next = S.bots.find((b) => b.team === TEAM.BREAKER && b.alive);
    if (next) {
      next.brain.role = 'carrier';
      S.carrier = next;
      announce('Charge dropped — a Breaker recovers it');
    }
  }
}

// ---------------------------------------------------------------- buying
export function buyItem(f, key) {
  if (S.phase !== PHASE.FREEZE) return false;
  for (const [id, w] of Object.entries(WEAPONS)) {
    if (w.buyKey !== key) continue;
    if (f.weapons[id]) { // already owned: top the reserve up instead
      const ammo = f.weapons[id];
      if (ammo.reserve >= w.reserve || f.money < 100) return false;
      f.money -= 100; ammo.reserve = w.reserve;
      return true;
    }
    if (f.money < w.price) return false;
    f.money -= w.price;
    f.weapons[id] = { mag: w.mag, reserve: w.reserve };
    f.weaponId = id;
    return true;
  }
  if (key === ARMOUR.buyKey) {
    if (f.armour >= ARMOUR.points || f.money < ARMOUR.price) return false;
    f.money -= ARMOUR.price; f.armour = ARMOUR.points;
    return true;
  }
  if (key === GRENADE.buyKey) {
    if (f.grenades >= 2 || f.money < GRENADE.price) return false;
    f.money -= GRENADE.price; f.grenades++;
    return true;
  }
  if (key === DEFUSE_KIT.buyKey) {
    if (f.team !== TEAM.GUARD || f.hasKit || f.money < DEFUSE_KIT.price) return false;
    f.money -= DEFUSE_KIT.price; f.hasKit = true;
    return true;
  }
  return false;
}

export function switchWeapon(f, key) {
  for (const [id, w] of Object.entries(WEAPONS)) {
    if (w.buyKey === key && f.weapons[id]) { f.weaponId = id; f.reloadEndsAt = 0; return; }
  }
}

// Simplified bot shopping: best primary they can afford, then armour.
// Runs at round start so bots visibly escalate across the match.
function botBuy(b) {
  const order = ['rifle', 'smg', 'shotgun'];
  for (const id of order) {
    if (b.weapons[id]) { b.weaponId = id; break; }
    if (b.money >= WEAPONS[id].price) {
      b.money -= WEAPONS[id].price;
      b.weapons[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
      b.weaponId = id;
      break;
    }
  }
  if (b.armour < ARMOUR.points && b.money >= ARMOUR.price + 300) {
    b.money -= ARMOUR.price; b.armour = ARMOUR.points;
  }
  if (b.money >= GRENADE.price + 900 && b.grenades === 0) {
    b.money -= GRENADE.price; b.grenades = 1;
  }
}

// ------------------------------------------------------------ round flow
export function startRound(n) {
  S.round = n;
  S.planted = false;
  S.planting = null;
  S.defusing = null;
  S.lastRoundMoney = [];
  if (chargeMesh) chargeMesh.visible = false;
  for (const g of grenades) SCENE && g.mesh.parent && g.mesh.parent.remove(g.mesh);
  grenades.length = 0;

  // site pick: weighted A 45% / B 55%
  S.site = Math.random() < 0.45 ? 'A' : 'B';

  const spawns = { guard: 0, breaker: 0 };
  for (const f of S.fighters) {
    const idx = spawns[f.team]++;
    const sp = SPAWNS[f.team][idx % SPAWNS[f.team].length];
    f.pos.x = sp.x; f.pos.z = sp.z; f.pos.y = 0;
    f.vel.x = 0; f.vel.y = 0; f.vel.z = 0;
    f.yaw = sp.yaw; f.pitch = 0;
    f.health = 100; f.alive = true;
    if (!f.survivedLastRound) {
      // died (or first round): back to the pistol, armour gone
      f.weapons = { pistol: { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve } };
      f.weaponId = 'pistol';
      f.armour = 0; f.grenades = 0; f.hasKit = false;
    }
    for (const ammo of Object.values(f.weapons)) {
      const w = WEAPONS[Object.keys(f.weapons).find((k) => f.weapons[k] === ammo)];
      ammo.mag = w.mag;
      ammo.reserve = Math.max(ammo.reserve, Math.floor(w.reserve / 2));
    }
    f.reloadEndsAt = 0; f.nextShotAt = 0;
    if (f.brain) {
      const role = f.team === TEAM.GUARD ? 'guard' : 'escort';
      f.brain = newBrain(role);
      botBuy(f);
    }
    f.survivedLastRound = true;
  }
  // one random living Breaker carries the charge
  const breakers = S.bots.filter((b) => b.team === TEAM.BREAKER);
  S.carrier = breakers[Math.floor(Math.random() * breakers.length)];
  S.carrier.brain.role = 'carrier';

  S.phase = PHASE.FREEZE;
  S.phaseTime = ROUNDS.freezeSeconds;
  announce(`Round ${n} — Breakers are heading for site ${S.site === 'A' ? 'A' : 'B'}? Hold both.`);
}

function endRound(winner, reason, objective) {
  const loser = winner === TEAM.GUARD ? TEAM.BREAKER : TEAM.GUARD;
  S.score[winner]++;
  S.endReason = reason;
  const winPay = objective ? ECONOMY.winObjective : ECONOMY.winElimination;
  const lossPay = ECONOMY.lossBase + Math.min(ECONOMY.lossStepMax, ECONOMY.lossStep * S.lossStreak[loser]);
  S.lossStreak[winner] = 0;
  S.lossStreak[loser]++;
  for (const f of S.fighters) {
    const pay = f.team === winner ? winPay : lossPay;
    f.money = Math.min(ECONOMY.maxMoney, f.money + pay);
    S.lastRoundMoney.push(`${f.name}: +$${pay.toLocaleString('en-US')}`);
    f.survivedLastRound = f.alive;
  }
  if (S.score[winner] >= ROUNDS.winsNeeded) S.winner = winner;
  S.phase = PHASE.END;
  S.phaseTime = ROUNDS.endSeconds;
  announce(reason);
}

const teamAlive = (team) => S.fighters.some((f) => f.team === team && f.alive);
const atSite = (f, site) => Math.hypot(f.pos.x - site.x, f.pos.z - site.z) < site.r - 0.8;

// -------------------------------------------------------------- stepping
export function stepRounds(dt) {
  S.phaseTime -= dt;
  const p = S.player;

  if (S.phase === PHASE.FREEZE) {
    // buy keys work for the player only during the freeze
    if (input.buyPressed) { buyItem(p, input.buyPressed); input.buyPressed = null; }
    // spawn-yard barriers: nobody leaves home during the buy phase
    if (p.alive) {
      p.pos.x = Math.max(-31, Math.min(-13, p.pos.x));
      p.pos.z = Math.max(5, Math.min(23, p.pos.z));
    }
    if (S.phaseTime <= 0) {
      S.phase = PHASE.LIVE;
      S.phaseTime = ROUNDS.liveSeconds;
      announce('Round live');
    }
    return;
  }
  if (input.buyPressed) { switchWeapon(p, input.buyPressed); input.buyPressed = null; }

  if (S.phase === PHASE.LIVE) {
    // plant channel
    const c = S.carrier;
    if (c && c.alive && atSite(c, SITES[S.site])) {
      if (!S.planting) S.planting = { bot: c, t: 0 };
      S.planting.t += dt;
      if (S.planting.t >= ROUNDS.plantSeconds) {
        S.planted = true;
        S.plantPos = { x: SITES[S.site].x, z: SITES[S.site].z };
        S.plantTime = ROUNDS.chargeSeconds;
        S.planting = null;
        c.money = Math.min(ECONOMY.maxMoney, c.money + ECONOMY.plantReward);
        if (chargeMesh) {
          chargeMesh.position.set(S.plantPos.x, 0, S.plantPos.z);
          chargeMesh.visible = true;
        }
        S.phase = PHASE.PLANTED;
        announce('Charge planted — defuse it!');
      }
    } else {
      S.planting = null;
    }
    if (S.phase !== PHASE.LIVE) return;
    if (!teamAlive(TEAM.BREAKER)) return endRound(TEAM.GUARD, 'Breakers eliminated', false);
    if (!teamAlive(TEAM.GUARD)) return endRound(TEAM.BREAKER, 'Guard eliminated', false);
    if (S.phaseTime <= 0) return endRound(TEAM.GUARD, 'Time expired — site held', false);
    return;
  }

  if (S.phase === PHASE.PLANTED) {
    S.plantTime -= dt;
    // defuse: the player's job, E held inside arm's reach, damage resets it
    const needed = p.hasKit ? ROUNDS.defuseKitSeconds : ROUNDS.defuseSeconds;
    const inReach = p.alive && S.plantPos &&
      Math.hypot(p.pos.x - S.plantPos.x, p.pos.z - S.plantPos.z) < 2.2;
    if (inReach && input.keys.has('KeyE')) {
      if (!S.defusing) S.defusing = { t: 0 };
      if (p.lastHitAt && S.time - p.lastHitAt < 0.15) S.defusing.t = 0;
      S.defusing.t += dt;
      S.defusing.needed = needed;
      if (S.defusing.t >= needed) {
        S.defusing = null;
        if (chargeMesh) chargeMesh.visible = false;
        return endRound(TEAM.GUARD, 'Charge defused', true);
      }
    } else {
      S.defusing = null;
    }
    // with every Guard down nobody can defuse: call it now, not in 40 s
    if (!teamAlive(TEAM.GUARD)) return endRound(TEAM.BREAKER, 'Guard eliminated — charge detonates', true);
    if (S.plantTime <= 0) {
      if (chargeMesh) chargeMesh.visible = false;
      return endRound(TEAM.BREAKER, 'Detonation at site ' + S.site, true);
    }
    return;
  }

  if (S.phase === PHASE.END) {
    if (S.phaseTime <= 0) {
      if (S.winner) { S.phase = PHASE.MATCH; }
      else startRound(S.round + 1);
    }
    return;
  }
}
