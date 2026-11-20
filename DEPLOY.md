# Deploy Pixel Realm online

Cloudflare serves only the game page. `wrangler.jsonc` keeps the Worker configuration in the repository, and `.assetsignore` allows only `index.html`, `style.css`, and `game.js` to be uploaded. Server code, account data, and deployment files are not public assets.

Deploy the static game with `npx wrangler deploy`. The Worker does not run this repository's `npm start` Node.js process, so multiplayer requires a separately hosted server.

## Free Node server on Render

This repository includes `render.yaml` for the game server.

1. Push the latest repository changes to GitHub.
2. In Render, choose **New > Blueprint** and connect `jacardiel-maker/myapp`.
3. Select the `render.yaml` blueprint and create the free `pixel-realm-server` web service.
4. Wait for the deploy to finish. The frontend defaults to `wss://myapp-gbm5.onrender.com/ws`.
5. Redeploy the Cloudflare Worker after pushing the latest frontend changes, then open its `workers.dev` URL. No `?ws=` parameter is needed with the default Render service.
6. Open **Online** in the game. The connection status should show `wss://myapp-gbm5.onrender.com/ws`.

If you renamed the Render service or use a custom domain, change the production WebSocket URL in `game.js`, or override it in the browser with `?ws=wss://YOUR-SERVER/ws`. If you use Cloudflare Pages instead of Workers, use its `pages.dev` URL.

The Render free service can sleep while idle and may restart. This blueprint stores its SQLite database at `/tmp/pixel-realm.db`, which is temporary; accounts and saved progress can be lost after a restart or redeploy. Use durable database storage before relying on long-term saves.

## Local check

Run `npm start` in the repository, then open the game with `?ws=ws://localhost:3000/ws`. The production Cloudflare game page should use the hosted server's `wss://.../ws` URL instead.
