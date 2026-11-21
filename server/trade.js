/*
  server/trade.js
  Authoritative real-time player-to-player direct trading sessions.
  Features:
    - Invitation and acceptance handshake
    - Live offering of items and gold
    - Dual-lock confirmation to prevent trade baiting/swapping
    - Atomic transfer with bag capacity verification
*/

export class TradeManager {
  constructor(world) {
    this.world = world;
    this.sessions = new Map(); // sessionId -> session
    this.playerToSession = new Map(); // client.id -> sessionId
    this.invites = new Map(); // target client id -> { fromId, expires }
    this.nextSessionId = 1;
  }

  requestTrade(fromClient, targetName) {
    if (!fromClient.character || typeof targetName !== 'string') return;
    const targetClient = [...this.world.clients].find(c =>
      c.character && (c.character.name.toLowerCase() === targetName.toLowerCase() ||
                      c.character.username?.toLowerCase() === targetName.toLowerCase())
    );

    if (!targetClient) {
      this.world.error(fromClient, `Player "${targetName}" is not online.`);
      return;
    }
    if (targetClient.id === fromClient.id) {
      this.world.error(fromClient, 'You cannot trade with yourself.');
      return;
    }
    if (this.playerToSession.has(fromClient.id)) {
      this.world.error(fromClient, 'You are already in an active trade session.');
      return;
    }
    if (this.playerToSession.has(targetClient.id)) {
      this.world.error(fromClient, `${targetClient.character.name} is currently busy trading.`);
      return;
    }

    this.invites.set(targetClient.id, { fromId: fromClient.id, expires: Date.now() + 60000 });
    this.world.system(targetClient, `${fromClient.character.name} wants to trade with you! Type /trade accept or click Accept in the Trade prompt.`, '#ffd75e');
    this.world.send(targetClient, {
      type: 'trade_invite',
      fromId: fromClient.id,
      fromName: fromClient.character.name
    });
    this.world.system(fromClient, `Trade invitation sent to ${targetClient.character.name}.`, '#9fb0cd');
  }

  acceptTrade(client, fromId) {
    const invite = this.invites.get(client.id);
    this.invites.delete(client.id);
    if (!invite || String(invite.fromId) !== String(fromId) || invite.expires < Date.now()) {
      this.world.error(client, 'No pending trade invitation from that player.');
      return;
    }
    const partner = [...this.world.clients].find(c => String(c.id) === String(fromId) && c.character);
    if (!partner) {
      this.world.error(client, 'Trade partner is no longer online.');
      return;
    }
    if (this.playerToSession.has(client.id) || this.playerToSession.has(partner.id)) {
      this.world.error(client, 'One of you is already in a trade.');
      return;
    }

    const sessionId = this.nextSessionId++;
    const session = {
      id: sessionId,
      p1: { client, items: [], gold: 0, locked: false, accepted: false },
      p2: { client: partner, items: [], gold: 0, locked: false, accepted: false }
    };

    this.sessions.set(sessionId, session);
    this.playerToSession.set(client.id, sessionId);
    this.playerToSession.set(partner.id, sessionId);

    this.sendTradeState(session);
  }

  setOffer(client, { items = [], gold = 0 }) {
    const s = this.getSession(client);
    if (!s) return;
    const side = s.p1.client.id === client.id ? s.p1 : s.p2;

    // Resolve client-supplied uids to the real server-side items. Storing the
    // message objects verbatim allowed forged stats and duplicate-item tricks.
    const inventory = Array.isArray(client.character.inventory) ? client.character.inventory : [];
    const seen = new Set();
    side.items = Array.isArray(items) ? items.reduce((resolved, offered) => {
      const uid = offered && offered.uid;
      if (resolved.length >= 4 || uid === undefined || uid === null || seen.has(uid)) return resolved;
      const realItem = inventory.find(item => item && item.uid === uid);
      if (realItem) {
        seen.add(uid);
        resolved.push(realItem);
      }
      return resolved;
    }, []) : [];
    side.gold = Math.max(0, Math.min(Number(client.character.gold) || 0, Math.floor(Number(gold) || 0)));
    side.locked = false;
    side.accepted = false;
    (side === s.p1 ? s.p2 : s.p1).accepted = false;

    this.sendTradeState(s);
  }

  lockOffer(client) {
    const s = this.getSession(client);
    if (!s) return;
    const side = s.p1.client.id === client.id ? s.p1 : s.p2;
    side.locked = true;
    this.sendTradeState(s);
  }

  confirmTrade(client) {
    const s = this.getSession(client);
    if (!s) return;
    if (!s.p1.locked || !s.p2.locked) {
      this.world.error(client, 'Both players must lock their offers before confirming.');
      return;
    }

    const side = s.p1.client.id === client.id ? s.p1 : s.p2;
    side.accepted = true;

    this.sendTradeState(s);

    if (s.p1.accepted && s.p2.accepted) {
      this.executeSwap(s);
    }
  }

