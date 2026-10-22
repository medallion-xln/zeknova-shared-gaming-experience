# External developer validation — ZGE12

**AUTOMATED_EXTERNAL_DEVELOPER_VALIDATION.** No unfamiliar human tester or interview was available; these observations are automated integration evidence and evaluator judgment.

Three independently installed public-package projects—Relay Courier, Orchard Counter and Beacon Rescue—define different custom cargo/harvest/rescue components and movement/collection/goal rules without changing the engine. The new workspace is outside the monorepo at `/tmp/zge12-independent-uSRaaz`. npm pack captures the public SDK; package-lock creation and clean offline npm ci install the package, Three0.185.0 and TypeScript6.0.3. No private SDK imports or legacy game data are used. Public source/API tests are separate from these consumer tests.

The executable generator is `scripts/zge12-external.mjs`; its result records every command, elapsed duration, stdout, package inventory/hash and workspace. Run npm test, npm run typecheck and npm start inside that workspace. The fresh setup plus generated tests/typechecking took3.39s, **not a human time-to-first-game estimate**. The generator pre-authored code and fixture data; implementation time and reasoning are excluded.

Each project creates a project/scene/entities, declares custom component schemas, configures data-only rules, imports a self-authored GLB and creates a prefab. Tests deliberately introduce both invalid movement speed and an accepted-but-wrong objective threshold2 for one pickup. The former yields a validation error; the latter collects successfully but fails the objective. Inspecting counter/rule data and changing threshold to1 through the public portable project restores completion. No executable JSON plugin or private import is involved.

The browser workflow imports into Studio, inspects the custom component, performs and undoes an atomic multi-selection edit, imports/previews a GLB, places it through native drag and the accessible placement button, creates a prefab, simulates with real arrow keys, observes events, verifies authoring isolation, rejects/approves/undoes mock changes, saves/exports, reopens in a fresh context, imports into the independent host and completes/restores the objective. Exact project data survives fresh-context reopen.

| Project | Measured browser steps | Driver wall seconds | Fresh reopen / independent / restore | Uncaught errors |
|---|---|---|---|---|
| relay-courier | 10 | 3.21 | PASS / PASS / PASS | 0 |
| orchard-counter | 10 | 3.11 | PASS / PASS / PASS | 0 |
| beacon-rescue | 10 | 3.13 | PASS / PASS / PASS | 0 |


Gaps: these three fixtures vary component schemas, movement speed and objective data within the same bounded move/collect/goal interpreter. They do not establish three game genres or a substantial finished game. This is an informed automated evaluator, not a truly unfamiliar developer; generated code shortens the journey. Studio has no general visual rule-graph editor, so rule definition/debug corrections use the documented public data contract and code. Asset support is deliberately narrow. Native dependency installation was offline against an already populated local npm cache. Browser port and Playwright installation are local prerequisites. Repeatedly selecting the same project file initially failed to fire another import; clearing the consumed file input fixed it and the24-switch regression passed. Old failing logs are retained.

Signal Garden's existing preview11 install remains unchanged. Its physical external workflow and strict existing compatibility were rerun through the retained ZGE11 harness; Orbital Outpost also remains compatible. New projects require preview12; older preview11/v2 and v1 files remain accepted. See the source/security gates in the main report.
