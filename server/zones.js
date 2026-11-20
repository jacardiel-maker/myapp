/*
  server/zones.js
  Authoritative zone maps, tile generation, portals, landmarks, and spawn coordinates.
  Expanded from 4 zones to 8 unique zones:
    - village (Safe Hub, Market & Arena Master)
    - forest (Verdant woods & starter quests)
    - cave (Rocky caverns & iron veins)
    - desert (Arid dunes & ancient relics)
    - frost_cave (Ice Cavern: slippery frost, ice stalagmites & cryo hazards)
    - volcano (Inferno Crater: molten lava pools, magma spouts & ash)
    - swamp (Toxic Marsh: poisoned bogs, creeping vines & murky waters)
    - arena (PvP Combat Arena for real-time player vs player duels)
    - dungeon (Authoritative instanced boss lair)
*/

export const TILE = 32;

export const TILE_ID = {
  GRASS: 0,
  WATER: 1,
  TREE: 2,
  SAND: 3,
  ROCK: 4,
  CAVE: 5,
  CACTUS: 6,
  PATH: 7,
  HOUSE_ROOF: 8,
  HOUSE_WALL: 9,
  ICE: 10,
  SNOW: 11,
  LAVA: 12,
  ASH: 13,
  SWAMP_WATER: 14,
  BOG: 15,
  ARENA_FLOOR: 16
};

export const BLOCKED_TILES = new Set([
  TILE_ID.WATER,
  TILE_ID.TREE,
  TILE_ID.ROCK,
  TILE_ID.CACTUS,
  TILE_ID.HOUSE_WALL,
  TILE_ID.LAVA,
  TILE_ID.SWAMP_WATER
]);

export const ZONE_SPAWN = {
  forest:     { x: 520, y: 420 },
  cave:       { x: 270, y: 300 },
  desert:     { x: 2780, y: 1980 },
  village:    { x: 1552, y: 1168 },
  frost_cave: { x: 300, y: 320 },
  volcano:    { x: 320, y: 2000 },
  swamp:      { x: 450, y: 350 },
  arena:      { x: 768, y: 576 }
};

export const PORTAL_DEFS = {
  village: [
    { x: 1552, y: 656, to: 'forest', label: 'Forest Gate', color: '#7bdc7b', arrive: { x: 520, y: 420 } },
    { x: 1920, y: 1168, to: 'arena', label: 'PvP Arena', color: '#ff4d4d', arrive: { x: 768, y: 576 } }
  ],
  forest: [
    { x: 2860, y: 300, to: 'cave', label: 'Caverns', color: '#b08bff', arrive: { x: 270, y: 300 } },
    { x: 220, y: 2080, to: 'desert', label: 'Desert', color: '#ffb35c', arrive: { x: 2780, y: 1980 } },
    { x: 2860, y: 2080, to: 'swamp', label: 'Swamp', color: '#2ecc71', arrive: { x: 450, y: 350 } },
    { x: 480, y: 360, to: 'village', label: 'Village', color: '#ffd75e', arrive: { x: 1552, y: 720 } }
  ],
  cave: [
    { x: 230, y: 240, to: 'forest', label: 'Forest', color: '#7bdc7b', arrive: { x: 2820, y: 360 } },
    { x: 2860, y: 2080, to: 'frost_cave', label: 'Frost Cavern', color: '#70d6ff', arrive: { x: 300, y: 320 } },
    { x: 2860, y: 300, to: 'desert', label: 'Desert', color: '#ffb35c', arrive: { x: 220, y: 2080 } }
  ],
  desert: [
    { x: 2760, y: 1980, to: 'cave', label: 'Caverns', color: '#b08bff', arrive: { x: 2820, y: 2080 } },
    { x: 240, y: 260, to: 'forest', label: 'Forest', color: '#7bdc7b', arrive: { x: 270, y: 2080 } },
    { x: 2860, y: 300, to: 'volcano', label: 'Volcano', color: '#ff5722', arrive: { x: 320, y: 2000 } }
  ],
  frost_cave: [
    { x: 260, y: 280, to: 'cave', label: 'Caverns', color: '#b08bff', arrive: { x: 2800, y: 2040 } }
  ],
  volcano: [
    { x: 280, y: 2040, to: 'desert', label: 'Desert', color: '#ffb35c', arrive: { x: 2800, y: 360 } }
  ],
  swamp: [
    { x: 380, y: 300, to: 'forest', label: 'Forest', color: '#7bdc7b', arrive: { x: 2800, y: 2040 } }
  ],
  arena: [
    { x: 768, y: 1000, to: 'village', label: 'Return to Village', color: '#ffd75e', arrive: { x: 1850, y: 1168 } }
  ]
};

