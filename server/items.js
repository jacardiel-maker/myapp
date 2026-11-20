/*
  server/items.js
  Authoritative item generation, equipment slot validation, drop tables, and progression.
  Expanded from 2 slots to 6 equipment slots:
    - weapon
    - armor
    - helmet
    - boots
    - ring
    - necklace
  Plus consumable, material, and pet equipment.
*/

export const VALID_EQUIP_SLOTS = ['weapon', 'armor', 'helmet', 'boots', 'ring', 'necklace'];
export const ALL_ITEM_SLOTS = [...VALID_EQUIP_SLOTS, 'consumable', 'material', 'pet_collar', 'pet_charm'];

export const RARITY = {
  common:    { color: '#c0c6d2', mult: 1.0, label: 'Common' },
  rare:      { color: '#56c2ff', mult: 1.6, label: 'Rare' },
  epic:      { color: '#c86dff', mult: 2.5, label: 'Epic' },
  legendary: { color: '#ffaa00', mult: 4.0, label: 'Legendary' }
};

export const ROLE_ITEM_ART = {
  swordsman: 'roleSword',
  archer:    'roleBow',
  mage:      'roleStaff',
  cleric:    'roleMace',
  rogue:     'roleDagger',
  summoner:  'roleTome'
};

export const ROLE_ITEM_DEFS = {
  swordsman: {
    name: 'Dawnfang Blade', art: 'roleSword', icon: 'S',
    stats: { attack: 20, hp: 16, speed: 4, crit: 0.03, defense: 3 },
    effect: 'flame', spriteColor: '#eef5ff', color: '#ffd27a', price: 450,
    desc: 'Swordsman relic: a sunlit blade that burns on impact.'
  },
  archer: {
    name: 'Windsong Bow', art: 'roleBow', icon: 'B',
    stats: { attack: 16, speed: 14, range: 32, crit: 0.06 },
    effect: 'frost', spriteColor: '#9ce7c4', color: '#8ee6ff', price: 450,
    desc: 'Archer relic: a living bow that hums with the north wind.'
  },
  mage: {
    name: 'Astral Flame Staff', art: 'roleStaff', icon: 'T',
    stats: { attack: 18, mana: 30, range: 22, manaRegen: 2.0 },
    effect: 'void', spriteColor: '#c9a6ff', color: '#ffb15c', price: 450,
    desc: 'Mage relic: focuses starlight into an eternal flame.'
  },
  cleric: {
    name: 'Mace of Radiance', art: 'roleMace', icon: 'M',
    stats: { attack: 15, hp: 25, defense: 4, mana: 25, manaRegen: 1.8 },
    effect: 'holy', spriteColor: '#fff2a8', color: '#ffd700', price: 450,
    desc: 'Cleric relic: blessed hammer that channels holy miracles.'
  },
  rogue: {
    name: 'Shadowfang Dagger', art: 'roleDagger', icon: 'D',
    stats: { attack: 19, speed: 18, crit: 0.12, defense: 1 },
    effect: 'poison', spriteColor: '#52ffb8', color: '#2ecc71', price: 450,
    desc: 'Rogue relic: coated in venom that dissolves armor.'
  },
  summoner: {
    name: 'Grimoire of the Void', art: 'roleTome', icon: 'G',
    stats: { attack: 17, mana: 35, defense: 2, manaRegen: 2.2 },
    effect: 'void', spriteColor: '#c48bff', color: '#9b59b6', price: 450,
    desc: 'Summoner relic: ancient book pulsating with otherworldly spirits.'
  }
};

let nextItemId = 2000000 + (Date.now() % 100000);

export function makeItem(name, slot, rarity = 'common', stats = {}, extra = {}) {
  const safeRarity = RARITY[rarity] ? rarity : 'common';
  const safeSlot = ALL_ITEM_SLOTS.includes(slot) ? slot : 'consumable';
  return {
    uid: Number(extra.uid) || nextItemId++,
    name: String(name || 'Item').slice(0, 40),
    slot: safeSlot,
    rarity: safeRarity,
    stats: {
      hp: Math.round(Number(stats.hp) || 0),
      mana: Math.round(Number(stats.mana) || 0),
      attack: Math.round(Number(stats.attack) || 0),
      defense: Math.round(Number(stats.defense) || 0),
      speed: Math.round(Number(stats.speed) || 0),
      range: Math.round(Number(stats.range) || 0),
      crit: Number(stats.crit) || 0,
      manaRegen: Number(stats.manaRegen) || 0
    },
    classId: extra.classId || null,
    spriteColor: extra.spriteColor || RARITY[safeRarity].color,
    icon: extra.icon || name[0] || '?',
    price: Math.max(1, Math.round(Number(extra.price) || (25 * RARITY[safeRarity].mult))),
    heal: Number(extra.heal) || 0,
    quantity: Math.max(1, Math.floor(Number(extra.quantity) || 1)),
    teleportTo: extra.teleportTo || null,
    desc: String(extra.desc || ''),
    enchant: Math.min(5, Math.max(0, Math.floor(Number(extra.enchant) || 0))),
    effect: extra.effect || null,
    color: extra.color || null,
    art: extra.art || null
  };
}

