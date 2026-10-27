# Immersive Play Mode

`examples/studio/play-mode.js` — the Play button's fullscreen gameplay experience.

## Entry (`enterPlay()`)

1. **`body.is-play`** collapses the editor chrome (header, toolbar, scene panel, inspector, splitters, rule editor, timeline) and fixes the viewport to `inset:0`. This is pure CSS, applied synchronously.
2. **`requestFullscreen()`** is invoked synchronously inside the click handler, *before* any `await`, so the browser user-activation requirement is preserved. On denial/unavailability, the full-window CSS fallback keeps the game playable.
3. **`ensureSimulation()`** builds an isolated engine from a `serialize()` snapshot of the authored scene and resumes it. The authored `state.scene` is never touched.
4. **`createCameraDirector(state.simulation)`** with `follow(...)` on the controlled entity; the director's pose is applied each frame by `frameHook()` via `viewport.directCamera`.
5. **HUD** (`#play-hud`) renders objective + resource, a `1/2/3/C` camera selector, and Pause / Return-to-Editor.
6. **Pointer lock** is requested on the **first canvas click** (a trusted gesture), never in `enterPlay`, so it is never denied for lack of activation.

## Exit (`exitPlay()`)

- Removes `is-play`/`is-ph-paused`, exitPointerLock + exitFullscreen, tears down the HUD and scoped listeners, disposes the director, clears input, and `reset()`s the isolated simulation.
- **The authored project is unchanged** (asserted byte-for-byte in browser verification).

## Interaction model

| Key / control | Action |
|---|---|
| 1 / 2 / 3 / C | switch camera mode (C cycles) |
| WASD / arrows | movement (flows through the existing input `Set`) |
| mouse | pointer-look (when pointer-locked) |
| Escape | pause (opens the pause `<dialog>`) |
| HUD Pause / Resume | pause / resume |
| HUD Return to Editor | `exitPlay()` |

## Resize & lifecycle

`resize` → `viewport.render()` recomputes aspect. `fullscreenchange` tracks native-fullscreen exit (game continues in full-window fallback). `pointerlockchange` clears look deltas on unlock. Repeated Play→Stop→Play stays leak-free because enter/exit are symmetric (listeners added/removed, director disposed/re-created, single `frameHook`).
