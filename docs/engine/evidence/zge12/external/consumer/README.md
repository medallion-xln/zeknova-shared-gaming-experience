# Automated external developer lab

No human usability study. Three data-only games use installed public SDK APIs.

1. npm ci --offline --ignore-scripts
2. npm test
3. npm run typecheck
4. npm start
5. Open http://127.0.0.1:8813/?game=relay-courier (also orchard-counter, beacon-rescue). ArrowRight moves toward pickup.
6. Import a generated .zge.json into Studio, edit, simulate, export, then import that export in this independent host.

A deliberately zero movement speed is rejected by validation; correcting it restores the game. Static model support is limited to opaque GLB2 triangles; source fixture is self-authored CC0. Trusted plugin code is never imported from project JSON.