export function weaponClassFor(item) {
  if (!item || item.slot !== 'weapon') return null;
  const role = Object.entries(ROLE_ITEM_DEFS).find(([id, def]) =>
    item.art === ROLE_ITEM_ART[id] || item.name === def.name);
  if (role) return role[0];
  if (item.art === 'sword' || /sword|blade|edge/i.test(item.name || '')) return 'swordsman';
  if (item.art === 'bow' || /\bbow\b/i.test(item.name || '')) return 'archer';
  if (item.art === 'staff' || /staff|wand/i.test(item.name || '')) return 'mage';
  if (item.art === 'mace' || /mace|hammer|scepter/i.test(item.name || '')) return 'cleric';
  if (item.art === 'dagger' || /dagger|dirk|shiv/i.test(item.name || '')) return 'rogue';
  if (item.art === 'tome' || /tome|grimoire|orb/i.test(item.name || '')) return 'summoner';
  return null;
}

export function itemCanEquip(item, classId) {
  if (!item || !VALID_EQUIP_SLOTS.includes(item.slot)) return false;
  const requiredClass = item.slot === 'weapon' ? (weaponClassFor(item) || item.classId) : item.classId;
  return !requiredClass || requiredClass === classId;
}

export function normalizeItem(raw, defaultClassId = null) {
  if (!raw || typeof raw !== 'object') return null;
  const roleClassId = Object.entries(ROLE_ITEM_DEFS)
    .find(([id, def]) => raw.art === ROLE_ITEM_ART[id] || raw.name === def.name)?.[0];
  const typeClassId = weaponClassFor({ slot: raw.slot, art: raw.art, name: raw.name });
  return makeItem(raw.name, raw.slot, raw.rarity, raw.stats, {
    uid: raw.uid,
    classId: roleClassId || typeClassId || raw.classId || (['weapon', 'armor'].includes(raw.slot) ? defaultClassId : null),
    spriteColor: raw.spriteColor,
    icon: raw.icon,
    price: raw.price,
    heal: raw.heal,
    quantity: raw.quantity,
    teleportTo: raw.teleportTo,
    desc: raw.desc,
    enchant: raw.enchant,
    effect: raw.effect,
    color: raw.color,
    art: raw.art
  });
}

export function compactInventory(items) {
  const result = [];
  for (const item of items) {
    if (!item) continue;
    if (item.slot === 'consumable') {
      const match = result.find(x => x.slot === 'consumable' && x.name === item.name);
      if (match) {
        match.quantity = (match.quantity || 1) + (item.quantity || 1);
        continue;
      }
    }
    result.push(item);
  }
  return result.slice(0, 20);
}

export function teleportScroll(destination = 'village') {
  return makeItem('Village Teleport Scroll', 'consumable', 'rare', {}, {
    art: 'scroll', icon: 'T', price: 45, teleportTo: destination,
    desc: 'A mystical scroll that returns you safely to Hearthvale Village.'
  });
}

