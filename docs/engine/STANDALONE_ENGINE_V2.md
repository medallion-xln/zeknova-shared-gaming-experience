# Standalone engine V2 — ZGE-04

Open `http://127.0.0.1:8790/examples/construction-world/` with `npm run dev`. The command-line proof remains `npm run demo:engine`. The interactive session consumes public core/construction entries and imports no ZekNova catalog, missions, models, minified runtime, authentication or backend save service.

The construction lab has a generic builder entity, twenty stone, a shelter costing four stone, a bounded plane and circle occupancy. Click the canvas or enter x/z and choose Place shelter. Occupied/outside placement rejects. The UI shows inventory, current result, entities/components, transforms, occupancy, revisions and event records in a live immutable world-state inspector.

Remove selected clears occupancy without a refund. Rollback reverses the latest local command. Save locally writes only the lab's versioned localStorage key, `zge.independent-world.v2`; restore or reload restores the engine snapshot. Unfinished staged intentions abort safely on reload. Deterministic replay restores the initial world, applies the recorded command/undo sequence with the same IDs and verifies construction state and fixed-step count. The displayed deterministic value comes from executable replay, not a hardcoded claim.

`session.js` owns startup/disposal and manual fixed steps; `ui.js` owns the DOM/canvas bindings. No second simulation timer is started. The existing Node demo is retained as a separate small public-API example.

Browser evidence (`scripts/zge04-browser-demo.mjs`) clicks the actual controls and terrain, verifies valid placement, occupancy and outside rejection, deduction, removal, rollback, save/restore across reload, a staged interrupted placement, replay and immutable inspection. A screenshot is retained in `evidence/zge04/standalone-v2.png`. Node tests exercise the same public session API.

Limits: local single-player fixture, no server authority, multiplayer, complex terrain, utility network or legacy presentation. The lab does not activate engine ownership in ZekNova.
