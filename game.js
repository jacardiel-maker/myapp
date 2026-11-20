/*
  PIXEL REALM - a tiny browser "MMORPG feel" game.
  Everything is drawn on ONE visible <canvas> with vanilla JavaScript.

  Beginner map of this file:
    1. Constants + helpers
    2. Pixel-art sprite and tile drawing
    3. Items, audio, and small visual classes
    4. Game objects: Player, Enemy, Projectile, NPCs, etc.
    5. The Game class: input, update loop, rendering, saving
    6. requestAnimationFrame startup

  STAGE 1 = core game, STAGE 2 = combat/progression, STAGE 3 = world,
  STAGE 4 = simulated MMO, STAGE 5 = polish. Search for "STAGE" comments.
*/
(() => {
  'use strict';

  // ============================================================
  // 1. CONSTANTS + HELPERS
  // ============================================================

  const VIEW_W = 960;
  const VIEW_H = 540;
  const TILE = 32;          // A 16x16 pixel tile drawn at 2x.
  const SPRITE_SCALE = 2;   // A 16x16 character sprite drawn at 2x.
  const MONSTER_SPRITE_SCALE = 4;
  const ROLE_SPRITE_SCALE = 3;
  const SAVE_KEY = 'pixelRealmSave_v1';
  const TUTORIAL_KEY = 'pixelRealmTutorialComplete';
  const SESSION_KEY = 'pixelRealmSession';
  const DAY_LENGTH = 120;   // Seconds for a full day/night cycle.
  const TAU = Math.PI * 2;

  const TILE_ID = {
    GRASS: 0, WATER: 1, TREE: 2, SAND: 3, ROCK: 4, CAVE: 5, CACTUS: 6, PATH: 7,
    HOUSE_ROOF: 8, HOUSE_WALL: 9, ICE: 10, SNOW: 11, LAVA: 12, ASH: 13,
    SWAMP_WATER: 14, BOG: 15, ARENA_FLOOR: 16
  };
  const VALID_EQUIP_SLOTS = ['weapon', 'armor', 'helmet', 'boots', 'ring', 'necklace'];
  // Trees, water, cacti, cave walls and village buildings are real obstacles.
  const BLOCKED_TILES = new Set([
    TILE_ID.WATER, TILE_ID.TREE, TILE_ID.ROCK, TILE_ID.CACTUS,
    TILE_ID.HOUSE_ROOF, TILE_ID.HOUSE_WALL, TILE_ID.LAVA, TILE_ID.SWAMP_WATER
  ]);
  const PROJECTILE_BLOCKED_TILES = new Set(BLOCKED_TILES);

  const CLASS_DATA = {
    swordsman: {
      name: 'Swordsman', maxHp: 145, attack: 18, speed: 108, range: 54,
      mana: 60, manaRegen: 7, defense: 4, color: '#8fd0ff',
      blurb: 'High HP. Melee swings and sturdy skills.'
    },
    archer: {
      name: 'Archer', maxHp: 95, attack: 14, speed: 142, range: 285,
      mana: 80, manaRegen: 9, defense: 1, color: '#84e39a',
      blurb: 'Fast and long ranged. Kites enemies with arrows.'
    },
    mage: {
      name: 'Mage', maxHp: 72, attack: 22, speed: 112, range: 190,
      mana: 125, manaRegen: 11, defense: 0, color: '#c99bff',
      blurb: 'Low HP. Fireballs, ice and teleport magic.'
    },
    cleric: {
      name: 'Cleric', maxHp: 125, attack: 15, speed: 115, range: 120,
      mana: 110, manaRegen: 11, defense: 3, color: '#ffd75e',
      blurb: 'Holy champion. Sustains allies with party heals, smites, and sacred shields.'
    },
    rogue: {
      name: 'Rogue', maxHp: 90, attack: 20, speed: 150, range: 60,
      mana: 75, manaRegen: 8, defense: 1, color: '#52ffb8',
      blurb: 'Lethal ambusher. Vanishes into shadows and deals devastating critical strikes.'
    },
    summoner: {
      name: 'Summoner', maxHp: 80, attack: 17, speed: 110, range: 210,
      mana: 140, manaRegen: 13, defense: 1, color: '#e08bff',
      blurb: 'Master of the occult. Summons spiritual familiars to fight alongside them.'
    }
  };

  const TUTORIAL_STEPS = [
    {
      title: 'Move and explore',
      body: 'Use WASD or the arrow keys to move. On a phone, drag the on-screen joystick. Use portals to travel between Hearthvale, the forest, the cave and the desert.',
      tip: 'Tip: Trees, water and walls block your path.'
    },
    {
      title: 'Fight monsters',
      body: 'Press Space or click Attack to strike. Swordsmen fight up close; Archers and Mages can attack from farther away. Defeated monsters grant XP and may drop loot.',
      tip: 'Tip: Press Tab to lock onto a nearby enemy.'
    },
    {
      title: 'Use your skills',
      body: 'Press 1–4 or tap a hotbar skill to cast it. Some skills ask you to aim. Each skill uses mana and has a cooldown.',
      tip: 'Tip: Open K to read each skill’s effect.'
    },
    {
      title: 'Follow the story',
      body: 'Travel to the forest and speak to Elder Tarn. Press F nearby (or tap Interact) to accept a chapter. Finish its objectives, then return to him for your reward.',
      tip: 'Tip: The quest tracker shows your current objectives.'
    },
    {
      title: 'Gear up and recover',
      body: 'Pick up drops, use I to manage your inventory, and press Q to use a potion. K opens skills, T opens talents, and leveling up grants points.',
      tip: 'Press H any time to see this guide again.'
    }
  ];

  // Each role has four skills, bound to keys 1 through 4.
  const SKILLS = {
    swordsman: [
      { name: 'Dash Strike', cost: 15, cd: 5, desc: 'Dash forward and slash everything you pass.' },
      { name: 'Shield Block', cost: 10, cd: 8, desc: 'Block 80% of damage for 3 seconds.' },
      { name: 'Whirlwind', cost: 25, cd: 9, desc: 'Spin and hit every nearby enemy.' },
      { name: 'Seismic Slam', cost: 32, cd: 12, desc: 'Smash the ground, damaging and slowing nearby enemies.' }
    ],
    archer: [
      { name: 'Multi-Shot', cost: 18, cd: 5, desc: 'Fire three arrows in a spread.' },
      { name: 'Roll Dodge', cost: 12, cd: 6, desc: 'Roll quickly and become untouchable.' },
      { name: 'Poison Arrow', cost: 20, cd: 8, desc: 'An arrow that poisons its target.' },
      { name: 'Arrow Rain', cost: 30, cd: 10, desc: 'Rain arrows over the selected area.' }
    ],
    mage: [
      { name: 'Ice Nova', cost: 25, cd: 8, desc: 'Damage and slow all nearby enemies.' },
      { name: 'Blink', cost: 18, cd: 6, desc: 'Teleport toward your cursor.' },
      { name: 'Meteor', cost: 40, cd: 12, desc: 'Call down a huge fire blast at your cursor.' },
      { name: 'Arcane Burst', cost: 32, cd: 9, desc: 'Detonate arcane energy in a targeted area.' }
    ],
    cleric: [
      { name: 'Holy Smite', cost: 18, cd: 5, desc: 'Call down a pillar of holy light to strike the enemy.' },
      { name: 'Divine Heal', cost: 28, cd: 7, desc: 'Heal yourself and all nearby party members.' },
      { name: 'Aegis Ward', cost: 22, cd: 10, desc: 'Grant a barrier absorbing damage and granting defense.' },
      { name: 'Radiant Nova', cost: 38, cd: 11, desc: 'Release an explosion of holy light that harms foes and heals allies.' }
    ],
    rogue: [
      { name: 'Shadow Strike', cost: 16, cd: 4, desc: 'Lunge behind the target with a brutal stab.' },
      { name: 'Smoke Bomb', cost: 20, cd: 9, desc: 'Drop smoke, becoming invisible and gaining +30% movement speed.' },
      { name: 'Poison Dart', cost: 18, cd: 6, desc: 'Throw a toxic dart that continuously drains enemy life.' },
      { name: 'Eviscerate', cost: 35, cd: 10, desc: 'Vicious execution dealing catastrophic damage to wounded foes.' }
    ],
    summoner: [
      { name: 'Arcane Blast', cost: 15, cd: 4, desc: 'Hurl a bolt of condensed spiritual force.' },
      { name: 'Summon Familiar', cost: 30, cd: 15, desc: 'Summon an ethereal familiar that fights alongside you.' },
      { name: 'Spirit Ward', cost: 24, cd: 9, desc: 'Distribute 30% of incoming damage to your spirit energy.' },
      { name: 'Soul Nova', cost: 42, cd: 12, desc: 'Sacrifice spirit power to erupt in a shockwave of necrotic force.' }
    ]
  };

  function drawSkillIcon(ctx, classId, index, x, y, size, active = false, time = 0) {
    const palette = {
      swordsman: ['#dceeff', '#8fd0ff', '#eaf4ff', '#d2c2a0'],
      archer: ['#b9ffcb', '#b9ffcb', '#8ee46d', '#a8e8ff'],
      mage: ['#9ce7ff', '#d7b8ff', '#ff9c42', '#e7b8ff'],
      cleric: ['#ffd75e', '#a8f0cd', '#8ee6ff', '#fff3a8'],
      rogue: ['#52ffb8', '#8a9ba8', '#a8ff78', '#ff4d6d'],
      summoner: ['#d7b8ff', '#bf7fff', '#70d6ff', '#e08bff']
    };
    const color = (palette[classId] || palette.swordsman)[index] || '#fff';
    const scale = size / 32;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#101a2d';
    ctx.fillRect(0, 0, 32, 32);
    const glow = ctx.createRadialGradient(16, 14, 2, 16, 16, 24);
    glow.addColorStop(0, `${color}55`);
    glow.addColorStop(1, '#101a2d');
    ctx.fillStyle = glow;
    ctx.fillRect(2, 2, 28, 28);
    ctx.strokeStyle = active ? '#fff1a8' : color;
    ctx.lineWidth = active ? 2 : 1.5;
    ctx.strokeRect(1, 1, 30, 30);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.4;

    const line = (points) => {
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
      ctx.stroke();
    };
    const circle = (cx, cy, r, fill = false) => {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      if (fill) ctx.fill(); else ctx.stroke();
    };

    if (classId === 'swordsman') {
      if (index === 0) {
        line([[8, 24], [23, 8]]);
        line([[7, 18], [14, 25]]);
        line([[5, 25], [9, 28]]);
        line([[20, 7], [25, 12]]);
      } else if (index === 1) {
        ctx.beginPath();
        ctx.moveTo(16, 5); ctx.lineTo(26, 9); ctx.lineTo(24, 21);
        ctx.lineTo(16, 28); ctx.lineTo(8, 21); ctx.lineTo(6, 9);
        ctx.closePath(); ctx.stroke();
        line([[16, 10], [16, 23]]);
        line([[11, 16], [21, 16]]);
      } else if (index === 2) {
        ctx.beginPath(); ctx.arc(16, 16, 10, time * 2, time * 2 + 4.7); ctx.stroke();
        ctx.beginPath(); ctx.arc(16, 16, 5, time * -3, time * -3 + 4.2); ctx.stroke();
        line([[22, 8], [26, 8], [25, 12]]);
      } else {
        line([[5, 23], [10, 18], [13, 23], [18, 15], [21, 21], [27, 12]]);
        line([[5, 27], [27, 27]]);
        line([[9, 25], [9, 28]]); line([[16, 25], [16, 28]]); line([[23, 25], [23, 28]]);
      }
    } else if (classId === 'archer') {
      if (index === 0) {
        line([[7, 11], [23, 11]]); line([[9, 16], [25, 16]]); line([[7, 21], [23, 21]]);
        line([[20, 8], [24, 11], [20, 14]]);
        line([[22, 13], [26, 16], [22, 19]]);
        line([[20, 18], [24, 21], [20, 24]]);
      } else if (index === 1) {
        ctx.beginPath(); ctx.arc(15, 17, 9, -2.5, 1.1); ctx.stroke();
        line([[17, 8], [25, 8], [23, 14]]);
        line([[7, 22], [13, 25], [19, 24]]);
      } else if (index === 2) {
        line([[7, 23], [22, 8]]);
        line([[18, 8], [23, 8], [23, 13]]);
        line([[9, 19], [14, 24]]);
        circle(22, 23, 2, true); circle(26, 19, 1.4, true);
      } else {
        line([[9, 7], [9, 24]]); line([[16, 5], [16, 22]]); line([[23, 7], [23, 24]]);
        line([[6, 20], [9, 24], [12, 20]]);
        line([[13, 18], [16, 22], [19, 18]]);
        line([[20, 20], [23, 24], [26, 20]]);
      }
    } else if (classId === 'cleric') {
      if (index === 0) { // Holy Smite: sunbeam cross
        line([[16, 4], [16, 28]]); line([[9, 11], [23, 11]]);
        line([[13, 7], [16, 4], [19, 7]]);
        circle(16, 11, 2.5, true);
      } else if (index === 1) { // Divine Heal: glowing medical/radiant cross
        ctx.fillRect(13, 8, 6, 16); ctx.fillRect(8, 13, 16, 6);
        circle(16, 16, 10);
      } else if (index === 2) { // Aegis Ward: holy shield with aura
        ctx.beginPath(); ctx.moveTo(16, 5); ctx.lineTo(26, 9); ctx.lineTo(24, 21);
        ctx.lineTo(16, 28); ctx.lineTo(8, 21); ctx.lineTo(6, 9); ctx.closePath(); ctx.stroke();
        circle(16, 16, 4, true);
      } else { // Radiant Nova: 8-pointed starburst
        for (let a = 0; a < 4; a++) {
          const ang = a * Math.PI / 4;
          line([[16 - Math.cos(ang) * 11, 16 - Math.sin(ang) * 11], [16 + Math.cos(ang) * 11, 16 + Math.sin(ang) * 11]]);
        }
        circle(16, 16, 3, true);
      }
    } else if (classId === 'rogue') {
      if (index === 0) { // Shadow Strike: dagger with speed slash
        line([[6, 26], [22, 8]]); line([[18, 7], [24, 8], [23, 14]]);
        line([[4, 18], [11, 25]]);
        line([[2, 10], [12, 10]]); line([[4, 14], [14, 14]]);
      } else if (index === 1) { // Smoke Bomb: smoke cloud
        circle(12, 16, 7); circle(20, 16, 7); circle(16, 11, 6);
        circle(16, 21, 4, true);
      } else if (index === 2) { // Poison Dart: dart with drip
        line([[6, 24], [23, 7]]); line([[20, 7], [25, 7], [25, 12]]);
        circle(24, 22, 2.5, true);
      } else { // Eviscerate: crossed bloody daggers
        line([[7, 7], [25, 25]]); line([[25, 7], [7, 25]]);
        line([[6, 11], [11, 6]]); line([[26, 11], [21, 6]]);
      }
    } else if (classId === 'summoner') {
      if (index === 0) { // Arcane Blast: spiraling arcane eye/bolt
        ctx.beginPath(); ctx.arc(16, 16, 9, 0, 5.2); ctx.stroke();
        circle(16, 16, 4, true);
        line([[22, 11], [26, 11], [24, 16]]);
      } else if (index === 1) { // Summon Familiar: horned spirit crest
        ctx.beginPath(); ctx.moveTo(8, 9); ctx.lineTo(12, 19); ctx.lineTo(16, 13);
        ctx.lineTo(20, 19); ctx.lineTo(24, 9); ctx.stroke();
        circle(16, 22, 4, true);
      } else if (index === 2) { // Spirit Ward: ethereal diamond
        ctx.beginPath(); ctx.moveTo(16, 5); ctx.lineTo(26, 16); ctx.lineTo(16, 27); ctx.lineTo(6, 16); ctx.closePath(); ctx.stroke();
        circle(16, 16, 3, true);
      } else { // Soul Nova: dark necrotic core with tendrils
        circle(16, 16, 6, true);
        for (let a = 0; a < 6; a++) {
          const ang = a * Math.PI / 3 + time * 2;
          line([[16 + Math.cos(ang) * 7, 16 + Math.sin(ang) * 7], [16 + Math.cos(ang) * 13, 16 + Math.sin(ang) * 13]]);
        }
      }
    } else if (index === 0) {
      for (let a = 0; a < 3; a++) {
        const angle = a * Math.PI / 3;
        const dx = Math.cos(angle) * 10;
        const dy = Math.sin(angle) * 10;
        line([[16 - dx, 16 - dy], [16 + dx, 16 + dy]]);
        line([[16 + dx, 16 + dy], [16 + dx - Math.cos(angle + 0.65) * 4, 16 + dy - Math.sin(angle + 0.65) * 4]]);
        line([[16 + dx, 16 + dy], [16 + dx - Math.cos(angle - 0.65) * 4, 16 + dy - Math.sin(angle - 0.65) * 4]]);
      }
      circle(16, 16, 2, true);
    } else if (index === 1) {
      ctx.beginPath(); ctx.arc(16, 16, 10, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(16, 16, 5, 0, TAU); ctx.stroke();
      line([[16, 4], [16, 9]]); line([[28, 16], [23, 16]]);
      line([[16, 28], [16, 23]]); line([[4, 16], [9, 16]]);
    } else if (index === 2) {
      line([[7, 24], [21, 10]]);
      line([[17, 10], [22, 9], [21, 14]]);
      line([[9, 21], [13, 25]]);
      circle(23, 22, 2, true); circle(25, 16, 1.3, true); circle(19, 27, 1.2, true);
    } else {
      ctx.beginPath(); ctx.moveTo(16, 5); ctx.lineTo(25, 15); ctx.lineTo(16, 27); ctx.lineTo(7, 15); ctx.closePath(); ctx.stroke();
      line([[16, 5], [16, 27]]); line([[7, 15], [25, 15]]);
      circle(16, 15, 3, true);
    }

    if (active) {
      ctx.globalAlpha = 0.7 + Math.sin(time * 10) * 0.2;
      ctx.strokeStyle = '#fff1a8';
      ctx.lineWidth = 1;
      ctx.strokeRect(3, 3, 26, 26);
    }
    ctx.restore();
  }

  function normalizeSkillRanks(ranks) {
    return Array.from({ length: 4 }, (_, i) => clamp(Number(ranks && ranks[i]) || 1, 1, 5));
  }

  const RARITY = {
    common: { color: '#dedede', mult: 1, label: 'Common' },
    rare: { color: '#62b4ff', mult: 1.35, label: 'Rare' },
    epic: { color: '#ca83ff', mult: 1.8, label: 'Epic' }
  };

  const CLASS_STAT_LABELS = {
    hp: 'Max HP', attack: 'Attack', defense: 'Defense', speed: 'Speed',
    range: 'Range', mana: 'Max mana', manaRegen: 'Mana regen', crit: 'Critical chance'
  };

  function itemStatsText(item) {
    if (!item || !item.stats) return item && item.heal ? `Heals ${item.heal} HP` : 'No attribute bonus';
    const entries = Object.entries(CLASS_STAT_LABELS).filter(([key]) => Number(item.stats[key]) !== 0);
    if (!entries.length) return item.heal ? `Heals ${item.heal} HP` : (item.desc || 'No attribute bonus');
    return entries.map(([key, label]) => {
      const value = Number(item.stats[key]) || 0;
      if (key === 'crit') return `Crit +${Math.round(value * 100)}%`;
      return `${label} +${value}`;
    }).join('  ');
  }

  function itemCanEquip(item, classId) {
    if (!item || !VALID_EQUIP_SLOTS.includes(item.slot)) return false;
    const requiredClass = item.slot === 'weapon' ? (weaponClassFor(item) || item.classId) : item.classId;
    return !requiredClass || requiredClass === classId;
  }

  function weaponClassFor(item) {
    if (!item || item.slot !== 'weapon') return null;
    const role = Object.entries(ROLE_ITEM_DEFS).find(([id, def]) =>
      item.art === ROLE_ITEM_ART[id] || item.name === def.name);
    if (role) return role[0];
    if (item.art === 'sword' || /sword|blade|runed edge/i.test(item.name || '')) return 'swordsman';
    if (item.art === 'bow' || /\bbow\b/i.test(item.name || '')) return 'archer';
    if (item.art === 'staff' || /staff|wand/i.test(item.name || '')) return 'mage';
    return null;
  }

  function sameConsumableStack(a, b) {
    return !!a && !!b && a.slot === 'consumable' && b.slot === 'consumable' &&
      a.name === b.name && a.rarity === b.rarity && a.heal === b.heal &&
      (a.teleportTo || null) === (b.teleportTo || null);
  }

  function itemSellValue(item) {
    const unitValue = Math.max(1, Math.floor((Number(item && item.price) || 1) * 0.5));
    const quantity = item && item.slot === 'consumable' ? clamp(Math.floor(Number(item.quantity) || 1), 1, 99) : 1;
    return unitValue * quantity;
  }

  function compactInventory(items) {
    const compact = [];
    for (const item of items) {
      const stack = compact.find(existing => sameConsumableStack(existing, item) &&
        (existing.quantity || 1) + (item.quantity || 1) <= 99);
      if (stack) stack.quantity = (stack.quantity || 1) + (item.quantity || 1);
      else if (compact.length < 20) compact.push(item);
    }
    return compact;
  }

  // EXPANSION 5: talent tree + class specializations.
  const TALENTS = [
    { id: 'power', name: 'Power', desc: '+4% attack per rank.' },
    { id: 'haste', name: 'Haste', desc: '-4% skill cooldown per rank.' },
    { id: 'vigor', name: 'Vigor', desc: '+12 max HP per rank.' },
    { id: 'crit', name: 'Critical Eye', desc: '+3% crit chance per rank.' },
    { id: 'guard', name: 'Guard', desc: '+2 defense, -4% damage taken.' },
    { id: 'focus', name: 'Focus', desc: '+5 mana, faster mana regen.' }
  ];
  const SPECS = {
    swordsman: [
      { id: 'Guardian', desc: '+35 HP, +5 defense, -10% damage taken.' },
      { id: 'Berserker', desc: '+9 attack, -2 defense.' }
    ],
    archer: [
      { id: 'Ranger', desc: '+16 speed, +35 range.' },
      { id: 'Assassin', desc: '+6 attack, +8% crit chance.' }
    ],
    mage: [
      { id: 'Pyromancer', desc: '+8 attack, +20 mana.' },
      { id: 'Cryomancer', desc: '+40 mana, +12 HP.' }
    ]
  };

  const FAKE_NAMES = ['PixelPete', 'Mossy', 'ArrowAmy', 'NovaKid', 'TankyTim', 'LunaBytes', 'SwordSally', 'QuickFox', 'EmberEli'];
  const FAKE_LINES = [
    'Anyone up for the cave boss?', 'Nice loot!', 'brb watering the pixel grass',
    'Level 20 soon :D', 'That slime is mine!', 'GG', 'Found a rare drop!',
    'Where is the desert portal?', 'Party anyone?', 'My pet stole my gold again'
  ];
  const EMOTES = ['Hi!', 'GG!', '^^', 'LOL', 'Thanks!', 'Boss soon?', '<3', 'Zzz'];

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const angleTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const approach = (v, target, amount) => v < target ? Math.min(target, v + amount) : Math.max(target, v - amount);

  // Small deterministic random generator so maps look the same every load.
  function mulberry32(seed) {
    return function () {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function drawBar(ctx, x, y, w, h, pct, color, label, bg = '#182030') {
    pct = clamp(pct, 0, 1);
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, Math.floor(w * pct), h);
    ctx.strokeStyle = '#5b667c';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    if (label) {
      ctx.save();
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 2;
      ctx.fillText(label, x + w / 2, y + h / 2 + 0.5);
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }

  function drawBossWarning(ctx, x, y, remaining, time) {
    if (!(remaining > 0) || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const pulse = 1 + Math.sin(time * 22) * 0.035;
    ctx.save();
    ctx.globalAlpha = 0.78;
    ctx.fillStyle = 'rgba(255,70,70,0.16)';
    ctx.strokeStyle = '#ff6b4a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 88 * pulse, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe0bd';
    ctx.fillText('DODGE!', x, y - 96);
    ctx.restore();
  }

  function panel(ctx, x, y, w, h, title) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 4;
    const body = ctx.createLinearGradient(x, y, x + w, y + h);
    body.addColorStop(0, 'rgba(48,36,27,0.98)');
    body.addColorStop(1, 'rgba(15,20,19,0.98)');
    ctx.fillStyle = body;
    ctx.fillRect(x, y, w, h);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = '#211b17';
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
    ctx.strokeStyle = '#8a6c45';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 3.5, y + 3.5, w - 7, h - 7);
    const header = ctx.createLinearGradient(x, y + 2, x, y + 30);
    header.addColorStop(0, '#614832');
    header.addColorStop(1, '#35291f');
    ctx.fillStyle = header;
    ctx.fillRect(x + 2, y + 2, w - 4, 26);
    ctx.fillStyle = 'rgba(215,166,96,0.72)';
    ctx.fillRect(x + 3, y + 28, w - 6, 1);
    ctx.fillStyle = '#d7a660';
    ctx.fillRect(x + 3, y + 3, 3, 3);
    ctx.fillRect(x + w - 6, y + 3, 3, 3);
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#fff0d0';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 3;
    ctx.fillText(title, x + 12, y + 20);
    ctx.restore();
  }

  function wrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 99) {
    const words = text.split(' ');
    let line = '';
    let lines = 0;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, y);
        y += lineHeight;
        lines++;
        line = word;
        if (lines >= maxLines - 1) break;
      } else {
        line = test;
      }
    }
    if (line && lines < maxLines) ctx.fillText(line, x, y);
    return y + lineHeight;
  }

  // ============================================================
  // 2. PIXEL-ART SPRITES + TILES (all made in code, no image files)
  // ============================================================

  function emptyGrid() {
    return Array.from({ length: 16 }, () => Array(16).fill(null));
  }

  function setPx(g, x, y, color) {
    if (x >= 0 && y >= 0 && x < 16 && y < 16) g[y][x] = color;
  }

  function setRect(g, x, y, w, h, color) {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) setPx(g, xx, yy, color);
    }
  }

  function shadeColor(color, amount) {
    const match = /^#([0-9a-f]{6})$/i.exec(color || '');
    if (!match) return color;
    const value = Number.parseInt(match[1], 16);
    const channel = shift => clamp(Math.round(((value >> shift) & 255) * amount), 0, 255);
    return `#${[channel(16), channel(8), channel(0)].map(c => c.toString(16).padStart(2, '0')).join('')}`;
  }

  function outlineSprite(g, color = '#252a38') {
    const source = g.map(row => row.slice());
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        if (source[y][x] !== null) continue;
        const touchesSprite = (x > 0 && source[y][x - 1] !== null) ||
          (x < 15 && source[y][x + 1] !== null) ||
          (y > 0 && source[y - 1][x] !== null) ||
          (y < 15 && source[y + 1][x] !== null);
        if (touchesSprite) g[y][x] = color;
      }
    }
  }

  function gridToCanvas(g) {
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const cx = c.getContext('2d');
    cx.imageSmoothingEnabled = false;
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        if (g[y][x]) {
          cx.fillStyle = g[y][x];
          cx.fillRect(x, y, 1, 1);
        }
      }
    }
    return c;
  }

  const spriteCache = new Map();

  function cachedSprite(key, builder) {
    if (!spriteCache.has(key)) spriteCache.set(key, gridToCanvas(builder()));
    return spriteCache.get(key);
  }

  // Draws a 16x16 sprite centered on (x, y), where y is the character's feet.
  function drawSprite(ctx, sprite, x, y, scale = SPRITE_SCALE, alpha = 1) {
    const w = 16 * scale;
    const h = 16 * scale;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sprite, Math.round(x - w / 2), Math.round(y - h), w, h);
    ctx.restore();
  }

  const PLAYER_WALK_POSES = [
    { leftX: 0, rightX: 0, leftY: 0, rightY: 0, bob: 0, flow: 0 },
    { leftX: 1, rightX: -1, leftY: -1, rightY: 0, bob: 0, flow: 1 },
    { leftX: 1, rightX: -1, leftY: -1, rightY: -1, bob: -1, flow: 2 },
    { leftX: 0, rightX: 0, leftY: 0, rightY: -1, bob: -1, flow: 1 },
    { leftX: 0, rightX: 0, leftY: 0, rightY: 0, bob: 0, flow: 0 },
    { leftX: -1, rightX: 1, leftY: 0, rightY: -1, bob: 0, flow: -1 },
    { leftX: -1, rightX: 1, leftY: -1, rightY: -1, bob: -1, flow: -2 },
    { leftX: 0, rightX: 0, leftY: -1, rightY: 0, bob: -1, flow: -1 }
  ];

  function playerGaitFrame(timer, speed, dashing = false) {
    const rate = dashing || speed >= 130 ? 13 : 9;
    return Math.floor(timer * rate) % PLAYER_WALK_POSES.length;
  }

  function drawPlayerFrame(ctx, sprite, x, feetY, frame, running, alpha = 1, scale = ROLE_SPRITE_SCALE) {
    const pose = PLAYER_WALK_POSES[frame % PLAYER_WALK_POSES.length];
    const width = 16 * scale;
    const height = width + (running && (frame === 2 || frame === 6) ? scale : 0);
    const bob = pose.bob * (running ? 2 : 1) * (scale / ROLE_SPRITE_SCALE);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sprite, Math.round(x - width / 2), Math.round(feetY - height + bob), width, height);
    ctx.restore();
  }

  const STARTER_SPRITE_COLORS = {
    swordsman: { weapon: '#d4e0ec', armor: '#7896c4' },
    archer: { weapon: '#9c6a3d', armor: '#5c9b66' },
    mage: { weapon: '#b37b45', armor: '#8b63c8' },
    cleric: { weapon: '#e0c96c', armor: '#c7b370' },
    rogue: { weapon: '#4ca585', armor: '#425752' },
    summoner: { weapon: '#956dc8', armor: '#6d488f' }
  };

  const rolePortraitCache = new Map();
  function rolePortraitSprite(classId) {
    if (rolePortraitCache.has(classId)) return rolePortraitCache.get(classId);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const px = (x, y, w, h, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
    };
    const outline = '#172033';
    const shadowColor = '#111a2b';
    px(17, 61, 30, 2, shadowColor);
    px(21, 59, 22, 2, '#202a40');

    if (classId === 'swordsman') {
      px(21, 16, 22, 9, '#4d1f34');
      px(17, 23, 29, 13, '#76243b');
      px(20, 34, 24, 15, '#a02f42');
      px(25, 46, 18, 12, '#7b273b');
      px(30, 53, 12, 6, '#b83b45');
      px(24, 19, 14, 29, '#d2484e');
      px(27, 24, 5, 23, '#f16a56');
      px(22, 9, 20, 15, outline);
      px(25, 7, 14, 4, '#a9bbd3');
      px(23, 11, 18, 9, '#7389aa');
      px(25, 10, 14, 3, '#e8f1ff');
      px(26, 16, 13, 3, '#26344f');
      px(28, 17, 4, 1, '#f4d18a');
      px(31, 4, 4, 5, '#a93543');
      px(16, 21, 32, 14, outline);
      px(13, 22, 12, 9, '#526b90');
      px(39, 22, 12, 9, '#526b90');
      px(15, 22, 8, 5, '#b9c9df');
      px(41, 22, 8, 5, '#d8e4f2');
      px(19, 22, 26, 17, '#536b91');
      px(21, 23, 22, 13, '#a9bad1');
      px(24, 24, 16, 8, '#dce6f3');
      px(28, 24, 7, 9, '#5c7295');
      px(30, 26, 3, 5, '#f4d18a');
      px(18, 30, 6, 12, '#8195b4');
      px(41, 30, 6, 12, '#8195b4');
      px(21, 37, 22, 5, '#d5ad60');
      px(23, 38, 18, 3, '#293852');
      px(22, 42, 20, 9, '#536b91');
      px(25, 43, 14, 6, '#9aacc5');
      px(26, 49, 7, 9, '#778aa8');
      px(35, 49, 7, 9, '#778aa8');
      px(24, 56, 10, 5, '#26344f');
      px(34, 56, 11, 5, '#26344f');
      px(47, 33, 4, 12, outline);
      px(48, 34, 2, 9, '#b88b55');
      px(48, 35, 2, 1, '#f0d47a');
      px(48, 39, 2, 1, '#f0d47a');
      px(41, 32, 5, 8, '#8195b4');
      px(43, 36, 6, 7, '#c7d4e4');
      px(43, 38, 5, 1, '#7185a3');
      px(44, 40, 4, 1, '#e8c276');
      px(43, 43, 12, 4, outline);
      px(44, 44, 10, 2, '#d5ad60');
      px(46, 44, 6, 1, '#f0d47a');
      px(46, 46, 9, 15, outline);
      px(47, 47, 7, 4, '#a9bed6');
      px(48, 50, 7, 4, '#c7d8e9');
      px(49, 53, 6, 4, '#a9bed6');
      px(50, 56, 5, 3, '#c7d8e9');
      px(51, 59, 3, 2, '#a9bed6');
      px(48, 47, 2, 3, '#eef6ff');
      px(49, 50, 2, 3, '#eef6ff');
      px(50, 53, 2, 3, '#eef6ff');
      px(51, 56, 2, 2, '#eef6ff');
      px(52, 59, 1, 1, '#eef6ff');
    } else if (classId === 'archer') {
      px(19, 19, 25, 8, '#183a35');
      px(16, 25, 32, 19, '#245641');
      px(19, 40, 27, 15, '#2e704a');
      px(24, 52, 18, 7, '#21503e');
      px(21, 22, 20, 24, '#4a9b61');
      px(25, 24, 12, 20, '#71b86d');
      px(21, 27, 4, 14, '#d6b763');
      px(38, 27, 4, 14, '#d6b763');
      px(23, 13, 19, 15, outline);
      px(25, 10, 15, 12, '#2d704b');
      px(22, 12, 5, 7, '#24543e');
      px(39, 12, 5, 7, '#24543e');
      px(25, 14, 15, 10, '#e9c79e');
      px(26, 17, 3, 2, '#253b32');
      px(35, 17, 3, 2, '#253b32');
      px(29, 21, 7, 2, '#a95348');
      px(22, 12, 21, 4, '#17392f');
      px(24, 11, 15, 3, '#4e9a59');
      px(18, 31, 7, 13, '#2c7048');
      px(41, 30, 7, 14, '#2c7048');
      px(27, 31, 4, 9, '#dfc56d');
      px(36, 31, 3, 8, '#dfc56d');
      px(24, 40, 20, 4, '#d8b962');
      px(25, 44, 8, 12, '#355d47');
      px(35, 44, 8, 12, '#355d47');
      px(23, 55, 11, 6, '#233c36');
      px(34, 55, 11, 6, '#233c36');
      px(13, 18, 3, 10, '#d9ac59');
      px(10, 25, 3, 17, '#d9ac59');
      px(12, 42, 4, 12, '#d9ac59');
      px(15, 18, 2, 8, '#f0d47a');
      px(13, 27, 2, 14, '#f0d47a');
      px(15, 41, 2, 10, '#f0d47a');
      px(15, 18, 5, 2, '#a7d8b0');
      px(14, 33, 5, 2, '#a7d8b0');
      px(20, 26, 5, 5, '#9f7043');
      px(22, 27, 3, 10, '#d1a455');
      px(43, 12, 3, 5, '#bce98e');
      px(47, 19, 3, 3, '#8bdc9a');
      px(18, 48, 3, 3, '#9fdc9a');
    } else {
      px(20, 20, 25, 9, '#332456');
      px(16, 27, 33, 17, '#41306c');
      px(19, 41, 28, 15, '#554084');
      px(23, 51, 20, 9, '#302747');
      px(24, 25, 17, 28, '#7960ae');
      px(28, 28, 10, 23, '#a28bd2');
      px(31, 29, 4, 20, '#ded4f1');
      px(20, 6, 23, 5, outline);
      px(24, 2, 15, 5, '#343054');
      px(27, 0, 9, 4, '#4f4678');
      px(29, 2, 5, 2, '#f2cb76');
      px(18, 8, 27, 4, '#343054');
      px(21, 9, 21, 2, '#d2b368');
      px(23, 10, 17, 12, outline);
      px(25, 12, 13, 8, '#e7c39f');
      px(26, 15, 3, 2, '#382c4b');
      px(34, 15, 3, 2, '#382c4b');
      px(24, 20, 17, 7, '#42305f');
      px(19, 24, 8, 13, '#5a4386');
      px(40, 24, 8, 13, '#5a4386');
      px(22, 29, 21, 3, '#e2c36e');
      px(24, 31, 4, 9, '#e2c36e');
      px(37, 31, 4, 9, '#e2c36e');
      px(27, 35, 3, 3, '#e2c36e');
      px(34, 35, 3, 3, '#e2c36e');
      px(25, 44, 8, 12, '#40305f');
      px(35, 44, 8, 12, '#40305f');
      px(23, 55, 11, 6, '#24243a');
      px(34, 55, 11, 6, '#24243a');
      px(47, 15, 4, 41, '#6d4b37');
      px(48, 16, 2, 37, '#c68b52');
      px(44, 20, 10, 3, '#dbb766');
      px(46, 18, 6, 7, '#d9ccf2');
      px(47, 19, 4, 5, '#fff0b0');
      px(7, 33, 11, 9, '#d6a957');
      px(9, 31, 8, 2, '#f0d17d');
      px(9, 35, 8, 5, '#4b396d');
      px(11, 33, 4, 2, '#f8e9be');
      px(13, 13, 3, 3, '#f1d88a');
      px(50, 28, 3, 3, '#d9ccf2');
      px(14, 47, 2, 2, '#d9ccf2');
    }

    rolePortraitCache.set(classId, canvas);
    return canvas;
  }

  let loadingBannerCache = null;
  function loadingBanner() {
    if (loadingBannerCache) return loadingBannerCache;
    const canvas = document.createElement('canvas');
    canvas.width = 480;
    canvas.height = 270;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const rect = (x, y, w, h, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
    };
    const polygon = (color, points) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
      ctx.closePath();
      ctx.fill();
    };

    rect(0, 0, 480, 270, '#182444');
    rect(0, 0, 480, 36, '#17213c');
    rect(0, 36, 480, 28, '#30395a');
    rect(0, 64, 480, 28, '#594459');
    rect(0, 92, 480, 25, '#a46862');
    rect(0, 117, 480, 53, '#e5a56d');
    rect(0, 150, 480, 20, '#f1c47f');
    for (let i = 0; i < 22; i++) {
      const x = (i * 83 + 17) % 480;
      const y = (i * 41 + 9) % 105;
      rect(x, y, i % 4 === 0 ? 2 : 1, i % 4 === 0 ? 2 : 1, i % 3 ? '#aab6d1' : '#f7d99b');
    }

    rect(350, 47, 33, 18, '#ffd88d');
    rect(344, 53, 45, 7, '#ffd88d');
    rect(354, 43, 25, 4, '#ffd88d');
    rect(351, 66, 31, 4, '#ffc472');
    rect(338, 58, 6, 3, '#ffc472');
    rect(389, 54, 5, 3, '#ffc472');

    polygon('#313b5c', [[0, 145], [44, 92], [82, 133], [132, 74], [178, 135], [225, 85], [276, 137], [326, 77], [374, 137], [421, 96], [480, 146], [480, 185], [0, 185]]);
    polygon('#46506c', [[0, 151], [45, 118], [86, 149], [133, 98], [172, 151], [225, 112], [269, 152], [327, 102], [370, 152], [422, 122], [480, 158], [480, 189], [0, 189]]);
    rect(126, 91, 4, 12, '#e5d6c1');
    rect(133, 80, 5, 25, '#e5d6c1');
    rect(141, 91, 4, 15, '#e5d6c1');
    rect(125, 88, 6, 3, '#c5ad8b');
    rect(132, 77, 7, 3, '#c5ad8b');
    rect(140, 88, 6, 3, '#c5ad8b');
    rect(134, 97, 3, 6, '#f2ca78');
    rect(127, 95, 2, 4, '#f2ca78');
    rect(141, 95, 2, 4, '#f2ca78');

    polygon('#263451', [[0, 171], [56, 139], [104, 170], [161, 130], [211, 170], [266, 136], [321, 174], [377, 139], [425, 174], [480, 144], [480, 204], [0, 204]]);
    rect(0, 174, 480, 96, '#452f3b');
    rect(0, 170, 480, 9, '#576348');
    rect(0, 169, 480, 3, '#9a9860');
    for (let i = 0; i < 52; i++) {
      const x = (i * 47 + 13) % 480;
      const y = 181 + ((i * 23) % 79);
      rect(x, y, 3 + i % 4, 2, i % 3 ? '#573944' : '#695044');
      if (i % 5 === 0) rect(x + 2, y + 4, 3, 2, '#bd7959');
    }

    rect(187, 153, 106, 5, '#526d4d');
    rect(206, 145, 71, 8, '#596d4c');
    rect(220, 137, 44, 8, '#67734d');
    rect(194, 154, 91, 2, '#d3b16c');
    rect(201, 156, 80, 5, '#d4c68c');
    rect(229, 140, 11, 4, '#efcd79');
    rect(250, 140, 10, 4, '#efcd79');
    for (let i = 0; i < 16; i++) {
      const x = 197 + ((i * 19) % 87);
      const y = 150 + ((i * 11) % 9);
      rect(x, y, 2, 2, i % 2 ? '#6d9a5d' : '#b0b16a');
    }

    const heroes = [
      ['swordsman', 151],
      ['mage', 240],
      ['archer', 329]
    ];
    for (const [id, x] of heroes) {
      const colors = STARTER_SPRITE_COLORS[id];
      const equipment = {
        weapon: { spriteColor: colors.weapon },
        armor: { spriteColor: colors.armor }
      };
      const sprite = playerSprite(id, 0, false, equipment);
      drawSprite(ctx, sprite, x, 170, ROLE_SPRITE_SCALE);
    }

    rect(32, 165, 12, 4, '#b6a36a');
    rect(433, 166, 14, 3, '#c7a86f');
    rect(79, 159, 2, 7, '#d2b36e');
    rect(400, 158, 2, 8, '#d2b36e');
    loadingBannerCache = canvas;
    return canvas;
  }

  function shadow(ctx, x, y, rx, ry, alpha = 0.25) {
    ctx.fillStyle = `rgba(0,0,0,${alpha * 0.45})`;
    ctx.beginPath();
    ctx.ellipse(x + 2, y + 2, rx + 2, ry + 1, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = `rgba(0,0,0,${alpha * 0.65})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rx * 0.72, ry * 0.72, 0, 0, TAU);
    ctx.fill();
  }

  const CLASS_PALETTE = {
    swordsman: { skin: '#f0c39b', hair: '#4a3428', body: '#6f8fbf', trim: '#d7e5ff', legs: '#43506b', weapon: '#d7e4ef' },
    archer: { skin: '#f0c39b', hair: '#3b7a49', body: '#4f8e5b', trim: '#b8e8be', legs: '#3c5b45', weapon: '#8a5a32' },
    mage: { skin: '#f0c39b', hair: '#7b52b5', body: '#6f4aa8', trim: '#d9b8ff', legs: '#49356e', weapon: '#9c6b40' },
    cleric: { skin: '#f0c39b', hair: '#8b6f38', body: '#d4af37', trim: '#fff4cc', legs: '#4a3f2b', weapon: '#e0c96c' },
    rogue: { skin: '#f0c39b', hair: '#1f2937', body: '#374151', trim: '#52ffb8', legs: '#111827', weapon: '#4ca585' },
    summoner: { skin: '#f0c39b', hair: '#4c1d95', body: '#7c3aed', trim: '#ddd6fe', legs: '#312e81', weapon: '#956dc8' }
  };

  // STAGE 1 + STAGE 5: an 8-frame walk / run cycle and attack poses for every class.
  // Equipment colors change the weapon and armor pixels (STAGE 2).
  function playerSprite(classId, frame, attacking, equipment = {}, effects = {}) {
    frame = ((frame % PLAYER_WALK_POSES.length) + PLAYER_WALK_POSES.length) % PLAYER_WALK_POSES.length;
    const weaponColor = equipment.weapon && equipment.weapon.spriteColor;
    const armorColor = equipment.armor && equipment.armor.spriteColor;
    const weaponEffect = equipment.weapon && equipment.weapon.effect;
    const enchant = equipment.weapon && equipment.weapon.enchant ? equipment.weapon.enchant : 0;
    const spec = effects.spec || '';
    const casting = !!effects.casting;
    const running = !!effects.running;
    const key = `player_${classId}_${frame}_${attacking ? 1 : 0}_${casting ? 1 : 0}_${running ? 1 : 0}_${weaponColor || ''}_${armorColor || ''}_${weaponEffect || ''}_${enchant}_${spec}`;
    return cachedSprite(key, () => {
      const p = CLASS_PALETTE[classId];
      const g = emptyGrid();
      const body = armorColor || p.body;
      const weapon = weaponColor || p.weapon;
      const outline = '#252a38';
      const skin = p.skin;
      const hair = p.hair;
      const trim = p.trim;
      const pose = PLAYER_WALK_POSES[frame];
      const flowY = Math.abs(pose.flow) % 2;
      if (classId === 'swordsman') {
        setRect(g, 3 + (pose.flow < 0 ? 1 : 0), 6 + flowY, 2, 5, '#5d2435');
        setRect(g, 2 + (pose.flow > 0 ? 1 : 0), 8 + flowY, 2, 3, '#a02f42');
        setPx(g, 2 + (pose.flow > 0 ? 1 : 0), 11 + flowY, '#d2484e');
      } else if (classId === 'archer') {
        setRect(g, 3 + (pose.flow < 0 ? 1 : 0), 7 + flowY, 2, 5, shadeColor(body, 0.72));
        setRect(g, 2 + (pose.flow > 0 ? 1 : 0), 9 + flowY, 2, 3, body);
      } else {
        setRect(g, 3 + (pose.flow < 0 ? 1 : 0), 10 + flowY, 2, 4, shadeColor(body, 0.78));
        setRect(g, 2 + (pose.flow > 0 ? 1 : 0), 12 + flowY, 2, 2, body);
      }

      // Alternating feet, body bounce and cloth motion form the eight-step gait.
      setRect(g, 5 + pose.leftX, 12 + pose.leftY, 2, 3, p.legs);
      setRect(g, 9 + pose.rightX, 12 + pose.rightY, 2, 3, p.legs);
      setPx(g, 5 + pose.leftX, 15 + pose.leftY, outline);
      setPx(g, 10 + pose.rightX, 15 + pose.rightY, outline);

      // Body, belt and arms.
      setRect(g, 5, 7, 6, 5, body);
      setRect(g, 5, 11, 6, 1, '#3b3340');
      setPx(g, 7, 8, trim);
      setPx(g, 8, 9, trim);
      setRect(g, 5, 7, 1, 4, shadeColor(body, 0.72));
      setRect(g, 10, 7, 1, 4, shadeColor(body, 0.72));
      setRect(g, 6, 7, 4, 1, shadeColor(body, 1.28));
      setPx(g, 6, 9, shadeColor(body, 1.18));
      setPx(g, 9, 8, shadeColor(body, 0.88));
      setPx(g, 7, 11, '#e7bf62');
      setPx(g, 8, 11, '#ffe29a');
      setRect(g, 4, 8, 1, 3, skin);
      setRect(g, 11, 8, 1, 3, skin);
      setPx(g, 4, 10, shadeColor(skin, 0.78));
      setPx(g, 11, 10, shadeColor(skin, 0.78));

      // Head and face.
      setRect(g, 5, 2, 6, 5, skin);
      setRect(g, 4, 3, 1, 4, hair);
      setRect(g, 11, 3, 1, 4, hair);
      setRect(g, 5, 1, 6, 2, hair);
      setPx(g, 6, 4, outline);
      setPx(g, 9, 4, outline);
      setPx(g, 7, 6, '#c98f76');
      setPx(g, 5, 3, shadeColor(skin, 0.82));
      setPx(g, 10, 3, shadeColor(skin, 1.12));
      setPx(g, 8, 5, shadeColor(skin, 0.88));

      // Class-specific hoods / helmets.
      if (classId === 'archer') {
        setRect(g, 4, 2, 8, 2, hair);
        setRect(g, 3, 3, 1, 4, hair);
        setRect(g, 12, 3, 1, 4, hair);
        setPx(g, 3, 7, hair);
        setPx(g, 12, 7, hair);
      } else if (classId === 'mage') {
        setRect(g, 4, 1, 8, 3, hair);
        setPx(g, 3, 3, hair);
        setPx(g, 12, 3, hair);
        setPx(g, 8, 0, trim);
      } else {
        setRect(g, 5, 1, 6, 1, '#a9b7cb');
        setPx(g, 8, 0, '#d7e5ff');
      }
      if (classId === 'archer') {
        setPx(g, 3, 5 + flowY, shadeColor(hair, 1.12));
        setPx(g, 12, 5 + (pose.flow < 0 ? 1 : 0), shadeColor(hair, 0.82));
      } else if (classId === 'mage') {
        setPx(g, 4 + (pose.flow < 0 ? 1 : 0), 4 + flowY, shadeColor(hair, 1.12));
      }

      // Weapons. Casting raises the focus; attack frames show a swing/shot.
      if (classId === 'swordsman') {
        if (casting) {
          setRect(g, 12, 2, 1, 10, weapon);        // blade held upright
          setRect(g, 11, 10, 3, 1, '#6b4a2f');
          setPx(g, 12, 1, '#ffffff');
          setPx(g, 13, 4, trim);
          setPx(g, 14, 3, trim);
        } else if (attacking && frame === 2) {
          setRect(g, 9, 8, 6, 1, weapon);          // horizontal slash
          setPx(g, 15, 8, '#ffffff');
          setRect(g, 8, 7, 1, 3, '#6b4a2f');
        } else if (attacking && frame === 1) {
          setRect(g, 12, 2, 1, 8, weapon);         // raised sword
          setRect(g, 11, 9, 3, 1, '#6b4a2f');
        } else {
          setRect(g, 12, 5, 1, 8, weapon);         // resting sword
          setRect(g, 11, 11, 3, 1, '#6b4a2f');
        }
        if (!casting) setPx(g, 12, 4, '#ffffff');
      } else if (classId === 'archer') {
        setPx(g, 12, 4, weapon);
        setPx(g, 13, 5, weapon);
        setPx(g, 13, 6, weapon);
        setPx(g, 13, 9, weapon);
        setPx(g, 12, 10, weapon);
        setPx(g, 14, 7, '#e8e0c0');                // bow string
        if (casting) {
          setPx(g, 14, 6, trim);                   // string drawn back
          setPx(g, 14, 8, trim);
          setRect(g, 9, 7, 5, 1, '#e6e0cf');
          setPx(g, 14, 7, '#ffffff');
        } else if (attacking && frame >= 1) {
          setRect(g, 10, 7, 5, 1, '#e6e0cf');      // arrow
          setPx(g, 15, 7, '#ffffff');
        }
      } else {
        setRect(g, 12, 3, 1, 11, weapon);          // staff
        const charged = casting || attacking;
        setPx(g, 11, 2, charged ? '#ffffff' : '#8ee8ff');
        setPx(g, 12, 1, charged ? '#d9fbff' : '#57c9ff');
        setPx(g, 13, 2, charged ? '#ffffff' : '#8ee8ff');
        if (casting) {
          setPx(g, 10, 1, trim);
          setPx(g, 14, 1, trim);
          setPx(g, 12, 0, '#ffffff');
        }
        if (attacking && frame === 2) {
          setPx(g, 14, 1, '#ffb15c');
          setPx(g, 15, 2, '#ff7a3c');
        }
      }

      // DEEPER PROGRESSION: specialization, enchant and weapon-effect pixels.
      const fxColors = { flame: '#ff8c42', frost: '#9ce7ff', void: '#c98bff', thunder: '#ffe45e' };
      const specFx = {
        Guardian: '#8fd0ff', Berserker: '#ff6b6b', Ranger: '#7bff9b', Assassin: '#8e7bd8',
        Pyromancer: '#ff9c42', Cryomancer: '#8ee8ff'
      };
      if (fxColors[weaponEffect]) {
        setPx(g, 13, 4 + (frame % 2), fxColors[weaponEffect]);
        setPx(g, 14, 6 + (frame % 2), fxColors[weaponEffect]);
      }
      if (enchant > 0) {
        const c = enchant >= 4 ? '#ffd75e' : enchant >= 2 ? '#c98bff' : '#9ce7ff';
        setPx(g, 3, 4 + (frame % 2), c);
        setPx(g, 12, 14, c);
      }
      if (specFx[spec]) {
        setPx(g, 6, 3, specFx[spec]);
        setPx(g, 9, 3, specFx[spec]);
        setPx(g, 8, 0, specFx[spec]);
      }
      setPx(g, 5 + pose.leftX, 14 + pose.leftY, shadeColor(p.legs, 1.24));
      setPx(g, 9 + pose.rightX, 14 + pose.rightY, shadeColor(p.legs, 1.24));
      if (classId === 'swordsman') {
        setRect(g, 6, 8, 1, 2, shadeColor(body, 1.38));
        setPx(g, 8, 8, '#f3d37e');
      } else if (classId === 'archer') {
        setPx(g, 6, 8, '#d7bd75');
        setPx(g, 7, 9, '#d7bd75');
        setPx(g, 6, 10, '#d7bd75');
      } else {
        setPx(g, 8, 8, '#ffe27a');
        setPx(g, 7, 9, '#a989e4');
      }
      outlineSprite(g, outline);
      return g;
    });
  }

  function slimeSprite(frame) {
    return cachedSprite(`slime_${frame}`, () => {
      const g = emptyGrid();
      const squash = frame === 1 ? 1 : frame === 3 ? -1 : 0;
      setRect(g, 4, 8 + squash, 8, 5 - squash, '#4fd18b');
      setRect(g, 5, 7 + squash, 6, 2, '#79efa8');
      setRect(g, 3, 11 + squash, 10, 2, '#2fa96b');
      setPx(g, 6, 9 + squash, '#15251f');
      setPx(g, 9, 9 + squash, '#15251f');
      setPx(g, 6, 10 + squash, '#ffffff');
      setPx(g, 9, 10 + squash, '#ffffff');
      setPx(g, 5, 6 + squash, '#baffd5');
      setRect(g, 11, 10 + squash, 1, 2, '#23845c');
      setPx(g, 7, 11 + squash, '#17845b');
      outlineSprite(g, '#164f46');
      return g;
    });
  }

  function goblinSprite(frame) {
    return cachedSprite(`goblin_${frame}`, () => {
      const g = emptyGrid();
      const step = frame === 1 ? 1 : frame === 3 ? -1 : 0;
      setRect(g, 5 + step, 12, 2, 3, '#4f6b35');
      setRect(g, 9 - step, 12, 2, 3, '#4f6b35');
      setRect(g, 5, 7, 6, 5, '#8a5a3b');
      setRect(g, 4, 8, 1, 3, '#7dbb5a');
      setRect(g, 11, 8, 1, 3, '#7dbb5a');
      setRect(g, 5, 2, 6, 5, '#7dbb5a');
      setPx(g, 3, 3, '#5c9448');
      setPx(g, 12, 3, '#5c9448');
      setPx(g, 4, 1, '#5c9448');
      setPx(g, 11, 1, '#5c9448');
      setPx(g, 6, 4, '#ffe45e');
      setPx(g, 9, 4, '#ffe45e');
      setPx(g, 6, 4, '#2a1c12');
      setPx(g, 9, 4, '#2a1c12');
      setPx(g, 7, 6, '#e0d3a0');
      setPx(g, 8, 6, '#e0d3a0');
      setRect(g, 12, 5, 1, 8, '#7b5638');         // club
      setRect(g, 11, 3, 3, 3, '#5b4030');
      setRect(g, 6, 8, 1, 2, '#c78a52');
      setPx(g, 8, 10, '#e2bc66');
      setPx(g, 5, 3, '#a1d36c');
      outlineSprite(g, '#2b3928');
      return g;
    });
  }

  function bossSprite(frame) {
    return cachedSprite(`boss_${frame}`, () => {
      const g = emptyGrid();
      const glow = frame % 2 === 0 ? '#ff8a3c' : '#ffd166';
      setRect(g, 3, 8, 10, 5, '#5a5e70');
      setRect(g, 4, 3, 8, 6, '#6c7188');
      setRect(g, 2, 4, 2, 5, '#4b5062');
      setRect(g, 12, 4, 2, 5, '#4b5062');
      setPx(g, 5, 5, glow);
      setPx(g, 10, 5, glow);
      setRect(g, 6, 8, 4, 3, '#242a3c');
      setPx(g, 7, 9, glow);
      setPx(g, 8, 9, glow);
      setRect(g, 4, 13, 3, 2, '#4b5062');
      setRect(g, 9, 13, 3, 2, '#4b5062');
      setPx(g, 2, 2, '#8e94ac');
      setPx(g, 13, 2, '#8e94ac');
      setRect(g, 4, 9, 2, 3, '#8b90a6');
      setPx(g, 7, 4, '#ffdca0');
      outlineSprite(g, '#292d40');
      return g;
    });
  }

  function npcSprite(type, frame) {
    return cachedSprite(`npc_${type}_${frame}`, () => {
      const g = emptyGrid();
      const robe = type === 'shop' ? '#b8793c' : type === 'guard' ? '#405c7e' : type === 'healer' ? '#4d9b82' : type === 'blacksmith' ? '#72504b' : type === 'scout' ? '#66834f' : '#8b6f49';
      const trim = type === 'shop' ? '#ffd68a' : type === 'guard' ? '#e7d38a' : type === 'healer' ? '#c2ffe0' : type === 'blacksmith' ? '#ffb36b' : type === 'scout' ? '#d1e89c' : '#f0d28e';
      const bob = frame % 2;
      setRect(g, 5, 2 + bob, 6, 5, '#e8c29b');
      setRect(g, 4, 2 + bob, 8, 2, type === 'shop' ? '#7a4b27' : '#d9d9e8');
      setPx(g, 6, 5 + bob, '#2b2b33');
      setPx(g, 9, 5 + bob, '#2b2b33');
      setRect(g, 4, 7 + bob, 8, 6, robe);
      setRect(g, 5, 8 + bob, 6, 1, trim);
      setRect(g, 5, 13 + bob, 6, 2, '#3d3b47');
      if (type === 'shop') {
        setRect(g, 11, 8, 3, 4, '#8a5a32');       // little bag
        setPx(g, 12, 9, '#ffd45e');
      } else if (type === 'guard') {
        setRect(g, 3, 7 + bob, 2, 6, '#9aa8bd');
        setRect(g, 2, 8 + bob, 3, 3, '#e7d38a');
        setRect(g, 11, 8 + bob, 3, 2, '#9aa8bd');
        setRect(g, 12, 3 + bob, 1, 6, '#d7e4ef');
        setPx(g, 12, 2 + bob, '#ffd75e');
      } else if (type === 'healer') {
        setRect(g, 11, 8 + bob, 3, 4, '#d9f5dc');
        setPx(g, 12, 9 + bob, '#f0718a');
      } else if (type === 'blacksmith') {
        setRect(g, 12, 7 + bob, 2, 4, '#777d8a');
        setRect(g, 11, 6 + bob, 4, 2, '#c2c8d0');
        setPx(g, 13, 5 + bob, '#f0a454');
      } else if (type === 'scout') {
        setRect(g, 3, 8 + bob, 2, 5, '#8a5c32');
        setRect(g, 3, 7 + bob, 3, 2, '#c89b5b');
        setPx(g, 12, 3 + bob, '#e6d28a');
      } else if (type === 'villager') {
        setRect(g, 11, 9 + bob, 4, 3, '#a77a45');
        setRect(g, 12, 8 + bob, 2, 1, '#e5c778');
      } else {
        setRect(g, 12, 3, 1, 10, '#9a8060');      // staff
        setPx(g, 12, 2, '#9ce7ff');
      }
      setPx(g, 6, 3 + bob, '#fff0d1');
      setPx(g, 9, 3 + bob, '#fff0d1');
      setPx(g, 6, 11 + bob, shadeColor(robe, 0.78));
      setPx(g, 9, 11 + bob, shadeColor(robe, 1.2));
      outlineSprite(g);
      return g;
    });
  }

  function petSprite(frame) {
    return cachedSprite(`pet_${frame}`, () => {
      const g = emptyGrid();
      const hop = frame === 1 || frame === 3 ? 1 : 0;
      setRect(g, 5, 8 - hop, 6, 4, '#f2f0ff');
      setRect(g, 4, 6 - hop, 5, 3, '#ffffff');
      setPx(g, 4, 7 - hop, '#ffffff');
      setPx(g, 5, 5 - hop, '#ffffff');
      setPx(g, 8, 5 - hop, '#ffffff');
      setPx(g, 6, 7 - hop, '#4a3b66');
      setPx(g, 8, 7 - hop, '#4a3b66');
      setPx(g, 10, 9 - hop, '#ffe27a');
      setPx(g, 6, 12, '#cfc9ec');
      setPx(g, 9, 12, '#cfc9ec');
      setPx(g, 5, 9 - hop, '#cfc9ec');
      setPx(g, 10, 6 - hop, '#e3dcff');
      outlineSprite(g, '#423956');
      return g;
    });
  }

  // Item images are generated from the same tiny pixel grid as characters, so
  // every item - including role relics - has art without external files.
  const ITEM_ART_KEYS = new Set([
    'potion', 'scroll', 'sword', 'bow', 'staff', 'armor',
    'roleSword', 'roleBow', 'roleStaff'
  ]);

  function itemArtKey(item) {
    if (!item) return 'armor';
    if (ITEM_ART_KEYS.has(item.art)) return item.art;
    const name = String(item.name || '').toLowerCase();
    if (item.teleportTo || name.includes('scroll')) return 'scroll';
    if (item.slot === 'consumable' || name.includes('potion')) return 'potion';
    if (name.includes('bow')) return 'bow';
    if (name.includes('staff') || name.includes('wand')) return 'staff';
    if (name.includes('sword') || name.includes('blade') || name.includes('edge')) return 'sword';
    if (item.slot === 'armor' || name.includes('armor') || name.includes('mail') ||
        name.includes('vest') || name.includes('gear')) return 'armor';
    return item.slot === 'weapon' ? 'sword' : 'potion';
  }

  function itemSprite(item) {
    const art = itemArtKey(item);
    const rarityColor = item && RARITY[item.rarity] ? RARITY[item.rarity].color : '#c0c6d2';
    const metal = (item && (item.spriteColor || item.color)) || rarityColor;
    const glow = (item && item.color) || metal;
    return cachedSprite(`item_${art}_${metal}_${glow}`, () => {
      const g = emptyGrid();
      const dark = '#252b3a';
      const gold = '#ffd75e';
      const light = '#ffffff';
      const wood = '#7a5230';

      if (art === 'potion') {
        setRect(g, 6, 1, 4, 2, '#cbbda4');
        setPx(g, 6, 0, '#a99a80');
        setPx(g, 9, 0, '#a99a80');
        setRect(g, 5, 3, 6, 2, '#e6eaf3');
        setRect(g, 4, 5, 8, 8, '#e6eaf3');
        setRect(g, 5, 7, 6, 5, glow);
        setPx(g, 5, 5, light);
        setPx(g, 6, 4, light);
        setPx(g, 10, 11, light);
        setRect(g, 5, 13, 6, 1, '#9aa7bd');
      } else if (art === 'scroll') {
        setRect(g, 4, 2, 8, 12, '#e8d5a6');
        setRect(g, 3, 2, 10, 2, '#fff0c4');
        setRect(g, 3, 12, 10, 2, '#c7a354');
        setRect(g, 5, 5, 6, 1, '#7b67b2');
        setRect(g, 5, 8, 5, 1, '#7b67b2');
        setPx(g, 8, 6, '#ffd75e');
        setPx(g, 7, 9, '#ffd75e');
      } else if (art === 'sword') {
        setPx(g, 7, 1, metal);
        setPx(g, 8, 1, metal);
        setRect(g, 7, 2, 2, 8, metal);
        setPx(g, 7, 3, light);
        setPx(g, 7, 4, light);
        setPx(g, 8, 9, '#9aa8bd');
        setRect(g, 5, 10, 6, 1, gold);
        setPx(g, 5, 9, gold);
        setPx(g, 10, 9, gold);
        setRect(g, 7, 11, 2, 3, wood);
        setRect(g, 7, 14, 2, 1, '#4a3323');
      } else if (art === 'roleSword') {
        setPx(g, 7, 0, glow);
        setPx(g, 8, 0, light);
        setRect(g, 6, 1, 4, 9, metal);
        setPx(g, 7, 2, light);
        setPx(g, 7, 5, light);
        setPx(g, 9, 8, '#9aa8bd');
        setRect(g, 4, 10, 8, 2, gold);
        setPx(g, 4, 9, glow);
        setPx(g, 11, 9, glow);
        setPx(g, 7, 11, light);
        setRect(g, 7, 12, 2, 2, '#5b3a24');
        setPx(g, 3, 5, glow);
        setPx(g, 12, 3, glow);
      } else if (art === 'bow' || art === 'roleBow') {
        const arc = art === 'roleBow'
          ? [[5, 2], [6, 2], [7, 3], [8, 4], [9, 5], [9, 9], [8, 10], [7, 11], [6, 12], [5, 12], [4, 11]]
          : [[5, 2], [6, 2], [7, 3], [8, 4], [8, 5], [8, 9], [7, 10], [6, 11], [5, 11], [4, 10]];
        for (const [px, py] of arc) setPx(g, px, py, metal);
        setRect(g, art === 'roleBow' ? 3 : 4, 3, 1, 9, art === 'roleBow' ? light : '#efe7d0');
        setRect(g, 2, 7, art === 'roleBow' ? 12 : 11, 1, '#f0e6cd');
        setPx(g, art === 'roleBow' ? 14 : 13, 6, metal);
        setPx(g, art === 'roleBow' ? 15 : 14, 7, light);
        setPx(g, art === 'roleBow' ? 14 : 13, 8, metal);
        if (art === 'roleBow') {
          setPx(g, 6, 2, gold);
          setPx(g, 6, 12, gold);
          setPx(g, 2, 6, glow);
          setPx(g, 2, 8, glow);
          setPx(g, 7, 7, light);
        }
      } else if (art === 'staff' || art === 'roleStaff') {
        const ornate = art === 'roleStaff';
        setRect(g, 7, ornate ? 6 : 5, 2, ornate ? 9 : 10, ornate ? '#5b3a24' : wood);
        setPx(g, 7, 15, '#4a3323');
        setPx(g, 8, 15, '#4a3323');
        setRect(g, 6, ornate ? 5 : 4, 4, 1, gold);
        if (ornate) {
          setPx(g, 6, 3, glow);
          setPx(g, 7, 2, glow);
          setPx(g, 8, 2, light);
          setPx(g, 9, 3, glow);
          setPx(g, 7, 4, glow);
          setPx(g, 8, 4, glow);
          setPx(g, 5, 1, gold);
          setPx(g, 11, 2, glow);
          setPx(g, 10, 0, light);
        } else {
          setPx(g, 6, 2, metal);
          setPx(g, 7, 1, metal);
          setPx(g, 8, 1, metal);
          setPx(g, 9, 2, metal);
          setPx(g, 7, 3, metal);
          setPx(g, 8, 3, metal);
          setPx(g, 7, 2, light);
        }
      } else {
        setRect(g, 4, 3, 8, 2, dark);
        setRect(g, 3, 4, 2, 4, metal);
        setRect(g, 11, 4, 2, 4, metal);
        setRect(g, 5, 5, 6, 6, metal);
        setRect(g, 6, 6, 4, 3, glow);
        setPx(g, 7, 7, light);
        setPx(g, 8, 8, light);
        setRect(g, 5, 11, 6, 2, dark);
        setPx(g, 5, 12, gold);
        setPx(g, 10, 12, gold);
      }
      outlineSprite(g, dark);
      return g;
    });
  }

  function drawItemImage(ctx, item, x, y, size, alpha = 1) {
    if (!ctx || !item) return;
    const sprite = itemSprite(item);
    const s = Math.max(8, Math.round(size));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sprite, Math.round(x), Math.round(y), s, s);
    ctx.restore();
  }

  const tileCache = new Map();
  const VARIANT_TILES = new Set([
    TILE_ID.GRASS, TILE_ID.WATER, TILE_ID.TREE, TILE_ID.SAND, TILE_ID.ROCK,
    TILE_ID.CAVE, TILE_ID.CACTUS, TILE_ID.PATH, TILE_ID.HOUSE_ROOF, TILE_ID.HOUSE_WALL
  ]);

  function tileVariant(seed) {
    let value = Math.floor(seed) >>> 0;
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    return (value ^ (value >>> 16)) & 15;
  }

  // STAGE 1: grass, water and trees. STAGE 3 adds sand, rock and cave tiles.
  function tileCanvas(id, seed = 0) {
    const variant = VARIANT_TILES.has(id) ? tileVariant(seed) : 0;
    const palette = variant % 4;
    const cacheKey = `${id}:${variant}`;
    if (tileCache.has(cacheKey)) return tileCache.get(cacheKey);
    const rng = mulberry32(100 + id * 37 + variant * 109);
    const g = emptyGrid();
    if (id === TILE_ID.GRASS) {
      const base = ['#596d45', '#617448', '#526842', '#5d7144'][palette];
      setRect(g, 0, 0, 16, 16, base);
      setRect(g, 1 + variant % 3, 2, 5, 2, '#6d7f4e');
      setRect(g, 9, 10 + variant % 3, 5, 2, '#4d633e');
      for (let i = 0; i < 14; i++) {
        const x = Math.floor(rng() * 16);
        const y = Math.floor(rng() * 16);
        setPx(g, x, y, rng() < 0.68 ? '#718250' : '#876345');
      }
      setRect(g, 3, 11, 2, 1, '#96704d');
      setRect(g, 11, 4, 2, 1, '#3f5b39');
      setPx(g, 4 + variant, 5, '#a08a55');
      setPx(g, 12, 13 - variant, '#8e7049');
    } else if (id === TILE_ID.WATER) {
      const water = ['#246f91', '#28799a', '#216b89', '#2a748f'][palette];
      const light = ['#58b1b5', '#69bdc0', '#4eaaa9', '#77c5bc'][palette];
      setRect(g, 0, 0, 16, 16, water);
      setRect(g, 0, 0, 16, 3, '#3288a0');
      setRect(g, 0, 13, 16, 3, '#1d5878');
      setRect(g, 2 + variant % 3, 4, 5, 2, '#348ba1');
      setRect(g, 9 - variant % 2, 7, 5, 2, '#1c5f80');
      setRect(g, 3, 10 + variant % 2, 4, 1, '#2b8297');
      setRect(g, 1 + variant % 4, 3, 4, 1, light);
      setRect(g, 9, 5 + variant % 3, 3, 1, light);
      setRect(g, 5 + variant % 3, 12, 5, 1, '#3a9aa5');
      setPx(g, 12, 3 + variant % 2, '#a4e7d4');
      setPx(g, 4 + variant % 4, 8, '#b0ead8');
      setPx(g, 13 - variant % 3, 11, '#8dd8cb');
    } else if (id === TILE_ID.TREE) {
      setRect(g, 0, 0, 16, 16, '#4f9d54');
      const foliage = ['#2f7a3c', '#347f43', '#267542', '#3b7940'][palette];
      const highlight = ['#62b95e', '#7acb68', '#55b66b', '#90c45a'][palette];
      setRect(g, 2, 13, 12, 2, 'rgba(23,56,35,0.55)');
      setRect(g, 6, 8, 4, 7, '#6b4a2c');
      setRect(g, 7, 9, 1, 5, '#8b6240');
      setRect(g, 5, 2, 7, 3, foliage);
      setRect(g, 3, 4, 11, 4, foliage);
      setRect(g, 2, 6, 12, 4, foliage);
      setRect(g, 4, 9, 8, 2, foliage);
      setRect(g, 4, 3, 5, 2, highlight);
      setRect(g, 3 + variant % 3, 6, 4, 2, highlight);
      setRect(g, 9, 7, 3, 2, ['#1f5c30', '#235d35', '#1c5635', '#285c31'][palette]);
      setPx(g, 11, 5, '#1f5c30');
      setRect(g, 12, 5, 1, 5, 'rgba(0,0,0,0.16)');
      setRect(g, 4, 10, 8, 1, 'rgba(0,0,0,0.12)');
    } else if (id === TILE_ID.SAND) {
      const dune = ['#bf965d', '#c5a066', '#b98f54', '#c8a267'][palette];
      setRect(g, 0, 0, 16, 16, dune);
      setRect(g, variant % 7, 2 + variant % 6, 6 + variant % 4, 1, '#dfbf7e');
      setRect(g, 5 + variant % 6, 4 + variant % 5, 4, 1, '#d5b374');
      setRect(g, variant % 5, 9 + variant % 4, 5 + variant % 3, 1, '#ac804b');
      setRect(g, 8 + variant % 4, 11 + variant % 3, 5, 1, '#d3ae6d');
      for (let i = 0; i < 10; i++) {
        setPx(g, Math.floor(rng() * 16), Math.floor(rng() * 16), rng() < 0.58 ? '#dfbd7b' : '#9d7745');
      }
    } else if (id === TILE_ID.ROCK) {
      const stone = ['#a65c38', '#985333', '#ad6540', '#8f4e34'][palette];
      setRect(g, 0, 0, 16, 16, '#583c32');
      setRect(g, 1, 1, 14, 14, stone);
      setRect(g, 2, 2, 12, 3, ['#c97a49', '#bb6b42', '#d0804c', '#b9653e'][palette]);
      setRect(g, 2, 7, 8, 2, '#874a34');
      setRect(g, 4, 10, 10, 3, '#754333');
      setRect(g, 3, 3, 4, 1, '#e09a5a');
      setPx(g, 11, 6 + variant % 3, '#d0844f');
      setPx(g, 5 + variant, 12, '#573b31');
    } else if (id === TILE_ID.CAVE) {
      setRect(g, 0, 0, 16, 16, '#292d36');
      const stone = ['#414249', '#484744', '#3b4543', '#4a4247'][palette];
      setRect(g, 1 + variant % 3, 1, 5 + variant % 3, 2, '#59534a');
      setRect(g, 0, 3 + variant % 2, 7, 4, stone);
      setRect(g, 2, 7, 5, 2, '#333941');
      setRect(g, 9, 1 + variant % 3, 6, 3, stone);
      setRect(g, 8, 4, 7, 4, '#343940');
      setRect(g, 10, 8, 5, 2, '#4c4a46');
      setRect(g, 1, 11, 6, 4, '#343a3b');
      setRect(g, 7, 12, 4, 3, stone);
      setRect(g, 12, 12, 4, 3, '#2e343b');
      setPx(g, 5 + variant, 6, '#94815c');
      for (let i = 0; i < 8; i++) {
        setPx(g, Math.floor(rng() * 16), Math.floor(rng() * 16), rng() < 0.55 ? '#646052' : '#232933');
      }
    } else if (id === TILE_ID.PATH) {
      setRect(g, 0, 0, 16, 16, ['#8d6a49', '#96724d', '#896344', '#9a7651'][palette]);
      setRect(g, 1, 2, 5, 2, '#a58056');
      setRect(g, 9, 5 + variant % 3, 5, 2, '#7b5b40');
      setRect(g, 3, 11, 4, 2, '#a17a50');
      setRect(g, 11, 13, 3, 1, '#6d5139');
      for (let i = 0; i < 7; i++) {
        const x = Math.floor(rng() * 16);
        const y = Math.floor(rng() * 16);
        setRect(g, x, y, 1 + Math.floor(rng() * 2), 1, rng() < 0.55 ? '#b18a5c' : '#6e5138');
      }
    } else if (id === TILE_ID.HOUSE_ROOF) {
      setRect(g, 0, 0, 16, 16, '#85483c');
      setRect(g, 1, 2, 14, 3, '#a95d48');
      setRect(g, 2, 8, 12, 2, '#713b35');
      setRect(g, 7, 1, 2, 3, '#d59b6c');
    } else if (id === TILE_ID.HOUSE_WALL) {
      setRect(g, 0, 0, 16, 16, '#c7a879');
      setRect(g, 1, 1, 14, 2, '#dfc494');
      setRect(g, 2, 5, 4, 5, '#6f91a4');
      setRect(g, 3, 6, 2, 3, '#a8d8e8');
      setRect(g, 10, 5, 4, 5, '#6f91a4');
      setRect(g, 11, 6, 2, 3, '#a8d8e8');
      setRect(g, 7, 9, 2, 7, '#69432f');
    } else if (id === TILE_ID.CACTUS) {
      setRect(g, 0, 0, 16, 16, ['#bf965d', '#c5a066', '#b98f54', '#c8a267'][palette]);
      setRect(g, variant % 6, 2 + variant % 5, 7, 1, '#dfbf7e');
      setRect(g, 8, 10 + variant % 4, 5, 1, '#ac804b');
      for (let i = 0; i < 6; i++) setPx(g, Math.floor(rng() * 16), Math.floor(rng() * 16), '#dfbd7b');
      const cactus = ['#3f9c5e', '#4a9e5d', '#438e61', '#559c52'][palette];
      const armY = 5 + variant % 4;
      setRect(g, 7, 3, 2, 10, cactus);
      setRect(g, 5, armY, 2, 4, cactus);
      setRect(g, 9, Math.max(4, armY - 2), 2, 5, cactus);
      setPx(g, 7, 2, '#8bd77a');
      setPx(g, 8, 5, '#a5e88a');
      setPx(g, 11, 7, '#a5e88a');
    } else {
      setRect(g, 0, 0, 16, 16, '#d7bb76');
      setRect(g, 7, 3, 2, 10, '#3f9c5e');
      setRect(g, 5, 6, 2, 4, '#3f9c5e');
      setRect(g, 9, 5, 2, 5, '#3f9c5e');
      setPx(g, 7, 2, '#62c47d');
    }
    if (id === TILE_ID.PATH) {
      setRect(g, 0, 0, 16, 1, 'rgba(255,244,210,0.08)');
      setRect(g, 0, 15, 16, 1, 'rgba(52,41,28,0.1)');
    }
    const c = gridToCanvas(g);
    tileCache.set(cacheKey, c);
    return c;
  }

  function drawLargeTree(ctx, x, y, variant, time) {
    const palettes = [
      { dark: '#102d27', mid: '#174236', leaf: '#28563b', light: '#8d9b53', sun: '#d0a45b' },
      { dark: '#102e29', mid: '#1a493b', leaf: '#2d6345', light: '#a0a25a', sun: '#d4a75d' },
      { dark: '#102c2b', mid: '#174448', leaf: '#285d58', light: '#899c5b', sun: '#c69a55' },
      { dark: '#1c3025', mid: '#304c30', leaf: '#486440', light: '#a0a05a', sun: '#d5a35b' }
    ];
    const colors = palettes[variant % palettes.length];
    const sway = Math.sin(time * 1.8 + x * 0.03 + y * 0.02) * 1.8;
    const canopy = [
      [0, -29], [5, -21], [1, -21], [10, -12], [5, -12], [15, -3],
      [8, -3], [21, 9], [14, 9], [27, 22], [-27, 22], [-14, 9],
      [-21, 9], [-8, -3], [-15, -3], [-5, -12], [-10, -12], [-1, -21],
      [-5, -21]
    ];

    ctx.save();
    ctx.fillStyle = 'rgba(10, 28, 24, 0.48)';
    ctx.beginPath();
    ctx.ellipse(x + 16, y + 31, 28, 8, 0, 0, TAU);
    ctx.fill();

    ctx.fillStyle = '#493528';
    ctx.fillRect(x + 11, y + 11, 12, 25);
    ctx.fillStyle = '#795238';
    ctx.fillRect(x + 14, y + 13, 5, 21);
    ctx.fillStyle = '#a57848';
    ctx.fillRect(x + 16, y + 19, 2, 10);
    ctx.fillStyle = '#5b402c';
    ctx.fillRect(x + 7, y + 31, 11, 5);
    ctx.fillRect(x + 18, y + 32, 10, 5);

    ctx.translate(x + 16 + sway, y + 2);
    ctx.scale(1.16, 1.2);
    ctx.fillStyle = colors.dark;
    ctx.beginPath();
    ctx.moveTo(canopy[0][0], canopy[0][1]);
    for (let i = 1; i < canopy.length; i++) ctx.lineTo(canopy[i][0], canopy[i][1]);
    ctx.closePath();
    ctx.fill();
    ctx.translate(1, 3);
    ctx.fillStyle = colors.mid;
    ctx.beginPath();
    ctx.moveTo(canopy[0][0] + 3, canopy[0][1]);
    for (let i = 1; i < canopy.length; i++) ctx.lineTo(canopy[i][0] + 3, canopy[i][1]);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = colors.leaf;
    ctx.fillRect(-5, -17, 10, 3);
    ctx.fillRect(-9, -9, 18, 3);
    ctx.fillRect(-14, 0, 28, 4);
    ctx.fillRect(-20, 12, 40, 4);
    ctx.fillRect(-23, 20, 46, 3);
    ctx.fillStyle = colors.light;
    ctx.fillRect(-4, -18, 6, 2);
    ctx.fillRect(-8, -10, 7, 2);
    ctx.fillRect(-13, -1, 10, 2);
    ctx.fillRect(-19, 11, 12, 2);
    ctx.fillRect(-22, 19, 13, 2);
    ctx.fillStyle = colors.sun;
    ctx.fillRect(3, -8, 3, 2);
    ctx.fillRect(8, 4, 4, 2);
    ctx.fillRect(-4, 14, 4, 2);
    ctx.fillStyle = 'rgba(8, 24, 23, 0.42)';
    ctx.fillRect(11, -2, 7, 15);
    ctx.restore();
  }

  const MINIMAP_COLORS = ['#596d45', '#28799a', '#1d4737', '#bf965d', '#a65c38', '#34383f', '#4f9c62', '#8d6a49', '#85483c', '#c7a879'];

  // ============================================================
  // 3. ITEMS, AUDIO, AND SMALL VISUAL CLASSES
  // ============================================================

  let nextItemId = 1;

  // One signature epic per role. Each has a stable art key so its pixel image
  // survives saves, mail, auctions and server normalization.
  const ROLE_ITEM_ART = {
    swordsman: 'roleSword',
    archer: 'roleBow',
    mage: 'roleStaff'
  };

  const ROLE_ITEM_DEFS = {
    swordsman: {
      name: 'Dawnfang Blade', art: ROLE_ITEM_ART.swordsman, icon: 'S',
      stats: { attack: 18, hp: 12, speed: 4, crit: 0.02 },
      effect: 'flame', spriteColor: '#eef5ff', color: '#ffd27a', price: 420,
      desc: 'Swordsman relic: a sunlit blade that burns on impact.'
    },
    archer: {
      name: 'Windsong Bow', art: ROLE_ITEM_ART.archer, icon: 'B',
      stats: { attack: 14, speed: 12, range: 28, crit: 0.04 },
      effect: 'frost', spriteColor: '#9ce7c4', color: '#8ee6ff', price: 420,
      desc: 'Archer relic: a living bow that hums with the north wind.'
    },
    mage: {
      name: 'Astral Flame Staff', art: ROLE_ITEM_ART.mage, icon: 'T',
      stats: { attack: 16, mana: 24, range: 18, manaRegen: 1.5 },
      effect: 'void', spriteColor: '#c9a6ff', color: '#ffb15c', price: 420,
      desc: 'Mage relic: focuses starlight into an eternal flame.'
    }
  };

  function roleItem(classId) {
    const def = ROLE_ITEM_DEFS[classId] || ROLE_ITEM_DEFS.swordsman;
    return makeItem(def.name, 'weapon', 'epic', def.stats, {
      classId,
      art: def.art,
      icon: def.icon,
      spriteColor: def.spriteColor,
      color: def.color,
      effect: def.effect,
      price: def.price,
      desc: def.desc
    });
  }

  function makeItem(name, slot, rarity, stats, extra = {}) {
    return {
      uid: extra.uid !== undefined ? extra.uid : nextItemId++,
      name,
      slot,
      rarity,
      stats: Object.assign({ hp: 0, attack: 0, defense: 0, speed: 0, range: 0, mana: 0, crit: 0, manaRegen: 0 }, stats),
      classId: extra.classId || null,
      // color/effect/enchant are used by the unique equipment sprite effects.
      spriteColor: extra.spriteColor || extra.color || RARITY[rarity].color,
      color: extra.color || null,
      effect: extra.effect || '',
      enchant: clamp(Number(extra.enchant) || 0, 0, 5),
      icon: extra.icon || name[0],
      art: extra.art || null,
      price: extra.price || Math.round(25 * RARITY[rarity].mult),
      heal: extra.heal || 0,
      quantity: slot === 'consumable' ? clamp(Math.floor(Number(extra.quantity) || 1), 1, 99) : 1,
      teleportTo: extra.teleportTo || null,
      desc: extra.desc || ''
    };
  }

  function teleportScroll() {
    return makeItem('Village Teleport Scroll', 'consumable', 'rare', {}, {
      art: 'scroll', icon: 'T', price: 55, teleportTo: 'village',
      desc: 'A one-use scroll that teleports you to Hearthvale Village.'
    });
  }

  function starterItems(classId) {
    const spriteColors = STARTER_SPRITE_COLORS[classId] || STARTER_SPRITE_COLORS.swordsman;
    const weapon = classId === 'swordsman'
      ? makeItem('Iron Sword', 'weapon', 'common', { attack: 5 }, { classId, art: 'sword', spriteColor: spriteColors.weapon, desc: 'Swordsman weapon. A trusty blade.' })
      : classId === 'archer'
        ? makeItem('Short Bow', 'weapon', 'common', { attack: 4 }, { classId, art: 'bow', spriteColor: spriteColors.weapon, desc: 'Archer weapon. Light and quick.' })
        : makeItem('Oak Staff', 'weapon', 'common', { attack: 6 }, { classId, art: 'staff', spriteColor: spriteColors.weapon, desc: 'Mage weapon. Channels fire magic.' });
    const armor = makeItem('Traveler Gear', 'armor', 'common', { hp: 10, defense: 2 }, { classId, art: 'armor', spriteColor: spriteColors.armor, desc: `Basic ${CLASS_DATA[classId].name} armor.` });
    return {
      equipment: { weapon, armor },
      inventory: [
        makeItem('Health Potion', 'consumable', 'common', {}, { art: 'potion', icon: 'P', heal: 55, quantity: 2, price: 20, desc: 'Restores 55 HP.' })
      ]
    };
  }

  function randomShopItem(index, classId = 'swordsman') {
    const rarities = ['common', 'rare', 'rare', 'epic'];
    const rarity = rarities[index % rarities.length];
    const mult = RARITY[rarity].mult;
    if (index % 3 === 2) return teleportScroll();
    const kind = index % 2 === 0 ? 'weapon' : 'armor';
    if (kind === 'weapon') {
      const weapon = classId === 'archer'
        ? { name: 'Windrunner Bow', art: 'bow', stats: { attack: Math.round(5 * mult), speed: Math.round(4 * mult), crit: 0.01 * mult }, color: '#7fc4ff' }
        : classId === 'mage'
          ? { name: 'Starweave Staff', art: 'staff', stats: { attack: Math.round(6 * mult), mana: Math.round(10 * mult), manaRegen: Math.round(0.5 * mult * 10) / 10 }, color: '#c28bff' }
          : { name: 'Runed Edge', art: 'sword', stats: { attack: Math.round(6 * mult), hp: Math.round(4 * mult), defense: Math.max(1, Math.round(mult)) }, color: '#d38bff' };
      return makeItem(weapon.name, 'weapon', rarity, weapon.stats, {
        classId, art: weapon.art, spriteColor: weapon.color,
        desc: `${CLASS_DATA[classId].name} weapon with role-specific attributes.`
      });
    }
    const armor = classId === 'archer'
      ? { name: 'Windwoven Vest', stats: { hp: Math.round(12 * mult), defense: Math.round(2 * mult), speed: Math.round(2 * mult) } }
      : classId === 'mage'
        ? { name: 'Aether Robe', stats: { hp: Math.round(10 * mult), defense: Math.max(1, Math.round(mult)), mana: Math.round(8 * mult), manaRegen: Math.round(0.4 * mult * 10) / 10 } }
        : { name: 'Dragonhide', stats: { hp: Math.round(16 * mult), defense: Math.round(3 * mult) } };
    return makeItem(
      armor.name,
      'armor', rarity, armor.stats,
      {
        classId,
        art: 'armor',
        spriteColor: rarity === 'epic' ? '#b465d9' : rarity === 'rare' ? '#5f86c9' : '#8a8f9c',
        desc: `${CLASS_DATA[classId].name} armor with role-specific attributes.`
      }
    );
  }

  function makeShopStock(classId = 'swordsman') {
    // Three familiar supplies plus one signature relic for each role.
    return [
      randomShopItem(0, classId),
      randomShopItem(1, classId),
      randomShopItem(2, classId),
      roleItem('swordsman'),
      roleItem('archer'),
      roleItem('mage')
    ];
  }

  function randomMobItem(classId = 'swordsman') {
    if (Math.random() < 0.22) return roleItem(classId);
    return randomShopItem(randInt(0, 5), classId);
  }

  function normalizeItem(raw, defaultClassId = null) {
    if (!raw || typeof raw !== 'object') return null;
    const slot = ['weapon', 'armor', 'consumable'].includes(raw.slot) ? raw.slot : 'consumable';
    const rarity = RARITY[raw.rarity] ? raw.rarity : 'common';
    const roleClassId = Object.entries(ROLE_ITEM_DEFS)
      .find(([id, def]) => raw.art === ROLE_ITEM_ART[id] || raw.name === def.name)?.[0];
    const classByWeaponType = weaponClassFor({ slot, art: raw.art, name: raw.name });
    return makeItem(String(raw.name || 'Item'), slot, rarity, raw.stats || {}, {
      // Keep the server UID: equip/enchant/mail/auction actions all refer to it.
      uid: raw.uid,
      classId: roleClassId || classByWeaponType || raw.classId || (slot === 'weapon' || slot === 'armor' ? defaultClassId : null),
      spriteColor: raw.spriteColor,
      color: raw.color,
      effect: raw.effect,
      enchant: raw.enchant,
      icon: raw.icon,
      art: raw.art,
      price: raw.price,
      heal: raw.heal,
      quantity: raw.quantity,
      teleportTo: raw.teleportTo,
      desc: raw.desc
    });
  }

  // STAGE 5: all sounds are synthesized with the Web Audio API - no files.
  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.volume = 0.35;
      this.musicTimer = null;
      this.step = 0;
    }

    unlock() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!this.ctx) {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.ctx.destination);
        this.startMusic();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    }

    setVolume(v) {
      this.volume = clamp(v, 0, 1);
      if (this.master) this.master.gain.value = this.volume;
    }

    tone(freq, duration, type = 'square', gain = 0.08, slideTo = 0) {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const amp = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), now + duration);
      amp.gain.setValueAtTime(gain, now);
      amp.gain.exponentialRampToValueAtTime(0.001, now + duration);
      osc.connect(amp);
      amp.connect(this.master);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    }

    sfx(name) {
      if (!this.ctx) return;
      switch (name) {
        case 'swing': this.tone(330, 0.10, 'sawtooth', 0.05, 120); break;
        case 'arrow': this.tone(760, 0.08, 'triangle', 0.045, 300); break;
        case 'magic': this.tone(520, 0.18, 'sine', 0.06, 900); break;
        case 'hit': this.tone(140, 0.10, 'square', 0.07, 70); break;
        case 'crit': this.tone(880, 0.16, 'square', 0.09, 160); break;
        case 'pickup': this.tone(660, 0.08, 'square', 0.05); this.tone(990, 0.10, 'square', 0.045); break;
        case 'level': [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.16, 'square', 0.07), i * 90)); break;
        case 'skill': this.tone(440, 0.16, 'triangle', 0.06, 880); break;
        case 'hurt': this.tone(200, 0.16, 'sawtooth', 0.08, 80); break;
        case 'portal': this.tone(300, 0.35, 'sine', 0.07, 1200); break;
        case 'ui': this.tone(600, 0.04, 'square', 0.035); break;
        case 'boss': this.tone(90, 0.35, 'sawtooth', 0.10, 45); break;
        default: this.tone(500, 0.06, 'square', 0.04);
      }
    }

    // A simple looping chiptune bass + melody made from short notes.
    startMusic() {
      if (this.musicTimer) return;
      const melody = [523, 0, 659, 784, 0, 659, 587, 0, 523, 0, 440, 523, 587, 0, 392, 0];
      const bass = [131, 131, 175, 175, 196, 196, 165, 165];
      this.musicTimer = setInterval(() => {
        if (!this.ctx || this.ctx.state !== 'running') return;
        const i = this.step % melody.length;
        if (melody[i]) this.tone(melody[i], 0.11, 'square', 0.018);
        if (i % 2 === 0) this.tone(bass[(i / 2) % bass.length], 0.20, 'triangle', 0.022);
        if (i % 4 === 0) this.tone(70, 0.05, 'square', 0.015);
        this.step++;
      }, 150);
    }
  }

  class FloatingText {
    constructor(x, y, text, color = '#fff', size = 13) {
      this.x = x;
      this.y = y;
      this.text = text;
      this.color = color;
      this.size = size;
      this.life = 0.9;
      this.maxLife = 0.9;
      this.vy = -34;
    }
    update(dt) {
      this.life -= dt;
      this.y += this.vy * dt;
      this.vy += 24 * dt;
    }
    draw(ctx) {
      const a = clamp(this.life / this.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = `bold ${this.size}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#000';
      ctx.fillText(this.text, this.x + 1, this.y + 1);
      ctx.fillStyle = this.color;
      ctx.fillText(this.text, this.x, this.y);
      ctx.restore();
    }
  }

  const MAGIC_SLASH_FRAMES = 6;
  const MAGIC_SLASH_SIZE = 48;
  const magicSlashCache = new Map();
  const MAGIC_SLASH_PALETTES = {
    steel: { edge: '#41657b', body: '#86b6d2', shine: '#d9f3ff', core: '#ffffff', spark: '#b8e9ff' },
    fire: { edge: '#842f27', body: '#ed542b', shine: '#ffb84f', core: '#fff1a8', spark: '#ffe27b' },
    ice: { edge: '#21627d', body: '#48bde2', shine: '#a3edff', core: '#f4ffff', spark: '#c6f7ff' },
    arcane: { edge: '#503076', body: '#a45ce0', shine: '#dcadff', core: '#fff2ff', spark: '#e8c5ff' }
  };

  function magicSlashSheet(element) {
    const palette = MAGIC_SLASH_PALETTES[element] || MAGIC_SLASH_PALETTES.arcane;
    const key = MAGIC_SLASH_PALETTES[element] ? element : 'arcane';
    if (magicSlashCache.has(key)) return magicSlashCache.get(key);

    const sheet = document.createElement('canvas');
    sheet.width = MAGIC_SLASH_SIZE * MAGIC_SLASH_FRAMES;
    sheet.height = MAGIC_SLASH_SIZE;
    const ctx = sheet.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    for (let frame = 0; frame < MAGIC_SLASH_FRAMES; frame++) {
      const progress = (frame + 1) / MAGIC_SLASH_FRAMES;
      const steps = 5 + frame * 3;
      const start = -1.08;
      const sweep = 0.55 + progress * 1.85;
      const radius = 15 + progress * 5;
      const points = [];
      for (let i = 0; i <= steps; i++) {
        const angle = start + sweep * i / steps;
        points.push({
          x: Math.round((24 + Math.cos(angle) * radius) / 2) * 2,
          y: Math.round((24 + Math.sin(angle) * radius) / 2) * 2
        });
      }

      ctx.save();
      ctx.translate(frame * MAGIC_SLASH_SIZE, 0);
      if (frame > 1) {
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = palette.spark;
        for (let i = 1; i < points.length; i += 4) {
          ctx.fillRect(points[i].x - 3, points[i].y + 4, 2, 2);
        }
      }
      ctx.globalAlpha = 1;
      for (const point of points) {
        ctx.fillStyle = palette.edge;
        ctx.fillRect(point.x - 4, point.y - 4, 8, 8);
        ctx.fillStyle = palette.body;
        ctx.fillRect(point.x - 3, point.y - 3, 6, 6);
        ctx.fillStyle = palette.shine;
        ctx.fillRect(point.x - 2, point.y - 2, 4, 4);
        ctx.fillStyle = palette.core;
        ctx.fillRect(point.x - 1, point.y - 1, 2, 2);
      }

      const tip = points[points.length - 1];
      ctx.fillStyle = palette.spark;
      ctx.fillRect(tip.x + 2, tip.y - 5, 3, 3);
      ctx.fillRect(tip.x - 4, tip.y + 3, 2, 2);
      if (frame < 5) {
        ctx.fillRect(tip.x + 6, tip.y - 1, 2, 2);
        ctx.fillRect(tip.x - 7, tip.y - 6, 2, 2);
      }
      if (frame >= 3) {
        ctx.fillStyle = palette.shine;
        ctx.fillRect(8, 35, 3, 2);
        ctx.fillRect(36, 8, 2, 3);
      }
      ctx.restore();
    }

    magicSlashCache.set(key, sheet);
    return sheet;
  }

  // Small reusable effect: pixel slash sheets, expanding rings and spark particles.
  class Effect {
    constructor(kind, x, y, opts = {}) {
      this.kind = kind;
      this.x = x;
      this.y = y;
      this.life = opts.life || 0.35;
      this.maxLife = this.life;
      this.color = opts.color || '#fff';
      this.radius = opts.radius || 30;
      this.endRadius = opts.endRadius || this.radius * 2;
      this.angle = opts.angle || 0;
      this.element = opts.element || 'steel';
      this.vx = opts.vx || 0;
      this.vy = opts.vy || 0;
      this.size = opts.size || 3;
      this.x2 = Number.isFinite(opts.x2) ? opts.x2 : this.x;
      this.y2 = Number.isFinite(opts.y2) ? opts.y2 : this.y;
      this.variant = clamp(Math.floor(Number(opts.variant) || 0), 0, 3);
    }
    update(dt) {
      this.life -= dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (this.kind === 'particle') this.vy += 90 * dt;
    }
    draw(ctx) {
      const t = 1 - clamp(this.life / this.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = clamp(this.life / this.maxLife, 0, 1);
      if (this.kind === 'slash') {
        const frame = Math.min(MAGIC_SLASH_FRAMES - 1, Math.floor(t * MAGIC_SLASH_FRAMES));
        const size = this.radius * 2;
        const palette = MAGIC_SLASH_PALETTES[this.element] || MAGIC_SLASH_PALETTES.arcane;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.imageSmoothingEnabled = false;
        ctx.shadowColor = palette.shine;
        ctx.shadowBlur = 7 * (1 - t);
        ctx.drawImage(
          magicSlashSheet(this.element),
          frame * MAGIC_SLASH_SIZE, 0, MAGIC_SLASH_SIZE, MAGIC_SLASH_SIZE,
          -size / 2, -size / 2, size, size
        );
      } else if (this.kind === 'ring') {
        ctx.strokeStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 10 * (1 - t);
        ctx.lineWidth = 2 + (1 - t) * 1.5;
        ctx.beginPath();
        ctx.arc(this.x, this.y, lerp(this.radius, this.endRadius, t), 0, TAU);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha *= 0.55;
        ctx.setLineDash([5, 6]);
        ctx.lineDashOffset = -t * 24;
        ctx.beginPath();
        ctx.arc(this.x, this.y, lerp(this.radius * 0.72, this.endRadius * 0.72, t), 0, TAU);
        ctx.stroke();
      } else if (this.kind === 'rune') {
        const progress = 1 - Math.pow(1 - t, 3);
        const radius = lerp(this.radius, this.endRadius, progress);
        const spin = this.angle + t * (this.variant % 2 ? -2.4 : 2.4);
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 14 * (1 - t);
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2.5 * (1 - t * 0.45);
        ctx.beginPath();
        ctx.ellipse(this.x, this.y, radius, radius * 0.42, 0, 0, TAU);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha *= 0.72;
        ctx.setLineDash([5, 4]);
        ctx.lineDashOffset = -t * 28;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(this.x, this.y, radius * 0.76, radius * 0.3, 0, spin, spin + TAU * 0.86);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(spin);
        ctx.globalAlpha *= 0.92;
        ctx.lineWidth = 2;
        const inner = Math.min(12, radius * 0.28);
        if (this.variant === 0) {
          ctx.beginPath();
          ctx.moveTo(0, -inner); ctx.lineTo(inner * 0.42, 0);
          ctx.lineTo(0, inner); ctx.lineTo(-inner * 0.42, 0);
          ctx.closePath(); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-inner * 0.8, 0); ctx.lineTo(inner * 0.8, 0); ctx.stroke();
        } else if (this.variant === 1) {
          ctx.beginPath();
          ctx.moveTo(0, -inner); ctx.lineTo(inner * 0.75, -inner * 0.55);
          ctx.lineTo(inner * 0.58, inner * 0.48); ctx.lineTo(0, inner);
          ctx.lineTo(-inner * 0.58, inner * 0.48); ctx.lineTo(-inner * 0.75, -inner * 0.55);
          ctx.closePath(); ctx.stroke();
        } else if (this.variant === 2) {
          ctx.beginPath(); ctx.arc(0, 0, inner, spin, spin + Math.PI * 1.4); ctx.stroke();
          ctx.beginPath(); ctx.arc(0, 0, inner * 0.48, spin + Math.PI, spin + Math.PI * 2.5); ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.moveTo(-inner, 0); ctx.lineTo(-inner * 0.45, -inner * 0.55);
          ctx.lineTo(0, 0); ctx.lineTo(inner * 0.55, -inner * 0.8);
          ctx.lineTo(inner, 0); ctx.lineTo(inner * 0.4, inner * 0.56);
          ctx.lineTo(0, 0); ctx.lineTo(-inner * 0.55, inner * 0.8);
          ctx.closePath(); ctx.stroke();
        }
        ctx.restore();

        ctx.fillStyle = this.color;
        for (let i = 0; i < 6; i++) {
          const a = spin + i / 6 * TAU;
          const rx = radius * 0.76 * Math.cos(a);
          const ry = radius * 0.3 * Math.sin(a);
          ctx.fillRect(this.x + rx - 1.5, this.y + ry - 1.5, 3, 3);
        }
      } else if (this.kind === 'warning') {
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, TAU);
        ctx.stroke();
      } else if (this.kind === 'line') {
        ctx.strokeStyle = this.color;
        ctx.lineWidth = this.size;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x2, this.y2);
        ctx.stroke();
      } else if (this.kind === 'meteor') {
        const fall = 1 - clamp(this.life / this.maxLife, 0, 1);
        const my = this.y - (1 - fall) * 300;
        ctx.fillStyle = 'rgba(255,120,50,0.22)';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * (0.35 + fall * 0.65), 0, TAU);
        ctx.fill();
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.x, my, 18 + Math.sin(this.life * 28) * 3, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = '#ff5e2b';
        ctx.fillRect(this.x - 9, my - 9, 18, 18);
        ctx.fillStyle = '#ffd166';
        ctx.fillRect(this.x - 5, my - 5, 10, 10);
      } else {
        ctx.fillStyle = this.color;
        ctx.fillRect(Math.round(this.x), Math.round(this.y), this.size, this.size);
      }
      ctx.restore();
    }
  }

  class Pickup {
    constructor(kind, x, y, amount = 1, item = null) {
      this.kind = kind;
      this.x = x;
      this.y = y;
      this.amount = amount;
      this.item = item;
      this.vx = kind === 'chest' ? 0 : rand(-45, 45);
      this.vy = kind === 'chest' ? 0 : rand(-70, -30);
      // Loot pops up, then rests here instead of falling through the map.
      this.groundY = kind === 'chest' ? y : y + 8;
      this.age = 0;
      this.collected = false;
      this.petPull = false;
      this.fullBagNoticeAt = -Infinity;
      // XP should be visible for a moment before the magnet takes it.
      this.dropDelay = kind === 'xp' ? 0.16 : 0;
    }
    update(dt, game) {
      this.age += dt;
      if (this.kind === 'chest') return;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vy += 160 * dt;
      this.vx *= Math.pow(0.02, dt);
      if (this.y >= this.groundY) {
        this.y = this.groundY;
        this.vy = 0;
        this.vx *= Math.pow(0.001, dt);
      }
      if (game.isBlocked(this.x, this.y, 2)) {
        this.x -= this.vx * dt;
        this.y -= this.vy * dt;
        this.vx = this.vy = 0;
      }
      if (this.age < this.dropDelay) return;
      // XP gently homes in so a drop is never missed at melee range.
      if (this.kind === 'xp' && game.player) {
        const d = dist(this, game.player);
        if (d < 90) {
          const a = angleTo(this, game.player);
          const speed = 170 + (90 - d) * 2;
          this.x += Math.cos(a) * speed * dt;
          this.y += Math.sin(a) * speed * dt;
        }
      }
      // STAGE 4: the pet gently pulls nearby loot toward the player.
      const pet = game.pet;
      if (pet && dist(this, pet) < 55) this.petPull = true;
      if (this.petPull && game.player) {
        const target = dist(this, game.player) < 24 ? game.player : pet;
        const a = angleTo(this, target);
        const speed = 230;
        this.x += Math.cos(a) * speed * dt;
        this.y += Math.sin(a) * speed * dt;
      }
      if (game.player && dist(this, game.player) < 26) game.collectPickup(this);
    }
    draw(ctx, game = null) {
      const bob = Math.sin(this.age * 5) * 2;
      const x = Math.round(this.x);
      const y = Math.round(this.y + bob);
      ctx.save();
      if (this.kind === 'chest') {
        const playerId = game && game.network ? game.network.playerId : null;
        const opened = Array.isArray(this.openedBy) && this.openedBy.some(id => String(id) === String(playerId));
        const pulse = 0.75 + (Math.sin(this.age * 4) + 1) * 0.12;
        ctx.globalAlpha = opened ? 0.62 : 1;
        ctx.fillStyle = `rgba(255, 199, 75, ${pulse * (opened ? 0.12 : 0.24)})`;
        ctx.beginPath();
        ctx.ellipse(x, y + 2, 23, 13, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#71451f';
        ctx.fillRect(x - 15, y - 7, 30, 15);
        ctx.fillStyle = '#bd7931';
        ctx.fillRect(x - 13, y - 5, 26, 11);
        ctx.fillStyle = '#8c531f';
        ctx.fillRect(x - 16, y - 12, 32, 7);
        ctx.fillStyle = '#e8b64c';
        ctx.fillRect(x - 14, y - 11, 28, 4);
        ctx.fillRect(x - 13, y + 1, 26, 2);
        ctx.fillRect(x - 2, y - 9, 4, 9);
        ctx.fillStyle = '#fff0a6';
        ctx.fillRect(x - 1, y - 6, 2, 4);
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffe59a';
        ctx.fillText(opened ? 'OPENED' : 'BOSS CHEST', x, y - 17);
      } else if (this.kind === 'gold') {
        ctx.fillStyle = '#8a5f16';
        ctx.fillRect(x - 4, y - 4, 8, 8);
        ctx.fillStyle = '#ffd75e';
        ctx.fillRect(x - 3, y - 3, 6, 6);
        ctx.fillStyle = '#fff2a8';
        ctx.fillRect(x - 2, y - 2, 2, 2);
      } else if (this.kind === 'xp') {
        const pulse = 1 + Math.sin(this.age * 6) * 0.18;
        ctx.fillStyle = 'rgba(111,208,255,0.22)';
        ctx.beginPath();
        ctx.arc(x, y, 10 * pulse, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = '#8ee6ff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, 7 * pulse, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = '#6fd0ff';
        ctx.fillRect(x - 3, y - 3, 6, 6);
        ctx.fillStyle = '#f2fdff';
        ctx.fillRect(x - 1, y - 2, 2, 2);
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#d7f5ff';
        ctx.fillText('XP', x, y - 11);
      } else if (this.kind === 'herb') {
        ctx.fillStyle = '#3da85e';
        ctx.fillRect(x - 1, y - 6, 2, 8);
        ctx.fillRect(x - 4, y - 4, 4, 2);
        ctx.fillRect(x + 1, y - 2, 4, 2);
      } else if (this.kind === 'ore' || (this.kind === 'material' && this.material === 'ore')) {
        ctx.fillStyle = '#51667c';
        ctx.fillRect(x - 5, y - 4, 10, 8);
        ctx.fillStyle = '#9ce7ff';
        ctx.fillRect(x - 3, y - 3, 3, 3);
        ctx.fillRect(x + 1, y - 1, 3, 3);
      } else if (this.kind === 'essence' || (this.kind === 'material' && this.material === 'essence')) {
        ctx.fillStyle = `rgba(201,139,255,${0.18 + (Math.sin(this.age * 8) + 1) * 0.1})`;
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#9f63e6';
        ctx.beginPath();
        ctx.moveTo(x, y - 7); ctx.lineTo(x + 5, y - 1);
        ctx.lineTo(x + 3, y + 6); ctx.lineTo(x - 3, y + 6);
        ctx.lineTo(x - 5, y - 1); ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#f0d7ff';
        ctx.fillRect(x - 1, y - 4, 2, 5);
      } else if (this.kind === 'potion') {
        ctx.fillStyle = '#e6e9f2';
        ctx.fillRect(x - 2, y - 6, 4, 2);
        ctx.fillStyle = '#e8515c';
        ctx.fillRect(x - 3, y - 4, 6, 7);
      } else if (this.kind === 'item') {
        const c = this.item && RARITY[this.item.rarity] ? RARITY[this.item.rarity].color : '#fff';
        ctx.fillStyle = 'rgba(8,12,22,0.85)';
        ctx.fillRect(x - 11, y - 11, 22, 22);
        ctx.strokeStyle = c;
        ctx.lineWidth = 1;
        ctx.strokeRect(x - 10.5, y - 10.5, 21, 21);
        drawItemImage(ctx, this.item, x - 9, y - 9, 18);
      }
      ctx.restore();
    }
  }

  // STAGE 1 + 2: arrows, fireballs, poison shots, boss orbs, etc.
  class Projectile {
    constructor(opts) {
      this.x = opts.x;
      this.y = opts.y;
      this.vx = opts.vx;
      this.vy = opts.vy;
      this.damage = opts.damage || 10;
      this.owner = opts.owner || null;
      this.team = opts.team || 'player';
      this.kind = opts.kind || 'arrow';
      this.radius = opts.radius || 6;
      this.life = opts.life || 3;
      this.aoe = opts.aoe || 0;
      this.slow = opts.slow || 0;
      this.poison = opts.poison || 0;
      this.crit = opts.crit || false;
      this.dead = false;
      this.trailTimer = 0;
    }
    update(dt, game) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.life -= dt;
      if (this.life <= 0 || game.isProjectileBlocked(this.x, this.y, this.radius)) {
        this.onHit(game);
        return;
      }
      this.trailTimer -= dt;
      if (this.trailTimer <= 0) {
        const col = this.kind === 'fireball' ? '#ff8c42' : this.kind === 'poison' ? '#78e06a' : this.kind === 'scoutBolt' ? '#ffbf69' : '#9fd8ff';
        game.effects.push(new Effect('particle', this.x, this.y, { color: col, life: 0.22, size: 3 }));
        this.trailTimer = 0.04;
      }
      if (this.team === 'player') {
        for (const e of game.enemies) {
          if (e.alive && dist(this, e) < e.radius + this.radius) {
            game.damageEnemy(e, this.damage, this.owner, this.crit, this.kind, { slow: this.slow, poison: this.poison });
            this.onHit(game);
            return;
          }
        }
      } else {
        for (const t of game.combatTargets()) {
          if (t.alive && dist(this, t) < t.radius + this.radius) {
            game.damageTarget(t, this.damage, this.owner, this.kind);
            this.onHit(game);
            return;
          }
        }
      }
    }
    onHit(game) {
      if (this.dead) return;
      this.dead = true;
      if (this.aoe > 0) {
        game.areaDamage(this.x, this.y, this.aoe, this.damage * 0.6, this.owner, this.kind, { slow: this.slow });
        game.effects.push(new Effect('ring', this.x, this.y, { color: '#ff8c42', radius: 8, endRadius: this.aoe, life: 0.35 }));
        if (this.kind === 'fireball') {
          game.effects.push(new Effect('slash', this.x, this.y - 6, {
            element: 'fire', angle: Math.atan2(this.vy, this.vx), radius: 30, life: 0.28
          }));
        }
        game.shake = Math.max(game.shake, 5);
        game.audio.sfx('magic');
      } else if (this.kind === 'arrow' || this.kind === 'poison') {
        game.audio.sfx('arrow');
      }
    }
    draw(ctx) {
      const a = Math.atan2(this.vy, this.vx);
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(a);
      if (this.kind === 'arrow' || this.kind === 'poison') {
        const col = this.kind === 'poison' ? '#8ee46d' : '#e8dfc6';
        ctx.fillStyle = col;
        ctx.fillRect(-8, -1, 16, 2);
        ctx.fillStyle = '#fff';
        ctx.fillRect(6, -2, 3, 4);
        ctx.fillStyle = '#8a6a4a';
        ctx.fillRect(-10, -3, 3, 6);
      } else if (this.kind === 'fireball') {
        ctx.fillStyle = '#ff5e2b';
        ctx.fillRect(-5, -5, 10, 10);
        ctx.fillStyle = '#ffd166';
        ctx.fillRect(-3, -3, 6, 6);
        ctx.fillStyle = '#fff3c4';
        ctx.fillRect(-1, -1, 3, 3);
      } else if (this.kind === 'scoutBolt') {
        ctx.fillStyle = '#ff9d4d';
        ctx.fillRect(-5, -3, 10, 6);
        ctx.fillStyle = '#ffe2a8';
        ctx.fillRect(1, -2, 4, 4);
      } else if (this.kind === 'bossOrb') {
        ctx.fillStyle = '#ff4fa3';
        ctx.fillRect(-6, -6, 12, 12);
        ctx.fillStyle = '#ffd0e8';
        ctx.fillRect(-3, -3, 5, 5);
      } else {
        ctx.fillStyle = '#9ce7ff';
        ctx.fillRect(-4, -4, 8, 8);
      }
      ctx.restore();
    }
  }

  // ============================================================
  // 4. GAME OBJECT CLASSES
  // ============================================================

  let nextEnemyId = 1;

  // STAGE 1 + 2: the player. One class handles all three character classes.
  class Player {
    constructor(classId, name, x, y) {
      this.classId = classId;
      this.name = String(name || 'Hero').slice(0, 14) || 'Hero';
      this.x = x;
      this.y = y;
      this.radius = 12;
      this.alive = true;
      this.level = 1;
      this.xp = 0;
      this.xpNext = 80;
      this.gold = 30;
      this.skillPoints = 0;
      this.skillRanks = [1, 1, 1, 1];
      this.skillCd = [0, 0, 0, 0];
      this.facing = 0;
      this.aim = 0;
      this.attackCd = 0;
      this.attackAnim = 0;
      this.skillAnim = 0;
      this.skillAnimDuration = 0.55;
      this.skillAnimColor = '#fff';
      this.skillAnimName = '';
      this.walkFrame = 0;
      this.walkTimer = 0;
      this.shieldTime = 0;
      this.invuln = 0;
      this.dashTime = 0;
      this.emote = null;
      this.critChance = 0.10;
      // Deeper progression (expansion 5).
      this.spec = '';
      this.talents = { power: 0, haste: 0, vigor: 0, crit: 0, guard: 0, focus: 0 };
      this.materials = { herb: 0, ore: 0, essence: 0 };
      this.hp = CLASS_DATA[classId].maxHp;
      this.mp = CLASS_DATA[classId].mana;
      const starter = starterItems(classId);
      this.equipment = starter.equipment;
      this.inventory = starter.inventory;
      this.recalculateStats(false);
      this.hp = this.maxHp;
      this.mp = this.maxMp;
    }

    // Final stats = class base + level growth + equipment bonuses.
    recalculateStats(clampValues = true) {
      const base = CLASS_DATA[this.classId];
      const lv = this.level - 1;
      const weapon = this.equipment.weapon && itemCanEquip(this.equipment.weapon, this.classId) ? this.equipment.weapon.stats : {};
      const armor = this.equipment.armor && itemCanEquip(this.equipment.armor, this.classId) ? this.equipment.armor.stats : {};
      const t = this.talents || {};
      // These modifiers mirror the authoritative server formulas so offline and
      // online characters feel the same.
      const specMods = {
        Guardian: { hp: 35, defense: 5, taken: 0.9 },
        Berserker: { attack: 9, defense: -2 },
        Ranger: { speed: 16, range: 35 },
        Assassin: { attack: 6, crit: 0.08, cd: 0.9 },
        Pyromancer: { attack: 8, mana: 20 },
        Cryomancer: { mana: 40, hp: 12 }
      }[this.spec] || {};
      this.maxHp = Math.round(base.maxHp + lv * (this.classId === 'swordsman' ? 14 : 9) + (weapon.hp || 0) + (armor.hp || 0) + (specMods.hp || 0) + (t.vigor || 0) * 12);
      this.maxMp = Math.round(base.mana + lv * 5 + (weapon.mana || 0) + (armor.mana || 0) + (specMods.mana || 0) + (t.focus || 0) * 5);
      this.finalStats = {
        attack: base.attack + lv * 3 + (weapon.attack || 0) + (armor.attack || 0) + (specMods.attack || 0) + Math.round(base.attack * 0.04 * (t.power || 0)),
        speed: clamp(base.speed + lv * 1.2 + (weapon.speed || 0) + (armor.speed || 0) + (specMods.speed || 0), 60, 210),
        range: base.range + (weapon.range || 0) + (specMods.range || 0),
        defense: Math.max(0, base.defense + lv * 0.6 + (weapon.defense || 0) + (armor.defense || 0) + (specMods.defense || 0) + (t.guard || 0) * 2),
        crit: 0.10 + (weapon.crit || 0) + (armor.crit || 0) + (t.crit || 0) * 0.03 + (specMods.crit || 0),
        manaRegen: base.manaRegen + lv * 0.3 + (weapon.manaRegen || 0) + (armor.manaRegen || 0) + (t.focus || 0) * 0.5,
        cooldownMult: (1 - (t.haste || 0) * 0.04) * (specMods.cd || 1),
        damageTakenMult: (1 - (t.guard || 0) * 0.04) * (specMods.taken || 1)
      };
      this.critChance = this.finalStats.crit;
      if (clampValues) {
        this.hp = clamp(this.hp, 0, this.maxHp);
        this.mp = clamp(this.mp, 0, this.maxMp);
      }
    }

    // Visible cast animation shared by offline play and server fx events.
    playSkillAnim(game, def, color) {
      this.skillAnimDuration = 0.55;
      this.skillAnim = this.skillAnimDuration;
      this.skillAnimColor = color || CLASS_DATA[this.classId].color;
      this.skillAnimName = def && def.name ? def.name : '';
      if (game && this.skillAnimName) {
        game.addFloater(this.x, this.y - 96, this.skillAnimName, this.skillAnimColor, 11);
      }
    }

    update(dt, game) {
      this.attackCd = Math.max(0, this.attackCd - dt);
      this.attackAnim = Math.max(0, this.attackAnim - dt);
      this.skillAnim = Math.max(0, this.skillAnim - dt);
      this.shieldTime = Math.max(0, this.shieldTime - dt);
      this.invuln = Math.max(0, this.invuln - dt);
      for (let i = 0; i < 4; i++) this.skillCd[i] = Math.max(0, this.skillCd[i] - dt);
      if (this.emote) {
        this.emote.time -= dt;
        if (this.emote.time <= 0) this.emote = null;
      }

      // STAGE 2: mana / stamina regenerates over time.
      const regen = this.finalStats.manaRegen;
      this.mp = Math.min(this.maxMp, this.mp + regen * dt);
      if (!game.playerInCombat) this.hp = Math.min(this.maxHp, this.hp + 0.8 * dt);

      // Keyboard OR the STAGE 5 touch joystick.
      const k = game.input.keys;
      let dx = 0;
      let dy = 0;
      if (k['a'] || k['arrowleft']) dx -= 1;
      if (k['d'] || k['arrowright']) dx += 1;
      if (k['w'] || k['arrowup']) dy -= 1;
      if (k['s'] || k['arrowdown']) dy += 1;
      if (game.input.joystick.active) {
        dx += game.input.joystick.x;
        dy += game.input.joystick.y;
      }
      let movingInput = false;
      if (!game.chatOpen && !game.paused && !game.panel) {
        const len = Math.hypot(dx, dy);
        if (len > 0) {
          movingInput = true;
          dx /= len;
          dy /= len;
          const speed = this.finalStats.speed * (this.shieldTime > 0 ? 0.55 : 1);
          game.tryMove(this, dx * speed * dt, dy * speed * dt);
          this.facing = Math.atan2(dy, dx);
          this.walkTimer += dt;
          this.walkFrame = playerGaitFrame(this.walkTimer, this.finalStats.speed, this.dashTime > 0);
        } else if (this.dashTime <= 0) {
          this.walkFrame = 0;
        }
        if (k[' '] && this.attackCd <= 0) this.attack(game);
      }

      this.aim = game.getAimAngle(this);

      // Dash movement from Dash Strike / Roll Dodge.
      if (this.dashTime > 0) {
        this.dashTime -= dt;
        const dashSpeed = 520;
        game.tryMove(this, Math.cos(this.facing) * dashSpeed * dt, Math.sin(this.facing) * dashSpeed * dt);
        if (!movingInput) {
          this.walkTimer += dt;
          this.walkFrame = playerGaitFrame(this.walkTimer, this.finalStats.speed, true);
        }
      }
      // Blink is instant, so it is handled directly in useSkill().
    }

    attack(game) {
      if (this.attackCd > 0) return;
      game.acquireAutoLockTarget();
      this.aim = game.getAimAngle(this);
      this.attackCd = this.classId === 'rogue' ? 0.28 : this.classId === 'archer' ? 0.31 : this.classId === 'cleric' ? 0.42 : this.classId === 'summoner' ? 0.48 : this.classId === 'mage' ? 0.55 : 0.45;
      this.attackAnim = 0.35;
      const crit = Math.random() < this.critChance;
      const damage = this.finalStats.attack * (crit ? 1.8 : 1);
      if (this.classId === 'swordsman' || this.classId === 'cleric' || this.classId === 'rogue') {
        game.audio.sfx('swing');
        const slashColor = this.classId === 'cleric' ? '#ffd75e' : this.classId === 'rogue' ? '#52ffb8' : '#eaf4ff';
        const slashElem = this.classId === 'cleric' ? 'holy' : 'steel';
        game.effects.push(new Effect('slash', this.x, this.y - 14, {
          color: slashColor, element: slashElem, angle: this.aim, radius: this.classId === 'cleric' ? 30 : 26, life: 0.20
        }));
        for (const e of game.enemies) {
          if (!e.alive) continue;
          const d = dist(this, e);
          const a = angleTo(this, e);
          const diff = Math.abs(Math.atan2(Math.sin(a - this.aim), Math.cos(a - this.aim)));
          if (d < this.finalStats.range + e.radius && diff < 1.2) {
            game.damageEnemy(e, damage, this, crit, slashElem);
          }
        }
      } else if (this.classId === 'archer') {
        game.audio.sfx('arrow');
        game.spawnProjectile({
          x: this.x + Math.cos(this.aim) * 14,
          y: this.y - 10 + Math.sin(this.aim) * 14,
          vx: Math.cos(this.aim) * 540,
          vy: Math.sin(this.aim) * 540,
          damage, owner: this, crit, kind: 'arrow', radius: 5, life: 2.2
        });
      } else if (this.classId === 'summoner') {
        game.audio.sfx('magic');
        game.spawnProjectile({
          x: this.x + Math.cos(this.aim) * 14,
          y: this.y - 10 + Math.sin(this.aim) * 14,
          vx: Math.cos(this.aim) * 440,
          vy: Math.sin(this.aim) * 440,
          damage, owner: this, crit, kind: 'arcane', aoe: 35, radius: 7, life: 2.2
        });
      } else {
        game.audio.sfx('magic');
        game.spawnProjectile({
          x: this.x + Math.cos(this.aim) * 14,
          y: this.y - 10 + Math.sin(this.aim) * 14,
          vx: Math.cos(this.aim) * 350,
          vy: Math.sin(this.aim) * 350,
          damage, owner: this, crit, kind: 'fireball', aoe: 54, radius: 8, life: 2.4
        });
      }
    }

    // Skills share cooldown and resource handling across all four hotbar slots.
    useSkill(index, game) {
      if (!this.alive || game.panel || game.paused) return;
      const def = SKILLS[this.classId][index];
      if (!def) return;
      if (this.skillCd[index] > 0) {
        game.addFloater(this.x, this.y - 40, 'Cooling down', '#9aa6bd', 10);
        return;
      }
      if (this.mp < def.cost) {
        game.addFloater(this.x, this.y - 40, 'Need energy!', '#ff9b9b', 10);
        game.audio.sfx('ui');
        return;
      }
      this.mp -= def.cost;
      const rank = this.skillRanks[index];
      const power = 1 + (rank - 1) * 0.28;
      this.skillCd[index] = def.cd * (1 - (rank - 1) * 0.08) * this.finalStats.cooldownMult;
      game.audio.sfx('skill');
      const fxColors = this.classId === 'swordsman'
        ? ['#dceeff', '#8fd0ff', '#eaf4ff', '#d2c2a0']
        : this.classId === 'archer'
          ? ['#b9ffcb', '#b9ffcb', '#8ee46d', '#a8e8ff']
          : this.classId === 'cleric'
            ? ['#ffd75e', '#a8f0cd', '#8ee6ff', '#fff3a8']
            : this.classId === 'rogue'
              ? ['#52ffb8', '#8a9ba8', '#a8ff78', '#ff4d6d']
              : this.classId === 'summoner'
                ? ['#d7b8ff', '#bf7fff', '#70d6ff', '#e08bff']
                : ['#9ce7ff', '#d7b8ff', '#ff9c42', '#e7b8ff'];
      this.playSkillAnim(game, def, fxColors[index]);
      game.log(`${this.name} used ${def.name}!`, fxColors[index]);
      this.aim = game.getAimAngle(this);
      const aim = this.aim;
      game.addSkillRune(this.x, this.y + 2, index, fxColors[index], aim);
      const baseDamage = this.finalStats.attack * power;

      if (this.classId === 'swordsman') {
        if (index === 0) { // Dash Strike
          this.facing = aim;
          this.dashTime = 0.20;
          const tx = this.x + Math.cos(aim) * 95;
          const ty = this.y + Math.sin(aim) * 95;
          game.addSkillRune(tx, ty + 2, index, fxColors[index], aim, true);
          for (const e of game.enemies) {
            if (e.alive && dist(e, { x: tx, y: ty }) < 70) game.damageEnemy(e, baseDamage * 1.7, this, true, 'dash');
          }
          game.effects.push(new Effect('line', this.x, this.y - 10, { color: '#dceeff', x2: tx, y2: ty - 10, life: 0.22, size: 5 }));
          game.effects.push(new Effect('slash', tx, ty - 10, {
            element: 'steel', angle: aim, radius: 34, life: 0.24
          }));
          game.effects.push(new Effect('ring', tx, ty, { color: '#dceeff', radius: 10, endRadius: 70, life: 0.30 }));
          game.shake = Math.max(game.shake, 5);
        } else if (index === 1) { // Shield Block
          this.shieldTime = 3;
          game.effects.push(new Effect('ring', this.x, this.y - 10, { color: '#8fd0ff', radius: 16, endRadius: 40, life: 0.4 }));
        } else if (index === 2) { // Whirlwind
          game.areaDamage(this.x, this.y, 105, baseDamage * 1.4, this, 'whirlwind');
          game.effects.push(new Effect('ring', this.x, this.y - 8, { color: '#eaf4ff', radius: 20, endRadius: 105, life: 0.45 }));
          for (let i = 0; i < 14; i++) {
            const a = i / 14 * TAU;
            game.effects.push(new Effect('particle', this.x + Math.cos(a) * 30, this.y - 10 + Math.sin(a) * 30, {
              color: '#dceeff', vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, life: 0.35
            }));
          }
          game.shake = Math.max(game.shake, 6);
        } else { // Seismic Slam
          game.areaDamage(this.x, this.y, 145, baseDamage * 1.6, this, 'seismic', { slow: 0.35 });
          game.effects.push(new Effect('ring', this.x, this.y - 8, { color: '#d2c2a0', radius: 18, endRadius: 145, life: 0.55 }));
          game.shake = Math.max(game.shake, 8);
        }
      } else if (this.classId === 'archer') {
        if (index === 0) { // Multi-Shot
          for (const spread of [-0.20, 0, 0.20]) {
            const a = aim + spread;
            game.spawnProjectile({
              x: this.x + Math.cos(a) * 14, y: this.y - 10 + Math.sin(a) * 14,
              vx: Math.cos(a) * 560, vy: Math.sin(a) * 560,
              damage: baseDamage * 0.75, owner: this, kind: 'arrow', radius: 5, life: 2
            });
            game.effects.push(new Effect('line', this.x, this.y - 10, {
              color: '#b9ffcb', x2: this.x + Math.cos(a) * 150, y2: this.y - 10 + Math.sin(a) * 150,
              life: 0.20, size: 3
            }));
          }
        } else if (index === 1) { // Roll Dodge
          this.facing = aim;
          this.dashTime = 0.16;
          this.invuln = 0.65;
          game.effects.push(new Effect('ring', this.x, this.y - 6, { color: '#b9ffcb', radius: 12, endRadius: 44, life: 0.35 }));
          game.effects.push(new Effect('line', this.x, this.y - 8, {
            color: '#b9ffcb', x2: this.x + Math.cos(aim) * 70, y2: this.y - 8 + Math.sin(aim) * 70,
            life: 0.22, size: 4
          }));
        } else if (index === 2) { // Poison Arrow
          game.effects.push(new Effect('line', this.x, this.y - 10, {
            color: '#8ee46d', x2: this.x + Math.cos(aim) * 160, y2: this.y - 10 + Math.sin(aim) * 160,
            life: 0.24, size: 4
          }));
          game.spawnProjectile({
            x: this.x + Math.cos(aim) * 14, y: this.y - 10 + Math.sin(aim) * 14,
            vx: Math.cos(aim) * 500, vy: Math.sin(aim) * 500,
            damage: baseDamage * 0.9, owner: this, kind: 'poison', poison: 6 * power, radius: 6, life: 2.2
          });
        } else { // Arrow Rain
          const target = game.getAimPoint();
          game.addSkillRune(target.x, target.y, index, fxColors[index], aim, true);
          game.areaDamage(target.x, target.y, 112, baseDamage * 1.5, this, 'arrowRain');
          game.effects.push(new Effect('ring', target.x, target.y, { color: '#a8e8ff', radius: 12, endRadius: 112, life: 0.5 }));
          for (let i = 0; i < 12; i++) {
            const x = target.x + rand(-90, 90);
            const y = target.y + rand(-90, 90);
            game.effects.push(new Effect('line', x, y - 45, { color: '#b9ffcb', x2: x, y2: y + 8, life: 0.32, size: 2 }));
          }
        }
      } else if (this.classId === 'cleric') {
        if (index === 0) { // Holy Smite
          const target = game.getAimPoint();
          game.addSkillRune(target.x, target.y, index, fxColors[index], aim, true);
          game.effects.push(new Effect('line', target.x, target.y - 120, { color: '#ffd75e', x2: target.x, y2: target.y + 10, life: 0.32, size: 8 }));
          game.effects.push(new Effect('ring', target.x, target.y, { color: '#ffd75e', radius: 10, endRadius: 65, life: 0.4 }));
          game.areaDamage(target.x, target.y, 65, baseDamage * 1.7, this, 'holy');
          game.shake = Math.max(game.shake, 4);
        } else if (index === 1) { // Divine Heal
          const healAmt = Math.round(65 * power);
          this.hp = clamp(this.hp + healAmt, 1, this.maxHp);
          game.addFloater(this.x, this.y - 42, `+${healAmt}`, '#a8f0cd', 14);
          game.effects.push(new Effect('ring', this.x, this.y - 8, { color: '#a8f0cd', radius: 10, endRadius: 50, life: 0.4 }));
        } else if (index === 2) { // Aegis Ward
          this.shieldTime = 4;
          game.effects.push(new Effect('ring', this.x, this.y - 8, { color: '#8ee6ff', radius: 14, endRadius: 45, life: 0.5 }));
          game.addFloater(this.x, this.y - 42, 'Aegis Ward!', '#8ee6ff', 12);
        } else { // Radiant Nova
          game.areaDamage(this.x, this.y, 125, baseDamage * 2.2, this, 'holy');
          const healAmt = Math.round(35 * power);
          this.hp = clamp(this.hp + healAmt, 1, this.maxHp);
          game.addFloater(this.x, this.y - 42, `+${healAmt}`, '#ffd75e', 14);
          game.effects.push(new Effect('ring', this.x, this.y - 8, { color: '#fff3a8', radius: 15, endRadius: 125, life: 0.5 }));
          game.shake = Math.max(game.shake, 5);
        }
      } else if (this.classId === 'rogue') {
        if (index === 0) { // Shadow Strike
          const target = game.currentLockTarget();
          let tx = target ? target.x - Math.cos(target.facing || 0) * 28 : this.x + Math.cos(aim) * 90;
          let ty = target ? target.y - Math.sin(target.facing || 0) * 28 : this.y + Math.sin(aim) * 90;
          game.effects.push(new Effect('line', this.x, this.y - 8, { color: '#52ffb8', x2: tx, y2: ty - 8, life: 0.22, size: 4 }));
          this.x = tx; this.y = ty;
          game.effects.push(new Effect('slash', tx, ty - 10, { element: 'steel', angle: aim, radius: 34, life: 0.24 }));
          game.areaDamage(tx, ty, 60, baseDamage * 1.8 * 1.5, this, 'slash');
          game.shake = Math.max(game.shake, 4);
        } else if (index === 1) { // Smoke Bomb
          this.invuln = 2.5;
          game.effects.push(new Effect('ring', this.x, this.y - 8, { color: '#8a9ba8', radius: 10, endRadius: 80, life: 0.6 }));
          game.areaDamage(this.x, this.y, 80, baseDamage * 0.5, this, 'smoke', { slow: 0.5 });
          game.addFloater(this.x, this.y - 42, 'Vanish!', '#52ffb8', 12);
        } else if (index === 2) { // Poison Dart
          game.spawnProjectile({
            x: this.x + Math.cos(aim) * 14, y: this.y - 10 + Math.sin(aim) * 14,
            vx: Math.cos(aim) * 620, vy: Math.sin(aim) * 620,
            damage: baseDamage * 1.0, owner: this, kind: 'poison', poison: 10 * power, radius: 5, life: 2.0
          });
        } else { // Eviscerate
          const tx = this.x + Math.cos(aim) * 35;
          const ty = this.y + Math.sin(aim) * 35;
          game.effects.push(new Effect('slash', tx, ty - 8, { element: 'steel', angle: aim, radius: 44, life: 0.32 }));
          game.areaDamage(tx, ty, 75, baseDamage * 3.0, this, 'slash');
          game.shake = Math.max(game.shake, 7);
        }
      } else if (this.classId === 'summoner') {
        if (index === 0) { // Arcane Blast
          game.spawnProjectile({
            x: this.x + Math.cos(aim) * 14, y: this.y - 10 + Math.sin(aim) * 14,
            vx: Math.cos(aim) * 480, vy: Math.sin(aim) * 480,
            damage: baseDamage * 1.3, owner: this, kind: 'arcane', aoe: 40, radius: 7, life: 2.2
          });
        } else if (index === 1) { // Summon Familiar
          game.areaDamage(this.x, this.y, 90, baseDamage * 1.5, this, 'summon');
          game.effects.push(new Effect('ring', this.x, this.y - 8, { color: '#bf7fff', radius: 12, endRadius: 90, life: 0.5 }));
          game.addFloater(this.x, this.y - 42, 'Familiar Risen!', '#e08bff', 13);
        } else if (index === 2) { // Spirit Ward
          this.shieldTime = 5;
          this.mp = Math.min(this.maxMp, this.mp + 25);
          game.effects.push(new Effect('ring', this.x, this.y - 8, { color: '#70d6ff', radius: 10, endRadius: 45, life: 0.4 }));
          game.addFloater(this.x, this.y - 42, 'Spirit Ward!', '#70d6ff', 12);
        } else { // Soul Nova
          game.areaDamage(this.x, this.y, 135, baseDamage * 2.6, this, 'shadow');
          game.effects.push(new Effect('ring', this.x, this.y - 8, { color: '#e08bff', radius: 15, endRadius: 135, life: 0.55 }));
          game.shake = Math.max(game.shake, 6);
        }
      } else { // Mage
        if (index === 0) { // Ice Nova
          game.areaDamage(this.x, this.y, 135, baseDamage * 0.85, this, 'ice', { slow: 0.45 });
          game.effects.push(new Effect('slash', this.x, this.y - 10, {
            element: 'ice', angle: aim, radius: 38, life: 0.30
          }));
          game.effects.push(new Effect('ring', this.x, this.y - 10, { color: '#9ce7ff', radius: 25, endRadius: 135, life: 0.5 }));
          for (let i = 0; i < 16; i++) {
            const a = i / 16 * TAU;
            game.effects.push(new Effect('particle', this.x + Math.cos(a) * 24, this.y - 10 + Math.sin(a) * 24, {
              color: '#9ce7ff', vx: Math.cos(a) * 150, vy: Math.sin(a) * 150, life: 0.42
            }));
          }
          game.shake = Math.max(game.shake, 4);
        } else if (index === 1) { // Blink
          const tx = this.x + Math.cos(aim) * 170;
          const ty = this.y + Math.sin(aim) * 170;
          let nx = this.x;
          let ny = this.y;
          for (let s = 0; s <= 1; s += 0.05) {
            const px = lerp(this.x, tx, s);
            const py = lerp(this.y, ty, s);
            if (!game.isBlocked(px, py, this.radius)) { nx = px; ny = py; }
          }
          const oldX = this.x;
          const oldY = this.y;
          game.addSkillRune(oldX, oldY + 2, index, fxColors[index], aim, true);
          game.effects.push(new Effect('line', oldX, oldY - 10, {
            color: '#d7b8ff', x2: nx, y2: ny - 10, life: 0.25, size: 4
          }));
          game.effects.push(new Effect('ring', oldX, oldY - 10, { color: '#d7b8ff', radius: 8, endRadius: 40, life: 0.3 }));
          this.x = nx;
          this.y = ny;
          game.addSkillRune(this.x, this.y + 2, index, fxColors[index], aim, true);
          game.effects.push(new Effect('ring', this.x, this.y - 10, { color: '#e9d6ff', radius: 8, endRadius: 40, life: 0.3 }));
        } else if (index === 2) { // Meteor
          const target = game.getAimPoint();
          game.addSkillRune(target.x, target.y, index, fxColors[index], aim, true);
          game.pendingMeteors.push({ x: target.x, y: target.y, timer: 0.85, damage: baseDamage * 2.6, owner: this, radius: 108 });
          game.effects.push(new Effect('meteor', target.x, target.y, { color: '#ff8c42', radius: 108, life: 0.85 }));
        } else { // Arcane Burst
          const target = game.getAimPoint();
          game.addSkillRune(target.x, target.y, index, fxColors[index], aim, true);
          game.areaDamage(target.x, target.y, 105, baseDamage * 1.8, this, 'arcane');
          game.effects.push(new Effect('slash', target.x, target.y - 8, {
            element: 'arcane', angle: aim, radius: 42, life: 0.32
          }));
          game.effects.push(new Effect('ring', target.x, target.y, { color: '#e7b8ff', radius: 10, endRadius: 105, life: 0.45 }));
          for (let i = 0; i < 16; i++) {
            const a = i / 16 * TAU;
            game.effects.push(new Effect('particle', target.x, target.y, {
              color: '#e7b8ff', vx: Math.cos(a) * 145, vy: Math.sin(a) * 145, life: 0.4
            }));
          }
        }
      }
    }

    takeDamage(amount, game) {
      if (!this.alive || this.invuln > 0) return;
      let dmg = Math.max(1, Math.round(amount * this.finalStats.damageTakenMult - this.finalStats.defense * 0.5));
      if (this.shieldTime > 0) dmg = Math.max(1, Math.round(dmg * 0.2));
      this.hp -= dmg;
      game.playerInCombat = 2.5;
      game.addFloater(this.x, this.y - 42, `-${dmg}`, '#ff7d7d', 14);
      game.audio.sfx('hurt');
      game.shake = Math.max(game.shake, 3);
      if (this.hp <= 0) this.die(game);
    }

    die(game) {
      this.hp = 0;
      this.alive = false;
      const lost = Math.floor(this.gold * 0.1);
      this.gold -= lost;
      this.hp = Math.round(this.maxHp * 0.6);
      this.mp = Math.round(this.maxMp * 0.5);
      this.alive = true;
      game.travelTo({ to: 'village', arrive: ZONE_SPAWN.village });
      if (game.pet) { game.pet.x = this.x + 24; game.pet.y = this.y + 18; }
      game.log(`You were defeated! Lost ${lost} gold.`, '#ff9b9b');
      game.addFloater(this.x, this.y - 48, 'Respawn!', '#ffd75e', 15);
      game.shake = Math.max(game.shake, 10);
    }

    heal(amount) {
      const before = this.hp;
      this.hp = Math.min(this.maxHp, this.hp + amount);
      return Math.round(this.hp - before);
    }

    gainXp(amount, game) {
      this.xp += amount;
      game.addFloater(this.x, this.y - 76, `+${amount} XP`, '#8ee6ff', 11);
      while (this.xp >= this.xpNext) {
        this.xp -= this.xpNext;
        this.levelUp(game);
      }
    }

    levelUp(game) {
      this.level++;
      this.xpNext = Math.floor(80 * Math.pow(this.level, 1.28));
      this.skillPoints++;
      this.recalculateStats(false);
      this.hp = this.maxHp;
      this.mp = this.maxMp;
      game.addFloater(this.x, this.y - 96, 'LEVEL UP!', '#ffd75e', 18);
      game.log(`Level up! You are now level ${this.level}. (Skill point earned)`, '#ffd75e');
      game.audio.sfx('level');
      game.shake = Math.max(game.shake, 5);
      game.save();
    }

    canAddItem(item) {
      if (!item) return false;
      const quantity = item.slot === 'consumable' ? clamp(Math.floor(Number(item.quantity) || 1), 1, 99) : 1;
      const stack = this.inventory.find(existing => sameConsumableStack(existing, item) && (existing.quantity || 1) < 99);
      return this.inventory.length < 20 || !!stack && (stack.quantity || 1) + quantity <= 99;
    }

    addItem(item) {
      if (!this.canAddItem(item)) return false;
      item.quantity = item.slot === 'consumable' ? clamp(Math.floor(Number(item.quantity) || 1), 1, 99) : 1;
      const stack = this.inventory.find(existing => sameConsumableStack(existing, item) && (existing.quantity || 1) < 99);
      if (stack) {
        const total = (stack.quantity || 1) + item.quantity;
        if (total <= 99) { stack.quantity = total; return true; }
        stack.quantity = 99;
        item.quantity = total - 99;
      }
      this.inventory.push(item);
      return true;
    }

    equip(item, slot, game) {
      if (!item || item.slot !== slot || slot === 'consumable' || !itemCanEquip(item, this.classId)) return false;
      const old = this.equipment[slot];
      this.equipment[slot] = item;
      if (old) this.addItem(old);
      this.recalculateStats();
      if (game) game.save();
      return true;
    }

    usePotion(index, game) {
      const item = this.inventory[index];
      if (!item || item.slot !== 'consumable') return false;
      if (item.teleportTo === 'village') {
        if (game.zoneId === 'village') {
          game.addFloater(this.x, this.y - 40, 'Already in the village', '#9aa6bd', 10);
          return false;
        }
        if ((item.quantity || 1) > 1) item.quantity--;
        else this.inventory.splice(index, 1);
        game.teleportToVillage();
        return true;
      }
      if (this.hp >= this.maxHp) {
        game.addFloater(this.x, this.y - 40, 'HP is full', '#9aa6bd', 10);
        return false;
      }
      const healed = this.heal(item.heal || 50);
      if ((item.quantity || 1) > 1) item.quantity--;
      else this.inventory.splice(index, 1);
      game.addFloater(this.x, this.y - 42, `+${healed}`, '#7bff9b', 14);
      game.audio.sfx('pickup');
      game.save();
      return true;
    }

    draw(ctx, game) {
      shadow(ctx, this.x, this.y, 16, 6);
      if (this.shieldTime > 0) {
        ctx.strokeStyle = `rgba(143,208,255,${0.35 + Math.sin(game.time * 8) * 0.12})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.x, this.y - 16, 24, 0, TAU);
        ctx.stroke();
      }
      drawSkillAura(ctx, this, game);
      const attacking = this.attackAnim > 0;
      const frame = attacking
        ? clamp(Math.floor((1 - this.attackAnim / 0.35) * 4), 0, 3)
        : this.walkFrame;
      const blink = this.invuln > 0 && Math.floor(game.time * 18) % 2 === 0;
      const visibleEquipment = {
        weapon: this.equipment.weapon && itemCanEquip(this.equipment.weapon, this.classId) ? this.equipment.weapon : null,
        armor: this.equipment.armor && itemCanEquip(this.equipment.armor, this.classId) ? this.equipment.armor : null
      };
      const running = this.dashTime > 0 || this.finalStats.speed >= 130;
      drawPlayerFrame(ctx, playerSprite(this.classId, frame, attacking, visibleEquipment, {
        spec: this.spec, casting: this.skillAnim > 0, running
      }), this.x, this.y, frame, running, blink ? 0.45 : 1);
      drawNameTag(ctx, this.name, `Lv ${this.level} ${CLASS_DATA[this.classId].name}`, this.x, this.y - 58, CLASS_DATA[this.classId].color);
      if (this.emote) drawEmote(ctx, this.x, this.y - (this.skillAnim > 0 ? 108 : 96), this.emote.text);
    }
  }

  function drawNameTag(ctx, name, sub, x, y, color) {
    ctx.save();
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(6,10,19,0.78)';
    const w = Math.max(ctx.measureText(name).width, ctx.measureText(sub).width) + 10;
    ctx.fillRect(x - w / 2, y - 24, w, 25);
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.62;
    ctx.strokeRect(x - w / 2 + 0.5, y - 23.5, w - 1, 24);
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.fillRect(x - w / 2 + 2, y - 23, w - 4, 1);
    ctx.fillStyle = color;
    ctx.fillText(name, x, y - 12);
    ctx.font = '9px monospace';
    ctx.fillStyle = '#c8d1e0';
    ctx.fillText(sub, x, y - 2);
    ctx.restore();
  }

  // A rotating rune, orbiting sparks and cast bar make every skill visibly cast.
  function drawSkillAura(ctx, actor, game) {
    if (!(actor.skillAnim > 0)) return;
    const duration = actor.skillAnimDuration || 0.55;
    const t = clamp(actor.skillAnim / duration, 0, 1);
    const color = actor.skillAnimColor || '#fff';
    const pulse = 1 + Math.sin(game.time * 18) * 0.08;
    const turn = game.time * 4.5;
    ctx.save();
    ctx.globalAlpha = t * 0.88;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(actor.x, actor.y - 3, (17 + (1 - t) * 18) * pulse, 6 + (1 - t) * 5, 0, 0, TAU);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.ellipse(actor.x, actor.y - 3, 26 + (1 - t) * 12, 9 + (1 - t) * 4, 0, turn, turn + Math.PI * 1.55);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(actor.x, actor.y - 14, (18 + (1 - t) * 24) * pulse, 0, TAU);
    ctx.stroke();
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const a = turn + i / 8 * TAU;
      const r = 25 + (1 - t) * 16;
      ctx.fillStyle = color;
      ctx.fillRect(actor.x + Math.cos(a) * r - 2.5, actor.y - 14 + Math.sin(a) * r - 2.5, 5, 5);
      if (i % 2 === 0) {
        ctx.beginPath();
        ctx.moveTo(actor.x + Math.cos(a) * (r - 5), actor.y - 14 + Math.sin(a) * (r - 5));
        ctx.lineTo(actor.x + Math.cos(a) * (r + 4), actor.y - 14 + Math.sin(a) * (r + 4));
        ctx.stroke();
      }
    }

    // Cast name and progress sit just above the name tag without covering it.
    if (actor.skillAnimName) {
      const bx = actor.x - 38;
      const by = actor.y - 88;
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(5,8,16,0.82)';
      ctx.fillRect(bx, by, 76, 16);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, by + 0.5, 75, 15);
      ctx.fillStyle = '#0b1020';
      ctx.fillRect(bx + 5, by + 12, 66, 3);
      ctx.fillStyle = color;
      ctx.fillRect(bx + 6, by + 13, Math.max(1, Math.round(64 * (1 - t))), 1);
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f4f8ff';
      ctx.fillText(actor.skillAnimName, actor.x, by + 10);
      ctx.textAlign = 'left';
    }
    ctx.restore();
  }

  function drawEmote(ctx, x, y, text) {
    ctx.save();
    ctx.font = 'bold 12px monospace';
    const w = ctx.measureText(text).width + 16;
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - w / 2, y - 18, w, 20);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(x - 5, y + 2);
    ctx.lineTo(x + 2, y + 2);
    ctx.lineTo(x - 2, y + 8);
    ctx.fill();
    ctx.fillStyle = '#22283a';
    ctx.textAlign = 'center';
    ctx.fillText(text, x, y - 4);
    ctx.restore();
  }

  // STAGE 1 + 3: slimes, goblins and a phased boss.
  class Enemy {
    constructor(type, x, y, zoneMul = 1) {
      this.id = nextEnemyId++;
      this.type = type;
      this.x = x;
      this.y = y;
      this.zoneMul = zoneMul;
      const base = type === 'slime'
        ? { hp: 46, damage: 8, speed: 44, range: 20, xp: 12, gold: 6, radius: 13, aggro: 240 }
        : type === 'goblin'
          ? { hp: 78, damage: 13, speed: 58, range: 24, xp: 22, gold: 11, radius: 13, aggro: 290 }
          : type === 'brute'
            ? { hp: 180, damage: 24, speed: 34, range: 30, xp: 34, gold: 18, radius: 16, aggro: 320 }
            : type === 'scout'
              ? { hp: 62, damage: 10, speed: 56, range: 190, xp: 26, gold: 14, radius: 12, aggro: 340 }
              : { hp: 920, damage: 26, speed: 50, range: 34, xp: 400, gold: 320, radius: 20, aggro: 760 };
      this.maxHp = Math.round(base.hp * (type === 'boss' ? 1 : zoneMul));
      this.hp = this.maxHp;
      this.damage = base.damage * (type === 'boss' ? 1 : zoneMul);
      this.speed = base.speed * (type === 'boss' ? 1 : Math.min(1.5, zoneMul));
      this.range = base.range;
      this.xpReward = Math.round(base.xp * zoneMul);
      this.goldReward = Math.round(base.gold * zoneMul);
      this.radius = base.radius;
      this.aggroRange = base.aggro;
      this.alive = true;
      this.deathTimer = 0;
      this.attackCd = rand(0, 0.8);
      this.abilityTimer = 4;
      this.phase = 1;
      this.slamWindup = 0;
      this.slamX = null;
      this.slamY = null;
      this.flash = 0;
      this.slowTimer = 0;
      this.slowFactor = 1;
      this.poisonTimer = 0;
      this.poisonTick = 0.5;
      this.poisonDps = 0;
      this.poisonSource = null;
      this.target = null;
      this.retarget = 0;
      this.walkFrame = 0;
      this.walkTimer = 0;
      this.aggro = false;
      // Cached path direction is only needed near the outer cave/dungeon wall now.
      this.pathTimer = 0;
      this.pathAngle = 0;
    }

    update(dt, game) {
      if (!this.alive) {
        this.deathTimer -= dt;
        return;
      }
      this.attackCd = Math.max(0, this.attackCd - dt);
      this.flash = Math.max(0, this.flash - dt);
      this.retarget -= dt;

      // Damage-over-time from poison arrows.
      if (this.poisonTimer > 0) {
        this.poisonTimer -= dt;
        this.poisonTick -= dt;
        if (this.poisonTick <= 0) {
          this.poisonTick = 0.5;
          game.damageEnemy(this, this.poisonDps * 0.5, this.poisonSource, false, 'poison', { noStatus: true });
        }
      }

      // Choose the nearest hero (real or simulated) to chase.
      if (!this.target || !this.target.alive || this.retarget <= 0 || dist(this, this.target) > this.aggroRange * 1.6) {
        this.retarget = 0.5;
        let best = null;
        let bestD = this.aggroRange;
        for (const t of game.combatTargets()) {
          if (!t.alive) continue;
          const d = dist(this, t);
          if (d < bestD) { best = t; bestD = d; }
        }
        this.target = best;
      }
      if (!this.target) {
        this.aggro = false;
        if (this.type === 'boss' && this.slamWindup > 0) this.updateBoss(dt, game, 0);
        return;
      }
      this.aggro = true;
      const d = dist(this, this.target);
      const angle = angleTo(this, this.target);
      const retreating = this.type === 'scout' && d < this.range * 0.62;
      if (d > this.range + this.target.radius - 4 || retreating) {
        // If something is in the way, follow a tile path around it instead of pushing into it.
        let moveAngle = angle;
        if (!game.lineClear(this, this.target)) {
          this.pathTimer -= dt;
          if (this.pathTimer <= 0) {
            this.pathTimer = 0.35;
            this.pathAngle = game.pathDirection(this, this.target);
          }
          moveAngle = this.pathAngle;
        } else {
          this.pathTimer = 0;
        }
        const slow = this.slowTimer > 0 ? this.slowFactor : 1;
        if (this.slowTimer > 0) this.slowTimer -= dt;
        const moveSign = retreating ? -1 : 1;
        game.tryMove(this, Math.cos(moveAngle) * this.speed * slow * dt * moveSign, Math.sin(moveAngle) * this.speed * slow * dt * moveSign);
        this.walkTimer += dt;
        this.walkFrame = Math.floor(this.walkTimer * 6) % 4;
      }
      if (this.type === 'scout' && d <= this.range && this.attackCd <= 0) {
        this.attackCd = 1.65;
        game.spawnProjectile({
          x: this.x + Math.cos(angle) * 12, y: this.y + Math.sin(angle) * 12,
          vx: Math.cos(angle) * 225, vy: Math.sin(angle) * 225,
          damage: this.damage, team: 'enemy', owner: this, kind: 'scoutBolt', radius: 5, life: 2.4
        });
      } else if (this.type !== 'scout' && d < this.range + this.target.radius + 4 && this.attackCd <= 0) {
        this.attackCd = this.type === 'boss' ? 1.1 : 0.9;
        game.damageTarget(this.target, this.damage, this, this.type);
        game.effects.push(new Effect('slash', this.x, this.y - 12, {
          color: '#ffb0a0', element: 'fire', angle: angle, radius: 18, life: 0.18
        }));
      }
      if (this.type === 'boss') this.updateBoss(dt, game, angle);
    }

    updateBoss(dt, game, angle) {
      if (this.slamWindup > 0) {
        this.slamWindup = Math.max(0, this.slamWindup - dt);
        if (this.slamWindup === 0) {
          for (const hero of game.combatTargets()) {
            if (dist(hero, { x: this.slamX, y: this.slamY }) <= 88) game.damageTarget(hero, 24, this, 'slam');
          }
          game.effects.push(new Effect('ring', this.slamX, this.slamY, { color: '#ff6b4a', radius: 10, endRadius: 88, life: 0.35 }));
          game.shake = Math.max(game.shake, 9);
          this.slamX = null;
          this.slamY = null;
          this.abilityTimer = 2.2;
        }
        return;
      }
      const ratio = this.hp / this.maxHp;
      const newPhase = ratio < 0.28 ? 3 : ratio < 0.6 ? 2 : 1;
      if (newPhase !== this.phase) {
        this.phase = newPhase;
        this.abilityTimer = 1.2;
        this.slamWindup = 0;
        game.log(`Boss enters phase ${this.phase}!`, '#ff8c42');
        game.audio.sfx('boss');
        game.shake = Math.max(game.shake, 8);
        game.effects.push(new Effect('ring', this.x, this.y - 16, { color: '#ff6b4a', radius: 20, endRadius: 140, life: 0.6 }));
      }
      this.abilityTimer -= dt;
      if (this.abilityTimer > 0) return;
      if (this.phase >= 2) {
        const count = this.phase >= 3 ? 7 : 5;
        for (let i = 0; i < count; i++) {
          const a = angle + (i - (count - 1) / 2) * 0.22;
          game.spawnProjectile({
            x: this.x + Math.cos(a) * 20, y: this.y - 10 + Math.sin(a) * 20,
            vx: Math.cos(a) * 230, vy: Math.sin(a) * 230,
            damage: 12, team: 'enemy', owner: this, kind: 'bossOrb', radius: 7, life: 3
          });
        }
        this.abilityTimer = this.phase >= 3 ? 2.6 : 3.4;
      }
      if (this.phase >= 3 && this.target && dist(this, this.target) < 150) {
        this.slamX = this.target.x;
        this.slamY = this.target.y;
        this.slamWindup = 0.75;
        game.log('The boss is charging a slam! Move out of the glowing circle!', '#ff8c42');
        this.abilityTimer = Math.min(this.abilityTimer, 2.2);
      }
    }

    draw(ctx, game) {
      if (!this.alive && this.deathTimer <= 0) return;
      const alpha = this.alive ? 1 : clamp(this.deathTimer / 0.5, 0, 1);
      shadow(ctx, this.x, this.y, this.radius + 2, 6, 0.25 * alpha);
      drawBossWarning(ctx, this.slamX, this.slamY, this.slamWindup, game.time);
      let sprite;
      if (this.type === 'slime') sprite = slimeSprite(this.walkFrame);
      else if (['goblin', 'scout', 'brute'].includes(this.type)) sprite = goblinSprite(this.walkFrame);
      else sprite = bossSprite(Math.floor(game.time * 4) % 4);
      const scale = this.type === 'boss' ? 5 : MONSTER_SPRITE_SCALE;
      const tint = this.type === 'scout' ? 'hue-rotate(145deg) saturate(1.5)' : this.type === 'brute' ? 'hue-rotate(235deg) saturate(1.5)' : '';
      if (this.flash > 0) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.filter = `${tint} brightness(3)`;
        drawSprite(ctx, sprite, this.x, this.y, scale, 1);
        ctx.restore();
      } else {
        if (tint) { ctx.save(); ctx.filter = tint; }
        drawSprite(ctx, sprite, this.x, this.y, scale, alpha);
        if (tint) ctx.restore();
      }
      if (this.poisonTimer > 0) {
        ctx.fillStyle = '#7be06a';
        ctx.fillRect(this.x - 10, this.y - 70, 8, 8);
      }
      if (this.slowTimer > 0) {
        ctx.fillStyle = '#9ce7ff';
        ctx.fillRect(this.x, this.y - 70, 8, 8);
      }
      if (this.alive && this.hp < this.maxHp && this.type !== 'boss') {
        drawBar(ctx, this.x - 24, this.y - 69, 48, 4, this.hp / this.maxHp, '#ff6b6b');
      }
    }
  }

  class Npc {
    constructor(type, name, x, y) {
      this.type = type;
      this.name = name;
      this.x = x;
      this.y = y;
      this.radius = 14;
    }
    draw(ctx, game) {
      shadow(ctx, this.x, this.y, 16, 6);
      drawSprite(ctx, npcSprite(this.type, Math.floor(game.time * 2) % 4), this.x, this.y, ROLE_SPRITE_SCALE);
      ctx.save();
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 3;
      ctx.fillText(this.name, this.x, this.y - 54);
      ctx.shadowBlur = 0;
      if (this.type === 'quest') {
        const showBang = !game.quest.claimed && (!game.quest.active || game.quest.complete);
        if (showBang) {
          ctx.fillStyle = '#ffd75e';
          ctx.font = 'bold 20px monospace';
          ctx.fillText('!', this.x, this.y - 68 + Math.sin(game.time * 4) * 2);
        }
      } else if (this.type === 'guard') {
        ctx.fillStyle = '#9ce7ff';
        ctx.font = 'bold 9px monospace';
        ctx.fillText('◆', this.x, this.y - 67);
      }
      ctx.restore();
    }
  }

  // STAGE 4: fake players that wander, fight monsters and can join your party.
  class OtherPlayer {
    constructor(name, classId, level) {
      this.name = name;
      this.classId = classId;
      this.level = level;
      this.x = 0;
      this.y = 0;
      this.radius = 12;
      this.alive = true;
      this.maxHp = 70 + level * 8;
      this.hp = this.maxHp;
      this.party = false;
      this.followIndex = 0;
      this.wander = { x: 0, y: 0 };
      this.retarget = 0;
      this.attackCd = 0;
      this.emote = null;
      this.levelTimer = rand(20, 60);
      this.respawn = 0;
      this.walkFrame = 0;
      this.walkTimer = 0;
      this.aim = 0;
    }
    update(dt, game) {
      if (!this.alive) {
        this.respawn -= dt;
        if (this.respawn <= 0) {
          this.alive = true;
          this.hp = this.maxHp;
          const spawn = ZONE_SPAWN[game.zoneId];
          this.x = spawn.x + rand(-80, 80);
          this.y = spawn.y + rand(-80, 80);
        }
        return;
      }
      this.attackCd = Math.max(0, this.attackCd - dt);
      this.retarget -= dt;
      this.levelTimer -= dt;
      if (this.levelTimer <= 0) {
        this.level++;
        this.maxHp += 8;
        this.hp = this.maxHp;
        this.levelTimer = rand(25, 70);
      }
      if (this.emote) {
        this.emote.time -= dt;
        if (this.emote.time <= 0) this.emote = null;
      }

      // Party members follow the real player with a small offset.
      let tx;
      let ty;
      let chasing = null;
      let closest = 210;
      for (const e of game.enemies) {
        if (!e.alive) continue;
        const d = dist(this, e);
        if (d < closest) { closest = d; chasing = e; }
      }
      if (this.party && game.player && !chasing) {
        const a = this.followIndex * 1.7;
        tx = game.player.x + Math.cos(a) * 48;
        ty = game.player.y + Math.sin(a) * 48;
      } else if (chasing) {
        tx = chasing.x;
        ty = chasing.y;
      } else {
        if (this.retarget <= 0 || dist(this, this.wander) < 20) {
          this.retarget = rand(2, 6);
          this.wander = {
            x: clamp(this.x + rand(-260, 260), 40, game.zone.pixelW - 40),
            y: clamp(this.y + rand(-220, 220), 40, game.zone.pixelH - 40)
          };
          if (Math.random() < 0.08) this.emote = { text: pick(EMOTES), time: 2 };
        }
        tx = this.wander.x;
        ty = this.wander.y;
      }
      const a = Math.atan2(ty - this.y, tx - this.x);
      this.aim = a;
      if (dist(this, { x: tx, y: ty }) > 26) {
        game.tryMove(this, Math.cos(a) * 85 * dt, Math.sin(a) * 85 * dt);
        this.walkTimer += dt;
        this.walkFrame = Math.floor(this.walkTimer * 7) % PLAYER_WALK_POSES.length;
      }
      if (chasing && closest < (this.classId === 'swordsman' ? 52 : 230) && this.attackCd <= 0) {
        this.attackCd = this.classId === 'archer' ? 0.8 : 1.0;
        const dmg = 6 + this.level * 1.1;
        if (this.classId === 'swordsman') {
          game.damageEnemy(chasing, dmg, this, false, 'ai slash');
        } else {
          game.spawnProjectile({
            x: this.x + Math.cos(a) * 12, y: this.y - 8 + Math.sin(a) * 12,
            vx: Math.cos(a) * 420, vy: Math.sin(a) * 420,
            damage: dmg, owner: this, kind: this.classId === 'mage' ? 'fireball' : 'arrow',
            aoe: this.classId === 'mage' ? 40 : 0, radius: 5, life: 2
          });
        }
      }
    }
    takeDamage(amount, game) {
      if (!this.alive) return;
      this.hp -= amount;
      game.addFloater(this.x, this.y - 40, `-${Math.round(amount)}`, '#ffb0a0', 11);
      if (this.hp <= 0) {
        this.alive = false;
        this.respawn = rand(8, 14);
        game.log(`${this.name} was defeated and will respawn.`, '#9aa6bd');
      }
    }
    draw(ctx, game) {
      if (!this.alive) return;
      shadow(ctx, this.x, this.y, 16, 6);
      drawPlayerFrame(ctx, playerSprite(this.classId, this.walkFrame, false, {}), this.x, this.y, this.walkFrame, false);
      drawNameTag(ctx, this.name, `Lv ${this.level} ${CLASS_DATA[this.classId].name}${this.party ? ' *' : ''}`, this.x, this.y - 58, this.party ? '#ffd75e' : '#a9c7ff');
      drawBar(ctx, this.x - 19, this.y - 53, 38, 3, this.hp / this.maxHp, '#6ee787');
      if (this.emote) drawEmote(ctx, this.x, this.y - 96, this.emote.text);
    }
  }

  // STAGE 4: a little companion that follows you and vacuums up loot.
  class Pet {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.name = 'Pixel Fox';
      this.radius = 8;
      this.life = 0;
    }
    update(dt, game) {
      this.life += dt;
      if (!game.player) return;
      const d = dist(this, game.player);
      if (d > 350) {
        this.x = game.player.x + 24;
        this.y = game.player.y + 18;
      } else if (d > 34) {
        const a = angleTo(this, game.player);
        const speed = clamp(d * 2.4, 70, 260);
        game.tryMove(this, Math.cos(a) * speed * dt, Math.sin(a) * speed * dt);
      }
    }
    draw(ctx, game) {
      shadow(ctx, this.x, this.y, 8, 3, 0.2);
      drawSprite(ctx, petSprite(Math.floor(this.life * 6) % 4), this.x, this.y, 1.5);
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#d8d0ff';
      ctx.fillText(this.name, this.x, this.y - 22);
    }
  }

  // ============================================================
  // 5. WORLD MAPS + THE GAME CLASS (part A: setup and input)
  // ============================================================

  // STAGE 3: three zones connected by portals.
  const ZONE_SPAWN = {
    forest: { x: 520, y: 420 },
    cave: { x: 270, y: 300 },
    desert: { x: 2780, y: 1980 },
    dungeon: { x: 768, y: 576 },
    village: { x: 1552, y: 1168 }
  };

  const PORTAL_DEFS = {
    forest: [
      { x: 2860, y: 300, to: 'cave', label: 'Cave', color: '#b08bff', arrive: { x: 270, y: 300 } },
      { x: 220, y: 2080, to: 'desert', label: 'Desert', color: '#ffb35c', arrive: { x: 2780, y: 1980 } }
    ],
    cave: [
      { x: 230, y: 240, to: 'forest', label: 'Forest', color: '#7bdc7b', arrive: { x: 2820, y: 360 } },
      { x: 2860, y: 2080, to: 'desert', label: 'Desert', color: '#ffb35c', arrive: { x: 220, y: 2080 } }
    ],
    desert: [
      { x: 2760, y: 1980, to: 'cave', label: 'Cave', color: '#b08bff', arrive: { x: 2820, y: 2080 } },
      { x: 240, y: 260, to: 'forest', label: 'Forest', color: '#7bdc7b', arrive: { x: 270, y: 2080 } }
    ],
    dungeon: [
      { x: 768, y: 120, to: 'forest', label: 'Exit Raid', color: '#7bdc7b', arrive: { x: 520, y: 420 } }
    ],
    village: [
      { x: 1552, y: 656, to: 'forest', label: 'Forest Gate', color: '#7bdc7b', arrive: { x: 520, y: 420 } }
    ]
  };

  const NPC_DEFS = [
    { type: 'shop', name: 'Merchant Mina', x: 620, y: 380 },
    { type: 'quest', name: 'Elder Tarn', x: 770, y: 430 }
  ];
  const VILLAGE_NPC_DEFS = [
    { type: 'guard', name: 'Village Guard', x: 1650, y: 1168 },
    { type: 'healer', name: 'Healer Liora', x: 1424, y: 1168 },
    { type: 'scout', name: 'Scout Rowan', x: 1552, y: 1008 },
    { type: 'blacksmith', name: 'Blacksmith Borin', x: 1760, y: 1168 },
    { type: 'villager', name: 'Farmer Pella', x: 1552, y: 1296 }
  ];

  const BOSS_POS = { x: 1560, y: 1120 };
  const ZONE_ENEMY_COUNTS = {
    forest: { slime: 15, goblin: 6 },
    cave: { slime: 6, goblin: 7, brute: 4 },
    desert: { slime: 8, goblin: 9, scout: 4 },
    dungeon: { goblin: 6 },
    village: {}
  };
  const ZONE_MUL = { forest: 1, cave: 1.7, desert: 2.4, dungeon: 2.6, village: 1 };

  const ZONE_POINTS = {
    forest: [ZONE_SPAWN.forest, ...PORTAL_DEFS.forest.map(p => p.arrive), ...NPC_DEFS],
    cave: [ZONE_SPAWN.cave, ...PORTAL_DEFS.cave.map(p => p.arrive), BOSS_POS],
    desert: [ZONE_SPAWN.desert, ...PORTAL_DEFS.desert.map(p => p.arrive)],
    dungeon: [ZONE_SPAWN.dungeon, ...PORTAL_DEFS.dungeon.map(p => p.arrive)],
    village: [ZONE_SPAWN.village, ...PORTAL_DEFS.village.map(p => p.arrive), ...VILLAGE_NPC_DEFS]
  };

  const VILLAGE_HOUSES = [
    { x: 33, y: 25, roof: '#8f493d', roofLight: '#c87858', wall: '#d8b98a', trim: '#694632', chimney: true },
    { x: 56, y: 25, roof: '#53677b', roofLight: '#8298a7', wall: '#d3c39b', trim: '#55483b', chimney: false },
    { x: 33, y: 43, roof: '#715044', roofLight: '#a66f4d', wall: '#cdb18a', trim: '#604433', chimney: false },
    { x: 56, y: 43, roof: '#586448', roofLight: '#83905c', wall: '#dfc99e', trim: '#5a4935', chimney: true }
  ];

  function paintVillage(zone) {
    const put = (x, y, tile) => {
      if (x >= 0 && y >= 0 && x < zone.w && y < zone.h) zone.tiles[y * zone.w + x] = tile;
    };
    for (let x = 24; x <= 72; x++) { put(x, 35, TILE_ID.PATH); put(x, 36, TILE_ID.PATH); }
    for (let y = 18; y <= 52; y++) { put(47, y, TILE_ID.PATH); put(48, y, TILE_ID.PATH); }
    for (let y = 31; y <= 40; y++) for (let x = 43; x <= 52; x++) {
      if (Math.hypot(x - 47.5, y - 35.5) <= 5) put(x, y, TILE_ID.PATH);
    }
    for (const { x, y } of VILLAGE_HOUSES) {
      for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 7; dx++) put(x + dx, y + dy, TILE_ID.HOUSE_ROOF);
      for (let dy = 4; dy < 8; dy++) for (let dx = 0; dx < 7; dx++) put(x + dx, y + dy, TILE_ID.HOUSE_WALL);
    }
  }

  function drawVillageHouse(ctx, house, time) {
    const x = house.x * TILE;
    const y = house.y * TILE;
    const w = 7 * TILE;
    const h = 8 * TILE;
    const center = x + w / 2;
    const eaveY = y + 104;
    const wallBottom = y + h - 9;
    const gable = [[x + 14, eaveY], [center, y + 22], [x + w - 14, eaveY]];

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    ctx.fillStyle = 'rgba(17, 26, 29, 0.42)';
    ctx.beginPath();
    ctx.ellipse(center, wallBottom + 6, w * 0.56, 12, 0, 0, TAU);
    ctx.fill();

    if (house.chimney) {
      ctx.fillStyle = '#633f38';
      ctx.fillRect(x + w - 66, y + 18, 30, 82);
      ctx.fillStyle = '#a86d55';
      ctx.fillRect(x + w - 62, y + 23, 21, 67);
      ctx.fillStyle = '#d09a70';
      ctx.fillRect(x + w - 70, y + 16, 38, 9);
      ctx.fillStyle = '#885747';
      ctx.fillRect(x + w - 60, y + 42, 17, 3);
      ctx.fillRect(x + w - 60, y + 63, 17, 3);
    }

    ctx.fillStyle = '#44362f';
    ctx.beginPath();
    ctx.moveTo(x + 5, eaveY + 7);
    ctx.lineTo(center, y + 8);
    ctx.lineTo(x + w - 5, eaveY + 7);
    ctx.lineTo(x + w - 13, eaveY + 17);
    ctx.lineTo(x + 13, eaveY + 17);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x + 10, eaveY + 5);
    ctx.lineTo(center, y + 14);
    ctx.lineTo(x + w - 10, eaveY + 5);
    ctx.lineTo(x + w - 18, eaveY + 13);
    ctx.lineTo(x + 18, eaveY + 13);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = house.roof;
    ctx.fillRect(x, y, w, 126);
    for (let row = 0; row < 7; row++) {
      const rowY = y + 27 + row * 13;
      ctx.strokeStyle = row % 2 ? 'rgba(255, 215, 164, 0.28)' : 'rgba(38, 31, 34, 0.32)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 8, rowY);
      ctx.lineTo(x + w - 8, rowY);
      ctx.stroke();
      ctx.fillStyle = house.roofLight;
      for (let col = row % 2 ? 0 : 1; col < 8; col += 2) {
        ctx.fillRect(x + 12 + col * 14, rowY - 5, 9, 3);
      }
    }
    ctx.fillStyle = 'rgba(255, 224, 175, 0.24)';
    ctx.beginPath();
    ctx.moveTo(x + 28, eaveY);
    ctx.lineTo(center, y + 20);
    ctx.lineTo(center + 7, y + 25);
    ctx.lineTo(x + 48, eaveY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#40372e';
    ctx.beginPath();
    ctx.moveTo(x + 19, eaveY - 1);
    ctx.lineTo(center, y + 32);
    ctx.lineTo(x + w - 19, eaveY - 1);
    ctx.lineTo(x + w - 19, wallBottom);
    ctx.lineTo(x + 19, wallBottom);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = house.wall;
    ctx.beginPath();
    ctx.moveTo(x + 24, eaveY + 2);
    ctx.lineTo(center, y + 40);
    ctx.lineTo(x + w - 24, eaveY + 2);
    ctx.lineTo(x + w - 24, wallBottom - 5);
    ctx.lineTo(x + 24, wallBottom - 5);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = house.trim;
    ctx.fillRect(x + 22, eaveY - 4, w - 44, 9);
    ctx.fillStyle = '#c99a63';
    ctx.fillRect(x + 25, eaveY - 4, w - 50, 3);
    ctx.fillStyle = house.trim;
    ctx.fillRect(x + 31, eaveY + 2, 8, wallBottom - eaveY - 5);
    ctx.fillRect(x + w - 39, eaveY + 2, 8, wallBottom - eaveY - 5);
    ctx.fillRect(center - 4, y + 56, 8, 41);
    ctx.fillRect(center - 2, y + 43, 4, 12);
    ctx.fillStyle = '#d9b477';
    ctx.fillRect(x + 34, wallBottom - 11, w - 68, 5);

    for (const wx of [x + 43, x + w - 79]) {
      const wy = y + 137;
      ctx.fillStyle = '#523b31';
      ctx.fillRect(wx - 4, wy - 4, 44, 47);
      ctx.fillStyle = '#8b5b3e';
      ctx.fillRect(wx, wy, 36, 39);
      ctx.fillStyle = '#f6c978';
      ctx.globalAlpha = 0.78 + Math.sin(time * 1.7 + house.x + wx) * 0.08;
      ctx.fillRect(wx + 4, wy + 4, 28, 29);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#b7e5df';
      ctx.fillRect(wx + 5, wy + 5, 11, 12);
      ctx.fillRect(wx + 20, wy + 5, 11, 12);
      ctx.fillStyle = '#744a34';
      ctx.fillRect(wx + 17, wy + 2, 3, 35);
      ctx.fillRect(wx + 3, wy + 18, 31, 3);
      ctx.fillStyle = '#805638';
      ctx.fillRect(wx - 7, wy - 5, 4, 48);
      ctx.fillRect(wx + 39, wy - 5, 4, 48);
      ctx.fillRect(wx - 8, wy - 7, 46, 5);
      ctx.fillRect(wx - 8, wy + 41, 46, 4);
      ctx.fillStyle = '#c59a62';
      ctx.fillRect(wx - 7, wy - 6, 42, 2);
    }

    const doorX = center - 23;
    const doorY = wallBottom - 91;
    ctx.fillStyle = '#49372f';
    ctx.fillRect(doorX - 6, doorY - 7, 58, 98);
    ctx.fillStyle = '#9b663e';
    ctx.fillRect(doorX, doorY, 46, 91);
    ctx.fillStyle = '#bd8750';
    ctx.fillRect(doorX + 4, doorY + 4, 38, 4);
    ctx.fillStyle = '#75492f';
    ctx.fillRect(doorX + 7, doorY + 17, 32, 29);
    ctx.fillRect(doorX + 7, doorY + 53, 32, 30);
    ctx.fillStyle = '#c99557';
    ctx.fillRect(doorX + 10, doorY + 20, 26, 22);
    ctx.fillRect(doorX + 10, doorY + 56, 26, 23);
    ctx.fillStyle = '#f3cf82';
    ctx.beginPath();
    ctx.arc(doorX + 36, doorY + 49, 3, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#634332';
    ctx.fillRect(doorX - 9, wallBottom - 4, 64, 8);
    ctx.fillStyle = '#c9ae80';
    for (let i = 0; i < 7; i++) {
      ctx.fillRect(x + 17 + i * 28, wallBottom - 1, 23, 8);
      ctx.fillStyle = '#806e59';
      ctx.fillRect(x + 17 + i * 28, wallBottom + 5, 23, 2);
      ctx.fillStyle = '#c9ae80';
    }

    const lampX = doorX + 55;
    ctx.strokeStyle = '#584034';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(lampX, doorY + 5);
    ctx.lineTo(lampX, doorY + 17);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 190, 85, 0.18)';
    ctx.beginPath();
    ctx.arc(lampX, doorY + 25, 14, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#493a31';
    ctx.fillRect(lampX - 7, doorY + 17, 14, 17);
    ctx.fillStyle = '#ffdb83';
    ctx.fillRect(lampX - 4, doorY + 20, 8, 10);
    ctx.fillStyle = '#f6b85f';
    ctx.fillRect(lampX - 9, doorY + 15, 18, 3);
    ctx.fillRect(lampX - 8, doorY + 33, 16, 3);

    const ventY = y + 65;
    ctx.fillStyle = '#594438';
    ctx.beginPath();
    ctx.arc(center, ventY, 9, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#d8b57d';
    ctx.beginPath();
    ctx.arc(center, ventY, 6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#493c32';
    ctx.fillRect(center - 1, ventY - 4, 2, 8);
    ctx.fillRect(center - 4, ventY - 1, 8, 2);

    ctx.restore();
  }

  function createZone(id) {
    const isArena = id === 'dungeon';
    const w = isArena ? 48 : 96;
    const h = isArena ? 36 : 72;
    const tiles = new Uint8Array(w * h);
    const base = id === 'cave' || isArena ? TILE_ID.CAVE
      : id === 'forest' || id === 'village' ? TILE_ID.GRASS : TILE_ID.SAND;

    // Start with open terrain and a cave/dungeon border. Decorative patches follow.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const border = (isArena || id === 'cave') &&
          (x < 2 || y < 2 || x >= w - 2 || y >= h - 2);
        tiles[y * w + x] = border ? TILE_ID.ROCK : base;
      }
    }
    // Add small, deterministic obstacle patches and clear rings around landmarks.
    if (id === 'forest' || id === 'desert') {
      const rng = mulberry32(id === 'forest' ? 4101 : 4103);
      const safePoints = [ZONE_SPAWN[id], ...PORTAL_DEFS[id].flatMap(p => [p, p.arrive]),
        ...(id === 'forest' ? NPC_DEFS : [])];
      for (let y = 5; y < h - 5; y++) {
        for (let x = 5; x < w - 5; x++) {
          if (rng() > 0.018) continue;
          const px = x * TILE + TILE / 2;
          const py = y * TILE + TILE / 2;
          if (safePoints.some(p => Math.hypot(p.x - px, p.y - py) < 230)) continue;
          const radius = rng() < 0.28 ? 2 : 1;
          for (let oy = -radius; oy <= radius; oy++) {
            for (let ox = -radius; ox <= radius; ox++) {
              if (Math.abs(ox) + Math.abs(oy) > radius + 1) continue;
              const tx = x + ox;
              const ty = y + oy;
              if (tx < 2 || ty < 2 || tx >= w - 2 || ty >= h - 2) continue;
              tiles[ty * w + tx] = id === 'forest'
                ? (rng() < 0.72 ? TILE_ID.TREE : TILE_ID.WATER)
                : TILE_ID.CACTUS;
            }
          }
        }
      }
    }
    if (id === 'village') paintVillage({ w, h, tiles });
    return {
      id, w, h, tiles, pixelW: w * TILE, pixelH: h * TILE,
      name: isArena ? 'Raid Arena' : id === 'village' ? 'Hearthvale Village' : id[0].toUpperCase() + id.slice(1)
    };
  }

  function nearSpecial(zoneId, x, y, minDist) {
    for (const p of ZONE_POINTS[zoneId]) {
      if (Math.hypot(p.x - x, p.y - y) < minDist) return true;
    }
    for (const p of PORTAL_DEFS[zoneId]) {
      if (Math.hypot(p.x - x, p.y - y) < minDist) return true;
      if (Math.hypot(p.arrive.x - x, p.arrive.y - y) < minDist) return true;
    }
    return false;
  }

  function randomFreePoint(zone, zoneId) {
    for (let i = 0; i < 200; i++) {
      const x = rand(80, zone.pixelW - 80);
      const y = rand(80, zone.pixelH - 80);
      const tx = Math.floor(x / TILE);
      const ty = Math.floor(y / TILE);
      if (BLOCKED_TILES.has(zone.tiles[ty * zone.w + tx])) continue;
      if (nearSpecial(zoneId, x, y, 190)) continue;
      return { x, y };
    }
    return { x: ZONE_SPAWN[zoneId].x + rand(-200, 200), y: ZONE_SPAWN[zoneId].y + rand(-200, 200) };
  }

  // Spawns monsters in the visible ring around a point instead of anywhere on the map.
  function randomNearPoint(zone, zoneId, cx, cy, minDist = 220, maxDist = 480) {
    for (let i = 0; i < 120; i++) {
      const a = rand(0, TAU);
      const d = rand(minDist, maxDist);
      const x = clamp(cx + Math.cos(a) * d, 40, zone.pixelW - 40);
      const y = clamp(cy + Math.sin(a) * d, 40, zone.pixelH - 40);
      const tx = Math.floor(x / TILE);
      const ty = Math.floor(y / TILE);
      if (tx < 0 || ty < 0 || tx >= zone.w || ty >= zone.h) continue;
      if (BLOCKED_TILES.has(zone.tiles[ty * zone.w + tx])) continue;
      if (nearSpecial(zoneId, x, y, 110)) continue;
      return { x, y };
    }
    return randomFreePoint(zone, zoneId);
  }

  const QUEST_CHAPTERS = [
    {
      title: 'The Waking Forest',
      story: 'The broken seal has poisoned the forest paths. Slimes swarm the old wardstones, while glowing herbs may hold the village wards together.',
      objective: 'Defeat 10 slimes and gather 5 herbs in the forest.',
      rewards: '100 gold + 180 XP; unlocks Echoes Below.'
    },
    {
      title: 'Echoes Below',
      story: 'The herbs reveal a map beneath Mount Veyr. Goblins are digging toward a buried gate and stealing the ore needed to repair its wardstone.',
      objective: 'Defeat 8 goblins and gather 4 ore in the cave.',
      rewards: '140 gold + 260 XP; unlocks Shards of the Dunes.'
    },
    {
      title: 'Shards of the Dunes',
      story: 'The repaired ward answers with a vision: desert scouts carry the seal’s missing essence toward the mountain. Their trail points to the source of the cold light.',
      objective: 'Defeat 8 scouts and gather 3 essence in the desert.',
      rewards: '220 gold + 420 XP + an epic wardstone relic.'
    }
  ];

  function questChapter(stage) {
    return QUEST_CHAPTERS[clamp(Math.floor(Number(stage) || 1), 1, QUEST_CHAPTERS.length) - 1];
  }

  function freshQuest() {
    return { stage: 1, active: false, kills: 0, herbs: 0, goblins: 0, ore: 0, scouts: 0, essence: 0, complete: false, claimed: false };
  }

  function normalizeQuestProgress(savedQuest) {
    const quest = Object.assign(freshQuest(), savedQuest || {});
    if (!Object.hasOwn(savedQuest || {}, 'stage') && quest.claimed) {
      Object.assign(quest, { stage: 2, active: false, kills: 0, herbs: 0, goblins: 0, ore: 0, scouts: 0, essence: 0, complete: false, claimed: false });
    } else if (quest.stage === 2 && quest.claimed) {
      Object.assign(quest, { stage: 3, active: false, scouts: 0, essence: 0, complete: false, claimed: false });
    }
    quest.stage = clamp(Math.floor(Number(quest.stage) || 1), 1, QUEST_CHAPTERS.length);
    quest.scouts = Math.max(0, Number(quest.scouts) || 0);
    quest.essence = Math.max(0, Number(quest.essence) || 0);
    return quest;
  }

  // ============================================================
  // EXPANSION 1: network client + lightweight synced actors
  // ============================================================

  class RemotePlayer {
    constructor(data) {
      this.id = data.id;
      this.moving = false;
      this.walkFrame = 0;
      this.skillAnim = 0;
      this.skillAnimDuration = 0.55;
      this.skillAnimColor = '#fff';
      this.skillAnimName = '';
      this.tx = data.x;
      this.ty = data.y;
      this.update(data);
      this.x = data.x;
      this.y = data.y;
    }
    update(data) {
      this.tx = Number.isFinite(data.x) ? data.x : this.tx;
      this.ty = Number.isFinite(data.y) ? data.y : this.ty;
      this.moving = Math.hypot(this.tx - (this.x || this.tx), this.ty - (this.y || this.ty)) > 1;
      Object.assign(this, data);
      this.radius = 12;
      this.alive = true;
      this.attackAnim = data.attackAnim || 0;
    }
    interpolate(dt) {
      const k = 1 - Math.exp(-dt * 18);
      this.x = lerp(this.x, this.tx, k);
      this.y = lerp(this.y, this.ty, k);
      if (Math.hypot(this.tx - this.x, this.ty - this.y) < 0.6) this.moving = false;
      this.attackAnim = Math.max(0, (this.attackAnim || 0) - dt);
      this.skillAnim = Math.max(0, (this.skillAnim || 0) - dt);
    }
    playSkillAnim(color, name) {
      this.skillAnimDuration = 0.55;
      this.skillAnim = this.skillAnimDuration;
      this.skillAnimColor = color || '#fff';
      this.skillAnimName = name || (SKILLS[this.classId] && SKILLS[this.classId][0] && SKILLS[this.classId][0].name) || 'Skill';
    }
    draw(ctx, game) {
      shadow(ctx, this.x, this.y, 16, 6);
      drawSkillAura(ctx, this, game);
      const running = this.dashTime > 0 || CLASS_DATA[this.classId].speed >= 130;
      const frame = this.attackAnim > 0 ? clamp(Math.floor((1 - this.attackAnim / 0.35) * 4), 0, 3)
        : this.moving ? Math.floor(game.time * (running ? 13 : 9)) % PLAYER_WALK_POSES.length : 0;
      drawPlayerFrame(ctx, playerSprite(this.classId, frame, this.attackAnim > 0, {}, {
        spec: this.spec, casting: this.skillAnim > 0, running
      }), this.x, this.y, frame, running);
      drawNameTag(ctx, this.name, `Lv ${this.level} ${CLASS_DATA[this.classId].name}${this.party ? ' *' : ''}`, this.x, this.y - 58, this.party ? '#ffd75e' : '#b9d9ff');
      drawBar(ctx, this.x - 19, this.y - 53, 38, 3, this.hp / this.maxHp, '#6ee787');
      if (this.emote) drawEmote(ctx, this.x, this.y - (this.skillAnim > 0 ? 108 : 96), this.emote.text);
    }
  }

  class RemoteEnemy {
    constructor(data) {
      this.radius = data.radius || 13;
      this.tx = data.x;
      this.ty = data.y;
      this.update(data);
      this.x = data.x;
      this.y = data.y;
    }
    update(data) {
      this.tx = Number.isFinite(data.x) ? data.x : this.tx;
      this.ty = Number.isFinite(data.y) ? data.y : this.ty;
      Object.assign(this, data);
      this.alive = data.alive !== false;
      this.radius = data.radius || this.radius || 13;
    }
    interpolate(dt) {
      const k = 1 - Math.exp(-dt * 16);
      this.x = lerp(this.x, this.tx, k);
      this.y = lerp(this.y, this.ty, k);
    }
    draw(ctx, game) {
      if (!this.alive) return;
      shadow(ctx, this.x, this.y, this.radius + 2, 6);
      drawBossWarning(ctx, this.slamX, this.slamY, this.slamWindup, game.time);
      const frame = this.type === 'boss' ? Math.floor(game.time * 4) % 4 : Math.floor(game.time * 6) % 4;
      const sprite = this.type.includes('slime') ? slimeSprite(frame)
        : this.type.includes('goblin') || this.type.includes('scout') || this.type.includes('brute') ? goblinSprite(frame) : bossSprite(frame);
      let tint = '';
      if (this.type.includes('frost')) tint = 'hue-rotate(180deg) saturate(1.8) brightness(1.2)';
      else if (this.type.includes('fire') || this.type.includes('magma')) tint = 'hue-rotate(340deg) saturate(2.2) brightness(1.1)';
      else if (this.type.includes('venom') || this.type.includes('swamp') || this.type.includes('bog')) tint = 'hue-rotate(80deg) saturate(2.0)';
      else if (this.type === 'scout') tint = 'hue-rotate(145deg) saturate(1.5)';
      else if (this.type === 'brute') tint = 'hue-rotate(235deg) saturate(1.5)';
      if (this.isElite) tint += (tint ? ' ' : '') + 'drop-shadow(0 0 6px #ffd700)';
      if (tint) { ctx.save(); ctx.filter = tint; }
      drawSprite(ctx, sprite, this.x, this.y, this.type === 'boss' ? 5 : MONSTER_SPRITE_SCALE);
      if (tint) ctx.restore();
      if (this.type !== 'boss' && this.hp < this.maxHp) drawBar(ctx, this.x - 24, this.y - 69, 48, 4, this.hp / this.maxHp, '#ff6b6b');
    }
  }

  class RemoteProjectile {
    constructor(data) {
      Object.assign(this, data);
      this.dead = false;
      this.tx = data.x;
      this.ty = data.y;
      this.x = data.x;
      this.y = data.y;
    }
    update(data) {
      this.tx = Number.isFinite(data.x) ? data.x : this.tx;
      this.ty = Number.isFinite(data.y) ? data.y : this.ty;
      Object.assign(this, data);
    }
    interpolate(dt) {
      const k = 1 - Math.exp(-dt * 24);
      this.x = lerp(this.x, this.tx, k);
      this.y = lerp(this.y, this.ty, k);
    }
    draw(ctx) { Projectile.prototype.draw.call(this, ctx); }
  }

  class RemotePickup {
    constructor(data) {
      Object.assign(this, data);
      this.collected = false;
      this.tx = data.x;
      this.ty = data.y;
      this.x = data.x;
      this.y = data.y;
    }
    update(data) {
      this.tx = Number.isFinite(data.x) ? data.x : this.tx;
      this.ty = Number.isFinite(data.y) ? data.y : this.ty;
      Object.assign(this, data);
    }
    interpolate(dt) {
      const k = 1 - Math.exp(-dt * 18);
      this.x = lerp(this.x, this.tx, k);
      this.y = lerp(this.y, this.ty, k);
      this.age = (this.age || 0) + dt;
    }
    draw(ctx, game) {
      this.age = this.age || 0;
      Pickup.prototype.draw.call(this, ctx, game);
    }
  }

  class NetworkClient {
    constructor(game) {
      this.game = game;
      this.socket = null;
      this.online = false;       // true after login/register
      this.connected = false;    // WebSocket open
      this.connecting = false;
      this.token = '';
      this.playerId = null;
      this.roomId = '';
      this.joined = false;
      this.players = new Map();
      this.enemies = new Map();
      this.projectiles = new Map();
      this.pickups = new Map();
      this.stateQueue = [];
      const params = new URLSearchParams(location.search);
      const wsHost = location.host || `${location.hostname || 'localhost'}:3000`;
      const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
      const defaultUrl = isLocalHost
        ? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${wsHost}/ws`
        : 'wss://myapp-gbm5.onrender.com/ws';
      this.url = params.get('ws') || defaultUrl;
    }
    connect() {
      if (this.socket && (this.connected || this.connecting)) return;
      this.connecting = true;
      try {
        this.socket = new WebSocket(this.url);
      } catch (err) {
        this.connecting = false;
        this.game.log('Could not create WebSocket: ' + err.message, '#ff9b9b');
        return;
      }
      this.socket.addEventListener('open', () => {
        this.connected = true;
        this.connecting = false;
        this.game.log('Connected to game server.', '#8ee6ff');
        this.game.onNetworkConnected();
      });
      this.socket.addEventListener('message', e => {
        try { this.game.onNetworkMessage(JSON.parse(e.data)); }
        catch (err) { console.error('Bad server message', err); }
      });
      this.socket.addEventListener('close', () => {
        this.connected = false;
        this.connecting = false;
        this.online = false;
        this.game.onNetworkDisconnected();
      });
      this.socket.addEventListener('error', () => {
        this.game.log(`Cannot reach game server: ${this.url}`, '#ff9b9b');
      });
    }
    send(obj) {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
      const msg = Object.assign({}, obj);
      if (this.token) msg.token = this.token;
      this.socket.send(JSON.stringify(msg));
      return true;
    }
  }

  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.pixelRatio = clamp(window.devicePixelRatio || 1, 1, 2);
      canvas.width = Math.round(VIEW_W * this.pixelRatio);
      canvas.height = Math.round(VIEW_H * this.pixelRatio);
      this.ctx = canvas.getContext('2d');
      this.ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
      this.ctx.imageSmoothingEnabled = false;

      this.state = 'intro';
      this.paused = false;
      this.panel = null;              // 'inventory' | 'skills' | 'shop' | 'quest' | ...
      this.tutorialStep = 0;
      this.tutorialReturnPaused = false;
      this.selectedClass = 'swordsman';
      this.nameInput = 'Hero';
      this.nameFocused = false;
      this.loginFields = { username: '', password: '', active: 'username' };
      this.loginReturnState = 'select';
      this.network = new NetworkClient(this);
      this.networkData = { auction: [], mail: [], guild: null, shop: [] };
      this.session = this._readSession();
      this._pendingLogin = null;
      this._connectTimer = null;
      this.accountPasswordInput = '';
      this.showAccountPassword = false;
      this.selectedItemUid = null;
      this.actionText = '';
      this.actionGold = '';
      this.actionMessage = '';
      this.textField = null;
      this.chatChannel = 'zone';
      this.inputSendTimer = 0;
      this.time = 0;
      this.playTime = 0;
      this.dayTime = 20;
      this.shake = 0;
      this.camX = 0;
      this.camY = 0;
      this.playerInCombat = 0;
      this.autoSaveTimer = 0;
      this.enemySpawnTimer = 0;
      this.lockedTargetId = null; // Mob lock-on target (works offline and online).
      this.pendingSkillIndex = null;
      this.mobileMenuOpen = false; // Touch-friendly feature drawer.

      this.zones = {
        forest: createZone('forest'),
        cave: createZone('cave'),
        desert: createZone('desert'),
        dungeon: createZone('dungeon'),
        village: createZone('village')
      };
      this.zoneId = 'forest';
      this.zone = this.zones.forest;

      this.player = null;
      this.pet = null;
      this.enemies = [];
      this.pickups = [];
      this.projectiles = [];
      this.effects = [];
      this.floaters = [];
      this.pendingMeteors = [];
      this.npcs = [];
      this.portals = [];
      this.otherPlayers = this.createFakePlayers();
      this.party = [];
      this.quest = freshQuest();
      this.bossDefeated = false;
      this.shopStock = makeShopStock(this.selectedClass);

      this.chatMessages = [];
      this.chatOpen = false;
      this.chatMinimized = false;
      this.chatInput = '';
      this.fakeChatTimer = 7;

      this.settings = { volume: 0.35 };
      this.audio = new AudioEngine();
      this.tutorialDone = this.readTutorialStatus();
      this.saveData = this.readSave();

      this.clickRegions = [];
      this.dropRegions = [];
      this.drag = null;
      this.lastClick = { key: '', time: 0 };
      this.pointerDownUI = false;
      this.pointer = { x: 0, y: 0, down: false, inside: false, type: 'mouse', id: null, lastMove: 0 };
      this.joystick = { active: false, id: null, originX: 100, originY: VIEW_H - 100, x: 0, y: 0 };
      this.nativeTextInput = document.createElement('input');
      this.nativeInputKeepFocus = false;
      this.nativeTextInput.type = 'text';
      this.nativeTextInput.autocomplete = 'off';
      this.nativeTextInput.autocapitalize = 'off';
      this.nativeTextInput.spellcheck = false;
      this.nativeTextInput.setAttribute('aria-label', 'Game text input');
      Object.assign(this.nativeTextInput.style, {
        position: 'fixed', display: 'none', zIndex: '20', boxSizing: 'border-box',
        padding: '0', margin: '0', border: '0', outline: '0', background: 'transparent',
        color: 'transparent', caretColor: 'transparent', WebkitTextFillColor: 'transparent',
        opacity: '0.01', pointerEvents: 'none', fontSize: '16px', lineHeight: '1',
        userSelect: 'text', WebkitUserSelect: 'text'
      });
      document.body.appendChild(this.nativeTextInput);
      if (navigator.virtualKeyboard) navigator.virtualKeyboard.overlaysContent = true;
      this.nativeTextInput.addEventListener('input', () => this.onNativeTextInput());
      this.nativeTextInput.addEventListener('blur', () => {
        if (!this.nativeInputKeepFocus) return;
        // Mobile browsers may blur the hidden keyboard input while resizing the
        // visual viewport. Restore it only while the same text field is active.
        window.setTimeout(() => {
          if (!this.nativeInputKeepFocus || document.visibilityState === 'hidden' ||
              document.activeElement === this.nativeTextInput || !this.nativeTextInputConfig()) return;
          this.syncNativeTextInputOverlay(true);
        }, 120);
      });
      this.input = {
        keys: {},
        joystick: this.joystick,
        mobile: window.matchMedia && window.matchMedia('(pointer: coarse)').matches
      };

      this.darkCanvas = document.createElement('canvas');
      this.darkCanvas.width = Math.round(VIEW_W * this.pixelRatio);
      this.darkCanvas.height = Math.round(VIEW_H * this.pixelRatio);
      this.minimapCache = null;

      this.bindEvents();
      this.log('Welcome to Pixel Realm!', '#8ee6ff');
    }

    createFakePlayers() {
      return Array.from({ length: 7 }, (_, i) => new OtherPlayer(
        FAKE_NAMES[i % FAKE_NAMES.length] + (i > 8 ? '' : randInt(1, 99)),
        ['swordsman', 'archer', 'mage'][i % 3],
        randInt(2, 9)
      ));
    }

    isPortraitMobile() {
      return !!(window.matchMedia && window.matchMedia('(orientation: portrait) and (pointer: coarse)').matches);
    }

    // Fullscreen requires a user gesture; never request it while the phone is portrait.
    goFullscreen() {
      if (!this.input.mobile || this.isPortraitMobile() || document.fullscreenElement) return;
      const el = document.documentElement;
      const request = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
      if (!request) return;
      try {
        const result = request.call(el);
        if (result && typeof result.catch === 'function') result.catch(() => {});
      } catch (err) { /* Fullscreen may be unavailable in this browser. */ }
    }

    nativeTextInputConfig() {
      if (this.state === 'select' && this.nameFocused) {
        return { key: 'name', x: 278, y: 452, w: 220, h: 34, value: this.nameInput, maxLength: 14, type: 'text' };
      }
      if (this.state === 'login') {
        const username = this.loginFields.active === 'username';
        return {
          key: username ? 'username' : 'password',
          x: 344, y: username ? 214 : 276, w: 272, h: 32,
          value: username ? this.loginFields.username : this.loginFields.password,
          maxLength: 24, type: username ? 'text' : 'password'
        };
      }
      return null;
    }

    syncNativeTextInputOverlay(focus = false) {
      const input = this.nativeTextInput;
      const config = this.nativeTextInputConfig();
      if (!input || !config) {
        this.nativeInputKeepFocus = false;
        if (input) {
          input.style.display = 'none';
          if (document.activeElement === input) input.blur();
        }
        return;
      }

      const rect = this.canvas.getBoundingClientRect();
      const sx = rect.width / VIEW_W;
      const sy = rect.height / VIEW_H;
      input.style.display = 'block';
      input.style.left = `${rect.left + (config.x + 6) * sx}px`;
      input.style.top = `${rect.top + 3 * sy + config.y * sy}px`;
      input.style.width = `${Math.max(24, (config.w - 12) * sx)}px`;
      input.style.height = `${Math.max(20, (config.h - 6) * sy)}px`;
      if (input.type !== config.type) input.type = config.type;
      if (input.maxLength !== config.maxLength) input.maxLength = config.maxLength;
      if (input.inputMode !== 'text') input.inputMode = 'text';
      const enterHint = config.key === 'username' ? 'next' : 'go';
      if (input.enterKeyHint !== enterHint) input.enterKeyHint = enterHint;
      const autocomplete = config.key === 'password' ? 'current-password' : 'off';
      if (input.autocomplete !== autocomplete) input.autocomplete = autocomplete;
      if (document.activeElement !== input || focus) input.value = config.value || '';
      if (focus) {
        this.nativeInputKeepFocus = true;
        input.focus({ preventScroll: true });
        try { input.setSelectionRange(input.value.length, input.value.length); } catch (_) {}
      }
    }

    onNativeTextInput() {
      const input = this.nativeTextInput;
      const config = this.nativeTextInputConfig();
      if (!config) return;
      let value = input.value.slice(0, config.maxLength);
      if (config.key === 'name') value = value.replace(/[^a-z0-9 _-]/gi, '');
      else if (config.key === 'username') value = value.replace(/[^a-z0-9_-]/gi, '');
      if (input.value !== value) input.value = value;
      if (config.key === 'name') this.nameInput = value;
      else this.loginFields[config.key] = value;
    }

    bindEvents() {
      window.addEventListener('keydown', e => this.onKeyDown(e));
      window.addEventListener('keyup', e => this.onKeyUp(e));
      window.addEventListener('blur', () => this.clearInput());
      window.addEventListener('pointerdown', () => {
        this.goFullscreen();
      }, { passive: true, capture: true });
      document.addEventListener('fullscreenchange', () => {
        this.syncNativeTextInputOverlay();
      });
      document.addEventListener('webkitfullscreenchange', () => {
        this.syncNativeTextInputOverlay();
      });
      window.addEventListener('orientationchange', () => {
        window.setTimeout(() => {
          this.syncNativeTextInputOverlay();
          if (!this.isPortraitMobile()) this.goFullscreen();
        }, 120);
      });
      this.canvas.addEventListener('pointerdown', e => this.onPointerDown(e));
      window.addEventListener('pointermove', e => this.onPointerMove(e));
      window.addEventListener('pointerup', e => this.onPointerUp(e));
      window.addEventListener('pointercancel', e => this.onPointerUp(e));
      window.addEventListener('resize', () => this.syncNativeTextInputOverlay());
      if (window.visualViewport) window.visualViewport.addEventListener('resize', () => this.syncNativeTextInputOverlay());
      this.canvas.addEventListener('pointerleave', () => { this.pointer.inside = false; });
      this.canvas.addEventListener('contextmenu', e => e.preventDefault());
    }

    pointerPos(e) {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * VIEW_W / rect.width,
        y: (e.clientY - rect.top) * VIEW_H / rect.height
      };
    }

    // Movement keys must never leak out of typing fields, panels or pause.
    isTyping() {
      return this.state === 'login' || this.chatOpen || !!this.textField ||
        (this.state === 'select' && this.nameFocused);
    }

    clearInput() {
      const keys = this.input.keys;
      for (const k of Object.keys(keys)) keys[k] = false;
      this.pendingSkillIndex = null;
      this.pendingAimFromPointer = false;
      this.joystick.active = false;
      this.joystick.id = null;
      this.joystick.x = this.joystick.y = 0;
      this.pointerDownUI = false;
      if (this.network && this.network.online && this.network.connected && this.network.joined && this.player) {
        const aim = this.getAimPoint();
        this.network.send({ type: 'input', dx: 0, dy: 0, aimX: aim.x, aimY: aim.y, aim: this.player.aim, lockTargetId: this.lockedTargetId });
      }
    }

    onKeyDown(e) {
      const k = e.key.toLowerCase();
      if (document.activeElement === this.nativeTextInput) {
        if (k === 'enter') {
          e.preventDefault();
          if (this.state === 'intro') this.showClassSelect();
          else if (this.state === 'select') this.startNewGame();
          else if (this.state === 'login' && this.loginFields.active === 'username') {
            this.loginFields.active = 'password';
            this.textField = 'loginPass';
            this.syncNativeTextInputOverlay(true);
          } else if (this.state === 'login') this.networkLogin('login');
        } else if (k === 'tab' && this.state === 'login') {
          e.preventDefault();
          this.loginFields.active = this.loginFields.active === 'username' ? 'password' : 'username';
          this.textField = this.loginFields.active === 'username' ? 'loginUser' : 'loginPass';
          this.syncNativeTextInputOverlay(true);
        } else if (k === 'escape') {
          e.preventDefault();
          if (this.state === 'login') this.state = this.loginReturnState;
          else this.nameFocused = false;
          this.nativeTextInput.blur();
        }
        return;
      }
      const isMovement = k === 'w' || k === 'a' || k === 's' || k === 'd' ||
        k === 'arrowup' || k === 'arrowdown' || k === 'arrowleft' || k === 'arrowright' || k === ' ';
      const gameplay = this.state === 'playing' && !this.paused && !this.panel && !this.chatOpen && !this.textField;
      // Only real movement/attack keys are tracked. Shortcut keys (B, N, I...)
      // and keys typed into canvas text fields are never stored as movement.
      this.input.keys[k] = isMovement && gameplay && !this.isTyping();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'tab'].includes(k) || (k === 'p' && (e.shiftKey || e.altKey))) e.preventDefault();

      // STAGE 5: the name field on the title screen is typed on the canvas.
      if (this.state === 'select') {
        if (this.nameFocused) {
          if (k === 'backspace') this.nameInput = this.nameInput.slice(0, -1);
          else if (k === 'enter') this.startNewGame();
          else if (e.key.length === 1 && /[a-z0-9 _-]/i.test(e.key) && this.nameInput.length < 14) this.nameInput += e.key;
          return;
        }
        if (k === 'enter') this.startNewGame();
        else if (k === 'c' && this.saveData) this.loadGame();
        else if (k === 'o') this.openLogin();
        else if (k === 'escape') this.state = 'intro';
        return;
      }
      if (this.state === 'intro') {
        if (k === 'enter') this.showClassSelect();
        else if (k === 'c' && this.saveData) this.loadGame();
        return;
      }

      // EXPANSION 2: on-canvas account login/register.
      if (this.state === 'login') {
        if (k === 'escape') { this.state = this.loginReturnState; return; }
        if (k === 'tab') {
          this.loginFields.active = this.loginFields.active === 'username' ? 'password' : 'username';
          return;
        }
        if (k === 'backspace') {
          this.loginFields[this.loginFields.active] = this.loginFields[this.loginFields.active].slice(0, -1);
        } else if (k === 'enter') {
          this.networkLogin('login');
        } else if (e.key.length === 1 && this.loginFields[this.loginFields.active].length < 24) {
          const ch = e.key;
          if (this.loginFields.active === 'username' ? /[a-zA-Z0-9_-]/.test(ch) : ch !== ' ') {
            this.loginFields[this.loginFields.active] += ch;
          }
        }
        return;
      }

      // Chat consumes typing keys so you do not move while writing.
      if (this.chatOpen) {
        if (k === 'enter') this.sendChat();
        else if (k === 'escape') { this.chatOpen = false; this.chatInput = ''; this.clearInput(); }
        else if (k === 'backspace') this.chatInput = this.chatInput.slice(0, -1);
        else if (e.key.length === 1 && this.chatInput.length < 60) this.chatInput += e.key;
        return;
      }

      // EXPANSION 3/5: on-canvas text fields in auction/mail/guild panels.
      if (this.textField) {
        const key = this.textField === 'mailGold' ? 'actionGold'
          : this.textField === 'mailMessage' ? 'actionMessage'
          : this.textField === 'newAccountPass' ? 'accountPasswordInput' : 'actionText';
        if (k === 'escape' || k === 'enter') { this.textField = null; this.clearInput(); }
        else if (k === 'backspace') this[key] = this[key].slice(0, -1);
        else if (e.key.length === 1 && this[key].length < 60) {
          const numeric = this.textField === 'mailGold' || this.textField === 'auctionPrice';
          if (!numeric || /[0-9]/.test(e.key)) this[key] += e.key;
        }
        return;
      }

      if (e.repeat) return;

      if (this.paused) {
        if (k === 'escape') { this.paused = false; this.clearInput(); this.audio.sfx('ui'); }
        else if (k === 'arrowleft') this.changeVolume(-0.05);
        else if (k === 'arrowright') this.changeVolume(0.05);
        else if (k === 'h') this.startTutorial();
        return;
      }

      if (this.panel === 'tutorial') {
        if (k === 'escape') this.finishTutorial();
        else if (k === 'enter' || k === ' ' || k === 'arrowright') this.advanceTutorial();
        else if (k === 'arrowleft') this.previousTutorialStep();
        return;
      }

      if (this.panel) {
        if (['escape', 'i', 'k', 'f', 'b', 'm', 'g', 'r', 't'].includes(k)) {
          this.panel = null;
          this.clearInput();
          this.audio.sfx('ui');
        }
        return;
      }

      if (this.pendingSkillIndex !== null && k === 'escape') {
        this.pendingSkillIndex = null;
        this.audio.sfx('ui');
        return;
      }

      switch (k) {
        case ' ':
          if (this.network.online) {
            this.acquireAutoLockTarget();
            this.network.send({ type: 'attack', lockTargetId: this.lockedTargetId });
          }
          else this.player && this.player.attack(this);
          break;
        case '1': case '2': case '3': case '4': {
          const idx = Number(k) - 1;
          this.activateSkill(idx);
          break;
        }
        case 'i': this.panel = 'inventory'; this.audio.sfx('ui'); break;
        case 'k': this.panel = 'skills'; this.audio.sfx('ui'); break;
        case 'b': this.panel = 'auction'; if (this.network.online) this.network.send({ type: 'auctionList' }); break;
        case 'm': this.panel = 'mail'; if (this.network.online) this.network.send({ type: 'mailList' }); break;
        case 'g': this.panel = 'guild'; if (this.network.online) this.network.send({ type: 'guildInfo' }); break;
        case 'r': this.panel = 'craft'; break;
        case 't': this.panel = 'talents'; break;
        case 'y': this.panel = 'achievements'; this.audio.sfx('ui'); break;
        case 'u': this.panel = 'daily'; this.audio.sfx('ui'); break;
        case 'l': this.panel = 'leaderboardModal'; if (this.network.online) this.network.send({ type: 'get_leaderboard', category: 'level' }); this.audio.sfx('ui'); break;
        case 'p': this.panel = 'pets'; this.audio.sfx('ui'); break;
        case 'h': this.startTutorial(); break;
        case 'f': this.interact(); break;
        case 'n': if (this.network.online) this.network.send({ type: 'dungeon' }); else this.log('Dungeons require online mode.', '#ffd75e'); break;
        case 'e': this.emote(); break;
        case 'p':
          if (e.altKey) this.disbandParty();
          else if (e.shiftKey) this.leaveParty();
          else this.inviteParty();
          break;
        case 'tab': this.cycleLockTarget(e.shiftKey ? -1 : 1); break;
        case 'l': this.toggleLockTarget(); break;
        case 'q':
          this.useConsumable();
          break;
        case 'enter':
          this.clearInput();
          this.chatMinimized = false;
          this.chatOpen = true;
          this.chatInput = '';
          break;
        case 'escape': this.clearInput(); this.paused = true; this.audio.sfx('ui'); break;
      }
      if (this.panel) this.clearInput();
    }

    onKeyUp(e) {
      this.input.keys[e.key.toLowerCase()] = false;
    }

    onPointerDown(e) {
      const p = this.pointerPos(e);
      if (e.pointerType === 'touch') this.input.mobile = true;
      this.audio.unlock();

      const region = this.findClickRegion(p.x, p.y);
      if (region) {
        this.pointer.x = p.x;
        this.pointer.y = p.y;
        this.pointer.down = true;
        this.pointer.inside = true;
        this.pointer.id = e.pointerId;
        this.pointer.type = e.pointerType || 'mouse';
        this.pointerDownUI = true;
        this.audio.sfx('ui');
        this.handleAction(region.action);
        return;
      }

      // The movement stick stays anchored in the lower-left corner. Its touch
      // pointer is kept separate so moving the stick cannot move a skill reticle.
      if (this.input.mobile && this.state === 'playing' && !this.paused && !this.panel &&
          !this.chatOpen && !this.textField &&
          Math.hypot(p.x - this.joystick.originX, p.y - this.joystick.originY) <= 72) {
        this.joystick.active = true;
        this.joystick.id = e.pointerId;
        let dx = p.x - this.joystick.originX;
        let dy = p.y - this.joystick.originY;
        const length = Math.hypot(dx, dy);
        const max = 46;
        if (length > max) { dx = dx / length * max; dy = dy / length * max; }
        this.joystick.x = dx / max;
        this.joystick.y = dy / max;
        this.pointerDownUI = true;
        return;
      }

      this.pointer.x = p.x;
      this.pointer.y = p.y;
      this.pointer.down = true;
      this.pointer.inside = true;
      this.pointer.id = e.pointerId;
      this.pointer.type = e.pointerType || 'mouse';

      if (this.pendingSkillIndex !== null && this.state === 'playing' && !this.paused && !this.panel && !this.chatOpen) {
        this.pointer.lastMove = this.time;
        this.pointer.type = e.pointerType || 'mouse';
        this.confirmSkillTarget(p);
        return;
      }

      // Inventory drag-and-drop begins on a filled grid / equipment cell.
      if (this.panel === 'inventory') {
        const src = this.findDropRegion(p.x, p.y);
        if (src && src.item) {
          this.selectedItemUid = src.item.uid;
          const key = src.source.type + ':' + (src.source.index !== undefined ? src.source.index : src.source.slot);
          const now = performance.now();
          if (this.lastClick.key === key && now - this.lastClick.time < 320) {
            this.quickUseItem(src.item, src.source);
            this.lastClick = { key: '', time: 0 };
          } else {
            this.lastClick = { key, time: now };
            this.drag = { item: src.item, from: src.source };
          }
          this.pointerDownUI = true;
          return;
        }
      }

      // Mouse click on the world = basic attack.
      if (this.state === 'playing' && !this.paused && !this.panel && !this.chatOpen &&
          !(p.x < 370 && p.y > VIEW_H - 140)) {
        if (this.player) {
          this.acquireAutoLockTarget();
          this.player.aim = this.getAimAngle(this.player);
          if (this.network.online) this.network.send({ type: 'attack', aim: this.player.aim, lockTargetId: this.lockedTargetId });
          else this.player.attack(this);
        }
      }
    }

    onPointerMove(e) {
      const p = this.pointerPos(e);
      if (this.joystick.active && e.pointerId === this.joystick.id) {
        let dx = p.x - this.joystick.originX;
        let dy = p.y - this.joystick.originY;
        const len = Math.hypot(dx, dy);
        const max = 46;
        if (len > max) { dx = dx / len * max; dy = dy / len * max; }
        this.joystick.x = dx / max;
        this.joystick.y = dy / max;
        return;
      }
      this.pointer.x = p.x;
      this.pointer.y = p.y;
      this.pointer.inside = true;
      this.pointer.lastMove = this.time;
      if (this.pendingSkillIndex !== null) this.pendingAimFromPointer = true;
    }

    onPointerUp(e) {
      if (this.joystick.active && e.pointerId === this.joystick.id) {
        this.joystick.active = false;
        this.joystick.id = null;
        this.joystick.x = this.joystick.y = 0;
        this.pointerDownUI = false;
        return;
      }
      if (this.drag) {
        const p = { x: this.pointer.x, y: this.pointer.y };
        const target = this.findDropRegion(p.x, p.y);
        if (target) this.dropItem(this.drag, target);
        this.drag = null;
      }
      this.pointer.down = false;
      this.pointerDownUI = false;
    }

    findClickRegion(x, y) {
      for (let i = this.clickRegions.length - 1; i >= 0; i--) {
        const r = this.clickRegions[i];
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r;
      }
      return null;
    }

    findDropRegion(x, y) {
      for (let i = this.dropRegions.length - 1; i >= 0; i--) {
        const r = this.dropRegions[i];
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r;
      }
      return null;
    }

    changeVolume(amount) {
      this.settings.volume = clamp(this.settings.volume + amount, 0, 1);
      this.audio.setVolume(this.settings.volume);
      this.audio.sfx('ui');
    }

    // ---------- World helpers ----------

    log(text, color = '#dbe6ff') {
      this.chatMessages.push({ text, color, time: this.time });
      if (this.chatMessages.length > 40) this.chatMessages.shift();
    }

    addFloater(x, y, text, color, size) {
      // Stack nearby text upward so skill names, XP gains and emotes never overlap.
      let fy = y;
      for (const f of this.floaters) {
        if (Math.abs(f.x - x) < 80 && Math.abs(f.y - fy) < 16) fy -= 16;
      }
      this.floaters.push(new FloatingText(x, fy, text, color, size));
    }

    // Visible XP burst shared by offline kills and server 'xpDrop' events.
    showXpDrop(x, y, amount = 0) {
      this.effects.push(new Effect('ring', x, y - 6, {
        color: '#8ee6ff', radius: 4, endRadius: 34, life: 0.38
      }));
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * TAU;
        this.effects.push(new Effect('particle', x + Math.cos(a) * 5, y - 6 + Math.sin(a) * 5, {
          color: i % 2 ? '#8ee6ff' : '#d7f5ff',
          vx: Math.cos(a) * 95, vy: Math.sin(a) * 95 - 35,
          life: 0.34, size: 3
        }));
      }
      if (amount > 0) this.addFloater(x, y - 30, `${amount} XP`, '#8ee6ff', 10);
    }

    // Visible monster item-drop burst; online mirrors this with an itemDrop fx.
    showItemDrop(x, y, item) {
      if (!item) return;
      const color = RARITY[item.rarity] ? RARITY[item.rarity].color : '#c9a6ff';
      this.effects.push(new Effect('ring', x, y - 6, {
        color, radius: 5, endRadius: 30, life: 0.35
      }));
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * TAU;
        this.effects.push(new Effect('particle', x, y - 8, {
          color, vx: Math.cos(a) * 75, vy: Math.sin(a) * 75 - 25, life: 0.32, size: 3
        }));
      }
      this.addFloater(x, y - 44, `ITEM: ${item.name}`, color, 10);
    }

    spawnProjectile(opts) {
      this.projectiles.push(new Projectile(opts));
    }

    isBlocked(x, y, r = 0) {
      const points = [[x - r, y - r], [x + r, y - r], [x - r, y + r], [x + r, y + r]];
      for (const [px, py] of points) {
        if (px < 0 || py < 0 || px >= this.zone.pixelW || py >= this.zone.pixelH) return true;
        const tx = Math.floor(px / TILE);
        const ty = Math.floor(py / TILE);
        if (BLOCKED_TILES.has(this.zone.tiles[ty * this.zone.w + tx])) return true;
      }
      return false;
    }

    // Projectiles only stop at the solid map border.
    isProjectileBlocked(x, y, r = 0) {
      const points = [[x - r, y - r], [x + r, y - r], [x - r, y + r], [x + r, y + r]];
      for (const [px, py] of points) {
        if (px < 0 || py < 0 || px >= this.zone.pixelW || py >= this.zone.pixelH) return true;
        const tx = Math.floor(px / TILE);
        const ty = Math.floor(py / TILE);
        if (PROJECTILE_BLOCKED_TILES.has(this.zone.tiles[ty * this.zone.w + tx])) return true;
      }
      return false;
    }

    isBlockedPoint(x, y) {
      if (x < 0 || y < 0 || x >= this.zone.pixelW || y >= this.zone.pixelH) return true;
      const tx = Math.floor(x / TILE);
      const ty = Math.floor(y / TILE);
      return BLOCKED_TILES.has(this.zone.tiles[ty * this.zone.w + tx]);
    }

    lineClear(a, b) {
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      const steps = Math.max(1, Math.ceil(d / 10));
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        if (this.isBlockedPoint(lerp(a.x, b.x, t), lerp(a.y, b.y, t))) return false;
      }
      return true;
    }

    // Tile BFS gives enemies the next step around the outer wall if needed.
    // Interior obstacles no longer exist, so monsters do not get stuck.
    pathDirection(from, to) {
      const z = this.zone;
      const sx = clamp(Math.floor(from.x / TILE), 0, z.w - 1);
      const sy = clamp(Math.floor(from.y / TILE), 0, z.h - 1);
      const tx = clamp(Math.floor(to.x / TILE), 0, z.w - 1);
      const ty = clamp(Math.floor(to.y / TILE), 0, z.h - 1);
      const start = sy * z.w + sx;
      const goal = ty * z.w + tx;
      if (start === goal) return Math.atan2(to.y - from.y, to.x - from.x);
      const prev = new Int32Array(z.w * z.h).fill(-1);
      const queue = new Int32Array(z.w * z.h);
      let head = 0;
      let tail = 0;
      queue[tail++] = start;
      prev[start] = start;
      const dirs = [1, -1, z.w, -z.w];
      while (head < tail) {
        const cur = queue[head++];
        if (cur === goal) break;
        const cx = cur % z.w;
        for (const d of dirs) {
          const next = cur + d;
          if (next < 0 || next >= prev.length) continue;
          if (d === 1 && cx === z.w - 1) continue;
          if (d === -1 && cx === 0) continue;
          if (prev[next] !== -1) continue;
          const nx = next % z.w;
          const ny = Math.floor(next / z.w);
          if (BLOCKED_TILES.has(z.tiles[next]) && next !== goal) continue;
          prev[next] = cur;
          queue[tail++] = next;
        }
      }
      if (prev[goal] === -1) return Math.atan2(to.y - from.y, to.x - from.x);
      let step = goal;
      while (prev[step] !== start && prev[step] !== step) step = prev[step];
      const stepX = (step % z.w) * TILE + TILE / 2;
      const stepY = Math.floor(step / z.w) * TILE + TILE / 2;
      return Math.atan2(stepY - from.y, stepX - from.x);
    }

    // Move one axis at a time so characters slide along walls.
    tryMove(entity, dx, dy) {
      if (dx !== 0 && !this.isBlocked(entity.x + dx, entity.y, entity.radius)) entity.x += dx;
      if (dy !== 0 && !this.isBlocked(entity.x, entity.y + dy, entity.radius)) entity.y += dy;
    }

    combatTargets() {
      const list = [];
      if (this.player && this.player.alive) list.push(this.player);
      for (const op of this.otherPlayers) if (op.alive) list.push(op);
      return list;
    }

    rawAimPoint() {
      return { x: this.pointer.x + this.camX, y: this.pointer.y + this.camY };
    }

    targetableEnemies() {
      return this.enemies.filter(e => e && e.alive !== false &&
        Number.isFinite(e.x) && Number.isFinite(e.y));
    }

    currentLockTarget() {
      if (this.lockedTargetId === null || this.lockedTargetId === undefined) return null;
      const target = this.enemies.find(e => e && String(e.id) === String(this.lockedTargetId));
      return target && target.alive !== false ? target : null;
    }

    acquireAutoLockTarget(maxDistance = 500) {
      const current = this.currentLockTarget();
      if (current) return current;
      this.lockedTargetId = null;
      if (!this.player) return null;
      let nearest = null;
      let nearestDistance = maxDistance;
      for (const enemy of this.targetableEnemies()) {
        const distance = dist(this.player, enemy);
        if (distance <= nearestDistance) {
          nearest = enemy;
          nearestDistance = distance;
        }
      }
      this.lockedTargetId = nearest ? nearest.id : null;
      return nearest;
    }

    // Lock-on overrides aiming for attacks and skills, but selection still uses
    // the raw cursor/facing so cycling always starts from what the player points at.
    getAimPoint() {
      const target = this.currentLockTarget();
      if (target) return { x: target.x, y: target.y - 8 };
      return this.rawAimPoint();
    }

    skillNeedsAim(index) {
      if (!this.player) return false;
      const classId = this.player.classId;
      if (classId === 'swordsman') return index === 0;
      if (classId === 'archer') return true;
      if (classId === 'mage') return index > 0;
      if (classId === 'cleric') return index === 0;
      if (classId === 'rogue') return index === 0 || index === 2 || index === 3;
      if (classId === 'summoner') return index === 0;
      return false;
    }

    activateSkill(index) {
      if (!this.player || !this.player.alive || this.panel || this.paused) return;
      if (!this.skillNeedsAim(index)) {
        this.pendingSkillIndex = null;
        if (this.network.online) this.network.send({ type: 'skill', index, lockTargetId: this.lockedTargetId });
        else this.player.useSkill(index, this);
        return;
      }
      if (this.pendingSkillIndex === index) {
        this.pendingSkillIndex = null;
        return;
      }
      this.pendingSkillIndex = index;
      this.pendingAimFromPointer = false;
      this.audio.sfx('ui');
    }

    skillAimPoint() {
      const locked = this.currentLockTarget();
      if (locked) return { x: locked.x, y: locked.y - 8 };
      if (this.pendingAimFromPointer && this.pointer.inside) {
        const point = this.rawAimPoint();
        if (this.player.classId === 'mage' && this.pendingSkillIndex === 2) {
          const dx = point.x - this.player.x;
          const dy = point.y - (this.player.y - 8);
          const length = Math.hypot(dx, dy);
          if (length > 260) return { x: this.player.x + dx / length * 260, y: this.player.y - 8 + dy / length * 260 };
        }
        return point;
      }
      const angle = this.player ? (this.player.aim || this.player.facing || 0) : 0;
      const distance = this.player && this.player.classId === 'mage' && this.pendingSkillIndex === 2 ? 260 : 180;
      return { x: this.player.x + Math.cos(angle) * distance, y: this.player.y - 8 + Math.sin(angle) * distance };
    }

    confirmSkillTarget(point) {
      if (!this.player || this.pendingSkillIndex === null) return;
      const index = this.pendingSkillIndex;
      const worldPoint = { x: point.x + this.camX, y: point.y + this.camY };
      if (this.player.classId === 'mage' && index === 2 && !this.currentLockTarget()) {
        const dx = worldPoint.x - this.player.x;
        const dy = worldPoint.y - (this.player.y - 8);
        const length = Math.hypot(dx, dy);
        if (length > 260) {
          worldPoint.x = this.player.x + dx / length * 260;
          worldPoint.y = this.player.y - 8 + dy / length * 260;
        }
      }
      this.pointer.x = point.x;
      this.pointer.y = point.y;
      this.pointer.inside = true;
      this.pointer.lastMove = this.time;
      this.pendingSkillIndex = null;
      this.pendingAimFromPointer = false;
      const aim = Math.atan2(worldPoint.y - (this.player.y - 10), worldPoint.x - this.player.x);
      this.player.aim = aim;
      if (this.network.online) {
        this.network.send({ type: 'skill', index, aim, aimX: worldPoint.x, aimY: worldPoint.y, lockTargetId: this.lockedTargetId });
      } else {
        this.player.useSkill(index, this);
      }
    }

    getAimAngle(entity) {
      const target = this.currentLockTarget();
      if (target) {
        return Math.atan2((target.y - 8) - (entity.y - 10), target.x - entity.x);
      }
      if (this.pointer.inside && this.pointer.lastMove > this.time - 8) {
        const p = this.rawAimPoint();
        return Math.atan2(p.y - (entity.y - 10), p.x - entity.x);
      }
      return entity.facing || 0;
    }

    enemyLabel(enemy) {
      return enemy && enemy.type ? enemy.type[0].toUpperCase() + enemy.type.slice(1) : 'Enemy';
    }

    selectionAimPoint() {
      if (this.pointer.inside && this.pointer.lastMove > this.time - 8 && this.pointer.type !== 'touch') {
        return this.rawAimPoint();
      }
      const facing = this.player ? (this.player.aim || this.player.facing || 0) : 0;
      const px = this.player ? this.player.x : this.camX + VIEW_W / 2;
      const py = this.player ? this.player.y - 8 : this.camY + VIEW_H / 2;
      return { x: px + Math.cos(facing) * 260, y: py + Math.sin(facing) * 260 };
    }

    cycleLockTarget(dir = 1) {
      if (!this.player) return;
      const aim = this.selectionAimPoint();
      const candidates = this.targetableEnemies()
        .map(e => ({
          enemy: e,
          distance: dist(this.player, e),
          score: Math.hypot(e.x - aim.x, e.y - aim.y)
        }))
        .filter(c => c.distance < 820)
        .sort((a, b) => a.score - b.score || a.distance - b.distance);

      if (!candidates.length) {
        this.lockedTargetId = null;
        this.log('No target in range.', '#ff9b9b');
        return;
      }

      let index = candidates.findIndex(c => String(c.enemy.id) === String(this.lockedTargetId));
      index = index < 0
        ? (dir > 0 ? 0 : candidates.length - 1)
        : (index + dir + candidates.length) % candidates.length;
      this.lockedTargetId = candidates[index].enemy.id;
      this.audio.sfx('ui');
      this.log(`Target locked: ${this.enemyLabel(candidates[index].enemy)}`, '#ffd75e');
    }

    toggleLockTarget() {
      if (this.lockedTargetId !== null && this.lockedTargetId !== undefined) this.unlockTarget();
      else this.cycleLockTarget(1);
    }

    unlockTarget() {
      if (this.lockedTargetId === null || this.lockedTargetId === undefined) return;
      this.lockedTargetId = null;
      this.audio.sfx('ui');
      this.log('Target released.', '#9aa6bd');
    }

    updateLockTarget() {
      if (this.lockedTargetId === null || this.lockedTargetId === undefined) return;
      const target = this.currentLockTarget();
      if (!target || !this.player || dist(this.player, target) > 900) this.lockedTargetId = null;
    }

    // ============================================================
    // EXPANSION 1-5: authoritative online mode helpers
    // ============================================================

    // Predict local movement at the same speed as offline play, then reconcile
    // larger differences against the authoritative server position.
    updateNetwork(dt) {
      const net = this.network;
      const p = this.player;
      if (!p || !net.online || !net.connected) return;

      p.attackCd = Math.max(0, p.attackCd - dt);
      p.attackAnim = Math.max(0, p.attackAnim - dt);
      p.skillAnim = Math.max(0, (p.skillAnim || 0) - dt);
      p.shieldTime = Math.max(0, p.shieldTime - dt);
      p.invuln = Math.max(0, p.invuln - dt);
      p.dashTime = Math.max(0, p.dashTime - dt);
      for (let i = 0; i < 4; i++) p.skillCd[i] = Math.max(0, (p.skillCd[i] || 0) - dt);
      if (p.emote) {
        if (typeof p.emote === 'object') {
          p.emote.time -= dt;
          if (p.emote.time <= 0) p.emote = null;
        }
      }

      p.aim = this.getAimAngle(p);

      for (const actor of net.players.values()) actor.interpolate(dt);
      for (const actor of net.enemies.values()) actor.interpolate(dt);
      for (const actor of net.projectiles.values()) actor.interpolate(dt);
      for (const actor of net.pickups.values()) actor.interpolate(dt);

      let dx = 0;
      let dy = 0;
      const keys = this.input.keys;
      if (keys.a || keys.arrowleft) dx -= 1;
      if (keys.d || keys.arrowright) dx += 1;
      if (keys.w || keys.arrowup) dy -= 1;
      if (keys.s || keys.arrowdown) dy += 1;
      if (this.joystick.active && (this.joystick.x || this.joystick.y)) {
        dx += this.joystick.x;
        dy += this.joystick.y;
      }
      const len = Math.hypot(dx, dy);
      const canMove = net.joined && !this.chatOpen && !this.paused && !this.panel;
      if (!canMove) { dx = 0; dy = 0; }
      if (len > 0) { dx /= len; dy /= len; }
      if (canMove && len > 0.05) {
        p.facing = Math.atan2(dy, dx);
        if (p.dashTime <= 0) {
          const speed = p.finalStats.speed * (p.shieldTime > 0 ? 0.55 : 1);
          this.tryMove(p, dx * speed * dt, dy * speed * dt);
        }
        p.walkTimer += dt;
        p.walkFrame = playerGaitFrame(p.walkTimer, p.finalStats.speed, p.dashTime > 0);
      } else {
        p.walkFrame = 0;
      }

      if (Number.isFinite(p.tx) && Number.isFinite(p.ty)) {
        const error = Math.hypot(p.tx - p.x, p.ty - p.y);
        if (!canMove || error > 32) {
          const correctionRate = error > 32 ? 18 : 28;
          const k = 1 - Math.exp(-dt * correctionRate);
          p.x = lerp(p.x, p.tx, k);
          p.y = lerp(p.y, p.ty, k);
        }
      }

      this.inputSendTimer += dt;
      if (net.connected && net.online && net.joined && this.inputSendTimer >= 0.05) {
        this.inputSendTimer = 0;
        const aim = this.getAimPoint();
        // The server stays authoritative while local movement is predicted immediately.
        net.send({ type: 'input', dx, dy, aimX: aim.x, aimY: aim.y, aim: p.aim, lockTargetId: this.lockedTargetId });
      }
    }

    syncRemoteActors(list, map, ActorClass) {
      const seen = new Set();
      for (const data of Array.isArray(list) ? list : []) {
        if (!data || data.id === undefined || data.id === null) continue;
        const id = String(data.id);
        seen.add(id);
        const current = map.get(id);
        if (current) current.update(data);
        else map.set(id, new ActorClass(data));
      }
      for (const id of Array.from(map.keys())) if (!seen.has(id)) map.delete(id);
    }

    applyPlayerState(data) {
      const p = this.player;
      if (!p || !data) return;
      p.tx = Number.isFinite(data.x) ? data.x : p.x;
      p.ty = Number.isFinite(data.y) ? data.y : p.y;
      if (Number.isFinite(data.facing)) p.facing = data.facing;
      if (Number.isFinite(data.aim)) p.aim = data.aim;
      if (Number.isFinite(data.hp)) p.hp = clamp(data.hp, 0, Number.isFinite(data.maxHp) ? data.maxHp : p.maxHp);
      if (Number.isFinite(data.mp)) p.mp = clamp(data.mp, 0, Number.isFinite(data.maxMp) ? data.maxMp : p.maxMp);
      if (Number.isFinite(data.maxHp)) p.maxHp = data.maxHp;
      if (Number.isFinite(data.maxMp)) p.maxMp = data.maxMp;
      if (Number.isFinite(data.level)) p.level = data.level;
      if (Number.isFinite(data.gold)) p.gold = data.gold;
      if (Number.isFinite(data.xp)) p.xp = data.xp;
      if (Number.isFinite(data.xpNext)) p.xpNext = data.xpNext;
      if (Array.isArray(data.skillCd)) p.skillCd = Array.from({ length: 4 }, (_, i) => Math.max(0, Number(data.skillCd[i]) || 0));
      if (Number.isFinite(data.skillAnim)) p.skillAnim = data.skillAnim;
      if (data.skillAnimColor) p.skillAnimColor = data.skillAnimColor;
      if (data.skillAnimName) p.skillAnimName = data.skillAnimName;
      if (data.spec !== undefined) p.spec = data.spec || '';
      if (data.stats && typeof data.stats === 'object') {
        p.finalStats = Object.assign({}, p.finalStats, data.stats);
        if (Number.isFinite(data.stats.crit)) p.critChance = data.stats.crit;
      }
      p.party = !!(data.party && (Array.isArray(data.party) ? data.party.length : true));
      p.partyLeaderId = data.partyLeaderId || null;
      if (data.emote) {
        p.emote = typeof data.emote === 'object'
          ? { text: String(data.emote.text || ''), time: Number(data.emote.time) || 2 }
          : { text: String(data.emote), time: 2 };
      } else if (!p.emote || typeof p.emote !== 'object' || p.emote.time === undefined) {
        p.emote = null;
      }
      if (Number.isFinite(data.attackAnim)) p.attackAnim = data.attackAnim;
    }

    // A character message is the cloud save: bag, gear, quest, talents, spec, materials.
    applyCharacter(char, fresh = false) {
      if (!char || typeof char !== 'object') return;
      const classId = CLASS_DATA[char.classId] ? char.classId
        : (this.player && this.player.classId) || this.selectedClass || 'swordsman';
      const zoneId = char.zoneId || this.zoneId || 'forest';
      const fallback = ZONE_SPAWN[zoneId] || ZONE_SPAWN.forest;
      const x = Number.isFinite(char.x) ? char.x : fallback.x;
      const y = Number.isFinite(char.y) ? char.y : fallback.y;
      const name = String(char.name || char.username || (this.player && this.player.name) || 'Hero');

      if (!this.player || fresh || this.player.classId !== classId || this.player.name !== name) {
        this.player = new Player(classId, name, x, y);
      }
      const p = this.player;
      p.classId = classId;
      p.name = name;
      p.x = x;
      p.y = y;
      p.tx = x;
      p.ty = y;
      p.level = Math.max(1, Number(char.level) || 1);
      p.xp = Math.max(0, Number(char.xp) || 0);
      p.xpNext = Math.max(1, Number(char.xpNext) || Math.floor(80 * Math.pow(p.level, 1.28)));
      p.gold = Math.max(0, Number(char.gold) || 0);
      p.skillPoints = Math.max(0, Number(char.skillPoints) || 0);
      p.skillRanks = normalizeSkillRanks(char.skillRanks);
      p.spec = char.spec || '';
      p.talents = Object.assign({ power: 0, haste: 0, vigor: 0, crit: 0, guard: 0, focus: 0 }, char.talents || {});
      p.materials = Object.assign({ herb: 0, ore: 0, essence: 0 }, char.materials || {});
      p.inventory = Array.isArray(char.inventory)
        ? compactInventory(char.inventory.map(item => normalizeItem(item, classId)).filter(Boolean)) : p.inventory;
      const eq = char.equipment || {};
      p.equipment = {
        weapon: normalizeItem(eq.weapon, classId),
        armor: normalizeItem(eq.armor, classId),
        helmet: normalizeItem(eq.helmet, classId),
        boots: normalizeItem(eq.boots, classId),
        ring: normalizeItem(eq.ring, classId),
        necklace: normalizeItem(eq.necklace, classId)
      };
      p.title = char.title || 'Apprentice';
      p.pvpRating = Number(char.pvpRating) || 1000;
      p.pvpWins = Number(char.pvpWins) || 0;
      p.pvpLosses = Number(char.pvpLosses) || 0;
      p.pet = char.pet || null;
      if (char.achievements) this.achievements = char.achievements;
      if (char.dailyQuests) this.dailyQuests = char.dailyQuests;
      if (Array.isArray(char.skillCd)) p.skillCd = Array.from({ length: 4 }, (_, i) => Math.max(0, Number(char.skillCd[i]) || 0));
      p.recalculateStats(false);
      if (Number.isFinite(char.hp)) p.hp = clamp(char.hp, 0, p.maxHp);
      else if (fresh) p.hp = p.maxHp;
      if (Number.isFinite(char.mp)) p.mp = clamp(char.mp, 0, p.maxMp);
      else if (fresh) p.mp = p.maxMp;
      if (!Number.isFinite(char.hp) && p.hp <= 0) p.hp = p.maxHp;
      p.alive = p.hp > 0;

      const savedQuest = char.quest && typeof char.quest === 'object' ? char.quest : {};
      this.quest = normalizeQuestProgress(savedQuest);
      this.bossDefeated = !!char.bossDefeated;
      if (char.id || char.playerId) this.network.playerId = char.id || char.playerId;
      if (Array.isArray(char.auction)) this.networkData.auction = char.auction;
      if (Array.isArray(char.mail)) this.networkData.mail = char.mail;
      if (char.guild) this.networkData.guild = typeof char.guild === 'object' ? char.guild : { name: char.guild };

      if (fresh) {
        this.audio.unlock();
        this.zoneId = zoneId;
        this.zone = this.zones[zoneId] || this.zones.forest;
        this.minimapCache = null;
        this.pet = null;                 // Pet is an offline-only visual helper.
        this.otherPlayers = [];          // Remove the simulated offline crowd.
        this.party = [];
        this.enemies = [];
        this.projectiles = [];
        this.pickups = [];
        this.effects = [];
        this.floaters = [];
        this.portals = PORTAL_DEFS[this.zoneId] ? PORTAL_DEFS[this.zoneId].map(q => Object.assign({}, q, { radius: 30 })) : [];
        this.clearInput();
        this.state = 'playing';
        this.paused = false;
        this.panel = null;
        this.chatOpen = false;
        this.buildMinimap();
        this.log(`Logged in as ${name}.`, '#8ee6ff');
        this.log('Press N to enter a private dungeon/raid.', '#ffd75e');
        this.startTutorialIfNeeded();
      }
    }

    applyServerZone(init) {
      // The server calls private instances "cave" internally; the room id tells
      // us it is really a dungeon, so label it correctly in the client.
      const isDungeon = String(init.roomId || '').startsWith('dungeon') || init.zoneId === 'dungeon';
      const zoneId = isDungeon ? 'dungeon' : (init.zoneId || 'forest');
      const w = Math.max(1, Number(init.w) || 96);
      const h = Math.max(1, Number(init.h) || 72);
      const raw = Array.isArray(init.tiles) ? init.tiles : [];
      const tiles = new Uint8Array(w * h);
      for (let i = 0; i < tiles.length; i++) tiles[i] = clamp(Number(raw[i]) || 0, 0, 16);
      const zone = {
        id: zoneId, w, h, tiles,
        pixelW: w * TILE, pixelH: h * TILE,
        name: zoneId === 'dungeon' ? 'Raid Arena' :
              zoneId === 'village' ? 'Hearthvale Village' :
              zoneId === 'frost_cave' ? 'Frost Cavern' :
              zoneId === 'volcano' ? 'Inferno Crater' :
              zoneId === 'swamp' ? 'Toxic Marsh' :
              zoneId === 'arena' ? 'Colosseum PvP Arena' :
              zoneId[0].toUpperCase() + zoneId.slice(1)
      };
      this.zoneId = zoneId;
      this.zone = zone;
      this.zones[zoneId] = zone;
      this.network.roomId = init.roomId || '';
      this.network.joined = true;
      this.lockedTargetId = null;
      this.portals = (Array.isArray(init.portals) ? init.portals : []).map(p => Object.assign({}, p, { radius: 30 }));
      // Keep the same NPC coordinates as the server so F opens shop/quest online.
      this.npcs = zoneId === 'forest' ? NPC_DEFS.map(n => new Npc(n.type, n.name, n.x, n.y))
        : zoneId === 'village' ? VILLAGE_NPC_DEFS.map(n => new Npc(n.type, n.name, n.x, n.y)) : [];
      this.minimapCache = null;
      this.enemies = [];
      this.projectiles = [];
      this.pickups = [];
      this.effects = [];
      this.floaters = [];
      this.buildMinimap();
      if (zoneId === 'dungeon') {
        this.log('Private dungeon instance created. Defeat the boss for party loot!', '#ffd75e');
        this.audio.sfx('portal');
      } else {
        this.log(`Entered ${zone.name} (room ${this.network.roomId}).`, '#c9a6ff');
      }
    }

    onNetworkMessage(msg) {
      if (!msg || typeof msg !== 'object' || !msg.type) return;
      const net = this.network;
      switch (msg.type) {
        case 'auth': {
          net.token = msg.token || '';
          net.online = true;
          net.joined = false;
          // Save session so returning players auto-login next time
          if (this._pendingLogin) {
            this._saveSession(this._pendingLogin.username, this._pendingLogin.password);
            this._pendingLogin = null;
          }
          this.applyCharacter(msg.character || msg.char, true);
          net.send({ type: 'join' });
          break;
        }
        case 'passwordSet': {
          if (msg.success && msg.newPassword) {
            const user = this.session ? this.session.username : (this.player ? this.player.name : 'Hero');
            this._saveSession(user, msg.newPassword);
            this.accountPasswordInput = '';
            this.log('★ Password updated and saved on this device!', '#8ee6ff');
            this.audio.sfx('level');
          }
          break;
        }
        case 'achievement_unlocked': {
          this.log(`★ Achievement Unlocked: ${msg.achievement.name}!`, '#ffd75e');
          this.audio.sfx('level');
          break;
        }
        case 'achievements': {
          this.achievements = msg.achievements;
          break;
        }
        case 'daily_quests': {
          this.dailyQuests = msg.dailyQuests;
          break;
        }
        case 'leaderboard': {
          this.leaderboardData = msg;
          break;
        }
        case 'trade_invite': {
          this.promptTradeInvite(msg.fromId, msg.fromName);
          break;
        }
        case 'trade_state': {
          this.tradeState = msg;
          this.panel = 'trade';
          break;
        }
        case 'trade_closed': {
          if (this.panel === 'trade') this.panel = null;
          this.tradeState = null;
          this.log(`Trade closed (${msg.reason}).`, '#ffd75e');
          break;
        }
        case 'telegraph': {
          if (!this.telegraphs) this.telegraphs = [];
          this.telegraphs.push({
            x: msg.x, y: msg.y, r: msg.radius, duration: msg.duration, time: msg.duration, color: msg.color
          });
          break;
        }
        case 'character':
          this.applyCharacter(msg.character || msg.char, false);
          break;
        case 'init':
          this.applyServerZone(msg);
          break;
        case 'state': {
          const players = Array.isArray(msg.players) ? msg.players : [];
          const localName = this.loginFields.username;
          if (!net.playerId) {
            const local = players.find(p => (msg.playerId && String(p.id) === String(msg.playerId)) ||
              (localName && (p.username === localName || p.name === localName))) || null;
            if (local) net.playerId = local.id;
          }
          const localData = players.find(p => String(p.id) === String(net.playerId));
          if (localData) this.applyPlayerState(localData);
          const remotes = players.filter(p => String(p.id) !== String(net.playerId));
          this.syncRemoteActors(remotes, net.players, RemotePlayer);
          this.syncRemoteActors(msg.enemies, net.enemies, RemoteEnemy);
          this.syncRemoteActors(msg.projectiles, net.projectiles, RemoteProjectile);
          this.syncRemoteActors(msg.pickups, net.pickups, RemotePickup);
          this.otherPlayers = Array.from(net.players.values());
          this.enemies = Array.from(net.enemies.values());
          this.projectiles = Array.from(net.projectiles.values());
          this.pickups = Array.from(net.pickups.values());
          if (Array.isArray(msg.portals) && msg.portals.length) {
            this.portals = msg.portals.map(p => Object.assign({}, p, { radius: 30 }));
          }
          const partyIds = Array.isArray(localData && localData.partyMembers)
            ? localData.partyMembers.map(String)
            : Array.isArray(localData && localData.party) ? localData.party.map(String) : [];
          this.party = remotes.filter(p => partyIds.includes(String(p.id)));
          break;
        }
        case 'event':
          this.handleNetworkEvent(msg);
          break;
        case 'error':
          this.log(msg.message || msg.text || 'Server error.', '#ff9b9b');
          this.audio.sfx('hurt');
          // If auto-login failed (stale session), clear it and fall back
          if (this._pendingLogin && this.state === 'connecting') {
            this._clearSession();
            this._pendingLogin = null;
            this.state = 'select';
            this.log('Session expired. Please choose a name and try again.', '#ffd75e');
          }
          break;
        case 'pong':
          break;
        default:
          console.warn('Unknown server message:', msg.type, msg);
      }
    }

    addSkillRune(x, y, index, color, angle = 0, impact = false) {
      const count = impact ? 10 : 7;
      this.effects.push(new Effect('rune', x, y, {
        color, radius: impact ? 8 : 13, endRadius: impact ? 58 : 44,
        life: impact ? 0.48 : 0.58, variant: index, angle
      }));
      for (let i = 0; i < count; i++) {
        const a = angle + i / count * TAU;
        const speed = impact ? 105 : 70;
        this.effects.push(new Effect('particle', x + Math.cos(a) * 7, y + Math.sin(a) * 4, {
          color, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - rand(18, 54),
          life: rand(0.24, 0.42), size: impact ? 3 : 2
        }));
      }
    }

    // Server fx events keep skill animations identical for every player.
    playSkillFx(ev) {
      if (!ev) return;
      const visual = ev.visual || 'skill';
      const classId = CLASS_DATA[ev.classId] ? ev.classId
        : (this.player && this.player.classId) || 'swordsman';
      const index = clamp(Math.floor(Number(ev.index) || 0), 0, 3);
      const x = Number.isFinite(ev.x) ? ev.x : (this.player ? this.player.x : 0);
      const y = Number.isFinite(ev.y) ? ev.y : (this.player ? this.player.y : 0);
      const aim = Number.isFinite(ev.aim) ? ev.aim : 0;
      const color = ev.color || (CLASS_DATA[classId] && CLASS_DATA[classId].color) || '#fff';
      const name = ev.name || (SKILLS[classId] && SKILLS[classId][index] && SKILLS[classId][index].name) || 'Skill';
      const ownerId = ev.ownerId;
      const isSelf = !ownerId ||
        (this.network.playerId && String(ownerId) === String(this.network.playerId)) ||
        (ev.ownerName && this.player && ev.ownerName === this.player.name);

      const ring = (rx, ry, r0, r1, life) => {
        this.effects.push(new Effect('ring', rx, ry, { color, radius: r0, endRadius: r1, life }));
      };
      const line = (x1, y1, x2, y2, life, size = 4) => {
        this.effects.push(new Effect('line', x1, y1, { color, x2, y2, life, size }));
      };
      const burst = (bx, by, count, distRange, speed, life) => {
        for (let i = 0; i < count; i++) {
          const a = i / count * TAU + rand(-0.2, 0.2);
          const d = rand(4, distRange);
          this.effects.push(new Effect('particle', bx + Math.cos(a) * d, by + Math.sin(a) * d, {
            color, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: rand(life * 0.7, life), size: 3
          }));
        }
      };

      if (visual === 'xpDrop') {
        // Ignore stale/other-player XP events so their text never hides ours.
        if ((ev.ownerId || ev.ownerName) && !isSelf) return;
        this.showXpDrop(x, y, Number(ev.amount) || 0);
        return;
      }
      if (visual === 'itemDrop') {
        const dropColor = ev.color || '#c9a6ff';
        this.effects.push(new Effect('ring', x, y - 6, {
          color: dropColor, radius: 5, endRadius: 30, life: 0.35
        }));
        this.addFloater(x, y - 44, `ITEM: ${ev.name || 'Item'}`, dropColor, 10);
        return;
      }
      if (visual === 'spawn') {
        const spawnColor = ev.color || (ev.type === 'goblin' ? '#8fd66c' : '#7bdcff');
        this.effects.push(new Effect('ring', x, y - 8, {
          color: spawnColor, radius: 6, endRadius: 34, life: 0.4
        }));
        for (let i = 0; i < 6; i++) {
          const a = i / 6 * TAU;
          this.effects.push(new Effect('particle', x, y - 8, {
            color: spawnColor, vx: Math.cos(a) * 70, vy: Math.sin(a) * 70, life: 0.35, size: 3
          }));
        }
        return;
      }
      if (visual === 'meteorImpact') {
        const ix = Number.isFinite(ev.x) ? ev.x : x;
        const iy = Number.isFinite(ev.y) ? ev.y : y;
        const impactColor = ev.color || '#ff8c42';
        this.effects.push(new Effect('ring', ix, iy, { color: impactColor, radius: 12, endRadius: 120, life: 0.5 }));
        for (let i = 0; i < 22; i++) {
          const a = i / 22 * TAU;
          this.effects.push(new Effect('particle', ix, iy, {
            color: i % 2 ? '#ff8c42' : '#ffd166',
            vx: Math.cos(a) * rand(90, 230), vy: Math.sin(a) * rand(90, 230), life: rand(0.35, 0.6), size: 4
          }));
        }
        this.shake = Math.max(this.shake, 12);
        return;
      }
      if (visual === 'bossSlam') {
        this.effects.push(new Effect('ring', x, y, { color: '#ff6b4a', radius: 10, endRadius: 88, life: 0.35 }));
        this.shake = Math.max(this.shake, 9);
        return;
      }
      if (visual !== 'skill') return;

      if (isSelf && this.player) this.player.playSkillAnim(this, { name }, color);
      else {
        const remote = this.network.players.get(String(ownerId));
        if (remote) remote.playSkillAnim(color, name);
        this.addFloater(x, y - 76, name, color, 11);
      }

      const cos = Math.cos(aim);
      const sin = Math.sin(aim);
      const tx = Number.isFinite(ev.tx) ? ev.tx : x + cos * 100;
      const ty = Number.isFinite(ev.ty) ? ev.ty : y + sin * 100;
      this.addSkillRune(x, y + 2, index, color, aim);
      if (Number.isFinite(ev.tx) && Number.isFinite(ev.ty)) {
        this.addSkillRune(tx, ty, index, color, aim, true);
      }

      if (classId === 'swordsman') {
        if (index === 0) {
          line(x, y - 10, tx, ty - 10, 0.22, 5);
          ring(tx, ty, 10, 70, 0.3);
          burst(tx, ty, 12, 26, 120, 0.3);
          this.shake = Math.max(this.shake, 5);
        } else if (index === 1) {
          ring(x, y - 10, 16, 44, 0.4);
          burst(x, y - 10, 10, 22, 80, 0.35);
        } else if (index === 2) {
          ring(x, y - 8, 20, 108, 0.45);
          burst(x, y - 10, 18, 30, 150, 0.4);
          this.shake = Math.max(this.shake, 6);
        } else {
          ring(x, y - 8, 18, 145, 0.55);
          burst(x, y - 10, 22, 38, 170, 0.45);
          this.shake = Math.max(this.shake, 8);
        }
      } else if (classId === 'archer') {
        if (index === 0) {
          for (const spread of [-0.20, 0, 0.20]) {
            const a = aim + spread;
            line(x, y - 10, x + Math.cos(a) * 150, y - 10 + Math.sin(a) * 150, 0.2, 3);
          }
          burst(x + cos * 40, y - 10 + sin * 40, 8, 16, 100, 0.25);
        } else if (index === 1) {
          ring(x, y - 6, 12, 46, 0.35);
          line(x, y - 8, x + cos * 70, y - 8 + sin * 70, 0.22, 4);
        } else if (index === 2) {
          line(x, y - 10, tx, ty - 10, 0.24, 4);
          burst(tx, ty, 12, 18, 90, 0.4);
        } else {
          ring(tx, ty, 12, 112, 0.5);
          burst(tx, ty, 18, 80, 120, 0.4);
        }
      } else {
        if (index === 0) {
          ring(x, y - 10, 25, 135, 0.5);
          burst(x, y - 10, 20, 40, 160, 0.45);
          this.shake = Math.max(this.shake, 4);
        } else if (index === 1) {
          line(x, y - 10, tx, ty - 10, 0.25, 4);
          ring(x, y - 10, 8, 42, 0.3);
          ring(tx, ty - 10, 8, 42, 0.3);
        } else if (index === 2) {
          this.effects.push(new Effect('meteor', tx, ty, { color, radius: 108, life: 0.7 }));
        } else {
          ring(tx, ty, 10, 105, 0.45);
          burst(tx, ty, 20, 32, 145, 0.4);
        }
      }
    }

    handleNetworkEvent(ev) {
      const kind = ev.kind || ev.event;
      switch (kind) {
        case 'system':
          this.log(ev.text || '', ev.color || '#dbe6ff');
          break;
        case 'chat': {
          const chan = ev.channel === 'guild' ? 'guild' : 'zone';
          const prefix = chan === 'guild' ? '[G]' : '';
          this.log(`${prefix}[${ev.name || ev.from || 'Player'}] ${ev.text || ''}`,
            ev.color || (chan === 'guild' ? '#c9a6ff' : '#ffffff'));
          break;
        }
        case 'hit': {
          const dmg = Number(ev.dmg !== undefined ? ev.dmg : ev.amount) || 0;
          const x = Number.isFinite(ev.x) ? ev.x : (this.player ? this.player.x : 0);
          const y = Number.isFinite(ev.y) ? ev.y : (this.player ? this.player.y : 0);
          this.addFloater(x, y - 20, String(dmg), ev.crit ? '#ffd75e' : '#ffffff', ev.crit ? 16 : 13);
          this.audio.sfx(ev.crit ? 'crit' : 'hit');
          if (ev.crit || dmg > 40) this.shake = Math.max(this.shake, ev.crit ? 6 : 3);
          break;
        }
        case 'fx':
          this.playSkillFx(ev);
          break;
        case 'sfx':
          this.audio.sfx(ev.name || ev.sound || 'ui');
          break;
        case 'xp': {
          const amount = Number(ev.amount) || 0;
          const foreign = (ev.ownerId && this.network.playerId && String(ev.ownerId) !== String(this.network.playerId)) ||
            (ev.ownerName && this.player && ev.ownerName !== this.player.name);
          if (foreign) break;
          if (amount > 0) {
            const x = Number.isFinite(ev.x) ? ev.x : (this.player ? this.player.x : 0);
            const y = Number.isFinite(ev.y) ? ev.y : (this.player ? this.player.y : 0);
            this.addFloater(x, y - 76, `+${amount} XP`, '#8ee6ff', 11);
          }
          break;
        }
        case 'level':
          this.log(`LEVEL UP! You are now level ${ev.level}.`, '#ffd75e');
          if (this.player) this.addFloater(this.player.x, this.player.y - 96, 'LEVEL UP!', '#ffd75e', 18);
          this.shake = Math.max(this.shake, 5);
          this.audio.sfx('level');
          break;
        case 'quest':
          this.log(ev.text || 'Quest updated.', '#8ee6ff');
          this.audio.sfx('pickup');
          break;
        case 'loot':
          this.log(`Loot: ${ev.name || 'item'} (${ev.rarity || 'common'})`, '#c9a6ff');
          this.audio.sfx('pickup');
          break;
        case 'party':
          this.log(ev.text || 'Party updated.', '#ffd75e');
          break;
        case 'death':
          this.log(ev.text || 'You died. Respawning...', '#ff9b9b');
          this.audio.sfx('hurt');
          break;
        case 'auctionList':
          this.networkData.auction = Array.isArray(ev.items) ? ev.items : [];
          break;
        case 'mailList':
          this.networkData.mail = Array.isArray(ev.items) ? ev.items : [];
          break;
        case 'shopList':
          if (Array.isArray(ev.items)) this.shopStock = ev.items.map(normalizeItem).filter(Boolean);
          break;
        case 'guildInfo': {
          const guild = ev.guild && typeof ev.guild === 'object'
            ? Object.assign({}, ev.guild) : { name: ev.guild || '' };
          guild.members = Array.isArray(ev.members) ? ev.members : (guild.members || []);
          guild.weeklyRaid = ev.weeklyRaid || guild.weeklyRaid || null;
          this.networkData.guild = guild;
          break;
        }
        default:
          if (ev.text) this.log(ev.text, ev.color || '#dbe6ff');
      }
    }

    // ---------- Starting, saving and loading ----------

    openLogin() {
      this.loginReturnState = this.state === 'login' ? this.loginReturnState : this.state;
      this.clearInput();
      this.network.connect();
      this.state = 'login';
      this.nameFocused = false;
      this.loginFields.active = 'username';
    }

    networkLogin(kind) {
      if (!this.network.connected) { this.log('Server not connected yet. Try again in a moment.', '#ff9b9b'); return; }
      const { username, password } = this.loginFields;
      if (!username || !password) { this.log('Enter both username and password.', '#ff9b9b'); return; }
      this.network.send({ type: kind, username, password, classId: this.selectedClass });
    }

    // ============================================================
    // UNIFIED REALM – seamless auto-connect flow
    // ============================================================

    _readSession() {
      try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        return data && data.username ? data : null;
      } catch { return null; }
    }

    _saveSession(username, password) {
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify({ username, password }));
        this.session = { username, password };
      } catch {}
    }

    _clearSession() {
      try { localStorage.removeItem(SESSION_KEY); } catch {}
      this.session = null;
    }

    _generatePassword() {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
      let pw = '';
      for (let i = 0; i < 20; i++) pw += chars[Math.floor(Math.random() * chars.length)];
      return pw;
    }

    // The single entry-point: class selected, name entered, hit PLAY.
    enterRealm() {
      this.audio.unlock();
      this.audio.setVolume(this.settings.volume);

      const session = this.session || this._readSession();
      const name = (this.nameInput || '').trim() || 'Hero';

      if (session) {
        // Returning player – auto-login with saved credentials
        this._pendingLogin = {
          username: session.username,
          password: session.password,
          classId: this.selectedClass,
          isReturning: true
        };
      } else {
        // New player – auto-register with the name they typed
        const password = this._generatePassword();
        this._pendingLogin = {
          username: name,
          password,
          classId: this.selectedClass,
          isReturning: false
        };
      }

      this.state = 'connecting';
      this.network.connect();

      // If already connected (socket reused), fire immediately
      if (this.network.connected) {
        this.onNetworkConnected();
        return;
      }

      // Fallback: if the server is unreachable after 5 seconds, start offline
      if (this._connectTimer) clearTimeout(this._connectTimer);
      this._connectTimer = setTimeout(() => {
        this._connectTimer = null;
        if (this.state === 'connecting') {
          this._pendingLogin = null;
          this._startOffline();
        }
      }, 5000);
    }

    onNetworkConnected() {
      if (this._connectTimer) { clearTimeout(this._connectTimer); this._connectTimer = null; }

      if (this._pendingLogin) {
        // Send auto-auth (server tries login first, then register)
        const p = this._pendingLogin;
        this.network.send({ type: 'auto', username: p.username, password: p.password, classId: p.classId });
      }
    }

    onNetworkDisconnected() {
      if (this.state === 'connecting') {
        // Connection dropped while trying to enter – fall back to offline
        this._pendingLogin = null;
        this._startOffline();
        return;
      }
      this.log('Disconnected from game server.', '#ff9b9b');
    }

    _startOffline() {
      this.log('⚠ Server unreachable – starting offline mode.', '#ffd75e');
      const spawn = ZONE_SPAWN.village;
      const name = (this.nameInput || '').trim() || 'Hero';
      this.player = new Player(this.selectedClass, name, spawn.x, spawn.y);
      this.pet = new Pet(spawn.x + 24, spawn.y + 18);
      this.quest = freshQuest();
      this.bossDefeated = false;
      this.zoneId = 'village';
      this.zone = this.zones.village;
      this.party = [];
      this.shopStock = makeShopStock(this.selectedClass);
      this.lockedTargetId = null;
      this.resetZoneActors();
      this.clearInput();
      this.state = 'playing';
      this.paused = false;
      this.panel = null;
      this.chatOpen = false;
      this.dayTime = 20;
      this.log(`Welcome, ${name}! (Offline Mode – connect to server for multiplayer)`, '#8ee6ff');
      this.save();
      this.startTutorialIfNeeded();
    }

    // Return from online play to the offline title without leaving a half-online state.
    leaveOnline() {
      if (this.network.online) this.network.send({ type: 'save' });
      this.clearInput();
      this.network.online = false;
      this.network.joined = false;
      this.network.token = '';
      this.network.playerId = null;
      this.network.players.clear();
      this.network.enemies.clear();
      this.network.projectiles.clear();
      this.network.pickups.clear();
      this.player = null;
      this.pet = null;
      this.party = [];
      this.networkData.guild = null;
      this.state = 'intro';
      this.paused = false;
      this.panel = null;
      this.chatOpen = false;
      this.textField = null;
      this.lockedTargetId = null;
    }

    readTutorialStatus() {
      try {
        return localStorage.getItem(TUTORIAL_KEY) === '1';
      } catch (err) {
        console.warn('[tutorial] Could not read completion status:', err);
        return false;
      }
    }

    startTutorial() {
      if (this.state !== 'playing') return;
      this.tutorialReturnPaused = this.paused;
      this.tutorialStep = 0;
      this.paused = false;
      this.panel = 'tutorial';
      this.clearInput();
      this.audio.sfx('ui');
    }

    startTutorialIfNeeded() {
      if (!this.tutorialDone) this.startTutorial();
    }

    previousTutorialStep() {
      this.tutorialStep = Math.max(0, this.tutorialStep - 1);
      this.audio.sfx('ui');
    }

    advanceTutorial() {
      if (this.tutorialStep < TUTORIAL_STEPS.length - 1) {
        this.tutorialStep++;
        this.audio.sfx('ui');
      } else {
        this.finishTutorial();
      }
    }

    finishTutorial() {
      this.tutorialDone = true;
      try {
        localStorage.setItem(TUTORIAL_KEY, '1');
      } catch (err) {
        console.warn('[tutorial] Could not save completion status:', err);
      }
      this.panel = null;
      this.paused = this.tutorialReturnPaused;
      this.clearInput();
      this.audio.sfx('ui');
    }

    showClassSelect() {
      this.audio.unlock();
      this.clearInput();
      this.nameFocused = false;
      this.state = 'select';
      this.audio.sfx('ui');
    }

    startNewGame() {
      // Unified flow: always try to enter the shared online realm first.
      this.enterRealm();
    }

    readSave() {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        return data && data.version === 1 ? data : null;
      } catch (err) {
        return null;
      }
    }

    save() {
      if (!this.player) return;
      const data = {
        version: 1,
        name: this.player.name,
        classId: this.player.classId,
        level: this.player.level,
        xp: this.player.xp,
        xpNext: this.player.xpNext,
        gold: this.player.gold,
        hp: this.player.hp,
        mp: this.player.mp,
        skillPoints: this.player.skillPoints,
        skillRanks: this.player.skillRanks,
        inventory: this.player.inventory,
        equipment: this.player.equipment,
        quest: this.quest,
        bossDefeated: this.bossDefeated,
        bossChest: this.pickups.find(pickup => pickup.kind === 'chest' && !pickup.collected)
          ? (() => {
            const chest = this.pickups.find(pickup => pickup.kind === 'chest' && !pickup.collected);
            return { x: chest.x, y: chest.y, item: chest.item };
          })()
          : null,
        zoneId: this.zoneId,
        x: this.player.x,
        y: this.player.y,
        volume: this.settings.volume,
        playTime: this.playTime,
        savedAt: Date.now()
      };
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(data));
        this.saveData = data;
      } catch (err) {
        this.log('Save failed (localStorage unavailable).', '#ff9b9b');
      }
    }

    loadGame() {
      const data = this.readSave();
      if (!data) { this.log('No saved game found.', '#ff9b9b'); return; }
      this.audio.unlock();
      const classId = CLASS_DATA[data.classId] ? data.classId : 'swordsman';
      this.zoneId = this.zones[data.zoneId] ? data.zoneId : 'forest';
      const fallback = ZONE_SPAWN[this.zoneId];
      const player = new Player(classId, data.name, Number.isFinite(data.x) ? data.x : fallback.x, Number.isFinite(data.y) ? data.y : fallback.y);
      player.level = Math.max(1, data.level || 1);
      player.xp = data.xp || 0;
      player.xpNext = data.xpNext || Math.floor(80 * Math.pow(player.level, 1.28));
      player.gold = data.gold || 0;
      player.skillPoints = data.skillPoints || 0;
      player.skillRanks = normalizeSkillRanks(data.skillRanks);
      player.inventory = Array.isArray(data.inventory) ? compactInventory(data.inventory.map(item => normalizeItem(item, classId)).filter(Boolean)) : [];
      const eq = data.equipment || {};
      player.equipment = {
        weapon: normalizeItem(eq.weapon, classId),
        armor: normalizeItem(eq.armor, classId)
      };
      if (!player.equipment.weapon || player.equipment.weapon.slot !== 'weapon') player.equipment.weapon = starterItems(classId).equipment.weapon;
      if (!player.equipment.armor || player.equipment.armor.slot !== 'armor') player.equipment.armor = starterItems(classId).equipment.armor;
      player.recalculateStats(false);
      player.hp = clamp(Number.isFinite(data.hp) ? data.hp : player.maxHp, 1, player.maxHp);
      player.mp = clamp(Number.isFinite(data.mp) ? data.mp : player.maxMp, 0, player.maxMp);
      this.player = player;
      this.pet = new Pet(player.x + 24, player.y + 18);
      const savedQuest = data.quest && typeof data.quest === 'object' ? data.quest : {};
      this.quest = normalizeQuestProgress(savedQuest);
      this.bossDefeated = !!data.bossDefeated;
      this.settings.volume = clamp(typeof data.volume === 'number' ? data.volume : 0.35, 0, 1);
      this.audio.setVolume(this.settings.volume);
      this.playTime = data.playTime || 0;
      this.shopStock = makeShopStock(classId);
      this.party = [];
      this.lockedTargetId = null;
      if (this.isBlocked(player.x, player.y, player.radius)) {
        player.x = fallback.x;
        player.y = fallback.y;
      }
      this.resetZoneActors();
      if (this.zoneId === 'cave' && this.bossDefeated && data.bossChest && data.bossChest.item) {
        this.pickups.push(new Pickup('chest', Number(data.bossChest.x) || player.x, Number(data.bossChest.y) || player.y,
          1, normalizeItem(data.bossChest.item)));
      }
      this.clearInput();
      this.state = 'playing';
      this.paused = false;
      this.panel = null;
      this.chatOpen = false;
      this.log('Game loaded. Welcome back!', '#8ee6ff');
      this.startTutorialIfNeeded();
    }

    resetZoneActors() {
      this.zone = this.zones[this.zoneId];
      this.lockedTargetId = null;
      this.enemies = [];
      this.pickups = [];
      this.projectiles = [];
      this.effects = [];
      this.floaters = [];
      this.pendingMeteors = [];
      this.portals = PORTAL_DEFS[this.zoneId].map(p => Object.assign({}, p, { radius: 30 }));
      this.npcs = this.zoneId === 'forest' ? NPC_DEFS.map(n => new Npc(n.type, n.name, n.x, n.y))
        : this.zoneId === 'village' ? VILLAGE_NPC_DEFS.map(n => new Npc(n.type, n.name, n.x, n.y)) : [];

      const counts = ZONE_ENEMY_COUNTS[this.zoneId];
      const mul = ZONE_MUL[this.zoneId];
      const spawn = ZONE_SPAWN[this.zoneId];
      for (const [type, count] of Object.entries(counts)) {
        const nearCount = Math.min(count, type === 'goblin' ? 2 : 4);
        for (let i = 0; i < count; i++) {
          const p = i < nearCount
            ? randomNearPoint(this.zone, this.zoneId, spawn.x, spawn.y, 220, 480)
            : randomFreePoint(this.zone, this.zoneId);
          this.enemies.push(new Enemy(type, p.x, p.y, mul));
        }
      }
      if (this.zoneId === 'cave' && !this.bossDefeated) {
        this.enemies.push(new Enemy('boss', BOSS_POS.x, BOSS_POS.y, 1));
      }
      this.enemySpawnTimer = 1.5;

      const around = this.player ? this.player : ZONE_SPAWN[this.zoneId];
      this.otherPlayers.forEach((op, i) => {
        const a = i / this.otherPlayers.length * TAU;
        op.x = clamp(around.x + Math.cos(a) * rand(90, 220), 40, this.zone.pixelW - 40);
        op.y = clamp(around.y + Math.sin(a) * rand(90, 220), 40, this.zone.pixelH - 40);
        op.alive = true;
        op.hp = op.maxHp;
        op.wander = { x: op.x, y: op.y };
      });
      this.party = this.party.filter(op => this.otherPlayers.includes(op));
      this.party.forEach((op, i) => { op.followIndex = i; });
      if (this.pet) { this.pet.x = around.x + 24; this.pet.y = around.y + 18; }
      this.buildMinimap();
    }

    spawnMonster(type, x, y, visual = false) {
      const enemy = new Enemy(type, x, y, ZONE_MUL[this.zoneId] || 1);
      this.enemies.push(enemy);
      if (visual) {
        const color = type === 'boss' ? '#ff8c42' : type === 'goblin' ? '#8fd66c' : '#7bdcff';
        this.effects.push(new Effect('ring', x, y - 8, { color, radius: 6, endRadius: 34, life: 0.4 }));
        for (let i = 0; i < 6; i++) {
          const a = i / 6 * TAU;
          this.effects.push(new Effect('particle', x, y - 8, {
            color, vx: Math.cos(a) * 70, vy: Math.sin(a) * 70, life: 0.35, size: 3
          }));
        }
      }
      return enemy;
    }

    // Keep the zone populated. Kills should open space for fresh monsters.
    maintainEnemyPopulation(dt) {
      this.enemySpawnTimer -= dt;
      if (this.enemySpawnTimer > 0) return;
      this.enemySpawnTimer = 1.6;
      const counts = ZONE_ENEMY_COUNTS[this.zoneId];
      if (!counts) return;
      const cx = this.player ? this.player.x : ZONE_SPAWN[this.zoneId].x;
      const cy = this.player ? this.player.y : ZONE_SPAWN[this.zoneId].y;
      for (const [type, target] of Object.entries(counts)) {
        const alive = this.enemies.filter(e => e.alive && e.type === type).length;
        const missing = target - alive;
        if (missing <= 0) continue;
        for (let i = 0; i < Math.min(missing, 2); i++) {
          const p = randomNearPoint(this.zone, this.zoneId, cx, cy, 220, 520);
          this.spawnMonster(type, p.x, p.y, true);
        }
      }
      if (this.zoneId === 'cave' && !this.bossDefeated &&
          !this.enemies.some(e => e.alive && e.type === 'boss')) {
        this.spawnMonster('boss', BOSS_POS.x, BOSS_POS.y, true);
      }
    }

    travelTo(portal) {
      this.zoneId = portal.to;
      this.zone = this.zones[this.zoneId];
      this.player.x = portal.arrive.x;
      this.player.y = portal.arrive.y;
      this.player.facing = 0;
      this.panel = null;
      this.clearInput();
      this.resetZoneActors();
      this.log(`Entered ${this.zone.name}!`, '#c9a6ff');
      this.audio.sfx('portal');
      this.save();
    }

    teleportToVillage() {
      if (!this.zones.village || this.zoneId === 'village') return false;
      this.travelTo({ to: 'village', arrive: ZONE_SPAWN.village });
      this.addFloater(this.player.x, this.player.y - 48, 'Teleported to Hearthvale', '#c9a6ff', 11);
      return true;
    }

    // ---------- Combat ----------

    damageEnemy(enemy, amount, source, crit = false, kind = 'hit', opts = {}) {
      if (!enemy || !enemy.alive) return;
      const dmg = Math.max(1, Math.round(amount));
      enemy.hp -= dmg;
      enemy.flash = 0.12;
      enemy.aggro = true;
      if (!enemy.target && source && source.alive) enemy.target = source;
      this.addFloater(enemy.x + rand(-6, 6), enemy.y - (enemy.type === 'boss' ? 58 : 36),
        crit ? `${dmg}!` : `${dmg}`, crit ? '#ffd75e' : kind === 'poison' ? '#8ee46d' : '#ffffff', crit ? 16 : 13);
      this.audio.sfx(crit ? 'crit' : 'hit');
      if (crit || dmg > 40) this.shake = Math.max(this.shake, crit ? 6 : 4);

      if (!opts.noStatus) {
        if (opts.slow) { enemy.slowTimer = Math.max(enemy.slowTimer, 2.5); enemy.slowFactor = 1 - opts.slow; }
        if (opts.poison) {
          enemy.poisonTimer = Math.max(enemy.poisonTimer, 4);
          enemy.poisonDps = Math.max(enemy.poisonDps, opts.poison);
          enemy.poisonSource = source;
        }
      }
      if (enemy.hp <= 0) this.killEnemy(enemy, source);
    }

    killEnemy(enemy, source) {
      enemy.hp = 0;
      enemy.alive = false;
      enemy.deathTimer = 0.5;
      if (source === this.player && this.quest.active) {
        if (this.quest.stage === 1 && this.zoneId === 'forest' && enemy.type === 'slime') this.quest.kills = Math.min(10, this.quest.kills + 1);
        if (this.quest.stage === 2 && this.zoneId === 'cave' && enemy.type === 'goblin') this.quest.goblins = Math.min(8, this.quest.goblins + 1);
        if (this.quest.stage === 3 && this.zoneId === 'desert' && enemy.type === 'scout') this.quest.scouts = Math.min(8, this.quest.scouts + 1);
        this.checkQuest();
      }
      // Fake players keep their own rewards; orphan loot would fall out of view.
      const giveDrops = !(source instanceof OtherPlayer);
      if (giveDrops) {
        this.showXpDrop(enemy.x, enemy.y, enemy.xpReward);
        this.pickups.push(new Pickup('xp', enemy.x + rand(-8, 8), enemy.y - 4, enemy.xpReward));
        this.pickups.push(new Pickup('gold', enemy.x + rand(-8, 8), enemy.y - 4, enemy.goldReward));
        if (enemy.type === 'slime' && Math.random() < 0.55) this.pickups.push(new Pickup('herb', enemy.x, enemy.y - 6));
        if (enemy.type === 'goblin' && Math.random() < 0.22) this.pickups.push(new Pickup('herb', enemy.x, enemy.y - 6));
        if (enemy.type === 'goblin' && Math.random() < 0.48) this.pickups.push(new Pickup('ore', enemy.x + 4, enemy.y - 6));
        if (this.quest.active && this.quest.stage === 3 && this.zoneId === 'desert' && Math.random() < 0.65) {
          this.pickups.push(new Pickup('essence', enemy.x + rand(-4, 4), enemy.y - 6));
        }
        if (enemy.type !== 'boss' && Math.random() < 0.12) {
          const item = randomMobItem(this.player ? this.player.classId : 'swordsman');
          this.pickups.push(new Pickup('item', enemy.x + rand(-6, 6), enemy.y - 6, 1, item));
          this.showItemDrop(enemy.x, enemy.y, item);
        }
      }
      if (enemy.type === 'boss') {
        this.bossDefeated = true;
        const rarity = Math.random() < 0.5 ? 'epic' : 'rare';
        const isWeapon = Math.random() < 0.6;
        const classWeapon = {
          swordsman: { name: 'Sovereign Blade', art: 'sword' },
          archer: { name: 'Sovereign Bow', art: 'bow' },
          mage: { name: 'Sovereign Staff', art: 'staff' }
        }[this.player.classId];
        const item = makeItem(
          isWeapon ? classWeapon.name : 'Boss-Slayer Charm',
          isWeapon ? 'weapon' : 'armor',
          rarity,
          rarity === 'epic' ? { attack: 14, hp: 30, defense: 6 } : { attack: 9, hp: 18, defense: 3 },
          { classId: this.player.classId, art: isWeapon ? classWeapon.art : 'armor', effect: pick(['flame', 'frost', 'void', 'thunder']), desc: 'Forged in the heart of the dungeon for your class.' }
        );
        this.pickups.push(new Pickup('chest', enemy.x, enemy.y, 1, item));
        this.audio.sfx('boss');
        this.shake = Math.max(this.shake, 16);
        this.log('The Cave Boss has fallen! A reward chest appeared nearby.', '#ffd75e');
        this.save();
      }
      if (source === this.player) this.playerInCombat = 3;
    }

    damageTarget(target, amount, source, kind) {
      if (!target || !target.alive) return;
      if (target instanceof Player) target.takeDamage(amount, this);
      else if (target instanceof OtherPlayer) target.takeDamage(amount, this);
    }

    areaDamage(x, y, radius, damage, source, kind, opts = {}) {
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const d = dist({ x, y }, e);
        if (d <= radius + e.radius) {
          const falloff = 1 - clamp(d / radius, 0, 1) * 0.35;
          this.damageEnemy(e, damage * falloff, source, false, kind, opts);
        }
      }
    }

    collectPickup(p) {
      if (p.collected) return;
      const pl = this.player;
      if (p.kind === 'item' && !pl.canAddItem(p.item)) {
        if (this.time - p.fullBagNoticeAt > 1.5) {
          this.addFloater(pl.x, pl.y - 42, 'Inventory full', '#ff9b9b', 10);
          p.fullBagNoticeAt = this.time;
        }
        return;
      }
      p.collected = true;
      if (p.kind === 'gold') {
        pl.gold += p.amount;
        this.addFloater(pl.x, pl.y - 46, `+${p.amount} gold`, '#ffd75e', 11);
      } else if (p.kind === 'xp') {
        pl.gainXp(p.amount, this);
      } else if (p.kind === 'herb') {
        if (this.quest.active && this.zoneId === 'forest' && this.quest.stage === 1 && this.quest.herbs < 5) {
          this.quest.herbs = Math.min(5, this.quest.herbs + 1);
          this.addFloater(pl.x, pl.y - 46, `Herb ${this.quest.herbs}/5`, '#8ee46d', 11);
          this.checkQuest();
        } else {
          this.addFloater(pl.x, pl.y - 46, 'Herb', '#8ee46d', 10);
        }
      } else if (p.kind === 'ore') {
        pl.materials.ore += 1;
        if (this.quest.active && this.zoneId === 'cave' && this.quest.stage === 2 && this.quest.ore < 4) {
          this.quest.ore = Math.min(4, this.quest.ore + 1);
          this.addFloater(pl.x, pl.y - 46, `Ore ${this.quest.ore}/4`, '#9ce7ff', 11);
          this.checkQuest();
        } else {
          this.addFloater(pl.x, pl.y - 46, 'Ore', '#9ce7ff', 10);
        }
      } else if (p.kind === 'essence') {
        pl.materials.essence += 1;
        if (this.quest.active && this.zoneId === 'desert' && this.quest.stage === 3 && this.quest.essence < 3) {
          this.quest.essence = Math.min(3, this.quest.essence + 1);
          this.addFloater(pl.x, pl.y - 46, `Essence ${this.quest.essence}/3`, '#d7b8ff', 11);
          this.checkQuest();
        } else {
          this.addFloater(pl.x, pl.y - 46, 'Essence', '#d7b8ff', 10);
        }
      } else {
        if (!pl.addItem(p.item)) { p.collected = false; return; }
        this.addFloater(pl.x, pl.y - 46, `Found ${p.item.name}`, RARITY[p.item.rarity].color, 11);
        if (p.item.rarity !== 'common') this.log(`You found a ${p.item.rarity} item: ${p.item.name}!`, RARITY[p.item.rarity].color);
        this.save();
      }
      this.audio.sfx('pickup');
    }

    // ---------- Interaction and UI actions ----------

    findInteractable() {
      if (!this.player) return null;
      let best = null;
      let bestD = 68;
      for (const chest of this.pickups) {
        if (!chest || chest.kind !== 'chest' || chest.collected || !this.canOpenBossChest(chest)) continue;
        const d = dist(this.player, chest);
        if (d < bestD) { best = { kind: 'chest', obj: chest }; bestD = d; }
      }
      for (const n of this.npcs) {
        const d = dist(this.player, n);
        if (d < bestD) { best = { kind: 'npc', obj: n }; bestD = d; }
      }
      for (const p of this.portals) {
        const d = dist(this.player, p);
        if (d < bestD) { best = { kind: 'portal', obj: p }; bestD = d; }
      }
      return best;
    }

    canOpenBossChest(chest) {
      const playerId = this.network.playerId;
      if (Array.isArray(chest.ownerIds) && chest.ownerIds.length &&
          !chest.ownerIds.some(id => String(id) === String(playerId))) return false;
      return !Array.isArray(chest.openedBy) ||
        !chest.openedBy.some(id => String(id) === String(playerId));
    }

    openBossChest(chest) {
      if (!chest || chest.kind !== 'chest' || !this.canOpenBossChest(chest)) return;
      if (this.network.online) {
        this.network.send({ type: 'openChest', id: chest.id });
        return;
      }
      if (dist(this.player, chest) >= 76) return;
      if (chest.item && !this.player.canAddItem(chest.item)) {
        this.log('Inventory is full. Make room before opening this chest.', '#ff9b9b');
        return;
      }
      chest.collected = true;
      const item = chest.item;
      if (item && this.player.addItem(item)) {
        this.addFloater(this.player.x, this.player.y - 46, `Found ${item.name}`, RARITY[item.rarity].color, 11);
        this.log(`Boss chest: ${item.name}!`, RARITY[item.rarity].color);
      } else {
        this.log('The chest has no reward item.', '#ffcf70');
      }
      this.audio.sfx('pickup');
      this.save();
    }

    interact() {
      const found = this.findInteractable();
      if (!found) return;
      if (found.kind === 'chest') {
        this.openBossChest(found.obj);
      } else if (found.kind === 'portal') {
        if (this.network.online) this.network.send({ type: 'interact' });
        else this.travelTo(found.obj);
      } else if (found.obj.type === 'shop') {
        this.panel = 'shop';
        this.audio.sfx('ui');
      } else if (found.obj.type === 'guard') {
        this.log('Village Guard: Three wardstones seal Mount Veyr. One is dark already; the forest road may hold the first clue.', '#9ce7ff');
        this.audio.sfx('ui');
      } else if (found.obj.type === 'healer') {
        this.log('Healer Liora: The herbs glow when the wardstones weaken. They may restore the first ward—and reveal what lies below.', '#a8f0cd');
        this.audio.sfx('ui');
      } else if (found.obj.type === 'scout') {
        this.log(this.quest.stage >= 3
          ? 'Scout Rowan: The Shards of the Dunes scouts carry purple seal-essence. Follow it back to Mount Veyr.'
          : 'Scout Rowan: I saw a cold light below Mount Veyr. The cave road is only the second part of the trail; it continues into the dunes.', '#c7e8ff');
        this.audio.sfx('ui');
      } else if (found.obj.type === 'blacksmith') {
        this.log('Blacksmith Borin: Goblins are mining the wardstone ore beneath the mountain. Bring some back and I can mend your gear.', '#ffc18b');
        this.audio.sfx('ui');
      } else if (found.obj.type === 'villager') {
        this.log('Farmer Pella: The slimes came when the first ward went dark. Elder Tarn says their trail leads to a much older secret.', '#f0d28e');
        this.audio.sfx('ui');
      } else {
        this.panel = 'quest';
        this.audio.sfx('ui');
      }
    }

    emote() {
      if (!this.player) return;
      if (this.network.online) { this.network.send({ type: 'emote' }); return; }
      this.player.emote = { text: pick(EMOTES), time: 2.2 };
      this.audio.sfx('ui');
    }

    inviteParty() {
      if (this.network.online) { this.network.send({ type: 'party' }); return; }
      let best = null;
      let bestD = 230;
      for (const op of this.otherPlayers) {
        if (op.party || !op.alive) continue;
        const d = dist(this.player, op);
        if (d < bestD) { best = op; bestD = d; }
      }
      if (!best) { this.log('No nearby player can join your party.', '#9aa6bd'); return; }
      if (this.party.length >= 3) { this.log('Your party is full (3 members).', '#ffd75e'); return; }
      best.party = true;
      best.followIndex = this.party.length;
      this.party.push(best);
      this.log(`${best.name} joined your party!`, '#ffd75e');
      this.audio.sfx('pickup');
    }

    leaveParty() {
      if (this.network.online) { this.network.send({ type: 'partyLeave' }); return; }
      if (!this.party.length) { this.log('You are not in a party.', '#9aa6bd'); return; }
      this.party.forEach(member => { member.party = false; });
      this.party = [];
      this.log('You left the party.', '#ffd75e');
    }

    disbandParty() {
      if (this.network.online) { this.network.send({ type: 'partyDisband' }); return; }
      if (!this.party.length) { this.log('You are not in a party.', '#9aa6bd'); return; }
      this.party.forEach(member => { member.party = false; });
      this.party = [];
      this.log('You disbanded the party.', '#ffd75e');
    }

    sendChat() {
      const text = this.chatInput.trim();
      this.chatOpen = false;
      this.chatInput = '';
      if (!text) return;
      if (this.network.online) this.network.send({ type: 'chat', text, channel: this.chatChannel || 'zone' });
      this.log(`[You] ${text}`, '#ffffff');
    }

    checkQuest() {
      const ready = this.quest.stage === 3
        ? this.quest.scouts >= 8 && this.quest.essence >= 3
        : this.quest.stage === 2
          ? this.quest.goblins >= 8 && this.quest.ore >= 4
          : this.quest.kills >= 10 && this.quest.herbs >= 5;
      if (this.quest.active && !this.quest.complete && ready) {
        this.quest.complete = true;
        this.log(`${questChapter(this.quest.stage).title} complete! Return to Elder Tarn.`, '#ffd75e');
        this.audio.sfx('level');
        this.save();
      }
    }

    acceptQuest() {
      if (this.network.online) { this.network.send({ type: 'questAccept' }); return; }
      if (this.quest.claimed) return;
      if (this.quest.complete) { this.turnInQuest(); return; }
      if (this.quest.active) {
        this.log('Quest already accepted. Finish the objectives and turn it in for your reward.', '#ffcf70');
        return;
      }
      this.quest.active = true;
      const chapter = questChapter(this.quest.stage);
      const opening = this.quest.stage === 1
        ? 'Elder Tarn: The seal has cracked. The forest wards are our first defense.'
        : this.quest.stage === 2
          ? 'Elder Tarn: The herbs revealed a map to a buried gate beneath Mount Veyr.'
          : 'Elder Tarn: The repaired ward showed us the truth. The desert scouts carry the missing seal-essence.';
      this.log(`${chapter.title} — ${opening} ${chapter.objective}`, '#ffd75e');
      this.save();
    }

    turnInQuest() {
      if (this.network.online) { this.network.send({ type: 'questTurnIn' }); this.panel = null; return; }
      if (!this.quest.complete || this.quest.claimed) return;
      if (this.quest.stage < 3) {
        const completedStage = this.quest.stage;
        const rewards = completedStage === 1 ? { gold: 100, xp: 180 } : { gold: 140, xp: 260 };
        this.quest.stage++;
        this.quest.active = false;
        this.quest.complete = false;
        this.quest.kills = 0;
        this.quest.herbs = 0;
        this.quest.goblins = 0;
        this.quest.ore = 0;
        this.quest.scouts = 0;
        this.quest.essence = 0;
        this.player.gold += rewards.gold;
        this.player.gainXp(rewards.xp, this);
        const nextChapter = questChapter(this.quest.stage);
        this.log(`${questChapter(completedStage).title} complete! +${rewards.gold} gold, +${rewards.xp} XP. ${nextChapter.title} unlocked.`, '#ffd75e');
        this.audio.sfx('level');
        this.panel = null;
        this.save();
        return;
      }
      this.quest.claimed = true;
      this.quest.active = false;
      const reward = makeItem('Elder Amulet', 'armor', 'epic', { hp: 30, defense: 6, mana: 20, manaRegen: 1 }, {
        classId: this.player.classId, spriteColor: '#e3b7ff', icon: 'A', desc: 'A wardstone relic earned by restoring Hearthvale’s seal.'
      });
      if (!this.player.addItem(reward)) this.player.gold += 60;
      this.player.gold += 220;
      this.player.gainXp(420, this);
      this.log('Shards of the Dunes complete! The wardstones shine again, and the cold light beneath Mount Veyr fades. +220 gold, +420 XP, epic reward.', '#ffd75e');
      this.audio.sfx('level');
      this.panel = null;
      this.save();
    }

    buyShopItem(index) {
      if (this.network.online) { this.network.send({ type: 'shopBuy', index }); return; }
      const item = this.shopStock[index];
      if (!item || !this.player) return;
      if (this.player.gold < item.price) { this.log('Not enough gold.', '#ff9b9b'); return; }
      if (!this.player.addItem(item)) { this.log('Inventory is full!', '#ff9b9b'); return; }
      this.player.gold -= item.price;
      this.shopStock[index] = randomShopItem(index, this.player.classId);
      this.log(`Bought ${item.name} for ${item.price} gold.`, RARITY[item.rarity].color);
      this.audio.sfx('pickup');
      this.save();
    }

    upgradeSkill(index) {
      if (this.network.online) { this.network.send({ type: 'skillUp', index }); return; }
      const p = this.player;
      if (!p || p.skillPoints <= 0) { this.log('No skill points available.', '#ff9b9b'); return; }
      if (p.skillRanks[index] >= 5) { this.log('Skill already at max rank.', '#ff9b9b'); return; }
      p.skillPoints--;
      p.skillRanks[index]++;
      const def = SKILLS[p.classId][index];
      this.log(`${def.name} upgraded to rank ${p.skillRanks[index]}!`, '#8ee6ff');
      this.audio.sfx('level');
      this.save();
    }

    upgradeTalent(id) {
      const p = this.player;
      const talent = TALENTS.find(entry => entry.id === id);
      if (!p || !talent) return;
      if (p.skillPoints < 1) { this.log('No skill points available.', '#ff9b9b'); return; }
      const rank = Number((p.talents || {})[id]) || 0;
      if (rank >= 3) { this.log('That talent is already maxed.', '#ffcf70'); return; }
      p.talents = Object.assign({ power: 0, haste: 0, vigor: 0, crit: 0, guard: 0, focus: 0 }, p.talents || {});
      p.skillPoints--;
      p.talents[id] = rank + 1;
      p.recalculateStats();
      this.log(`${talent.name} upgraded to rank ${p.talents[id]}!`, '#c9a6ff');
      this.audio.sfx('level');
      this.save();
    }

    chooseSpecialization(specId) {
      const p = this.player;
      if (!p) return;
      const spec = (SPECS[p.classId] || []).find(entry => entry.id === specId);
      if (!spec) { this.log('That specialization is not available to your class.', '#ff9b9b'); return; }
      if (p.level < 10) { this.log('Specializations unlock at level 10.', '#ffcf70'); return; }
      if (p.spec) { this.log('You already chose a specialization.', '#ffcf70'); return; }
      p.spec = spec.id;
      p.recalculateStats();
      this.log(`You specialized as ${spec.id}!`, '#ffd75e');
      this.audio.sfx('level');
      this.save();
    }

    useConsumable() {
      const p = this.player;
      if (!p) return;
      const selected = p.inventory.find(item => item.uid === this.selectedItemUid && item.slot === 'consumable');
      if (this.network.online) {
        if (selected) this.network.send({ type: 'usePotion', uid: selected.uid });
        else this.network.send({ type: 'potion' });
        return;
      }
      let index = selected ? p.inventory.indexOf(selected)
        : p.inventory.findIndex(item => item.slot === 'consumable' && item.heal > 0);
      if (index < 0) index = p.inventory.findIndex(item => item.slot === 'consumable' && item.teleportTo);
      if (index >= 0) p.usePotion(index, this);
    }

    quickUseItem(item, source) {
      const p = this.player;
      if (!p) return;
      if (source.type === 'inv' && (item.slot === 'weapon' || item.slot === 'armor') && !itemCanEquip(item, p.classId)) {
        this.addFloater(p.x, p.y - 40, `${CLASS_DATA[item.classId]?.name || 'Other class'} only`, '#ff9b9b', 10);
        return;
      }
      if (this.network.online) {
        if (item.slot === 'consumable') this.network.send({ type: 'usePotion', uid: item.uid });
        else if (source.type === 'equip') this.network.send({ type: 'unequip', slot: source.slot });
        else if (source.type === 'inv' && VALID_EQUIP_SLOTS.includes(item.slot)) {
          this.network.send({ type: 'equip', uid: item.uid, slot: item.slot });
        }
        return;
      }
      if (item.slot === 'consumable') {
        const idx = p.inventory.findIndex(it => it.uid === item.uid);
        if (idx >= 0) p.usePotion(idx, this);
      } else if (source.type === 'equip') {
        if (p.addItem(item)) {
          p.equipment[source.slot] = null;
          p.recalculateStats();
          this.save();
        }
      } else if (source.type === 'inv' && (item.slot === 'weapon' || item.slot === 'armor')) {
        this.dropItem({ item, from: source }, { type: 'equip', slot: item.slot });
      }
    }

    dropItem(drag, target) {
      const p = this.player;
      if (!p) return;
      const item = drag.item;
      if (this.network.online) {
        if (target.type === 'equip' && drag.from.type === 'inv') {
          if (item.slot !== target.slot) { this.addFloater(p.x, p.y - 40, 'Wrong slot', '#ff9b9b', 10); return; }
          if (!itemCanEquip(item, p.classId)) {
            this.addFloater(p.x, p.y - 40, `${CLASS_DATA[item.classId]?.name || 'Other class'} only`, '#ff9b9b', 10);
            return;
          }
          this.network.send({ type: 'equip', uid: item.uid, slot: target.slot });
        }
        else if (target.type === 'inv' && drag.from.type === 'equip') this.network.send({ type: 'unequip', slot: drag.from.slot });
        // Bag-to-bag order is cosmetic; the server keeps the same items in the same bag.
        return;
      }
      if (target.type === 'equip') {
        if (item.slot !== target.slot) { this.addFloater(p.x, p.y - 40, 'Wrong slot', '#ff9b9b', 10); return; }
        if (!itemCanEquip(item, p.classId)) {
          this.addFloater(p.x, p.y - 40, `${CLASS_DATA[item.classId]?.name || 'Other class'} only`, '#ff9b9b', 10);
          return;
        }
        if (drag.from.type === 'equip') return; // Already equipped in the correct slot.
        const idx = p.inventory.findIndex(it => it.uid === item.uid);
        if (idx < 0) return;
        const old = p.equipment[target.slot];
        p.inventory.splice(idx, 1);
        p.equipment[target.slot] = item;
        if (old) p.addItem(old);
      } else if (target.type === 'inv') {
        if (drag.from.type === 'inv' && drag.from.index === target.index) return;
        if (drag.from.type === 'inv') {
          // Bag-to-bag is a simple swap, including empty target cells.
          const idx = p.inventory.findIndex(it => it.uid === item.uid);
          if (idx < 0 || idx === target.index) return;
          const oldTarget = p.inventory[target.index] || null;
          p.inventory[target.index] = item;
          p.inventory[idx] = oldTarget;
        } else {
          // Equipment-to-bag: unequip into the chosen cell.
          p.equipment[drag.from.slot] = null;
          const oldTarget = p.inventory[target.index] || null;
          p.inventory[target.index] = item;
          if (oldTarget) {
            if (oldTarget.slot === drag.from.slot) p.equipment[drag.from.slot] = oldTarget;
            else if (!p.addItem(oldTarget)) {
              // No room: put everything back where it came from.
              p.equipment[drag.from.slot] = item;
              p.inventory[target.index] = oldTarget;
              this.addFloater(p.x, p.y - 40, 'No room!', '#ff9b9b', 10);
              return;
            }
          }
        }
      }
      p.recalculateStats();
      this.audio.sfx('ui');
      this.save();
    }

    handleAction(action) {
      if (action.startsWith('claimAch:')) {
        const id = action.slice(9);
        if (this.network.online) this.network.send({ type: 'claim_achievement', id });
        return;
      }
      if (action.startsWith('claimDaily:')) {
        const id = action.slice(11);
        if (this.network.online) this.network.send({ type: 'claim_daily', id });
        return;
      }
      if (action.startsWith('setLeadTab:')) {
        this.leaderboardTab = action.slice(11);
        if (this.network.online) this.network.send({ type: 'get_leaderboard', category: this.leaderboardTab });
        return;
      }
      if (action.startsWith('selectPet:')) {
        const type = action.slice(10);
        if (this.network.online) this.network.send({ type: 'pet_select', petType: type });
        else if (this.player) this.player.pet = { type, name: type, level: 1 };
        return;
      }
      if (action.startsWith('select:')) {
        this.selectedClass = action.split(':')[1];
        this.nameFocused = false;
        return;
      }
      if (action.startsWith('focusText:')) {
        this.textField = action.slice(10);
        this.clearInput();
        if (this.textField === 'loginUser') this.loginFields.active = 'username';
        if (this.textField === 'loginPass') this.loginFields.active = 'password';
        if (this.state === 'login') this.syncNativeTextInputOverlay(true);
        return;
      }
      if (action.startsWith('selectItem:')) {
        const item = this.player && this.player.inventory[Number(action.slice(11))];
        if (item) {
          this.selectedItemUid = item.uid;
          this.audio.sfx('ui');
        }
        return;
      }
      this.textField = null;
      // Button actions intentionally release the mobile keyboard. Text field
      // taps take the early return above and keep native focus pinned.
      this.nativeInputKeepFocus = false;
      if (document.activeElement === this.nativeTextInput) this.nativeTextInput.blur();
      if (action !== 'toggleMobileMenu') this.mobileMenuOpen = false;
      if (/^skill[0-3]$/.test(action)) {
        const i = parseInt(action.slice(5), 10);
        this.activateSkill(i);
        return;
      }
      if (action.startsWith('shopBuy')) { this.buyShopItem(parseInt(action.slice(7), 10)); return; }
      if (action.startsWith('upgrade')) { this.upgradeSkill(parseInt(action.slice(7), 10)); return; }
      if (action.startsWith('auctionBuy:')) { this.network.send({ type: 'auctionBuy', id: Number(action.split(':')[1]) }); return; }
      if (action.startsWith('auctionRemove:')) { this.network.send({ type: 'auctionRemove', id: Number(action.split(':')[1]) }); return; }
      if (action.startsWith('mailTake:')) { this.network.send({ type: 'mailTake', id: Number(action.split(':')[1]) }); return; }
      if (action.startsWith('craft:')) { this.network.send({ type: 'craft', recipe: action.split(':')[1] }); return; }
      if (action.startsWith('talent:')) {
        const id = action.split(':')[1];
        if (this.network.online) this.network.send({ type: 'talent', id }); else this.upgradeTalent(id);
        return;
      }
      if (action.startsWith('spec:')) {
        const spec = action.split(':')[1];
        if (this.network.online) this.network.send({ type: 'spec', spec }); else this.chooseSpecialization(spec);
        return;
      }

      switch (action) {
        case 'beginStory': this.showClassSelect(); break;
        case 'continueFromIntro': this.loadGame(); break;
        case 'backToIntro': this.state = 'intro'; this.nameFocused = false; break;
        case 'start': this.startNewGame(); break;
        case 'continue': this.loadGame(); break;
        case 'focusName':
          this.nameFocused = true;
          this.syncNativeTextInputOverlay(true);
          break;
        case 'openLogin': this.openLogin(); break;
        case 'switchAccount':
          this._clearSession();
          this.openLogin();
          break;
        case 'loginBack': this.state = this.loginReturnState; break;
        case 'loginUser':
          this.loginFields.active = 'username';
          this.syncNativeTextInputOverlay(true);
          break;
        case 'loginPass':
          this.loginFields.active = 'password';
          this.syncNativeTextInputOverlay(true);
          break;
        case 'login': this.networkLogin('login'); break;
        case 'register': this.networkLogin('register'); break;
        case 'attack':
          if (this.network.online) {
            this.acquireAutoLockTarget();
            this.network.send({ type: 'attack', lockTargetId: this.lockedTargetId });
          }
          else this.player && this.player.attack(this);
          break;
        case 'lockTarget': this.toggleLockTarget(); break;
        case 'toggleMobileMenu':
          this.mobileMenuOpen = !this.mobileMenuOpen;
          this.audio.sfx('ui');
          break;
        case 'closeMobileMenu': this.mobileMenuOpen = false; break;
        case 'openAccount':
          this.panel = 'account';
          this.paused = false;
          this.mobileMenuOpen = false;
          this.accountPasswordInput = '';
          this.showAccountPassword = false;
          this.clearInput();
          this.audio.sfx('ui');
          break;
        case 'toggleShowPassword':
          this.showAccountPassword = !this.showAccountPassword;
          this.audio.sfx('ui');
          break;
        case 'savePassword':
          if (!this.network.online) {
            this.log('Must be connected online to change password.', '#ff9b9b');
            return;
          }
          if (this.accountPasswordInput.trim().length < 4) {
            this.log('Password must be at least 4 characters.', '#ff9b9b');
            return;
          }
          this.network.send({ type: 'setPassword', password: this.accountPasswordInput.trim() });
          break;
        case 'settings': this.paused = true; this.clearInput(); this.audio.sfx('ui'); break;
        case 'interact': this.interact(); break;
        case 'emote': this.emote(); break;
        case 'party': this.inviteParty(); break;
        case 'partyLeave': this.leaveParty(); break;
        case 'partyDisband': this.disbandParty(); break;
        case 'potion':
          this.useConsumable();
          break;
        case 'chat':
          this.chatMinimized = false;
          this.chatOpen = true;
          this.chatInput = '';
          break;
        case 'chatZone':
          this.chatMinimized = false;
          this.chatChannel = 'zone';
          this.chatOpen = true;
          break;
        case 'chatGuild':
          this.chatMinimized = false;
          this.chatChannel = 'guild';
          this.chatOpen = true;
          break;
        case 'toggleChat':
          this.chatMinimized = !this.chatMinimized;
          if (this.chatMinimized) this.chatOpen = false;
          break;
        case 'openInventory': this.panel = 'inventory'; break;
        case 'openSkills': this.panel = 'skills'; break;
        case 'openAchievements': this.panel = 'achievements'; break;
        case 'openDaily': this.panel = 'daily'; break;
        case 'openLeaderboardModal': this.panel = 'leaderboardModal'; if (this.network.online) this.network.send({ type: 'get_leaderboard', category: 'level' }); break;
        case 'openPets': this.panel = 'pets'; break;
        case 'tradeLock': if (this.network.online) this.network.send({ type: 'trade_lock' }); break;
        case 'tradeConfirm': if (this.network.online) this.network.send({ type: 'trade_confirm' }); break;
        case 'tradeCancel': if (this.network.online) this.network.send({ type: 'trade_cancel' }); this.panel = null; break;
        case 'openAuction': this.panel = 'auction'; if (this.network.online) this.network.send({ type: 'auctionList' }); break;
        case 'openMail': this.panel = 'mail'; if (this.network.online) this.network.send({ type: 'mailList' }); break;
        case 'openGuild': this.panel = 'guild'; if (this.network.online) this.network.send({ type: 'guildInfo' }); break;
        case 'openCraft': this.panel = 'craft'; break;
        case 'openTalents': this.panel = 'talents'; break;
        case 'openQuest': this.panel = 'quest'; break;
        case 'equipSelectedItem': {
          const item = this.player && this.player.inventory.find(it => it.uid === this.selectedItemUid);
          if (!item || !VALID_EQUIP_SLOTS.includes(item.slot)) {
            this.log('Select a weapon or armor in your bag first.', '#ffcf70');
            break;
          }
          if (!itemCanEquip(item, this.player.classId)) {
            this.log(`${CLASS_DATA[item.classId]?.name || 'Another class'} can equip this item.`, '#ff9b9b');
            break;
          }
          this.quickUseItem(item, { type: 'inv' });
          this.selectedItemUid = null;
          break;
        }
        case 'sellSelectedItem': {
          const item = this.player && this.player.inventory.find(it => it.uid === this.selectedItemUid);
          if (!item) { this.log('Select an item in your bag to sell.', '#ffcf70'); break; }
          if (this.network.online) {
            this.network.send({ type: 'sellItem', uid: item.uid });
          } else {
            const value = itemSellValue(item);
            this.player.inventory = this.player.inventory.filter(it => it.uid !== item.uid);
            this.player.gold += value;
            this.addFloater(this.player.x, this.player.y - 44, `+${value} gold`, '#ffd75e', 12);
            this.log(`Sold ${item.name} for ${value} gold.`, '#ffd75e');
            this.audio.sfx('pickup');
            this.save();
          }
          this.selectedItemUid = null;
          break;
        }
        case 'discardSelectedItem': {
          const item = this.player && this.player.inventory.find(it => it.uid === this.selectedItemUid);
          if (!item) { this.log('Select an item in your bag to discard.', '#ffcf70'); break; }
          if (this.network.online) {
            this.network.send({ type: 'discardItem', uid: item.uid });
          } else {
            this.player.inventory = this.player.inventory.filter(it => it.uid !== item.uid);
            this.log(`Discarded ${item.name}.`, '#9fb0cd');
            this.audio.sfx('ui');
            this.save();
          }
          this.selectedItemUid = null;
          break;
        }
        case 'closePanel': this.panel = null; break;
        case 'enterDungeon': if (this.network.online) this.network.send({ type: 'dungeon' }); break;
        case 'leaveDungeon': if (this.network.online) this.network.send({ type: 'leaveDungeon' }); break;
        case 'auctionAdd': {
          const item = this.selectedInventoryItem();
          if (item) this.network.send({ type: 'auctionAdd', item, price: Math.max(1, Number(this.actionText) || 10) });
          break;
        }
        case 'auctionRefresh': this.network.send({ type: 'auctionList' }); break;
        case 'mailSend': {
          const item = this.selectedInventoryItem();
          this.network.send({ type: 'mailSend', to: this.actionText, item, gold: Math.max(0, Number(this.actionGold) || 0), message: this.actionMessage || '' });
          this.actionText = '';
          break;
        }
        case 'mailRefresh': this.network.send({ type: 'mailList' }); break;
        case 'guildCreate': this.network.send({ type: 'guildCreate', name: this.actionText || 'Pixel Guild' }); this.actionText = ''; break;
        case 'guildJoin': this.network.send({ type: 'guildJoin', name: this.actionText }); this.actionText = ''; break;
        case 'guildLeave': this.network.send({ type: 'guildLeave' }); break;
        case 'guildRefresh': this.network.send({ type: 'guildInfo' }); break;
        case 'enchant': {
          const item = this.selectedInventoryItem();
          if (item) this.network.send({ type: 'enchant', uid: item.uid });
          break;
        }
        case 'questAccept': this.acceptQuest(); break;
        case 'questTurnIn': this.turnInQuest(); break;
        case 'tutorialBack': this.previousTutorialStep(); break;
        case 'tutorialNext': this.advanceTutorial(); break;
        case 'tutorialSkip': this.finishTutorial(); break;
        case 'openTutorial': this.startTutorial(); break;
        case 'resume': this.paused = false; break;
        case 'save':
          if (this.network.online) this.network.send({ type: 'save' });
          else this.save();
          this.log('Game saved.', '#8ee6ff');
          break;
        case 'load':
          if (this.network.online) this.log('Online progress is loaded from the server at login.', '#8ee6ff');
          else this.loadGame();
          break;
        case 'quitToSelect':
          if (this.network.online) this.leaveOnline();
          else { this.save(); this.state = 'intro'; this.paused = false; this.panel = null; }
          break;
        case 'volumeDown': this.changeVolume(-0.05); break;
        case 'volumeUp': this.changeVolume(0.05); break;
      }
      if (this.panel || this.chatOpen || this.textField) this.clearInput();
    }

    selectedInventoryItem() {
      if (!this.player) return null;
      if (this.selectedItemUid) {
        const found = this.player.inventory.find(it => it.uid === this.selectedItemUid);
        if (found) return found;
      }
      return this.player.inventory[0] || null;
    }

    // ---------- Main update loop ----------

    update(dt) {
      this.time += dt;
      this.dayTime = (this.dayTime + dt) % DAY_LENGTH;
      this.shake = Math.max(0, this.shake - dt * 16);
      this.playerInCombat = Math.max(0, this.playerInCombat - dt);
      if (this.state !== 'playing' || this.paused || this.panel) return;
      if (!this.player) return;
      this.updateLockTarget();

      if (this.network.online) {
        this.updateNetwork(dt);
        for (const e of this.effects) e.update(dt);
        for (const f of this.floaters) f.update(dt);
        this.effects = this.effects.filter(e => e.life > 0);
        this.floaters = this.floaters.filter(f => f.life > 0);
        return;
      }

      this.playTime += dt;
      this.player.update(dt, this);
      if (this.pet) this.pet.update(dt, this);
      for (const e of this.enemies) e.update(dt, this);
      for (const op of this.otherPlayers) op.update(dt, this);
      for (const pr of this.projectiles) pr.update(dt, this);
      for (const p of this.pickups) if (!p.collected) p.update(dt, this);
      for (const e of this.effects) e.update(dt);
      for (const f of this.floaters) f.update(dt);

      // Delayed meteor explosions (STAGE 2).
      for (let i = this.pendingMeteors.length - 1; i >= 0; i--) {
        const m = this.pendingMeteors[i];
        m.timer -= dt;
        if (m.timer <= 0) {
          this.areaDamage(m.x, m.y, m.radius, m.damage, m.owner, 'meteor');
          this.effects.push(new Effect('ring', m.x, m.y, { color: '#ff7a3c', radius: 12, endRadius: m.radius, life: 0.5 }));
          for (let k = 0; k < 18; k++) {
            const a = rand(0, TAU);
            this.effects.push(new Effect('particle', m.x, m.y, {
              color: k % 2 ? '#ff8c42' : '#ffd166', vx: Math.cos(a) * rand(60, 190), vy: Math.sin(a) * rand(60, 190), life: 0.55
            }));
          }
          this.shake = Math.max(this.shake, 12);
          this.audio.sfx('boss');
          this.pendingMeteors.splice(i, 1);
        }
      }

      this.enemies = this.enemies.filter(e => e.alive || e.deathTimer > 0);
      this.projectiles = this.projectiles.filter(p => !p.dead);
      this.pickups = this.pickups.filter(p => !p.collected && p.age < 90);
      this.effects = this.effects.filter(e => e.life > 0);
      this.floaters = this.floaters.filter(f => f.life > 0);
      this.maintainEnemyPopulation(dt);

      this.fakeChatTimer -= dt;
      if (this.fakeChatTimer <= 0) {
        const op = pick(this.otherPlayers);
        this.log(`[${op.name}] ${pick(FAKE_LINES)}`, '#b9d9ff');
        this.fakeChatTimer = rand(8, 15);
      }

      this.autoSaveTimer += dt;
      if (this.autoSaveTimer > 15) { this.autoSaveTimer = 0; this.save(); }
    }

    // ---------- Rendering helpers: world + HUD ----------

    updateCamera() {
      if (!this.player) return;
      this.camX = clamp(this.player.x - VIEW_W / 2, 0, Math.max(0, this.zone.pixelW - VIEW_W));
      this.camY = clamp(this.player.y - VIEW_H / 2, 0, Math.max(0, this.zone.pixelH - VIEW_H));
    }

    button(x, y, w, h, label, action, opts = {}) {
      const ctx = this.ctx;
      const hover = this.pointer.x >= x && this.pointer.x <= x + w && this.pointer.y >= y && this.pointer.y <= y + h;
      ctx.save();
      ctx.shadowColor = hover ? 'rgba(255,215,94,0.28)' : 'rgba(0,0,0,0.32)';
      ctx.shadowBlur = hover ? 8 : 3;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = 'rgba(0,0,0,0.48)';
      ctx.fillRect(x + 1, y + 2, w, h);
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.fillStyle = opts.color || '#59432c';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = hover ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)';
      ctx.fillRect(x + 1, y + 1, w - 2, Math.max(2, Math.min(4, h * 0.18)));
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      ctx.fillRect(x + 1, y + h - 3, w - 2, 2);
      ctx.strokeStyle = hover ? '#f0ce84' : (opts.border || '#c7a263');
      ctx.lineWidth = hover ? 1.5 : 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.fillStyle = opts.textColor || '#fff';
      ctx.font = `bold ${opts.fontSize || 12}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.65)';
      ctx.shadowBlur = 2;
      ctx.fillText(label, x + w / 2, y + h / 2 + 0.5);
      ctx.restore();
      this.clickRegions.push({ x, y, w, h, action });
    }

    // Small reusable on-canvas input used by the online panels.
    drawTextField(x, y, w, h, label, value, focusName, maxLen = 60) {
      const ctx = this.ctx;
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#9fb0cd';
      ctx.fillText(label, x, y - 5);
      const active = this.textField === focusName;
      ctx.fillStyle = '#0c1220';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = active ? '#ffd75e' : '#7d89a8';
      ctx.lineWidth = active ? 2 : 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.fillStyle = '#fff';
      const caret = active && Math.floor(this.time * 2) % 2 ? '_' : '';
      ctx.fillText(String(value || '').slice(-maxLen) + caret, x + 6, y + h / 2 + 3);
      this.clickRegions.push({ x, y, w, h, action: 'focusText:' + focusName });
    }

    render() {
      const ctx = this.ctx;
      this.syncNativeTextInputOverlay();
      ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
      ctx.clearRect(0, 0, VIEW_W, VIEW_H);
      this.clickRegions = [];
      this.dropRegions = [];

      if (this.state === 'intro') {
        this.drawIntroScreen();
        this.drawDraggedItem();
        return;
      }
      if (this.state === 'select') {
        this.drawSelectScreen();
        this.drawDraggedItem();
        return;
      }
      if (this.state === 'connecting') {
        this.drawConnectingScreen();
        return;
      }
      if (this.state === 'login') {
        this.drawLoginScreen();
        this.drawDraggedItem();
        return;
      }

      this.updateCamera();
      this.drawWorld();
      this.drawDayNight();
      this.drawWorldAtmosphere();
      this.drawHUD();
      this.drawBossBar();
      this.drawHotbar();
      this.drawQuestTracker();
      this.drawParty();
      this.drawMinimap();
      this.drawLeaderboard();
      this.drawChat();
      this.drawPrompt();

      if (this.panel === 'tutorial') this.drawTutorialPanel();
      else if (this.panel === 'inventory') this.drawInventoryPanel();
      else if (this.panel === 'skills') this.drawSkillsPanel();
      else if (this.panel === 'shop') this.drawShopPanel();
      else if (this.panel === 'quest') this.drawQuestPanel();
      else if (this.panel === 'auction') this.drawAuctionPanel();
      else if (this.panel === 'mail') this.drawMailPanel();
      else if (this.panel === 'guild') this.drawGuildPanel();
      else if (this.panel === 'craft') this.drawCraftPanel();
      else if (this.panel === 'talents') this.drawTalentsPanel();
      else if (this.panel === 'achievements') this.drawAchievementsPanel();
      else if (this.panel === 'daily') this.drawDailyPanel();
      else if (this.panel === 'leaderboardModal') this.drawLeaderboardModalPanel();
      else if (this.panel === 'trade') this.drawTradePanel();
      else if (this.panel === 'pets') this.drawPetsPanel();
      else if (this.panel === 'account') this.drawAccountPanel();

      if (this.paused) this.drawPauseMenu();
      if (this.input.mobile && !this.paused && !this.panel) {
        if (this.mobileMenuOpen) this.drawMobileMenu();
        else this.drawMobileControls();
      }
      this.drawSkillTargetHint();
      this.drawDraggedItem();
    }

    drawWorld() {
      const ctx = this.ctx;
      const shakeX = this.shake > 0 ? rand(-this.shake, this.shake) : 0;
      const shakeY = this.shake > 0 ? rand(-this.shake, this.shake) : 0;
      this.shakeX = shakeX;
      this.shakeY = shakeY;
      ctx.save();
      ctx.translate(-this.camX + shakeX, -this.camY + shakeY);

      // Render boss & elite attack telegraph indicators
      if (this.telegraphs && this.telegraphs.length > 0) {
        for (let i = this.telegraphs.length - 1; i >= 0; i--) {
          const t = this.telegraphs[i];
          t.time -= this.dt || 0.05;
          if (t.time <= 0) { this.telegraphs.splice(i, 1); continue; }
          const progress = 1 - (t.time / t.duration);
          ctx.save();
          ctx.strokeStyle = t.color || '#ff3838';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(t.x, t.y, t.r, 0, TAU);
          ctx.stroke();
          ctx.fillStyle = (t.color || '#ff3838') + '33';
          ctx.beginPath();
          ctx.arc(t.x, t.y, t.r * progress, 0, TAU);
          ctx.fill();
          ctx.restore();
        }
      }

      const sx = Math.max(0, Math.floor(this.camX / TILE));
      const sy = Math.max(0, Math.floor(this.camY / TILE));
      const ex = Math.min(this.zone.w - 1, Math.floor((this.camX + VIEW_W) / TILE));
      const ey = Math.min(this.zone.h - 1, Math.floor((this.camY + VIEW_H) / TILE));
      for (let ty = sy; ty <= ey; ty++) {
        for (let tx = sx; tx <= ex; tx++) {
          const id = this.zone.tiles[ty * this.zone.w + tx];
          const houseTile = this.zoneId === 'village' &&
            (id === TILE_ID.HOUSE_ROOF || id === TILE_ID.HOUSE_WALL);
          const renderId = houseTile || id === TILE_ID.TREE ? TILE_ID.GRASS : id;
          ctx.drawImage(tileCanvas(renderId, tx * 17 + ty * 29), tx * TILE, ty * TILE, TILE, TILE);
        }
      }
      this.drawWaterAnimations(sx, sy, ex, ey);
      this.drawLargeTrees(sx, sy, ex, ey);
      this.drawTerrainAnimations(sx, sy, ex, ey);
      if (this.zoneId === 'village') {
        for (const house of VILLAGE_HOUSES) drawVillageHouse(ctx, house, this.time);
      }

      // Portals glow and pulse.
      for (const p of this.portals) {
        ctx.save();
        const pulse = 1 + Math.sin(this.time * 3 + p.x) * 0.12;
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 22 * pulse, 12 * pulse, 0, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 20 * pulse, 10 * pulse, 0, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(p.label, p.x, p.y - 20);
        ctx.restore();
      }

      // Loot on the ground.
      for (const p of this.pickups) if (!p.collected) p.draw(ctx, this);

      // Merge all actors and sort by Y so ones lower on screen draw in front.
      const actors = [];
      for (const n of this.npcs) actors.push(n);
      for (const e of this.enemies) actors.push(e);
      for (const op of this.otherPlayers) actors.push(op);
      if (this.player) actors.push(this.player);
      if (this.pet) actors.push(this.pet);
      actors.sort((a, b) => a.y - b.y);
      for (const a of actors) a.draw(ctx, this);

      for (const pr of this.projectiles) pr.draw(ctx);

      // Falling meteors are drawn as Effect('meteor') so offline and online match.
      for (const e of this.effects) e.draw(ctx);
      this.drawLockTarget();
      this.drawSkillTargetPreview();
      for (const f of this.floaters) f.draw(ctx);
      ctx.restore();
    }

    drawLargeTrees(sx, sy, ex, ey) {
      const startX = Math.max(0, sx - 2);
      const startY = Math.max(0, sy - 2);
      const endX = Math.min(this.zone.w - 1, ex + 2);
      const endY = Math.min(this.zone.h - 1, ey + 2);
      const ctx = this.ctx;
      for (let ty = startY; ty <= endY; ty++) {
        for (let tx = startX; tx <= endX; tx++) {
          if (this.zone.tiles[ty * this.zone.w + tx] !== TILE_ID.TREE) continue;
          const variant = Math.abs((tx * 17 + ty * 29) % 4);
          drawLargeTree(ctx, tx * TILE, ty * TILE, variant, this.time);
        }
      }
    }

    drawWaterAnimations(sx, sy, ex, ey) {
      const ctx = this.ctx;
      const isWater = (tx, ty) => tx >= 0 && ty >= 0 && tx < this.zone.w && ty < this.zone.h &&
        this.zone.tiles[ty * this.zone.w + tx] === TILE_ID.WATER;
      ctx.save();
      for (let ty = sy; ty <= ey; ty++) {
        for (let tx = sx; tx <= ex; tx++) {
          if (!isWater(tx, ty)) continue;
          const x = tx * TILE;
          const y = ty * TILE;
          const hash = Math.abs((tx * 73856093) ^ (ty * 19349663));
          const pulse = 0.3 + (Math.sin(this.time * 2.2 + hash) + 1) * 0.18;
          ctx.save();
          ctx.beginPath();
          ctx.rect(x + 1, y + 1, TILE - 2, TILE - 2);
          ctx.clip();

          ctx.globalAlpha = 0.23 + pulse * 0.25;
          ctx.strokeStyle = '#b7eee0';
          ctx.lineWidth = 1.2;
          const ripple = (this.time * 7 + hash % 13) % 10;
          ctx.beginPath();
          ctx.ellipse(x + 15, y + 15, 5 + ripple * 0.55, 2 + ripple * 0.12, -0.15, 0, TAU);
          ctx.stroke();
          ctx.beginPath();
          ctx.ellipse(x + 15, y + 15, 2 + ripple * 0.35, 1 + ripple * 0.08, -0.15, 0, TAU);
          ctx.stroke();

          ctx.globalAlpha = 0.36 + pulse * 0.35;
          ctx.fillStyle = '#d1fff0';
          const drift = (this.time * 10 + hash % 20) % 22;
          ctx.fillRect(x + 4 + drift, y + 6 + hash % 5, 5, 1);
          ctx.fillRect(x + 21 - drift * 0.45, y + 23 - hash % 6, 3, 1);

          ctx.globalAlpha = pulse;
          ctx.fillStyle = '#c9f8df';
          if (!isWater(tx, ty - 1)) ctx.fillRect(x + 4 + hash % 9, y + 1, 7, 1);
          if (!isWater(tx + 1, ty)) ctx.fillRect(x + TILE - 2, y + 5 + hash % 12, 1, 6);
          if (!isWater(tx, ty + 1)) ctx.fillRect(x + 16 + hash % 8, y + TILE - 2, 8, 1);
          if (!isWater(tx - 1, ty)) ctx.fillRect(x + 1, y + 18 + hash % 8, 1, 5);
          ctx.restore();
        }
      }
      ctx.restore();
    }

    drawTerrainAnimations(sx, sy, ex, ey) {
      const ctx = this.ctx;
      ctx.save();
      for (let ty = sy; ty <= ey; ty++) {
        for (let tx = sx; tx <= ex; tx++) {
          const id = this.zone.tiles[ty * this.zone.w + tx];
          const x = tx * TILE;
          const y = ty * TILE;
          const hash = Math.abs((tx * 73856093) ^ (ty * 19349663));
          if (id === TILE_ID.TREE) {
            const sway = Math.sin(this.time * 2.4 + hash % 100) * 2.2;
            ctx.fillStyle = 'rgba(205, 184, 98, 0.58)';
            ctx.beginPath();
            ctx.ellipse(x + 17 + sway, y + 10, 5, 2.2, sway * 0.04, 0, TAU);
            ctx.fill();
            if (hash % 4 === 0) {
              const fall = (this.time * 13 + hash % 48) % 28;
              const leafX = x + 8 + (hash % 15) + Math.sin(this.time * 2 + hash) * 3;
              ctx.save();
              ctx.translate(leafX, y + fall);
              ctx.rotate(Math.sin(this.time * 3 + hash) * 0.8);
              ctx.fillStyle = '#b2ae67';
              ctx.fillRect(-2, -1, 4, 2);
              ctx.restore();
            }
          } else if (id === TILE_ID.GRASS && hash % 47 === 0) {
            const sway = Math.sin(this.time * 3 + hash) * 1.5;
            ctx.strokeStyle = '#899551';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x + 14 + sway, y + 25);
            ctx.lineTo(x + 11 + sway, y + 20);
            ctx.moveTo(x + 15 + sway, y + 25);
            ctx.lineTo(x + 15 + sway, y + 18);
            ctx.moveTo(x + 16 + sway, y + 25);
            ctx.lineTo(x + 19 + sway, y + 20);
            ctx.stroke();
            if (hash % 3 === 0) {
              ctx.fillStyle = '#e58a42';
              ctx.fillRect(x + 20 + sway, y + 18, 2, 2);
              ctx.fillStyle = '#ffd47a';
              ctx.fillRect(x + 20 + sway, y + 17, 1, 1);
            }
          } else if (id === TILE_ID.CACTUS) {
            ctx.globalAlpha = 0.35 + (Math.sin(this.time * 2 + hash) + 1) * 0.12;
            ctx.fillStyle = '#b4f29d';
            ctx.fillRect(x + 14 + Math.sin(this.time + hash) * 2, y + 7 + hash % 7, 2, 2);
            ctx.globalAlpha = 1;
          }
        }
      }
      ctx.restore();
    }

    drawSkillTargetPreview() {
      if (this.pendingSkillIndex === null || !this.player) return;
      const index = this.pendingSkillIndex;
      const point = this.skillAimPoint();
      const classId = this.player.classId;
      const color = classId === 'mage' ? (index === 2 ? '#ff9c42' : '#d7b8ff')
        : classId === 'archer' ? '#b9ffcb' : '#dceeff';
      const angle = Math.atan2(point.y - (this.player.y - 10), point.x - this.player.x);
      const isMeteor = classId === 'mage' && index === 2;
      const isBlink = classId === 'mage' && index === 1;
      const distance = isBlink ? 170 : classId === 'swordsman' ? 95 : 160;
      const tx = isMeteor ? point.x : this.player.x + Math.cos(angle) * distance;
      const ty = isMeteor ? point.y : this.player.y + Math.sin(angle) * distance;
      const ctx = this.ctx;
      const centerY = isMeteor ? ty : ty - 8;
      const pulse = 1 + Math.sin(this.time * 8) * 0.1;
      ctx.save();
      ctx.globalAlpha = 0.72 + Math.sin(this.time * 8) * 0.12;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      if (isMeteor) {
        ctx.setLineDash([7, 5]);
        ctx.lineDashOffset = -this.time * 18;
        ctx.beginPath();
        ctx.arc(tx, centerY, 108, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.setLineDash([6, 5]);
        ctx.lineDashOffset = -this.time * 18;
        ctx.beginPath();
        ctx.moveTo(this.player.x, this.player.y - 8);
        ctx.lineTo(tx, centerY);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(tx, centerY, (isMeteor ? 22 : 18) * pulse, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 0.95;
      const radius = (isMeteor ? 13 : isBlink ? 12 : 10) * pulse;
      ctx.beginPath();
      ctx.arc(tx, centerY, radius, 0, TAU);
      for (let i = 0; i < 4; i++) {
        const a = this.time * 0.8 + i * Math.PI / 2;
        const inner = radius + 3;
        const outer = radius + 9;
        ctx.moveTo(tx + Math.cos(a) * inner, centerY + Math.sin(a) * inner);
        ctx.lineTo(tx + Math.cos(a) * outer, centerY + Math.sin(a) * outer);
      }
      ctx.stroke();
      if (!isMeteor) {
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(this.player.x, this.player.y - 8, 8 + Math.sin(this.time * 10) * 2, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawSkillTargetHint() {
      if (this.pendingSkillIndex === null || !this.player) return;
      const skill = SKILLS[this.player.classId][this.pendingSkillIndex];
      const ctx = this.ctx;
      ctx.save();
      ctx.fillStyle = 'rgba(8, 13, 24, 0.88)';
      ctx.fillRect(VIEW_W / 2 - 150, 12, 300, 28);
      ctx.strokeStyle = '#8fa4c9';
      ctx.strokeRect(VIEW_W / 2 - 150 + 0.5, 12.5, 299, 27);
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.fillText(`${skill.name}: tap/click target | Esc cancel`, VIEW_W / 2, 30);
      ctx.restore();
    }

    // A clear reticle makes the locked mob obvious on desktop and mobile.
    drawLockTarget() {
      const target = this.currentLockTarget();
      if (!target) return;
      const ctx = this.ctx;
      const cy = target.y - 8;
      const r = (target.type === 'boss' ? 34 : 24) + Math.sin(this.time * 6) * 2;
      ctx.save();
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = '#ffd75e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(target.x, cy, r, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(target.x, cy, r + 6, this.time * 2.2, this.time * 2.2 + 1.3);
      ctx.stroke();
      ctx.globalAlpha = 1;
      const inner = r - 7;
      const outer = r + 4;
      ctx.beginPath();
      ctx.moveTo(target.x - outer, cy); ctx.lineTo(target.x - inner, cy);
      ctx.moveTo(target.x + inner, cy); ctx.lineTo(target.x + outer, cy);
      ctx.moveTo(target.x, cy - outer); ctx.lineTo(target.x, cy - inner);
      ctx.moveTo(target.x, cy + inner); ctx.lineTo(target.x, cy + outer);
      ctx.stroke();
      ctx.restore();
    }

    // STAGE 3: a darkness overlay with a soft light around the hero.
    drawDayNight() {
      const ctx = this.ctx;
      const dayFactor = (Math.cos(this.dayTime / DAY_LENGTH * TAU) + 1) / 2;
      const night = 1 - dayFactor;
      if (night < 0.04 || !this.player) return;
      const dctx = this.darkCanvas.getContext('2d');
      dctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
      dctx.imageSmoothingEnabled = false;
      dctx.clearRect(0, 0, VIEW_W, VIEW_H);
      dctx.globalCompositeOperation = 'source-over';
      dctx.fillStyle = `rgba(3,6,24,${night * 0.62})`;
      dctx.fillRect(0, 0, VIEW_W, VIEW_H);
      dctx.globalCompositeOperation = 'destination-out';
      const px = this.player.x - this.camX + (this.shakeX || 0);
      const py = this.player.y - 16 - this.camY + (this.shakeY || 0);
      const radius = this.player.classId === 'mage' ? 300 : 250;
      const grad = dctx.createRadialGradient(px, py, 10, px, py, radius);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(0.6, 'rgba(0,0,0,0.82)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      dctx.fillStyle = grad;
      dctx.fillRect(px - radius, py - radius, radius * 2, radius * 2);
      dctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(this.darkCanvas, 0, 0, VIEW_W, VIEW_H);

      // A small label tells the player what part of the cycle it is.
      ctx.save();
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'right';
      ctx.fillStyle = '#cfd8ff';
      ctx.fillText(night > 0.65 ? 'NIGHT' : night > 0.3 ? 'DUSK' : 'DAY', VIEW_W - 14, 24);
      ctx.restore();
    }

    drawWorldAtmosphere() {
      const ctx = this.ctx;
      const vignette = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 170, VIEW_W / 2, VIEW_H / 2, 620);
      vignette.addColorStop(0, 'rgba(5,9,20,0)');
      const edgeTint = this.zoneId === 'forest' ? 'rgba(16, 28, 20, 0.3)'
        : this.zoneId === 'desert' ? 'rgba(65, 38, 20, 0.24)'
          : this.zoneId === 'village' ? 'rgba(45, 31, 20, 0.22)'
            : 'rgba(11, 14, 24, 0.32)';
      vignette.addColorStop(1, edgeTint);
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }

    buildMinimap() {
      const c = document.createElement('canvas');
      c.width = 160;
      c.height = 120;
      const cx = c.getContext('2d');
      const sx = c.width / this.zone.w;
      const sy = c.height / this.zone.h;
      for (let y = 0; y < this.zone.h; y++) {
        for (let x = 0; x < this.zone.w; x++) {
          cx.fillStyle = MINIMAP_COLORS[this.zone.tiles[y * this.zone.w + x]];
          cx.fillRect(x * sx, y * sy, Math.ceil(sx), Math.ceil(sy));
        }
      }
      this.minimapCache = c;
    }

    // STAGE 4: minimap with player, enemies, NPCs, portals and party dots.
    drawMinimap() {
      const ctx = this.ctx;
      const x = VIEW_W - 176;
      const y = 34;
      const w = 164;
      const h = 136;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 9;
      ctx.shadowOffsetY = 3;
      ctx.fillStyle = 'rgba(8,12,22,0.96)';
      ctx.fillRect(x, y, w, h);
      ctx.restore();
      ctx.strokeStyle = '#111a2b';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.strokeStyle = '#7186a9';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 2.5, y + 2.5, w - 5, h - 5);
      ctx.fillStyle = 'rgba(255,215,94,0.72)';
      ctx.fillRect(x + 3, y + 3, w - 6, 2);
      ctx.fillStyle = 'rgba(24,36,58,0.96)';
      ctx.fillRect(x + 3, y + 5, w - 6, 14);
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#f1d98c';
      ctx.fillText(this.zone.name + ' Map', x + 8, y + 15);
      if (!this.minimapCache) return;
      const mx = x + 2;
      const my = y + 20;
      const mw = w - 4;
      const mh = h - 24;
      ctx.drawImage(this.minimapCache, mx, my, mw, mh);
      ctx.strokeStyle = '#a4b4d2';
      ctx.lineWidth = 1;
      ctx.strokeRect(mx + 0.5, my + 0.5, mw - 1, mh - 1);
      const dot = (wx, wy, color, size = 3) => {
        ctx.fillStyle = color;
        ctx.fillRect(mx + wx / this.zone.pixelW * mw - size / 2, my + wy / this.zone.pixelH * mh - size / 2, size, size);
      };
      for (const p of this.portals) dot(p.x, p.y, '#d5a6ff', 4);
      for (const n of this.npcs) dot(n.x, n.y, '#ffd75e', 3);
      for (const e of this.enemies) if (e.alive) dot(e.x, e.y, e.type === 'boss' ? '#ff4fa3' : '#ff6b6b', e.type === 'boss' ? 5 : 2);
      for (const op of this.otherPlayers) if (op.alive) dot(op.x, op.y, op.party ? '#ffd75e' : '#9fd8ff', op.party ? 4 : 2);
      if (this.player) dot(this.player.x, this.player.y, '#ffffff', 5);
    }

    drawHUD() {
      const ctx = this.ctx;
      const p = this.player;
      if (!p) return;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.42)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 3;
      const hud = ctx.createLinearGradient(12, 12, 262, 112);
      hud.addColorStop(0, 'rgba(19,29,48,0.96)');
      hud.addColorStop(1, 'rgba(7,11,22,0.96)');
      ctx.fillStyle = hud;
      ctx.fillRect(12, 12, 250, 100);
      ctx.restore();
      ctx.strokeStyle = '#101827';
      ctx.lineWidth = 2;
      ctx.strokeRect(12.5, 12.5, 249, 99);
      ctx.strokeStyle = '#7186a9';
      ctx.lineWidth = 1;
      ctx.strokeRect(15.5, 15.5, 243, 93);
      ctx.fillStyle = CLASS_DATA[p.classId].color;
      ctx.fillRect(13, 14, 3, 96);
      ctx.fillStyle = 'rgba(255,215,94,0.68)';
      ctx.fillRect(17, 15, 242, 1);
      ctx.fillStyle = '#101827';
      ctx.fillRect(20, 18, 28, 28);
      ctx.strokeStyle = CLASS_DATA[p.classId].color;
      ctx.strokeRect(20.5, 18.5, 27, 27);
      drawSprite(ctx, playerSprite(p.classId, p.walkFrame || 0, false, p.equipment || {}), 34, 44, 1.5);
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = CLASS_DATA[p.classId].color;
      ctx.fillText(p.name, 54, 30);
      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = '#f1d98c';
      ctx.fillText(`LV ${p.level}  ${CLASS_DATA[p.classId].name.toUpperCase()}`, 54, 44);
      ctx.font = '9px monospace';
      ctx.fillStyle = '#c9d4e8';
      ctx.fillText(`ATK ${Math.round(p.finalStats.attack)}   SPD ${Math.round(p.finalStats.speed)}   RNG ${Math.round(p.finalStats.range)}`, 54, 56);
      const resourceName = p.classId === 'mage' ? 'MANA' : 'STAMINA';
      drawBar(ctx, 22, 62, 230, 12, p.hp / p.maxHp, '#e85d6a', `HP ${Math.ceil(p.hp)}/${p.maxHp}`);
      drawBar(ctx, 22, 77, 230, 11, p.mp / p.maxMp, p.classId === 'mage' ? '#6a8cff' : '#63c98a', `${resourceName} ${Math.ceil(p.mp)}/${p.maxMp}`);
      drawBar(ctx, 22, 91, 230, 8, p.xp / p.xpNext, '#b57bff', `XP ${p.xp}/${p.xpNext}`);
      ctx.font = 'bold 11px monospace';
      ctx.fillStyle = '#ffd75e';
      ctx.textAlign = 'left';
      ctx.fillText(`Gold: ${p.gold}`, 22, 108);
      if (p.skillPoints > 0) {
        ctx.fillStyle = '#8ee6ff';
        ctx.textAlign = 'right';
        ctx.fillText(`SP: ${p.skillPoints} (K)`, 252, 108);
        ctx.textAlign = 'left';
      }
      if (this.network.online) {
        const tabs = [
          ['B', 'openAuction', 'Auction'], ['M', 'openMail', 'Mail'], ['G', 'openGuild', 'Guild'],
          ['R', 'openCraft', 'Craft'], ['T', 'openTalents', 'Talents'], ['N', 'enterDungeon', 'Raid']
        ];
        tabs.forEach((tab, i) => {
          this.button(270 + i * 58, 12, 54, 24, tab[0], tab[1],
            { color: i === 5 ? '#6b3542' : '#34405c', fontSize: 10 });
        });
      }
    }

    drawHotbar() {
      const ctx = this.ctx;
      const p = this.player;
      if (!p) return;
      const skills = SKILLS[p.classId];
      const startX = VIEW_W / 2 - 150;
      const y = VIEW_H - 76;
      ctx.fillStyle = 'rgba(5,9,19,0.62)';
      ctx.fillRect(startX - 12, y - 8, 320, 78);
      ctx.strokeStyle = 'rgba(143,168,208,0.65)';
      ctx.strokeRect(startX - 11.5, y - 7.5, 319, 77);
      ctx.fillStyle = CLASS_DATA[p.classId].color;
      ctx.globalAlpha = 0.72;
      ctx.fillRect(startX - 8, y - 7, 312, 2);
      ctx.globalAlpha = 1;
      for (let i = 0; i < 4; i++) {
        const x = startX + i * 76;
        const def = skills[i];
        const cd = p.skillCd[i];
        const selected = this.pendingSkillIndex === i;
        const card = ctx.createLinearGradient(x, y, x, y + 62);
        card.addColorStop(0, selected ? 'rgba(42,53,79,0.98)' : 'rgba(18,27,43,0.98)');
        card.addColorStop(1, 'rgba(7,11,21,0.98)');
        ctx.fillStyle = card;
        ctx.fillRect(x, y, 70, 62);
        ctx.strokeStyle = selected ? '#ffd75e' : cd > 0 ? '#5a6378' : CLASS_DATA[p.classId].color;
        ctx.lineWidth = selected ? 2.5 : 2;
        ctx.strokeRect(x + 1, y + 1, 68, 60);
        drawSkillIcon(ctx, p.classId, i, x + 23, y + 3, 24, selected, this.time);
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.fillText(`${i + 1}`, x + 10, y + 14);
        ctx.fillStyle = '#dbe6ff';
        ctx.font = '9px monospace';
        const words = def.name.split(' ');
        const labelStartY = words.length === 1 ? y + 44 : y + 37;
        words.forEach((word, k) => ctx.fillText(word, x + 35, labelStartY + k * 9, 58));
        ctx.fillStyle = p.mp >= def.cost ? '#8ee6ff' : '#ff9b9b';
        ctx.fillText(`cost ${def.cost}`, x + 35, y + 58);
        ctx.fillStyle = '#9aa6bd';
        ctx.fillText(`R${p.skillRanks[i]}`, x + 58, y + 14);
        if (cd > 0) {
          const cooldownMax = def.cd * (1 - (p.skillRanks[i] - 1) * 0.08) * p.finalStats.cooldownMult;
          const cooldownHeight = Math.max(0, Math.min(60, cd / cooldownMax * 60));
          ctx.fillStyle = 'rgba(0,0,0,0.42)';
          ctx.fillRect(x + 2, y + 2, 66, cooldownHeight);
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 16px monospace';
          ctx.fillText(cd.toFixed(1), x + 35, y + 33);
        }
      }
      if (this.pet) {
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#d8d0ff';
        ctx.fillText('Pet: auto-loot ON', VIEW_W / 2, VIEW_H - 10);
      }
    }

    drawQuestTracker() {
      const ctx = this.ctx;
      const q = this.quest;
      if (q.claimed || (!q.active && !q.complete)) return;
      const chapter = questChapter(q.stage);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 7;
      ctx.shadowOffsetY = 2;
      const tracker = ctx.createLinearGradient(12, 120, 242, 178);
      tracker.addColorStop(0, 'rgba(27,24,49,0.95)');
      tracker.addColorStop(1, 'rgba(8,12,22,0.95)');
      ctx.fillStyle = tracker;
      ctx.fillRect(12, 120, 230, 58);
      ctx.restore();
      ctx.strokeStyle = '#171a2a';
      ctx.lineWidth = 2;
      ctx.strokeRect(12.5, 120.5, 229, 57);
      ctx.strokeStyle = '#c3a4ff';
      ctx.lineWidth = 1;
      ctx.strokeRect(14.5, 122.5, 225, 53);
      ctx.fillStyle = '#c3a4ff';
      ctx.fillRect(14, 122, 3, 54);
      ctx.fillStyle = 'rgba(255,255,255,0.045)';
      ctx.fillRect(18, 122, 221, 19);
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffd75e';
      ctx.fillText(q.complete ? `CH ${q.stage}/3 READY: RETURN TO ELDER TARN` : `CH ${q.stage}/3: ${chapter.title.toUpperCase()}`, 20, 138);
      ctx.font = '10px monospace';
      ctx.fillStyle = '#dbe6ff';
      const firstProgress = q.stage === 3 ? `Scouts: ${q.scouts}/8` : q.stage === 2 ? `Goblins: ${q.goblins}/8` : `Slimes: ${q.kills}/10`;
      const secondProgress = q.stage === 3 ? `Essence: ${q.essence}/3` : q.stage === 2 ? `Ore: ${q.ore}/4` : `Herbs: ${q.herbs}/5`;
      ctx.fillText(firstProgress, 20, 154);
      ctx.fillText(secondProgress, 120, 154);
      ctx.fillStyle = '#9aa6bd';
      ctx.fillText(q.complete ? 'Find Elder Tarn and press F' : 'Complete both objectives', 20, 170);
    }

    drawParty() {
      if (!this.party.length) return;
      const ctx = this.ctx;
      const y = this.quest.active || this.quest.complete ? 186 : 124;
      ctx.fillStyle = 'rgba(8,12,22,0.84)';
      ctx.fillRect(12, y, 180, 26 + this.party.length * 16);
      ctx.strokeStyle = '#ffd75e';
      ctx.strokeRect(12.5, y + 0.5, 179, 25 + this.party.length * 16);
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffd75e';
      ctx.fillText(`PARTY (${this.party.length + 1})`, 20, y + 15);
      this.party.forEach((op, i) => {
        ctx.fillStyle = '#dbe6ff';
        ctx.fillText(`${op.name} Lv${op.level}`, 20, y + 31 + i * 16);
        drawBar(ctx, 108, y + 22 + i * 16, 74, 6, op.hp / op.maxHp, '#6ee787');
      });
    }

    drawLeaderboard() {
      if (this.input.mobile) return; // Hide compact leaderboard widget on mobile so it doesn't overlap touch buttons
      const ctx = this.ctx;
      const x = VIEW_W - 176;
      const y = 178;
      ctx.fillStyle = 'rgba(8,12,22,0.84)';
      ctx.fillRect(x, y, 164, 132);
      ctx.strokeStyle = '#7d89a8';
      ctx.strokeRect(x + 0.5, y + 0.5, 163, 131);
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffd75e';
      ctx.fillText('TOP LEVELS', x + 8, y + 15);
      const list = [this.player, ...this.otherPlayers].filter(Boolean).sort((a, b) => b.level - a.level).slice(0, 5);
      list.forEach((entry, i) => {
        const isYou = entry === this.player;
        ctx.fillStyle = isYou ? '#8ee6ff' : '#c9d4e8';
        ctx.font = `${isYou ? 'bold ' : ''}10px monospace`;
        ctx.fillText(`${i + 1}. ${entry.name}`, x + 8, y + 34 + i * 18);
        ctx.textAlign = 'right';
        ctx.fillText(`Lv ${entry.level}`, x + 156, y + 34 + i * 18);
        ctx.textAlign = 'left';
      });
    }

    drawChat() {
      const ctx = this.ctx;
      if (this.chatMinimized) {
        const x = 12;
        const y = this.input.mobile ? 72 : VIEW_H - 38;
        const w = 88;
        const h = 26;
        this.button(x, y, w, h, 'CHAT +', 'toggleChat', { fontSize: 10 });
        return;
      }

      const w = 310;
      const h = 126;
      const x = 12;
      const y = this.input.mobile ? 182 : VIEW_H - 138;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.38)';
      ctx.shadowBlur = 9;
      ctx.shadowOffsetY = 3;
      const chat = ctx.createLinearGradient(x, y, x + w, y + h);
      chat.addColorStop(0, 'rgba(15,24,41,0.96)');
      chat.addColorStop(1, 'rgba(5,9,18,0.96)');
      ctx.fillStyle = chat;
      ctx.fillRect(x, y, w, h);
      ctx.restore();
      ctx.strokeStyle = '#101827';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.strokeStyle = '#7186a9';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 2.5, y + 2.5, w - 5, h - 5);
      ctx.fillStyle = 'rgba(255,215,94,0.7)';
      ctx.fillRect(x + 2, y + 2, w - 4, 2);
      ctx.fillStyle = 'rgba(25,38,61,0.96)';
      ctx.fillRect(x + 2, y + 4, w - 4, 18);
      ctx.fillStyle = '#c9d4e8';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('CHAT', x + 8, y + 14);
      ctx.fillStyle = '#8fa8d0';
      ctx.font = '9px monospace';
      ctx.fillText(this.network.online ? 'ZONE' : 'WORLD', x + 48, y + 14);
      this.button(x + w - 25, y + 2, 22, 18, '-', 'toggleChat', { fontSize: 12 });
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + 4, y + 22, w - 8, h - 30);
      ctx.clip();
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      const visible = this.chatMessages.slice(-5);
      let ty = y + h - (this.chatOpen ? 30 : 10);
      for (let i = visible.length - 1; i >= 0; i--) {
        const msg = visible[i];
        ctx.fillStyle = msg.color;
        ctx.fillText(msg.text, x + 8, ty);
        ty -= 13;
        if (ty < y + 24) break;
      }
      ctx.restore();
      if (this.chatOpen) {
        ctx.fillStyle = 'rgba(20,28,45,0.96)';
        ctx.fillRect(x + 4, y + h - 24, w - 8, 20);
        ctx.fillStyle = '#fff';
        ctx.font = '10px monospace';
        ctx.fillText(`> ${this.chatInput}${Math.floor(this.time * 2) % 2 ? '_' : ''}`, x + 10, y + h - 10);
      } else {
        ctx.fillStyle = '#7f8ca5';
        ctx.font = '9px monospace';
        ctx.fillText('Press Enter to chat', x + 8, y + 14);
      }
    }

    drawPrompt() {
      const found = this.findInteractable();
      if (!found || this.panel || this.paused) return;
      let label = '';
      if (found.kind === 'chest') label = '[F] Open Boss Chest';
      else if (found.kind === 'portal') label = `[F] Enter ${found.obj.label}`;
      else if (found.obj.type === 'shop') label = '[F] Open Shop';
      else if (found.obj.type === 'guard') label = '[F] Talk to Village Guard';
      else label = this.quest.complete ? '[F] Turn in Quest' : '[F] Talk / Quest';
      const ctx = this.ctx;
      ctx.font = 'bold 12px monospace';
      const w = ctx.measureText(label).width + 20;
      const x = VIEW_W / 2 - w / 2;
      const y = VIEW_H - 152;
      ctx.fillStyle = 'rgba(8,12,22,0.9)';
      ctx.fillRect(x, y, w, 24);
      ctx.strokeStyle = '#ffd75e';
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 23);
      ctx.fillStyle = '#ffd75e';
      ctx.textAlign = 'center';
      ctx.fillText(label, VIEW_W / 2, y + 16);
    }

    // STAGE 3: boss bar at the top of the screen during a boss fight.
    drawBossBar() {
      const boss = this.enemies.find(e => e.type === 'boss' && e.alive);
      if (!boss || !this.player || dist(boss, this.player) > 760) return;
      const ctx = this.ctx;
      const x = VIEW_W / 2 - 190;
      const y = 44;
      ctx.fillStyle = 'rgba(8,12,22,0.9)';
      ctx.fillRect(x - 6, y - 18, 392, 42);
      ctx.strokeStyle = '#ff8c42';
      ctx.strokeRect(x - 5.5, y - 17.5, 391, 41);
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd166';
      ctx.fillText(`CAVE BOSS - PHASE ${boss.phase}`, VIEW_W / 2, y - 5);
      drawBar(ctx, x, y, 380, 14, boss.hp / boss.maxHp, '#e8505c', `${Math.ceil(boss.hp)} / ${boss.maxHp}`);
    }

    drawDraggedItem() {
      if (!this.drag) return;
      const ctx = this.ctx;
      const item = this.drag.item;
      const x = this.pointer.x;
      const y = this.pointer.y;
      ctx.fillStyle = 'rgba(8,12,22,0.95)';
      ctx.fillRect(x - 22, y - 22, 44, 44);
      ctx.fillStyle = RARITY[item.rarity].color;
      ctx.fillRect(x - 19, y - 19, 38, 38);
      drawItemImage(ctx, item, x - 16, y - 16, 32);
      ctx.textBaseline = 'alphabetic';
    }

    // ---------- Screens and panels ----------

    // EXPANSION 2: account login/register rendered on the same canvas.
    drawLoginScreen() {
      const ctx = this.ctx;
      const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
      grad.addColorStop(0, '#101a30');
      grad.addColorStop(1, '#251735');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);

      for (let i = 0; i < 50; i++) {
        ctx.fillStyle = i % 4 ? '#2a3452' : '#4b5681';
        ctx.fillRect((i * 181) % VIEW_W, (i * 97) % VIEW_H, 2, 2);
      }

      ctx.textAlign = 'center';
      ctx.fillStyle = '#8ee6ff';
      ctx.font = 'bold 36px monospace';
      ctx.fillText('PIXEL REALM ONLINE', VIEW_W / 2, 78);
      ctx.font = '13px monospace';
      ctx.fillStyle = '#b9c7e6';
      ctx.fillText('Accounts, cloud saves, real players and private raids', VIEW_W / 2, 104);

      const x = 310;
      const y = 144;
      const w = 340;
      const h = 268;
      panel(ctx, x, y, w, h, 'Account Login');

      this.drawTextField(x + 34, y + 70, 272, 32, 'USERNAME',
        this.loginFields.active === 'username' && !this.loginFields.username ? '' : this.loginFields.username,
        'loginUser', 24);
      this.drawTextField(x + 34, y + 132, 272, 32, 'PASSWORD',
        '*'.repeat(this.loginFields.password.length), 'loginPass', 24);

      ctx.font = '10px monospace';
      ctx.fillStyle = '#7f8ca5';
      ctx.fillText('Tab switches fields. Enter logs in.', VIEW_W / 2, y + 184);

      this.button(x + 34, y + 202, 130, 34, 'LOGIN', 'login', { color: '#3f7d55', border: '#8ee6a8' });
      this.button(x + 176, y + 202, 130, 34, 'REGISTER', 'register', { color: '#2f5f8c', border: '#8ee6ff' });
      this.button(x + 34, y + 242, 272, 20, 'BACK TO HERO SELECT', 'loginBack', { color: '#34405c' });

      ctx.fillStyle = this.network.connected ? '#8ee6a8' : this.network.connecting ? '#ffd75e' : '#ff9b9b';
      ctx.font = '11px monospace';
      ctx.fillText(this.network.connected ? `Connected to ${this.network.url}` :
        this.network.connecting ? 'Connecting to server...' :
          'Server offline. Deploy the Node server and connect with ?ws=wss://your-server/ws', VIEW_W / 2, 450);
      ctx.fillStyle = '#7f8ca5';
      ctx.font = '10px monospace';
      ctx.fillText('Go back and press PLAY – it auto-connects, or starts offline if unavailable.', VIEW_W / 2, 476);
    }

    drawIntroScreen() {
      const ctx = this.ctx;
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(loadingBanner(), 0, 0, VIEW_W, VIEW_H);
      ctx.restore();

      const shade = ctx.createLinearGradient(0, 0, 0, VIEW_H);
      shade.addColorStop(0, 'rgba(10,16,34,0.12)');
      shade.addColorStop(0.56, 'rgba(11,17,34,0.02)');
      shade.addColorStop(1, 'rgba(10,16,31,0.44)');
      ctx.fillStyle = shade;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);

      const riftPulse = 0.55 + (Math.sin(this.time * 3.1) + 1) * 0.18;
      ctx.save();
      ctx.globalAlpha = riftPulse;
      ctx.shadowColor = '#9b83ff';
      ctx.shadowBlur = 18 + Math.sin(this.time * 4) * 5;
      ctx.strokeStyle = '#c9baff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(866, 174);
      ctx.lineTo(859, 188);
      ctx.lineTo(868, 198);
      ctx.lineTo(858, 212);
      ctx.lineTo(865, 225);
      ctx.stroke();
      ctx.strokeStyle = '#755eff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(871, 178);
      ctx.lineTo(866, 191);
      ctx.lineTo(873, 201);
      ctx.lineTo(864, 216);
      ctx.stroke();
      ctx.restore();

      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd75e';
      ctx.font = 'bold 38px monospace';
      ctx.shadowColor = '#ffc85e';
      ctx.shadowBlur = 8 + (Math.sin(this.time * 2.2) + 1) * 5;
      ctx.fillText('PIXEL REALM', VIEW_W / 2, 61);
      ctx.shadowBlur = 0;
      ctx.font = 'bold 13px monospace';
      ctx.fillStyle = '#a9d8ff';
      ctx.fillText('CHRONICLES OF THE BROKEN SEAL', VIEW_W / 2, 83);

      for (let i = 0; i < 16; i++) {
        const x = i % 2 ? 30 + (i * 23) % 74 : VIEW_W - 104 + (i * 19) % 74;
        const y = 115 + (i * 37 + this.time * (8 + i % 3 * 3)) % 216;
        ctx.globalAlpha = 0.32 + (Math.sin(this.time * 2.4 + i) + 1) * 0.24;
        ctx.fillStyle = i % 3 ? '#b8e4ca' : '#ffe39a';
        ctx.fillRect(x, y, i % 4 === 0 ? 3 : 2, i % 4 === 0 ? 3 : 2);
      }
      ctx.globalAlpha = 1;

      const x = 92;
      const y = 347;
      const w = 776;
      const h = 126;
      ctx.fillStyle = 'rgba(8,13,25,0.88)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#c6a86a';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
      ctx.strokeStyle = 'rgba(255,215,94,0.25)';
      ctx.strokeRect(x + 8, y + 8, w - 16, h - 16);

      ctx.font = 'bold 14px monospace';
      ctx.fillStyle = '#ffe3a1';
      ctx.fillText('THE NIGHT THE SEAL BROKE', VIEW_W / 2, y + 24);
      ctx.textAlign = 'left';
      ctx.font = '10px monospace';
      ctx.fillStyle = '#d8e1f2';
      wrappedText(ctx,
        'Three wardstones guarded the ancient seal beneath Mount Veyr for a thousand years. Last night, one went dark—and monsters crossed into Hearthvale.',
        x + 28, y + 46, w - 56, 13, 2);
      ctx.fillStyle = '#b9c7e6';
      wrappedText(ctx,
        'Follow Elder Tarn’s three chapters—from the Waking Forest to the Echoes Below and the Shards of the Dunes. Uncover who broke the seal and decide Hearthvale’s fate.',
        x + 28, y + 74, w - 56, 13, 2);
      ctx.textAlign = 'center';
      ctx.font = 'italic 9px monospace';
      ctx.fillStyle = '#ffd75e';
      ctx.fillText('Your legend begins on the road to Hearthvale.', VIEW_W / 2, y + 111);

      if (this.saveData) {
        this.button(286, 484, 184, 32, 'BEGIN JOURNEY', 'beginStory', { color: '#3f7d55', border: '#8ee6a8', fontSize: 11 });
        this.button(490, 484, 184, 32, `CONTINUE Lv${this.saveData.level || 1}`, 'continueFromIntro', { color: '#5b4b8c', border: '#c9a6ff', fontSize: 10 });
        ctx.font = '10px monospace';
        ctx.fillStyle = '#9fb0cd';
        ctx.fillText('Enter: begin journey    C: continue saved hero', VIEW_W / 2, 534);
      } else {
        this.button(380, 484, 200, 32, 'BEGIN JOURNEY', 'beginStory', { color: '#3f7d55', border: '#8ee6a8', fontSize: 11 });
        ctx.font = '10px monospace';
        ctx.fillStyle = '#9fb0cd';
        ctx.fillText('Press Enter or tap Begin Journey to choose your hero.', VIEW_W / 2, 534);
      }
    }

    drawSelectScreen() {
      const ctx = this.ctx;
      const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
      grad.addColorStop(0, '#151c33');
      grad.addColorStop(1, '#24182f');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);

      // Tiny pixel "stars" in the background.
      for (let i = 0; i < 60; i++) {
        const x = (i * 137) % VIEW_W;
        const y = (i * 79) % 300;
        ctx.fillStyle = i % 3 ? '#2c3554' : '#4a5580';
        ctx.fillRect(x, y, 2, 2);
      }

      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd75e';
      ctx.font = 'bold 40px monospace';
      ctx.fillText('PIXEL REALM', VIEW_W / 2, 58);
      ctx.font = '14px monospace';
      ctx.fillStyle = '#b9c7e6';
      ctx.fillText('Choose your path through the Broken Seal story', VIEW_W / 2, 80);

      this.button(20, 18, 150, 26, 'BACK TO STORY', 'backToIntro', { color: '#34405c', border: '#9fb0cd', fontSize: 9 });

      const ids = ['swordsman', 'archer', 'mage', 'cleric', 'rogue', 'summoner'];
      ids.forEach((id, i) => {
        const row = Math.floor(i / 3);
        const col = i % 3;
        const x = 50 + col * 292;
        const y = 92 + row * 168;
        const w = 276;
        const h = 156;
        const data = CLASS_DATA[id];
        const selected = this.selectedClass === id;
        ctx.fillStyle = selected ? 'rgba(32,54,92,0.98)' : 'rgba(12,18,34,0.94)';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = selected ? '#ffd75e' : '#4a577a';
        ctx.lineWidth = selected ? 2.5 : 1;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

        // Left Column: Portrait box + Class name + Role tag
        const portraitX = x + 10;
        const portraitY = y + 10;
        const portraitW = 72;
        const portraitH = 72;
        ctx.fillStyle = '#0a0f1d';
        ctx.fillRect(portraitX, portraitY, portraitW, portraitH);
        const aura = ctx.createRadialGradient(portraitX + portraitW / 2, portraitY + portraitH / 2, 4, portraitX + portraitW / 2, portraitY + portraitH / 2, 44);
        aura.addColorStop(0, `${data.color}55`);
        aura.addColorStop(1, '#0a0f1d');
        ctx.fillStyle = aura;
        ctx.fillRect(portraitX, portraitY, portraitW, portraitH);
        ctx.strokeStyle = `${data.color}88`;
        ctx.lineWidth = 1;
        ctx.strokeRect(portraitX + 0.5, portraitY + 0.5, portraitW - 1, portraitH - 1);

        // Animated motes
        for (let mote = 0; mote < 4; mote++) {
          const mx = portraitX + 8 + ((mote * 23 + Math.floor(this.time * 6)) % 56);
          const my = portraitY + 8 + ((mote * 31 + id.length * 7) % 56);
          ctx.globalAlpha = 0.4 + (Math.sin(this.time * 3 + mote * 2) + 1) * 0.2;
          ctx.fillStyle = data.color;
          ctx.fillRect(mx, my, 2, 2);
        }
        ctx.globalAlpha = 1;

        // Player frame inside portrait
        const colors = STARTER_SPRITE_COLORS[id] || { weapon: data.color, armor: '#4a5580' };
        const equipment = {
          weapon: { spriteColor: colors.weapon },
          armor: { spriteColor: colors.armor }
        };
        const frame = playerGaitFrame(this.time, data.speed);
        const sprite = playerSprite(id, frame, false, equipment, { running: false });
        drawPlayerFrame(ctx, sprite, portraitX + portraitW / 2, portraitY + 62, frame, false, 1, 4.2);

        // Class Name under portrait
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = data.color;
        ctx.fillText(data.name, portraitX + portraitW / 2, y + 102);

        // Role tag
        ctx.font = '9px monospace';
        ctx.fillStyle = '#9fb0cd';
        const roleTag = id === 'swordsman' ? 'Tank / Melee'
          : id === 'archer' ? 'Ranged Kiter'
          : id === 'mage' ? 'AoE Caster'
          : id === 'cleric' ? 'Holy Healer'
          : id === 'rogue' ? 'Stealth Burst' : 'Occult Summoner';
        ctx.fillText(roleTag, portraitX + portraitW / 2, y + 118);

        // HP/MP info
        ctx.font = '9px monospace';
        ctx.fillStyle = '#6e7f9e';
        ctx.fillText(`HP ${data.maxHp}  MP ${data.mana || 80}`, portraitX + portraitW / 2, y + 134);

        // Right Column: Blurb & Stats bars
        ctx.textAlign = 'left';
        ctx.font = '10px monospace';
        ctx.fillStyle = '#c8d3ea';
        wrappedText(ctx, data.blurb, x + 90, y + 18, 176, 13, 2);

        const stats = [
          ['HP', data.maxHp, 200],
          ['ATK', data.attack, 28],
          ['SPD', data.speed, 160],
          ['RNG', data.range, 300]
        ];
        stats.forEach((s, k) => {
          const sy = y + 54 + k * 18;
          ctx.font = 'bold 9px monospace';
          ctx.textAlign = 'left';
          ctx.fillStyle = '#9fb0cd';
          ctx.fillText(s[0], x + 90, sy + 7);
          drawBar(ctx, x + 116, sy, 110, 9, clamp(s[1] / s[2], 0.1, 1), data.color);
          ctx.textAlign = 'right';
          ctx.fillStyle = '#fff';
          ctx.font = '9px monospace';
          ctx.fillText(String(s[1]), x + 266, sy + 7);
        });

        // Skill list preview
        ctx.font = '9px monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#8a9bb8';
        const skillsTeaser = SKILLS[id].map(s => s.name.split(' ')[0]).join(' • ');
        ctx.fillText(`Skills: ${skillsTeaser}`, x + 90, y + 142);

        this.clickRegions.push({ x, y, w, h, action: 'select:' + id });
      });

      // On-canvas name input: typing works without any HTML input element.
      const session = this.session;
      const nx = 278;
      const ny = 452;
      const nw = 220;
      const nh = 34;
      ctx.textAlign = 'left';
      ctx.font = '12px monospace';
      ctx.fillStyle = '#c8d3ea';
      ctx.fillText(session ? 'Account:' : 'Name:', nx - (session ? 68 : 52), ny + 22);
      if (session) {
        // Returning player – show saved name (read-only)
        ctx.fillStyle = '#1a2238';
        ctx.fillRect(nx, ny, nw, nh);
        ctx.strokeStyle = '#58668a';
        ctx.lineWidth = 1;
        ctx.strokeRect(nx + 0.5, ny + 0.5, nw - 1, nh - 1);
        ctx.fillStyle = '#8ee6ff';
        ctx.fillText(session.username, nx + 8, ny + 22);
      } else {
        // New player – editable name field
        ctx.fillStyle = '#0c1220';
        ctx.fillRect(nx, ny, nw, nh);
        ctx.strokeStyle = this.nameFocused ? '#ffd75e' : '#7d89a8';
        ctx.lineWidth = this.nameFocused ? 2 : 1;
        ctx.strokeRect(nx + 0.5, ny + 0.5, nw - 1, nh - 1);
        ctx.fillStyle = '#fff';
        const caret = this.nameFocused && Math.floor(this.time * 2) % 2 ? '_' : '';
        ctx.fillText(this.nameInput + caret, nx + 8, ny + 22);
        this.clickRegions.push({ x: nx, y: ny, w: nw, h: nh, action: 'focusName' });
      }

      // Single unified PLAY button
      const playLabel = session ? '⚔ ENTER REALM' : '⚔ PLAY';
      this.button(516, 452, 180, 34, playLabel, 'start', { color: '#3f7d55', border: '#8ee6a8', fontSize: 13 });

      // Switch Account button (smaller, for returning players or manual login)
      if (session) {
        this.button(710, 452, 140, 34, 'SWITCH ACCT (O)', 'switchAccount', { color: '#34405c', border: '#7d89a8', fontSize: 9 });
      } else {
        this.button(710, 452, 140, 34, 'LOGIN (O)', 'openLogin', { color: '#2f5f8c', border: '#8ee6ff', fontSize: 9 });
      }

      ctx.textAlign = 'center';
      ctx.font = '10px monospace';
      ctx.fillStyle = '#7f8ca5';
      if (session) {
        ctx.fillText(`Welcome back! Press ENTER REALM to rejoin the shared world.`, VIEW_W / 2, 510);
        ctx.fillStyle = '#58668a';
        ctx.fillText('Switch Account clears your saved session. Your hero stays safe on the server.', VIEW_W / 2, 526);
      } else {
        ctx.fillText('Pick a class, name your hero, and press PLAY to enter the shared online realm!', VIEW_W / 2, 516);
      }
    }

    drawConnectingScreen() {
      const ctx = this.ctx;
      const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
      grad.addColorStop(0, '#151c33');
      grad.addColorStop(1, '#24182f');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);

      // Animated dots
      const dots = '.'.repeat(1 + Math.floor(this.time * 2) % 3);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd75e';
      ctx.font = 'bold 28px monospace';
      ctx.fillText('ENTERING REALM' + dots, VIEW_W / 2, VIEW_H / 2 - 20);

      ctx.fillStyle = '#8ee6ff';
      ctx.font = '14px monospace';
      ctx.fillText('Connecting to the shared world server', VIEW_W / 2, VIEW_H / 2 + 20);

      // Pulsing ring animation
      const pulse = (Math.sin(this.time * 4) + 1) * 0.5;
      ctx.strokeStyle = `rgba(142, 230, 255, ${0.3 + pulse * 0.4})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(VIEW_W / 2, VIEW_H / 2 + 60, 12 + pulse * 8, 0, TAU);
      ctx.stroke();

      ctx.fillStyle = '#58668a';
      ctx.font = '10px monospace';
      ctx.fillText('If this takes too long, offline mode will start automatically.', VIEW_W / 2, VIEW_H - 40);
    }

    drawInventoryPanel() {
      const ctx = this.ctx;
      const p = this.player;
      const x = 158;
      const y = 48;
      const w = 644;
      const h = 446;
      panel(ctx, x, y, w, h, 'Inventory (I) - drag items into equipment slots');

      const drawItemCell = (cx, cy, size, item, source) => {
        ctx.fillStyle = '#111827';
        ctx.fillRect(cx, cy, size, size);
        const color = item ? RARITY[item.rarity].color : '#3b455d';
        ctx.strokeStyle = color;
        const selected = item && item.uid === this.selectedItemUid;
        ctx.strokeStyle = selected ? '#ffd75e' : color;
        ctx.lineWidth = selected ? 3 : item ? 2 : 1;
        ctx.strokeRect(cx + 0.5, cy + 0.5, size - 1, size - 1);
        if (item) {
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.12;
          ctx.fillRect(cx + 6, cy + 6, size - 12, size - 12);
          ctx.globalAlpha = 1;
          drawItemImage(ctx, item, cx + 6, cy + 6, size - 12);
          if (item.slot === 'consumable' && (item.quantity || 1) > 1) {
            ctx.fillStyle = 'rgba(5,8,15,0.9)';
            ctx.fillRect(cx + size - 27, cy + size - 18, 23, 14);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 9px monospace';
            ctx.textAlign = 'right';
            ctx.fillText(`x${item.quantity}`, cx + size - 6, cy + size - 8);
          }
        }
        this.dropRegions.push({ x: cx, y: cy, w: size, h: size, item, source });
      };

      // 6 Equipment slots in 2 columns of 3
      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = '#dbe6ff';
      ctx.textAlign = 'left';

      // Left column: Weapon, Helmet, Ring
      ctx.fillText('Weapon', x + 20, y + 54);
      drawItemCell(x + 20, y + 58, 48, p.equipment.weapon, { type: 'equip', slot: 'weapon' });

      ctx.fillText('Helmet', x + 20, y + 120);
      drawItemCell(x + 20, y + 124, 48, p.equipment.helmet, { type: 'equip', slot: 'helmet' });

      ctx.fillText('Ring', x + 20, y + 186);
      drawItemCell(x + 20, y + 190, 48, p.equipment.ring, { type: 'equip', slot: 'ring' });

      // Right column: Armor, Boots, Necklace
      ctx.fillText('Armor', x + 74, y + 54);
      drawItemCell(x + 74, y + 58, 48, p.equipment.armor, { type: 'equip', slot: 'armor' });

      ctx.fillText('Boots', x + 74, y + 120);
      drawItemCell(x + 74, y + 124, 48, p.equipment.boots, { type: 'equip', slot: 'boots' });

      ctx.fillText('Necklace', x + 74, y + 186);
      drawItemCell(x + 74, y + 190, 48, p.equipment.necklace, { type: 'equip', slot: 'necklace' });

      ctx.font = '10px monospace';
      ctx.fillStyle = '#9fb0cd';
      const lines = [
        `ATK  ${Math.round(p.finalStats.attack)}`,
        `DEF  ${p.finalStats.defense.toFixed(1)}`,
        `HP   ${p.maxHp}`,
        `SPD  ${Math.round(p.finalStats.speed)}`,
        `CRIT ${((p.finalStats.crit || 0.1) * 100).toFixed(0)}%`,
        `Gold ${p.gold}`
      ];
      lines.forEach((line, i) => ctx.fillText(line, x + 20, y + 254 + i * 14));

      // 5x4 bag grid.
      const gx = x + 132;
      const gy = y + 66;
      const cell = 54;
      const gap = 5;
      ctx.font = 'bold 11px monospace';
      ctx.fillStyle = '#dbe6ff';
      ctx.fillText(`Bag (${p.inventory.length}/20)`, gx, y + 58);
      for (let i = 0; i < 20; i++) {
        const cx = gx + (i % 5) * (cell + gap);
        const cy = gy + Math.floor(i / 5) * (cell + gap);
        drawItemCell(cx, cy, cell, p.inventory[i] || null, { type: 'inv', index: i });
      }

      // Info column: rarity legend and selected item details.
      const ix = x + 452;
      ctx.font = 'bold 11px monospace';
      ctx.fillStyle = '#dbe6ff';
      ctx.fillText('Rarity', ix, y + 58);
      ['common', 'rare', 'epic'].forEach((r, i) => {
        ctx.fillStyle = RARITY[r].color;
        ctx.fillText(RARITY[r].label, ix, y + 80 + i * 18);
      });
      const selectedInBag = p.inventory.find(item => item.uid === this.selectedItemUid) || null;
      const selectedItem = selectedInBag || Object.values(p.equipment).find(item => item && item.uid === this.selectedItemUid) || null;
      if (selectedItem) {
        ctx.font = 'bold 10px monospace';
        ctx.fillStyle = RARITY[selectedItem.rarity].color;
        wrappedText(ctx, selectedItem.name, ix, y + 150, 174, 13, 2);
        ctx.font = '10px monospace';
        ctx.fillStyle = '#9fb0cd';
        const requiredClass = selectedItem.slot === 'weapon' ? (weaponClassFor(selectedItem) || selectedItem.classId) : selectedItem.classId;
        const requirement = requiredClass ? `${CLASS_DATA[requiredClass]?.name || requiredClass} only` : 'Any role';
        ctx.fillText(`${selectedItem.slot.toUpperCase()} | ${requirement}`, ix, y + 180);
        ctx.fillStyle = '#dbe6ff';
        if (selectedItem.slot === 'consumable') ctx.fillText(`Quantity: ${selectedItem.quantity || 1}`, ix, y + 193);
        wrappedText(ctx, itemStatsText(selectedItem), ix, y + (selectedItem.slot === 'consumable' ? 210 : 199), 174, 13, 4);
        if (selectedItem.desc) {
          ctx.fillStyle = '#8290aa';
          wrappedText(ctx, selectedItem.desc, ix, y + 254, 174, 12, 3);
        }
      } else {
        ctx.font = '10px monospace';
        ctx.fillStyle = '#9fb0cd';
        wrappedText(ctx, 'Select an item to view its role requirement and attributes. Double-click gear to equip; drag items to rearrange.', ix, y + 150, 174, 15, 7);
      }

      const isGear = selectedItem && (selectedItem.slot === 'weapon' || selectedItem.slot === 'armor');
      const canEquipSelected = !!selectedInBag && isGear && itemCanEquip(selectedItem, p.classId);
      const equipLabel = canEquipSelected ? `EQUIP ${selectedItem.slot.toUpperCase()}`
        : isGear ? `${CLASS_DATA[selectedItem.classId]?.name || 'OTHER'} ONLY` : 'SELECT GEAR TO EQUIP';
      this.button(x + 452, y + 310, 160, 28, equipLabel, 'equipSelectedItem', {
        color: canEquipSelected ? '#3f7d55' : '#34405c',
        border: canEquipSelected ? '#8ee6a8' : '#59647a',
        fontSize: 10
      });
      const canManageSelected = !!selectedInBag;
      const sellValue = canManageSelected ? itemSellValue(selectedInBag) : 0;
      this.button(x + 452, y + 340, 78, 24, canManageSelected ? `SELL +${sellValue}` : 'SELL', 'sellSelectedItem', {
        color: canManageSelected ? '#75612b' : '#34405c',
        border: canManageSelected ? '#ffd75e' : '#59647a',
        fontSize: 9
      });
      this.button(x + 534, y + 340, 78, 24, canManageSelected ? `DISCARD x${selectedInBag.quantity || 1}` : 'DISCARD', 'discardSelectedItem', {
        color: canManageSelected ? '#713b43' : '#34405c',
        border: canManageSelected ? '#ff9b9b' : '#59647a',
        fontSize: 9
      });
      this.button(x + 452, y + 370, 160, 24, 'SKILLS (K)', 'openSkills', { color: '#4a3f7a' });
      const selectedConsumable = selectedItem && selectedItem.slot === 'consumable';
      this.button(x + 452, y + 400, 160, 24,
        selectedConsumable && selectedItem.teleportTo ? 'USE SCROLL (Q)' : 'USE POTION (Q)', 'potion', { color: '#6b3542' });
      this.button(x + 452, y + 422, 160, 24, 'CLOSE', 'closePanel', { color: '#34405c' });
    }

    drawSkillsPanel() {
      const ctx = this.ctx;
      const p = this.player;
      const x = 226;
      const y = 60;
      const w = 508;
      const h = 424;
      panel(ctx, x, y, w, h, `Skills (K) - ${p.skillPoints} upgrade point${p.skillPoints === 1 ? '' : 's'}`);
      const skills = SKILLS[p.classId];
      skills.forEach((def, i) => {
        const bx = x + 18;
        const by = y + 44 + i * 82;
        ctx.fillStyle = 'rgba(18,26,44,0.9)';
        ctx.fillRect(bx, by, w - 36, 72);
        ctx.strokeStyle = CLASS_DATA[p.classId].color;
        ctx.strokeRect(bx + 0.5, by + 0.5, w - 37, 71);
        drawSkillIcon(ctx, p.classId, i, bx + 8, by + 15, 42, false, this.time);
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#fff';
        ctx.fillText(`${i + 1}. ${def.name}`, bx + 60, by + 22);
        ctx.font = '11px monospace';
        ctx.fillStyle = '#9fb0cd';
        ctx.fillText(`Rank ${p.skillRanks[i]}/5   Cost ${def.cost}   Cooldown ${def.cd.toFixed(1)}s`, bx + 60, by + 39);
        ctx.fillStyle = '#dbe6ff';
        ctx.font = '10px monospace';
        wrappedText(ctx, def.desc, bx + 60, by + 54, 252, 12, 2);
        const canUpgrade = p.skillPoints > 0 && p.skillRanks[i] < 5;
        this.button(bx + 344, by + 20, 118, 32,
          p.skillRanks[i] >= 5 ? 'MAX' : '+ UPGRADE', 'upgrade' + i,
          { color: canUpgrade ? '#3f7d55' : '#394154', textColor: canUpgrade ? '#fff' : '#8c97ad' });
      });
      this.button(x + 174, y + 378, 160, 32, 'BACK TO BAG', 'openInventory', { color: '#34405c' });
      this.button(x + 348, y + 378, 136, 32, 'CLOSE', 'closePanel', { color: '#34405c' });
    }

    drawShopPanel() {
      const ctx = this.ctx;
      const x = 178;
      const y = 54;
      const w = 604;
      const h = 432;
      panel(ctx, x, y, w, h, `Shop - Merchant Mina (your gold: ${this.player.gold})`);
      this.shopStock.forEach((item, i) => {
        const bx = x + 18 + (i % 2) * 290;
        const by = y + 44 + Math.floor(i / 2) * 116;
        ctx.fillStyle = 'rgba(16,23,39,0.95)';
        ctx.fillRect(bx, by, 274, 104);
        ctx.strokeStyle = RARITY[item.rarity].color;
        ctx.lineWidth = 2;
        ctx.strokeRect(bx + 1, by + 1, 272, 102);
        ctx.fillStyle = RARITY[item.rarity].color;
        ctx.globalAlpha = 0.18;
        ctx.fillRect(bx + 8, by + 10, 24, 24);
        ctx.globalAlpha = 1;
        drawItemImage(ctx, item, bx + 8, by + 10, 24);
        ctx.font = 'bold 12px monospace';
        ctx.fillStyle = RARITY[item.rarity].color;
        ctx.fillText(item.name, bx + 40, by + 22);
        ctx.font = '10px monospace';
        ctx.fillStyle = '#c8d3ea';
        const roleText = item.classId ? `${CLASS_DATA[item.classId]?.name || item.classId} only | ` : '';
        wrappedText(ctx, roleText + itemStatsText(item), bx + 40, by + 38, 222, 13, 2);
        ctx.fillStyle = '#ffd75e';
        ctx.fillText(`${item.price}g`, bx + 10, by + 84);
        this.button(bx + 172, by + 68, 90, 28, 'BUY', 'shopBuy' + i,
          { color: this.player.gold >= item.price ? '#3f7d55' : '#4a3340' });
      });
      this.button(x + 232, y + 394, 140, 28, 'CLOSE (F)', 'closePanel', { color: '#34405c' });
    }

    drawQuestPanel() {
      const ctx = this.ctx;
      const x = 248;
      const y = 88;
      const w = 464;
      const h = 356;
      const chapterIndex = clamp(Math.floor(Number(this.quest.stage) || 1), 1, QUEST_CHAPTERS.length);
      const chapter = questChapter(chapterIndex);
      panel(ctx, x, y, w, h, `Quest - Chapter ${chapterIndex}/3: ${chapter.title}`);
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#dbe6ff';
      wrappedText(ctx, chapter.story, x + 24, y + 52, w - 48, 16, 3);
      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = '#ffd75e';
      ctx.fillText('CHAPTER OBJECTIVE', x + 24, y + 105);
      const firstProgress = chapterIndex === 3 ? this.quest.scouts / 8 : chapterIndex === 2 ? this.quest.goblins / 8 : this.quest.kills / 10;
      const secondProgress = chapterIndex === 3 ? this.quest.essence / 3 : chapterIndex === 2 ? this.quest.ore / 4 : this.quest.herbs / 5;
      const firstLabel = chapterIndex === 3 ? `Scouts: ${this.quest.scouts}/8` : chapterIndex === 2 ? `Goblins: ${this.quest.goblins}/8` : `Slimes: ${this.quest.kills}/10`;
      const secondLabel = chapterIndex === 3 ? `Essence: ${this.quest.essence}/3` : chapterIndex === 2 ? `Ore: ${this.quest.ore}/4` : `Herbs: ${this.quest.herbs}/5`;
      drawBar(ctx, x + 24, y + 116, w - 48, 16, firstProgress, '#ff8c42', firstLabel);
      drawBar(ctx, x + 24, y + 142, w - 48, 16, secondProgress, '#6ee787', secondLabel);
      ctx.textAlign = 'left';
      ctx.font = '11px monospace';
      ctx.fillStyle = '#9fb0cd';
      ctx.fillStyle = '#ffd75e';
      ctx.font = 'bold 10px monospace';
      wrappedText(ctx, `Reward: ${chapter.rewards}`, x + 24, y + 182, w - 48, 14, 2);
      ctx.fillStyle = '#9fb0cd';
      ctx.font = '11px monospace';
      const status = this.quest.claimed ? 'Campaign complete. The three wardstones are safe—for now.'
        : this.quest.complete ? chapterIndex < QUEST_CHAPTERS.length
          ? 'Objectives complete! Return to Elder Tarn to reveal the next chapter.'
          : 'Objectives complete! Return to Elder Tarn to claim your reward.'
          : this.quest.active ? 'Quest in progress. Follow the trail and report back to Elder Tarn.'
            : 'Accept this chapter from Elder Tarn to begin.';
      wrappedText(ctx, status, x + 24, y + 210, w - 48, 14, 3);
      if (this.quest.claimed) {
        this.button(x + 162, y + 294, 140, 32, 'CLOSE', 'closePanel', { color: '#34405c' });
      } else if (this.quest.complete) {
        this.button(x + 72, y + 294, 150, 32, 'TURN IN', 'questTurnIn', { color: '#3f7d55' });
        this.button(x + 242, y + 294, 150, 32, 'LATER', 'closePanel', { color: '#34405c' });
      } else if (this.quest.active) {
        this.button(x + 72, y + 294, 150, 32, 'IN PROGRESS', 'closePanel', { color: '#34405c' });
        this.button(x + 242, y + 294, 150, 32, 'CLOSE', 'closePanel', { color: '#34405c' });
      } else {
        this.button(x + 72, y + 294, 150, 32, 'ACCEPT QUEST', 'questAccept', { color: '#5b4b8c' });
        this.button(x + 242, y + 294, 150, 32, 'LATER', 'closePanel', { color: '#34405c' });
      }
    }

    // EXPANSION 4: auction house.
    drawAuctionPanel() {
      const ctx = this.ctx;
      const x = 130;
      const y = 40;
      const w = 700;
      const h = 462;
      panel(ctx, x, y, w, h, 'Auction House (B) - online only');
      if (!this.network.online || !this.player) {
        ctx.fillStyle = '#ff9b9b';
        ctx.font = '13px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Log in to the Node server to use auctions.', VIEW_W / 2, y + 180);
        this.button(x + 270, y + 390, 160, 30, 'CLOSE', 'closePanel', { color: '#34405c' });
        return;
      }

      const p = this.player;
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#dbe6ff';
      ctx.fillText('Your bag - click an item to select', x + 20, y + 46);
      const cell = 40;
      p.inventory.slice(0, 20).forEach((item, i) => {
        const cx = x + 20 + (i % 5) * (cell + 5);
        const cy = y + 56 + Math.floor(i / 5) * (cell + 5);
        const selected = item.uid === this.selectedItemUid;
        ctx.fillStyle = '#111827';
        ctx.fillRect(cx, cy, cell, cell);
        ctx.strokeStyle = selected ? '#ffd75e' : RARITY[item.rarity].color;
        ctx.lineWidth = selected ? 3 : 1;
        ctx.strokeRect(cx + 0.5, cy + 0.5, cell - 1, cell - 1);
        drawItemImage(ctx, item, cx + 5, cy + 5, cell - 10);
        this.clickRegions.push({ x: cx, y: cy, w: cell, h: cell, action: 'selectItem:' + i });
      });

      const chosen = this.selectedInventoryItem();
      ctx.font = '11px monospace';
      ctx.fillStyle = chosen ? RARITY[chosen.rarity].color : '#9aa6bd';
      ctx.fillText(chosen ? `Selected: ${chosen.name} (+${chosen.enchant || 0})` : 'Your bag is empty.', x + 20, y + 246);
      this.drawTextField(x + 20, y + 272, 110, 26, 'ASKING PRICE (gold)', this.actionText, 'auctionPrice', 8);
      this.button(x + 140, y + 272, 118, 26, 'LIST ITEM', 'auctionAdd', { color: '#3f7d55' });
      this.button(x + 266, y + 272, 100, 26, 'REFRESH', 'auctionRefresh', { color: '#34405c' });

      ctx.fillStyle = '#dbe6ff';
      ctx.font = 'bold 11px monospace';
      ctx.fillText('Live listings', x + 392, y + 46);
      const listings = this.networkData.auction.slice(0, 10);
      if (!listings.length) {
        ctx.fillStyle = '#9aa6bd';
        ctx.font = '10px monospace';
        ctx.fillText('No items listed yet.', x + 392, y + 70);
      }
      listings.forEach((row, i) => {
        const item = normalizeItem(row.item || row);
        const ry = y + 60 + i * 34;
        ctx.fillStyle = 'rgba(18,26,44,0.9)';
        ctx.fillRect(x + 392, ry, 286, 30);
        ctx.strokeStyle = item ? RARITY[item.rarity].color : '#58668a';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 392.5, ry + 0.5, 285, 29);
        ctx.textAlign = 'left';
        ctx.font = '10px monospace';
        if (item) drawItemImage(ctx, item, x + 398, ry + 2, 26);
        ctx.fillStyle = item ? RARITY[item.rarity].color : '#dbe6ff';
        ctx.fillText(item ? item.name : 'Item', x + 428, ry + 13, 116);
        ctx.fillStyle = '#ffd75e';
        ctx.fillText(`${row.price || 0}g`, x + 550, ry + 19, 62);
        const seller = String(row.ownerName || row.seller || row.username || '');
        ctx.fillStyle = '#9aa6bd';
        ctx.fillText(seller || 'Unknown seller', x + 428, ry + 25, 116);
        if (seller === this.loginFields.username) {
          this.button(x + 626, ry + 3, 46, 24, 'CANCEL', 'auctionRemove:' + row.id, { color: '#6b3542', fontSize: 8 });
        } else {
          this.button(x + 626, ry + 3, 46, 24, 'BUY', 'auctionBuy:' + row.id, { color: '#3f7d55', fontSize: 8 });
        }
      });
      this.button(x + 270, y + 408, 160, 30, 'CLOSE', 'closePanel', { color: '#34405c' });
    }

    // EXPANSION 4: mail with items and gold.
    drawMailPanel() {
      const ctx = this.ctx;
      const x = 130;
      const y = 40;
      const w = 700;
      const h = 462;
      panel(ctx, x, y, w, h, 'Mailbox (M) - online only');
      if (!this.network.online || !this.player) {
        ctx.fillStyle = '#ff9b9b';
        ctx.font = '13px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Log in to the Node server to send mail.', VIEW_W / 2, y + 180);
        this.button(x + 270, y + 390, 160, 30, 'CLOSE', 'closePanel', { color: '#34405c' });
        return;
      }

      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#dbe6ff';
      ctx.fillText('Send a package', x + 20, y + 46);
      this.drawTextField(x + 20, y + 64, 160, 26, 'TO USERNAME', this.actionText, 'mailTo', 24);
      this.drawTextField(x + 190, y + 64, 90, 26, 'GOLD', this.actionGold, 'mailGold', 8);
      this.drawTextField(x + 20, y + 116, 260, 44, 'MESSAGE', this.actionMessage, 'mailMessage', 60);

      const chosen = this.selectedInventoryItem();
      ctx.font = '10px monospace';
      ctx.fillStyle = chosen ? RARITY[chosen.rarity].color : '#9aa6bd';
      ctx.fillText(chosen ? `Attached: ${chosen.name}` : 'No item attached (bag is empty).', x + 20, y + 180);
      ctx.fillStyle = '#9fb0cd';
      ctx.fillText('Choose an attachment from your bag:', x + 20, y + 202);
      this.player.inventory.slice(0, 10).forEach((item, i) => {
        const cx = x + 20 + i * 28;
        const cy = y + 212;
        ctx.fillStyle = '#111827';
        ctx.fillRect(cx, cy, 24, 24);
        ctx.strokeStyle = item.uid === this.selectedItemUid ? '#ffd75e' : RARITY[item.rarity].color;
        ctx.lineWidth = item.uid === this.selectedItemUid ? 2 : 1;
        ctx.strokeRect(cx + 0.5, cy + 0.5, 23, 23);
        drawItemImage(ctx, item, cx + 2, cy + 2, 20);
        this.clickRegions.push({ x: cx, y: cy, w: 24, h: 24, action: 'selectItem:' + i });
      });

      this.button(x + 20, y + 250, 120, 28, 'SEND MAIL', 'mailSend', { color: '#3f7d55' });
      this.button(x + 150, y + 250, 100, 28, 'REFRESH', 'mailRefresh', { color: '#34405c' });

      ctx.fillStyle = '#dbe6ff';
      ctx.font = 'bold 11px monospace';
      ctx.fillText('Inbox', x + 300, y + 46);
      const mail = this.networkData.mail.slice(0, 10);
      if (!mail.length) {
        ctx.fillStyle = '#9aa6bd';
        ctx.font = '10px monospace';
        ctx.fillText('No mail.', x + 300, y + 70);
      }
      mail.forEach((row, i) => {
        const item = row.item ? normalizeItem(row.item) : null;
        const ry = y + 58 + i * 32;
        ctx.fillStyle = 'rgba(18,26,44,0.9)';
        ctx.fillRect(x + 300, ry, 378, 30);
        ctx.strokeStyle = item ? RARITY[item.rarity].color : '#58668a';
        ctx.strokeRect(x + 300.5, ry + 0.5, 377, 29);
        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#8ee6ff';
        ctx.fillText(`From: ${row.fromName || row.from || row.sender || row.username || 'Unknown'}`, x + 308, ry + 13, 150);
        ctx.fillStyle = '#dbe6ff';
        ctx.fillText(String(row.message || ''), x + 308, ry + 25, 150);
        if (item) {
          drawItemImage(ctx, item, x + 464, ry + 2, 20);
          ctx.fillStyle = RARITY[item.rarity].color;
          ctx.fillText(item.name, x + 488, ry + 13, 126);
        }
        if (row.gold) {
          ctx.fillStyle = '#ffd75e';
          ctx.fillText(`${row.gold}g`, x + 470, ry + 25);
        }
        this.button(x + 626, ry + 3, 44, 24, 'TAKE', 'mailTake:' + row.id, { color: '#3f7d55', fontSize: 8 });
      });
      this.button(x + 270, y + 408, 160, 30, 'CLOSE', 'closePanel', { color: '#34405c' });
    }

    // EXPANSION 4: guilds and guild chat.
    drawGuildPanel() {
      const ctx = this.ctx;
      const x = 190;
      const y = 50;
      const w = 580;
      const h = 440;
      panel(ctx, x, y, w, h, 'Guild (G) - online only');
      if (!this.network.online) {
        ctx.fillStyle = '#ff9b9b';
        ctx.font = '13px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Log in to the Node server to join a guild.', VIEW_W / 2, y + 180);
        this.button(x + 210, y + 380, 160, 30, 'CLOSE', 'closePanel', { color: '#34405c' });
        return;
      }

      const guild = this.networkData.guild;
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#c9a6ff';
      ctx.fillText(guild && guild.name ? `GUILD: ${guild.name}` : 'You are not in a guild yet.', x + 24, y + 52);

      if (!guild || !guild.name) {
        this.drawTextField(x + 24, y + 92, 300, 28, 'GUILD NAME', this.actionText, 'guildName', 24);
        this.button(x + 24, y + 138, 140, 30, 'CREATE', 'guildCreate', { color: '#3f7d55' });
        this.button(x + 176, y + 138, 140, 30, 'JOIN BY NAME', 'guildJoin', { color: '#2f5f8c' });
      } else {
        const raid = guild.weeklyRaid || { kills: 0, target: 3, rewardGold: 150 };
        drawBar(ctx, x + 24, y + 62, 420, 12, (raid.kills || 0) / (raid.target || 3), '#c9a6ff', `Weekly Raid: ${raid.kills || 0}/${raid.target || 3} bosses`);
        ctx.textAlign = 'left';
        ctx.font = '9px monospace';
        ctx.fillStyle = '#9fb0cd';
        ctx.fillText(`Reward: ${raid.rewardGold || 150} gold for guild members on the raid team`, x + 24, y + 84);
        const members = Array.isArray(guild.members) ? guild.members : [];
        ctx.font = '11px monospace';
        ctx.fillStyle = '#dbe6ff';
        ctx.fillText(`Members (${members.length})`, x + 24, y + 102);
        members.slice(0, 14).forEach((m, i) => {
          ctx.fillStyle = m.rank === 'leader' ? '#ffd75e' : '#dbe6ff';
          ctx.fillText(`${i + 1}. ${m.name}  Lv ${m.level || 1}  [${m.rank || 'member'}]`, x + 30, y + 124 + i * 18, 390);
        });
        this.button(x + 24, y + 372, 140, 28, 'GUILD CHAT', 'chatGuild', { color: '#5b4b8c' });
        this.button(x + 176, y + 372, 140, 28, 'LEAVE GUILD', 'guildLeave', { color: '#6b3542' });
      }
      this.button(x + 336, y + 372, 110, 28, 'REFRESH', 'guildRefresh', { color: '#34405c' });
      this.button(x + 210, y + 404, 160, 26, 'CLOSE', 'closePanel', { color: '#34405c' });
    }

    // EXPANSION 5: crafting and enchanting.
    drawCraftPanel() {
      const ctx = this.ctx;
      const x = 140;
      const y = 42;
      const w = 680;
      const h = 456;
      panel(ctx, x, y, w, h, 'Crafting & Enchanting (R)');
      const p = this.player;
      if (!p) return;
      const m = p.materials || { herb: 0, ore: 0, essence: 0 };
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#8ee6a8';
      ctx.fillText(`Herbs: ${m.herb || 0}    Ore: ${m.ore || 0}    Essence: ${m.essence || 0}    Gold: ${p.gold}`, x + 20, y + 48);

      const recipes = [
        { id: 'potion', name: 'Health Potion', cost: '2 herbs + 20 gold', desc: 'Restores 55 HP.' },
        { id: 'sword', name: 'Runed Edge', cost: '3 ore + 60 gold', desc: 'Rare flame weapon, +12 attack.' },
        { id: 'armor', name: 'Woven Guard', cost: '2 ore + 2 herbs + 50 gold', desc: 'Rare frost armor, +24 HP / +5 defense.' }
      ];
      recipes.forEach((r, i) => {
        const rx = x + 20 + i * 220;
        const ry = y + 70;
        ctx.fillStyle = 'rgba(18,26,44,0.9)';
        ctx.fillRect(rx, ry, 206, 128);
        ctx.strokeStyle = '#58668a';
        ctx.strokeRect(rx + 0.5, ry + 0.5, 205, 127);
        ctx.font = 'bold 12px monospace';
        ctx.fillStyle = '#fff';
        ctx.fillText(r.name, rx + 12, ry + 24);
        ctx.font = '10px monospace';
        ctx.fillStyle = '#ffd75e';
        ctx.fillText(r.cost, rx + 12, ry + 46);
        ctx.fillStyle = '#9fb0cd';
        wrappedText(ctx, r.desc, rx + 12, ry + 66, 182, 13, 3);
        const canCraft = this.network.online && (r.id !== 'sword' || p.classId === 'swordsman');
        this.button(rx + 12, ry + 96, 182, 24,
          r.id === 'sword' && p.classId !== 'swordsman' ? 'SWORDSMAN ONLY' : 'CRAFT', 'craft:' + r.id,
          { color: canCraft ? '#3f7d55' : '#4a3340', fontSize: 9 });
      });

      ctx.fillStyle = '#dbe6ff';
      ctx.font = 'bold 11px monospace';
      ctx.fillText('Enchant a weapon or armor piece', x + 20, y + 228);
      const chosen = this.selectedInventoryItem();
      ctx.font = '10px monospace';
      ctx.fillStyle = chosen ? RARITY[chosen.rarity].color : '#9aa6bd';
      ctx.fillText(chosen ? `Selected: ${chosen.name}  +${chosen.enchant || 0}  ${chosen.effect || ''}` : 'Your bag is empty.', x + 20, y + 250);
      this.player.inventory.slice(0, 20).forEach((item, i) => {
        const cx = x + 20 + (i % 10) * 44;
        const cy = y + 264 + Math.floor(i / 10) * 46;
        ctx.fillStyle = '#111827';
        ctx.fillRect(cx, cy, 40, 40);
        ctx.strokeStyle = item.uid === this.selectedItemUid ? '#ffd75e' : (item.color || RARITY[item.rarity].color);
        ctx.lineWidth = item.uid === this.selectedItemUid ? 3 : 1;
        ctx.strokeRect(cx + 0.5, cy + 0.5, 39, 39);
        drawItemImage(ctx, item, cx + 4, cy + 4, 32);
        this.clickRegions.push({ x: cx, y: cy, w: 40, h: 40, action: 'selectItem:' + i });
      });

      const enchantCost = chosen ? 1 + (chosen.enchant || 0) : 1;
      const goldCost = chosen ? 40 * (1 + (chosen.enchant || 0)) : 40;
      ctx.fillStyle = '#9fb0cd';
      ctx.font = '10px monospace';
      ctx.fillText(`Next enchant: ${enchantCost} essence + ${goldCost} gold. Max +5.`, x + 20, y + 366);
      ctx.fillText('Effects cycle: flame, frost, void, thunder. Each rank adds stats and glow pixels.', x + 20, y + 384);
      this.button(x + 20, y + 400, 170, 30, 'ENCHANT ITEM', 'enchant', { color: this.network.online ? '#5b4b8c' : '#4a3340' });
      this.button(x + 500, y + 400, 160, 30, 'CLOSE', 'closePanel', { color: '#34405c' });
    }

    // EXPANSION 5: talent tree + specializations.
    drawTalentsPanel() {
      const ctx = this.ctx;
      const x = 100;
      const y = 36;
      const w = 760;
      const h = 468;
      const p = this.player;
      panel(ctx, x, y, w, h, `Talents & Specialization (T) - ${p ? p.skillPoints : 0} points`);
      if (!p) return;

      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#dbe6ff';
      ctx.fillText(`Level ${p.level}    Class ${CLASS_DATA[p.classId].name}    Specialization: ${p.spec || 'none'}`, x + 20, y + 46);

      TALENTS.forEach((t, i) => {
        const tx = x + 20 + (i % 3) * 240;
        const ty = y + 66 + Math.floor(i / 3) * 104;
        const rank = Math.max(0, Math.min(3, Number((p.talents || {})[t.id]) || 0));
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(18,26,44,0.92)';
        ctx.fillRect(tx, ty, 226, 92);
        ctx.strokeStyle = rank > 0 ? '#c9a6ff' : '#58668a';
        ctx.strokeRect(tx + 0.5, ty + 0.5, 225, 91);
        ctx.font = 'bold 12px monospace';
        ctx.fillStyle = '#fff';
        ctx.fillText(t.name, tx + 10, ty + 22);
        ctx.font = '10px monospace';
        ctx.fillStyle = '#9fb0cd';
        wrappedText(ctx, t.desc, tx + 10, ty + 40, 206, 12, 1);
        ctx.fillStyle = '#ffd75e';
        ctx.fillText(`${rank}/3`, tx + 10, ty + 78);
        const canRank = p.skillPoints > 0 && rank < 3;
        this.button(tx + 150, ty + 60, 66, 26, rank >= 3 ? 'MAX' : '+ RANK', 'talent:' + t.id,
          { color: canRank ? '#5b4b8c' : '#4a3340', fontSize: 9 });
      });

      const specList = SPECS[p.classId] || [];
      ctx.textAlign = 'left';
      ctx.fillStyle = '#dbe6ff';
      ctx.font = 'bold 11px monospace';
      ctx.fillText('Class specialization (unlocks at level 10)', x + 20, y + 290);
      specList.forEach((s, i) => {
        const sx = x + 20 + i * 360;
        const sy = y + 304;
        ctx.fillStyle = 'rgba(18,26,44,0.92)';
        ctx.fillRect(sx, sy, 344, 74);
        ctx.strokeStyle = p.spec === s.id ? '#ffd75e' : '#58668a';
        ctx.lineWidth = p.spec === s.id ? 2 : 1;
        ctx.strokeRect(sx + 0.5, sy + 0.5, 343, 73);
        ctx.textAlign = 'left';
        ctx.font = 'bold 12px monospace';
        ctx.fillStyle = p.spec === s.id ? '#ffd75e' : '#fff';
        ctx.fillText(s.id, sx + 10, sy + 24);
        ctx.font = '10px monospace';
        ctx.fillStyle = '#9fb0cd';
        wrappedText(ctx, s.desc, sx + 10, sy + 44, 220, 12, 2);
        if (p.spec !== s.id) {
          this.button(sx + 244, sy + 40, 90, 26, p.level < 10 ? 'LVL 10' : 'CHOOSE', 'spec:' + s.id,
            { color: p.level >= 10 && !p.spec ? '#3f7d55' : '#4a3340', fontSize: 9 });
        }
      });

      ctx.textAlign = 'left';
      ctx.fillStyle = '#9aa6bd';
      ctx.font = '10px monospace';
      ctx.fillText('Skill ranks can also be upgraded here. K opens the detailed skill panel.', x + 20, y + 398);
      SKILLS[p.classId].forEach((def, i) => {
        this.button(x + 20 + i * 190, y + 410, 176, 26,
          `${def.name}  R${p.skillRanks[i]}/5`, 'upgrade' + i,
          { color: p.skillPoints > 0 && p.skillRanks[i] < 5 ? '#2f5f8c' : '#4a3340', fontSize: 9 });
      });
      this.button(x + 590, y + 410, 150, 26, 'CLOSE', 'closePanel', { color: '#34405c' });
    }

    drawAccountPanel() {
      const ctx = this.ctx;
      const x = 190;
      const y = 60;
      const w = 580;
      const h = 420;
      ctx.fillStyle = 'rgba(4,7,16,0.78)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      panel(ctx, x, y, w, h, 'Account & Device Transfer');

      const username = this.session ? this.session.username : (this.player ? this.player.name : 'Hero');
      const pass = this.session ? this.session.password : 'offline-guest';

      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#8ee6ff';
      ctx.fillText(`Hero Account: ${username}`, x + 30, y + 50);

      ctx.font = '11px monospace';
      ctx.fillStyle = '#9fb0cd';
      ctx.fillText(`Realm Status: ${this.network.online ? '🟢 Online (Shared Persistent Realm)' : '⚪ Offline Mode'}`, x + 30, y + 74);

      ctx.fillStyle = '#ffd75e';
      ctx.font = 'bold 12px monospace';
      ctx.fillText('Play on another Device (Phone, Tablet, or PC):', x + 30, y + 112);

      ctx.font = '11px monospace';
      ctx.fillStyle = '#c8d3ea';
      ctx.fillText('1. Check your Hero Name and Password below.', x + 30, y + 134);
      ctx.fillText('2. Open this game website on your other browser/device.', x + 30, y + 152);
      ctx.fillText('3. Click "SWITCH ACCT / LOGIN (O)" on the title screen.', x + 30, y + 170);
      ctx.fillText('4. Enter your Hero Name & Password to resume playing!', x + 30, y + 188);

      // Current Password display with show/hide
      ctx.fillStyle = '#9fb0cd';
      ctx.font = '11px monospace';
      ctx.fillText('Device Password:', x + 30, y + 224);
      ctx.fillStyle = '#101726';
      ctx.fillRect(x + 160, y + 206, 230, 28);
      ctx.strokeStyle = '#58668a';
      ctx.strokeRect(x + 160.5, y + 206.5, 229, 27);
      ctx.fillStyle = '#8ee6ff';
      ctx.font = '12px monospace';
      ctx.fillText(this.showAccountPassword ? pass : '••••••••••••••••', x + 170, y + 225);

      this.button(x + 400, y + 206, 80, 28, this.showAccountPassword ? 'HIDE' : 'SHOW', 'toggleShowPassword', { color: '#34405c', fontSize: 9 });

      // Change Password field
      ctx.fillStyle = '#9fb0cd';
      ctx.font = '11px monospace';
      ctx.fillText('Set Custom Password:', x + 30, y + 270);
      this.textInput(x + 160, y + 252, 230, 28, 'newAccountPass', this.accountPasswordInput, 24);
      this.button(x + 400, y + 252, 140, 28, 'SET PASSWORD', 'savePassword', { color: '#3f7d55', border: '#8ee6a8', fontSize: 9 });

      // Action buttons
      this.button(x + 30, y + 340, 190, 36, 'SWITCH ACCOUNT', 'switchAccount', { color: '#6b3542', border: '#ff8a9b', fontSize: 10 });
      this.button(x + w - 140, y + 340, 110, 36, 'CLOSE', 'closePanel', { color: '#34405c', fontSize: 11 });
    }

    drawTutorialPanel() {
      const ctx = this.ctx;
      const step = TUTORIAL_STEPS[this.tutorialStep];
      const x = 175;
      const y = 78;
      const w = 610;
      const h = 384;
      ctx.fillStyle = 'rgba(3,7,16,0.78)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      panel(ctx, x, y, w, h, `ADVENTURER'S GUIDE  ${this.tutorialStep + 1}/${TUTORIAL_STEPS.length}`);

      ctx.textAlign = 'left';
      ctx.font = '11px monospace';
      ctx.fillStyle = '#9fb0cd';
      ctx.fillText('Welcome to Hearthvale! Here are the basics for your journey.', x + 26, y + 50);
      ctx.font = 'bold 16px monospace';
      ctx.fillStyle = '#ffd75e';
      ctx.fillText(step.title, x + 26, y + 82);
      ctx.font = '12px monospace';
      ctx.fillStyle = '#dbe6ff';
      wrappedText(ctx, step.body, x + 26, y + 112, w - 52, 19, 4);

      ctx.fillStyle = 'rgba(96,123,172,0.2)';
      ctx.fillRect(x + 24, y + 208, w - 48, 54);
      ctx.strokeStyle = '#53678d';
      ctx.strokeRect(x + 24.5, y + 208.5, w - 49, 53);
      ctx.font = '11px monospace';
      ctx.fillStyle = '#8ee6ff';
      wrappedText(ctx, step.tip, x + 38, y + 231, w - 76, 16, 2);

      const segmentW = 106;
      const segmentGap = 6;
      for (let i = 0; i < TUTORIAL_STEPS.length; i++) {
        ctx.fillStyle = i <= this.tutorialStep ? '#8ee6ff' : '#36425d';
        ctx.fillRect(x + 26 + i * (segmentW + segmentGap), y + 283, segmentW, 5);
      }
      ctx.textAlign = 'center';
      ctx.font = '10px monospace';
      ctx.fillStyle = '#9fb0cd';
      ctx.fillText('Enter / Right: next     Left: back     Esc: skip', VIEW_W / 2, y + 309);

      this.button(x + 24, y + 326, 110, 32, 'BACK', 'tutorialBack',
        { color: this.tutorialStep > 0 ? '#34405c' : '#293248', fontSize: 9 });
      this.button(x + 184, y + 326, 150, 32, 'SKIP TUTORIAL', 'tutorialSkip',
        { color: '#6b3542', fontSize: 9 });
      this.button(x + w - 154, y + 326, 130, 32,
        this.tutorialStep === TUTORIAL_STEPS.length - 1 ? 'START PLAYING' : 'NEXT',
        'tutorialNext', { color: '#3f7d55', fontSize: 9 });
    }

    // STAGE 5: pause menu with volume and a controls reminder.
    drawPauseMenu() {
      const ctx = this.ctx;
      ctx.fillStyle = 'rgba(4,7,15,0.72)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      const x = 294;
      const y = 72;
      const w = 372;
      const h = 398;
      panel(ctx, x, y, w, h, 'PAUSED');
      this.button(x + 24, y + 42, 126, 34, 'TUTORIAL (H)', 'openTutorial', { color: '#5b4b8c', fontSize: 9 });
      this.button(x + 170, y + 42, 176, 34, 'RESUME (Esc)', 'resume', { color: '#3f7d55' });
      this.button(x + 26, y + 88, 150, 30, 'SAVE GAME', 'save', { color: '#34405c' });
      this.button(x + 196, y + 88, 150, 30, 'LOAD GAME', 'load', { color: '#34405c' });

      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#dbe6ff';
      ctx.fillText('VOLUME', x + 26, y + 146);
      drawBar(ctx, x + 100, y + 134, 170, 14, this.settings.volume, '#8ee6ff', `${Math.round(this.settings.volume * 100)}%`);
      this.button(x + 278, y + 130, 34, 22, '-', 'volumeDown', { color: '#34405c' });
      this.button(x + 320, y + 130, 34, 22, '+', 'volumeUp', { color: '#34405c' });

      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffd75e';
      ctx.fillText('CONTROLS', x + 26, y + 186);
      const controls = [
        'WASD / Arrows - move',
        'Space / Click - attack',
        '1 2 3 - class skills',
        'I - bag   K - skills   B - auction',
        'F - interact with NPC/portal',
        'E emote   P invite',
        'Shift+P leave   Alt+P disband (leader)',
        'Q potion   Enter chat   N raid',
        'Tab lock   L unlock   Esc pause',
        'H - open the tutorial'
      ];
      controls.forEach((line, i) => {
        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#b9c7e6';
        ctx.fillText(line, x + 26, y + 206 + i * 14);
      });
      this.button(x + 26, y + 350, 150, 30, 'ACCOUNT / PASS', 'openAccount', { color: '#2f5f8c' });
      this.button(x + 196, y + 350, 150, 30, 'QUIT TO TITLE', 'quitToSelect', { color: '#6b3542' });
    }

    // STAGE 5: on-screen joystick + attack/skill/interact buttons.
    drawMobileControls() {
      const ctx = this.ctx;
      const joy = this.joystick;
      const ox = joy.originX;
      const oy = joy.originY;
      ctx.save();
      ctx.globalAlpha = 0.65;
      ctx.strokeStyle = '#dbe6ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ox, oy, 48, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = '#8ee6ff';
      ctx.beginPath();
      ctx.arc(ox + joy.x * 30, oy + joy.y * 30, 18, 0, TAU);
      ctx.fill();
      ctx.restore();

      const roundButton = (cx, cy, r, label, action, color) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, cx, cy);
        ctx.textBaseline = 'alphabetic';
        this.clickRegions.push({ x: cx - r, y: cy - r, w: r * 2, h: r * 2, action });
      };
      roundButton(VIEW_W - 72, VIEW_H - 76, 34, 'ATK', 'attack', '#b34b55');
      roundButton(VIEW_W - 150, VIEW_H - 58, 24, '1', 'skill0', '#4b6ba8');
      roundButton(VIEW_W - 208, VIEW_H - 50, 22, '2', 'skill1', '#4b6ba8');
      roundButton(VIEW_W - 258, VIEW_H - 44, 20, '3', 'skill2', '#4b6ba8');
      roundButton(VIEW_W - 302, VIEW_H - 38, 18, '4', 'skill3', '#4b6ba8');
      roundButton(VIEW_W - 70, VIEW_H - 158, 24, 'F', 'interact', '#8a6bb8');
      roundButton(VIEW_W - 122, VIEW_H - 138, 20, 'E', 'emote', '#5d7f55');
      roundButton(VIEW_W - 178, VIEW_H - 168, 24,
        this.lockedTargetId == null ? 'LOCK' : 'FREE', 'lockTarget', '#a45a3c');
      roundButton(VIEW_W - 40, VIEW_H - 208, 22, 'MENU', 'toggleMobileMenu', '#3f5f8f');
    }

    // Touch equivalent of the keyboard shortcuts: every PC feature in one drawer.
    drawMobileMenu() {
      const ctx = this.ctx;
      const x = 142;
      const y = 38;
      const w = 676;
      const h = 464;
      ctx.fillStyle = 'rgba(4,7,14,0.72)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      panel(ctx, x, y, w, h,
        `MOBILE MENU - ${this.network.online ? 'ONLINE' : 'OFFLINE'}  SP ${this.player ? this.player.skillPoints : 0}`);

      const items = [
        { label: 'BAG / ITEMS', action: 'openInventory' },
        { label: 'SKILL PTS', action: 'openSkills' },
        { label: 'TALENTS', action: 'openTalents' },
        { label: 'CRAFT', action: 'openCraft' },
        { label: 'AUCTION', action: 'openAuction', online: true },
        { label: 'MAIL', action: 'openMail', online: true },
        { label: 'GUILD', action: 'openGuild', online: true },
        { label: 'QUEST', action: 'openQuest' },
        { label: 'PARTY', action: 'party' },
        { label: 'LEAVE PARTY', action: 'partyLeave' },
        { label: 'DISBAND (LEADER)', action: 'partyDisband' },
        { label: 'POTION', action: 'potion' },
        { label: 'CHAT', action: 'chat' },
        { label: 'RAID', action: 'enterDungeon', online: true },
        { label: 'SETTINGS', action: 'settings', color: '#5b4b8c' },
        { label: 'ACCOUNT', action: 'openAccount', color: '#2f5f8c' },
        { label: 'SAVE', action: 'save' },
        { label: 'CLOSE', action: 'closeMobileMenu', color: '#6b3542' }
      ];
      const cols = 3;
      const bw = 196;
      const bh = 58;
      const gapX = 18;
      const gapY = 12;
      const startX = x + 26;
      const startY = y + 54;
      items.forEach((item, i) => {
        const bx = startX + (i % cols) * (bw + gapX);
        const by = startY + Math.floor(i / cols) * (bh + gapY);
        const hasParty = this.network.online ? !!(this.player && this.player.party) : this.party.length > 0;
        const isLeader = !this.network.online || (this.player && String(this.player.partyLeaderId) === String(this.network.playerId));
        const partyAction = item.action === 'partyLeave' || item.action === 'partyDisband';
        const unavailable = (item.online && !this.network.online) || (partyAction && !hasParty) || (item.action === 'partyDisband' && !isLeader);
        this.button(bx, by, bw, bh, item.label, item.action, {
          color: unavailable ? '#3a3f50' : (item.color || '#34405c'),
          textColor: unavailable ? '#8c97ad' : '#fff',
          fontSize: 11
        });
      });

      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#9fb0cd';
      ctx.fillText('Settings includes volume, save/load and quit.', VIEW_W / 2, y + h - 14);
    }

  }

  // ==========================================================
  // 6. STARTUP: requestAnimationFrame with delta time
  // ==========================================================
  const canvas = document.getElementById('game');
  const game = new Game(canvas);
  window.pixelRealmGame = game; // Handy for debugging in the browser console.

  let lastFrame = performance.now();
  function frame(now) {
    // Cap dt so a background tab does not teleport everyone on return.
    const dt = Math.min((now - lastFrame) / 1000, 0.05);
    lastFrame = now;
    game.update(dt);
    game.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
