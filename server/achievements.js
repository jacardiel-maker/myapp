/*
  server/achievements.js
  Authoritative achievement tracking, milestone validation, reward distribution, and titles.
*/

export const ACHIEVEMENTS = [
  { id: 'first_blood', name: 'First Blood', desc: 'Defeat your very first monster in the realm.', category: 'combat', goal: 1, reward: { gold: 50, xp: 25, title: 'Novice' } },
  { id: 'monster_culler', name: 'Monster Culler', desc: 'Slay 25 monsters across the realm.', category: 'combat', goal: 25, reward: { gold: 150, xp: 80 } },
  { id: 'monster_bane', name: 'Bane of Beasts', desc: 'Slay 100 monsters.', category: 'combat', goal: 100, reward: { gold: 500, xp: 300, title: 'Hunter' } },
  { id: 'boss_slayer', name: 'Boss Slayer', desc: 'Defeat the Dungeon Boss for the first time.', category: 'combat', goal: 1, reward: { gold: 600, xp: 450, title: 'Dragonslayer' } },
  { id: 'reach_lvl_5', name: 'Rising Adventurer', desc: 'Reach Character Level 5.', category: 'leveling', goal: 5, reward: { gold: 100, xp: 50 } },
  { id: 'reach_lvl_10', name: 'Hardened Hero', desc: 'Reach Character Level 10.', category: 'leveling', goal: 10, reward: { gold: 300, xp: 200, title: 'Veteran' } },
  { id: 'reach_lvl_20', name: 'Legend of the Realm', desc: 'Reach Max Level 20.', category: 'leveling', goal: 20, reward: { gold: 1200, xp: 1000, title: 'Mythic Champion' } },
  { id: 'wealthy_1', name: 'Coin Pouch', desc: 'Amass 200 gold in your inventory.', category: 'economy', goal: 200, reward: { gold: 50, xp: 20 } },
  { id: 'wealthy_2', name: 'Gold Hoarder', desc: 'Amass 1,000 gold.', category: 'economy', goal: 1000, reward: { gold: 250, xp: 100, title: 'Merchant' } },
  { id: 'wealthy_3', name: 'Realm Tycoon', desc: 'Amass 5,000 gold.', category: 'economy', goal: 5000, reward: { gold: 1000, xp: 500, title: 'Tycoon' } },
  { id: 'craft_enchant', name: 'Spark of Magic', desc: 'Enchant or upgrade equipment to +1 or higher.', category: 'crafting', goal: 1, reward: { gold: 150, xp: 100, title: 'Artisan' } },
  { id: 'zone_explorer', name: 'Grand Cartographer', desc: 'Visit at least 5 different zones.', category: 'exploration', goal: 5, reward: { gold: 300, xp: 200, title: 'Explorer' } },
  { id: 'pvp_first_win', name: 'Arena Challenger', desc: 'Win a duel in the PvP Arena.', category: 'pvp', goal: 1, reward: { gold: 200, xp: 150, title: 'Gladiator' } },
  { id: 'pvp_champion', name: 'Arena Warlord', desc: 'Win 10 duels in the PvP Arena.', category: 'pvp', goal: 10, reward: { gold: 1000, xp: 800, title: 'Warlord' } },
  { id: 'beastmaster', name: 'Loyal Companion', desc: 'Bond with a pet companion and level it up.', category: 'pets', goal: 2, reward: { gold: 250, xp: 150, title: 'Beastmaster' } }
];

export function normalizeAchievements(saved = {}) {
  const ach = typeof saved === 'object' && saved !== null ? saved : {};
  const progress = ach.progress && typeof ach.progress === 'object' ? ach.progress : {};
  const unlocked = Array.isArray(ach.unlocked) ? ach.unlocked : [];
  const claimed = Array.isArray(ach.claimed) ? ach.claimed : [];
  return { progress, unlocked, claimed };
}

export function updateAchievementProgress(character, key, amount, world, client) {
  if (!character) return;
  character.achievements = normalizeAchievements(character.achievements);
  const data = character.achievements;
  data.progress[key] = (Number(data.progress[key]) || 0) + amount;
  const currentVal = data.progress[key];

  for (const ach of ACHIEVEMENTS) {
    if (data.unlocked.includes(ach.id)) continue;
    let satisfied = false;

    if (ach.id === 'first_blood' && key === 'kills' && currentVal >= 1) satisfied = true;
    else if (ach.id === 'monster_culler' && key === 'kills' && currentVal >= 25) satisfied = true;
    else if (ach.id === 'monster_bane' && key === 'kills' && currentVal >= 100) satisfied = true;
    else if (ach.id === 'boss_slayer' && key === 'boss_kills' && currentVal >= 1) satisfied = true;
    else if (ach.id === 'reach_lvl_5' && (character.level || 1) >= 5) satisfied = true;
    else if (ach.id === 'reach_lvl_10' && (character.level || 1) >= 10) satisfied = true;
    else if (ach.id === 'reach_lvl_20' && (character.level || 1) >= 20) satisfied = true;
    else if (ach.id === 'wealthy_1' && (character.gold || 0) >= 200) satisfied = true;
    else if (ach.id === 'wealthy_2' && (character.gold || 0) >= 1000) satisfied = true;
    else if (ach.id === 'wealthy_3' && (character.gold || 0) >= 5000) satisfied = true;
    else if (ach.id === 'craft_enchant' && key === 'enchants' && currentVal >= 1) satisfied = true;
    else if (ach.id === 'zone_explorer' && key === 'zones_visited' && currentVal >= 5) satisfied = true;
    else if (ach.id === 'pvp_first_win' && key === 'pvp_wins' && currentVal >= 1) satisfied = true;
    else if (ach.id === 'pvp_champion' && key === 'pvp_wins' && currentVal >= 10) satisfied = true;
    else if (ach.id === 'beastmaster' && key === 'pet_level' && currentVal >= 2) satisfied = true;

    if (satisfied) {
      data.unlocked.push(ach.id);
      if (client && world) {
        world.system(client, `★ Achievement Unlocked: ${ach.name}! Check your achievements menu.`, '#ffd75e');
        world.send(client, {
          type: 'achievement_unlocked',
          achievement: ach
        });
      }
    }
  }
}

export function claimAchievementReward(character, achId) {
  character.achievements = normalizeAchievements(character.achievements);
  const data = character.achievements;
  if (!data.unlocked.includes(achId)) return { error: 'Achievement not yet unlocked.' };
  if (data.claimed.includes(achId)) return { error: 'Reward already claimed.' };

  const ach = ACHIEVEMENTS.find(a => a.id === achId);
  if (!ach) return { error: 'Unknown achievement.' };

  data.claimed.push(achId);
  character.gold = (Number(character.gold) || 0) + (ach.reward.gold || 0);
  character.xp = (Number(character.xp) || 0) + (ach.reward.xp || 0);
  if (ach.reward.title) {
    character.title = ach.reward.title;
  }
  return { success: true, reward: ach.reward };
}
