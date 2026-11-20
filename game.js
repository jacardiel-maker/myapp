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
  const SAVE_KEY = 'pixelRealmSave_v1';
  const DAY_LENGTH = 120;   // Seconds for a full day/night cycle.
  const TAU = Math.PI * 2;

  const TILE_ID = { GRASS: 0, WATER: 1, TREE: 2, SAND: 3, ROCK: 4, CAVE: 5, CACTUS: 6 };
  // Obstacles have been removed from the maps. Only ROCK (the outer cave/dungeon
  // border) is solid, so scenery can never block attacks or trap a monster.
  const BLOCKED_TILES = new Set([TILE_ID.ROCK]);
  const PROJECTILE_BLOCKED_TILES = new Set([TILE_ID.ROCK]);

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
    }
  };

  // STAGE 2: each class gets three skills bound to keys 1, 2 and 3.
  const SKILLS = {
    swordsman: [
      { name: 'Dash Strike', cost: 15, cd: 5, desc: 'Dash forward and slash everything you pass.' },
      { name: 'Shield Block', cost: 10, cd: 8, desc: 'Block 80% of damage for 3 seconds.' },
      { name: 'Whirlwind', cost: 25, cd: 9, desc: 'Spin and hit every nearby enemy.' }
    ],
    archer: [
      { name: 'Multi-Shot', cost: 18, cd: 5, desc: 'Fire three arrows in a spread.' },
      { name: 'Roll Dodge', cost: 12, cd: 6, desc: 'Roll quickly and become untouchable.' },
      { name: 'Poison Arrow', cost: 20, cd: 8, desc: 'An arrow that poisons its target.' }
    ],
    mage: [
      { name: 'Ice Nova', cost: 25, cd: 8, desc: 'Damage and slow all nearby enemies.' },
      { name: 'Blink', cost: 18, cd: 6, desc: 'Teleport toward your cursor.' },
      { name: 'Meteor', cost: 40, cd: 12, desc: 'Call down a huge fire blast at your cursor.' }
    ]
  };

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
    return !!item && (item.slot === 'weapon' || item.slot === 'armor') &&
      (!item.classId || item.classId === classId);
  }

  // EXPANSION 5: talent tree + class specializations.
  const TALENTS = [
    { id: 'power', name: 'Power', desc: '+4% base attack per rank.' },
    { id: 'haste', name: 'Haste', desc: '-4% skill cooldown per rank.' },
    { id: 'vigor', name: 'Vigor', desc: '+12 max HP per rank.' },
    { id: 'crit', name: 'Critical Eye', desc: '+3% crit chance per rank.' },
    { id: 'guard', name: 'Guard', desc: '+2 defense and -4% damage taken per rank.' },
    { id: 'focus', name: 'Focus', desc: '+5 mana and faster mana regeneration per rank.' }
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
    ctx.fillStyle = 'rgba(8,12,22,0.94)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#7d89a8';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = '#3c4b67';
    ctx.fillRect(x + 2, y + 2, w - 4, 26);
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#fff';
    ctx.fillText(title, x + 12, y + 20);
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

  function shadow(ctx, x, y, rx, ry, alpha = 0.25) {
    ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
    ctx.fill();
  }

  const CLASS_PALETTE = {
    swordsman: { skin: '#f0c39b', hair: '#4a3428', body: '#6f8fbf', trim: '#d7e5ff', legs: '#43506b', weapon: '#d7e4ef' },
    archer: { skin: '#f0c39b', hair: '#3b7a49', body: '#4f8e5b', trim: '#b8e8be', legs: '#3c5b45', weapon: '#8a5a32' },
    mage: { skin: '#f0c39b', hair: '#7b52b5', body: '#6f4aa8', trim: '#d9b8ff', legs: '#49356e', weapon: '#9c6b40' }
  };

  // STAGE 1 + STAGE 5: a 4-frame walk / attack grid for every class.
  // Equipment colors change the weapon and armor pixels (STAGE 2).
  function playerSprite(classId, frame, attacking, equipment = {}, effects = {}) {
    frame = ((frame % 4) + 4) % 4;
    const weaponColor = equipment.weapon && equipment.weapon.spriteColor;
    const armorColor = equipment.armor && equipment.armor.spriteColor;
    const weaponEffect = equipment.weapon && equipment.weapon.effect;
    const enchant = equipment.weapon && equipment.weapon.enchant ? equipment.weapon.enchant : 0;
    const spec = effects.spec || '';
    const casting = !!effects.casting;
    const key = `player_${classId}_${frame}_${attacking ? 1 : 0}_${casting ? 1 : 0}_${weaponColor || ''}_${armorColor || ''}_${weaponEffect || ''}_${enchant}_${spec}`;
    return cachedSprite(key, () => {
      const p = CLASS_PALETTE[classId];
      const g = emptyGrid();
      const body = armorColor || p.body;
      const weapon = weaponColor || p.weapon;
      const outline = '#252a38';
      const skin = p.skin;
      const hair = p.hair;
      const trim = p.trim;

      // Legs change position on walk frames 1 and 3.
      const legOffset = frame === 1 ? 1 : frame === 3 ? -1 : 0;
      setRect(g, 5 + legOffset, 12, 2, 3, p.legs);
      setRect(g, 9 - legOffset, 12, 2, 3, p.legs);
      setPx(g, 5 + legOffset, 15, outline);
      setPx(g, 10 - legOffset, 15, outline);

      // Body, belt and arms.
      setRect(g, 5, 7, 6, 5, body);
      setRect(g, 5, 11, 6, 1, '#3b3340');
      setPx(g, 7, 8, trim);
      setPx(g, 8, 9, trim);
      setRect(g, 4, 8, 1, 3, skin);
      setRect(g, 11, 8, 1, 3, skin);

      // Head and face.
      setRect(g, 5, 2, 6, 5, skin);
      setRect(g, 4, 3, 1, 4, hair);
      setRect(g, 11, 3, 1, 4, hair);
      setRect(g, 5, 1, 6, 2, hair);
      setPx(g, 6, 4, outline);
      setPx(g, 9, 4, outline);
      setPx(g, 7, 6, '#c98f76');

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
      return g;
    });
  }

  function npcSprite(type, frame) {
    return cachedSprite(`npc_${type}_${frame}`, () => {
      const g = emptyGrid();
      const robe = type === 'shop' ? '#b8793c' : '#6c76b8';
      const trim = type === 'shop' ? '#ffd68a' : '#d5d9ff';
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
      } else {
        setRect(g, 12, 3, 1, 10, '#9a8060');      // staff
        setPx(g, 12, 2, '#9ce7ff');
      }
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
      return g;
    });
  }

  // Item images are generated from the same tiny pixel grid as characters, so
  // every item - including role relics - has art without external files.
  const ITEM_ART_KEYS = new Set([
    'potion', 'sword', 'bow', 'staff', 'armor',
    'roleSword', 'roleBow', 'roleStaff'
  ]);

  function itemArtKey(item) {
    if (!item) return 'armor';
    if (ITEM_ART_KEYS.has(item.art)) return item.art;
    const name = String(item.name || '').toLowerCase();
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

  // STAGE 1: grass, water and trees. STAGE 3 adds sand, rock and cave tiles.
  function tileCanvas(id) {
    if (tileCache.has(id)) return tileCache.get(id);
    const rng = mulberry32(100 + id * 37);
    const g = emptyGrid();
    if (id === TILE_ID.GRASS) {
      setRect(g, 0, 0, 16, 16, '#4f9d54');
      for (let i = 0; i < 12; i++) setPx(g, Math.floor(rng() * 16), Math.floor(rng() * 16), rng() < 0.5 ? '#57ad5c' : '#438c49');
      setPx(g, 3, 5, '#79c96b'); setPx(g, 11, 12, '#79c96b');
    } else if (id === TILE_ID.WATER) {
      setRect(g, 0, 0, 16, 16, '#3178b8');
      for (let y = 2; y < 16; y += 4) {
        setRect(g, 1 + (y % 3), y, 5, 1, '#54a5dc');
        setRect(g, 9 - (y % 2), y + 1, 5, 1, '#225f9e');
      }
    } else if (id === TILE_ID.TREE) {
      setRect(g, 0, 0, 16, 16, '#4f9d54');
      setRect(g, 7, 9, 3, 5, '#6b4a2c');
      setRect(g, 4, 2, 9, 7, '#2f7a3c');
      setRect(g, 3, 4, 11, 4, '#2f7a3c');
      setRect(g, 5, 3, 5, 2, '#46a14f');
      setPx(g, 11, 6, '#1f5c30');
    } else if (id === TILE_ID.SAND) {
      setRect(g, 0, 0, 16, 16, '#d7bb76');
      for (let i = 0; i < 10; i++) setPx(g, Math.floor(rng() * 16), Math.floor(rng() * 16), rng() < 0.5 ? '#e3cc8b' : '#c5a866');
    } else if (id === TILE_ID.ROCK) {
      setRect(g, 0, 0, 16, 16, '#4b5061');
      setRect(g, 1, 1, 14, 13, '#60667a');
      setRect(g, 3, 3, 10, 9, '#737a90');
      setPx(g, 5, 5, '#8c93a8'); setPx(g, 10, 9, '#414657');
    } else if (id === TILE_ID.CAVE) {
      setRect(g, 0, 0, 16, 16, '#34384a');
      for (let i = 0; i < 9; i++) setPx(g, Math.floor(rng() * 16), Math.floor(rng() * 16), rng() < 0.6 ? '#3d4257' : '#2b2f40');
    } else {
      setRect(g, 0, 0, 16, 16, '#d7bb76');
      setRect(g, 7, 3, 2, 10, '#3f9c5e');
      setRect(g, 5, 6, 2, 4, '#3f9c5e');
      setRect(g, 9, 5, 2, 5, '#3f9c5e');
      setPx(g, 7, 2, '#62c47d');
    }
    const c = gridToCanvas(g);
    tileCache.set(id, c);
    return c;
  }

  const MINIMAP_COLORS = ['#3f8f48', '#2f6fae', '#256437', '#c4a867', '#555a6b', '#34384a', '#4f9c62'];

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
      desc: extra.desc || ''
    };
  }

  function starterItems(classId) {
    const weapon = classId === 'swordsman'
      ? makeItem('Iron Sword', 'weapon', 'common', { attack: 5 }, { classId, art: 'sword', spriteColor: '#d4e0ec', desc: 'Swordsman weapon. A trusty blade.' })
      : classId === 'archer'
        ? makeItem('Short Bow', 'weapon', 'common', { attack: 4 }, { classId, art: 'bow', spriteColor: '#9c6a3d', desc: 'Archer weapon. Light and quick.' })
        : makeItem('Oak Staff', 'weapon', 'common', { attack: 6 }, { classId, art: 'staff', spriteColor: '#b37b45', desc: 'Mage weapon. Channels fire magic.' });
    const armorColor = classId === 'mage' ? '#8b63c8' : classId === 'archer' ? '#5c9b66' : '#7896c4';
    const armor = makeItem('Traveler Gear', 'armor', 'common', { hp: 10, defense: 2 }, { classId, art: 'armor', spriteColor: armorColor, desc: `Basic ${CLASS_DATA[classId].name} armor.` });
    return {
      equipment: { weapon, armor },
      inventory: [
        makeItem('Health Potion', 'consumable', 'common', {}, { art: 'potion', icon: 'P', heal: 55, price: 20, desc: 'Restores 55 HP.' }),
        makeItem('Health Potion', 'consumable', 'common', {}, { art: 'potion', icon: 'P', heal: 55, price: 20, desc: 'Restores 55 HP.' })
      ]
    };
  }

  function randomShopItem(index, classId = 'swordsman') {
    const rarities = ['common', 'rare', 'rare', 'epic'];
    const rarity = rarities[index % rarities.length];
    const mult = RARITY[rarity].mult;
    if (index % 3 === 2) {
      return makeItem('Greater Potion', 'consumable', rarity, {}, {
        art: 'potion', icon: 'P', heal: Math.round(90 * mult), price: Math.round(35 * mult), desc: 'A stronger healing potion.'
      });
    }
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
    return makeItem(String(raw.name || 'Item'), slot, rarity, raw.stats || {}, {
      // Keep the server UID: equip/enchant/mail/auction actions all refer to it.
      uid: raw.uid,
      classId: raw.classId || roleClassId || (slot === 'weapon' || slot === 'armor' ? defaultClassId : null),
      spriteColor: raw.spriteColor,
      color: raw.color,
      effect: raw.effect,
      enchant: raw.enchant,
      icon: raw.icon,
      art: raw.art,
      price: raw.price,
      heal: raw.heal,
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

  // Small reusable effect: slash arcs, expanding rings and spark particles.
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
      this.vx = opts.vx || 0;
      this.vy = opts.vy || 0;
      this.size = opts.size || 3;
      this.x2 = Number.isFinite(opts.x2) ? opts.x2 : this.x;
      this.y2 = Number.isFinite(opts.y2) ? opts.y2 : this.y;
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
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 5 - t * 3;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, this.angle - 0.9, this.angle + 0.9);
        ctx.stroke();
      } else if (this.kind === 'ring') {
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(this.x, this.y, lerp(this.radius, this.endRadius, t), 0, TAU);
        ctx.stroke();
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
      } else if (this.kind === 'ore') {
        ctx.fillStyle = '#51667c';
        ctx.fillRect(x - 5, y - 4, 10, 8);
        ctx.fillStyle = '#9ce7ff';
        ctx.fillRect(x - 3, y - 3, 3, 3);
        ctx.fillRect(x + 1, y - 1, 3, 3);
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
      this.skillRanks = [1, 1, 1];
      this.skillCd = [0, 0, 0];
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
      const weapon = this.equipment.weapon ? this.equipment.weapon.stats : {};
      const armor = this.equipment.armor ? this.equipment.armor.stats : {};
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
      for (let i = 0; i < 3; i++) this.skillCd[i] = Math.max(0, this.skillCd[i] - dt);
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
      if (!game.chatOpen && !game.paused && !game.panel) {
        const len = Math.hypot(dx, dy);
        if (len > 0) {
          dx /= len;
          dy /= len;
          const speed = this.finalStats.speed * (this.shieldTime > 0 ? 0.55 : 1);
          game.tryMove(this, dx * speed * dt, dy * speed * dt);
          this.facing = Math.atan2(dy, dx);
          this.walkTimer += dt;
          this.walkFrame = Math.floor(this.walkTimer * 8) % 4;
        } else {
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
      }
      // Blink is instant, so it is handled directly in useSkill().
    }

    attack(game) {
      if (this.attackCd > 0) return;
      game.acquireAutoLockTarget();
      this.aim = game.getAimAngle(this);
      this.attackCd = this.classId === 'archer' ? 0.31 : this.classId === 'mage' ? 0.55 : 0.45;
      this.attackAnim = 0.35;
      const crit = Math.random() < this.critChance;
      const damage = this.finalStats.attack * (crit ? 1.8 : 1);
      if (this.classId === 'swordsman') {
        game.audio.sfx('swing');
        game.effects.push(new Effect('slash', this.x, this.y - 14, {
          color: '#eaf4ff', angle: this.aim, radius: 26, life: 0.20
        }));
        for (const e of game.enemies) {
          if (!e.alive) continue;
          const d = dist(this, e);
          const a = angleTo(this, e);
          const diff = Math.abs(Math.atan2(Math.sin(a - this.aim), Math.cos(a - this.aim)));
          if (d < this.finalStats.range + e.radius && diff < 1.2) {
            game.damageEnemy(e, damage, this, crit, 'slash');
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

    // STAGE 2: skills 1/2/3 with cooldowns and resource costs.
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
        ? ['#dceeff', '#8fd0ff', '#eaf4ff']
        : this.classId === 'archer'
          ? ['#b9ffcb', '#b9ffcb', '#8ee46d']
          : ['#9ce7ff', '#d7b8ff', '#ff9c42'];
      this.playSkillAnim(game, def, fxColors[index]);
      game.log(`${this.name} used ${def.name}!`, fxColors[index]);
      this.aim = game.getAimAngle(this);
      const aim = this.aim;
      const baseDamage = this.finalStats.attack * power;

      if (this.classId === 'swordsman') {
        if (index === 0) { // Dash Strike
          this.facing = aim;
          this.dashTime = 0.20;
          const tx = this.x + Math.cos(aim) * 95;
          const ty = this.y + Math.sin(aim) * 95;
          for (const e of game.enemies) {
            if (e.alive && dist(e, { x: tx, y: ty }) < 70) game.damageEnemy(e, baseDamage * 1.7, this, true, 'dash');
          }
          game.effects.push(new Effect('line', this.x, this.y - 10, { color: '#dceeff', x2: tx, y2: ty - 10, life: 0.22, size: 5 }));
          game.effects.push(new Effect('ring', tx, ty, { color: '#dceeff', radius: 10, endRadius: 70, life: 0.30 }));
          game.shake = Math.max(game.shake, 5);
        } else if (index === 1) { // Shield Block
          this.shieldTime = 3;
          game.effects.push(new Effect('ring', this.x, this.y - 10, { color: '#8fd0ff', radius: 16, endRadius: 40, life: 0.4 }));
        } else { // Whirlwind
          game.areaDamage(this.x, this.y, 105, baseDamage * 1.4, this, 'whirlwind');
          game.effects.push(new Effect('ring', this.x, this.y - 8, { color: '#eaf4ff', radius: 20, endRadius: 105, life: 0.45 }));
          for (let i = 0; i < 14; i++) {
            const a = i / 14 * TAU;
            game.effects.push(new Effect('particle', this.x + Math.cos(a) * 30, this.y - 10 + Math.sin(a) * 30, {
              color: '#dceeff', vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, life: 0.35
            }));
          }
          game.shake = Math.max(game.shake, 6);
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
        } else { // Poison Arrow
          game.effects.push(new Effect('line', this.x, this.y - 10, {
            color: '#8ee46d', x2: this.x + Math.cos(aim) * 160, y2: this.y - 10 + Math.sin(aim) * 160,
            life: 0.24, size: 4
          }));
          game.spawnProjectile({
            x: this.x + Math.cos(aim) * 14, y: this.y - 10 + Math.sin(aim) * 14,
            vx: Math.cos(aim) * 500, vy: Math.sin(aim) * 500,
            damage: baseDamage * 0.9, owner: this, kind: 'poison', poison: 6 * power, radius: 6, life: 2.2
          });
        }
      } else {
        if (index === 0) { // Ice Nova
          game.areaDamage(this.x, this.y, 135, baseDamage * 0.85, this, 'ice', { slow: 0.45 });
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
          game.effects.push(new Effect('line', oldX, oldY - 10, {
            color: '#d7b8ff', x2: nx, y2: ny - 10, life: 0.25, size: 4
          }));
          game.effects.push(new Effect('ring', oldX, oldY - 10, { color: '#d7b8ff', radius: 8, endRadius: 40, life: 0.3 }));
          this.x = nx;
          this.y = ny;
          game.effects.push(new Effect('ring', this.x, this.y - 10, { color: '#e9d6ff', radius: 8, endRadius: 40, life: 0.3 }));
        } else { // Meteor
          const target = game.getAimPoint();
          game.pendingMeteors.push({ x: target.x, y: target.y, timer: 0.85, damage: baseDamage * 2.6, owner: this, radius: 108 });
          game.effects.push(new Effect('meteor', target.x, target.y, { color: '#ff8c42', radius: 108, life: 0.85 }));
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
      const spawn = ZONE_SPAWN[game.zoneId];
      this.x = spawn.x;
      this.y = spawn.y;
      this.hp = Math.round(this.maxHp * 0.6);
      this.mp = Math.round(this.maxMp * 0.5);
      this.alive = true;
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

    addItem(item) {
      if (this.inventory.length >= 20) return false;
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
      if (this.hp >= this.maxHp) {
        game.addFloater(this.x, this.y - 40, 'HP is full', '#9aa6bd', 10);
        return false;
      }
      const healed = this.heal(item.heal || 50);
      this.inventory.splice(index, 1);
      game.addFloater(this.x, this.y - 42, `+${healed}`, '#7bff9b', 14);
      game.audio.sfx('pickup');
      game.save();
      return true;
    }

    draw(ctx, game) {
      shadow(ctx, this.x, this.y, 13, 5);
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
      drawSprite(ctx, playerSprite(this.classId, frame, attacking, this.equipment, {
        spec: this.spec, casting: this.skillAnim > 0
      }), this.x, this.y, SPRITE_SCALE, blink ? 0.45 : 1);
      drawNameTag(ctx, this.name, `Lv ${this.level} ${CLASS_DATA[this.classId].name}`, this.x, this.y - 42, CLASS_DATA[this.classId].color);
      if (this.emote) drawEmote(ctx, this.x, this.y - (this.skillAnim > 0 ? 96 : 78), this.emote.text);
    }
  }

  function drawNameTag(ctx, name, sub, x, y, color) {
    ctx.save();
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    const w = Math.max(ctx.measureText(name).width, ctx.measureText(sub).width) + 10;
    ctx.fillRect(x - w / 2, y - 24, w, 25);
    ctx.fillStyle = color;
    ctx.fillText(name, x, y - 12);
    ctx.font = '9px monospace';
    ctx.fillStyle = '#c8d1e0';
    ctx.fillText(sub, x, y - 2);
    ctx.restore();
  }

  // A short glowing aura plus a cast bar makes every skill visibly "cast".
  function drawSkillAura(ctx, actor, game) {
    if (!(actor.skillAnim > 0)) return;
    const duration = actor.skillAnimDuration || 0.55;
    const t = clamp(actor.skillAnim / duration, 0, 1);
    const color = actor.skillAnimColor || '#fff';
    ctx.save();
    ctx.globalAlpha = t * 0.9;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(actor.x, actor.y - 14, 20 + (1 - t) * 24, 0, TAU);
    ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const a = game.time * 5 + i / 6 * TAU;
      const r = 26 + (1 - t) * 16;
      ctx.fillStyle = color;
      ctx.fillRect(actor.x + Math.cos(a) * r - 2, actor.y - 14 + Math.sin(a) * r - 2, 4, 4);
    }

    // Cast name and progress sit just above the name tag without covering it.
    if (actor.skillAnimName) {
      const bx = actor.x - 32;
      const by = actor.y - 86;
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(5,8,16,0.82)';
      ctx.fillRect(bx, by, 64, 14);
      ctx.fillStyle = '#0b1020';
      ctx.fillRect(bx + 5, by + 11, 54, 4);
      ctx.fillStyle = color;
      ctx.fillRect(bx + 6, by + 12, Math.max(1, Math.round(52 * (1 - t))), 2);
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f4f8ff';
      ctx.fillText(actor.skillAnimName, actor.x, by + 9);
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
        game.effects.push(new Effect('slash', this.x, this.y - 12, { color: '#ffb0a0', angle: angle, radius: 18, life: 0.18 }));
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
      const scale = this.type === 'boss' ? 3 : SPRITE_SCALE;
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
        ctx.fillRect(this.x - 8, this.y - 42, 6, 6);
      }
      if (this.slowTimer > 0) {
        ctx.fillStyle = '#9ce7ff';
        ctx.fillRect(this.x, this.y - 42, 6, 6);
      }
      if (this.alive && this.hp < this.maxHp && this.type !== 'boss') {
        drawBar(ctx, this.x - 16, this.y - 38, 32, 4, this.hp / this.maxHp, '#ff6b6b');
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
      shadow(ctx, this.x, this.y, 13, 5);
      drawSprite(ctx, npcSprite(this.type, Math.floor(game.time * 2) % 4), this.x, this.y, SPRITE_SCALE);
      ctx.save();
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 3;
      ctx.fillText(this.name, this.x, this.y - 38);
      ctx.shadowBlur = 0;
      if (this.type === 'quest') {
        const showBang = !game.quest.claimed && (!game.quest.active || game.quest.complete);
        if (showBang) {
          ctx.fillStyle = '#ffd75e';
          ctx.font = 'bold 20px monospace';
          ctx.fillText('!', this.x, this.y - 52 + Math.sin(game.time * 4) * 2);
        }
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
        this.walkFrame = Math.floor(this.walkTimer * 7) % 4;
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
      shadow(ctx, this.x, this.y, 12, 5);
      drawSprite(ctx, playerSprite(this.classId, this.walkFrame, false, {}), this.x, this.y, SPRITE_SCALE);
      drawNameTag(ctx, this.name, `Lv ${this.level} ${CLASS_DATA[this.classId].name}${this.party ? ' *' : ''}`, this.x, this.y - 42, this.party ? '#ffd75e' : '#a9c7ff');
      drawBar(ctx, this.x - 15, this.y - 46, 30, 3, this.hp / this.maxHp, '#6ee787');
      if (this.emote) drawEmote(ctx, this.x, this.y - 78, this.emote.text);
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
    dungeon: { x: 768, y: 576 }
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
    ]
  };

  const NPC_DEFS = [
    { type: 'shop', name: 'Merchant Mina', x: 620, y: 380 },
    { type: 'quest', name: 'Elder Tarn', x: 770, y: 430 }
  ];

  const BOSS_POS = { x: 1560, y: 1120 };
  const ZONE_ENEMY_COUNTS = {
    forest: { slime: 15, goblin: 6 },
    cave: { slime: 6, goblin: 7, brute: 4 },
    desert: { slime: 8, goblin: 9, scout: 4 },
    dungeon: { goblin: 6 }
  };
  const ZONE_MUL = { forest: 1, cave: 1.7, desert: 2.4, dungeon: 2.6 };

  const ZONE_POINTS = {
    forest: [ZONE_SPAWN.forest, ...PORTAL_DEFS.forest.map(p => p.arrive), ...NPC_DEFS],
    cave: [ZONE_SPAWN.cave, ...PORTAL_DEFS.cave.map(p => p.arrive), BOSS_POS],
    desert: [ZONE_SPAWN.desert, ...PORTAL_DEFS.desert.map(p => p.arrive)],
    dungeon: [ZONE_SPAWN.dungeon, ...PORTAL_DEFS.dungeon.map(p => p.arrive)]
  };

  function createZone(id) {
    const isArena = id === 'dungeon';
    const w = isArena ? 48 : 96;
    const h = isArena ? 36 : 72;
    const tiles = new Uint8Array(w * h);
    const base = id === 'cave' || isArena ? TILE_ID.CAVE
      : id === 'forest' ? TILE_ID.GRASS : TILE_ID.SAND;

    // Start with open terrain and a cave/dungeon border. Decorative patches follow.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const border = (isArena || id === 'cave') &&
          (x < 2 || y < 2 || x >= w - 2 || y >= h - 2);
        tiles[y * w + x] = border ? TILE_ID.ROCK : base;
      }
    }
    // Add small, decorative landmarks. These tiles remain walkable; they give
    // each region a stronger identity without creating combat choke points.
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
    return {
      id, w, h, tiles, pixelW: w * TILE, pixelH: h * TILE,
      name: isArena ? 'Raid Arena' : id[0].toUpperCase() + id.slice(1)
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

  function freshQuest() {
    return { stage: 1, active: false, kills: 0, herbs: 0, goblins: 0, ore: 0, complete: false, claimed: false };
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
      shadow(ctx, this.x, this.y, 12, 5);
      drawSkillAura(ctx, this, game);
      const frame = this.attackAnim > 0 ? clamp(Math.floor((1 - this.attackAnim / 0.35) * 4), 0, 3)
        : this.moving ? Math.floor(game.time * 8) % 4 : 0;
      drawSprite(ctx, playerSprite(this.classId, frame, this.attackAnim > 0, {}, {
        spec: this.spec, casting: this.skillAnim > 0
      }), this.x, this.y, SPRITE_SCALE);
      drawNameTag(ctx, this.name, `Lv ${this.level} ${CLASS_DATA[this.classId].name}${this.party ? ' *' : ''}`, this.x, this.y - 42, this.party ? '#ffd75e' : '#b9d9ff');
      drawBar(ctx, this.x - 15, this.y - 46, 30, 3, this.hp / this.maxHp, '#6ee787');
      if (this.emote) drawEmote(ctx, this.x, this.y - (this.skillAnim > 0 ? 96 : 78), this.emote.text);
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
      const sprite = this.type === 'slime' ? slimeSprite(frame)
        : ['goblin', 'scout', 'brute'].includes(this.type) ? goblinSprite(frame) : bossSprite(frame);
      const tint = this.type === 'scout' ? 'hue-rotate(145deg) saturate(1.5)' : this.type === 'brute' ? 'hue-rotate(235deg) saturate(1.5)' : '';
      if (tint) { ctx.save(); ctx.filter = tint; }
      drawSprite(ctx, sprite, this.x, this.y, this.type === 'boss' ? 3 : SPRITE_SCALE);
      if (tint) ctx.restore();
      if (this.type !== 'boss' && this.hp < this.maxHp) drawBar(ctx, this.x - 16, this.y - 38, 32, 4, this.hp / this.maxHp, '#ff6b6b');
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
      this.url = params.get('ws') || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname || 'localhost'}:3000/ws`;
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
      });
      this.socket.addEventListener('message', e => {
        try { this.game.onNetworkMessage(JSON.parse(e.data)); }
        catch (err) { console.error('Bad server message', err); }
      });
      this.socket.addEventListener('close', () => {
        this.connected = false;
        this.connecting = false;
        this.online = false;
        this.game.log('Disconnected from game server.', '#ff9b9b');
      });
      this.socket.addEventListener('error', () => {
        this.game.log('WebSocket error. Is server.js running on port 3000?', '#ff9b9b');
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
      this.ctx = canvas.getContext('2d');
      this.ctx.imageSmoothingEnabled = false;

      this.state = 'select';
      this.paused = false;
      this.panel = null;              // 'inventory' | 'skills' | 'shop' | 'quest' | ...
      this.selectedClass = 'swordsman';
      this.nameInput = 'Hero';
      this.nameFocused = false;
      this.loginFields = { username: '', password: '', active: 'username' };
      this.network = new NetworkClient(this);
      this.networkData = { auction: [], mail: [], guild: null, shop: [] };
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
        dungeon: createZone('dungeon')
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
      this.chatInput = '';
      this.fakeChatTimer = 7;

      this.settings = { volume: 0.35 };
      this.audio = new AudioEngine();
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
      this.darkCanvas.width = VIEW_W;
      this.darkCanvas.height = VIEW_H;
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

    // Ask the browser to lock landscape when possible. Most mobile browsers
    // only allow this from a user gesture, so it is called on every first tap.
    goFullscreen() {
      if (!this.input.mobile || document.fullscreenElement) return;
      const el = document.documentElement;
      const request = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
      if (!request) return;
      try {
        const result = request.call(el);
        if (result && typeof result.catch === 'function') result.catch(() => {});
      } catch (err) {
        // Ignored: the canvas still fills the visible viewport via CSS.
      }
    }

    requestLandscape() {
      const screenObj = window.screen;
      const orientation = screenObj && (screenObj.orientation || screenObj.mozOrientation || screenObj.msOrientation);
      const type = orientation && (orientation.type || orientation);
      if (typeof type === 'string' && type.indexOf('landscape') === 0) return;
      if (!orientation || typeof orientation.lock !== 'function') return;
      try {
        const result = orientation.lock('landscape');
        if (result && typeof result.catch === 'function') result.catch(() => {});
      } catch (err) {
        // Ignored: the CSS rotate prompt still blocks portrait play.
      }
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
        this.requestLandscape();
        this.goFullscreen();
      }, { passive: true });
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
          if (this.state === 'select') this.startNewGame();
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
          if (this.state === 'login') this.state = 'select';
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
        return;
      }

      // EXPANSION 2: on-canvas account login/register.
      if (this.state === 'login') {
        if (k === 'escape') { this.state = 'select'; return; }
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
          : this.textField === 'mailMessage' ? 'actionMessage' : 'actionText';
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
        case '1': case '2': case '3': {
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
          if (this.network.online) this.network.send({ type: 'potion' });
          else if (this.player) { const idx = this.player.inventory.findIndex(it => it.slot === 'consumable'); if (idx >= 0) this.player.usePotion(idx, this); }
          break;
        case 'enter': this.clearInput(); this.chatOpen = true; this.chatInput = ''; break;
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
          if (src.source.type === 'inv') this.selectedItemUid = src.item.uid;
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
      return (classId === 'swordsman' && index === 0) ||
        (classId === 'archer') || (classId === 'mage' && index > 0);
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

    // Offline mode moves the Player locally. Online mode only animates it:
    // the server owns x/y/hp/combat and sends snapshots for us to follow.
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
      for (let i = 0; i < 3; i++) p.skillCd[i] = Math.max(0, (p.skillCd[i] || 0) - dt);
      if (p.emote) {
        if (typeof p.emote === 'object') {
          p.emote.time -= dt;
          if (p.emote.time <= 0) p.emote = null;
        }
      }

      // Smooth toward the authoritative position instead of snapping every packet.
      if (Number.isFinite(p.tx) && Number.isFinite(p.ty)) {
        const k = 1 - Math.exp(-dt * 22);
        p.x = lerp(p.x, p.tx, k);
        p.y = lerp(p.y, p.ty, k);
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
      if (len > 1) { dx /= len; dy /= len; }
      if (len > 0.05) p.facing = Math.atan2(dy, dx);

      this.inputSendTimer += dt;
      if (net.connected && net.online && net.joined && this.inputSendTimer >= 0.05) {
        this.inputSendTimer = 0;
        const aim = this.getAimPoint();
        // dx/dy and aim are sent as world coordinates; the server integrates movement.
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
      if (Array.isArray(data.skillCd)) p.skillCd = data.skillCd.slice(0, 3).map(v => Math.max(0, Number(v) || 0));
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
      p.skillRanks = Array.isArray(char.skillRanks) && char.skillRanks.length === 3
        ? char.skillRanks.map(v => clamp(Number(v) || 1, 1, 5)) : [1, 1, 1];
      p.spec = char.spec || '';
      p.talents = Object.assign({ power: 0, haste: 0, vigor: 0, crit: 0, guard: 0, focus: 0 }, char.talents || {});
      p.materials = Object.assign({ herb: 0, ore: 0, essence: 0 }, char.materials || {});
      p.inventory = Array.isArray(char.inventory)
        ? char.inventory.map(item => normalizeItem(item, classId)).filter(Boolean).slice(0, 20) : p.inventory;
      const eq = char.equipment || {};
      p.equipment = {
        weapon: normalizeItem(eq.weapon, classId),
        armor: normalizeItem(eq.armor, classId)
      };
      const starter = starterItems(classId);
      if (!p.equipment.weapon || p.equipment.weapon.slot !== 'weapon') p.equipment.weapon = starter.equipment.weapon;
      if (!p.equipment.armor || p.equipment.armor.slot !== 'armor') p.equipment.armor = starter.equipment.armor;
      if (Array.isArray(char.skillCd)) p.skillCd = char.skillCd.slice(0, 3).map(v => Math.max(0, Number(v) || 0));
      p.recalculateStats(false);
      if (Number.isFinite(char.hp)) p.hp = clamp(char.hp, 0, p.maxHp);
      else if (fresh) p.hp = p.maxHp;
      if (Number.isFinite(char.mp)) p.mp = clamp(char.mp, 0, p.maxMp);
      else if (fresh) p.mp = p.maxMp;
      if (!Number.isFinite(char.hp) && p.hp <= 0) p.hp = p.maxHp;
      p.alive = p.hp > 0;

      const savedQuest = char.quest && typeof char.quest === 'object' ? char.quest : {};
      this.quest = Object.assign(freshQuest(), savedQuest);
      if (!Object.hasOwn(savedQuest, 'stage') && savedQuest.claimed) {
        Object.assign(this.quest, { stage: 2, active: false, kills: 0, herbs: 0, goblins: 0, ore: 0, complete: false, claimed: false });
      }
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
      for (let i = 0; i < tiles.length; i++) tiles[i] = clamp(Number(raw[i]) || 0, 0, 6);
      const zone = {
        id: zoneId, w, h, tiles,
        pixelW: w * TILE, pixelH: h * TILE,
        name: zoneId === 'dungeon' ? 'Raid Arena' : zoneId[0].toUpperCase() + zoneId.slice(1)
      };
      this.zoneId = zoneId;
      this.zone = zone;
      this.zones[zoneId] = zone;
      this.network.roomId = init.roomId || '';
      this.network.joined = true;
      this.lockedTargetId = null;
      this.portals = (Array.isArray(init.portals) ? init.portals : []).map(p => Object.assign({}, p, { radius: 30 }));
      // Keep the same NPC coordinates as the server so F opens shop/quest online.
      this.npcs = zoneId === 'forest' ? NPC_DEFS.map(n => new Npc(n.type, n.name, n.x, n.y)) : [];
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
          this.applyCharacter(msg.character || msg.char, true);
          net.send({ type: 'join' });
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
          break;
        case 'pong':
          break;
        default:
          console.warn('Unknown server message:', msg.type, msg);
      }
    }

    // Server fx events keep skill animations identical for every player.
    playSkillFx(ev) {
      if (!ev) return;
      const visual = ev.visual || 'skill';
      const classId = CLASS_DATA[ev.classId] ? ev.classId
        : (this.player && this.player.classId) || 'swordsman';
      const index = clamp(Math.floor(Number(ev.index) || 0), 0, 2);
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

      if (classId === 'swordsman') {
        if (index === 0) {
          line(x, y - 10, tx, ty - 10, 0.22, 5);
          ring(tx, ty, 10, 70, 0.3);
          burst(tx, ty, 12, 26, 120, 0.3);
          this.shake = Math.max(this.shake, 5);
        } else if (index === 1) {
          ring(x, y - 10, 16, 44, 0.4);
          burst(x, y - 10, 10, 22, 80, 0.35);
        } else {
          ring(x, y - 8, 20, 108, 0.45);
          burst(x, y - 10, 18, 30, 150, 0.4);
          this.shake = Math.max(this.shake, 6);
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
        } else {
          line(x, y - 10, tx, ty - 10, 0.24, 4);
          burst(tx, ty, 12, 18, 90, 0.4);
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
        } else {
          this.effects.push(new Effect('meteor', tx, ty, { color, radius: 108, life: 0.7 }));
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
      this.state = 'select';
      this.paused = false;
      this.panel = null;
      this.chatOpen = false;
      this.textField = null;
      this.lockedTargetId = null;
    }

    startNewGame() {
      this.audio.unlock();
      this.audio.setVolume(this.settings.volume);
      const spawn = ZONE_SPAWN.forest;
      this.player = new Player(this.selectedClass, this.nameInput, spawn.x, spawn.y);
      this.pet = new Pet(spawn.x + 24, spawn.y + 18);
      this.quest = freshQuest();
      this.bossDefeated = false;
      this.zoneId = 'forest';
      this.zone = this.zones.forest;
      this.party = [];
      this.shopStock = makeShopStock(this.player.classId);
      this.lockedTargetId = null;
      this.resetZoneActors();
      this.clearInput();
      this.state = 'playing';
      this.paused = false;
      this.panel = null;
      this.chatOpen = false;
      this.dayTime = 20;
      this.log(`Welcome, ${this.player.name}! Press I for inventory, F near NPCs.`, '#8ee6ff');
      this.save();
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
      player.skillRanks = Array.isArray(data.skillRanks) && data.skillRanks.length === 3 ? data.skillRanks.map(v => clamp(v | 0, 1, 5)) : [1, 1, 1];
      player.inventory = Array.isArray(data.inventory) ? data.inventory.map(item => normalizeItem(item, classId)).filter(Boolean).slice(0, 20) : [];
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
      this.quest = Object.assign(freshQuest(), savedQuest);
      if (!Object.hasOwn(savedQuest, 'stage') && savedQuest.claimed) {
        Object.assign(this.quest, { stage: 2, active: false, kills: 0, herbs: 0, goblins: 0, ore: 0, complete: false, claimed: false });
      }
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
      this.npcs = this.zoneId === 'forest' ? NPC_DEFS.map(n => new Npc(n.type, n.name, n.x, n.y)) : [];

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
        if (enemy.type !== 'boss' && Math.random() < 0.12) {
          const item = randomMobItem(this.player ? this.player.classId : 'swordsman');
          this.pickups.push(new Pickup('item', enemy.x + rand(-6, 6), enemy.y - 6, 1, item));
          this.showItemDrop(enemy.x, enemy.y, item);
        }
      }
      if (enemy.type === 'boss') {
        this.bossDefeated = true;
        const rarity = Math.random() < 0.5 ? 'epic' : 'rare';
        const item = makeItem(
          rarity === 'epic' ? 'Cave Sovereign Relic' : 'Boss-Slayer Charm',
          Math.random() < 0.6 ? 'weapon' : 'armor',
          rarity,
          rarity === 'epic' ? { attack: 14, hp: 30, defense: 6 } : { attack: 9, hp: 18, defense: 3 },
          { classId: this.player.classId, effect: pick(['flame', 'frost', 'void', 'thunder']), desc: 'Forged in the heart of the dungeon.' }
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
      p.collected = true;
      const pl = this.player;
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
      } else {
        if (!pl.addItem(p.item)) {
          pl.gold += 15;
          this.addFloater(pl.x, pl.y - 46, 'Inventory full: +15g', '#ffd75e', 10);
        } else {
          this.addFloater(pl.x, pl.y - 46, `Found ${p.item.name}`, RARITY[p.item.rarity].color, 11);
          if (p.item.rarity !== 'common') this.log(`You found a ${p.item.rarity} item: ${p.item.name}!`, RARITY[p.item.rarity].color);
        }
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
      chest.collected = true;
      const item = chest.item;
      if (item && this.player.addItem(item)) {
        this.addFloater(this.player.x, this.player.y - 46, `Found ${item.name}`, RARITY[item.rarity].color, 11);
        this.log(`Boss chest: ${item.name}!`, RARITY[item.rarity].color);
      } else {
        this.player.gold += 100;
        this.addFloater(this.player.x, this.player.y - 46, 'Chest: +100 gold', '#ffd75e', 11);
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
      const ready = this.quest.stage === 2
        ? this.quest.goblins >= 8 && this.quest.ore >= 4
        : this.quest.kills >= 10 && this.quest.herbs >= 5;
      if (this.quest.active && !this.quest.complete && ready) {
        this.quest.complete = true;
        this.log('Quest complete! Return to Elder Tarn for your reward.', '#ffd75e');
        this.audio.sfx('level');
        this.save();
      }
    }

    acceptQuest() {
      if (this.network.online) { this.network.send({ type: 'questAccept' }); return; }
      if (this.quest.claimed) return;
      if (this.quest.complete) { this.turnInQuest(); return; }
      this.quest.active = true;
      this.log(this.quest.stage === 2
        ? 'Cave Patrol accepted: defeat 8 goblins and collect 4 ore.'
        : 'Forest Cleanup accepted: defeat 10 slimes and collect 5 herbs.', '#ffd75e');
      this.save();
    }

    turnInQuest() {
      if (this.network.online) { this.network.send({ type: 'questTurnIn' }); this.panel = null; return; }
      if (!this.quest.complete || this.quest.claimed) return;
      if (this.quest.stage === 1) {
        this.quest.stage = 2;
        this.quest.active = false;
        this.quest.complete = false;
        this.quest.kills = 0;
        this.quest.herbs = 0;
        this.player.gold += 100;
        this.player.gainXp(180, this);
        this.log('Forest Cleanup complete! +100 gold, +180 XP. Cave Patrol unlocked.', '#ffd75e');
        this.audio.sfx('level');
        this.panel = null;
        this.save();
        return;
      }
      this.quest.claimed = true;
      this.quest.active = false;
      this.player.gold += 140;
      this.player.gainXp(260, this);
      const reward = makeItem('Elder Amulet', 'armor', 'epic', { hp: 30, defense: 6, mana: 20, manaRegen: 1 }, {
        classId: this.player.classId, spriteColor: '#e3b7ff', icon: 'A', desc: 'Reward from Elder Tarn.'
      });
      if (!this.player.addItem(reward)) this.player.gold += 60;
      this.log('Cave Patrol complete! +140 gold, +260 XP, epic reward.', '#ffd75e');
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
        else if (source.type === 'inv' && (item.slot === 'weapon' || item.slot === 'armor')) {
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
      if (/^skill[0-2]$/.test(action)) {
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
        case 'start': this.startNewGame(); break;
        case 'continue': this.loadGame(); break;
        case 'focusName':
          this.nameFocused = true;
          this.syncNativeTextInputOverlay(true);
          break;
        case 'openLogin': this.openLogin(); break;
        case 'loginBack': this.state = 'select'; break;
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
        case 'settings': this.paused = true; this.clearInput(); this.audio.sfx('ui'); break;
        case 'interact': this.interact(); break;
        case 'emote': this.emote(); break;
        case 'party': this.inviteParty(); break;
        case 'partyLeave': this.leaveParty(); break;
        case 'partyDisband': this.disbandParty(); break;
        case 'potion':
          if (this.network.online) this.network.send({ type: 'potion' });
          else if (this.player) { const idx = this.player.inventory.findIndex(it => it.slot === 'consumable'); if (idx >= 0) this.player.usePotion(idx, this); }
          break;
        case 'chat': this.chatOpen = true; this.chatInput = ''; break;
        case 'chatZone': this.chatChannel = 'zone'; this.chatOpen = true; break;
        case 'chatGuild': this.chatChannel = 'guild'; this.chatOpen = true; break;
        case 'openInventory': this.panel = 'inventory'; break;
        case 'openSkills': this.panel = 'skills'; break;
        case 'openAuction': this.panel = 'auction'; if (this.network.online) this.network.send({ type: 'auctionList' }); break;
        case 'openMail': this.panel = 'mail'; if (this.network.online) this.network.send({ type: 'mailList' }); break;
        case 'openGuild': this.panel = 'guild'; if (this.network.online) this.network.send({ type: 'guildInfo' }); break;
        case 'openCraft': this.panel = 'craft'; break;
        case 'openTalents': this.panel = 'talents'; break;
        case 'openQuest': this.panel = 'quest'; break;
        case 'equipSelectedItem': {
          const item = this.player && this.player.inventory.find(it => it.uid === this.selectedItemUid);
          if (!item || (item.slot !== 'weapon' && item.slot !== 'armor')) {
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
          else { this.save(); this.state = 'select'; this.paused = false; this.panel = null; }
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
      ctx.fillStyle = opts.color || (hover ? '#3f6ea8' : '#2b3d5c');
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = opts.border || '#8fa8d0';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.fillStyle = opts.textColor || '#fff';
      ctx.font = `bold ${opts.fontSize || 12}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + w / 2, y + h / 2 + 0.5);
      ctx.textBaseline = 'alphabetic';
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
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, VIEW_W, VIEW_H);
      this.clickRegions = [];
      this.dropRegions = [];

      if (this.state === 'select') {
        this.drawSelectScreen();
        this.drawDraggedItem();
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
      this.drawHUD();
      this.drawBossBar();
      this.drawHotbar();
      this.drawQuestTracker();
      this.drawParty();
      this.drawMinimap();
      this.drawLeaderboard();
      this.drawChat();
      this.drawPrompt();

      if (this.panel === 'inventory') this.drawInventoryPanel();
      else if (this.panel === 'skills') this.drawSkillsPanel();
      else if (this.panel === 'shop') this.drawShopPanel();
      else if (this.panel === 'quest') this.drawQuestPanel();
      else if (this.panel === 'auction') this.drawAuctionPanel();
      else if (this.panel === 'mail') this.drawMailPanel();
      else if (this.panel === 'guild') this.drawGuildPanel();
      else if (this.panel === 'craft') this.drawCraftPanel();
      else if (this.panel === 'talents') this.drawTalentsPanel();

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

      const sx = Math.max(0, Math.floor(this.camX / TILE));
      const sy = Math.max(0, Math.floor(this.camY / TILE));
      const ex = Math.min(this.zone.w - 1, Math.floor((this.camX + VIEW_W) / TILE));
      const ey = Math.min(this.zone.h - 1, Math.floor((this.camY + VIEW_H) / TILE));
      for (let ty = sy; ty <= ey; ty++) {
        for (let tx = sx; tx <= ex; tx++) {
          const id = this.zone.tiles[ty * this.zone.w + tx];
          ctx.drawImage(tileCanvas(id), tx * TILE, ty * TILE, TILE, TILE);
        }
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
      ctx.save();
      ctx.globalAlpha = 0.82;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      if (isMeteor) {
        ctx.setLineDash([7, 5]);
        ctx.beginPath();
        ctx.arc(tx, centerY, 108, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.moveTo(this.player.x, this.player.y - 8);
        ctx.lineTo(tx, centerY);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      const radius = isMeteor ? 13 : isBlink ? 12 : 10;
      ctx.beginPath();
      ctx.arc(tx, centerY, radius, 0, TAU);
      ctx.moveTo(tx - radius - 5, centerY); ctx.lineTo(tx - radius + 1, centerY);
      ctx.moveTo(tx + radius - 1, centerY); ctx.lineTo(tx + radius + 5, centerY);
      ctx.moveTo(tx, centerY - radius - 5); ctx.lineTo(tx, centerY - radius + 1);
      ctx.moveTo(tx, centerY + radius - 1); ctx.lineTo(tx, centerY + radius + 5);
      ctx.stroke();
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
      dctx.clearRect(0, 0, VIEW_W, VIEW_H);
      dctx.globalCompositeOperation = 'source-over';
      dctx.fillStyle = `rgba(3,6,24,${night * 0.82})`;
      dctx.fillRect(0, 0, VIEW_W, VIEW_H);
      dctx.globalCompositeOperation = 'destination-out';
      const px = this.player.x - this.camX + (this.shakeX || 0);
      const py = this.player.y - 16 - this.camY + (this.shakeY || 0);
      const radius = this.player.classId === 'mage' ? 230 : 190;
      const grad = dctx.createRadialGradient(px, py, 10, px, py, radius);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(0.55, 'rgba(0,0,0,0.82)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      dctx.fillStyle = grad;
      dctx.fillRect(px - radius, py - radius, radius * 2, radius * 2);
      dctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(this.darkCanvas, 0, 0);

      // A small label tells the player what part of the cycle it is.
      ctx.save();
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'right';
      ctx.fillStyle = '#cfd8ff';
      ctx.fillText(night > 0.65 ? 'NIGHT' : night > 0.3 ? 'DUSK' : 'DAY', VIEW_W - 14, 24);
      ctx.restore();
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
      ctx.fillStyle = 'rgba(8,12,22,0.88)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#7d89a8';
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#fff';
      ctx.fillText(this.zone.name + ' Map', x + 6, y + 13);
      if (!this.minimapCache) return;
      const mx = x + 2;
      const my = y + 18;
      const mw = w - 4;
      const mh = h - 22;
      ctx.drawImage(this.minimapCache, mx, my, mw, mh);
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
      ctx.fillStyle = 'rgba(8,12,22,0.88)';
      ctx.fillRect(12, 12, 250, 100);
      ctx.strokeStyle = '#7d89a8';
      ctx.strokeRect(12.5, 12.5, 249, 99);
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = CLASS_DATA[p.classId].color;
      ctx.fillText(`${p.name}  Lv ${p.level}`, 22, 32);
      ctx.font = '10px monospace';
      ctx.fillStyle = '#c9d4e8';
      ctx.fillText(`${CLASS_DATA[p.classId].name}   ATK ${Math.round(p.finalStats.attack)}   SPD ${Math.round(p.finalStats.speed)}   RNG ${Math.round(p.finalStats.range)}`, 22, 46);
      const resourceName = p.classId === 'mage' ? 'MANA' : 'STAMINA';
      drawBar(ctx, 22, 52, 230, 14, p.hp / p.maxHp, '#e85d6a', `HP ${Math.ceil(p.hp)}/${p.maxHp}`);
      drawBar(ctx, 22, 70, 230, 12, p.mp / p.maxMp, p.classId === 'mage' ? '#6a8cff' : '#63c98a', `${resourceName} ${Math.ceil(p.mp)}/${p.maxMp}`);
      drawBar(ctx, 22, 86, 230, 10, p.xp / p.xpNext, '#b57bff', `XP ${p.xp}/${p.xpNext}`);
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
      const startX = VIEW_W / 2 - 116;
      const y = VIEW_H - 76;
      for (let i = 0; i < 3; i++) {
        const x = startX + i * 76;
        const def = skills[i];
        const cd = p.skillCd[i];
        ctx.fillStyle = 'rgba(10,15,28,0.92)';
        ctx.fillRect(x, y, 70, 62);
        ctx.strokeStyle = cd > 0 ? '#5a6378' : CLASS_DATA[p.classId].color;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, 68, 60);
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.fillText(`${i + 1}`, x + 10, y + 14);
        ctx.fillStyle = '#dbe6ff';
        ctx.font = '9px monospace';
        const words = def.name.split(' ');
        const labelStartY = words.length === 1 ? y + 30 : y + 24;
        words.forEach((word, k) => ctx.fillText(word, x + 35, labelStartY + k * 10, 58));
        ctx.fillStyle = p.mp >= def.cost ? '#8ee6ff' : '#ff9b9b';
        ctx.fillText(`cost ${def.cost}`, x + 35, y + 52);
        ctx.fillStyle = '#9aa6bd';
        ctx.fillText(`R${p.skillRanks[i]}`, x + 58, y + 14);
        if (cd > 0) {
          ctx.fillStyle = 'rgba(0,0,0,0.62)';
          ctx.fillRect(x + 2, y + 2, 66, 58);
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 16px monospace';
          ctx.fillText(cd.toFixed(1), x + 35, y + 37);
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
      ctx.fillStyle = 'rgba(8,12,22,0.84)';
      ctx.fillRect(12, 120, 230, 58);
      ctx.strokeStyle = '#c3a4ff';
      ctx.strokeRect(12.5, 120.5, 229, 57);
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffd75e';
      const title = q.stage === 2 ? 'Cave Patrol' : 'Forest Cleanup';
      ctx.fillText(q.complete ? 'Quest ready to turn in!' : `Quest: ${title}`, 20, 138);
      ctx.font = '10px monospace';
      ctx.fillStyle = '#dbe6ff';
      ctx.fillText(q.stage === 2 ? `Goblins: ${q.goblins || 0}/8` : `Slimes: ${q.kills}/10`, 20, 154);
      ctx.fillText(q.stage === 2 ? `Ore: ${q.ore || 0}/4` : `Herbs: ${q.herbs}/5`, 120, 154);
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
      const x = 12;
      const y = VIEW_H - 138;
      const w = 350;
      const h = 126;
      ctx.fillStyle = 'rgba(6,10,20,0.82)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#4b5b78';
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + 4, y + 4, w - 8, h - 8);
      ctx.clip();
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      const visible = this.chatMessages.slice(-8);
      let ty = y + h - (this.chatOpen ? 30 : 10);
      for (let i = visible.length - 1; i >= 0; i--) {
        const msg = visible[i];
        ctx.fillStyle = msg.color;
        ctx.fillText(msg.text, x + 8, ty);
        ty -= 13;
        if (ty < y + 12) break;
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
      this.button(x + 34, y + 242, 272, 20, 'BACK TO OFFLINE TITLE', 'loginBack', { color: '#34405c' });

      ctx.fillStyle = this.network.connected ? '#8ee6a8' : this.network.connecting ? '#ffd75e' : '#ff9b9b';
      ctx.font = '11px monospace';
      ctx.fillText(this.network.connected ? `Connected to ${this.network.url}` :
        this.network.connecting ? 'Connecting to server...' :
          `Server offline. Start server.js, or open ?ws=ws://host:port/ws`, VIEW_W / 2, 450);
      ctx.fillStyle = '#7f8ca5';
      ctx.font = '10px monospace';
      ctx.fillText('Offline mode still works: press Esc or BACK, then START.', VIEW_W / 2, 476);
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
      ctx.fillText('A tiny browser MMORPG - choose your hero', VIEW_W / 2, 80);

      const ids = ['swordsman', 'archer', 'mage'];
      const frame = Math.floor(this.time * 3) % 4;
      ids.forEach((id, i) => {
        const x = 62 + i * 295;
        const y = 104;
        const w = 275;
        const h = 326;
        const data = CLASS_DATA[id];
        const selected = this.selectedClass === id;
        ctx.fillStyle = selected ? 'rgba(40,62,100,0.96)' : 'rgba(14,20,36,0.92)';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = selected ? '#ffd75e' : '#58668a';
        ctx.lineWidth = selected ? 3 : 1;
        ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

        ctx.fillStyle = '#0d1324';
        ctx.fillRect(x + 82, y + 26, 110, 110);
        drawSprite(ctx, playerSprite(id, frame, false, {}), x + w / 2, y + 128, 3);

        ctx.font = 'bold 19px monospace';
        ctx.fillStyle = data.color;
        ctx.fillText(data.name, x + w / 2, y + 160);
        ctx.font = '11px monospace';
        ctx.fillStyle = '#c8d3ea';
        wrappedText(ctx, data.blurb, x + 18, y + 182, w - 36, 14, 2);

        const stats = [
          ['HP', data.maxHp],
          ['ATK', data.attack],
          ['SPD', data.speed],
          ['RNG', data.range]
        ];
        stats.forEach((s, k) => {
          const sy = y + 222 + k * 22;
          ctx.font = 'bold 11px monospace';
          ctx.textAlign = 'left';
          ctx.fillStyle = '#9fb0cd';
          ctx.fillText(s[0], x + 22, sy);
          drawBar(ctx, x + 62, sy - 10, 130, 11, clamp(s[1] / 300, 0.1, 1), data.color);
          ctx.textAlign = 'right';
          ctx.fillStyle = '#fff';
          ctx.fillText(String(s[1]), x + 254, sy);
          ctx.textAlign = 'center';
        });

        this.clickRegions.push({ x, y, w, h, action: 'select:' + id });
      });

      // On-canvas name input: typing works without any HTML input element.
      const nx = 278;
      const ny = 452;
      const nw = 220;
      const nh = 34;
      ctx.textAlign = 'left';
      ctx.font = '12px monospace';
      ctx.fillStyle = '#c8d3ea';
      ctx.fillText('Name:', nx - 52, ny + 22);
      ctx.fillStyle = '#0c1220';
      ctx.fillRect(nx, ny, nw, nh);
      ctx.strokeStyle = this.nameFocused ? '#ffd75e' : '#7d89a8';
      ctx.lineWidth = this.nameFocused ? 2 : 1;
      ctx.strokeRect(nx + 0.5, ny + 0.5, nw - 1, nh - 1);
      ctx.fillStyle = '#fff';
      const caret = this.nameFocused && Math.floor(this.time * 2) % 2 ? '_' : '';
      ctx.fillText(this.nameInput + caret, nx + 8, ny + 22);
      this.clickRegions.push({ x: nx, y: ny, w: nw, h: nh, action: 'focusName' });

      this.button(516, 452, 132, 34, 'START', 'start', { color: '#3f7d55', border: '#8ee6a8' });
      if (this.saveData) {
        const label = `CONTINUE Lv${this.saveData.level || 1}`;
        this.button(660, 452, 168, 34, label, 'continue', { color: '#5b4b8c', border: '#c9a6ff' });
      }
      this.button(836, 452, 108, 34, 'ONLINE (O)', 'openLogin', { color: '#2f5f8c', border: '#8ee6ff' });
      ctx.textAlign = 'center';
      ctx.font = '10px monospace';
      ctx.fillStyle = '#7f8ca5';
      ctx.fillText('Offline: START / C to continue. Online: press O to log in and play on the Node server.', VIEW_W / 2, 516);
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
        const selected = item && source.type === 'inv' && item.uid === this.selectedItemUid;
        ctx.strokeStyle = selected ? '#ffd75e' : color;
        ctx.lineWidth = selected ? 3 : item ? 2 : 1;
        ctx.strokeRect(cx + 0.5, cy + 0.5, size - 1, size - 1);
        if (item) {
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.12;
          ctx.fillRect(cx + 6, cy + 6, size - 12, size - 12);
          ctx.globalAlpha = 1;
          drawItemImage(ctx, item, cx + 6, cy + 6, size - 12);
        }
        this.dropRegions.push({ x: cx, y: cy, w: size, h: size, item, source });
      };

      // Equipment slots. Their sprite colors change what the hero wears.
      ctx.font = 'bold 11px monospace';
      ctx.fillStyle = '#dbe6ff';
      ctx.textAlign = 'left';
      ctx.fillText('Weapon', x + 24, y + 58);
      drawItemCell(x + 20, y + 66, 82, p.equipment.weapon, { type: 'equip', slot: 'weapon' });
      ctx.fillText('Armor', x + 24, y + 174);
      drawItemCell(x + 20, y + 182, 82, p.equipment.armor, { type: 'equip', slot: 'armor' });

      ctx.font = '10px monospace';
      ctx.fillStyle = '#9fb0cd';
      const lines = [
        `ATK  ${Math.round(p.finalStats.attack)}`,
        `DEF  ${p.finalStats.defense.toFixed(1)}`,
        `HP   ${p.maxHp}`,
        `SPD  ${Math.round(p.finalStats.speed)}`,
        `Gold ${p.gold}`
      ];
      lines.forEach((line, i) => ctx.fillText(line, x + 22, y + 300 + i * 16));

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
      const selectedItem = p.inventory.find(item => item.uid === this.selectedItemUid);
      if (selectedItem) {
        ctx.font = 'bold 10px monospace';
        ctx.fillStyle = RARITY[selectedItem.rarity].color;
        wrappedText(ctx, selectedItem.name, ix, y + 150, 174, 13, 2);
        ctx.font = '10px monospace';
        ctx.fillStyle = '#9fb0cd';
        const requirement = selectedItem.classId ? `${CLASS_DATA[selectedItem.classId]?.name || selectedItem.classId} only` : 'Any role';
        ctx.fillText(`${selectedItem.slot.toUpperCase()} · ${requirement}`, ix, y + 180);
        ctx.fillStyle = '#dbe6ff';
        wrappedText(ctx, itemStatsText(selectedItem), ix, y + 199, 174, 13, 5);
        if (selectedItem.desc) {
          ctx.fillStyle = '#8290aa';
          wrappedText(ctx, selectedItem.desc, ix, y + 263, 174, 12, 1);
        }
      } else {
        ctx.font = '10px monospace';
        ctx.fillStyle = '#9fb0cd';
        wrappedText(ctx, 'Select an item to view its role requirement and attributes. Double-click gear to equip; drag items to rearrange.', ix, y + 150, 174, 15, 7);
      }

      const isGear = selectedItem && (selectedItem.slot === 'weapon' || selectedItem.slot === 'armor');
      const canEquipSelected = isGear && itemCanEquip(selectedItem, p.classId);
      const equipLabel = canEquipSelected ? `EQUIP ${selectedItem.slot.toUpperCase()}`
        : isGear ? `${CLASS_DATA[selectedItem.classId]?.name || 'OTHER'} ONLY` : 'SELECT GEAR TO EQUIP';
      this.button(x + 452, y + 278, 160, 30, equipLabel, 'equipSelectedItem', {
        color: canEquipSelected ? '#3f7d55' : '#34405c',
        border: canEquipSelected ? '#8ee6a8' : '#59647a',
        fontSize: 10
      });
      this.button(x + 452, y + 314, 160, 30, 'SKILLS (K)', 'openSkills', { color: '#4a3f7a' });
      this.button(x + 452, y + 350, 160, 30, 'USE POTION (Q)', 'potion', { color: '#6b3542' });
      this.button(x + 452, y + 386, 160, 30, 'CLOSE', 'closePanel', { color: '#34405c' });
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
        const by = y + 46 + i * 106;
        ctx.fillStyle = 'rgba(18,26,44,0.9)';
        ctx.fillRect(bx, by, w - 36, 94);
        ctx.strokeStyle = CLASS_DATA[p.classId].color;
        ctx.strokeRect(bx + 0.5, by + 0.5, w - 37, 93);
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#fff';
        ctx.fillText(`${i + 1}. ${def.name}`, bx + 12, by + 22);
        ctx.font = '11px monospace';
        ctx.fillStyle = '#9fb0cd';
        ctx.fillText(`Rank ${p.skillRanks[i]}/5   Cost ${def.cost}   Cooldown ${def.cd.toFixed(1)}s`, bx + 12, by + 40);
        ctx.fillStyle = '#dbe6ff';
        ctx.font = '10px monospace';
        wrappedText(ctx, def.desc, bx + 12, by + 58, 300, 13, 2);
        const canUpgrade = p.skillPoints > 0 && p.skillRanks[i] < 5;
        this.button(bx + 344, by + 30, 118, 34,
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
        const roleText = item.classId ? `${CLASS_DATA[item.classId]?.name || item.classId} only · ` : '';
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
      const stage = this.quest.stage === 2 ? 2 : 1;
      const title = stage === 2 ? 'Cave Patrol' : 'Forest Cleanup';
      panel(ctx, x, y, w, h, `Quest - ${title} (${stage}/2)`);
      ctx.font = '12px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#dbe6ff';
      const description = stage === 2
        ? 'Elder Tarn needs the cave cleared. Defeat 8 goblins and bring back 4 ore. Ore drops from goblins.'
        : 'Elder Tarn needs the forest cleared. Defeat 10 slimes and bring back 5 herbs. Herbs drop from monsters.';
      wrappedText(ctx, description, x + 24, y + 54, w - 48, 18, 4);
      const firstProgress = stage === 2 ? (this.quest.goblins || 0) / 8 : this.quest.kills / 10;
      const secondProgress = stage === 2 ? (this.quest.ore || 0) / 4 : this.quest.herbs / 5;
      drawBar(ctx, x + 24, y + 128, w - 48, 16, firstProgress, '#ff8c42', stage === 2 ? `Goblins: ${this.quest.goblins || 0}/8` : `Slimes: ${this.quest.kills}/10`);
      drawBar(ctx, x + 24, y + 154, w - 48, 16, secondProgress, '#6ee787', stage === 2 ? `Ore: ${this.quest.ore || 0}/4` : `Herbs: ${this.quest.herbs}/5`);
      ctx.textAlign = 'left';
      ctx.font = '11px monospace';
      ctx.fillStyle = '#9fb0cd';
      const status = this.quest.claimed ? 'Reward already claimed.'
        : this.quest.complete ? stage === 1
          ? 'Ready to turn in! Reward: 100 gold and 180 XP. This unlocks the Cave Patrol.'
          : 'Ready to turn in! Reward: 140 gold, 260 XP, and an epic armor piece.'
          : this.quest.active ? 'Quest in progress. Keep hunting!' : stage === 2
            ? 'Second request in Elder Tarn’s quest chain.'
            : 'First request in Elder Tarn’s quest chain.';
      wrappedText(ctx, status, x + 24, y + 196, w - 48, 16, 3);
      if (this.quest.claimed) {
        this.button(x + 162, y + 294, 140, 32, 'CLOSE', 'closePanel', { color: '#34405c' });
      } else if (this.quest.complete) {
        this.button(x + 72, y + 294, 150, 32, 'TURN IN', 'questTurnIn', { color: '#3f7d55' });
        this.button(x + 242, y + 294, 150, 32, 'LATER', 'closePanel', { color: '#34405c' });
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
        this.button(rx + 12, ry + 96, 182, 24, 'CRAFT', 'craft:' + r.id,
          { color: this.network.online ? '#3f7d55' : '#4a3340' });
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
        ctx.fillStyle = 'rgba(18,26,44,0.92)';
        ctx.fillRect(tx, ty, 226, 92);
        ctx.strokeStyle = rank > 0 ? '#c9a6ff' : '#58668a';
        ctx.strokeRect(tx + 0.5, ty + 0.5, 225, 91);
        ctx.font = 'bold 12px monospace';
        ctx.fillStyle = '#fff';
        ctx.fillText(t.name, tx + 10, ty + 22);
        ctx.font = '10px monospace';
        ctx.fillStyle = '#9fb0cd';
        wrappedText(ctx, t.desc, tx + 10, ty + 40, 150, 12, 3);
        ctx.fillStyle = '#ffd75e';
        ctx.fillText(`${rank}/3`, tx + 10, ty + 78);
        const canRank = p.skillPoints > 0 && rank < 3;
        this.button(tx + 150, ty + 56, 66, 26, rank >= 3 ? 'MAX' : '+ RANK', 'talent:' + t.id,
          { color: canRank ? '#5b4b8c' : '#4a3340', fontSize: 9 });
      });

      const specList = SPECS[p.classId] || [];
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
        ctx.font = 'bold 12px monospace';
        ctx.fillStyle = p.spec === s.id ? '#ffd75e' : '#fff';
        ctx.fillText(s.id, sx + 10, sy + 24);
        ctx.font = '10px monospace';
        ctx.fillStyle = '#9fb0cd';
        ctx.fillText(s.desc, sx + 10, sy + 44);
        if (p.spec !== s.id) {
          this.button(sx + 244, sy + 40, 90, 26, p.level < 10 ? 'LVL 10' : 'CHOOSE', 'spec:' + s.id,
            { color: p.level >= 10 && !p.spec ? '#3f7d55' : '#4a3340', fontSize: 9 });
        }
      });

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
      this.button(x + 106, y + 42, 160, 34, 'RESUME (Esc)', 'resume', { color: '#3f7d55' });
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
        'Tab lock   L unlock   Esc pause'
      ];
      controls.forEach((line, i) => {
        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#b9c7e6';
        ctx.fillText(line, x + 26, y + 206 + i * 14);
      });
      this.button(x + 106, y + 350, 160, 30, 'QUIT TO TITLE', 'quitToSelect', { color: '#6b3542' });
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
