# Neural Inference Hardware & Feasibility Report (ZGE-16)

Status: **RESEARCH COMPLETE — INFERENCE GATE = BLOCKED_HARDWARE**

This report is the Phase 0 / Phase 1 deliverable for ZGE-16 "Real-Time Neural
Video Rendering — Matrix-Game 4.0 Integration for ZekNova AI Game Engine." It
records the supported runtime surface, the hardware blocker on the current
development machine, the split architecture that is required, the download
footprint, and everything that must remain gated on explicit authorization.

## 1. What Matrix-Game 4.0 actually requires

Matrix-Game 4.0 (Skywork AI) is a causal few-step video model that renders
successive video chunks conditioned on *low-poly RGB* and text prompts, while an
executable game engine owns physics, input, gameplay and world state. The release
provides three scene-specialised checkpoints — Medieval Castle (`fps-castle`),
Ancient Egypt (`fps-egypt`), and City Racing (`driving_game`).

Inference runtime (authoritative, from upstream `Matrix-Game-4/README.md`):

| Requirement | Detail |
|---|---|
| OS | **Linux** only (model inference) |
| Accelerator | **NVIDIA GPU** (A100-80GB, RTX 5090, RTX 5080, RTX 5070 Ti) |
| Python | 3.12 |
| PyTorch / CUDA | torch 2.12.0 + CUDA 13.2 (A100); matching presets for RTX parts |
| Optimized backends | ring/fused DiT, CUDA graphs, optional SageAttention (2.2.0, patched) |
| Model throughput | ~38–67 FPS at 864×480 (steady state, **excluding** video I/O) depending on GPU |
| Browser client | Safari/Chrome; **no GPU needed on the client** (receives H264/WHEP) |
| Native game / recorder | macOS or Linux, CMake C++20, SDL2, FFmpeg (standalone, no model) |

There is **no MPS (Apple Silicon), CPU, or macOS inference path** for the model.
The macOS build only runs the standalone native game/recorder; it cannot run the
video model.

## 2. Hardware blocker on this machine

The development machine is a **MacBook Pro with Apple Silicon (M1 Pro class)**,
running macOS, with no discrete NVIDIA GPU and no CUDA. Measured/concluded:

- `nvidia-smi` absent; no CUDA runtime.
- No NVIDIA/CUDA device enumerable by PyTorch (torch not installed).
- WebGPU `adapter` vendor reported as **Apple** (from `detectLocalCapabilities`);
  upstream's browser-facing *game* runs here, but the *inference host* cannot.

Real Matrix-Game 4.0 CUDA inference is therefore **BLOCKED_HARDWARE** on this
development machine. This is not a workaround gap or a missing dependency; it is
a platform mismatch. The directive is explicit: when GPU access is unavailable,
continue all CPU-compatible integration work and report the inference gate as
`BLOCKED_HARDWARE`, **without fabricating model outputs**.

## 3. Required split architecture

Per the Phase 1 directive, a split architecture is the correct design regardless
of whether a local GPU exists, because ZekNova is a browser game and upstream's
inference host feeds the model from a **native process** over a private
`socketpair`, with no endpoint that accepts frames from a browser. The required
shape (already documented for the ZGE-01 boundary in
`MATRIX_GAME_4_INTEGRATION.md`):

```
Local Studio (browser / ZekNova SDK)
   └─captures clean low-poly reference frames + zge.capture-metadata.v1──┐
                                            controlled private connection │
                                            (SSH loopback tunnel, not a  ▼
                                             public unauthenticated port) ┌───────────────────────────┐
                                 │                                          │ Isolated Linux host       │
                                 │                                          │  NVIDIA GPU               │
                                 │                                          │  Python 3.12 + torch/CUDA │
                                 │                                          │  model weights + assets   │
                                 │   reference frames + controls ──────────►│  bridge (game-IPC role)   │
                                 │   H264 / WHEP video ◄────────────────────┘  Matrix-Game 4 inference  │
                                 ▼                                          └───────────────────────────┘
                          Local browser
                          (received video presented; HUD/audio follow presented frame)
```