export function starterItems(classId) {
  const c = classId || 'swordsman';
  let weapon;
  let armorColor = '#7896c4';

  if (c === 'swordsman') {
    weapon = makeItem('Iron Sword', 'weapon', 'common', { attack: 6 }, { classId: c, art: 'sword', spriteColor: '#d4e0ec', desc: 'Trusty steel blade.' });
    armorColor = '#7896c4';
  } else if (c === 'archer') {
    weapon = makeItem('Short Bow', 'weapon', 'common', { attack: 5 }, { classId: c, art: 'bow', spriteColor: '#9c6a3d', desc: 'Light hunting bow.' });
    armorColor = '#5c9b66';
  } else if (c === 'mage') {
    weapon = makeItem('Oak Staff', 'weapon', 'common', { attack: 7, mana: 10 }, { classId: c, art: 'staff', spriteColor: '#b37b45', desc: 'Channels raw arcane force.' });
    armorColor = '#8b63c8';
  } else if (c === 'cleric') {
    weapon = makeItem('Acolyte Mace', 'weapon', 'common', { attack: 5, hp: 10, mana: 8 }, { classId: c, art: 'mace', spriteColor: '#e0c96c', desc: 'Blunt mace inscribed with prayers.' });
    armorColor = '#c7b370';
  } else if (c === 'rogue') {
    weapon = makeItem('Thief Dagger', 'weapon', 'common', { attack: 6, speed: 4, crit: 0.03 }, { classId: c, art: 'dagger', spriteColor: '#4ca585', desc: 'Concealable serrated blade.' });
    armorColor = '#425752';
  } else { // summoner
    weapon = makeItem('Apprentice Grimoire', 'weapon', 'common', { attack: 6, mana: 12, manaRegen: 0.5 }, { classId: c, art: 'tome', spriteColor: '#956dc8', desc: 'Pages inscribed with spirit runes.' });
    armorColor = '#6d488f';
  }

  const armor = makeItem('Traveler Tunic', 'armor', 'common', { hp: 12, defense: 2 }, {
    classId: c, art: 'armor', spriteColor: armorColor, desc: 'Sturdy traveler garments.'
  });
  const helmet = makeItem('Leather Cap', 'helmet', 'common', { hp: 8, defense: 1 }, {
    art: 'helmet', spriteColor: '#8a6240', desc: 'Padded cap protecting your brow.'
  });
  const boots = makeItem('Worn Boots', 'boots', 'common', { speed: 4, defense: 1 }, {
    art: 'boots', spriteColor: '#634730', desc: 'Comfortable leather boots.'
  });
  const ring = makeItem('Copper Band', 'ring', 'common', { attack: 1, crit: 0.01 }, {
    art: 'ring', spriteColor: '#cf8a48', desc: 'Simple copper ring with faint warmth.'
  });
  const necklace = makeItem('Bone Talisman', 'necklace', 'common', { hp: 6, mana: 6 }, {
    art: 'necklace', spriteColor: '#e0dad0', desc: 'Carved pendant said to ward off misfortune.'
  });

  return {
    equipment: { weapon, armor, helmet, boots, ring, necklace },
    inventory: [
      makeItem('Health Potion', 'consumable', 'common', {}, { art: 'potion', icon: 'P', heal: 60, quantity: 3, price: 20, desc: 'Restores 60 HP instantly.' }),
      makeItem('Mana Potion', 'consumable', 'common', {}, { art: 'potion', icon: 'M', spriteColor: '#5dade2', heal: 40, quantity: 2, price: 25, desc: 'Restores 40 MP instantly.' })
    ]
  };
}

