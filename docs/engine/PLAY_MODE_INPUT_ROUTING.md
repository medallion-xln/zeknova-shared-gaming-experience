# Play Mode Input Routing

## Policy

Editor input and gameplay input are separated by **scope**, not by mode flags:

- **Editor** (Studio) owns global `keydown` for transform/undo/delete, driven by `state.selection`, and runs continuously. It ignores input while typing (`INPUT`/`SELECT`/`TEXTAREA`) and always routes movement into `state.input`.
- **Play Mode** installs its own `keydown`/`mousemove` handlers on `enterPlay` and removes them on `exitPlay`. Its `keydown` re-guards against `INPUT`/`TEXTAREA`/`SELECT`, so camera keys never fire while the user is typing into a focused field.

This centralized split is what guarantees the two constraints called out in the milestone:

1. **Camera switching while walking** — WASD flows through `state.input` → the move rule; `1/2/3/C` is handled locally by Play Mode's `onKeyDown` and only calls `director.setMode`, which is presentation-only. The two never cross.
2. **Camera keys in a UI field** — both layers early-return on editable tags, so typing `2` into an input never changes the camera.

## Pointer lock

- Acquired on the **first canvas click** in Play Mode (a trusted user gesture), released on Return-to-Editor or Escape-from-lock.
- `pointerlockchange` resets `lookYaw`/`lookPitch` on unlock; `mousemove` only applies deltas while lock is held (checking `document.pointerLockElement === canvas`).

## Remaining gap (Phase 7)

Movement is **world-axis**, not camera-relative: the SDK `move` rule resolves WASD as `[±dt·speed, 0, ±dt·speed]` in fixed coordinates. Rotating the input vector by the current camera yaw is the open item, documented in `ZGE_15_IMPLEMENTATION_REPORT.md` §5 and deliberately not implied.
