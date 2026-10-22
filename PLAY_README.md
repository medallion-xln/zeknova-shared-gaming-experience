# ZekNova — Play Locally

This is the updated ZekNova build with the ZEK-04.1 / ZEK-04.2 visual-pipeline fixes.

## What's new in this build
- HQ asset loading no longer hangs the game (was: infinite deadlock)
- Player/enemy HQ models load in the background with procedural fallback
- 45s per-asset timeout tuned for real load times under game load
- Asset registry (`assets/ASSET_REGISTRY.json`) classifying all 211 3D files
- Full test suite passes, source/bundle parity verified

## How to play
1. Make sure you have Node.js installed (https://nodejs.org)
2. Open a terminal in this folder and run:
   ```
   node start-local.mjs
   ```
3. Open http://127.0.0.1:8790 in your browser (Chrome recommended)
4. Click ENLIST, enter a name/email/team, then LAUNCH

No PHP or build step needed — everything runs from these files.

## Notes
- The game runs in "local demo" mode: progress saves to your browser's localStorage.
- HQ 3D models (stalker, saboteur, spitter, skyray, player) load in the background
  after boot; the game starts immediately with procedural models and swaps when ready.
- For the best visuals, use Chrome with hardware acceleration enabled.
