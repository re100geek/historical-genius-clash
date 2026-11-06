# Historical Genius Clash v10.2 — Online Parity & Comfort

Single-file browser fighting game with its Node.js WebSocket server. CPU, local 2P, story, training and other offline modes remain in `index.html`.

## v10.2 highlights

- Online 1v1 uses the existing pixel character sprites, weapon drawings, stage art, animations, attacks, special cut-in sequences, hit/guard particles and audio.
- The server applies each of the 13 characters' distinct passive talent effects. HP, energy, guards, knockouts and rounds are decided on the server.
- Online HUD shows HP/energy/guard, combat status, latency, room code and session status.
- **Leave room** in the lobby and during a match; a confirmation is shown before leaving an ongoing fight. The remaining player is notified and can continue hosting/recruit a new opponent.
- Host stage selection, share invitation link/code, joining through `#room=ABC123`, reconnect, connection check, sound toggle, effects reduction, full-screen mode and mobile touch controls.

## Deploy on Render

This repository is already configured for Node.js. The existing service uses `main`, Free/Singapore, `npm run check` and `npm start`, with automatic deployment.

- Entry: `server.js`, Node >=20, no npm runtime dependencies.
- Health check: `/health` returns `{"ok":true,"version":"10.2",...}`.
- WebSocket endpoint: `/ws`, upgraded automatically to WSS when visited via HTTPS.
- Game: `https://historical-genius-clash-online.onrender.com`.

Local test:

```bash
npm run check
npm start
```

Then visit `http://localhost:3000`. Under **Online 1:1**, create a room, share the code/link and select **Ready** on both devices.

## Limitations

- Online 1:1 is a casual friend-room mode. Dedicated story/training/tournament and some offline-exclusive meta systems remain available from the original offline menus.
- Rooms exist in server RAM; server restarts discard running matches. The free host may sleep when idle and require an initial connection delay.
- No global ranked matching, persistent online accounts, or tournament backend.
