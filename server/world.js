/*
  server/world.js
  The authoritative game world.
  Refactored into clean ES modules:
    - items.js (6 equipment slots, drops, shops, relics)
    - classes.js (6 classes, skill configs, specs, talents)
    - zones.js (8 zones: village, forest, cave, desert, frost_cave, volcano, swamp, arena, dungeon)
    - combat.js (elemental variants, elite affixes, boss mechanics & telegraphs, PvP)
    - achievements.js (milestones, tracking, rewards)
    - daily.js (daily bounties, seeded daily quests)
    - leaderboards.js (rankings for level, gold, boss, pvp)
    - trade.js (real-time player-to-player trading)
    - pets.js (pet companion leveling, stats & skills)
*/

import {
  VALID_EQUIP_SLOTS, ALL_ITEM_SLOTS, RARITY, ROLE_ITEM_ART, ROLE_ITEM_DEFS,
  makeItem, weaponClassFor, itemCanEquip, starterItems, roleItem,
  randomShopItem, makeShopStock, generateMonsterDrop, normalizeItem,
  compactInventory, teleportScroll
} from './items.js';

import {
  CLASS_DATA, SKILLS, TALENT_IDS, SPECIALIZATIONS, SPEC_MODS
} from './classes.js';

import {
  TILE, TILE_ID, BLOCKED_TILES, ZONE_SPAWN, PORTAL_DEFS,
  ZONE_ENEMY_COUNTS, ZONE_MUL, NPC_DEFS, VILLAGE_NPC_DEFS,
  DUNGEON_SPAWN, DUNGEON_BOSS, generateZone, generateDungeon, mulberry32
} from './zones.js';

import {
  ENEMY_BASE_STATS, createEnemy, updateBossMechanics
} from './combat.js';

import {
  ACHIEVEMENTS, normalizeAchievements, updateAchievementProgress, claimAchievementReward
} from './achievements.js';

import {
  getDailyQuestsForDate, normalizeDailyQuests, updateDailyProgress, claimDailyReward
} from './daily.js';

import { LeaderboardManager } from './leaderboards.js';
import { TradeManager } from './trade.js';

import {
  PET_TYPES, freshPet, normalizePet, addPetXp, getPetAuraStats
} from './pets.js';

