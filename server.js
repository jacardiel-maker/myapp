/*
  server.js
  The entry point for the Pixel Realm multiplayer server.

  It does four things:
    1. Serves index.html / style.css / game.js as static files.
    2. Accepts WebSocket upgrades on /ws (see server/net.js).
    3. Handles register/login and checks the token on every other message.
    4. Starts the 20 Hz simulation and the 10 second cloud save timer.
*/
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

import { GameDB } from './server/db.js';
import { World, freshCharacter } from './server/world.js';
import { attachWebSocket } from './server/net.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

// Only these files are public. A whitelist is safer than serving the whole folder.
const STATIC_FILES = new Map([
  ['/index.html', { file: path.join(HERE, 'index.html'), type: 'text/html; charset=utf-8' }],
  ['/style.css', { file: path.join(HERE, 'style.css'), type: 'text/css; charset=utf-8' }],
  ['/game.js', { file: path.join(HERE, 'game.js'), type: 'text/javascript; charset=utf-8' }]
]);

const db = new GameDB();
const world = new World(db);

// In-memory sessions: token -> account id. Tokens die when the server restarts.
const sessions = new Map();

// ---------- Plain HTTP (the game files) ----------

const server = http.createServer((req, res) => {
  let pathname = '/';
  try {
    pathname = new URL(req.url || '/', 'http://localhost').pathname;
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed');
    return;
  }

  if (pathname === '/') pathname = '/index.html';
  const entry = STATIC_FILES.get(pathname);
  if (!entry) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    return;
  }

  fs.stat(entry.file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': entry.type,
      'Content-Length': stat.size,
      'Cache-Control': 'no-store'
    });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(entry.file).pipe(res);
  });
});

// ---------- WebSocket / authentication ----------

attachWebSocket({
  server,
  path: '/ws',
  maxPayload: 512 * 1024,
  onConnection(ws) {
    // One client object follows this socket for its whole life. World attaches
    // runtime fields (position, cooldowns, ...) to the same object.
    const client = {
      ws,
      token: null,
      accountId: null,
      username: null,
      character: null
    };
    world.attach(client);

    ws.onMessage(raw => {
      let message;
      try {
        message = JSON.parse(raw);
      } catch {
        world.error(client, 'Invalid JSON.');
        return;
      }
      if (!message || typeof message !== 'object') {
        world.error(client, 'Invalid message.');
        return;
      }

      const type = String(message.type || '');

      // Register and login are the only messages allowed before authentication.
      if (type === 'register' || type === 'login') {
        authenticate(client, message, type);
        return;
      }

      const token = String(message.token || '');
      if (!client.token || token !== client.token || sessions.get(token) !== client.accountId) {
        world.error(client, 'Invalid or expired token.');
        return;
      }

      world.handle(client, message);
    });

    ws.onClose(() => {
      if (client.token) sessions.delete(client.token);
      // detach() removes the player from the room and saves the character.
      world.detach(client);
      console.log(`[server] disconnected: ${client.character ? client.character.name : 'guest'}`);
    });
  }
});

function authenticate(client, message, mode) {
  try {
    const account = mode === 'register'
      ? db.createAccount(message.username, message.password)
      : db.login(message.username, message.password);

    let character = db.getCharacter(account.id);
    if (!character) {
      // Optional classId is accepted on register; the default is swordsman.
      character = freshCharacter(account.username, message.classId || 'swordsman');
      db.saveCharacter(account.id, character);
    }

    // Normalise older saves so missing fields do not crash the simulation.
    character.materials ||= { herb: 0, ore: 0, essence: 0 };
    character.talents ||= { power: 0, haste: 0, vigor: 0, crit: 0, guard: 0, focus: 0 };
    character.skillRanks ||= [1, 1, 1];
    character.shopStock ||= [];

    if (client.token) sessions.delete(client.token);
    const token = randomBytes(32).toString('hex');
    sessions.set(token, account.id);

    client.token = token;
    client.accountId = account.id;
    client.username = account.username;
    client.character = character;
    world.hydrate(client);

    // auth { token, character } — the browser keeps the token for later messages.
    world.send(client, { type: 'auth', token, character });
    world.system(client, mode === 'register' ? 'Account created. Send join to enter the world.' : 'Welcome back! Send join to enter the world.', '#8ee6ff');
    console.log(`[server] ${mode}: ${account.username}`);
  } catch (err) {
    world.error(client, err.message);
  }
}

// ---------- Timers ----------

world.start();
const saveTimer = setInterval(() => {
  world.saveAll();
}, 10000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Pixel Realm server listening on port ${PORT} (WebSocket: /ws)`);
});

function shutdown() {
  clearInterval(saveTimer);
  world.stop();
  world.saveAll();
  server.close(() => {
    db.close();
    process.exit(0);
  });
  // Do not hang forever if a socket refuses to close.
  const force = setTimeout(() => process.exit(0), 2000);
  force.unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
