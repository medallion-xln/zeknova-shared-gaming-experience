# Fullscreen Game HUD

A minimal overlay (`#play-hud`, `examples/studio/studio.css`) shown only while `body.is-play`.

## Regions

- **Top-left** — camera selector: `1 Isometric`, `2 Shoulder`, `3 Third`, `C Cycle` (buttons drive `director.setMode`).
- **Top-center** — objective/resource line (`data-hud-objective`), derived from the followed entity's `state` component (`cells`, `built`) and the `objective` entity's `complete` flag. Generic — no hard-coded world strings.
- **Top-right** — Pause and Return to Editor.
- **Bottom** — current camera mode (`data-hud-camera`) + a hint line.
- **Pause dialog** — a `<dialog>` with Resume / Return to Editor, shown via `showModal()` (renders a native dimming backdrop).

## Accessibility

- The objective line is `role="status"` for assistive-technology awareness.
- Buttons are real `<button>` elements with visible focus (inherits the Studio `:focus-visible` outline) and `aria-label`s.
- The HUD is `pointer-events:none` with controls re-enabled selectively, so it never blocks gameplay click/canvas interaction.

## HUD updates

`refreshHUD()` runs each frame from `frameHook()` and on mode switch. It reads live scene state, so resource counts and objective text advance as gameplay progresses.
