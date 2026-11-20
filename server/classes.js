/*
  server/classes.js
  Authoritative class configurations, base stats, skill definitions, specializations, and growth.
  Includes 6 distinct playable classes:
    - Swordsman (Melee Tank/Bruiser)
    - Archer (Ranged Physical Kiter)
    - Mage (Elemental AoE Caster)
    - Cleric (Divine Healer & Protector)
    - Rogue (High-Speed Stealth Burst Assassin)
    - Summoner (Companion & Dark Magic Controller)
*/

export const CLASS_DATA = {
  swordsman: {
    name: 'Swordsman',
    maxHp: 150, attack: 18, speed: 108, range: 54, mana: 60, manaRegen: 7, defense: 4,
    color: '#8fd0ff', hpGrowth: 14,
    blurb: 'High HP. Melee swings, gap closers, and resilient defenses.'
  },
  archer: {
    name: 'Archer',
    maxHp: 95, attack: 14, speed: 142, range: 285, mana: 80, manaRegen: 9, defense: 1,
    color: '#84e39a', hpGrowth: 9,
    blurb: 'Fast and long ranged. Kites enemies with piercing arrows.'
  },
  mage: {
    name: 'Mage',
    maxHp: 75, attack: 22, speed: 112, range: 190, mana: 130, manaRegen: 12, defense: 0,
    color: '#c99bff', hpGrowth: 8,
    blurb: 'High magical burst. Fireballs, frost slows, and teleportation.'
  },
  cleric: {
    name: 'Cleric',
    maxHp: 125, attack: 15, speed: 115, range: 120, mana: 110, manaRegen: 11, defense: 3,
    color: '#ffd75e', hpGrowth: 11,
    blurb: 'Holy champion. Sustains allies with party heals, smites, and sacred shields.'
  },
  rogue: {
    name: 'Rogue',
    maxHp: 90, attack: 20, speed: 150, range: 60, mana: 75, manaRegen: 8, defense: 1,
    color: '#52ffb8', hpGrowth: 9,
    blurb: 'Lethal ambusher. Vanishes into shadows and deals devastating critical strikes.'
  },
  summoner: {
    name: 'Summoner',
    maxHp: 80, attack: 17, speed: 110, range: 210, mana: 140, manaRegen: 13, defense: 1,
    color: '#e08bff', hpGrowth: 8,
    blurb: 'Master of the occult. Summons spiritual familiars to fight alongside them.'
  }
};

export const SKILLS = {
  swordsman: [
    { name: 'Dash Strike', cost: 15, cd: 5, range: 95, damageMult: 1.4, desc: 'Dash forward and slash through all enemies.' },
    { name: 'Shield Block', cost: 10, cd: 8, range: 0, damageMult: 0, buff: 'shield', duration: 3, desc: 'Block 80% incoming damage for 3 seconds.' },
    { name: 'Whirlwind', cost: 25, cd: 9, range: 75, damageMult: 2.2, desc: 'Spin rapidly, hitting all surrounding targets.' },
    { name: 'Seismic Slam', cost: 32, cd: 12, range: 110, damageMult: 2.8, slow: 0.5, desc: 'Shatter the ground, dealing heavy damage and slowing.' }
  ],
  archer: [
    { name: 'Multi-Shot', cost: 18, cd: 5, range: 260, damageMult: 0.9, projectiles: 3, desc: 'Fire three arrows in an arc.' },
    { name: 'Roll Dodge', cost: 12, cd: 6, range: 120, damageMult: 0, buff: 'invuln', duration: 0.4, desc: 'Tumble swiftly, evading all attacks.' },
    { name: 'Poison Arrow', cost: 20, cd: 8, range: 280, damageMult: 1.2, dot: { damage: 8, duration: 4 }, desc: 'Infect the target with deadly toxin.' },
    { name: 'Arrow Rain', cost: 30, cd: 10, range: 300, damageMult: 2.5, aoe: 90, desc: 'Hail of piercing arrows in the targeted area.' }
  ],
  mage: [
    { name: 'Ice Nova', cost: 25, cd: 8, range: 85, damageMult: 1.6, slow: 0.4, desc: 'Blast frost outward, freezing and slowing enemies.' },
    { name: 'Blink', cost: 18, cd: 6, range: 180, damageMult: 0, teleport: true, desc: 'Instantaneous teleportation toward cursor.' },
    { name: 'Meteor', cost: 40, cd: 12, range: 240, damageMult: 3.2, aoe: 100, desc: 'Summon a colossal flaming meteor from the sky.' },
    { name: 'Arcane Burst', cost: 32, cd: 9, range: 160, damageMult: 2.0, desc: 'Detonate concentrated arcane energy.' }
  ],
  cleric: [
    { name: 'Holy Smite', cost: 18, cd: 5, range: 150, damageMult: 1.5, desc: 'Call down a pillar of holy light to strike the enemy.' },
    { name: 'Divine Heal', cost: 28, cd: 7, range: 180, healSelf: 65, healParty: 45, desc: 'Heal yourself and all nearby party members.' },
    { name: 'Aegis Ward', cost: 22, cd: 10, range: 0, buff: 'ward', duration: 4, desc: 'Grant a barrier absorbing damage and granting defense.' },
    { name: 'Radiant Nova', cost: 38, cd: 11, range: 120, damageMult: 2.2, healParty: 35, desc: 'Release an explosion of holy light that harms foes and heals allies.' }
  ],
  rogue: [
    { name: 'Shadow Strike', cost: 16, cd: 4, range: 110, damageMult: 1.8, critBonus: 0.25, desc: 'Lunge behind the target with a brutal stab.' },
    { name: 'Smoke Bomb', cost: 20, cd: 9, range: 0, buff: 'stealth', duration: 2.5, desc: 'Drop smoke, becoming invisible and gaining +30% movement speed.' },
    { name: 'Poison Dart', cost: 18, cd: 6, range: 220, damageMult: 1.0, dot: { damage: 10, duration: 5 }, desc: 'Throw a toxic dart that continuously drains enemy life.' },
    { name: 'Eviscerate', cost: 35, cd: 10, range: 70, damageMult: 3.0, critBonus: 0.35, desc: 'Vicious execution dealing catastrophic damage to wounded foes.' }
  ],
  summoner: [
    { name: 'Arcane Blast', cost: 15, cd: 4, range: 200, damageMult: 1.3, desc: 'Hurl a bolt of condensed spiritual force.' },
    { name: 'Summon Familiar', cost: 30, cd: 15, range: 60, summon: 'familiar', desc: 'Summon an ethereal familiar that fights alongside you.' },
    { name: 'Spirit Ward', cost: 24, cd: 9, range: 0, buff: 'spirit_shield', duration: 5, desc: 'Distribute 30% of incoming damage to your summon or spirit energy.' },
    { name: 'Soul Nova', cost: 42, cd: 12, range: 130, damageMult: 2.6, desc: 'Sacrifice spirit power to erupt in a shockwave of necrotic force.' }
  ]
};

