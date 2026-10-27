# Independent game and creator certification — ZGE-13

**AUTOMATED_DEVELOPER_WORKFLOW_CERTIFICATION. No unfamiliar human tester participated, so this is not external human usability certification.**

## The one genuinely cohesive independent game

"Beacon Haven · restore the island relay" (see [PLAYABLE_WORLD_AUTHORING.md](PLAYABLE_WORLD_AUTHORING.md)) is installed as a fresh public-SDK consumer and driven end-to-end.

## Fresh package consumer

`scripts/zge13-external.mjs` runs `npm pack` on the public `@zge/sdk`, creates a clean workspace outside the monorepo (`/tmp/zge13-independent-*`), and installs the package + Three.js + TypeScript offline against the populated local npm cache. No source aliases, legacy imports, or workspace symlinks. Result: clean install, strict types, and the packed build re-packs identical bytes twice (deterministic closure).

## Independent execution

`scripts/zge13-independent-browser.mjs`:
1. Opens the fresh-install host's `index.html`.
2. Imports the Studio-exported `studio-export.json`.
3. Drives real `d`/`s`/`b`/`e` input to collect 3 cells, build the relay, and activate the console until `objective.state.complete`.
4. Saves → reloads → reloads from `localStorage` → asserts exact `entities` round-trip.

Result: **PASS** in both `auto` (WebGPU) and `webgl`, `publicSDKInstalled:true`, `exactEntityRestore:true`, 0 uncaught errors. Audio context is enabled synthetically (`audibleHumanVerification:false` — heard-feedback verification was not possible headless).

## Covered workflow steps (mapped to the 14-step checklist)

1. Clean SDK install ✅ · 2. Project creation ✅ · 3. Asset import ✅ (GLB) · 4. Scene layout ✅ · 5. Visual logic authoring ✅ (goal rule via Studio) · 6. Player movement ✅ · 7. Resource interaction ✅ (collect) · 8. Objective completion ✅ · 9. Feedback ✅ (status text + synthesized tone) · 10. Save ✅ · 11. Export ✅ · 12. Fresh import/install ✅ · 13. Independent gameplay ✅ · 14. Error recovery ✅ (invalid speed / wrong threshold produce a validation error and a failed objective, respectively, then self-correct via the rule editor).

## Honest labels

- **No human usability**: no unfamiliar human ran an observed task-based session. Usability difficulties are not recorded because no human was observed. No satisfaction ratings are invented.
- The "time-to-first-game" measured is generator wall-clock, not a human authoring estimate (pre-authored code/fixtures excluded).
- Three projects were **not** assembled as three game genres; Beacon Haven is one cohesive game. The prior ZGE-12 three-consumer fixtures (Relay Courier / Orchard Counter / Beacon Rescue) remain compatibility evidence, not genre divergence claims.
