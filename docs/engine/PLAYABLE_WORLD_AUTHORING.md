# Playable world authoring — ZGE-13

**Beacon Haven** is a complete, independent, Studio+SDK-authored game that ends-to-end satisfies the primary acceptance goal: open Studio, build a coherent 3D environment, add an interactive objective via supported engine rules, preview it, play it continuously, save/export it, and run it independently through the public SDK.

## The game

"Beacon Haven · restore the island relay". A 3D island with a walk path, three collectible energy cells, a build site, a console, and a relay objective. The player collects three cells (resource), pays them to build a relay house at the site (construction + cost), then activates the console (interaction) to complete the objective. Visual status text and synthesized audio tones provide feedback.

Coherent, mechanically connected — not an assembly of unrelated demos:

- **Terrain**: island (scaled box) + walkable path.
- **Structures**: three `relay-house` prefab shelters + the built relay, all referencing a single imported multi-mesh GLB.
- **Player**: a sphere with a `state` component (`cells`, `built`).
- **Resource**: three collectible cell cylinders (`energy:true`).
- **Interactive object**: the console (activate via `e` once built).
- **Construction**: build the relay with `b` at the site, costing 3 cells.
- **Objective**: `objective` entity (`state.complete:false`) → goal rule.
- **Save/reload**: `localStorage` + exact entity round-trip.

## Project files

`examples/beacon-haven/`:
- `starter.json` — authored, objective not yet added (the "starter" the creator begins from).
- `project.json` — completed project including the objective goal rule.
- `haven.glb` — self-authored CC0-1.0 hierarchical multi-mesh house (3 parts), produced by `scripts/zge13-haven.mjs`.

## What was authored through Studio vs. requiring SDK code

The milestone deliberately records the boundary, not a false "100% visual" claim:

| Capability | Authored via Studio | Required SDK code |
|---|---|---|
| Project/scene/entity creation | yes | — |
| Asset import (GLB) | yes (file picker + place button) | — |
| Entity placement + transform | yes (position fields + apply) | — |
| Rule configuration | yes (rule editor: kind=goal, fields) | rule schema embedded in SDK |
| Objective completion logic | — | `installProjectRules` interpreter (SDK `rules.js`) |
| Movement/collect/build/interact execution | — | `installProjectRules` interpreter |
| Play / simulate / debug | yes (simulate workspace) | — |
| Save / export / independent run | yes | `beacon-haven/main.js` host (public SDK only) |

The **rules are data, not code**: the full rule set (move / collect / build / interact / goal) is a JSON `rules` document validated by `validateRules`. No executable JavaScript is serialized as project data. All game-specific rules live inside the independent project.

## Creator workflow proof

`scripts/zge13-workflow.mjs` drives the full physical journey against real Chrome, once per renderer (`auto`/WebGPU and `webgl`):

1. Open Studio → select `haven` → open.
2. Import `haven.glb` → preview asset card → place it.
3. Configure a `goal` rule through the rule editor (id/entity/component/property/sourceEntity/sourceComponent/counter/threshold).
4. Mock-proposal reject/approve/undo around the rules.
5. Undo/redo the rule edit.
6. Save; switch to Simulate → Play → drive `d`/`s`/`b`/`e` → objective completes.
7. Verify authoring state unchanged by simulation (isolation).
8. Export → download `haven-{mode}.json`.
9. Fresh browser context: import into `beacon-haven/`, play, complete objective, save, reload, restore.

**Measured**: rule edit 67.6–69.2 ms; simulation completes; export→independent→exact entity restore **true**; 0 uncaught errors in both modes. See `evidence/zge13/charts/` and the retained `workflow/results.json`.

## SDK interfaces used

`createProject`, `createEngine`, `importModel` (`hierarchy:true`), `createEntity`, `createPrefab`, `setRules`, `exportProject`, `installProjectRules`, `parseProject`. No legacy bundle, no private package imports. See the public spec in `packages/sdk/README.md`.

## Limits

The rule interpreter covers a bounded, typed contract (`move`, `collect`, `build`, `interact`, `goal`); it is not a general Blueprint engine. The game has no third-party assets (all self-authored CC0), so asset licensing redistribution remains "self-authored, permitted" only for this fixture — imported third-party assets retain `unknown` provenance by default. This is one cohesive game, not three genre divergences.