export const TALENT_IDS = ['power', 'haste', 'vigor', 'crit', 'guard', 'focus'];

export const SPECIALIZATIONS = {
  swordsman: ['Guardian', 'Berserker'],
  archer:    ['Ranger', 'Sniper'],
  mage:      ['Pyromancer', 'Cryomancer'],
  cleric:    ['Templar', 'Priest'],
  rogue:     ['Assassin', 'Shadowblade'],
  summoner:  ['Necromancer', 'Elementalist']
};

export const SPEC_MODS = {
  Guardian:      { hp: 40, defense: 6, taken: 0.88, attack: 0, speed: 0, range: 0, crit: 0, cd: 1, mp: 0 },
  Berserker:     { hp: 0, attack: 12, defense: -2, taken: 1.05, speed: 6, range: 0, crit: 0.05, cd: 0.95, mp: 0 },
  Ranger:        { hp: 10, speed: 18, range: 45, attack: 4, defense: 0, taken: 1, crit: 0.04, cd: 1, mp: 0 },
  Sniper:        { hp: 0, attack: 14, range: 70, crit: 0.08, speed: -5, defense: 0, taken: 1, cd: 1, mp: 0 },
  Pyromancer:    { hp: 0, attack: 12, mp: 25, crit: 0.06, defense: 0, speed: 0, range: 15, taken: 1, cd: 0.95 },
  Cryomancer:    { hp: 18, mp: 45, defense: 3, taken: 0.92, attack: 6, speed: 0, range: 0, crit: 0, cd: 1 },
  Templar:       { hp: 30, defense: 5, attack: 8, taken: 0.90, speed: 0, range: 0, crit: 0, cd: 1, mp: 15 },
  Priest:        { hp: 10, mp: 50, manaRegen: 2.5, attack: 5, defense: 1, taken: 0.95, speed: 5, range: 25, crit: 0, cd: 0.9 },
  Assassin:      { hp: -5, attack: 11, crit: 0.12, cd: 0.88, speed: 10, defense: 0, taken: 1, range: 0, mp: 0 },
  Shadowblade:   { hp: 15, speed: 15, crit: 0.07, defense: 2, attack: 7, taken: 0.95, range: 10, cd: 0.92, mp: 10 },
  Necromancer:   { hp: 20, mp: 35, attack: 9, defense: 2, taken: 0.94, speed: 0, range: 10, crit: 0.03, cd: 1 },
  Elementalist:  { hp: 5, mp: 40, attack: 11, range: 20, crit: 0.05, defense: 0, taken: 1, speed: 5, cd: 0.92 }
};
