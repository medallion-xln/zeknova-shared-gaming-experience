# Beacon Haven

A small local game using only the public SDK and its Three viewport adapter.

Open `/examples/beacon-haven/` on the repository development server. Focus the canvas, use WASD/arrows to collect the three mint cells, approach the blue site, press B, then approach the blue console and press E. Sound requires the Enable sound button. Save/Restore uses this browser's localStorage. No durable server or shared economy is involved.

In Studio, choose Beacon Haven to open `starter.json`. This intentionally omits the completion rule. Open Gameplay rules and choose goal. Set id=objective, entity=objective, component=state, property=complete, sourceEntity=console, sourceComponent=state, counter=online, threshold=1. Commit, then preview, save and export the project. Import the exported JSON in this game's Open exported world control.

The shipped `project.json` already includes that goal so the game also plays immediately. The starter's layout, movement/collection/build/interaction data and host input/audio/save code were prepared with SDK code; the certification adds the objective through the editor, imports/places another house, and runs that exported project independently. This is not an entirely code-free game creation claim.

`haven.glb` contains self-authored CC0 static house geometry. The importer supports multiple meshes and positive-scale TRS hierarchy when opted in; textures, alpha materials, rigs and animation are unsupported. Imported files in Studio retain unknown redistribution rights until the creator supplies provenance.

Rebuild the two project files and GLB with `node scripts/zge13-haven.mjs`. Package installation uses `@zge/sdk` preview.13 and one Three.js namespace; the independent certification harness creates a fresh packed consumer without source aliases.
