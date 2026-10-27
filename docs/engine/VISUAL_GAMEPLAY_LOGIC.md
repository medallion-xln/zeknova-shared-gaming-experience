# Visual gameplay logic — ZGE-13

**A bounded, typed visual rule editor for the existing data-only rule contract. Not a general Blueprint engine.**

## Contract

Rules are a versioned `rules` array on the scene (`SetRules` operation, `validateRules` at every boundary). Five `kind`s are supported, all validated against typed schemas with entity/component/field reference checks:

- `move` — entity + `speed` + `bounds`.
- `collect` — `entity` + `target` + `component`/`counter` + `radius`.
- `build` — `entity` + `sourceEntity`/`sourceComponent`/`counter` + `component`/`property` + `cost` + `target` + `prefab` + `key`.
- `interact` — `entity` + `sourceEntity`/`sourceComponent`/`counter` + `component`/`property` + `cost` + `target` + `key`.
- `goal` — `entity` + `component`/`property` + `sourceEntity`/`sourceComponent`/`counter` + `threshold`.

The concrete example from the prompt maps directly onto the Haven rules: *player collects three energy cells → build (cost 3) → console activates → objective completes*.

## Editor (Studio workspace)

`examples/studio/rule-editor.js` provides:

- **Event/action/condition selection** — `kind` dropdown, entity/component/property/source/counter/threshold fields (`data-rule-field`).
- **Entity references** — fields resolve against scene entity IDs.
- **Validation + error display** — `SetRules` runs `validateRules`, rejecting unknown `kind`, stale revision, missing entity/component references, and non-typed counters atomically.
- **Save/export** — rules persist in `exportProject()` and raise `sdkCompatibility.minimumPreview` to `13` (authored scene rules require preview13, enforced across `validateProject`).
- **Undo/redo** — `setRules` participates in the scene's atomic undo/redo.
- **Simulation inspection** — the Simulate workspace emits `game:rule` events; a live status reads current objective/counter/state.

## Hard constraints honored

- **No executable JavaScript as project data.** `SetRules` rejects any `kind:'eval'` / `'script'` (test `zge13.test.mjs` asserts `setRules([{id:'script',kind:'eval'}])` throws). Unsupported rule types reject explicitly.
- **Atomic + versioned.** Rule changes are one `SetRules` changeset with base-revision precondition; they cannot partially apply or mutate durable authority.
- **Authoring vs. authority isolation.** Studio rule authoring writes local project state only. Shared-world persistent rules still require the authorized server execution path; the visual editor is never an unauthenticated world-mutation surface.
- **Typed schemas.** All rule fields are validated by `validateFields` against the component definitions; counter/property types must be numeric/boolean as appropriate.

## Acceptance verification

`packages/sdk/test/zge13.test.mjs` "Haven collection, build cost, one-shot interaction and objective execute through data rules": drives `installProjectRules(e, keys)`, simulates 120 steps collecting 3 cells, builds the relay (cost→0, `built:true`, prefab `relay-house` instance created), activates the console, asserts `objective.state.complete===true`, then asserts the world is stable after a further 60 idle steps.

`scripts/zge13-workflow.mjs` exercises the *visual* path: opens the rule editor, fills goal fields, commits, undoes, redoes, exports, and completes the objective in the independent host — for both WebGPU and WebGL.

## Remaining code-only features

Rule *execution semantics* (movement stepping, collision, collection radius, build cost, one-shot interaction, goal evaluation) live in `packages/sdk/src/rules.js` (`installProjectRules`). The editor can *configure* these; it does not *implement* them. A fully general Blueprint-style node graph, custom rule-script execution, and multiplayer-shared rule evaluation remain out of scope and are documented as code-only.