Key security invariants (carried from ZGE-01, restated here):

- **Loopback by default.** HTTP/RTSP/WebRTC bind to 127.0.0.1. No public,
  unauthenticated inference server, ever.
- **Private controlled connection.** If a remote host is used, it is reached
  through an authenticated SSH tunnel — not an exposed port.
- **No credentials or session IDs** in model prompt text.
- **Neural layer is presentation-only.** No neural output may rewrite physics,
  gameplay state, or persistence (the ZGE-15 camera director already follows the
  same single-writer rule; the model is a consumer of clean frames, never a
  writer of world state).

## 4. Download footprint (weights + assets), from the pinned manifests

Pinned upstream revision: **`c7a88bfc039cd97695082484986e95b962390676`** (repo),
model/asset revision **`2c53100457da7abcf0e966f75637c644d3423a63`**, base-model
revision **`b8bc1a65ab71d054ba4636dc0dac104aa4df2686`**.

Shared model components (downloaded once, from `releases/models.json` +
`alibaba-pai/Wan2.2-Fun-5B-Control`):

| Artifact | Size |
|---|---|
| `models_t5_umt5-xxl-enc-bf16.pth` (umT5-XXL text encoder) | **11.36 GB** |
| `Wan2.2_VAE.pth` (Wan VAE codec) | **2.82 GB** |
| `taew2_2.pth` (TAEHV fast codec) | ~22.9 MB |
| tokenizer files (`umt5-xxl`) | ~21.3 MB |

Per-scene DiT checkpoint (`model.safetensors`), each ~**10.0 GB**:

| Scene | Weights | sink.png | assets (game) |
|---|---|---|---|
| Castle | 10.0 GB | 1.75 MB | ~6.5 MB map + shooter assets |
| Ancient Egypt | 10.0 GB | 1.49 MB | ~88.8 MB map + shooter assets |
| Racing | 10.0 GB | 1.22 MB | ~52.9 MB city/audio |

**Total per scene ≈ ~24 GB** (shared 14.2 GB + one checkpoint + scene assets);
all three scenes ≈ ~44 GB. Hub cache adds roughly a second copy unless the
downloaded files are consumed in place. **This is multi-gigabyte in every
sense of the directive.** These files are **not** present locally and **not**
downloaded — see §5.

## 5. Authorization gates (all currently HELD)

The following are **not done** as of this report, and will only be done with
explicit authorization:

- ❌ No model weights / game assets / PyTorch / CUDA downloaded (multi-GB).
- ❌ No paid GPU instance provisioned.
- ❌ No persistent system service installed (MediaMTX, GStreamer, systemd units).
- ❌ No public/unauthenticated inference server exposed.
- ❌ No remote infrastructure provisioned.

CPU-compatible work **is** unblocked and continues: the browser-side capture /
preprocessing / reference-frame pipeline, the streaming contract, the labelled
mock, the bridge envelope, and documentation. That is the ZGE-01 work already
extended, and it does not require a GPU.

## 6. What remains to unblock real inference

1. An authorized **Linux + NVIDIA host** (A100-80GB or RTX 5090/5080/5070 Ti).
2. Authorized **download** of shared model components + at least one scene
   checkpoint (~24 GB for one scene).
3. A **bridge service** on that host implementing the upstream game-IPC role,
   fed by ZekNova reference frames over the private connection (the topology
   mismatch documented in ZGE-01).
4. A **WHEP/WebRTC receive path** in the browser.
5. A ZekNova-specific scene checkpoint (the released weights are trained on their
   own three scenes; ZekNova's third-person canvas is outside that distribution)
   — a training/data plan, not covered by this milestone.

Until then the neural certification levels that require genuine model inference
are reported **BLOCKED**, and the native renderer remains the source of truth for
what the player sees.