export function roleItem(classId) {
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

export function randomShopItem(index, classId = 'swordsman') {
  const rarities = ['common', 'rare', 'rare', 'epic'];
  const rarity = rarities[index % rarities.length];
  const mult = RARITY[rarity].mult;

  if (index % 5 === 4) return teleportScroll();

  const slotType = ['weapon', 'armor', 'helmet', 'boots', 'ring', 'necklace'][index % 6];

  if (slotType === 'weapon') {
    const names = {
      swordsman: { name: 'Knight Broadsword', art: 'sword', stats: { attack: Math.round(8 * mult), hp: Math.round(6 * mult) } },
      archer:    { name: 'Swift Composite Bow', art: 'bow', stats: { attack: Math.round(7 * mult), speed: Math.round(5 * mult), crit: 0.02 * mult } },
      mage:      { name: 'Spire Arcane Staff', art: 'staff', stats: { attack: Math.round(9 * mult), mana: Math.round(14 * mult) } },
      cleric:    { name: 'Righteous War-Mace', art: 'mace', stats: { attack: Math.round(7 * mult), hp: Math.round(10 * mult), mana: Math.round(8 * mult) } },
      rogue:     { name: 'Assassin Stiletto', art: 'dagger', stats: { attack: Math.round(8 * mult), speed: Math.round(7 * mult), crit: 0.04 * mult } },
      summoner:  { name: 'Necromancer Codex', art: 'tome', stats: { attack: Math.round(8 * mult), mana: Math.round(16 * mult), manaRegen: 0.5 * mult } }
    };
    const chosen = names[classId] || names.swordsman;
    return makeItem(chosen.name, 'weapon', rarity, chosen.stats, { classId, art: chosen.art, desc: `Reinforced weapon for ${classId}.` });
  }

  if (slotType === 'armor') {
    return makeItem('Reinforced Hauberk', 'armor', rarity, {
      hp: Math.round(18 * mult), defense: Math.round(3 * mult)
    }, { art: 'armor', desc: 'Heavy protection against physical blows.' });
  }

  if (slotType === 'helmet') {
    return makeItem('Crested Visor', 'helmet', rarity, {
      hp: Math.round(12 * mult), defense: Math.round(2 * mult)
    }, { art: 'helmet', desc: 'Guards the skull and increases resolve.' });
  }

  if (slotType === 'boots') {
    return makeItem('Windrunner Greaves', 'boots', rarity, {
      speed: Math.round(8 * mult), defense: Math.round(1.5 * mult)
    }, { art: 'boots', desc: 'Lightweight footwear granting brisk step.' });
  }

  if (slotType === 'ring') {
    return makeItem('Glinting Ruby Ring', 'ring', rarity, {
      attack: Math.round(4 * mult), crit: 0.02 * mult
    }, { art: 'ring', desc: 'Enchanted ring sparkling with aggressive vigor.' });
  }

  // necklace
  return makeItem('Pendant of the Depths', 'necklace', rarity, {
    hp: Math.round(10 * mult), mana: Math.round(15 * mult), manaRegen: 0.4 * mult
  }, { art: 'necklace', desc: 'Deep sapphire charm that steadies breath and mana.' });
}

export function makeShopStock(classId = 'swordsman') {
  return [
    randomShopItem(0, classId),
    randomShopItem(1, classId),
    randomShopItem(2, classId),
    randomShopItem(3, classId),
    randomShopItem(4, classId),
    randomShopItem(5, classId),
    roleItem('swordsman'),
    roleItem('archer'),
    roleItem('mage'),
    roleItem('cleric'),
    roleItem('rogue'),
    roleItem('summoner'),
    makeItem('Grand Health Potion', 'consumable', 'rare', {}, { art: 'potion', icon: 'P', heal: 120, quantity: 3, price: 50, desc: 'Potent elixir restoring 120 HP.' }),
    makeItem('Grand Mana Potion', 'consumable', 'rare', {}, { art: 'potion', icon: 'M', spriteColor: '#5dade2', heal: 80, quantity: 3, price: 60, desc: 'Restores 80 MP.' }),
    teleportScroll('village')
  ];
}

export function generateMonsterDrop(enemyType, zoneId, multiplier = 1) {
  const roll = Math.random();
  if (roll < 0.45) return null; // 55% chance for a drop

  const rarityRoll = Math.random();
  const rarity = rarityRoll > 0.94 ? 'legendary' : rarityRoll > 0.80 ? 'epic' : rarityRoll > 0.50 ? 'rare' : 'common';
  const mult = RARITY[rarity].mult * Math.max(1, multiplier * 0.8);

  const slotRoll = Math.floor(Math.random() * 6);
  const slots = ['weapon', 'armor', 'helmet', 'boots', 'ring', 'necklace'];
  const slot = slots[slotRoll];

  const prefix = zoneId === 'frost_cave' ? 'Frostbound' : zoneId === 'volcano' ? 'Molten' : zoneId === 'swamp' ? 'Toxic' : zoneId === 'cave' ? 'Deeprock' : 'Woodland';

  if (slot === 'weapon') {
    return makeItem(`${prefix} Blade`, 'weapon', rarity, { attack: Math.round(7 * mult), crit: 0.02 * mult }, { art: 'sword', desc: `Found in ${zoneId}.` });
  }
  if (slot === 'armor') {
    return makeItem(`${prefix} Plate`, 'armor', rarity, { hp: Math.round(16 * mult), defense: Math.round(3 * mult) }, { art: 'armor', desc: `Found in ${zoneId}.` });
  }
  if (slot === 'helmet') {
    return makeItem(`${prefix} Crown`, 'helmet', rarity, { hp: Math.round(12 * mult), defense: Math.round(2 * mult) }, { art: 'helmet', desc: `Found in ${zoneId}.` });
  }
  if (slot === 'boots') {
    return makeItem(`${prefix} Treads`, 'boots', rarity, { speed: Math.round(6 * mult), defense: Math.round(1.5 * mult) }, { art: 'boots', desc: `Found in ${zoneId}.` });
  }
  if (slot === 'ring') {
    return makeItem(`${prefix} Ring`, 'ring', rarity, { attack: Math.round(3 * mult), crit: 0.03 * mult }, { art: 'ring', desc: `Found in ${zoneId}.` });
  }
  return makeItem(`${prefix} Amulet`, 'necklace', rarity, { hp: Math.round(14 * mult), mana: Math.round(14 * mult) }, { art: 'necklace', desc: `Found in ${zoneId}.` });
}
