/*
  server/db.js
  Accounts, cloud saves, auctions, mail and guilds.

  We use Node's built-in node:sqlite module, so there are no npm packages.
  Character data is stored as one JSON blob per account. That keeps the server
  simple: the World class owns the authoritative character object and asks this
  file to save/load that object.
*/
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_FILE = path.join(HERE, '..', 'data', 'game.db');

export class GameDB {
  constructor(filePath = process.env.DB_PATH || DEFAULT_DB_FILE) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.db = new DatabaseSync(filePath);

    // WAL makes reads and writes play nicely together. It is safe for a small
    // game server and avoids "database is locked" surprises.
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');

    this.createTables();
  }

  createTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        salt          TEXT NOT NULL,
        created_at    INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS characters (
        account_id  INTEGER PRIMARY KEY,
        data        TEXT NOT NULL,
        updated_at  INTEGER NOT NULL,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS auctions (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_account_id  INTEGER NOT NULL,
        owner_name        TEXT NOT NULL,
        item              TEXT NOT NULL,
        price             INTEGER NOT NULL,
        created_at        INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS mail (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        to_account_id   INTEGER NOT NULL,
        from_name       TEXT NOT NULL,
        item            TEXT,
        gold            INTEGER NOT NULL DEFAULT 0,
        message         TEXT NOT NULL DEFAULT '',
        claimed         INTEGER NOT NULL DEFAULT 0,
        created_at      INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS guilds (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
        created_at  INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS guild_members (
        guild_id    INTEGER NOT NULL,
        account_id  INTEGER NOT NULL,
        rank        TEXT NOT NULL DEFAULT 'member',
        PRIMARY KEY (guild_id, account_id),
        FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS guild_weekly_goals (
        guild_id    INTEGER PRIMARY KEY,
        week        INTEGER NOT NULL,
        boss_kills  INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
      );
    `);
  }

  // ---------- Password helpers ----------

  hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
    return { salt, hash };
  }

  verifyPassword(password, salt, expectedHash) {
    const { hash } = this.hashPassword(password, salt);
    const a = Buffer.from(hash, 'hex');
    const b = Buffer.from(expectedHash, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  // ---------- Accounts ----------

  createAccount(usernameRaw, passwordRaw) {
    const username = String(usernameRaw || '').trim().slice(0, 24);
    const password = String(passwordRaw || '');
    if (username.length < 3) throw new Error('Username must be at least 3 characters.');
    if (password.length < 4) throw new Error('Password must be at least 4 characters.');

    const existing = this.db.prepare('SELECT id FROM accounts WHERE username = ?').get(username);
    if (existing) throw new Error('That username is already taken.');

    const { salt, hash } = this.hashPassword(password);
    const info = this.db.prepare(`
      INSERT INTO accounts (username, password_hash, salt, created_at)
      VALUES (?, ?, ?, ?)
    `).run(username, hash, salt, Date.now());

    return { id: Number(info.lastInsertRowid), username };
  }

  login(usernameRaw, passwordRaw) {
    const username = String(usernameRaw || '').trim().slice(0, 24);
    const row = this.db.prepare('SELECT * FROM accounts WHERE username = ?').get(username);
    if (!row || !this.verifyPassword(passwordRaw || '', row.salt, row.password_hash)) {
      throw new Error('Invalid username or password.');
    }
    return { id: Number(row.id), username: row.username };
  }

  findAccountByUsername(usernameRaw) {
    const username = String(usernameRaw || '').trim().slice(0, 24);
    const row = this.db.prepare('SELECT id, username FROM accounts WHERE username = ?').get(username);
    return row ? { id: Number(row.id), username: row.username } : null;
  }

  updatePassword(accountId, newPasswordRaw) {
    const password = String(newPasswordRaw || '');
    if (password.length < 4) throw new Error('Password must be at least 4 characters.');
    const { salt, hash } = this.hashPassword(password);
    this.db.prepare('UPDATE accounts SET password_hash = ?, salt = ? WHERE id = ?').run(hash, salt, accountId);
    return true;
  }

  // ---------- Character cloud saves ----------

  getCharacter(accountId) {
    const row = this.db.prepare('SELECT data FROM characters WHERE account_id = ?').get(accountId);
    if (!row) return null;
    try {
      return JSON.parse(row.data);
    } catch {
      console.error(`[db] Character ${accountId} is corrupt; starting a new one.`);
      return null;
    }
  }

  saveCharacter(accountId, character) {
    const data = JSON.stringify(character);
    this.db.prepare(`
      INSERT INTO characters (account_id, data, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(account_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
    `).run(accountId, data, Date.now());
  }

  // ---------- Auctions ----------

  auctionAdd({ accountId, ownerName, item, price }) {
    const amount = Math.max(1, Math.floor(Number(price) || 0));
    const info = this.db.prepare(`
      INSERT INTO auctions (owner_account_id, owner_name, item, price, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(accountId, ownerName, JSON.stringify(item), amount, Date.now());
    return Number(info.lastInsertRowid);
  }

  auctionList() {
    const rows = this.db.prepare('SELECT * FROM auctions ORDER BY id DESC LIMIT 100').all();
    return rows.map(row => ({
      id: Number(row.id),
      ownerName: row.owner_name,
      item: safeParse(row.item),
      price: Number(row.price),
      createdAt: Number(row.created_at)
    }));
  }

  // Returns the item that went back to the seller's bag.
  auctionRemove({ accountId, id }) {
    const row = this.db.prepare('SELECT * FROM auctions WHERE id = ?').get(id);
    if (!row) throw new Error('Auction not found.');
    if (Number(row.owner_account_id) !== accountId) throw new Error('That auction is not yours.');
    this.db.prepare('DELETE FROM auctions WHERE id = ?').run(id);
    return safeParse(row.item);
  }

  auctionBuy({ accountId, id }) {
    // A transaction makes sure gold and items cannot get out of sync.
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const auction = this.db.prepare('SELECT * FROM auctions WHERE id = ?').get(id);
      if (!auction) throw new Error('Auction not found.');
      if (Number(auction.owner_account_id) === accountId) throw new Error('You cannot buy your own auction.');

      const buyer = this.getCharacter(accountId);
      if (!buyer) throw new Error('Character not found.');
      const price = Number(auction.price);
      if ((buyer.gold || 0) < price) throw new Error('Not enough gold.');
      if ((buyer.inventory || []).length >= 20) throw new Error('Inventory is full.');

      const sellerId = Number(auction.owner_account_id);
      const seller = this.getCharacter(sellerId);

      buyer.gold -= price;
      buyer.inventory.push(safeParse(auction.item));
      this.saveCharacter(accountId, buyer);

      if (seller) {
        seller.gold = (seller.gold || 0) + price;
        this.saveCharacter(sellerId, seller);
      }

      this.db.prepare('DELETE FROM auctions WHERE id = ?').run(id);
      this.db.exec('COMMIT');

      return { item: safeParse(auction.item), price, sellerId, sellerName: auction.owner_name };
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  // ---------- Mail ----------

  mailSend({ toAccountId, fromName, item = null, gold = 0, message = '' }) {
    const info = this.db.prepare(`
      INSERT INTO mail (to_account_id, from_name, item, gold, message, claimed, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?)
    `).run(
      toAccountId,
      String(fromName || 'Someone').slice(0, 24),
      item ? JSON.stringify(item) : null,
      Math.max(0, Math.floor(Number(gold) || 0)),
      String(message || '').slice(0, 500),
      Date.now()
    );
    return Number(info.lastInsertRowid);
  }

  mailList(accountId) {
    const rows = this.db.prepare('SELECT * FROM mail WHERE to_account_id = ? ORDER BY id DESC LIMIT 100').all(accountId);
    return rows.map(row => ({
      id: Number(row.id),
      fromName: row.from_name,
      item: safeParse(row.item),
      gold: Number(row.gold),
      message: row.message,
      claimed: !!row.claimed,
      createdAt: Number(row.created_at)
    }));
  }

  mailGet(accountId, id) {
    const row = this.db.prepare('SELECT * FROM mail WHERE id = ? AND to_account_id = ?').get(id, accountId);
    if (!row) throw new Error('Mail not found.');
    if (row.claimed) throw new Error('That mail was already claimed.');
    return {
      id: Number(row.id),
      fromName: row.from_name,
      item: safeParse(row.item),
      gold: Number(row.gold),
      message: row.message
    };
  }

  mailTake(accountId, id) {
    const mail = this.mailGet(accountId, id);
    this.db.prepare('UPDATE mail SET claimed = 1 WHERE id = ?').run(id);
    return mail;
  }

  // ---------- Guilds ----------

  guildCreate(nameRaw, accountId) {
    const name = String(nameRaw || '').trim().slice(0, 24);
    if (name.length < 3) throw new Error('Guild name must be at least 3 characters.');
    if (this.guildInfoForAccount(accountId).guild) throw new Error('You are already in a guild.');
    if (this.db.prepare('SELECT id FROM guilds WHERE name = ?').get(name)) throw new Error('That guild already exists.');

    const info = this.db.prepare('INSERT INTO guilds (name, created_at) VALUES (?, ?)').run(name, Date.now());
    const guildId = Number(info.lastInsertRowid);
    this.db.prepare('INSERT INTO guild_members (guild_id, account_id, rank) VALUES (?, ?, ?)')
      .run(guildId, accountId, 'leader');
    return this.guildInfoForAccount(accountId);
  }

  guildJoin(nameRaw, accountId) {
    const name = String(nameRaw || '').trim().slice(0, 24);
    if (this.guildInfoForAccount(accountId).guild) throw new Error('You are already in a guild.');
    const guild = this.db.prepare('SELECT id FROM guilds WHERE name = ?').get(name);
    if (!guild) throw new Error('Guild not found.');
    this.db.prepare('INSERT INTO guild_members (guild_id, account_id, rank) VALUES (?, ?, ?)')
      .run(Number(guild.id), accountId, 'member');
    return this.guildInfoForAccount(accountId);
  }

  guildLeave(accountId) {
    const info = this.guildInfoForAccount(accountId);
    if (!info.guild) throw new Error('You are not in a guild.');
    this.db.prepare('DELETE FROM guild_members WHERE guild_id = ? AND account_id = ?')
      .run(info.guild.id, accountId);

    // If the last member leaves, remove the empty guild too.
    const left = this.db.prepare('SELECT COUNT(*) AS n FROM guild_members WHERE guild_id = ?').get(info.guild.id);
    if (Number(left.n) === 0) this.db.prepare('DELETE FROM guilds WHERE id = ?').run(info.guild.id);
    return { guild: null, members: [] };
  }

  guildInfoForAccount(accountId) {
    const guild = this.db.prepare(`
      SELECT g.id, g.name FROM guilds g
      JOIN guild_members gm ON gm.guild_id = g.id
      WHERE gm.account_id = ?
    `).get(accountId);

    if (!guild) return { guild: null, members: [] };

    const rows = this.db.prepare(`
      SELECT a.id AS account_id, a.username, gm.rank, c.data
      FROM guild_members gm
      JOIN accounts a ON a.id = gm.account_id
      LEFT JOIN characters c ON c.account_id = gm.account_id
      WHERE gm.guild_id = ?
      ORDER BY gm.rank DESC, a.username ASC
    `).all(Number(guild.id));

    const members = rows.map(row => {
      const character = safeParse(row.data) || {};
      return {
        accountId: Number(row.account_id),
        name: character.name || row.username,
        level: Number(character.level) || 1,
        rank: row.rank
      };
    });

    const currentWeek = Math.floor(Date.now() / 604800000);
    const savedGoal = this.db.prepare('SELECT week, boss_kills FROM guild_weekly_goals WHERE guild_id = ?').get(Number(guild.id));
    const weeklyRaidKills = savedGoal && Number(savedGoal.week) === currentWeek
      ? Math.min(3, Number(savedGoal.boss_kills)) : 0;
    return {
      guild: { id: Number(guild.id), name: guild.name },
      members,
      weeklyRaid: { kills: weeklyRaidKills, target: 3, rewardGold: 150 }
    };
  }

  guildRecordBossKill(accountIds) {
    const ids = [...new Set((accountIds || []).map(Number).filter(id => Number.isInteger(id) && id > 0))];
    if (!ids.length) return [];
    const placeholders = ids.map(() => '?').join(',');
    const guilds = this.db.prepare(`
      SELECT DISTINCT guild_id FROM guild_members WHERE account_id IN (${placeholders})
    `).all(...ids).map(row => Number(row.guild_id));
    const week = Math.floor(Date.now() / 604800000);
    const readGoal = this.db.prepare('SELECT week, boss_kills FROM guild_weekly_goals WHERE guild_id = ?');
    const writeGoal = this.db.prepare(`
      INSERT INTO guild_weekly_goals (guild_id, week, boss_kills) VALUES (?, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET week = excluded.week, boss_kills = excluded.boss_kills
    `);
    const membersFor = this.db.prepare('SELECT account_id FROM guild_members WHERE guild_id = ?');
    return guilds.map(guildId => {
      const saved = readGoal.get(guildId);
      const previous = saved && Number(saved.week) === week ? Number(saved.boss_kills) : 0;
      const kills = previous + 1;
      writeGoal.run(guildId, week, kills);
      return {
        guildId,
        kills,
        completed: previous < 3 && kills >= 3,
        accountIds: membersFor.all(guildId).map(row => Number(row.account_id))
      };
    });
  }

  guildMemberAccountIds(accountId) {
    return this.guildInfoForAccount(accountId).members.map(m => m.accountId);
  }

  close() {
    try { this.db.close(); } catch { /* already closed */ }
  }
}

function safeParse(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return null; }
}

export default GameDB;
