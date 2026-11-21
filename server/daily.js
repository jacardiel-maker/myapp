/*
  server/daily.js
  Seeded daily quests and bounty board.
  Rotates 3 unique bounties every 24 hours based on calendar date.
*/

function getDayString() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function stringToSeed(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

const BOUNTY_POOL = [
  { id: 'bounty_slimes', title: 'Slime Purge', desc: 'Eliminate 8 Slimes in the Forest or Caves.', target: 8, key: 'kill_slime', reward: { gold: 120, xp: 90 } },
  { id: 'bounty_goblins', title: 'Goblin Patrol', desc: 'Hunt down 6 Goblins.', target: 6, key: 'kill_goblin', reward: { gold: 150, xp: 120 } },
  { id: 'bounty_brutes', title: 'Felling Giants', desc: 'Defeat 3 heavy Brutes.', target: 3, key: 'kill_brute', reward: { gold: 200, xp: 180 } },
  { id: 'bounty_scouts', title: 'Desert Watch', desc: 'Snipe 5 Scouts in the Desert dunes.', target: 5, key: 'kill_scout', reward: { gold: 180, xp: 140 } },
  { id: 'bounty_elemental', title: 'Elemental Threat', desc: 'Slay 5 Frost, Fire, or Venom elemental mobs.', target: 5, key: 'kill_elemental', reward: { gold: 250, xp: 220 } },
  { id: 'bounty_dungeon', title: 'Lair Cleansing', desc: 'Complete 1 Dungeon run and fell the Boss.', target: 1, key: 'dungeon_clear', reward: { gold: 400, xp: 350 } },
  { id: 'bounty_arena', title: 'Arena Contender', desc: 'Participate and win 1 duel in the PvP Arena.', target: 1, key: 'arena_win', reward: { gold: 300, xp: 250 } },
  { id: 'bounty_harvest', title: 'Supply Run', desc: 'Gather 4 crafting resources (herbs, ore, or essence).', target: 4, key: 'gather', reward: { gold: 140, xp: 100 } }
];

export function getDailyQuestsForDate(dateStr = getDayString()) {
  const seed = stringToSeed(dateStr);
  const pool = [...BOUNTY_POOL];
  const quests = [];

  for (let i = 0; i < 3; i++) {
    const idx = (seed + i * 17) % pool.length;
    quests.push({ ...pool[idx], date: dateStr });
    pool.splice(idx, 1);
  }
  return quests;
}

export function normalizeDailyQuests(saved = {}) {
  const today = getDayString();
  const daily = typeof saved === 'object' && saved !== null ? saved : {};

  // If saved quests are from an older day, refresh them
  if (daily.date !== today) {
    const quests = getDailyQuestsForDate(today);
    return {
      date: today,
      quests: quests.map(q => ({
        id: q.id,
        title: q.title,
        desc: q.desc,
        key: q.key,
        target: q.target,
        reward: q.reward,
        progress: 0,
        completed: false,
        claimed: false
      }))
    };
  }

  return {
    date: today,
    quests: Array.isArray(daily.quests) ? daily.quests : []
  };
}

export function updateDailyProgress(character, key, amount, world, client) {
  if (!character) return;
  character.dailyQuests = normalizeDailyQuests(character.dailyQuests);
  let changed = false;

  for (const q of character.dailyQuests.quests) {
    if (q.completed) continue;
    let match = false;
    if (q.key === key) match = true;
    else if (q.key === 'kill_elemental' && key.startsWith('kill_elemental')) match = true;

    if (match) {
      q.progress = Math.min(q.target, q.progress + amount);
      if (q.progress >= q.target) {
        q.completed = true;
        if (client && world) {
          world.system(client, `✔ Daily Bounty Completed: "${q.title}"! Return to the Bounty Board to claim reward.`, '#7bed9f');
        }
      }
      changed = true;
    }
  }

  if (changed && client && world) {
    world.send(client, { type: 'daily_quests', dailyQuests: character.dailyQuests });
  }
}

export function claimDailyReward(character, questId) {
  character.dailyQuests = normalizeDailyQuests(character.dailyQuests);
  const q = character.dailyQuests.quests.find(x => x.id === questId);
  if (!q) return { error: 'Daily quest not found.' };
  if (!q.completed) return { error: 'Daily quest objectives not yet complete.' };
  if (q.claimed) return { error: 'Reward already claimed.' };

  q.claimed = true;
  character.gold = (Number(character.gold) || 0) + (q.reward.gold || 0);
  // XP is granted by World.gainXp so level-ups and pet XP are processed.
  return { success: true, reward: q.reward };
}
