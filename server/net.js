/*
  server/net.js
  A tiny, dependency-free WebSocket implementation for Node.js.

  We only need what the game needs:
    - the HTTP upgrade handshake on /ws
    - masked frames coming from the browser
    - unmasked text frames going back to the browser
    - ping / pong / close control frames
    - payload lengths 125, 126 and 127

  Everything is explained with beginner comments so it is easy to follow.
*/
import crypto from 'node:crypto';

// This magic GUID is part of the WebSocket standard. The browser expects us to
// hash it together with the Sec-WebSocket-Key header during the handshake.
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/**
 * Attach WebSocket support to an existing http.Server.
 *
 * @param {object} options
 * @param {import('node:http').Server} options.server  The HTTP server to listen on.
 * @param {string} [options.path]                      The only path that accepts upgrades.
 * @param {number} [options.maxPayload]                Max bytes for one message.
 * @param {(ws: object, req: object) => void} options.onConnection Called after a successful handshake.
 */
export function attachWebSocket({
  server,
  path = '/ws',
  maxPayload = 1024 * 1024,
  onConnection = () => {}
} = {}) {
  server.on('upgrade', (req, socket, head) => {
    // 1. Work out which path the browser asked for (ignore the query string).
    let pathname = '';
    try {
      pathname = new URL(req.url || '/', 'http://localhost').pathname;
    } catch {
      socket.destroy();
      return;
    }

    if (pathname !== path) {
      socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      return;
    }

    // 2. Check the required WebSocket headers.
    const upgrade = String(req.headers.upgrade || '').toLowerCase();
    const connection = String(req.headers.connection || '').toLowerCase();
    const key = req.headers['sec-websocket-key'];

    if (upgrade !== 'websocket' || !connection.includes('upgrade') || typeof key !== 'string') {
      socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      return;
    }

    // A valid key decodes to exactly 16 bytes. This stops random upgrade requests.
    const keyBytes = Buffer.from(key, 'base64');
    if (keyBytes.length !== 16) {
      socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      return;
    }

    // 3. Build the Sec-WebSocket-Accept answer.
    const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');

    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      '\r\n'
    ].join('\r\n'));

    socket.setNoDelay(true);

    // Any bytes that arrived together with the upgrade request belong to the
    // first frame, so push them back into the socket's read queue.
    if (head && head.length) socket.unshift(head);

    // 4. Create a small wrapper object that the rest of the server can use.
    const ws = makeSocketWrapper(socket, maxPayload);
    onConnection(ws, req);
  });
}

