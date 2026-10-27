# Camera Presets & Project Persistence (Phase 12)

## Contract

Camera settings travel with a project under the top-level `camera` field as a
**data-only, versioned** document. No executable scripts, no functions, no
plugin code — only numbers and enum strings.

```json
{
  "schema": "zge.camera.presets.v1",
  "defaultMode": "third-person",
  "enabledModes": ["third-person", "isometric"],
  "sensitivity": 0.0025,
  "pitchLimits": [-1.1, 1.1],
  "transitionDuration": 0.35,
  "isometric": { "followDistance": 13, "elevation": 40, "orthoScale": 10 },
  "over-shoulder": { "followDistance": 2.2, "elevation": 14, "fov": 58, "offset": 0.65 },
  "third-person": { "followDistance": 7, "elevation": 20, "fov": 50 }
}
```

- `schema` — must be exactly `zge.camera.presets.v1`.
- `defaultMode` — the mode a Play session starts in.
- `enabledModes` — whitelist; `setMode` rejects any mode outside it.
- `sensitivity`, `pitchLimits`, `smoothing`, `transitionDuration` — global look/transition tunings.
- Per-mode `followDistance`/`elevation` (pitch, degrees) / `offset` / `fov` / `orthoScale` override the `DEFAULT_RIG` values for that mode.

## Validation

`validateCameraPreset(value)` (exported) enforces the schema and rejects unknown
modes, non-finite numeric fields, malformed `pitchLimits`, and negative
`smoothing`/`transitionDuration`. Invalid documents throw rather than silently
fall back.

## Application

`createCameraDirector(engine, { preset })` applies the document at construction,
and `director.applyPreset(preset)` re-applies it at runtime. The applied effects:

- `mode` starts at `defaultMode`.
- `enabledModes` gates `setMode`.
- Per-mode rig overrides merge into the mode's base look (via `baseRig(mode)`),
  so `follow`/`setMode` resets keep the authored distances/pitches.
- `sensitivity`, `pitchLimits`, and `smoothing` are exposed on the director
  (`sensitivity`/`pitchLimits`/`smoothing` getters) for the input layer to honor.

## Persistence

The `camera` field is preserved by `validateProject`/`migrateProject` (both deep-
copy via `plain()` and assert only known fields), so it round-trips through
`createEngine` → `exportProject()` unchanged. ZekNova Studio reads
`project.camera` into `state.cameraPreset` on open and passes it to
`createCameraDirector` on Play.

Verified by unit test `camera presets are versioned, validated, and applied
data-only`, and in-browser: injecting a `zge.camera.presets.v1` document with
`defaultMode:'third-person'` makes Play start in third-person with the authored
enabled-mode set.