export const ZONE_ENEMY_COUNTS = {
  forest:     { slime: 14, goblin: 6 },
  cave:       { slime: 6, goblin: 8, brute: 4 },
  desert:     { slime: 6, goblin: 8, scout: 6 },
  frost_cave: { frost_slime: 10, ice_goblin: 6, frost_brute: 3 },
  volcano:    { fire_goblin: 9, magma_brute: 5, fire_scout: 4 },
  swamp:      { venom_slime: 8, swamp_scout: 7, bog_brute: 4 },
  village:    {},
  arena:      {}
};

export const ZONE_MUL = {
  forest: 1.0,
  cave: 1.6,
  desert: 2.2,
  swamp: 2.8,
  frost_cave: 3.4,
  volcano: 4.2,
  village: 1.0,
  arena: 1.0
};

export const NPC_DEFS = [
  { type: 'shop', name: 'Merchant Mina', x: 620, y: 380, radius: 14 },
  { type: 'quest', name: 'Elder Tarn', x: 770, y: 430, radius: 14 }
];

export const VILLAGE_NPC_DEFS = [
  { type: 'guard', name: 'Village Guard', x: 1650, y: 1168, radius: 15 },
  { type: 'healer', name: 'Healer Liora', x: 1424, y: 1168, radius: 14 },
  { type: 'scout', name: 'Scout Rowan', x: 1552, y: 1008, radius: 14 },
  { type: 'blacksmith', name: 'Blacksmith Borin', x: 1760, y: 1168, radius: 14 },
  { type: 'villager', name: 'Farmer Pella', x: 1552, y: 1296, radius: 14 },
  { type: 'bounty', name: 'Bounty Master Kenneth', x: 1424, y: 1008, radius: 14 },
  { type: 'arena_master', name: 'Arena Master Torvald', x: 1880, y: 1168, radius: 15 },
  { type: 'pet_tamer', name: 'Beastmaster Elan', x: 1680, y: 1350, radius: 14 }
];

export const DUNGEON_SPAWN = { x: 5 * TILE + TILE / 2, y: 18 * TILE + TILE / 2 };
export const DUNGEON_BOSS = { x: 30 * TILE, y: 18 * TILE };

