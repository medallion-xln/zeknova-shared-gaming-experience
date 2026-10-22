# Neural Model Readiness (ZGE-01)

| State | Definition | Status | Evidence |
|---|---|---|---|
| **REFERENCE_READY** | Clean low-poly frames and metadata are produced correctly | **YES (browser-verified)** | `ReferenceRenderer.capture()` on the live WebGPU canvas: 1280×720 `rgba8`, 3,686,400 bytes, `zge.capture-metadata.v1` with camera pose/fov/near/far, sceneId, sessionId, consecutive frameIndex, simulationTime, discontinuity flags; 100 % non-black samples; 10.8–11.2 ms per capture; HUD excluded by construction (DOM HUD), in-scene overlays filtered. CPU preprocessing matches upstream geometry (7 tests). |
| **TRANSPORT_READY** | Frames can be sent to and received from a test service | **YES — against the ZGE loopback test double only** | `packages/neural-rendering/test/neural.test.mjs` "Matrix-Game 4 adapter…": health, start (reference mode), single-session 409, three ordered envelope round-trips with transformed frames, reset (new session id), stop, loopback enforcement, failure → native fallback. The test double implements upstream's HTTP control contract plus the **proposed** bridge endpoint; it is not upstream software. |
| **UPSTREAM_MODEL_VERIFIED** | Official Matrix-Game 4 inference works on a supported scene/hardware | **NO** | Development machine is macOS/Apple GPU (`detectLocalCapabilities`: no NVIDIA adapter; upstream has no MPS path). No weights downloaded. Requires a Linux + NVIDIA host (A100 80 GB or RTX 5090/5080/5070 Ti presets), Python 3.12, torch 2.12/CUDA 13.2, the castle/ancient-egypt/racing assets, and the upstream browser test suite (`tests/browser/test_browser.cjs`). |
| **ZEKNOVA_NEURAL_VERIFIED** | A ZekNova-specific model produces temporally stable, gameplay-usable output | **NO** | No ZekNova checkpoint exists. Requires a data plan (paired clean-reference/target renders at upstream cadence and resolution), training on upstream's MG4CF backbone or equivalent, and an evaluation protocol (temporal stability, latency, gameplay readability) before any claim. |

## Local hardware facts (measured in browser via `detectLocalCapabilities`)
WebGPU available; adapter vendor reported by Chrome as Apple; platform macOS → `upstreamInferenceHost.localPossible = false`; recommendation: run inference on a separate Linux/NVIDIA host reached through a loopback SSH tunnel, use NATIVE or the labelled MOCK backend locally.

## Known gaps before UPSTREAM_MODEL_VERIFIED can be attempted
1. Bridge service implementing the upstream game-IPC role fed by browser frames (see `MATRIX_GAME_4_INTEGRATION.md`).
2. WHEP/WebRTC receive path in the browser (upstream `mediamtx-reader.js`, MIT) — not implemented in ZGE-01.
3. Pixel-exact preprocessing parity with PIL/torchvision (fixtures from upstream `tests/`).
4. A test deployment of upstream `--reference-only` mode to validate transport against real software instead of the ZGE double.

## What must never be claimed from this milestone
60 FPS neural rendering; persistent world-model memory; compatibility of ZekNova captures with released weights; that the mock output is model output (it is labelled MOCK everywhere it appears).
