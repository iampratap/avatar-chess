# Avatar Chess

Four-player hotseat power-chess in the browser. Pieces look like pawns until your turn — then they morph into Rook, Knight, or Bishop. Powers rotate every round. Last avatar standing wins.

Built with plain HTML, CSS, and ES modules + [Three.js](https://threejs.org/) (via CDN import map). No build step.

**Author:** Pratapsingh Hajari · +91 99705 30520 · [WhatsApp](https://wa.me/919970530520)

## Play online

**[Play Avatar Chess →](https://iampratap.github.io/avatar-chess/)**

Hosted with GitHub Pages from this repository: [iampratap/avatar-chess](https://github.com/iampratap/avatar-chess).

## Play locally

Serve this folder over HTTP (ES modules need a local server, not `file://`):

```bash
python3 -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080).

Or with any static server you prefer (`npx serve`, VS Code Live Server, etc.).

## How to play (short)

1. Choose **1–3 human** seats on the welcome screen (remaining seats are PC).
2. Press **Play**.
3. On your turn, your pawns morph into your current power — select one and move.
4. Capture rivals by landing on them. After everyone alive has moved, powers rotate.

Full rules: in-app **Manual**. Guided board lessons: menu → **Live Training** (also from the Manual).

### Round 1 powers

| Player | Color  | Seat   | Power  |
|--------|--------|--------|--------|
| A      | Blue   | Bottom | Rook   |
| B      | Red    | Left   | Knight |
| C      | Green  | Top    | Bishop |
| D      | Orange | Right  | Rook   |

Each later round shifts every player to the next power (Rook → Knight → Bishop → Rook…).

## Features

- 3D board with orbit camera and animated moves / morphs / power-switch FX
- Human + PC seats (toggle Human/PC mid-game from the sidebar power list)
- **Looks & Models** — app theme (Dark / White), board themes, piece kits, live 3D preview
- Autosave / resume in the browser (`localStorage`)
- Match replay after a win
- Sound effects with mute
- Live **Train** coach (highlights legal lesson pieces, blocks other clicks)
- Illustrated **User Manual**
- **PWA** — installable on phone/desktop; works offline after the first visit (service worker + manifest)

## Install as an app

On supported browsers (Chrome / Edge / Safari / Android):

1. Open [the live game](https://iampratap.github.io/avatar-chess/)
2. Use **Install** / **Add to Home Screen** from the browser menu
3. Launch like a native app (standalone window)

## Project layout

```
web/
  index.html      # UI shells, modals, import map
  styles.css
  manifest.webmanifest
  sw.js           # Service worker (offline cache)
  icons/          # PWA / favicon assets
  README.md
  src/
    main.js         # App wiring, training & game loop
    game.js         # Pure rules (no Three.js)
    board3d.js      # Three.js board, pieces, camera, coach glow
    ai.js           # Simple PC mover
    ui.js           # HUD, modals, Looks panel, coach popup
    themes.js       # Board / piece / UI theme defs + prefs
    themePreview3d.js
    training.js     # Live training lessons
    helpDiagrams.js
    save.js         # Autosave
    replay.js
    sound.js
    powerFx.js
```

## Tips

- Prefer Chrome / Firefox / Safari recent versions (WebGL + ES modules).
- Training games are **not** autosaved; normal matches are.
- Hard-refresh (`Cmd+Shift+R`) after pulling if the browser caches old modules (`?v=` query on `main.js` / CSS).

## License

Game code © 2026 Pratapsingh Hajari. All rights reserved unless otherwise noted.
