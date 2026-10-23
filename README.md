# MIRAGE CITY // ONLINE

An original open-world 3D crime sandbox built for phones, tablets, and desktop browsers. Run contracts through a procedurally built neon city, steal vehicles, outrun the police, and share the streets with cross-tab players.

Everything in the game is original: the city, characters, vehicles, missions, UI, audio, and branding. No assets or content from existing game franchises are used.

## Play

```bash
npm install
npm run dev
```

Or use the project runtime:

```bash
./start.sh
```

The production build is served from `dist/` on port `3000` by the default runtime.

## Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Move | `WASD` / arrow keys | Left joystick |
| Sprint | `Shift` | Push joystick to the edge |
| Camera | Drag with mouse | Drag the scene |
| Jump | `Space` | Jump button |
| Fire | Click | Fire button |
| Reload | `R` | Reload button |
| Enter / exit vehicle | `F` / `E` | Action button |
| Horn | `H` | Fire while driving |
| Pause | `Esc` / `P` | Pause button |

## Features

- Procedural neon island city with roads, sidewalks, plazas, skyline, rain, puddles, traffic, and pedestrians.
- Third-person character movement, sprinting, jumping, camera orbit, and vehicle camera.
- Jackable cars, sports cars, taxis, and police cruisers with arcade driving and engine audio.
- Sidearm combat with tracers, muzzle flashes, impacts, reloads, hit markers, and vehicle explosions.
- Wanted levels, responding police units, pursuit AI, sirens, damage, death, and respawn.
- Three-drive collection contract followed by a timed dead-drop delivery.
- Original procedural WebAudio soundtrack, ambience, weapons, engines, and sirens.
- Cross-tab operatives through `BroadcastChannel`, plus AI-controlled online players.
- Responsive touch HUD, safe-area support, fullscreen, quality settings, local progress saving, and installable PWA support.

## Build and verify

```bash
npm run build
npm run verify
```

`npm run verify` builds the app, checks required shell/PWA assets, validates icon sizes and the manifest, and imports every game module.

## PWA install

Open the production site in Chrome, Edge, or Safari and choose **Install app** / **Add to Home Screen**. The service worker caches the shell and runtime assets for fast repeat launches. On iOS, use **Share → Add to Home Screen** and play in landscape for the best experience.
