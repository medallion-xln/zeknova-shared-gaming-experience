# ZekNova Engine — Neural Rendering Protocol (ZGE-01E)

Status: **implemented** (`packages/rendering`, `packages/neural-rendering`) with a functional **mock** backend and a loopback **test service**; **no model inference has run**. Readiness states are defined in `NEURAL_MODEL_READINESS.md`.

## Doctrine
`authoritative game engine → clean reference frame + metadata → (optional) neural renderer → bounded display publisher → presentation (HUD/audio follow the presented frame)`. The neural layer is presentation only: it never mutates world state, physics, input, persistence or multiplayer. Any failure, absence, lateness or inconsistency degrades to NATIVE presentation while the game continues (verified in browser: forced backend stall → NATIVE within 3.5 s, game unpaused, movement intact).

## Contracts (`packages/rendering/src/contracts.js`, `index.d.ts`)
```ts
interface RenderBackend       { id; initialize(ctx?); present(frame); status(); dispose() }
interface SceneCaptureBackend { capture(request?): Promise<SceneFrame>; resetSequence(sessionId?); status(); available() }
interface NeuralRenderBackend { id; mock: boolean; initialize(config); submit(sceneFrame); onFrame(cb): Unsubscribe; resetSession(reason); health(); dispose() }
```
Frame kinds are distinct: `SceneFrame.kind = "capture"` conditions a model; `RenderFrame.kind = "display"` is shown. Pixel formats: `rgba8` (capture), `rgb8` (model input). `assertFrame()` validates dimensions, format and byte length with exact messages.

## Capture metadata (`zge.capture-metadata.v1`)
Required: `sessionId`, `sceneId`, `frameIndex` (consecutive within a stream), `simulationTime`, `width/height`, `sourceWidth/sourceHeight`, `camera { id, position, quaternion, fov, aspect, near, far }`, `sceneRevision` (explicit authoring signal; `null` when the scene has none — child-count churn is deliberately **not** used), `discontinuity { reset, reasons[] }`, `inputProvenance` (nullable), `capturedAt`. Any additional conditioning data must be placed under `extensions` with its own `schema` id; the validator rejects unversioned extensions. **Nothing here is assumed to be accepted by Matrix-Game 4 as model conditioning** — upstream conditions on pixels (plus a fixed scene prompt and, for racing, optional captions).

## Reference capture (`ReferenceRenderer`)
Browser path: hide in-scene overlays (`CaptureFilter`: sprites, CSS2D/3D objects, helpers, `userData.hudOverlay/zkOverlay`, label/telegraph names) → one extra `renderer.render(scene, camera)` on the shared legacy WebGPU renderer → `createImageBitmap(canvas, { resizeWidth, resizeHeight })` → `OffscreenCanvas` 2D → `getImageData`. ZekNova's HUD is DOM, so the canvas is HUD-free by construction. Native-only mode never executes this path (zero readback cost when disabled). Measured in browser: 1280×720 RGBA capture **10.8–11.2 ms** on WebGPU (M-series Mac, Chrome 155), 56 ms for the first capture (context creation).

## Preprocessing (`FramePreprocessor`, CPU-testable)
Mirrors upstream `matrix_game/inference/preprocessing.py` (Apache-2.0, c7a88bfc): `scale = max(tw/w, th/h)`, rounded resize, rounded centre crop, `x·2/255−1` CHW tensor; shooter geometry 1280×720 → 864×486 → crop top 3 → 864×480. **Not bit-exact** with PIL's antialiased BILINEAR for downscales (plain 2×2 bilinear) — tracked gap. Also provides RGBA→RGB, pixel-format validation, synthetic fixtures and the length-prefixed envelope (`u32 jsonLen | u32 pixelLen | json | pixels`, upstream-style bounds 64 KB / 4×1280×720×4).

