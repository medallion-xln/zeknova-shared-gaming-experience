# Matrix-Game 4 Integration Report (ZGE-01)

## Upstream examined
| Item | Value |
|---|---|
| Repository | https://github.com/SkyworkAI/Matrix-Game (`--depth 1` checkout in `/tmp/matrix-game-upstream`, outside ZekNova) |
| Commit | `c7a88bfc039cd97695082484986e95b962390676` — 2026-10-16 "Document RTX 5080 and 5070 Ti support…" |
| Subproject | `Matrix-Game-4/` (`docs/architecture.md`, `README.md`, `docs/online.md`, `docs/offline.md`, `docs/installation.md`, `docs/testing.md`, `matrix_game/server/{app,game,reference_input}.py`, `matrix_game/inference/preprocessing.py`, `matrix_game/server/transport/output.py`) |
| License | Root repo MIT; `Matrix-Game-4/LICENSE` **Apache-2.0** with `NOTICE` and `THIRD_PARTY_NOTICES.md` (MG4CF/Wan Apache-2.0, TAEHV MIT, MediaMTX reader MIT, Jolt MIT, Recast zlib, DirectXMath, stb, nlohmann/json; audio CC0/CC-BY). Model weights and game assets are distributed separately on Hugging Face with their own terms. |
| Not downloaded | No model weights, no game assets, no PyTorch/CUDA. Nothing from the upstream tree was copied into ZekNova. |

## What upstream actually is
- Pipeline: `native game → clean RGB + frame metadata → causal renderer → bounded display publisher → WebRTC → presented-frame HUD/audio`.
- The **server owns the game**: `CastleGame` spawns the native C++ shooter (`bin/CastleReferenceServer`) and reads frames over a private `socketpair` IPC (`!II` header: JSON length + pixel bytes; hello handshake `schema=1, scene, 1280×720, fps, first_chunk=1, chunk=4`; credit-based one-chunk lookahead; bounded packets 64 KB / 4×1280×720×4). The browser only sends controls (strict validation: axes, buttons, sequence, weapon, ≤8 actions) over `GET /api/{id}/ws` and receives video via WHEP.
- HTTP control: loopback-only origin guard, JSON-only POST ≤16 KB; `GET /api/status`, `POST /api/start {mode: model|reference, monitor}` → `{id, fps, whep}`, `POST /api/{id}/stop`. One session per service. `--reference-only` runs the transport with no model.
- Model: Wan2.2-5B latent space, one latent per 4 frames, fixed sink image per scene, fixed prompt, CFG 1, bounded 21-latent KV cache, finite RoPE budget (8192 chunks → new session). **No automatic cache reset, no retrieved memory, no persistent world memory.** Scene-specialised checkpoints only: Medieval Castle, Ancient Egypt, City Racing.
- Preprocessing: 1280×720 RGBA → RGB → bilinear resize + centre crop to 864×480 (`crop_and_resize`), tensor `x·2/255−1`.
- Display: only decoded display frames may be dropped (four-slot queue); HUD/audio matched to the presented RTP frame.
- Hardware: Linux + NVIDIA (A100 80 GB; RTX 5090/5080/5070 Ti presets, up to 67 FPS at 864×480 on RTX 5080 with SageAttention, excluding video I/O), Python 3.12, torch 2.12 + CUDA 13.2. macOS: standalone game/recorder only; no MPS inference path. Client needs no GPU.

## Boundary: inspiration vs adapted vs original
| Category | Content |
|---|---|
| **Inspiration (no code copied)** | separation of executable game / clean reference / neural display; capture-vs-display frame distinction; bounded display queue (4 slots, drop display only); consecutive frame indices; session budget → new session; HUD/audio follow presented frame; loopback-only service; single-session rule; reference-only transport check |
| **Adapted (re-implemented in JS from reading upstream, attributed in source comments)** | `crop_and_resize` geometry and `frames_to_tensor` normalisation (`packages/rendering/src/FramePreprocessor.js`); the `!II` length-prefixed envelope shape and size bounds (`encodeFrameEnvelope/decodeFrameEnvelope`); the HTTP control contract (`packages/neural-rendering/src/MatrixGame4Adapter.js`, `test/fakeInferenceService.mjs`). These are small interface shapes, documented as derived from Apache-2.0 upstream at commit c7a88bfc. |
| **Original ZekNova Engine code** | kernel (`@zge/core`), compat plugin, `ReferenceRenderer`/`CaptureFilter`, `NeuralRenderer` orchestrator, `FrameSequencer`, `RenderSession`, `PresentationController`, `MockNeuralBackend`, `CanvasPresenter`, dev panel, all tests |

## The topology mismatch (most important finding)
Upstream feeds the model from a **local native process** over IPC; it has **no endpoint that accepts reference frames from a browser**. ZekNova is a browser game. A real integration therefore needs a **bridge service on the Linux/NVIDIA host** that speaks the upstream game IPC role (hello/request/frame/end packets at 1280×720, 1 then 4 frames per chunk, credit-paced) while receiving frames from the browser (WebSocket/WebRTC data), and returns generated video (WHEP). The ZGE adapter targets that bridge through a proposed `zge-reference-bridge/0` envelope endpoint, verified only against the ZGE loopback test double. Round-trip latency of browser → bridge → model → WHEP → browser will add to upstream's own reference-collection + inference + queue + display latency; upstream itself reports that physical network latency and browser buffering cannot be eliminated.

## Model specialisation
Released checkpoints are trained on their own low-poly scenes. ZekNova's art direction, camera (third-person explore camera, not an FPS), HUD-free canvas content and 1200×897-class viewports are outside that distribution. **Arbitrary ZekNova captures are not compatible with the released weights.** A ZekNova model requires a data-collection (clean reference + paired target renders), training and evaluation plan that this milestone does not attempt.

## Security posture carried over
Loopback by default (`allowRemote` must be explicit); never expose the upstream demo publicly; no credentials in the browser; mock always labelled; inference endpoint configured per page (`?inference=`), never hard-coded.

## Verified in ZGE-01
See `NEURAL_MODEL_READINESS.md`: **REFERENCE_READY = yes**, **TRANSPORT_READY = yes (against the ZGE test double only)**, **UPSTREAM_MODEL_VERIFIED = no**, **ZEKNOVA_NEURAL_VERIFIED = no**.
