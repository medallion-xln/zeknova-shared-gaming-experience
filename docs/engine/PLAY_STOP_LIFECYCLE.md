# Play / Stop Lifecycle

## State machine

```
[AUTHORING]  --Play-->  ensureSimulation() → director+follow → HUD → fullscreen → [PLAYING]
[PLAYING]    --Escape-->  [PAUSED] (dialog)  --Resume-->  [PLAYING]
[PLAYING]/[PAUSED] --Return to Editor-->  exitPlay() → dispose sim + director → [AUTHORING]
```

## Guarantees

- **No authored-state mutation**: the simulation is a fresh `createEngine` from `state.scene.serialize()`. `exitPlay()` calls `reset()`, which disposes `state.simulation`; the authored `state.scene` is never written. Verified byte-for-byte in the browser.
- **No duplicate listeners**: `enterPlay` adds, `exitPlay` removes, symmetrically (keydown, mousemove, pointerlockchange, fullscreenchange, resize, canvas click). Repeated Play→Stop→Play re-registers cleanly.
- **No duplicate render loops**: there is exactly one `requestAnimationFrame` loop (Studio's `frame`). Play Mode contributes only `frameHook()`, which reads the director and calls `viewport.directCamera` before the single `viewport.render()`.
- **Director lifecycle**: `director.dispose()` removes its registered `camera:director` system and clears listeners on every Stop; re-created on every Play. `viewport.directCamera(null)`/implicit (director gone → `directed=null`) returns the viewport to OrbitControls when exiting.
- **Fullscreen/pointer-lock teardown**: `exitFullscreen`/`exitPointerLock` are issued if held; the full-window CSS fallback is removed with `is-play`.

## Known residual

The System's `frame` loop runs a redundant `viewport.sync(...)` in an `else if(playMode.active)` branch that, combined with the primary `if(state.simulation)` branch, can sync twice while playing (once in the sim branch, once in the play branch). It is benign (idempotent entity sync) but noted as a cleanup candidate for the final polish pass.
