/*
  server/leaderboards.js
  Authoritative leaderboards for Level, Gold, Boss Clears, and PvP Wins.
*/

export class LeaderboardManager {
  constructor(db) {
    this.db = db;
    this.cache = new Map();
    this.lastUpdate = 0;
  }

  refresh(activeClients = []) {
    const now = Date.now();
    if (now - this.lastUpdate < 5000 && this.cache.size > 0) return; // cache 5s
    this.lastUpdate = now;

    // Build lists from active clients + database saved characters
    const playersMap = new Map();

    // 1. Check all saved characters in DB
    try {
      if (this.db && this.db.db) {
        const rows = this.db.db.prepare('SELECT account_id, data FROM characters').all();
        for (const r of rows) {
          try {
            const char = JSON.parse(r.data);
            if (char && char.name) {
              playersMap.set(char.name, {
                name: char.name,
                classId: char.classId || 'swordsman',
                level: Number(char.level) || 1,
                xp: Number(char.xp) || 0,
                gold: Number(char.gold) || 0,
                bossKills: Number(char.bossKills) || (char.bossDefeated ? 1 : 0),
                pvpWins: Number(char.pvpWins) || 0,
                pvpRating: Number(char.pvpRating) || 1000
              });
            }
          } catch {
            // ignore bad json
          }
        }
      }
    } catch {
      // ignore db errors
    }

    // 2. Overlay live characters in memory
    for (const client of activeClients) {
      if (client.character && client.character.name) {
        const c = client.character;
        playersMap.set(c.name, {
          name: c.name,
          classId: c.classId || 'swordsman',
          level: Number(c.level) || 1,
          xp: Number(c.xp) || 0,
          gold: Number(c.gold) || 0,
          bossKills: Number(c.bossKills) || (c.bossDefeated ? 1 : 0),
          pvpWins: Number(c.pvpWins) || 0,
          pvpRating: Number(c.pvpRating) || 1000
        });
      }
    }

    const all = Array.from(playersMap.values());

    this.cache.set('level', [...all].sort((a, b) => b.level - a.level || b.xp - a.xp).slice(0, 10));
    this.cache.set('gold', [...all].sort((a, b) => b.gold - a.gold).slice(0, 10));
    this.cache.set('boss', [...all].sort((a, b) => b.bossKills - a.bossKills).slice(0, 10));
    this.cache.set('pvp', [...all].sort((a, b) => b.pvpRating - a.pvpRating || b.pvpWins - a.pvpWins).slice(0, 10));
  }

  getLeaderboard(category, activeClients = []) {
    this.refresh(activeClients);
    const cat = ['level', 'gold', 'boss', 'pvp'].includes(category) ? category : 'level';
    return this.cache.get(cat) || [];
  }
}