export function mulberry32(a) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function generateZone(id) {
  if (id === 'arena') return generateArena();

  const w = 96;
  const h = 72;
  const tiles = new Uint8Array(w * h);

  let baseTile = TILE_ID.GRASS;
  let wallTile = TILE_ID.ROCK;

  if (id === 'cave') { baseTile = TILE_ID.CAVE; wallTile = TILE_ID.ROCK; }
  else if (id === 'desert') { baseTile = TILE_ID.SAND; wallTile = TILE_ID.ROCK; }
  else if (id === 'frost_cave') { baseTile = TILE_ID.ICE; wallTile = TILE_ID.SNOW; }
  else if (id === 'volcano') { baseTile = TILE_ID.ASH; wallTile = TILE_ID.ROCK; }
  else if (id === 'swamp') { baseTile = TILE_ID.BOG; wallTile = TILE_ID.TREE; }

  // Initial fill and border walls
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const border = (x < 2 || y < 2 || x >= w - 2 || y >= h - 2);
      tiles[y * w + x] = border ? wallTile : baseTile;
    }
  }

  const rng = mulberry32(
    id === 'forest' ? 4101 :
    id === 'cave' ? 4102 :
    id === 'desert' ? 4103 :
    id === 'frost_cave' ? 4104 :
    id === 'volcano' ? 4105 :
    id === 'swamp' ? 4106 : 4107
  );

  const safePoints = [
    ZONE_SPAWN[id] || { x: 500, y: 500 },
    ...(PORTAL_DEFS[id] ? PORTAL_DEFS[id].flatMap(p => [p, p.arrive]) : []),
    ...(id === 'forest' ? NPC_DEFS : []),
    ...(id === 'village' ? VILLAGE_NPC_DEFS : [])
  ];

  if (id !== 'village') {
    for (let y = 5; y < h - 5; y++) {
      for (let x = 5; x < w - 5; x++) {
        if (rng() > 0.02) continue;
        const px = x * TILE + TILE / 2;
        const py = y * TILE + TILE / 2;
        if (safePoints.some(p => Math.hypot(p.x - px, p.y - py) < 220)) continue;
        const radius = rng() < 0.3 ? 2 : 1;
        for (let oy = -radius; oy <= radius; oy++) {
          for (let ox = -radius; ox <= radius; ox++) {
            if (Math.abs(ox) + Math.abs(oy) > radius + 1) continue;
            const tx = x + ox;
            const ty = y + oy;
            if (tx < 2 || ty < 2 || tx >= w - 2 || ty >= h - 2) continue;

            if (id === 'forest') tiles[ty * w + tx] = rng() < 0.7 ? TILE_ID.TREE : TILE_ID.WATER;
            else if (id === 'desert') tiles[ty * w + tx] = TILE_ID.CACTUS;
            else if (id === 'frost_cave') tiles[ty * w + tx] = rng() < 0.6 ? TILE_ID.SNOW : TILE_ID.ROCK;
            else if (id === 'volcano') tiles[ty * w + tx] = rng() < 0.6 ? TILE_ID.LAVA : TILE_ID.ROCK;
            else if (id === 'swamp') tiles[ty * w + tx] = rng() < 0.6 ? TILE_ID.SWAMP_WATER : TILE_ID.TREE;
            else if (id === 'cave') tiles[ty * w + tx] = TILE_ID.ROCK;
          }
        }
      }
    }
  }

  if (id === 'village') paintVillage({ w, h, tiles });

  return { id, w, h, tiles };
}

export function generateArena() {
  const w = 48;
  const h = 36;
  const tiles = new Uint8Array(w * h);

  // Colosseum style arena with surrounding stone walls and inner combat pit
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const border = (x < 3 || y < 3 || x >= w - 3 || y >= h - 3);
      tiles[y * w + x] = border ? TILE_ID.ROCK : TILE_ID.ARENA_FLOOR;
    }
  }

  return { id: 'arena', w, h, tiles };
}

export function generateDungeon() {
  const w = 48;
  const h = 36;
  const tiles = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const border = x < 2 || y < 2 || x >= w - 2 || y >= h - 2;
      tiles[y * w + x] = border ? TILE_ID.ROCK : TILE_ID.CAVE;
    }
  }
  return { id: 'dungeon', w, h, tiles };
}

function paintVillage({ w, h, tiles }) {
  const put = (x, y, id) => { if (x >= 0 && x < w && y >= 0 && y < h) tiles[y * w + x] = id; };
  for (let x = 40; x <= 58; x++) put(x, 36, TILE_ID.PATH);
  for (let y = 20; y <= 48; y++) put(49, y, TILE_ID.PATH);

  // Village houses
  const houses = [
    { x: 38, y: 28 },
    { x: 54, y: 28 },
    { x: 38, y: 40 },
    { x: 54, y: 40 }
  ];
  for (const { x, y } of houses) {
    for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 7; dx++) put(x + dx, y + dy, TILE_ID.HOUSE_ROOF);
    for (let dy = 4; dy < 8; dy++) for (let dx = 0; dx < 7; dx++) put(x + dx, y + dy, TILE_ID.HOUSE_WALL);
  }
}
