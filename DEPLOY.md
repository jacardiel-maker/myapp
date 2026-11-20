# Deploy Pixel Realm online

The Cloudflare deployment serves the game page. It does not run this repository's `npm start` Node.js process, so the default `/ws` connection has no multiplayer server behind it. Host the Node server separately and point the game page at it.

## Free Node server on Render

This repository includes `render.yaml` for the game server.

1. Push the latest repository changes to GitHub.
2. In Render, choose **New > Blueprint** and connect `jacardiel-maker/myapp`.
3. Select the `render.yaml` blueprint and create the free `pixel-realm-server` web service.
4. Wait for the deploy to finish. Copy the service URL, for example `https://pixel-realm-server.onrender.com`.
5. Open the Cloudflare game URL with the Render WebSocket address in the `ws` parameter:

   `https://YOUR-GAME.pages.dev/?ws=wss://pixel-realm-server.onrender.com/ws`

   Replace both example domains with the URLs shown in your dashboards. Use `wss://` for the Render address because it is secure WebSocket traffic.

6. Open **Online** in the game. The connection status should show the Render WebSocket URL.

The Render free service can sleep while idle and may restart. This blueprint stores its SQLite database at `/tmp/pixel-realm.db`, which is temporary; accounts and saved progress can be lost after a restart or redeploy. Use durable database storage before relying on long-term saves.

## Local check

Run `npm start` in the repository, then open the game with `?ws=ws://localhost:3000/ws`. The production Cloudflare game page should use the hosted server's `wss://.../ws` URL instead.