// Re-export for compatibility
export {
  VALID_EQUIP_SLOTS, CLASS_DATA, SKILLS, ZONE_SPAWN, PORTAL_DEFS,
  makeItem, starterItems, normalizeItem, compactInventory
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angleDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
function rand(a, b) { return a + Math.random() * (b - a); }
function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
const lerp = (a, b, t) => a + (b - a) * t;
const round = (v, d = 2) => { const f = 10 ** d; return Math.round(v * f) / f; };
// Projectiles collide with the same solid tiles as the client. This used to
// reference an undefined name, which threw every tick and stopped state sync.
const PROJECTILE_BLOCKED_TILES = new Set(BLOCKED_TILES);
const EMOTES = ['Hi!', 'GG!', '^^', 'LOL', 'Thanks!', 'Boss soon?', '<3', 'Zzz'];
const EFFECT_COLORS = {
  flame: '#ff8c42', frost: '#9ce7ff', void: '#c98bff', thunder: '#ffe45e'
};

function normalizeSkillRanks(ranks) {
  return Array.from({ length: 4 }, (_, i) => clamp(Number(ranks && ranks[i]) || 1, 1, 5));
}

function sameConsumableStack(a, b) {
  return !!a && !!b && a.slot === 'consumable' && b.slot === 'consumable' &&
    a.name === b.name && a.rarity === b.rarity && a.heal === b.heal &&
    (a.mana || 0) === (b.mana || 0) &&
    (a.teleportTo || null) === (b.teleportTo || null);
}

function itemSellValue(item) {
  const unitValue = Math.max(1, Math.floor((Number(item && item.price) || 1) * 0.5));
  const quantity = item && item.slot === 'consumable' ? clamp(Math.floor(Number(item.quantity) || 1), 1, 99) : 1;
  return unitValue * quantity;
}

function freshQuest() {
  return { stage: 1, active: false, kills: 0, herbs: 0, goblins: 0, ore: 0, scouts: 0, essence: 0, complete: false, claimed: false };
}

function normalizeQuestProgress(savedQuest) {
  const quest = { ...freshQuest(), ...(savedQuest && typeof savedQuest === 'object' ? savedQuest : {}) };
  if (!Object.hasOwn(savedQuest || {}, 'stage') && quest.claimed) {
    Object.assign(quest, { stage: 2, active: false, kills: 0, herbs: 0, goblins: 0, ore: 0, scouts: 0, essence: 0, complete: false, claimed: false });
  } else if (quest.stage === 2 && quest.claimed) {
    Object.assign(quest, { stage: 3, active: false, scouts: 0, essence: 0, complete: false, claimed: false });
  }
  quest.stage = clamp(Math.floor(Number(quest.stage) || 1), 1, 3);
  quest.scouts = Math.max(0, Number(quest.scouts) || 0);
  quest.essence = Math.max(0, Number(quest.essence) || 0);
  return quest;
}

export function freshCharacter(username, classId = 'swordsman') {
  const safeClass = CLASS_DATA[classId] ? classId : 'swordsman';
  const starter = starterItems(safeClass);
  const base = CLASS_DATA[safeClass];
  return {
    name: String(username || 'Hero').slice(0, 14),
    username: String(username || 'Hero').slice(0, 24),
    classId: safeClass,
    title: 'Apprentice',
    level: 1,
    xp: 0,
    xpNext: 80,
    gold: 50,
    hp: base.maxHp,
    mp: base.mana,
    skillPoints: 0,
    skillRanks: [1, 1, 1, 1],
    inventory: starter.inventory,
    equipment: starter.equipment,
    quest: freshQuest(),
    achievements: normalizeAchievements(),
    dailyQuests: normalizeDailyQuests(),
    pet: freshPet('wolf'),
    pvpWins: 0,
    pvpLosses: 0,
    pvpRating: 1000,
    bossDefeated: false,
    bossKills: 0,
    zoneId: 'village',
    x: ZONE_SPAWN.village.x,
    y: ZONE_SPAWN.village.y,
    materials: { herb: 0, ore: 0, essence: 0 },
    talents: Object.fromEntries(TALENT_IDS.map(id => [id, 0])),
    spec: null,
    shopStock: makeShopStock(safeClass),
    playTime: 0,
    savedAt: Date.now()
  };
}

export class World {
  constructor(db) {
    this.db = db;
    this.clients = new Set();
    this.rooms = new Map();

    this.nextPlayerId = 1;
    this.nextEnemyId = 1;
    this.nextProjectileId = 1;
    this.nextPickupId = 1;
    this.nextDungeonId = 1;

    this.tickCount = 0;
    this.timer = null;

    // Public rooms always exist. Dungeons are created on demand.
    this.leaderboards = new LeaderboardManager(this.db);
    this.trades = new TradeManager(this);
    for (const id of ['forest', 'cave', 'desert', 'village', 'frost_cave', 'volcano', 'swamp', 'arena']) {
      this.rooms.set(id, this.makePublicRoom(id));
    }
  }

  // ---------- Room setup ----------

  makePublicRoom(id) {
    const zone = generateZone(id);
    const room = {
      id,
      zoneId: id,
      public: true,
      w: zone.w,
      h: zone.h,
      tiles: zone.tiles,
      portals: PORTAL_DEFS[id].map(p => ({ ...p, arrive: { ...p.arrive } })),
      npcs: id === 'forest' ? NPC_DEFS.map(n => ({ ...n }))
        : id === 'village' ? VILLAGE_NPC_DEFS.map(n => ({ ...n })) : [],
      players: new Set(),
      enemies: new Map(),
      projectiles: new Map(),
      pickups: new Map(),
      meteors: [],
      specialPoints: [
        ZONE_SPAWN[id],
        ...PORTAL_DEFS[id].map(p => p.arrive),
        ...PORTAL_DEFS[id]
      ],
      rng: mulberry32(id === 'forest' ? 9001 : id === 'cave' ? 9002 : 9003),
      spawnTimer: 1.5
    };
    if (id === 'forest') room.specialPoints.push(...NPC_DEFS);
    if (id === 'village') room.specialPoints.push(...VILLAGE_NPC_DEFS);
    if (id === 'cave') room.specialPoints.push({ x: 1560, y: 1120 });

    const counts = ZONE_ENEMY_COUNTS[id];
    const spawn = ZONE_SPAWN[id];
    for (const [type, count] of Object.entries(counts)) {
      const nearCount = Math.min(count, type === 'goblin' ? 2 : 4);
      for (let i = 0; i < count; i++) {
        const p = i < nearCount
          ? this.randomNearPoint(room, spawn.x, spawn.y, 220, 480)
          : this.randomFreePoint(room);
        this.spawnEnemy(room, type, p.x, p.y, ZONE_MUL[id]);
      }
    }
    return room;
  }

  makeDungeonRoom(partyIds) {
    const zone = generateDungeon();
    const id = `dungeon_${this.nextDungeonId++}`;
    const room = {
      id,
      zoneId: 'cave',
      public: false,
      w: zone.w,
      h: zone.h,
      tiles: zone.tiles,
      portals: [{
        x: DUNGEON_SPAWN.x,
        y: DUNGEON_SPAWN.y - TILE,
        to: 'forest',
        label: 'Exit Dungeon',
        color: '#ffd75e',
        arrive: { x: 520, y: 420 }
      }],
      npcs: [],
      players: new Set(),
      enemies: new Map(),
      projectiles: new Map(),
      pickups: new Map(),
      meteors: [],
      specialPoints: [DUNGEON_SPAWN, DUNGEON_BOSS],
      partyIds: new Set(partyIds),
      rng: mulberry32(7000 + this.nextDungeonId)
    };
    this.spawnEnemy(room, 'boss', DUNGEON_BOSS.x, DUNGEON_BOSS.y, 1);
    this.rooms.set(id, room);
    return room;
  }

  randomFreePoint(room) {
    for (let i = 0; i < 200; i++) {
      const x = rand(80, room.w * TILE - 80);
      const y = rand(80, room.h * TILE - 80);
      if (this.tileAt(room, x, y) === undefined) continue;
      if (BLOCKED_TILES.has(this.tileAt(room, x, y))) continue;
      let nearSpecial = false;
      for (const p of room.specialPoints) {
        if (Math.hypot(p.x - x, p.y - y) < 190) { nearSpecial = true; break; }
      }
      if (nearSpecial) continue;
      return { x, y };
    }
    const fallback = room.public ? ZONE_SPAWN[room.zoneId] : DUNGEON_SPAWN;
    return { x: fallback.x + rand(-100, 100), y: fallback.y + rand(-100, 100) };
  }

  randomNearPoint(room, cx, cy, minDist = 220, maxDist = 480) {
    for (let i = 0; i < 120; i++) {
      const a = rand(0, Math.PI * 2);
      const d = rand(minDist, maxDist);
      const x = clamp(cx + Math.cos(a) * d, 40, room.w * TILE - 40);
      const y = clamp(cy + Math.sin(a) * d, 40, room.h * TILE - 40);
      if (this.isBlocked(room, x, y, 16)) continue;
      let nearSpecial = false;
      for (const p of room.specialPoints) {
        if (Math.hypot(p.x - x, p.y - y) < 110) { nearSpecial = true; break; }
      }
      if (nearSpecial) continue;
      return { x, y };
    }
    return this.randomFreePoint(room);
  }

  maintainEnemyPopulation(room, dt) {
    room.spawnTimer = (Number.isFinite(room.spawnTimer) ? room.spawnTimer : 2) - dt;
    if (room.spawnTimer > 0) return;
    room.spawnTimer = 1.6;
    const counts = ZONE_ENEMY_COUNTS[room.zoneId];
    if (!counts) return;

    let cx = ZONE_SPAWN[room.zoneId].x;
    let cy = ZONE_SPAWN[room.zoneId].y;
    if (room.players.size) {
      let sx = 0;
      let sy = 0;
      for (const player of room.players) { sx += player.x; sy += player.y; }
      cx = sx / room.players.size;
      cy = sy / room.players.size;
    }

    for (const [type, target] of Object.entries(counts)) {
      const alive = [...room.enemies.values()].filter(e => e.alive && e.type === type).length;
      const missing = target - alive;
      if (missing <= 0) continue;
      for (let i = 0; i < Math.min(missing, 2); i++) {
        const p = this.randomNearPoint(room, cx, cy, 220, 520);
        let tooClose = false;
        for (const player of room.players) {
          if (Math.hypot(player.x - p.x, player.y - p.y) < 180) { tooClose = true; break; }
        }
        if (tooClose) continue;
        this.spawnEnemy(room, type, p.x, p.y, ZONE_MUL[room.zoneId]);
        this.eventRoom(room, 'fx', {
          visual: 'spawn', x: p.x, y: p.y, type,
          color: type === 'goblin' ? '#8fd66c' : '#7bdcff'
        });
      }
    }
  }

  // ---------- Connection lifecycle ----------

  attach(client) {
    this.clients.add(client);
    client.id = this.nextPlayerId++;
    client.player = null;
    client.roomId = null;
    client.party = new Set();
    client.partyLeaderId = null;
    client.lastInput = { dx: 0, dy: 0, aimX: null, aimY: null, lockTargetId: null };
    client.lastInputAt = 0;
    client.lockTargetId = null;
    client.facing = 0;
    client.aim = 0;
    client.attackCd = 0;
    client.skillCd = [0, 0, 0, 0];
    client.skillAnim = 0;
    client.skillAnimColor = '#fff';
    client.skillAnimName = '';
    client.shieldTime = 0;
    client.invuln = 0;
    client.hasteTime = 0;
    client.familiarTime = 0;
    client.familiarCd = 0;
    client.petAttackCd = 0;
    client.petSkillCd = 5;
    client.dashTime = 0;
    client.dashDir = 0;
    client.stamina = 100;
    client.emote = null;
    client.inCombat = 0;
    client.respawn = 0;
    client.alive = true;
  }

  detach(client) {
    if (this.trades) this.trades.handleDisconnect(client);
    // Remove from the room first so nobody sees a ghost player.
    if (client.roomId) {
      const room = this.rooms.get(client.roomId);
      if (room) room.players.delete(client);
      this.cleanupEmptyDungeon(room);
    }

    // Remove the disconnecting player and promote someone if they led the group.
    this.removePartyMember(client, false);

    this.clients.delete(client);
    this.saveClient(client, false);
  }

  hydrate(client) {
    const character = client.character;
    if (!character) return;
    const classId = CLASS_DATA[character.classId] ? character.classId : 'swordsman';
    character.classId = classId;
    character.inventory = compactInventory((Array.isArray(character.inventory) ? character.inventory : [])
      .map(item => normalizeItem(item, classId)).filter(Boolean));
    character.equipment = character.equipment || {};
    for (const slot of VALID_EQUIP_SLOTS) {
      character.equipment[slot] = normalizeItem(character.equipment[slot], classId);
    }
    character.achievements = normalizeAchievements(character.achievements);
    character.dailyQuests = normalizeDailyQuests(character.dailyQuests);
    character.pet = normalizePet(character.pet || freshPet('wolf'));
    character.pvpWins = Number(character.pvpWins) || 0;
    character.pvpLosses = Number(character.pvpLosses) || 0;
    character.pvpRating = Number(character.pvpRating) || 1000;
    character.title = character.title || 'Apprentice';
    character.skillRanks = normalizeSkillRanks(character.skillRanks);
    character.shopStock = (Array.isArray(character.shopStock) ? character.shopStock : makeShopStock(classId))
      .map(item => normalizeItem(item, classId)).filter(Boolean);
    const savedQuest = character.quest && typeof character.quest === 'object' ? character.quest : {};
    character.quest = normalizeQuestProgress(savedQuest);
    const stats = this.statsFor(client);
    client.maxHp = stats.maxHp;
    client.maxMp = stats.maxMp;
    const savedHp = Number(character.hp);
    const savedMp = Number(character.mp);
    client.hp = clamp(Number.isFinite(savedHp) ? savedHp : stats.maxHp, 1, stats.maxHp);
    client.mp = clamp(Number.isFinite(savedMp) ? savedMp : stats.maxMp, 0, stats.maxMp);
    client.stamina = 100;
    client.alive = true;
  }

  join(client) {
    if (!client.character) { this.error(client, 'You must register or login first.'); return; }
    if (client.roomId) { this.sendInit(client); return; }

    this.hydrate(client);

    const wanted = client.character.zoneId;
    let room = this.rooms.get(wanted);
    if (!room || !room.public) room = this.rooms.get('forest');

    const spawn = room.public ? ZONE_SPAWN[room.zoneId] : DUNGEON_SPAWN;
    const sx = Number(client.character.x);
    const sy = Number(client.character.y);
    let x = Number.isFinite(sx) ? sx : spawn.x;
    let y = Number.isFinite(sy) ? sy : spawn.y;
    if (this.isBlocked(room, x, y, 12)) { x = spawn.x; y = spawn.y; }

    client.x = x;
    client.y = y;
    client.roomId = room.id;
    client.player = { id: client.id }; // simple marker used by the handler guard
    room.players.add(client);

    this.sendInit(client, room);
    this.sendCharacter(client);
    this.system(client, `Welcome to ${room.public ? room.zoneId : 'the dungeon'}, ${client.character.name}!`, '#8ee6ff');
    console.log(`[world] ${client.character.name} joined ${room.id}`);
  }

  sendInit(client, room = this.rooms.get(client.roomId)) {
    if (!room) return;
    client.roomId = room.id;
    this.send(client, {
      type: 'init',
      roomId: room.id,
      zoneId: room.zoneId,
      tiles: Array.from(room.tiles),
      w: room.w,
      h: room.h,
      portals: room.portals.map(p => ({ ...p, arrive: { ...p.arrive } }))
    });
  }

  // ---------- Basic messaging ----------

  send(client, message) {
    if (client && client.ws && !client.ws.closed) client.ws.send(message);
  }

  sendRoom(room, message, except = null) {
    if (!room) return;
    for (const client of room.players) if (client !== except) this.send(client, message);
  }

  sendAll(message) {
    for (const client of this.clients) this.send(client, message);
  }

  event(client, kind, data = {}) {
    this.send(client, { type: 'event', kind, ...data });
  }

  eventRoom(room, kind, data = {}, except = null) {
    this.sendRoom(room, { type: 'event', kind, ...data }, except);
  }

  system(client, text, color = '#c9a6ff') {
    this.event(client, 'system', { text, color });
  }

  error(client, message) {
    this.send(client, { type: 'error', message: String(message) });
  }

  sfx(client, name) { this.event(client, 'sfx', { name }); }
  sfxRoom(room, name) { this.eventRoom(room, 'sfx', { name }); }

  // ---------- Character / stats ----------

  statsFor(client) {
    const character = client.character || {};
    const classId = CLASS_DATA[character.classId] ? character.classId : 'swordsman';
    const base = CLASS_DATA[classId];
    const level = Math.max(1, Number(character.level) || 1);
    const lv = level - 1;
    const equipment = character.equipment || {};
    const eq = key => VALID_EQUIP_SLOTS.reduce((sum, slot) => {
      const it = equipment[slot];
      return sum + Number((it && itemCanEquip(it, classId) && it.stats && it.stats[key]) || 0);
    }, 0);
    const petAura = getPetAuraStats(character.pet);
    const talents = character.talents || {};
    const talent = id => clamp(Number(talents[id]) || 0, 0, 3);
    const spec = character.spec || null;
    const specMods = SPEC_MODS[spec] || { hp: 0, mp: 0, attack: 0, defense: 0, speed: 0, range: 0, crit: 0, cd: 1, taken: 1 };
    const hpPerLevel = base.hpGrowth || (classId === 'swordsman' ? 14 : 9);
    return {
      maxHp: Math.round(base.maxHp + lv * hpPerLevel + eq('hp') + (petAura.hp || 0) + talent('vigor') * 12 + specMods.hp),
      maxMp: Math.round(base.mana + lv * 5 + eq('mana') + (petAura.mana || 0) + talent('focus') * 5 + (specMods.mp || 0)),
      attack: round(base.attack + lv * 3 + eq('attack') + (petAura.attack || 0) + Math.round(base.attack * 0.04 * talent('power')) + specMods.attack, 2),
      speed: clamp(base.speed + lv * 1.2 + eq('speed') + (petAura.speed || 0) + specMods.speed, 60, 220),
      range: base.range + eq('range') + (petAura.range || 0) + specMods.range,
      defense: round(Math.max(0, base.defense + lv * 0.6 + eq('defense') + (petAura.defense || 0) + talent('guard') * 2 + specMods.defense), 2),
      crit: round(0.10 + eq('crit') + (petAura.crit || 0) + talent('crit') * 0.03 + specMods.crit, 3),
      manaRegen: round(base.manaRegen + level * 0.3 + eq('manaRegen') + (petAura.manaRegen || 0) + talent('focus') * 0.5 + (specMods.manaRegen || 0), 2),
      cooldownMult: round((1 - talent('haste') * 0.04) * specMods.cd, 3),
      damageTakenMult: round((1 - talent('guard') * 0.04) * specMods.taken, 3)
    };
  }

  syncVitals(client) {
    if (!client.character) return;
    const stats = this.statsFor(client);
    client.maxHp = stats.maxHp;
    client.maxMp = stats.maxMp;
    client.hp = clamp(client.hp, 0, stats.maxHp);
    client.mp = clamp(client.mp, 0, stats.maxMp);
  }

  // Copy runtime values into the save blob, then send it to the browser.
  sendCharacter(client) {
    if (!client.character) return;
    const character = client.character;
    character.hp = Math.round(client.hp);
    character.mp = Math.round(client.mp);
    if (Number.isFinite(client.x)) character.x = round(client.x, 2);
    if (Number.isFinite(client.y)) character.y = round(client.y, 2);
    const room = this.rooms.get(client.roomId);
    if (room) character.zoneId = room.public ? room.zoneId : 'forest';
    // This is the authoritative room player id, used by the client to tell
    // its own snapshot from other players' snapshots.
    character.playerId = client.id;
    this.syncVitals(client);
    this.send(client, { type: 'character', character });
  }

  saveClient(client, announce = false) {
    if (!client || !client.accountId || !client.character) return;
    const character = client.character;
    character.hp = Math.round(client.hp);
    character.mp = Math.round(client.mp);
    if (Number.isFinite(client.x)) character.x = round(client.x, 2);
    if (Number.isFinite(client.y)) character.y = round(client.y, 2);
    character.savedAt = Date.now();
    try {
      this.db.saveCharacter(client.accountId, character);
      if (announce) this.system(client, 'Character saved to the cloud.', '#8ee6ff');
    } catch (err) {
      console.error('[world] save failed:', err.message);
      this.error(client, 'Could not save your character.');
    }
  }

  saveAll() {
    for (const client of this.clients) this.saveClient(client, false);
  }

  playerSnapshot(client) {
    const character = client.character;
    const stats = this.statsFor(client);
    const equipment = character.equipment || {};
    const glow = Math.max(...VALID_EQUIP_SLOTS.map(s => Number(equipment[s] && equipment[s].enchant) || 0));

    return {
      id: client.id,
      name: character.name,
      username: character.username || character.name,
      classId: character.classId,
      title: character.title || 'Apprentice',
      pet: character.pet || null,
      pvpRating: character.pvpRating || 1000,
      equipment: character.equipment,
      x: round(client.x, 1),
      y: round(client.y, 1),
      hp: Math.round(client.hp),
      maxHp: stats.maxHp,
      mp: Math.round(client.mp),
      maxMp: stats.maxMp,
      level: character.level,
      gold: character.gold,
      xp: character.xp,
      xpNext: character.xpNext,
      facing: round(client.facing, 3),
      aim: round(client.aim, 3),
      emote: client.emote ? { text: client.emote.text, time: round(client.emote.time, 2) } : null,
      party: client.party.size > 0,
      partyMembers: [...client.party].map(member => member.id),
      partyLeaderId: client.partyLeaderId,
      stats: {
        attack: stats.attack,
        speed: round(stats.speed, 1),
        range: stats.range,
        defense: stats.defense,
        crit: stats.crit,
        manaRegen: stats.manaRegen
      },
      skillCd: client.skillCd.map(v => round(v, 2)),
      skillAnim: round(client.skillAnim, 2),
      skillAnimColor: client.skillAnimColor,
      skillAnimName: client.skillAnimName,
      hasteTime: round(client.hasteTime || 0, 2),
      familiarTime: round(client.familiarTime || 0, 2),
      shieldTime: round(client.shieldTime || 0, 2),
      invuln: round(client.invuln || 0, 2),
      dashTime: round(client.dashTime || 0, 2),
      dashDir: round(client.dashDir || 0, 3),
      spec: character.spec || null,
      enchantGlow: glow > 0
    };
  }

  buildState(room) {
    return {
      type: 'state',
      players: [...room.players].filter(c => c.character).map(c => this.playerSnapshot(c)),
      enemies: [...room.enemies.values()].filter(e => e.alive || e.deathTimer > 0).map(e => ({
        id: e.id,
        type: e.type,
        x: round(e.x, 1),
        y: round(e.y, 1),
        hp: Math.max(0, Math.round(e.hp)),
        maxHp: e.maxHp,
        phase: e.phase || 1,
        slamWindup: round(e.slamWindup || 0, 2),
        slamX: Number.isFinite(e.slamX) ? round(e.slamX, 1) : null,
        slamY: Number.isFinite(e.slamY) ? round(e.slamY, 1) : null,
        alive: !!e.alive,
        radius: e.radius
      })),
      projectiles: [...room.projectiles.values()].map(p => ({
        id: p.id,
        kind: p.kind,
        x: round(p.x, 1),
        y: round(p.y, 1),
        vx: round(p.vx, 1),
        vy: round(p.vy, 1),
        team: p.team,
        radius: p.radius
      })),
      pickups: [...room.pickups.values()].filter(p => !p.collected).map(p => ({
        id: p.id,
        kind: p.kind,
        x: round(p.x, 1),
        y: round(p.y, 1),
        amount: p.amount,
        material: p.material || null,
        item: p.item || null,
        ownerIds: p.kind === 'chest' ? p.ownerIds : undefined,
        openedBy: p.kind === 'chest' ? p.openedBy : undefined,
        age: round(p.age, 2)
      })),
      portals: room.portals.map(p => ({ ...p }))
    };
  }

  // ---------- The main loop ----------

  start() {
    if (this.timer) return;
    // 30 Hz is the stable sweet spot here. A 60 Hz loop made the server fall
    // behind and actually lowered the snapshot rate on slower machines.
    this.timer = setInterval(() => {
      try { this.tick(); } catch (err) { console.error('[world] tick error:', err); }
    }, 1000 / 30);
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  tick() {
    this.tickCount++;
    const now = Date.now();
    const dt = 1 / 30;

    for (const client of this.clients) {
      if (client.roomId && client.player) this.updatePlayer(client, dt, now);
    }

    for (const [id, room] of this.rooms) {
      // Dungeons disappear when the last party member leaves.
      if (!room.public && room.players.size === 0) { this.rooms.delete(id); continue; }

      this.updateEnemies(room, dt, now);
      this.updateProjectiles(room, dt);
      this.updatePickups(room, dt);
      this.updateMeteors(room, dt);
      if (room.public) this.maintainEnemyPopulation(room, dt);

      if (room.players.size > 0) this.sendRoom(room, this.buildState(room));
    }
  }

  // ---------- Tile / collision helpers ----------

  tileAt(room, x, y) {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= room.w || ty >= room.h) return undefined;
    return room.tiles[ty * room.w + tx];
  }

  isBlocked(room, x, y, radius = 12) {
    const points = [
      [x, y],
      [x - radius, y - radius], [x + radius, y - radius],
      [x - radius, y + radius], [x + radius, y + radius]
    ];
    for (const [px, py] of points) {
      const tile = this.tileAt(room, px, py);
      if (tile === undefined || BLOCKED_TILES.has(tile)) return true;
    }
    return false;
  }

  // Move one axis at a time so characters slide along walls.
  tryMove(room, entity, dx, dy, radius = 12) {
    if (dx !== 0 && !this.isBlocked(room, entity.x + dx, entity.y, radius)) entity.x += dx;
    if (dy !== 0 && !this.isBlocked(room, entity.x, entity.y + dy, radius)) entity.y += dy;
  }

  // Used by monsters: can they walk in a straight line to their target?
  hasLineOfSight(room, x1, y1, x2, y2) {
    const distance = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.max(1, Math.ceil(distance / (TILE * 0.5)));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const tile = this.tileAt(room, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t);
      if (tile === undefined || BLOCKED_TILES.has(tile)) return false;
    }
    return true;
  }

  // Breadth-first search over the tile grid. Returns a unit direction for the
  // first step around the outer wall. Cached by each enemy for ~0.4 seconds.
  nextPathDirection(room, sx, sy, tx, ty) {
    const w = room.w;
    const h = room.h;
    const size = w * h;
    const start = Math.floor(sx / TILE) + Math.floor(sy / TILE) * w;
    const goal = Math.floor(tx / TILE) + Math.floor(ty / TILE) * w;
    const direct = () => {
      const len = Math.hypot(tx - sx, ty - sy) || 1;
      return { x: (tx - sx) / len, y: (ty - sy) / len };
    };

    if (start === goal || start < 0 || goal < 0 || start >= size || goal >= size) return direct();
    if (BLOCKED_TILES.has(room.tiles[goal])) return direct();

    const previous = new Int32Array(size);
    previous.fill(-1);
    const queue = new Int32Array(size);
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    previous[start] = start;

    while (head < tail && previous[goal] === -1) {
      const current = queue[head++];
      const cx = current % w;
      const cy = Math.floor(current / w);
      const neighbours = [
        cx > 0 ? current - 1 : -1,
        cx < w - 1 ? current + 1 : -1,
        cy > 0 ? current - w : -1,
        cy < h - 1 ? current + w : -1
      ];
      for (const next of neighbours) {
        if (next < 0 || previous[next] !== -1) continue;
        if (BLOCKED_TILES.has(room.tiles[next])) continue;
        previous[next] = current;
        queue[tail++] = next;
      }
    }

    if (previous[goal] === -1) return direct();

    // Walk back from the goal until we find the tile right next to the start.
    let step = goal;
    while (previous[step] !== start && previous[step] !== step && step !== start) step = previous[step];
    if (step === start) return direct();

    const stepX = (step % w) * TILE + TILE / 2;
    const stepY = Math.floor(step / w) * TILE + TILE / 2;
    const len = Math.hypot(stepX - sx, stepY - sy) || 1;
    return { x: (stepX - sx) / len, y: (stepY - sy) / len };
  }

  // ---------- Players ----------

  updatePlayer(client, dt, now) {
    const room = this.rooms.get(client.roomId);
    if (!room) return;

    if (client.character) client.character.playTime = (Number(client.character.playTime) || 0) + dt;
    client.attackCd = Math.max(0, client.attackCd - dt);
    for (let i = 0; i < 4; i++) client.skillCd[i] = Math.max(0, client.skillCd[i] - dt);
    client.skillAnim = Math.max(0, client.skillAnim - dt);
    client.shieldTime = Math.max(0, client.shieldTime - dt);
    client.invuln = Math.max(0, client.invuln - dt);
    client.hasteTime = Math.max(0, client.hasteTime - dt);
    client.familiarTime = Math.max(0, client.familiarTime - dt);
    client.petAttackCd = Math.max(0, (client.petAttackCd || 0) - dt);
    client.petSkillCd = Math.max(0, (client.petSkillCd || 0) - dt);
    client.inCombat = Math.max(0, client.inCombat - dt);

    if (client.emote) {
      client.emote.time -= dt;
      if (client.emote.time <= 0) client.emote = null;
    }

    const stats = this.statsFor(client);
    client.mp = Math.min(stats.maxMp, client.mp + stats.manaRegen * dt);
    client.stamina = Math.min(100, client.stamina + 22 * dt);
    if (client.inCombat <= 0 && client.alive) {
      client.hp = Math.min(stats.maxHp, client.hp + 0.8 * dt);
    }

    // Summoner familiar fights on its own while the summon is active.
    if (client.alive && client.familiarTime > 0) {
      client.familiarCd = Math.max(0, (client.familiarCd || 0) - dt);
      if (client.familiarCd <= 0) {
        let target = null;
        let nearest = 300;
        for (const enemy of room.enemies.values()) {
          if (!enemy.alive) continue;
          const d = dist(client, enemy);
          if (d < nearest) { target = enemy; nearest = d; }
        }
        if (target) {
          const a = Math.atan2(target.y - (client.y - 10), target.x - client.x);
          this.spawnProjectile(room, {
            x: client.x + Math.cos(a) * 26,
            y: client.y - 10 + Math.sin(a) * 26,
            vx: Math.cos(a) * 430, vy: Math.sin(a) * 430,
            damage: stats.attack * 0.55,
            ownerId: client.id, kind: 'arcane', aoe: 24, radius: 6, life: 1.8
          });
          client.familiarCd = 0.9;
        }
      }
    }

    // Pets fight alongside their owner and trigger their signature skill.
    if (client.alive && client.character.pet) this.updatePetCombat(client, room, stats);

    if (!client.alive) {
      client.respawn -= dt;
      if (client.respawn <= 0) this.respawnPlayer(client);
      return;
    }

    let { dx, dy } = client.lastInput;
    // If the tab loses focus the browser stops sending input. Do not keep running.
    if (now - client.lastInputAt > 800) { dx = 0; dy = 0; }
    const length = Math.hypot(dx, dy);
    if (length > 0.01) { dx /= length; dy /= length; }

    if (client.dashTime > 0) {
      client.dashTime -= dt;
      this.tryMove(room, client, Math.cos(client.dashDir) * 520 * dt, Math.sin(client.dashDir) * 520 * dt, 12);
    } else if (length > 0.01) {
      const speed = stats.speed * (client.shieldTime > 0 ? 0.55 : 1) * (client.hasteTime > 0 ? 1.3 : 1);
      this.tryMove(room, client, dx * speed * dt, dy * speed * dt, 12);
      client.facing = Math.atan2(dy, dx);
    }

    // The pet is drawn by the client, but it "vacuums" loot by collecting
    // anything within a small radius of the player.
    for (const pickup of [...room.pickups.values()]) {
      if (pickup.kind !== 'chest' && !pickup.collected && dist(client, pickup) < 34) this.collectPickup(client, pickup);
    }

    // Keep the save blob's vitals current without sending a character packet.
    const character = client.character;
    character.hp = Math.round(client.hp);
    character.mp = Math.round(client.mp);
    character.x = round(client.x, 2);
    character.y = round(client.y, 2);
  }

  respawnPlayer(client) {
    const village = this.rooms.get('village');
    if (!village) {
      this.error(client, 'The village is unavailable right now.');
      return;
    }
    client.alive = true;
    client.hp = client.maxHp;
    client.mp = client.maxMp;
    client.invuln = 1.5;
    this.changeRoom(client, village, ZONE_SPAWN.village);
    this.event(client, 'system', { text: 'You were revived in Hearthvale Village.', color: '#8ee6ff' });
    this.sfx(client, 'level');
  }

  // ---------- Enemies ----------

  spawnEnemy(room, type, x, y, multiplier = 1) {
    // ENEMY_BASE_STATS includes the elemental variants spawned in frost_cave,
    // volcano and swamp. The old type chain treated every unknown mob as a boss.
    const base = ENEMY_BASE_STATS[type] || ENEMY_BASE_STATS.slime;
    const isBoss = type === 'boss' || type === 'mini_boss';
    const scale = multiplier * (isBoss ? 1 : 1);
    const enemy = {
      id: this.nextEnemyId++,
      type,
      x, y,
      hp: Math.round(base.hp * scale),
      maxHp: Math.round(base.hp * scale),
      damage: base.damage * (isBoss ? 1 : multiplier),
      speed: base.speed * (isBoss ? 1 : Math.min(1.5, multiplier)),
      range: base.range,
      xpReward: Math.round(base.xp * multiplier),
      goldReward: Math.round(base.gold * multiplier),
      radius: base.radius,
      aggroRange: base.aggro,
      alive: true,
      deathTimer: 0,
      attackCd: rand(0, 0.8),
      abilityTimer: 4,
      phase: 1,
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
      pathTimer: 0,
      pathDir: { x: 0, y: 0 }
    };
    room.enemies.set(enemy.id, enemy);
    return enemy;
  }

  updateEnemies(room, dt, now) {
    for (const enemy of [...room.enemies.values()]) {
      if (!enemy.alive) {
        enemy.deathTimer -= dt;
        if (enemy.deathTimer <= 0) room.enemies.delete(enemy.id);
        continue;
      }
      this.updateEnemy(room, enemy, dt, now);
    }
  }

  updateEnemy(room, enemy, dt, now) {
    enemy.attackCd = Math.max(0, enemy.attackCd - dt);
    enemy.retarget -= dt;
    enemy.flash = Math.max(0, enemy.flash - dt);

    // Poison arrows keep ticking even if the player ran away.
    if (enemy.poisonTimer > 0) {
      enemy.poisonTimer -= dt;
      enemy.poisonTick -= dt;
      if (enemy.poisonTick <= 0) {
        enemy.poisonTick = 0.5;
        const owner = [...room.players].find(c => c.id === enemy.poisonOwner) || null;
        this.damageEnemy(room, enemy, enemy.poisonDps * 0.5, owner, false, 'poison', { noStatus: true });
      }
    }

    let target = [...room.players].find(c => c.id === enemy.targetId && c.alive) || null;
    if (!target || enemy.retarget <= 0 || dist(enemy, target) > enemy.aggroRange * 1.6) {
      enemy.retarget = 0.5;
      let bestDistance = enemy.aggroRange;
      target = null;
      for (const player of room.players) {
        if (!player.alive) continue;
        const d = dist(enemy, player);
        if (d < bestDistance) { target = player; bestDistance = d; }
      }
      enemy.targetId = target ? target.id : null;
    }
    if (!target) {
      if (enemy.type === 'boss' && enemy.slamWindup > 0) this.updateBoss(room, enemy, null, 0, dt, now);
      return;
    }

    const distance = dist(enemy, target);
    const angle = Math.atan2(target.y - enemy.y, target.x - enemy.x);

    const retreating = enemy.type === 'scout' && distance < enemy.range * 0.62;
    if (distance > enemy.range + 12 - 4 || retreating) {
      let direction;
      if (this.hasLineOfSight(room, enemy.x, enemy.y, target.x, target.y)) {
        direction = { x: Math.cos(angle), y: Math.sin(angle) };
      } else {
        // Recompute the BFS path only a couple of times per second.
        if (now >= enemy.pathTimer) {
          enemy.pathTimer = now + 400;
          enemy.pathDir = this.nextPathDirection(room, enemy.x, enemy.y, target.x, target.y);
        }
        direction = enemy.pathDir;
      }
      const slow = enemy.slowTimer > 0 ? enemy.slowFactor : 1;
      if (enemy.slowTimer > 0) enemy.slowTimer -= dt;
      const moveSign = retreating ? -1 : 1;
      this.tryMove(room, enemy, direction.x * enemy.speed * slow * dt * moveSign, direction.y * enemy.speed * slow * dt * moveSign, enemy.radius);
    }

    if (enemy.type === 'scout' && distance <= enemy.range && enemy.attackCd <= 0) {
      enemy.attackCd = 1.65;
      this.spawnProjectile(room, {
        x: enemy.x + Math.cos(angle) * 12,
        y: enemy.y + Math.sin(angle) * 12,
        vx: Math.cos(angle) * 225,
        vy: Math.sin(angle) * 225,
        damage: enemy.damage,
        team: 'enemy',
        kind: 'scoutBolt',
        radius: 5,
        life: 2.4,
        ownerId: enemy.id
      });
    } else if (enemy.type !== 'scout' && distance < enemy.range + 12 + 4 && enemy.attackCd <= 0) {
      enemy.attackCd = enemy.type === 'boss' ? 1.1 : 0.9;
      this.damagePlayer(target, enemy.damage, enemy, enemy.type);
    }

    if (enemy.type === 'boss') this.updateBoss(room, enemy, target, angle, dt, now);
  }

  updateBoss(room, boss, target, angle, dt, now) {
    if (boss.slamWindup > 0) {
      boss.slamWindup = Math.max(0, boss.slamWindup - dt);
      if (boss.slamWindup === 0) {
        this.areaDamagePlayers(room, boss.slamX, boss.slamY, 76, 24, 'slam');
        this.eventRoom(room, 'fx', { visual: 'bossSlam', x: boss.slamX, y: boss.slamY });
        this.sfxRoom(room, 'boss');
        boss.slamX = null;
        boss.slamY = null;
        boss.abilityTimer = 2.2;
      }
      return;
    }
    const ratio = boss.hp / boss.maxHp;
    const newPhase = ratio < 0.28 ? 3 : ratio < 0.6 ? 2 : 1;
    if (newPhase !== boss.phase) {
      boss.phase = newPhase;
      boss.abilityTimer = 1.2;
      boss.slamWindup = 0;
      this.eventRoom(room, 'system', { text: `Boss enters phase ${newPhase}!`, color: '#ff8c42' });
      this.sfxRoom(room, 'boss');
    }

    boss.abilityTimer -= dt;
    if (boss.abilityTimer > 0) return;

    // Phase 2+: a spread of enemy projectiles.
    if (boss.phase >= 2) {
      const count = boss.phase >= 3 ? 7 : 5;
      for (let i = 0; i < count; i++) {
        const a = angle + (i - (count - 1) / 2) * 0.22;
        this.spawnProjectile(room, {
          x: boss.x + Math.cos(a) * 20,
          y: boss.y - 10 + Math.sin(a) * 20,
          vx: Math.cos(a) * 230,
          vy: Math.sin(a) * 230,
          damage: 12,
          team: 'enemy',
          kind: 'bossOrb',
          radius: 7,
          life: 3,
          ownerId: boss.id
        });
      }
      boss.abilityTimer = boss.phase >= 3 ? 2.6 : 3.4;
    } else {
      boss.abilityTimer = 2.5;
    }

    // Phase 3: warn players before the slam so they can dodge it.
    if (boss.phase >= 3 && target && dist(boss, target) < 150) {
      boss.slamX = target.x;
      boss.slamY = target.y;
      boss.slamWindup = 0.75;
      boss.abilityTimer = 2.2;
      this.eventRoom(room, 'system', { text: 'The boss is charging a slam! Move out of the glowing circle!', color: '#ff8c42' });
    }
  }

  // ---------- Combat ----------

  damageEnemy(room, enemy, amount, source = null, crit = false, kind = 'hit', opts = {}) {
    if (!enemy || !enemy.alive) return;
    const dmg = Math.max(1, Math.round(amount));
    enemy.hp -= dmg;
    enemy.flash = 0.12;
    if (!enemy.targetId && source) enemy.targetId = source.id;

    // "kind" on the event is the event name ("hit"). The damage flavour is
    // also supplied as hitKind/attackKind so the client can colour numbers.
    this.eventRoom(room, 'hit', {
      x: round(enemy.x, 1),
      y: round(enemy.y - 12, 1),
      dmg,
      crit: !!crit,
      hitKind: kind,
      attackKind: kind
    });

    if (!opts.noStatus) {
      if (opts.slow) {
        enemy.slowTimer = Math.max(enemy.slowTimer, 2.5);
        enemy.slowFactor = 1 - opts.slow;
      }
      if (opts.poison && source) {
        enemy.poisonTimer = Math.max(enemy.poisonTimer, 4);
        enemy.poisonDps = Math.max(enemy.poisonDps, opts.poison);
        enemy.poisonOwner = source.id;
      }
    }

    if (enemy.hp <= 0) this.killEnemy(room, enemy, source);
  }

  // Pets are full combat companions: a basic attack plus their signature
  // skill. All damage and healing stays authoritative on the server; the
  // client only receives hit/fx packets.
  updatePetCombat(client, room, stats) {
    const pet = client.character.pet;
    if (!pet || !PET_TYPES[pet.type]) return;
    const def = PET_TYPES[pet.type];
    const level = clamp(Math.floor(Number(pet.level) || 1), 1, 20);
    const power = Math.max(6, Math.round(stats.attack * 0.35 + level * 2));

    let target = null;
    let nearest = 280;
    for (const enemy of room.enemies.values()) {
      if (!enemy.alive) continue;
      const d = dist(client, enemy);
      if (d < nearest) { target = enemy; nearest = d; }
    }

    const fx = (visual, data = {}) => this.eventRoom(room, 'fx', {
      visual,
      ownerId: client.id,
      ownerName: client.character.name,
      x: round(client.x, 1),
      y: round(client.y, 1),
      color: def.color,
      name: def.skillName,
      ...data
    });

    if (client.petSkillCd <= 0) {
      if (pet.type === 'fairy') {
        if (client.hp < stats.maxHp * 0.9 || client.mp < stats.maxMp * 0.6) {
          const heal = Math.round(stats.maxHp * 0.12 + level * 2);
          client.hp = Math.min(stats.maxHp, client.hp + heal);
          client.mp = Math.min(stats.maxMp, client.mp + Math.round(stats.maxMp * 0.1));
          fx('petHeal', { text: `+${heal} HP` });
          this.syncVitals(client);
          client.petSkillCd = def.cd || 9;
        }
      } else if (target) {
        if (pet.type === 'wolf') {
          this.damageEnemy(room, target, Math.round(power * 2.2), client, false, 'pet bite');
          fx('petSkill', { tx: round(target.x, 1), ty: round(target.y, 1), radius: 46 });
        } else if (pet.type === 'golem') {
          for (const enemy of room.enemies.values()) {
            if (!enemy.alive || dist(client, enemy) > 120) continue;
            this.damageEnemy(room, enemy, Math.round(power * 1.6), client, false, 'pet slam');
          }
          fx('petSkill', { x: round(client.x, 1), y: round(client.y, 1), radius: 120 });
        } else if (pet.type === 'dragon') {
          const a = Math.atan2(target.y - client.y, target.x - client.x);
          for (const enemy of room.enemies.values()) {
            if (!enemy.alive) continue;
            if (dist(client, enemy) > 150) continue;
            if (angleDiff(Math.atan2(enemy.y - client.y, enemy.x - client.x), a) > 0.8) continue;
            this.damageEnemy(room, enemy, Math.round(power * 1.8), client, false, 'pet fire');
          }
          fx('petSkill', { tx: round(target.x, 1), ty: round(target.y, 1), radius: 130 });
        }
        client.petSkillCd = def.cd || 9;
      }
    }

    if (target && client.petAttackCd <= 0) {
      this.damageEnemy(room, target, power, client, false, 'pet');
      fx('petAttack', { tx: round(target.x, 1), ty: round(target.y, 1) });
      client.petAttackCd = 1.1;
    }
  }

  checkQuestComplete(client) {
    const quest = client.character.quest;
    const ready = quest.stage === 3
      ? quest.scouts >= 8 && quest.essence >= 3
      : quest.stage === 2
        ? quest.goblins >= 8 && quest.ore >= 4
        : quest.kills >= 10 && quest.herbs >= 5;
    if (quest.active && !quest.complete && ready) {
      quest.complete = true;
      const chapter = quest.stage === 3 ? 'Shards of the Dunes'
        : quest.stage === 2 ? 'Echoes Below' : 'The Waking Forest';
      this.event(client, 'quest', { text: `${chapter} complete! Return to Elder Tarn.` });
      this.sfx(client, 'level');
    }
  }

  killEnemy(room, enemy, source) {
    enemy.hp = 0;
    enemy.alive = false;
    enemy.deathTimer = 0.5;

    if (source && source.character) {
      const base = ENEMY_BASE_STATS[enemy.type] || {};
      const standard = ['slime', 'goblin', 'brute', 'scout'].includes(enemy.type);
      updateAchievementProgress(source.character, 'kills', 1, this, source);
      updateDailyProgress(source.character, standard ? `kill_${enemy.type}` : 'kill_elemental', 1, this, source);
      updateAchievementProgress(source.character, 'gold', source.character.gold || 0, this, source);
    }

    if (source && source.character && source.character.quest.active) {
      const quest = source.character.quest;
      let progressed = false;
      if (quest.stage === 1 && room.zoneId === 'forest' && enemy.type === 'slime' && quest.kills < 10) {
        quest.kills = Math.min(10, quest.kills + 1);
        progressed = true;
      }
      if (quest.stage === 2 && room.zoneId === 'cave' && enemy.type === 'goblin' && quest.goblins < 8) {
        quest.goblins = Math.min(8, quest.goblins + 1);
        progressed = true;
      }
      if (quest.stage === 3 && room.zoneId === 'desert' && enemy.type === 'scout' && quest.scouts < 8) {
        quest.scouts = Math.min(8, quest.scouts + 1);
        progressed = true;
      }
      if (progressed) {
        this.checkQuestComplete(source);
        this.sendCharacter(source);
      }
    }

    this.spawnPickup(room, 'xp', enemy.x, enemy.y, enemy.xpReward);
    // XP feedback is private to the killer. Other players still see the orb in
    // the world state, but their screen is not covered by someone else's XP text.
    if (source) {
      this.event(source, 'fx', {
        visual: 'xpDrop', x: enemy.x, y: enemy.y,
        amount: enemy.xpReward, ownerId: source.id, ownerName: source.character.name
      });
    }
    this.spawnPickup(room, 'gold', enemy.x, enemy.y, enemy.goldReward);

    if (enemy.type === 'slime' && Math.random() < 0.55) this.spawnPickup(room, 'herb', enemy.x, enemy.y, 1);
    if (enemy.type === 'goblin' && Math.random() < 0.22) this.spawnPickup(room, 'herb', enemy.x, enemy.y, 1);
    if (enemy.type === 'goblin' && Math.random() < 0.48) this.spawnPickup(room, 'material', enemy.x, enemy.y, 1, null, 'ore');
    const quest = source && source.character && source.character.quest;
    const essenceChance = quest && quest.active && quest.stage === 3 && room.zoneId === 'desert' ? 0.65 : 0.08;
    if (Math.random() < essenceChance) this.spawnPickup(room, 'material', enemy.x, enemy.y, 1, null, 'essence');
    if (enemy.type !== 'boss' && Math.random() < 0.12) {
      const item = generateMonsterDrop(enemy.type, room.zoneId, ZONE_MUL[room.zoneId] || 1);
      if (item) {
        this.spawnPickup(room, 'item', enemy.x + rand(-6, 6), enemy.y, 1, item);
        this.eventRoom(room, 'fx', {
          visual: 'itemDrop', x: enemy.x, y: enemy.y,
          name: item.name, rarity: item.rarity,
          color: RARITY[item.rarity] ? RARITY[item.rarity].color : '#c9a6ff'
        });
      }
    }

    if (enemy.type === 'boss') this.defeatBoss(room, enemy, source);
  }

  defeatBoss(room, boss, source) {
    const party = room.public
      ? [...room.players]
      : [...room.players].filter(c => room.partyIds.has(c.accountId));

    const recipients = party.length ? party : (source ? [source] : []);
    const guildGoals = this.db.guildRecordBossKill(recipients.map(client => client.accountId));
    const effects = ['flame', 'frost', 'void', 'thunder'];
    const effect = pick(effects);
    const chestRewards = {};

    for (const client of recipients) {
      const rarity = Math.random() < 0.5 ? 'epic' : 'rare';
      const isWeapon = Math.random() < 0.6;
      const classWeapon = {
        swordsman: { name: 'Sovereign Blade', art: 'sword' },
        archer: { name: 'Sovereign Bow', art: 'bow' },
        mage: { name: 'Sovereign Staff', art: 'staff' },
        cleric: { name: 'Sovereign Mace', art: 'mace' },
        rogue: { name: 'Sovereign Dagger', art: 'dagger' },
        summoner: { name: 'Sovereign Tome', art: 'tome' }
      }[client.character.classId] || { name: 'Sovereign Blade', art: 'sword' };
      const loot = makeItem(
        isWeapon ? classWeapon.name : 'Boss-Slayer Charm',
        isWeapon ? 'weapon' : 'armor',
        rarity,
        rarity === 'epic' ? { attack: 14, hp: 30, defense: 6 } : { attack: 9, hp: 18, defense: 3 },
        { classId: client.character.classId, art: isWeapon ? classWeapon.art : 'armor', effect, desc: 'Forged in the heart of the dungeon for your class.' }
      );

      client.character.gold += 320;
      const completedGuildGoal = guildGoals.find(goal => goal.completed && goal.accountIds.includes(client.accountId));
      if (completedGuildGoal) {
        client.character.gold += 150;
        this.event(client, 'system', { text: 'Guild weekly raid goal complete! +150 gold.', color: '#c9a6ff' });
      }
      client.character.bossDefeated = true;
      client.character.bossKills = (Number(client.character.bossKills) || 0) + 1;
      updateAchievementProgress(client.character, 'boss_kills', 1, this, client);
      updateDailyProgress(client.character, 'dungeon_clear', 1, this, client);
      this.gainXp(client, 400, false);
      chestRewards[String(client.id)] = loot;
      this.sendCharacter(client);
    }

    if (recipients.length) {
      this.spawnPickup(room, 'chest', boss.x, boss.y, 1, null, null, {
        ownerIds: recipients.map(client => client.id),
        openedBy: [],
        rewards: chestRewards
      });
      for (const client of recipients) {
        this.event(client, 'system', { text: 'A boss reward chest appeared nearby. Walk up and press F to open it.', color: '#ffd75e' });
      }
    }

    for (const goal of guildGoals) {
      const representative = goal.accountIds.find(accountId => recipients.some(client => client.accountId === accountId));
      if (representative) this.broadcastGuildInfo(this.db.guildInfoForAccount(representative).members);
    }

    this.eventRoom(room, 'system', { text: 'The Cave Boss has fallen! Party reward chests appeared nearby.', color: '#ffd75e' });
    this.sfxRoom(room, 'boss');
  }

  damagePlayer(client, amount, enemy = null, kind = 'enemy') {
    if (!client.alive || client.invuln > 0) return;
    const stats = this.statsFor(client);
    let damage = amount * (1 - stats.defense * 0.02) * stats.damageTakenMult;
    if (client.shieldTime > 0) damage *= 0.2; // Shield Block blocks 80%.
    const dmg = Math.max(1, Math.round(damage));

    client.hp -= dmg;
    client.inCombat = 3;
    this.event(client, 'hit', {
      x: round(client.x, 1),
      y: round(client.y - 12, 1),
      dmg,
      crit: false,
      hitKind: kind,
      attackKind: kind
    });

    if (client.hp <= 0) {
      client.hp = 0;
      client.alive = false;
      client.respawn = 3;
      this.event(client, 'death', { text: 'You were defeated! Reviving in 3 seconds...' });
      this.sfx(client, 'death');
    }
  }

  spawnProjectile(room, options) {
    const projectile = {
      id: this.nextProjectileId++,
      kind: options.kind || 'arrow',
      x: options.x,
      y: options.y,
      vx: options.vx,
      vy: options.vy,
      team: options.team || 'player',
      radius: options.radius || 5,
      damage: options.damage || 0,
      crit: !!options.crit,
      life: options.life || 2.2,
      aoe: options.aoe || 0,
      poison: options.poison || 0,
      slow: options.slow || 0,
      ownerId: options.ownerId || null
    };
    room.projectiles.set(projectile.id, projectile);
    return projectile;
  }

  updateProjectiles(room, dt) {
    for (const projectile of [...room.projectiles.values()]) {
      projectile.life -= dt;
      if (projectile.life <= 0) { room.projectiles.delete(projectile.id); continue; }

      // Sub-steps stop fast arrows from jumping over a thin target.
      const steps = Math.max(1, Math.ceil(Math.hypot(projectile.vx, projectile.vy) * dt / 12));
      let impacted = false;

      for (let step = 0; step < steps && !impacted; step++) {
        const nx = projectile.x + projectile.vx * dt / steps;
        const ny = projectile.y + projectile.vy * dt / steps;

        // Only the solid map border blocks projectiles now.
        if (PROJECTILE_BLOCKED_TILES.has(this.tileAt(room, nx, ny))) {
          this.impactProjectile(room, projectile, nx, ny, null);
          impacted = true;
          break;
        }

        projectile.x = nx;
        projectile.y = ny;

        if (projectile.team === 'player') {
          for (const enemy of room.enemies.values()) {
            if (!enemy.alive) continue;
            if (Math.hypot(projectile.x - enemy.x, projectile.y - (enemy.y - 8)) < projectile.radius + enemy.radius) {
              this.impactProjectile(room, projectile, projectile.x, projectile.y, enemy);
              impacted = true;
              break;
            }
          }
        } else {
          for (const client of room.players) {
            if (!client.alive) continue;
            if (Math.hypot(projectile.x - client.x, projectile.y - (client.y - 10)) < projectile.radius + 12) {
              this.impactProjectile(room, projectile, projectile.x, projectile.y, client);
              impacted = true;
              break;
            }
          }
        }
      }

      if (impacted) room.projectiles.delete(projectile.id);
    }
  }

  impactProjectile(room, projectile, x, y, target) {
    const owner = [...room.players].find(c => c.id === projectile.ownerId) || null;

    if (projectile.aoe > 0) {
      if (projectile.team === 'player') {
        this.areaDamage(room, x, y, projectile.aoe, projectile.damage, owner, projectile.kind);
      } else {
        this.areaDamagePlayers(room, x, y, projectile.aoe, projectile.damage, projectile.kind);
      }
      return;
    }

    if (projectile.team === 'player') {
      if (target) {
        this.damageEnemy(room, target, projectile.damage, owner, projectile.crit, projectile.kind, {
          poison: projectile.poison,
          slow: projectile.slow
        });
      }
    } else if (target) {
      this.damagePlayer(target, projectile.damage, null, projectile.kind);
    }
  }

  areaDamage(room, x, y, radius, damage, source = null, kind = 'hit', opts = {}) {
    for (const enemy of [...room.enemies.values()]) {
      if (!enemy.alive) continue;
      const d = Math.hypot(x - enemy.x, y - enemy.y);
      if (d > radius + enemy.radius) continue;
      const falloff = 1 - clamp(d / radius, 0, 1) * 0.35;
      this.damageEnemy(room, enemy, damage * falloff, source, false, kind, opts);
    }
  }

  areaDamagePlayers(room, x, y, radius, damage, kind = 'hit') {
    for (const client of room.players) {
      if (!client.alive) continue;
      if (Math.hypot(x - client.x, y - client.y) <= radius + 12) {
        this.damagePlayer(client, damage, null, kind);
      }
    }
  }

  scheduleMeteor(room, x, y, damage, ownerId) {
    room.meteors.push({ x, y, damage, ownerId, timer: 0.7 });
    this.sfxRoom(room, 'meteor');
  }

  updateMeteors(room, dt) {
    for (const meteor of [...room.meteors]) {
      meteor.timer -= dt;
      if (meteor.timer > 0) continue;
      const owner = [...room.players].find(c => c.id === meteor.ownerId) || null;
      this.areaDamage(room, meteor.x, meteor.y, 120, meteor.damage, owner, 'meteor');
      this.eventRoom(room, 'fx', { visual: 'meteorImpact', x: meteor.x, y: meteor.y });
      this.eventRoom(room, 'sfx', { name: 'explosion' });
      room.meteors.splice(room.meteors.indexOf(meteor), 1);
    }
  }

  // ---------- Pickups ----------

  spawnPickup(room, kind, x, y, amount = 1, item = null, material = null, extra = {}) {
    const pickup = {
      id: this.nextPickupId++,
      kind,
      x: x + rand(-8, 8),
      y: y - 4 + rand(-4, 4),
      amount,
      item,
      material,
      age: 0,
      collected: false,
      ...(kind === 'chest' ? extra : {})
    };
    room.pickups.set(pickup.id, pickup);
    return pickup;
  }

  updatePickups(room, dt) {
    for (const pickup of room.pickups.values()) {
      pickup.age += dt;
      if (pickup.age > 180) room.pickups.delete(pickup.id);
    }
  }

  collectPickup(client, pickup) {
    if (pickup.collected) return;
    if (pickup.kind === 'item' && !this.canAddItem(client, pickup.item)) {
      pickup.fullNoticeFor = pickup.fullNoticeFor || new Set();
      if (!pickup.fullNoticeFor.has(client.id)) {
        pickup.fullNoticeFor.add(client.id);
        this.system(client, 'Inventory is full. Make room to pick up this item.');
      }
      return;
    }
    pickup.collected = true;
    const room = this.rooms.get(client.roomId);
    if (room) room.pickups.delete(pickup.id);
    const character = client.character;
    const materials = character.materials || (character.materials = { herb: 0, ore: 0, essence: 0 });

    if (pickup.kind === 'gold') {
      character.gold += pickup.amount;
      updateAchievementProgress(character, 'gold', character.gold, this, client);
    } else if (pickup.kind === 'xp') {
      this.gainXp(client, pickup.amount);
    } else if (pickup.kind === 'herb') {
      materials.herb += pickup.amount;
      updateDailyProgress(character, 'gather', pickup.amount, this, client);
      const quest = character.quest;
      if (quest.active && room && room.zoneId === 'forest' && quest.stage === 1 && quest.herbs < 5) {
        quest.herbs = Math.min(5, quest.herbs + pickup.amount);
        this.event(client, 'system', { text: `Herb ${quest.herbs}/5`, color: '#8ee46d' });
        this.checkQuestComplete(client);
      }
    } else if (pickup.kind === 'material') {
      const key = ['herb', 'ore', 'essence'].includes(pickup.material) ? pickup.material : 'ore';
      materials[key] += pickup.amount;
      updateDailyProgress(character, 'gather', pickup.amount, this, client);
      if (key === 'ore' && room && room.zoneId === 'cave' && character.quest.active && character.quest.stage === 2) {
        character.quest.ore = Math.min(4, character.quest.ore + pickup.amount);
        this.checkQuestComplete(client);
      } else if (key === 'essence' && room && room.zoneId === 'desert' &&
          character.quest.active && character.quest.stage === 3 && character.quest.essence < 3) {
        character.quest.essence = Math.min(3, character.quest.essence + pickup.amount);
        this.event(client, 'system', { text: `Seal essence ${character.quest.essence}/3`, color: '#d7b8ff' });
        this.checkQuestComplete(client);
      }
      this.event(client, 'system', { text: `+${pickup.amount} ${key}`, color: '#9ce7ff' });
    } else if (pickup.kind === 'item') {
      const item = normalizeItem(pickup.item);
      if (item && this.addItem(client, item)) {
        this.event(client, 'loot', { name: item.name, rarity: item.rarity });
        if (item.rarity !== 'common') {
          this.event(client, 'system', { text: `You found a ${item.rarity} item: ${item.name}!`, color: RARITY[item.rarity].color });
        }
      }
    }

    this.sfx(client, 'pickup');
    this.sendCharacter(client);
  }

  gainXp(client, amount, announce = true) {
    const character = client.character;
    const gained = Math.max(0, Math.round(amount));
    character.xp += gained;
    this.event(client, 'xp', {
      amount: gained, x: client.x, y: client.y,
      ownerId: client.id, ownerName: character.name
    });

    while (character.xp >= character.xpNext) {
      character.xp -= character.xpNext;
      character.level = (Number(character.level) || 1) + 1;
      character.xpNext = Math.floor(80 * Math.pow(character.level, 1.28));
      character.skillPoints = (Number(character.skillPoints) || 0) + 1;
      this.syncVitals(client);
      client.hp = client.maxHp;
      client.mp = client.maxMp;
      this.event(client, 'level', { level: character.level });
      this.event(client, 'system', { text: `Level up! You are now level ${character.level}.`, color: '#ffd75e' });
      this.sfx(client, 'level');
      updateAchievementProgress(character, 'level', character.level, this, client);
    }

    addPetXp(character, gained, this, client);
    updateAchievementProgress(character, 'gold', character.gold || 0, this, client);
    this.sendCharacter(client);
    if (announce) this.event(client, 'system', { text: `+${gained} XP`, color: '#8ee6ff' });
  }

  canAddItem(client, item) {
    const inventory = client.character.inventory || [];
    const clean = normalizeItem(item, client.character && client.character.classId);
    if (!clean) return false;
    const stack = inventory.find(existing => sameConsumableStack(existing, clean) && (existing.quantity || 1) < 99);
    return inventory.length < 20 || !!stack && (stack.quantity || 1) + clean.quantity <= 99;
  }

  addItem(client, item) {
    const clean = normalizeItem(item, client.character && client.character.classId);
    if (!clean) return false;
    if (!Array.isArray(client.character.inventory)) client.character.inventory = [];
    const inventory = client.character.inventory;
    if (!this.canAddItem(client, clean)) return false;
    const stack = inventory.find(existing => sameConsumableStack(existing, clean) && (existing.quantity || 1) < 99);
    if (stack) {
      const total = (stack.quantity || 1) + clean.quantity;
      if (total <= 99) { stack.quantity = total; return true; }
      stack.quantity = 99;
      clean.quantity = total - 99;
    }
    inventory.push(clean);
    return true;
  }

  // ---------- Message routing ----------

  handle(client, message) {
    if (!message || typeof message !== 'object') { this.error(client, 'Invalid message.'); return; }
    const type = String(message.type || '');

    // These two work without being in a room.
    if (type === 'join') { this.join(client); return; }
    if (type === 'save') { this.saveClient(client, true); return; }
    if (type === 'ping') { this.send(client, { type: 'pong' }); return; }

    if (!client.character) { this.error(client, 'Register or login first.'); return; }
    if (!client.player) { this.error(client, 'Send join before playing.'); return; }

    switch (type) {
      case 'input': this.handleInput(client, message); break;
      case 'attack': this.handleAttack(client, message); break;
      case 'skill': this.handleSkill(client, message); break;
      case 'interact': this.handleInteract(client); break;
      case 'worldTravel': this.handleWorldTravel(client, message); break;
      case 'openChest': this.handleOpenChest(client, message); break;
      case 'dungeon': this.handleDungeon(client); break;
      case 'leaveDungeon': this.handleLeaveDungeon(client); break;
      case 'emote': this.handleEmote(client); break;
      case 'party': this.handleParty(client); break;
      case 'partyLeave': this.handlePartyLeave(client); break;
      case 'partyDisband': this.handlePartyDisband(client); break;
      case 'potion': this.consumePotion(client, null); break;
      case 'usePotion': this.consumePotion(client, message.uid); break;
      case 'chat': this.handleChat(client, message); break;
      case 'shopBuy': this.handleShopBuy(client, message); break;
      case 'questAccept': this.handleQuestAccept(client); break;
      case 'questTurnIn': this.handleQuestTurnIn(client); break;
      case 'craft': this.handleCraft(client, message); break;
      case 'enchant': this.handleEnchant(client, message); break;
      case 'talent': this.handleTalent(client, message); break;
      case 'skillUp': this.handleSkillUp(client, message); break;
      case 'spec': this.handleSpec(client, message); break;
      case 'equip': this.handleEquip(client, message); break;
      case 'unequip': this.handleUnequip(client, message); break;
      case 'sellItem': this.handleSellItem(client, message); break;
      case 'discardItem': this.handleDiscardItem(client, message); break;
      case 'auctionAdd': this.handleAuctionAdd(client, message); break;
      case 'auctionBuy': this.handleAuctionBuy(client, message); break;
      case 'auctionRemove': this.handleAuctionRemove(client, message); break;
      case 'auctionList': this.emitAuctionList(client); break;
      case 'mailSend': this.handleMailSend(client, message); break;
      case 'mailList': this.emitMailList(client); break;
      case 'mailTake': this.handleMailTake(client, message); break;
      case 'guildCreate': this.handleGuildCreate(client, message); break;
      case 'guildJoin': this.handleGuildJoin(client, message); break;
      case 'guildInfo': this.emitGuildInfo(client); break;
      case 'guildLeave': this.handleGuildLeave(client); break;
      case 'claim_achievement': this.handleClaimAchievement(client, message); break;
      case 'claim_daily': this.handleClaimDaily(client, message); break;
      case 'get_leaderboard': this.handleGetLeaderboard(client, message); break;
      case 'trade_request': this.trades.requestTrade(client, message.targetName); break;
      case 'trade_accept': this.trades.acceptTrade(client, message.fromId); break;
      case 'trade_offer': this.trades.setOffer(client, message); break;
      case 'trade_lock': this.trades.lockOffer(client); break;
      case 'trade_confirm': this.trades.confirmTrade(client); break;
      case 'trade_cancel': this.trades.cancelTrade(client); break;
      case 'pet_select': this.handlePetSelect(client, message); break;
      case 'setPassword': this.handleSetPassword(client, message); break;
      default: this.error(client, `Unknown message type: ${type}`);
    }
  }

  // Lock-on is validated server-side: the id must be a living mob in this room
  // and close enough to be a plausible target.
  resolveLockTarget(client, message) {
    const raw = message && message.lockTargetId !== undefined
      ? message.lockTargetId
      : client.lockTargetId;
    if (raw === null || raw === undefined || raw === '') {
      client.lockTargetId = null;
      return null;
    }
    const room = this.rooms.get(client.roomId);
    if (!room) return null;

    let enemy = room.enemies.get(raw) || room.enemies.get(Number(raw));
    if (!enemy) {
      for (const candidate of room.enemies.values()) {
        if (String(candidate.id) === String(raw)) { enemy = candidate; break; }
      }
    }
    if (!enemy || !enemy.alive || dist(client, enemy) > 900) {
      client.lockTargetId = null;
      return null;
    }
    client.lockTargetId = enemy.id;
    return enemy;
  }

  applyLockAim(client, message) {
    const target = this.resolveLockTarget(client, message);
    const aimX = Number(message && message.aimX);
    const aimY = Number(message && message.aimY);
    // An explicit cursor/skill point always wins over a lock. Previously lock
    // overwrote it, so clicking anywhere still aimed at the locked mob.
    if (Number.isFinite(aimX) && Number.isFinite(aimY)) {
      client.aim = Math.atan2(aimY - (client.y - 10), aimX - client.x);
    } else if (Number.isFinite(Number(message && message.aim))) {
      client.aim = Number(message.aim);
    } else if (target) {
      client.aim = Math.atan2((target.y - 8) - (client.y - 10), target.x - client.x);
    }
    return target;
  }

  // Explicit cursor point > lock target > facing fallback. The client preview
  // uses the same range clamp, so what you see is what the server hits.
  skillTargetPoint(client, room, message, lockedTarget, defaultDistance = 200, maxRange = defaultDistance) {
    const aim = client.aim || 0;
    const reqX = Number(message && message.aimX);
    const reqY = Number(message && message.aimY);
    let x;
    let y;
    if (Number.isFinite(reqX) && Number.isFinite(reqY)) {
      x = reqX;
      y = reqY;
    } else if (lockedTarget) {
      x = lockedTarget.x;
      y = lockedTarget.y - 8;
    } else {
      x = client.x + Math.cos(aim) * defaultDistance;
      y = client.y - 8 + Math.sin(aim) * defaultDistance;
    }
    const dx = x - client.x;
    const dy = y - (client.y - 8);
    const distance = Math.hypot(dx, dy);
    if (distance > maxRange) {
      x = client.x + dx / distance * maxRange;
      y = client.y - 8 + dy / distance * maxRange;
    }
    return {
      x: clamp(x, 40, room.w * TILE - 40),
      y: clamp(y, 40, room.h * TILE - 40)
    };
  }

  handleInput(client, message) {
    const dx = clamp(Number(message.dx) || 0, -1, 1);
    const dy = clamp(Number(message.dy) || 0, -1, 1);
    const lockedTarget = this.resolveLockTarget(client, message);
    let aimX = Number(message.aimX);
    let aimY = Number(message.aimY);
    if (!Number.isFinite(aimX) || !Number.isFinite(aimY)) {
      if (lockedTarget) {
        aimX = lockedTarget.x;
        aimY = lockedTarget.y - 8;
      }
    }
    if (Number.isFinite(aimX) && Number.isFinite(aimY)) {
      client.aim = Math.atan2(aimY - (client.y - 10), aimX - client.x);
    }
    client.lastInput = {
      dx, dy,
      aimX: Number.isFinite(aimX) ? aimX : null,
      aimY: Number.isFinite(aimY) ? aimY : null,
      lockTargetId: client.lockTargetId
    };
    client.lastInputAt = Date.now();
  }

  // ---------- Normal attacks ----------

  handleAttack(client, message = {}) {
    if (!client.alive || client.attackCd > 0) return;
    const room = this.rooms.get(client.roomId);
    if (!room) return;
    let target = this.applyLockAim(client, message);
    const hasExplicitAim = (Number.isFinite(Number(message && message.aimX)) &&
      Number.isFinite(Number(message && message.aimY))) ||
      (message && message.aim !== undefined && Number.isFinite(Number(message.aim)));
    if (!target && !hasExplicitAim) {
      let nearestDistance = 500;
      for (const enemy of room.enemies.values()) {
        if (!enemy.alive) continue;
        const distance = dist(client, enemy);
        if (distance <= nearestDistance) {
          target = enemy;
          nearestDistance = distance;
        }
      }
      if (target) {
        client.lockTargetId = target.id;
        this.applyLockAim(client, { lockTargetId: target.id });
      }
    }

    const classId = client.character.classId;
    client.attackCd = classId === 'rogue' ? 0.28 : classId === 'archer' ? 0.31
      : classId === 'cleric' ? 0.42 : classId === 'summoner' ? 0.48
        : classId === 'mage' ? 0.55 : 0.45;
    if (client.character.spec === 'Assassin') client.attackCd *= 0.9;
    client.inCombat = 3;

    const stats = this.statsFor(client);
    const crit = Math.random() < stats.crit;
    const damage = stats.attack * (crit ? 1.8 : 1);
    const aim = client.aim || client.facing || 0;
    const startX = client.x + Math.cos(aim) * 14;
    const startY = client.y - 10 + Math.sin(aim) * 14;

    // PvP Attack handling in Arena
    if (room.zoneId === 'arena') {
      for (const other of room.players) {
        if (other.id === client.id || !other.character || !other.alive) continue;
        const d = Math.hypot(other.x - client.x, other.y - client.y);
        const angle = Math.atan2(other.y - client.y, other.x - client.x);
        if (d < stats.range + 20 && angleDiff(angle, aim) < 1.2) {
          this.damagePvPPlayer(room, other, damage, client, crit);
        }
      }
    }

    if (classId === 'swordsman' || classId === 'cleric' || classId === 'rogue') {
      for (const enemy of room.enemies.values()) {
        if (!enemy.alive) continue;
        const d = dist(client, enemy);
        const angle = Math.atan2(enemy.y - client.y, enemy.x - client.x);
        if (d < stats.range + enemy.radius && angleDiff(angle, aim) < 1.2) {
          this.damageEnemy(room, enemy, damage, client, crit, classId === 'cleric' ? 'holy' : 'slash');
        }
      }
      this.sfxRoom(room, 'swing');
    } else if (classId === 'archer') {
      this.spawnProjectile(room, {
        x: startX, y: startY,
        vx: Math.cos(aim) * 540,
        vy: Math.sin(aim) * 540,
        damage, crit, ownerId: client.id,
        kind: 'arrow', radius: 5, life: 2.2
      });
      this.sfxRoom(room, 'arrow');
    } else if (classId === 'summoner') {
      this.spawnProjectile(room, {
        x: startX, y: startY,
        vx: Math.cos(aim) * 440,
        vy: Math.sin(aim) * 440,
        damage, crit, ownerId: client.id,
        kind: 'arcane', aoe: 35, radius: 7, life: 2.2
      });
      this.sfxRoom(room, 'magic');
    } else {
      this.spawnProjectile(room, {
        x: startX, y: startY,
        vx: Math.cos(aim) * 350,
        vy: Math.sin(aim) * 350,
        damage, crit, ownerId: client.id,
        kind: 'fireball', aoe: 54, radius: 8, life: 2.4
      });
      this.sfxRoom(room, 'magic');
    }
  }

  // ---------- Skills ----------

  handleSkill(client, message) {
    if (!client.alive) return;
    const index = Math.floor(Number(message.index));
    const classId = client.character.classId;
    if (!Number.isInteger(index) || index < 0 || index > 3) { this.error(client, 'Invalid skill index.'); return; }

    const def = SKILLS[classId][index];
    if (!def) { this.error(client, 'Skill not found.'); return; }
    if (client.skillCd[index] > 0) { this.error(client, `${def.name} is cooling down.`); return; }
    if (client.mp < def.cost) { this.error(client, 'Need energy!'); return; }

    // Dash-style skills also use a small amount of stamina.
    const staminaCost = (classId === 'swordsman' && index === 0) || (classId === 'archer' && index === 1) ? 15 : 0;
    if (client.stamina < staminaCost) { this.error(client, 'Not enough stamina.'); return; }

    const room = this.rooms.get(client.roomId);
    if (!room) return;
    const lockedTarget = this.applyLockAim(client, message);

    client.mp -= def.cost;
    client.stamina -= staminaCost;
    client.inCombat = 3;

    const stats = this.statsFor(client);
    const rank = clamp(Number(client.character.skillRanks[index]) || 1, 1, 5);
    const power = 1 + (rank - 1) * 0.28;
    client.skillCd[index] = def.cd * (1 - (rank - 1) * 0.08) * stats.cooldownMult;
    const baseDamage = stats.attack * power;
    const aim = client.aim || client.facing || 0;
    const cos = Math.cos(aim);
    const sin = Math.sin(aim);
    const ox = client.x;
    const oy = client.y;
    const colors = classId === 'swordsman'
      ? ['#dceeff', '#8fd0ff', '#eaf4ff', '#d2c2a0']
      : classId === 'archer'
        ? ['#b9ffcb', '#b9ffcb', '#8ee46d', '#a8e8ff']
        : classId === 'cleric'
          ? ['#ffd75e', '#a8f0cd', '#8ee6ff', '#fff3a8']
          : classId === 'rogue'
            ? ['#52ffb8', '#8a9ba8', '#a8ff78', '#ff4d6d']
            : classId === 'summoner'
              ? ['#d7b8ff', '#bf7fff', '#70d6ff', '#e08bff']
              : ['#9ce7ff', '#d7b8ff', '#ff9c42', '#e7b8ff'];
    const fxColor = colors[index];

    client.skillAnim = 0.55;
    client.skillAnimColor = fxColor;
    client.skillAnimName = def.name;

    const fx = {
      visual: 'skill', ownerId: client.id, ownerName: client.character.name, classId, index,
      x: ox, y: oy, aim, name: def.name, color: fxColor,
      tx: ox + cos * 100, ty: oy + sin * 100
    };

    this.sfxRoom(room, 'skill');
    this.event(client, 'system', { text: `${client.character.name} used ${def.name}!`, color: fxColor });

    if (classId === 'swordsman') {
      if (index === 0) {
        // Dash Strike: hit anything near the dash path.
        client.facing = aim;
        client.dashDir = aim;
        client.dashTime = 0.2;
        const tx = ox + cos * 95;
        const ty = oy + sin * 95;
        fx.tx = tx;
        fx.ty = ty;
        const segDist = (px, py) => {
          const vx = tx - client.x;
          const vy = ty - client.y;
          const t = clamp(((px - client.x) * vx + (py - client.y) * vy) / (vx * vx + vy * vy || 1), 0, 1);
          return Math.hypot(px - (client.x + vx * t), py - (client.y + vy * t));
        };
        for (const enemy of room.enemies.values()) {
          if (enemy.alive && segDist(enemy.x, enemy.y) < 42) {
            this.damageEnemy(room, enemy, baseDamage * 1.7, client, true, 'dash');
          }
        }
      } else if (index === 1) {
        client.shieldTime = 3; // 80% damage reduction in damagePlayer().
      } else if (index === 2) {
        this.areaDamage(room, client.x, client.y, 105, baseDamage * 1.4, client, 'whirlwind');
      } else {
        this.areaDamage(room, client.x, client.y, 145, baseDamage * 1.6, client, 'seismic', { slow: 0.35 });
        fx.tx = client.x;
        fx.ty = client.y;
      }
    } else if (classId === 'archer') {
      if (index === 0) {
        for (const spread of [-0.20, 0, 0.20]) {
          const a = aim + spread;
          this.spawnProjectile(room, {
            x: client.x + Math.cos(a) * 14,
            y: client.y - 10 + Math.sin(a) * 14,
            vx: Math.cos(a) * 560,
            vy: Math.sin(a) * 560,
            damage: baseDamage * 0.75,
            ownerId: client.id,
            kind: 'arrow', radius: 5, life: 2
          });
        }
      } else if (index === 1) {
        client.facing = aim;
        client.dashDir = aim;
        client.dashTime = 0.16;
        client.invuln = 0.65;
        fx.tx = ox + cos * 70;
        fx.ty = oy + sin * 70;
      } else if (index === 2) {
        fx.tx = ox + cos * 160;
        fx.ty = oy + sin * 160;
        this.spawnProjectile(room, {
          x: client.x + cos * 14,
          y: client.y - 10 + sin * 14,
          vx: cos * 500,
          vy: sin * 500,
          damage: baseDamage * 0.9,
          ownerId: client.id,
          kind: 'poison', radius: 6, life: 2.2,
          poison: 6 * power
        });
      } else {
        const point = this.skillTargetPoint(client, room, message, lockedTarget, 320, 320);
        fx.tx = point.x;
        fx.ty = point.y;
        this.areaDamage(room, point.x, point.y, 112, baseDamage * 1.5, client, 'arrowRain');
      }
    } else if (classId === 'cleric') {
      if (index === 0) { // Holy Smite
        const point = this.skillTargetPoint(client, room, message, lockedTarget, 180, 180);
        fx.tx = point.x;
        fx.ty = point.y;
        this.areaDamage(room, point.x, point.y, 65, baseDamage * 1.7, client, 'holy');
        this.sfxRoom(room, 'magic');
      } else if (index === 1) { // Divine Heal
        const healAmt = Math.round((def.healSelf || 65) * power);
        client.hp = clamp(client.hp + healAmt, 1, stats.maxHp);
        this.eventRoom(room, 'floater', { x: client.x, y: client.y - 42, text: `+${healAmt}`, color: '#8ee6a8' });
        // Heal party members in room
        for (const other of room.players) {
          if (other !== client && client.party && client.party.has(other) && other.alive) {
            const partyHeal = Math.round((def.healParty || 45) * power);
            other.hp = clamp(other.hp + partyHeal, 1, this.statsFor(other).maxHp);
            this.eventRoom(room, 'floater', { x: other.x, y: other.y - 42, text: `+${partyHeal}`, color: '#8ee6a8' });
          }
        }
        this.sfxRoom(room, 'pickup');
      } else if (index === 2) { // Aegis Ward
        client.shieldTime = 4;
        client.stamina = Math.min(100, client.stamina + 25);
        this.eventRoom(room, 'floater', { x: client.x, y: client.y - 42, text: 'Aegis Ward!', color: '#ffd75e' });
      } else { // Radiant Nova
        this.areaDamage(room, client.x, client.y, 125, baseDamage * 2.2, client, 'holy');
        const healAmt = Math.round((def.healParty || 35) * power);
        client.hp = clamp(client.hp + healAmt, 1, stats.maxHp);
        this.eventRoom(room, 'floater', { x: client.x, y: client.y - 42, text: `+${healAmt}`, color: '#ffd75e' });
        for (const other of room.players) {
          if (other !== client && dist(client, other) < 125) {
            other.hp = clamp(other.hp + healAmt, 1, this.statsFor(other).maxHp);
            this.eventRoom(room, 'floater', { x: other.x, y: other.y - 42, text: `+${healAmt}`, color: '#ffd75e' });
          }
        }
      }
    } else if (classId === 'rogue') {
      if (index === 0) { // Shadow Strike (teleport behind target)
        const point = this.skillTargetPoint(client, room, message, lockedTarget, 110, 110);
        let tx = point.x;
        let ty = point.y;
        if (lockedTarget && dist(point, lockedTarget) < 70) {
          tx = lockedTarget.x - Math.cos(lockedTarget.facing || 0) * 28;
          ty = lockedTarget.y - Math.sin(lockedTarget.facing || 0) * 28;
        }
        tx = clamp(tx, 40, room.w * TILE - 40);
        ty = clamp(ty, 40, room.h * TILE - 40);
        // Stop at the first solid tile instead of landing inside a wall/tree.
        let nx = client.x;
        let ny = client.y;
        const steps = Math.max(1, Math.ceil(dist(client, { x: tx, y: ty }) / 10));
        for (let i = 1; i <= steps; i++) {
          const px = lerp(client.x, tx, i / steps);
          const py = lerp(client.y, ty, i / steps);
          if (this.isBlocked(room, px, py, 12)) break;
          nx = px;
          ny = py;
        }
        client.x = nx;
        client.y = ny;
        fx.tx = nx;
        fx.ty = ny;
        this.areaDamage(room, nx, ny, 60, baseDamage * 2.7, client, 'slash');
        this.sfxRoom(room, 'swing');
      } else if (index === 1) { // Smoke Bomb
        client.invuln = 2.5;
        client.hasteTime = 2.5;
        this.areaDamage(room, client.x, client.y, 80, baseDamage * 0.5, client, 'smoke', { slow: 0.5 });
        this.eventRoom(room, 'floater', { x: client.x, y: client.y - 42, text: 'Vanish!', color: '#52ffb8' });
      } else if (index === 2) { // Poison Dart
        this.spawnProjectile(room, {
          x: client.x + cos * 14,
          y: client.y - 10 + sin * 14,
          vx: cos * 620,
          vy: sin * 620,
          damage: baseDamage * 1.0,
          ownerId: client.id,
          kind: 'poison', radius: 5, life: 2.0,
          poison: 10 * power
        });
        this.sfxRoom(room, 'arrow');
      } else { // Eviscerate
        const point = this.skillTargetPoint(client, room, message, lockedTarget, 70, 70);
        fx.tx = point.x;
        fx.ty = point.y;
        this.areaDamage(room, point.x, point.y, 75, baseDamage * 3.0, client, 'slash');
        this.sfxRoom(room, 'swing');
      }
    } else if (classId === 'summoner') {
      if (index === 0) { // Arcane Blast
        this.spawnProjectile(room, {
          x: client.x + cos * 14,
          y: client.y - 10 + sin * 14,
          vx: cos * 480,
          vy: sin * 480,
          damage: baseDamage * 1.3,
          ownerId: client.id,
          kind: 'arcane', aoe: 40, radius: 7, life: 2.2
        });
        this.sfxRoom(room, 'magic');
      } else if (index === 1) { // Summon Familiar
        this.areaDamage(room, client.x, client.y, 90, baseDamage * 0.6, client, 'summon');
        client.familiarTime = 12;
        client.familiarCd = 0.5;
        this.eventRoom(room, 'fx', {
          visual: 'familiar', ownerId: client.id, ownerName: client.character.name,
          classId, x: client.x, y: client.y, color: fxColor
        });
        this.eventRoom(room, 'floater', { x: client.x, y: client.y - 42, text: 'Familiar Risen!', color: '#e08bff' });
        this.sfxRoom(room, 'magic');
      } else if (index === 2) { // Spirit Ward
        client.shieldTime = 5;
        client.mp = Math.min(stats.maxMp, client.mp + 25);
        this.eventRoom(room, 'floater', { x: client.x, y: client.y - 42, text: 'Spirit Ward!', color: '#70d6ff' });
      } else { // Soul Nova
        this.areaDamage(room, client.x, client.y, 135, baseDamage * 2.6, client, 'shadow');
        this.sfxRoom(room, 'magic');
      }
    } else { // Mage
      if (index === 0) {
        this.areaDamage(room, client.x, client.y, 135, baseDamage * 0.85, client, 'ice', { slow: 0.45 });
      } else if (index === 1) {
        // Blink toward the cursor in small steps so we never land inside a wall.
        let nx = client.x;
        let ny = client.y;
        for (let s = 0; s <= 1; s += 0.05) {
          const px = lerp(client.x, client.x + cos * 170, s);
          const py = lerp(client.y, client.y + sin * 170, s);
          if (this.isBlocked(room, px, py, 12)) break;
          nx = px;
          ny = py;
        }
        fx.tx = nx;
        fx.ty = ny;
        client.x = nx;
        client.y = ny;
        this.sfxRoom(room, 'blink');
      } else if (index === 2) {
        // Meteor lands on the explicit cursor target (or the lock when no point).
        const point = this.skillTargetPoint(client, room, message, lockedTarget, 260, 260);
        fx.tx = point.x;
        fx.ty = point.y;
        this.scheduleMeteor(room, point.x, point.y, baseDamage * 2.6, client.id);
      } else {
        const point = this.skillTargetPoint(client, room, message, lockedTarget, 220, 220);
        fx.tx = point.x;
        fx.ty = point.y;
        this.areaDamage(room, point.x, point.y, 105, baseDamage * 1.8, client, 'arcane');
      }
    }

    this.eventRoom(room, 'fx', fx);
    this.sendCharacter(client); // mp / stamina changed
  }

  // ---------- Interaction and rooms ----------

  handleOpenChest(client, message = {}) {
    const room = this.rooms.get(client.roomId);
    const chest = room && room.pickups.get(Number(message.id));
    if (!chest || chest.kind !== 'chest' || chest.collected) {
      this.error(client, 'That boss chest is no longer available.');
      return;
    }
    if (!chest.ownerIds?.some(id => String(id) === String(client.id))) {
      this.error(client, 'This chest is reserved for the boss party.');
      return;
    }
    if (chest.openedBy?.some(id => String(id) === String(client.id))) {
      this.error(client, 'You already opened your share of this chest.');
      return;
    }
    if (dist(client, chest) >= 76) {
      this.error(client, 'Move closer to the boss chest.');
      return;
    }

    const reward = chest.rewards && chest.rewards[String(client.id)];
    if (reward && !this.canAddItem(client, reward)) {
      this.error(client, 'Inventory is full. Make room before opening this chest.');
      return;
    }
    if (reward && this.addItem(client, reward)) {
      this.event(client, 'loot', { name: reward.name, rarity: reward.rarity });
      this.event(client, 'system', { text: `Boss chest opened: ${reward.name}!`, color: RARITY[reward.rarity]?.color || '#ffd75e' });
    } else {
      client.character.gold += 100;
      this.event(client, 'system', { text: 'Your bag is full. The chest reward became 100 gold.', color: '#ffd75e' });
    }
    chest.openedBy = Array.isArray(chest.openedBy) ? chest.openedBy : [];
    chest.openedBy.push(client.id);
    chest.age = 0;
    if (chest.openedBy.length >= chest.ownerIds.length) room.pickups.delete(chest.id);
    this.sfx(client, 'pickup');
    this.sendCharacter(client);
  }

  handleWorldTravel(client, message) {
    const room = this.rooms.get(client.roomId);
    if (!room || !room.public) { this.error(client, 'Leave the dungeon before using the world map.'); return; }
    const targetId = String((message && message.zoneId) || '');
    const destination = this.rooms.get(targetId);
    if (!destination || !destination.public) { this.error(client, 'That map is not available.'); return; }
    if (targetId === client.roomId) return;
    this.changeRoom(client, destination, ZONE_SPAWN[targetId] || { x: 520, y: 420 });
    this.sfx(client, 'portal');
  }

  handleInteract(client) {
    const room = this.rooms.get(client.roomId);
    if (!room) return;

    let best = null;
    let bestDistance = 68;

    for (const portal of room.portals) {
      const d = dist(client, portal);
      if (d < bestDistance) { best = { kind: 'portal', object: portal }; bestDistance = d; }
    }
    for (const npc of room.npcs) {
      const d = dist(client, npc);
      if (d < bestDistance) { best = { kind: 'npc', object: npc }; bestDistance = d; }
    }

    if (!best) { this.system(client, 'Nothing to interact with nearby.', '#9aa6bd'); return; }

    if (best.kind === 'portal') {
      const destination = this.rooms.get(best.object.to);
      if (!destination) { this.error(client, 'That portal is inactive.'); return; }
      this.changeRoom(client, destination, best.object.arrive);
      this.sfx(client, 'portal');
      return;
    }

    const npc = best.object;
    this.sfx(client, 'ui');
    if (npc.type === 'shop') {
      this.emitShopList(client);
    } else if (npc.type === 'guard') {
      this.event(client, 'system', { text: `${npc.name}: Three wardstones seal Mount Veyr. One is dark already; the forest road may hold the first clue.`, color: '#9ce7ff' });
    } else if (npc.type === 'healer') {
      this.event(client, 'system', { text: `${npc.name}: The herbs glow when the wardstones weaken. They may restore the first ward—and reveal what lies below.`, color: '#a8f0cd' });
    } else if (npc.type === 'scout') {
      const clue = client.character.quest.stage >= 3
        ? 'The Shards of the Dunes scouts carry purple seal-essence. Follow it back to Mount Veyr.'
        : 'I saw a cold light below Mount Veyr. The cave road is only the second part of the trail; it continues into the dunes.';
      this.event(client, 'system', { text: `${npc.name}: ${clue}`, color: '#c7e8ff' });
    } else if (npc.type === 'blacksmith') {
      this.event(client, 'system', { text: `${npc.name}: Goblins are mining the wardstone ore beneath the mountain. Bring some back and I can mend your gear.`, color: '#ffc18b' });
    } else if (npc.type === 'villager') {
      this.event(client, 'system', { text: `${npc.name}: The slimes came when the first ward went dark. Elder Tarn says their trail leads to a much older secret.`, color: '#f0d28e' });
    } else {
      const quest = client.character.quest;
      const status = quest.claimed
        ? 'You restored all three wardstones and uncovered the source of the cold light. Hearthvale will remember you, hero!'
        : quest.complete
          ? 'You finished this chapter! Return to the journal and turn it in.'
          : quest.active
            ? quest.stage === 3
              ? `Shards of the Dunes: ${quest.scouts}/8 scouts, ${quest.essence}/3 essence.`
              : quest.stage === 2
                ? `Echoes Below: ${quest.goblins}/8 goblins, ${quest.ore}/4 ore.`
                : `The Waking Forest: ${quest.kills}/10 slimes, ${quest.herbs}/5 herbs.`
            : quest.stage === 3
              ? 'Chapter III — Shards of the Dunes: defeat 8 scouts and recover 3 seal-essence in the desert.'
              : quest.stage === 2
                ? 'Chapter II — Echoes Below: defeat 8 goblins and bring 4 wardstone ore from the cave.'
                : 'Chapter I — The Waking Forest: defeat 10 slimes and gather 5 glowing herbs for the first ward.';
      this.event(client, 'system', { text: `${npc.name}: ${status}`, color: '#ffd75e' });
    }
  }

  changeRoom(client, room, arrive) {
    if (!room) return;
    const oldRoom = this.rooms.get(client.roomId);
    if (oldRoom) oldRoom.players.delete(client);

    client.roomId = room.id;
    client.x = arrive.x;
    client.y = arrive.y;
    if (this.isBlocked(room, client.x, client.y, 12)) {
      const spawn = room.public ? ZONE_SPAWN[room.zoneId] : DUNGEON_SPAWN;
      client.x = spawn.x;
      client.y = spawn.y;
    }
    room.players.add(client);

    if (room.public) {
      const visited = new Set(Array.isArray(client.character.zonesVisited) ? client.character.zonesVisited : []);
      if (!visited.has(room.zoneId)) {
        visited.add(room.zoneId);
        client.character.zonesVisited = [...visited];
        updateAchievementProgress(client.character, 'zones_visited', 1, this, client);
      }
    }

    this.sendInit(client, room);
    this.sendCharacter(client);
    const roomName = !room.public ? 'the dungeon' : room.zoneId === 'village' ? 'Hearthvale Village' : room.zoneId;
    this.system(client, `Entered ${roomName}!`, '#c9a6ff');
    this.cleanupEmptyDungeon(oldRoom);
  }

  cleanupEmptyDungeon(room) {
    if (room && !room.public && room.players.size === 0) this.rooms.delete(room.id);
  }

  handleDungeon(client) {
    const current = this.rooms.get(client.roomId);
    if (current && !current.public) { this.error(client, 'You are already in a dungeon.'); return; }

    // Bring the party leader and every online party member along.
    const group = [client, ...client.party].filter(c => this.clients.has(c) && c.roomId && c.character);
    const oldRooms = group.map(c => this.rooms.get(c.roomId));
    const room = this.makeDungeonRoom(group.map(c => c.accountId));

    group.forEach((member, i) => {
      const oldRoom = this.rooms.get(member.roomId);
      if (oldRoom) oldRoom.players.delete(member);
      member.roomId = room.id;
      member.x = DUNGEON_SPAWN.x + (i % 3) * 26;
      member.y = DUNGEON_SPAWN.y + Math.floor(i / 3) * 26;
      room.players.add(member);
      this.sendInit(member, room);
      this.sendCharacter(member);
      this.system(member, 'Your party entered a private boss dungeon!', '#ffb35c');
    });

    for (const oldRoom of oldRooms) this.cleanupEmptyDungeon(oldRoom);
    this.eventRoom(room, 'sfx', { name: 'boss' });
  }

  handleLeaveDungeon(client) {
    const room = this.rooms.get(client.roomId);
    if (!room || room.public) { this.error(client, 'You are not in a dungeon.'); return; }
    this.changeRoom(client, this.rooms.get('forest'), ZONE_SPAWN.forest);
  }

  handleEmote(client) {
    client.emote = { text: pick(EMOTES), time: 2.2 };
    this.sfx(client, 'ui');
  }

  handleParty(client) {
    const room = this.rooms.get(client.roomId);
    if (!room) return;
    let best = null;
    let bestDistance = 300;

    for (const other of room.players) {
      if (other === client || !other.alive || !other.character) continue;
      if (client.party.has(other)) continue;
      const d = dist(client, other);
      if (d < bestDistance) { best = other; bestDistance = d; }
    }

    if (!best) { this.error(client, 'No nearby player can join your party.'); return; }
    const members = new Set([client, ...client.party, best, ...best.party]);
    if (members.size > 4) {
      this.error(client, 'Your party is full (4 players maximum).');
      return;
    }

    const leaderId = client.partyLeaderId || best.partyLeaderId || client.id;
    const leader = [...members].find(member => String(member.id) === String(leaderId)) || client;
    // Keep every party member linked to every other member. This makes the
    // HUD and private raid roster agree even when a member invites someone.
    for (const member of members) {
      member.party = new Set([...members].filter(other => other !== member));
      member.partyLeaderId = leader.id;
    }
    for (const member of members) {
      this.event(member, 'party', { text: `${best.character.name} joined the party. ${leader.character.name} is the leader.` });
      this.sfx(member, 'pickup');
    }
  }

  removePartyMember(client, notify = true) {
    const members = [...(client.party || [])];
    const oldLeaderId = client.partyLeaderId;
    client.party?.clear();
    client.partyLeaderId = null;
    if (!members.length) return false;

    const remainingLeader = members.find(member => String(member.id) === String(oldLeaderId)) || members[0];
    for (const member of members) {
      member.party = new Set(members.filter(other => other !== member));
      member.partyLeaderId = remainingLeader.id;
      const message = String(oldLeaderId) === String(client.id)
        ? `${client.character?.name || 'A player'} left. ${remainingLeader.character?.name || 'A player'} is the new leader.`
        : `${client.character?.name || 'A player'} left the party.`;
      this.event(member, 'party', { text: message });
    }
    if (notify) this.event(client, 'party', { text: 'You left the party.' });
    return true;
  }

  handlePartyLeave(client) {
    if (!this.removePartyMember(client)) this.error(client, 'You are not in a party.');
  }

  handlePartyDisband(client) {
    if (!client.party.size) { this.error(client, 'You are not in a party.'); return; }
    if (String(client.partyLeaderId) !== String(client.id)) {
      this.error(client, 'Only the party leader can disband the party.');
      return;
    }

    const members = [client, ...client.party];
    for (const member of members) {
      member.party.clear();
      member.partyLeaderId = null;
      this.event(member, 'party', { text: `${client.character.name} disbanded the party.` });
    }
  }

  // ---------- Potions, equipment and progression ----------

  // `uid` is optional: potion {} uses the first potion, usePotion {uid} is exact.
  consumePotion(client, uid) {
    const inventory = client.character.inventory || [];
    let index = -1;
    if (uid !== null && uid !== undefined) index = inventory.findIndex(item => item && item.uid === uid);
    else {
      // Prefer a potion that can actually help right now; otherwise fall back to
      // any healing/mana potion so the player gets a useful error message.
      index = inventory.findIndex(item => item && item.slot === 'consumable' &&
        ((item.heal > 0 && client.hp < client.maxHp) || (item.mana > 0 && client.mp < client.maxMp)));
      if (index < 0) index = inventory.findIndex(item => item && item.slot === 'consumable' &&
        ((item.heal > 0) || (item.mana > 0)));
      if (index < 0) index = inventory.findIndex(item => item && item.slot === 'consumable' && item.teleportTo === 'village');
    }

    const item = index >= 0 ? inventory[index] : null;
    if (!item || item.slot !== 'consumable') {
      this.error(client, 'No potion found.');
      return;
    }
    if (item.teleportTo === 'village') {
      const room = this.rooms.get(client.roomId);
      if (room && room.zoneId === 'village') { this.error(client, 'You are already in the village.'); return; }
      const destination = this.rooms.get('village');
      if (!destination || !destination.public) { this.error(client, 'The village is unavailable right now.'); return; }
      if ((item.quantity || 1) > 1) item.quantity--;
      else inventory.splice(index, 1);
      this.changeRoom(client, destination, ZONE_SPAWN.village);
      this.sfx(client, 'portal');
      this.system(client, 'The teleport scroll carried you to Hearthvale Village.', '#c9a6ff');
      return;
    }

    const canHeal = item.heal > 0 && client.hp < client.maxHp;
    const canRestoreMana = item.mana > 0 && client.mp < client.maxMp;
    if (!canHeal && !canRestoreMana) {
      this.error(client, item.heal > 0 ? 'HP is already full.' : 'MP is already full.');
      return;
    }

    const healed = canHeal ? Math.min(client.maxHp - client.hp, item.heal) : 0;
    const restored = canRestoreMana ? Math.min(client.maxMp - client.mp, item.mana) : 0;
    client.hp += healed;
    client.mp += restored;
    if ((item.quantity || 1) > 1) item.quantity--;
    else inventory.splice(index, 1);
    const label = healed && restored ? `Restored ${Math.round(healed)} HP and ${Math.round(restored)} MP.`
      : restored ? `Restored ${Math.round(restored)} MP.` : `Restored ${Math.round(healed)} HP.`;
    this.event(client, 'system', { text: label, color: restored ? '#7bc8ff' : '#7bff9b' });
    this.event(client, 'sfx', { name: 'pickup' });
    this.sendCharacter(client);
  }

  handleEquip(client, message) {
    const slot = String(message.slot || '');
    if (!VALID_EQUIP_SLOTS.includes(slot)) { this.error(client, 'Invalid equipment slot.'); return; }
    const inventory = client.character.inventory || [];
    const index = inventory.findIndex(item => item && item.uid === message.uid);
    if (index < 0) { this.error(client, 'Item not found in your bag.'); return; }

    const item = normalizeItem(inventory[index], client.character.classId);
    if (!item || item.slot !== slot) { this.error(client, 'That item does not fit this slot.'); return; }
    if (!itemCanEquip(item, client.character.classId)) {
      this.error(client, 'That item cannot be equipped by your class.');
      return;
    }

    const old = client.character.equipment[slot];
    inventory[index] = item;
    inventory.splice(index, 1);
    client.character.equipment[slot] = item;
    if (old) inventory.push(normalizeItem(old));

    this.syncVitals(client);
    this.event(client, 'sfx', { name: 'ui' });
    this.sendCharacter(client);
  }

  handleUnequip(client, message) {
    const slot = String(message.slot || '');
    if (!VALID_EQUIP_SLOTS.includes(slot)) { this.error(client, 'Invalid equipment slot.'); return; }
    const item = client.character.equipment[slot];
    if (!item) { this.error(client, 'That slot is empty.'); return; }
    if ((client.character.inventory || []).length >= 20) { this.error(client, 'Inventory is full.'); return; }

    client.character.equipment[slot] = null;
    client.character.inventory.push(normalizeItem(item, client.character.classId));
    this.syncVitals(client);
    this.event(client, 'sfx', { name: 'ui' });
    this.sendCharacter(client);
  }

  handleSellItem(client, message) {
    const inventory = client.character.inventory || [];
    const index = inventory.findIndex(item => item && item.uid === message.uid);
    if (index < 0) { this.error(client, 'Item not found in your bag.'); return; }
    const [item] = inventory.splice(index, 1);
    const value = itemSellValue(normalizeItem(item, client.character.classId));
    client.character.gold = Math.max(0, Number(client.character.gold) || 0) + value;
    this.event(client, 'system', { text: `Sold ${item.name} for ${value} gold.`, color: '#ffd75e' });
    this.sfx(client, 'pickup');
    this.sendCharacter(client);
    this.saveClient(client, false);
  }

  handleDiscardItem(client, message) {
    const inventory = client.character.inventory || [];
    const index = inventory.findIndex(item => item && item.uid === message.uid);
    if (index < 0) { this.error(client, 'Item not found in your bag.'); return; }
    const [item] = inventory.splice(index, 1);
    this.event(client, 'system', { text: `Discarded ${item.name}.`, color: '#9fb0cd' });
    this.sfx(client, 'ui');
    this.sendCharacter(client);
    this.saveClient(client, false);
  }

  handleSkillUp(client, message) {
    const index = Math.floor(Number(message.index));
    if (!Number.isInteger(index) || index < 0 || index > 3) { this.error(client, 'Invalid skill index.'); return; }
    const ranks = normalizeSkillRanks(client.character.skillRanks);
    client.character.skillRanks = ranks;
    if (ranks[index] >= 5) { this.error(client, 'That skill is already at rank 5.'); return; }
    if ((client.character.skillPoints || 0) < 1) { this.error(client, 'No skill points available.'); return; }

    client.character.skillPoints -= 1;
    ranks[index] += 1;
    this.event(client, 'system', { text: `${SKILLS[client.character.classId][index].name} is now rank ${ranks[index]}.`, color: '#ffd75e' });
    this.sendCharacter(client);
  }

  handleTalent(client, message) {
    const id = String(message.id || '');

    // Also accept "skill0".."skill3" here for older clients.
    const match = /^skill([0-3])$/.exec(id);
    if (match) { this.handleSkillUp(client, { index: Number(match[1]) }); return; }

    if (!TALENT_IDS.includes(id)) { this.error(client, 'Unknown talent.'); return; }
    const talents = client.character.talents || (client.character.talents = Object.fromEntries(TALENT_IDS.map(t => [t, 0])));
    if ((talents[id] || 0) >= 3) { this.error(client, 'That talent is already maxed.'); return; }
    if ((client.character.skillPoints || 0) < 1) { this.error(client, 'No skill points available.'); return; }

    client.character.skillPoints -= 1;
    talents[id] = (talents[id] || 0) + 1;
    this.syncVitals(client);
    this.event(client, 'system', { text: `${id} talent is now rank ${talents[id]}.`, color: '#ffd75e' });
    this.sendCharacter(client);
  }

  handleSpec(client, message) {
    const spec = String(message.spec || '');
    const character = client.character;
    const allowed = SPECIALIZATIONS[character.classId] || [];
    if (!allowed.includes(spec)) { this.error(client, 'Invalid specialisation for your class.'); return; }
    if ((character.level || 1) < 10) { this.error(client, 'Specialisations unlock at level 10.'); return; }
    if (character.spec) { this.error(client, 'Your specialisation is already chosen.'); return; }

    character.spec = spec;
    this.syncVitals(client);
    this.event(client, 'system', { text: `You specialised as ${spec}!`, color: '#ffd75e' });
    this.sfx(client, 'level');
    this.sendCharacter(client);
  }

  emitShopList(client) {
    let items = (client.character.shopStock || []).map(item => normalizeItem(item, client.character.classId)).filter(Boolean);
    // Older cloud saves predate the role relics; refresh the last three slots.
    if (!items.some(item => item.art && String(item.art).startsWith('role'))) {
      const fresh = makeShopStock(client.character.classId);
      items = items.slice(0, 3).concat(fresh.slice(3));
      client.character.shopStock = items;
    }
    this.event(client, 'shopList', { items });
  }

  handleShopBuy(client, message) {
    const index = Math.floor(Number(message.index));
    const stock = client.character.shopStock || (client.character.shopStock = makeShopStock(client.character.classId));
    if (!Number.isInteger(index) || index < 0 || index >= stock.length) { this.error(client, 'Invalid shop item.'); return; }

    const item = normalizeItem(stock[index], client.character.classId);
    if (!item) { this.error(client, 'That item is sold out.'); return; }
    if (client.character.gold < item.price) { this.error(client, 'Not enough gold.'); return; }
    if (!this.canAddItem(client, item)) { this.error(client, 'Inventory is full.'); return; }

    client.character.gold -= item.price;
    this.addItem(client, item);
    stock[index] = randomShopItem(index, client.character.classId);
    this.event(client, 'system', { text: `Bought ${item.name} for ${item.price} gold.`, color: RARITY[item.rarity].color });
    this.sfx(client, 'pickup');
    this.emitShopList(client);
    this.sendCharacter(client);
  }

  handleQuestAccept(client) {
    const quest = client.character.quest;
    if (quest.claimed) { this.error(client, 'You have restored all three wardstones.'); return; }
    if (quest.complete) { this.handleQuestTurnIn(client); return; }
    if (quest.active) { this.error(client, 'This quest was already accepted. Finish its objectives and turn it in for your reward.'); return; }
    quest.active = true;
    const chapter = quest.stage === 3 ? 'Chapter III — Shards of the Dunes'
      : quest.stage === 2 ? 'Chapter II — Echoes Below' : 'Chapter I — The Waking Forest';
    const opening = quest.stage === 3
      ? 'Elder Tarn: The repaired ward showed us the truth. The desert scouts carry the missing seal-essence.'
      : quest.stage === 2
        ? 'Elder Tarn: The herbs revealed a map to a buried gate beneath Mount Veyr.'
        : 'Elder Tarn: The seal has cracked. The forest wards are our first defense.';
    const objective = quest.stage === 3
      ? 'Defeat 8 scouts and gather 3 essence in the desert.'
      : quest.stage === 2
        ? 'Defeat 8 goblins and gather 4 ore in the cave.'
        : 'Defeat 10 slimes and gather 5 herbs in the forest.';
    this.event(client, 'quest', { text: `${chapter}. ${opening} ${objective}` });
    this.sfx(client, 'ui');
    this.sendCharacter(client);
  }

  handleQuestTurnIn(client) {
    const quest = client.character.quest;
    if (!quest.complete || quest.claimed) { this.error(client, 'The quest is not ready to turn in.'); return; }

    if (quest.stage < 3) {
      const completedStage = quest.stage;
      const rewards = completedStage === 1 ? { gold: 100, xp: 180 } : { gold: 140, xp: 260 };
      quest.stage++;
      quest.active = false;
      quest.complete = false;
      quest.kills = 0;
      quest.herbs = 0;
      quest.goblins = 0;
      quest.ore = 0;
      quest.scouts = 0;
      quest.essence = 0;
      client.character.gold += rewards.gold;
      this.gainXp(client, rewards.xp, false);
      const completedChapter = completedStage === 1 ? 'The Waking Forest' : 'Echoes Below';
      const nextChapter = completedStage === 1 ? 'Echoes Below' : 'Shards of the Dunes';
      this.event(client, 'quest', { text: `${completedChapter} complete! +${rewards.gold} gold, +${rewards.xp} XP. ${nextChapter} unlocked.` });
      this.sfx(client, 'level');
      this.sendCharacter(client);
      return;
    }

    quest.claimed = true;
    quest.active = false;
    client.character.gold += 220;
    this.gainXp(client, 420, false);

    const reward = makeItem('Elder Amulet', 'armor', 'epic', { hp: 30, defense: 6, mana: 20, manaRegen: 1 }, {
      classId: client.character.classId, spriteColor: '#e3b7ff', icon: 'A', desc: 'A wardstone relic earned by restoring Hearthvale’s seal.'
    });
    if (this.addItem(client, reward)) {
      this.event(client, 'loot', { name: reward.name, rarity: reward.rarity });
    } else {
      client.character.gold += 60;
    }

    this.event(client, 'quest', { text: 'Shards of the Dunes complete! The wardstones shine again, and the cold light beneath Mount Veyr fades. +220 gold, +420 XP, epic reward.' });
    this.sfx(client, 'level');
    this.sendCharacter(client);
  }

  handleCraft(client, message) {
    const recipe = String(message.recipe || '');
    const materials = client.character.materials || (client.character.materials = { herb: 0, ore: 0, essence: 0 });
    let result = null;

    if (recipe === 'potion') {
      result = { cost: { herb: 2, gold: 20 }, item: makeItem('Health Potion', 'consumable', 'common', {}, { icon: 'P', heal: 55, price: 20, desc: 'Restores 55 HP.' }) };
    } else if (recipe === 'sword') {
      if (client.character.classId !== 'swordsman') { this.error(client, 'Only Swordsmen can craft a sword.'); return; }
      result = { cost: { ore: 3, gold: 60 }, item: makeItem('Runed Edge', 'weapon', 'rare', { attack: 12, crit: 0.02 }, { classId: 'swordsman', art: 'sword', effect: 'flame', desc: 'A forged blade for Swordsmen.' }) };
    } else if (recipe === 'armor') {
      result = { cost: { ore: 2, herb: 2, gold: 50 }, item: makeItem('Woven Guard', 'armor', 'rare', { hp: 24, defense: 5, manaRegen: 0.5 }, { classId: client.character.classId, effect: 'frost', desc: 'Sturdy armor woven for your class.' }) };
    } else {
      this.error(client, 'Unknown recipe.');
      return;
    }

    if ((materials.herb || 0) < (result.cost.herb || 0) ||
        (materials.ore || 0) < (result.cost.ore || 0) ||
        client.character.gold < (result.cost.gold || 0)) {
      this.error(client, 'You do not have the materials or gold for that recipe.');
      return;
    }
    if (!this.canAddItem(client, result.item)) { this.error(client, 'Inventory is full.'); return; }

    for (const key of ['herb', 'ore', 'essence']) materials[key] -= (result.cost[key] || 0);
    client.character.gold -= result.cost.gold || 0;
    this.addItem(client, result.item);
    this.event(client, 'system', { text: `Crafted ${result.item.name}!`, color: RARITY[result.item.rarity].color });
    this.sfx(client, 'pickup');
    this.sendCharacter(client);
  }

  handleEnchant(client, message) {
    const uid = message.uid;
    const inventory = client.character.inventory || [];
    const equipment = client.character.equipment || {};
    let item = inventory.find(i => i && i.uid === uid);
    let location = 'inventory';

    if (!item) {
      for (const slot of VALID_EQUIP_SLOTS) {
        if (equipment[slot] && equipment[slot].uid === uid) { item = equipment[slot]; location = slot; break; }
      }
    }
    if (!item || item.slot === 'consumable') { this.error(client, 'That item cannot be enchanted.'); return; }
    if ((item.enchant || 0) >= 5) { this.error(client, 'That item is already at +5.'); return; }

    const materials = client.character.materials || (client.character.materials = { herb: 0, ore: 0, essence: 0 });
    const essenceCost = 1 + (item.enchant || 0);
    const goldCost = 40 * (1 + (item.enchant || 0));
    if ((materials.essence || 0) < essenceCost || client.character.gold < goldCost) {
      this.error(client, `Enchanting needs ${essenceCost} essence and ${goldCost} gold.`);
      return;
    }

    materials.essence -= essenceCost;
    client.character.gold -= goldCost;
    item.enchant = (item.enchant || 0) + 1;
    updateAchievementProgress(client.character, 'enchants', 1, this, client);
    const effects = ['flame', 'frost', 'void', 'thunder'];
    item.effect = effects[(item.enchant - 1) % effects.length];
    item.color = EFFECT_COLORS[item.effect];
    item.spriteColor = item.color;

    if (item.slot === 'weapon') item.stats.attack = (item.stats.attack || 0) + 2;
    else item.stats.hp = (item.stats.hp || 0) + 3, item.stats.defense = (item.stats.defense || 0) + 1;

    // Keep the arrays/objects tidy after a possible inventory/equipment edit.
    if (location === 'inventory') {
      const index = inventory.indexOf(item);
      if (index >= 0) inventory[index] = normalizeItem(item);
    } else {
      equipment[location] = normalizeItem(item);
    }

    this.syncVitals(client);
    this.event(client, 'system', { text: `${item.name} enchanted to +${item.enchant} (${item.effect})!`, color: item.color });
    this.sfx(client, 'enchant');
    this.sendCharacter(client);
  }

  // ---------- Chat ----------

  handleChat(client, message) {
    const text = String(message.text || '').trim().slice(0, 200);
    if (!text) { this.error(client, 'Chat cannot be empty.'); return; }
    const channel = message.channel === 'guild' ? 'guild' : 'zone';
    const color = CLASS_DATA[client.character.classId]?.color || '#ffffff';
    const payload = { name: client.character.name, text, channel, color };

    if (channel === 'zone') {
      const room = this.rooms.get(client.roomId);
      this.eventRoom(room, 'chat', payload);
      return;
    }

    const memberIds = this.db.guildMemberAccountIds(client.accountId);
    if (!memberIds.includes(client.accountId)) { this.error(client, 'You are not in a guild.'); return; }
    for (const other of this.clients) {
      if (memberIds.includes(other.accountId)) this.event(other, 'chat', payload);
    }
  }

  // ---------- Auction house ----------

  emitAuctionList(client) {
    this.event(client, 'auctionList', { items: this.db.auctionList() });
  }

  handleAuctionAdd(client, message) {
    const price = Math.floor(Number(message.price) || 0);
    if (price < 1) { this.error(client, 'Please choose a valid price.'); return; }

    const inventory = client.character.inventory || [];
    let item = null;
    const reference = message.item;

    const referenceUid = reference && typeof reference === 'object' ? reference.uid : reference;
    if (referenceUid !== undefined && referenceUid !== null) {
      const index = inventory.findIndex(i => i && i.uid === referenceUid);
      if (index < 0) { this.error(client, 'Item not found in your bag.'); return; }
      item = inventory.splice(index, 1)[0];
    }

    if (!item) { this.error(client, 'Item not found.'); return; }
    try {
      this.db.auctionAdd({
        accountId: client.accountId,
        ownerName: client.character.name,
        item: normalizeItem(item),
        price
      });
      this.event(client, 'system', { text: 'Item listed on the auction house.', color: '#ffd75e' });
      this.sfx(client, 'ui');
      this.emitAuctionList(client);
      this.sendCharacter(client);
    } catch (err) {
      inventory.push(item); // give it back if the database failed
      this.error(client, err.message);
    }
  }

  handleAuctionBuy(client, message) {
    const id = Math.floor(Number(message.id));
    try {
      const result = this.db.auctionBuy({ accountId: client.accountId, id });
      // Apply the purchase to the live character. Replacing it with the freshly
      // read DB copy would discard anything that happened since the last save.
      client.character.gold = Math.max(0, (client.character.gold || 0) - result.price);
      if (!this.addItem(client, result.item)) client.character.gold += 15;
      this.event(client, 'system', { text: `Bought ${result.item.name} for ${result.price} gold.`, color: RARITY[result.item.rarity]?.color || '#dedede' });
      this.sfx(client, 'pickup');
      this.emitAuctionList(client);
      this.sendCharacter(client);

      // Update the seller's browser too if they are online, without replacing
      // their live character from a possibly stale DB snapshot.
      const seller = [...this.clients].find(c => c.accountId === result.sellerId);
      if (seller) {
        seller.character.gold = (seller.character.gold || 0) + result.price;
        this.event(seller, 'system', { text: `Your auction sold for ${result.price} gold.`, color: '#ffd75e' });
        this.sendCharacter(seller);
      }
    } catch (err) {
      this.error(client, err.message);
    }
  }

  handleAuctionRemove(client, message) {
    const id = Math.floor(Number(message.id));
    try {
      const item = this.db.auctionRemove({ accountId: client.accountId, id });
      if (!this.addItem(client, item)) client.character.gold += 15;
      this.event(client, 'system', { text: 'Auction removed; item returned to your bag.', color: '#ffd75e' });
      this.emitAuctionList(client);
      this.sendCharacter(client);
    } catch (err) {
      this.error(client, err.message);
    }
  }

  // ---------- Mail ----------

  emitMailList(client) {
    this.event(client, 'mailList', { items: this.db.mailList(client.accountId) });
  }

  handleMailSend(client, message) {
    const recipient = this.db.findAccountByUsername(message.to);
    if (!recipient) { this.error(client, 'That player does not exist.'); return; }

    const gold = Math.max(0, Math.floor(Number(message.gold) || 0));
    if (client.character.gold < gold) { this.error(client, 'Not enough gold to send.'); return; }

    const inventory = client.character.inventory || [];
    let item = null;
    if (message.item) {
      const reference = message.item;
      const uid = typeof reference === 'object' ? reference.uid : reference;
      const index = inventory.findIndex(i => i && i.uid === uid);
      if (index < 0) { this.error(client, 'Item not found in your bag.'); return; }
      item = inventory.splice(index, 1)[0];
    }

    client.character.gold -= gold;
    try {
      this.db.mailSend({
        toAccountId: recipient.id,
        fromName: client.character.name,
        item: item ? normalizeItem(item) : null,
        gold,
        message: message.message
      });
      this.event(client, 'system', { text: `Mail sent to ${recipient.username}.`, color: '#8ee6ff' });
      this.sfx(client, 'ui');
      this.sendCharacter(client);
    } catch (err) {
      if (item) inventory.push(item);
      client.character.gold += gold;
      this.error(client, err.message);
    }
  }

  handleMailTake(client, message) {
    const id = Math.floor(Number(message.id));
    try {
      const mail = this.db.mailTake(client.accountId, id);
      client.character.gold += mail.gold;
      if (mail.item) {
        if (!this.addItem(client, mail.item)) {
          client.character.gold += 15;
          this.event(client, 'system', { text: 'Bag full; item converted to 15 gold.', color: '#ffd75e' });
        }
      }
      this.event(client, 'system', { text: `Claimed mail from ${mail.fromName}.`, color: '#8ee6ff' });
      this.sfx(client, 'pickup');
      this.emitMailList(client);
      this.sendCharacter(client);
    } catch (err) {
      this.error(client, err.message);
    }
  }

  // ---------- Guilds ----------

  emitGuildInfo(client) {
    this.event(client, 'guildInfo', this.db.guildInfoForAccount(client.accountId));
  }

  broadcastGuildInfo(members) {
    for (const member of members || []) {
      const target = [...this.clients].find(c => c.accountId === member.accountId);
      if (target) this.emitGuildInfo(target);
    }
  }

  handleGuildCreate(client, message) {
    try {
      const info = this.db.guildCreate(message.name, client.accountId);
      this.event(client, 'system', { text: `Guild ${info.guild.name} created!`, color: '#ffd75e' });
      this.broadcastGuildInfo(info.members);
    } catch (err) {
      this.error(client, err.message);
    }
  }

  handleGuildJoin(client, message) {
    try {
      const info = this.db.guildJoin(message.name, client.accountId);
      this.event(client, 'system', { text: `You joined ${info.guild.name}.`, color: '#ffd75e' });
      this.broadcastGuildInfo(info.members);
    } catch (err) {
      this.error(client, err.message);
    }
  }

  handleGuildLeave(client) {
    try {
      const previous = this.db.guildInfoForAccount(client.accountId);
      if (!previous.guild) { this.error(client, 'You are not in a guild.'); return; }
      this.db.guildLeave(client.accountId);
      this.event(client, 'system', { text: 'You left your guild.', color: '#ffd75e' });
      this.broadcastGuildInfo(previous.members);
      this.emitGuildInfo(client);
    } catch (err) {
      this.error(client, err.message);
    }
  }

  damagePvPPlayer(room, target, rawDamage, attacker, crit = false) {
    if (!target.character || !target.alive) return;
    const stats = this.statsFor(target);
    const reduction = stats.defense / (stats.defense + 40);
    const damage = Math.max(1, Math.round(rawDamage * (1 - reduction) * stats.damageTakenMult));

    target.hp = Math.max(0, target.hp - damage);
    this.eventRoom(room, 'hit', {
      x: round(target.x, 1),
      y: round(target.y - 12, 1),
      dmg: damage,
      crit: !!crit,
      hitKind: 'pvp',
      attackKind: 'pvp'
    });

    if (target.hp <= 0) {
      target.alive = false;
      target.character.pvpLosses = (target.character.pvpLosses || 0) + 1;
      target.character.pvpRating = Math.max(800, (target.character.pvpRating || 1000) - 15);

      if (attacker && attacker.character) {
        attacker.character.pvpWins = (attacker.character.pvpWins || 0) + 1;
        attacker.character.pvpRating = (attacker.character.pvpRating || 1000) + 25;
        attacker.character.gold += 50;
        updateAchievementProgress(attacker.character, 'pvp_wins', 1, this, attacker);
        updateDailyProgress(attacker.character, 'arena_win', 1, this, attacker);
        this.eventRoom(room, 'system', { text: `🏆 ${attacker.character.name} fells ${target.character.name} in the Arena! (+25 Rating)`, color: '#ffd75e' });
        this.sendCharacter(attacker);
      }

      // Quick respawn in arena
      setTimeout(() => {
        if (target.character) {
          target.alive = true;
          const stats = this.statsFor(target);
          target.hp = stats.maxHp;
          target.mp = stats.maxMp;
          target.x = ZONE_SPAWN.arena.x;
          target.y = ZONE_SPAWN.arena.y;
          this.sendCharacter(target);
          this.system(target, 'You have been revived in the arena.', '#7bed9f');
        }
      }, 1500);
    }
    this.sendCharacter(target);
  }

  handleClaimAchievement(client, message) {
    const res = claimAchievementReward(client.character, message.id);
    if (res.error) { this.error(client, res.error); return; }
    if (res.reward.xp) this.gainXp(client, res.reward.xp, false);
    this.system(client, `Claimed achievement reward: +${res.reward.gold || 0} Gold, +${res.reward.xp || 0} XP!`, '#50fa7b');
    this.sendCharacter(client);
    this.send(client, { type: 'achievements', achievements: client.character.achievements });
  }

  handleClaimDaily(client, message) {
    const res = claimDailyReward(client.character, message.id);
    if (res.error) { this.error(client, res.error); return; }
    if (res.reward.xp) this.gainXp(client, res.reward.xp, false);
    this.system(client, `Claimed daily bounty: +${res.reward.gold || 0} Gold, +${res.reward.xp || 0} XP!`, '#50fa7b');
    this.sendCharacter(client);
    this.send(client, { type: 'daily_quests', dailyQuests: client.character.dailyQuests });
  }

  handleGetLeaderboard(client, message) {
    const category = message.category || 'level';
    const entries = this.leaderboards.getLeaderboard(category, [...this.clients]);
    this.send(client, { type: 'leaderboard', category, entries });
  }

  handlePetSelect(client, message) {
    const type = message.petType || message.pet || message.kind || 'wolf';
    if (!PET_TYPES[type]) { this.error(client, 'Unknown pet type.'); return; }
    client.character.pet = freshPet(type, message.name);
    this.system(client, `Bonded with ${client.character.pet.name} the ${PET_TYPES[type].name}!`, '#8be9fd');
    this.syncVitals(client);
    this.sendCharacter(client);
  }

  handleSetPassword(client, message) {
    if (!client || !client.accountId) { this.error(client, 'Not logged in.'); return; }
    const newPassword = String(message.password || '').trim();
    if (newPassword.length < 4) {
      this.error(client, 'New password must be at least 4 characters.');
      return;
    }
    try {
      this.db.updatePassword(client.accountId, newPassword);
      this.send(client, { type: 'passwordSet', success: true });
      this.system(client, 'Account password updated! You can now use it on other devices.', '#8ee6ff');
    } catch (err) {
      this.error(client, err.message);
    }
  }

}