function makeSocketWrapper(socket, maxPayload) {
  let buffer = Buffer.alloc(0);      // incomplete frame bytes wait here
  let fragments = [];                // used for fragmented messages
  let fragmentOpcode = null;         // 1 = text, 2 = binary
  let closed = false;

  const messageHandlers = new Set();
  const closeHandlers = new Set();

  const ws = {
    socket,
    alive: true,

    // Send either a string or any JSON-serialisable object.
    send(data) {
      if (closed || socket.destroyed) return;
      // A client that cannot keep up should not make the process buffer state
      // packets forever. Close it instead of growing memory without a limit.
      if (socket.writableLength > maxPayload * 4) {
        ws.close(1009, 'Slow consumer');
        return;
      }
      let text;
      try {
        text = typeof data === 'string' ? data : JSON.stringify(data);
      } catch (err) {
        console.error('[ws] Could not serialise message:', err.message);
        return;
      }
      sendFrame(0x1, Buffer.from(text, 'utf8'));
    },

    // WebSocket ping control frame. Browsers answer automatically with pong,
    // which the parser below uses to mark the connection alive.
    ping(data = '') {
      if (closed || socket.destroyed) return;
      if (socket.writableLength > maxPayload * 4) {
        ws.close(1009, 'Slow consumer');
        return;
      }
      sendFrame(0x9, Buffer.from(String(data), 'utf8').subarray(0, 125));
    },

    // Politely close the connection with a WebSocket close frame.
    close(code = 1000, reason = '') {
      if (closed) return;
      closed = true;
      const reasonBytes = Buffer.from(String(reason).slice(0, 123), 'utf8');
      const payload = Buffer.alloc(2 + reasonBytes.length);
      payload.writeUInt16BE(code, 0);
      reasonBytes.copy(payload, 2);
      sendFrame(0x8, payload);
      socket.end();
      fireClose();
    },

    destroy() {
      if (closed) return;
      closed = true;
      fireClose();
      socket.destroy();
    },

    onMessage(fn) { messageHandlers.add(fn); return () => messageHandlers.delete(fn); },
    onClose(fn) { closeHandlers.add(fn); return () => closeHandlers.delete(fn); },
    get closed() { return closed; }
  };

  function fireClose() {
    for (const fn of closeHandlers) {
      try { fn(); } catch (err) { console.error('[ws] close handler error:', err.message); }
    }
    closeHandlers.clear();
    messageHandlers.clear();
  }

  // ---------- Sending ----------

  function sendFrame(opcode, payload) {
    if (socket.destroyed) return;
    const len = payload.length;
    let header;

    if (len <= 125) {
      // 0x80 marks "final frame"; the low 4 bits are the opcode.
      header = Buffer.alloc(2);
      header[0] = 0x80 | opcode;
      header[1] = len;
    } else if (len <= 65535) {
      // 126 means "the next 2 bytes hold the length".
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      // 127 means "the next 8 bytes hold the length".
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }

    // Server frames are never masked (only clients must mask).
    socket.write(Buffer.concat([header, payload]));
  }

  // ---------- Receiving ----------

  socket.on('data', (chunk) => {
    if (closed) return;
    ws.alive = true;
    buffer = Buffer.concat([buffer, chunk]);

    // A runaway client should not be able to grow our memory forever.
    if (buffer.length > maxPayload * 4) {
      ws.close(1009, 'Buffer overflow');
      return;
    }
    parseFrames();
  });

  socket.on('error', () => {
    // The game does not need the error text; just clean up below.
    if (!closed) { closed = true; fireClose(); }
  });

  socket.on('end', () => {
    if (!closed) { closed = true; fireClose(); }
  });

  socket.on('close', () => {
    if (!closed) { closed = true; fireClose(); }
  });

  function parseFrames() {
    while (!closed && buffer.length >= 2) {
      const first = buffer[0];
      const second = buffer[1];
      const fin = (first & 0x80) !== 0;
      const rsv = first & 0x70;
      const opcode = first & 0x0f;
      const masked = (second & 0x80) !== 0;

      if (rsv !== 0) { ws.close(1002, 'RSV bits are not supported'); return; }
      if (!masked) { ws.close(1002, 'Client frames must be masked'); return; }

      let length = second & 0x7f;
      let offset = 2;

      if (length === 126) {
        if (buffer.length < offset + 2) return; // wait for more bytes
        length = buffer.readUInt16BE(offset);
        offset += 2;
      } else if (length === 127) {
        if (buffer.length < offset + 8) return;
        const big = buffer.readBigUInt64BE(offset);
        if (big > BigInt(Number.MAX_SAFE_INTEGER)) {
          ws.close(1009, 'Payload too large');
          return;
        }
        length = Number(big);
        offset += 8;
      }

      if (length > maxPayload) {
        ws.close(1009, 'Payload too large');
        return;
      }

      if (buffer.length < offset + 4) return; // mask key not here yet
      const mask = buffer.subarray(offset, offset + 4);
      offset += 4;

      if (buffer.length < offset + length) return; // payload incomplete

      // Copy then unmask. WebSocket clients XOR every payload byte with a
      // repeating 4-byte key; the server must undo that before reading it.
      const payload = Buffer.from(buffer.subarray(offset, offset + length));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];

      buffer = buffer.subarray(offset + length);
      handleFrame(fin, opcode, payload);
    }
  }

  function handleFrame(fin, opcode, payload) {
    // Control frames (close / ping / pong) cannot be fragmented and are small.
    if (opcode >= 0x8) {
      if (!fin || payload.length > 125) { ws.close(1002, 'Bad control frame'); return; }

      if (opcode === 0x8) {
        const code = payload.length >= 2 ? payload.readUInt16BE(0) : 1000;
        const reason = payload.length > 2 ? payload.subarray(2).toString('utf8') : '';
        // Echo the close frame, then close for real (the close() call writes a
        // second frame, which is fine and expected by most browsers).
        const answer = Buffer.alloc(2 + Math.min(reason.length, 123));
        answer.writeUInt16BE(code, 0);
        Buffer.from(reason).copy(answer, 2);
        sendFrame(0x8, answer);
        closed = true;
        socket.end();
        fireClose();
      } else if (opcode === 0x9) {
        ws.alive = true;
        sendFrame(0xA, payload); // reply to a ping with the same bytes
      } else if (opcode === 0xA) {
        ws.alive = true;         // pong from the browser
      }
      return;
    }

    if (opcode === 0x0) {
      // A continuation frame finishes an earlier fragmented message.
      if (fragmentOpcode === null) { ws.close(1002, 'Unexpected continuation'); return; }
      fragments.push(payload);
      if (fin) deliverMessage(fragmentOpcode);
      return;
    }

    if (opcode !== 0x1 && opcode !== 0x2) { ws.close(1002, 'Unknown opcode'); return; }
    if (fragmentOpcode !== null) { ws.close(1002, 'Nested fragments'); return; }

    if (fin) {
      fragments = [payload];
      deliverMessage(opcode);
    } else {
      fragmentOpcode = opcode;
      fragments = [payload];
    }
  }

  function deliverMessage(opcode) {
    const data = Buffer.concat(fragments).toString('utf8');
    fragments = [];
    fragmentOpcode = null;
    for (const fn of messageHandlers) {
      try { fn(data, opcode); } catch (err) { console.error('[ws] message handler error:', err.message); }
    }
  }

  return ws;
}

export default { attachWebSocket };
