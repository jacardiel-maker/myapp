/*
  server/pets.js
  Authoritative pet companion system.
  Features:
    - Multiple pet types: Wolf, Fairy, Golem, Dragonling
    - Pet leveling (Lv 1 - 20) via combat XP share
    - Pet stat auras & autonomous AI actions (heals, taunts, elemental attacks)
    - Pet equipment: collar & charm slots
*/

export const PET_TYPES = {
  wolf: {
    id: 'wolf',
    name: 'Dire Wolf',
    color: '#a0aab8',
    aura: { attack: 4, speed: 6 },
    perLevel: { attack: 1.5, hp: 8 },
    skillName: 'Fierce Bite',
    desc: 'Loyal canine hunter. Increases owner attack power and pounces on targets.'
  },
  fairy: {
    id: 'fairy',
    name: 'Moon Fairy',
    color: '#8be9fd',
    aura: { manaRegen: 1.2, mana: 20 },
    perLevel: { manaRegen: 0.3, hp: 6 },
    skillName: 'Starlight Blessing',
    desc: 'Luminous spirit. Heals owner when low on health and bolsters mana flow.'
  },
  golem: {
    id: 'golem',
    name: 'Stone Golem',
    color: '#8b8579',
    aura: { defense: 3, hp: 25 },
    perLevel: { defense: 1.2, hp: 14 },
    skillName: 'Earth Slam',
    desc: 'Miniature bulwark. Grants bonus armor and draws enemy aggression.'
  },
  dragon: {
    id: 'dragon',
    name: 'Pyro Drake',
    color: '#ff5555',
    aura: { crit: 0.03, attack: 3 },
    perLevel: { attack: 1.8, hp: 9 },
    skillName: 'Fire Breath',
    desc: 'Fierce winged beast. Enhances critical strikes and scorches foes in an arc.'
  }
};

export function freshPet(type = 'wolf', name = null) {
  const pType = PET_TYPES[type] ? type : 'wolf';
  const def = PET_TYPES[pType];
  return {
    type: pType,
    name: name || def.name,
    level: 1,
    xp: 0,
    xpNext: 100,
    equipment: { collar: null, charm: null },
    skillCd: 0
  };
}

export function normalizePet(saved) {
  if (!saved || typeof saved !== 'object') return null;
  const pType = PET_TYPES[saved.type] ? saved.type : 'wolf';
  const def = PET_TYPES[pType];
  const level = Math.max(1, Math.min(20, Math.floor(Number(saved.level) || 1)));
  const xp = Math.max(0, Number(saved.xp) || 0);
  const xpNext = level * 100 + (level - 1) * 50;

  return {
    type: pType,
    name: String(saved.name || def.name).slice(0, 20),
    level,
    xp,
    xpNext,
    equipment: {
      collar: saved.equipment?.collar || null,
      charm: saved.equipment?.charm || null
    },
    skillCd: 0
  };
}

export function addPetXp(character, amount, world, client) {
  if (!character || !character.pet) return;
  const pet = character.pet;
  if (pet.level >= 20) return;

  pet.xp += Math.round(amount * 0.3); // 30% bonus XP to pet
  while (pet.xp >= pet.xpNext && pet.level < 20) {
    pet.xp -= pet.xpNext;
    pet.level++;
    pet.xpNext = pet.level * 100 + (pet.level - 1) * 50;

    if (world && client) {
      world.system(client, `★ Your pet ${pet.name} reached Level ${pet.level}!`, '#50fa7b');
      import('./achievements.js').then(m => {
        m.updateAchievementProgress(character, 'pet_level', pet.level, world, client);
      });
    }
  }
}

export function getPetAuraStats(pet) {
  if (!pet || !PET_TYPES[pet.type]) return {};
  const def = PET_TYPES[pet.type];
  const lv = pet.level - 1;
  const stats = { ...def.aura };

  if (def.perLevel.attack) stats.attack = (stats.attack || 0) + lv * def.perLevel.attack;
  if (def.perLevel.defense) stats.defense = (stats.defense || 0) + lv * def.perLevel.defense;
  if (def.perLevel.hp) stats.hp = (stats.hp || 0) + lv * def.perLevel.hp;
  if (def.perLevel.manaRegen) stats.manaRegen = (stats.manaRegen || 0) + lv * def.perLevel.manaRegen;

  // Include collar/charm equipment stats
  if (pet.equipment?.collar?.stats) {
    for (const [k, v] of Object.entries(pet.equipment.collar.stats)) stats[k] = (stats[k] || 0) + v;
  }
  if (pet.equipment?.charm?.stats) {
    for (const [k, v] of Object.entries(pet.equipment.charm.stats)) stats[k] = (stats[k] || 0) + v;
  }

  return stats;
}
