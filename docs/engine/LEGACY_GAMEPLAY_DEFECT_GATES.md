# Legacy gameplay defect gates — ZGE-13

**Each ZGE-12 priority defect is reproduced with real browser input, classified by source ownership, and assigned a safe fix boundary. Original generated-bundle authority is unchanged.**

The original game still runs as a generated minified runtime whose buildable source is not available. Where a defect is correctable through readable, owned UI code or an existing supported interface it is fixed and regression-tested; where it would require modifying an unverifiable legacy writer, the limitation is documented and authority left unchanged.

Harness: `scripts/zge13-defects.mjs` (targeted branch details in `scripts/zge13-gameplay.mjs`). All runs use a fresh local synthetic profile, isolated filesystem saves, real physical mouse/keyboard input, and the real `/api/session.php` + `/api/save.php` endpoints. No game-state or prototype mutation.

## 1. Construction clipping

- **Repro**: launch → gameplay-ready → inspect constructed viewport.
- **Expected**: construction canvas fully visible within the viewport with no horizontal scroll.
- **Actual**: canvas `getBoundingClientRect` at 1440×1000 spans `x:0..1440, y:0..1000`, `scroll:0` — the construction viewport fills the window with no overflow.
- **Source ownership**: owned `ui/` layout + `src/game/` viewport sizing; not the minified writer.
- **Severity / consequence**: visual only; P1 layout that ZGE-12 flagged. Persistence unaffected.
- **Fix boundary**: readable UI/viewport code.
- **Status**: **PASS** — no clipping at the tested resolutions in both WebGPU and WebGL-safe modes.

## 2. Modal input interception

- **Repro**: open the diplomacy panel → press movement keys → close.
- **Expected**: the dialog owns keyboard focus; movement keys must not drive the world while the modal is open.
- **Actual**: `modal.focus` resolves to a `<button data-diplomacy=…>`; player `position` is **unchanged** while the modal is open (movement blocked), then resumes after close.
- **Source ownership**: owned `mode/room` dialog + input guards (`LegacyInteractionGuards`); not the writer.
- **Status**: **PASS** — modal input isolation verified with real physical keys.

## 3. Save-ID mismatch

- **Repro**: submit a save, force the response to be lost after a real commit, observe the retry.
- **Expected**: the retried save reuses the same persistent operation ID; no new/duplicate state row.
- **Actual**: first POST returns `ok:true`, `duplicate:false`, `operationId:"zge-…-demo-cfb4cbe08d0d6aa1…"`; after routing `abort('failed')`, the outbox retry replays the **same** `operationId`; server returns `duplicate:true` and does not redeploy state.
- **Source ownership**: `packages/persistence/src/SaveTransport.js` (`zge.staging.pending.v2` keyed by `[worldId, playerId]`).
- **Status**: **PASS** — stable persisted save-ID across lost-ACK retry (unit: `packages/persistence/test/zge13.test.mjs` "lost reply, beacon and restored outbox share one persisted save intent ID").

## 4. Authentication-related save / recovery

- **Repro**: revoke the session (`DELETE /api/session.php`) → attempt save → observe auth-expired recovery → log back in → retry.
- **Expected**: same-page, visible recovery without a hard reload; save completes after re-auth.
- **Actual**: after logout the save shows auth-expired; `#zge-save-recovery` prompts *"Save paused. Sign in again as the same player in another tab, then retry here"*; after `POST /api/session.php` re-login and retry, `ZGE.persistence().state === 'saved'`.
- **Source ownership**: owned `AuthRecoveryUI` + SaveTransport; the session endpoint is the existing owned PHP API.
- **Status**: **PASS** — visible same-page auth recovery.

## 5. Mission / campaign verification

- **Scope**: staged QA encounters only; natural full campaign remains partial.
- **Actual**: mission 6 “wetlands broodwarden” health 1207→1108; mission 12 “arctic white screecher” health 3078→2602.5, both via real weapon/ability input, no direct damage API. Launch/movement/combat/render-fallback pass in `webgpu`, `webgl-safe`, and `neural-fallback` modes; 19 fresh save ACKs, 0 uncaught errors.
- **Status**: **PARTIAL** — bounded smoke + staged boss fixtures; natural 12-mission/rank/campaign completion remains uncertified (see the report's `ORIGINAL_GAME_PLAYABILITY`).

## Classifications retained

`construction-clipping` = owned-UI fix (fixed); `modal-input` = owned-input-guard (fixed); `save-id` = owned-transport (fixed); `auth-recovery` = owned-UI + owned PHP session (fixed); `full-campaign` = unverifiable legacy writer for natural progression (NOT declared fixed; authority unchanged).
