/*
  server/combat.js
  Authoritative combat mechanics, elemental variants, elite mob affixes,
  boss mechanics (telegraphs, adds, enrage), and PvP arena calculations.
*/

export const ELITE_AFFIXES = ['molten', 'swift', 'vampiric', 'armored', 'shock'];

export const ENEMY_BASE_STATS = {
  // Standard
  slime:        { hp: 46, damage: 8, speed: 44, range: 20, xp: 12, gold: 6, radius: 13, aggro: 240, color: '#4ade80' },
  goblin:       { hp: 78, damage: 13, speed: 58, range: 24, xp: 22, gold: 11, radius: 13, aggro: 290, color: '#eab308' },
  brute:        { hp: 180, damage: 24, speed: 34, range: 30, xp: 34, gold: 18, radius: 16, aggro: 320, color: '#f97316' },
  scout:        { hp: 62, damage: 10, speed: 56, range: 190, xp: 26, gold: 14, radius: 12, aggro: 340, color: '#e2e8f0' },

  // Elemental Variants
  frost_slime:  { hp: 70, damage: 12, speed: 40, range: 20, xp: 24, gold: 14, radius: 13, aggro: 260, element: 'frost', color: '#70d6ff' },
  ice_goblin:   { hp: 110, damage: 18, speed: 55, range: 28, xp: 36, gold: 20, radius: 13, aggro: 300, element: 'frost', color: '#90e0ef' },
  frost_brute:  { hp: 260, damage: 32, speed: 32, range: 32, xp: 55, gold: 30, radius: 17, aggro: 330, element: 'frost', color: '#00b4d8' },

  fire_goblin:  { hp: 130, damage: 24, speed: 64, range: 26, xp: 45, gold: 25, radius: 13, aggro: 320, element: 'fire', color: '#ff6b6b' },
  magma_brute:  { hp: 320, damage: 40, speed: 36, range: 34, xp: 70, gold: 40, radius: 18, aggro: 350, element: 'fire', color: '#c92a2a' },
  fire_scout:   { hp: 95, damage: 20, speed: 62, range: 200, xp: 48, gold: 26, radius: 12, aggro: 360, element: 'fire', color: '#f03e3e' },

  venom_slime:  { hp: 85, damage: 14, speed: 46, range: 22, xp: 28, gold: 16, radius: 13, aggro: 270, element: 'poison', color: '#51cf66' },
  swamp_scout:  { hp: 80, damage: 16, speed: 58, range: 200, xp: 38, gold: 22, radius: 12, aggro: 340, element: 'poison', color: '#2b8a3e' },
  bog_brute:    { hp: 240, damage: 28, speed: 32, range: 30, xp: 50, gold: 28, radius: 17, aggro: 320, element: 'poison', color: '#2f9e44' },

  // Mini-Bosses / Boss
  mini_boss:    { hp: 600, damage: 30, speed: 48, range: 32, xp: 200, gold: 150, radius: 19, aggro: 500, color: '#a855f7' },
  boss:         { hp: 1200, damage: 35, speed: 52, range: 38, xp: 600, gold: 450, radius: 24, aggro: 850, color: '#ef4444' }
};

export function createEnemy(id, type, x, y, multiplier = 1, isElite = false) {
  const base = ENEMY_BASE_STATS[type] || ENEMY_BASE_STATS.slime;
  const isBoss = type === 'boss' || type === 'mini_boss';
  const scale = multiplier * (isBoss ? 1.0 : 1.0);

  const affixes = [];
  if (isElite && !isBoss) {
    const roll = Math.floor(Math.random() * ELITE_AFFIXES.length);
    affixes.push(ELITE_AFFIXES[roll]);
  }

  const hp = Math.round(base.hp * scale * (isElite ? 1.6 : 1.0));
  const damage = base.damage * (isBoss ? 1.0 : multiplier) * (isElite ? 1.3 : 1.0);
  const speed = base.speed * (affixes.includes('swift') ? 1.45 : 1.0);

  return {
    id,
    type,
    x, y,
    hp,
    maxHp: hp,
    damage,
    speed,
    range: base.range,
    xpReward: Math.round(base.xp * multiplier * (isElite ? 2.5 : 1.0)),
    goldReward: Math.round(base.gold * multiplier * (isElite ? 2.5 : 1.0)),
    radius: base.radius,
    aggroRange: base.aggro,
    element: base.element || null,
    isElite,
    affixes,
    alive: true,
    deathTimer: 0,
    attackCd: Math.random() * 0.8,
    abilityTimer: 4,
    phase: 1,
    shielded: false,
    enraged: false,
    combatTimer: 0,
    slamWindup: 0,
    slamX: null,
    slamY: null,
    targetId: null,
    retarget: 0,
    flash: 0,
    slowTimer: 0,
    slowFactor: 1,
    poisonTimer: 0,
    poisonTick: 0.5,
    poisonDps: 0,
    poisonOwner: null,
    burnTimer: 0,
    burnDps: 0,
    pathTimer: 0,
    pathDir: { x: 0, y: 0 }
  };
}