  executeSwap(s) {
    const c1 = s.p1.client.character;
    const c2 = s.p2.client.character;

    // Verify both still have the offered items in inventory
    const p1ItemsValid = s.p1.items.every(it => c1.inventory.some(x => x && x.uid === it.uid));
    const p2ItemsValid = s.p2.items.every(it => c2.inventory.some(x => x && x.uid === it.uid));
    const p1GoldValid = (Number(c1.gold) || 0) >= s.p1.gold;
    const p2GoldValid = (Number(c2.gold) || 0) >= s.p2.gold;

    if (!p1ItemsValid || !p2ItemsValid || !p1GoldValid || !p2GoldValid) {
      this.world.error(s.p1.client, 'Trade failed: items or gold changed during the trade.');
      this.world.error(s.p2.client, 'Trade failed: items or gold changed during the trade.');
      this.closeSession(s.id);
      return;
    }

    // Verify inventory capacity:
    const p1RemainingSlots = 20 - (c1.inventory.length - s.p1.items.length);
    const p2RemainingSlots = 20 - (c2.inventory.length - s.p2.items.length);

    if (s.p2.items.length > p1RemainingSlots) {
      this.world.error(s.p1.client, 'Trade failed: not enough bag space.');
      this.world.error(s.p2.client, 'Trade failed: partner bag is full.');
      this.closeSession(s.id);
      return;
    }
    if (s.p1.items.length > p2RemainingSlots) {
      this.world.error(s.p2.client, 'Trade failed: not enough bag space.');
      this.world.error(s.p1.client, 'Trade failed: partner bag is full.');
      this.closeSession(s.id);
      return;
    }

    // Remove offered items from inventories
    const p1Uids = new Set(s.p1.items.map(i => i.uid));
    const p2Uids = new Set(s.p2.items.map(i => i.uid));

    c1.inventory = c1.inventory.filter(i => !p1Uids.has(i.uid));
    c2.inventory = c2.inventory.filter(i => !p2Uids.has(i.uid));

    // Exchange items
    c1.inventory.push(...s.p2.items);
    c2.inventory.push(...s.p1.items);

    // Exchange gold
    c1.gold = (Number(c1.gold) || 0) - s.p1.gold + s.p2.gold;
    c2.gold = (Number(c2.gold) || 0) - s.p2.gold + s.p1.gold;

    this.world.system(s.p1.client, `Trade with ${c2.name} completed successfully!`, '#2ecc71');
    this.world.system(s.p2.client, `Trade with ${c1.name} completed successfully!`, '#2ecc71');

    this.world.sendCharacter(s.p1.client);
    this.world.sendCharacter(s.p2.client);

    this.world.send(s.p1.client, { type: 'trade_closed', reason: 'completed' });
    this.world.send(s.p2.client, { type: 'trade_closed', reason: 'completed' });

    this.closeSession(s.id);
  }

  cancelTrade(client) {
    const s = this.getSession(client);
    if (!s) return;
    this.world.send(s.p1.client, { type: 'trade_closed', reason: 'cancelled' });
    this.world.send(s.p2.client, { type: 'trade_closed', reason: 'cancelled' });
    this.world.system(s.p1.client, 'Trade cancelled.', '#e74c3c');
    this.world.system(s.p2.client, 'Trade cancelled.', '#e74c3c');
    this.closeSession(s.id);
  }

  getSession(client) {
    const id = this.playerToSession.get(client.id);
    return id ? this.sessions.get(id) : null;
  }

  sendTradeState(s) {
    const msg = {
      type: 'trade_state',
      p1: { name: s.p1.client.character.name, items: s.p1.items, gold: s.p1.gold, locked: s.p1.locked, accepted: s.p1.accepted },
      p2: { name: s.p2.client.character.name, items: s.p2.items, gold: s.p2.gold, locked: s.p2.locked, accepted: s.p2.accepted }
    };
    this.world.send(s.p1.client, msg);
    this.world.send(s.p2.client, msg);
  }

  closeSession(sessionId) {
    const s = this.sessions.get(sessionId);
    if (s) {
      this.playerToSession.delete(s.p1.client.id);
      this.playerToSession.delete(s.p2.client.id);
      this.sessions.delete(sessionId);
    }
  }

  handleDisconnect(client) {
    this.cancelTrade(client);
    this.invites.delete(client.id);
    for (const [targetId, invite] of this.invites) {
      if (String(invite.fromId) === String(client.id)) this.invites.delete(targetId);
    }
  }
}