## Streaming behaviour (`NeuralRenderer`)
- **Ordered conditioning**: consecutive `frameIndex` per stream; the sequencer rejects session mismatches, unknown captures and stale frames.
- **Bounded queues**: display queue capacity 4, drop-oldest (upstream: four-slot decoded display queue). Only display frames are ever dropped; submitted capture frames are never reordered.
- **Backpressure**: when `inFlight ≥ maxInFlight` the orchestrator stops capturing and falls back to NATIVE presentation until the backend catches up (`recoverAfterFrames`). Documented divergence from upstream: upstream slows its single-user native game; ZekNova's authoritative loop and shared-world time are never slowed for one client's renderer.
- **Stall detection**: no generated frame within `stallTimeoutMs` while work is in flight → degraded → NATIVE.
- **Session resets**: finite frame budget (`sessionFrameBudget`, mirrors upstream's finite RoPE budget — new session, never wrap); hard discontinuities (`teleport`, `camera-cut`, `camera-switch`, `scene-change`) reset the backend session and start a new stream id (`<session>:g<n>`); pacing gaps are recorded but do not reset.
- **Presentation sync**: `neural:presented { sourceFrameIndex, simulationTime, latencyMs, presentedAt, mock, shown }` is emitted when a frame is actually shown, so HUD/audio can follow the presented frame (upstream matches HUD/audio on RTP presentation). ZekNova's legacy DOM HUD does not yet consume it.
- **Input** stays with the native game at all times.

## Session state machine (`RenderSession`)
`idle → starting → ready → streaming ⇄ degraded → resetting → ready; any → failed/stopped`; illegal transitions throw with the allowed set; budget exhaustion forces a reset.

## Presentation modes (`PresentationController`)
`NATIVE` (default, legacy renderer only) · `REFERENCE` (clean capture available for preview/diagnostics; native image shown) · `NEURAL` (generated frames on an overlay canvas). `NEURAL` requires a declared backend; a mock backend is only allowed with `allowMock` and is always labelled **"NEURAL (MOCK — not model inference)"** on screen and in status. Fallback records the reason.

## Backends
- `MockNeuralBackend` — functional test double: consumes real captures in order, applies a deterministic transform (RGBA→RGB → upstream crop/resize → posterise → EMA blend with previous output = genuine temporal state cleared by `resetSession` → frame-parity stripe) after a configurable latency; injects drops, stalls, failures. Model identity `zge-mock-temporal-ema`, `mock: true`.
- `MatrixGame4Adapter` — thin HTTP adapter for the upstream control contract (`/api/status`, `/api/start {mode: model|reference}`, `/api/{id}/stop`), loopback-only unless `allowRemote`, capability and model-compatibility declarations, latency measurement, reset = stop+start. Reference-frame submission uses the **proposed** `zge-reference-bridge/0` envelope endpoint, which upstream does **not** implement (see `MATRIX_GAME_4_INTEGRATION.md`).

## URL flags (development)
`?present=native|reference|neural`, `?neural=none|mock|matrix-game-4`, `?inference=http://127.0.0.1:8025`, `?captureFps=10`, `?mockLatency=60`, `?zge=overlay,probe`.

## ZGE-02 addendum — capture policy and performance
- **Re-render is mandatory**: a canvas snapshot taken outside the frame that drew it is black on WebGPU (measured: 100 % blank frames with the re-render skipped). `rerender` defaults to `always`; `auto` only skips when the drawing buffer is known preserved; `blankFrames` is counted as a guard.
- Profiles: `native` (1280×720, protocol fidelity) and `model-input` (GPU crop+resize to 864×480 in one `createImageBitmap` call; geometry equals upstream resize-then-crop; recorded in metadata extension `zge.capture-preprocess.v1`). Readback: `eager` (getImageData), `lazy` (GPU-resident ImageBitmap, `frame.pixels()` on demand), `videoframe` (WebCodecs; measured slower).
- Measured (20 captures while moving, WebGPU, 2400×1794 canvas): baseline 11.2 ms p50 (render 2.4 + readback 8.0), model-input eager 9.3 ms, lazy 2.9–3.4 ms. Native fps unaffected at 10 captures/s.