export function updateBossMechanics(boss, room, dt, world) {
  if (!boss || !boss.alive) return;
  boss.combatTimer += dt;

  // Enrage after 90s: turns red, increases speed by 50% and damage by 60%
  if (boss.combatTimer > 90 && !boss.enraged) {
    boss.enraged = true;
    boss.speed *= 1.5;
    boss.damage *= 1.6;
    for (const client of room.players) {
      world.system(client, '⚠️ The Boss has ENRAGED! Damage and speed drastically increased!', '#ff4444');
    }
  }

  // Phase transitions: 66% HP and 33% HP spawn adds and shield the boss
  const hpPercent = boss.hp / boss.maxHp;

  if (boss.phase === 1 && hpPercent <= 0.66) {
    boss.phase = 2;
    boss.shielded = true;
    for (const client of room.players) {
      world.system(client, '⚔ Phase 2: Boss summons elemental guards! Defeat them to break the shield!', '#ffd75e');
    }
    // Spawn 2 elemental brutes near boss
    world.spawnEnemy(room, 'frost_brute', boss.x - 60, boss.y - 40, 1.2);
    world.spawnEnemy(room, 'fire_goblin', boss.x + 60, boss.y + 40, 1.2);
  } else if (boss.phase === 2 && hpPercent <= 0.33) {
    boss.phase = 3;
    boss.shielded = true;
    for (const client of room.players) {
      world.system(client, '⚔ Phase 3: Final Stand! The Boss calls upon shadow minions!', '#ff7675');
    }
    world.spawnEnemy(room, 'magma_brute', boss.x - 70, boss.y + 50, 1.4);
    world.spawnEnemy(room, 'swamp_scout', boss.x + 70, boss.y - 50, 1.4);
  }

  // Check if all summoned minions in the dungeon are dead to drop the shield
  if (boss.shielded) {
    const minionsAlive = [...room.enemies.values()].some(e => e.alive && e.type !== 'boss');
    if (!minionsAlive) {
      boss.shielded = false;
      for (const client of room.players) {
        world.system(client, '★ All guardians defeated! The Boss shield has shattered!', '#55efc4');
      }
    }
  }

  // Periodic telegraph attack (expanding warning ring / ground slam)
  boss.abilityTimer -= dt;
  if (boss.abilityTimer <= 0) {
    boss.abilityTimer = boss.enraged ? 3.5 : 5.0;
    // Find closest player for telegraph slam
    let target = null;
    let minDist = 9999;
    for (const p of room.players) {
      if (!p.character || !p.alive) continue;
      const d = Math.hypot(p.x - boss.x, p.y - boss.y);
      if (d < minDist) { minDist = d; target = p; }
    }

    if (target) {
      boss.slamWindup = 1.2;
      boss.slamX = target.x;
      boss.slamY = target.y;

      // Broadcast telegraph indicator to all players in the room
      for (const client of room.players) {
        world.send(client, {
          type: 'telegraph',
          x: target.x,
          y: target.y,
          radius: 80,
          duration: 1.2,
          color: '#ff3838'
        });
      }
    }
  }

  // Execute slam after windup
  if (boss.slamWindup > 0) {
    boss.slamWindup -= dt;
    if (boss.slamWindup <= 0 && boss.slamX !== null) {
      // Deal heavy damage to players caught in the radius
      for (const client of room.players) {
        if (!client.character || !client.alive) continue;
        const dist = Math.hypot(client.x - boss.slamX, client.y - boss.slamY);
        if (dist <= 80) {
          const dmg = Math.round(boss.damage * 1.8);
          world.applyDamageToPlayer(client, dmg, 'Boss Shockwave');
        }
      }
      boss.slamX = null;
      boss.slamY = null;
    }
  }
}
