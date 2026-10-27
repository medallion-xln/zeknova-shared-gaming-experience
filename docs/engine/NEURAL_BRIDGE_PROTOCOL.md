# Neural Bridge Protocol (ZGE-16.1 — Phase 0 reconciliation)

Status: **RECONCILED AGAINST SOURCE — TOPOLOGY MISMATCH CONFIRMED**

This document records, before any code is written, the exact relationship between
ZekNova's neural-rendering boundary and the Matrix-Game 4 upstream transport, as
read from source at pinned commit `c7a88bfc039cd97695082484986e95b962390676`.

## 1. Upstream transport, as it actually is

Matrix-Game 4 is a **loopback-only, single-user, single-scene** service. The
Python service (`matrix_game/server/app.py`) is the sole owner of the whole
pipeline: it spawns a native C++ game child process, generates reference frames
*itself*, runs inference, and publishes encoded video. Everything below is
loopback-bound (`127.0.0.1`) and rejects non-loopback hosts at an HTTP
middleware `origin_guard`.

### 1.1 Native-game IPC (`matrix_game/server/game.py`)

A private `socket.socketpair()` between Python and the game child, framed by a
big-endian 8-byte header `HEADER = struct.Struct("!II")` (JSON-length,
pixel-length):

- **Hello handshake** (game → Python, first packet): JSON with
  `type="hello", schema=1, scene, width=1280, height=720, fps, first_chunk=1,
  chunk=4`, plus `frame_packets`, `capture_mode`, `continuous_pacing`, and
  optional `prompt`/`prompt_verified`. Payload empty. Python rejects any
  mismatch in the expected keys.
- **Credit pacing**: Python holds a `Semaphore(1)` and sends
  `{type:"request", frame_start:N}` to pull the next chunk.
- **Chunking**: the **first chunk is 1 frame**; every later chunk is **4 frames**
  (`count = 1 if received == 0 else 4`). Each frame is 1280×720×4 RGBA bytes and
  carries a per-frame state list (`states[i].frame`, `simulation_time`,
  `capture_monotonic`, `input_sequence`, …) that must match the frame indices
  exactly and satisfy `simulation_time ≈ (frame+1)/fps`.
- **Terminal packet**: `{type:"end", frame_start, reason}` (e.g. `defeated`).
- **Controls** (browser → Python → game over HTTP WebSocket, then
  `game.send({type:"controls", …})`) are length-prefixed `!II` packets with
  pixel length 0. Control validation is strict (finite axes, bounded look deltas
  ≤ 2000, ≤ 8 actions, integer `sequence < 2^53`).

### 1.2 Reference ingestion — does not exist for browser frames

`Session.produce()` reads the game's own frames and preprocesses them locally
(`matrix_game/server/reference_input.py`): RGBA → RGB (`Image.convert("RGB")`),
then `crop_and_resize(image, 480, 864)` to the model's 864×480, then
`frames_to_tensor` → `[3,H,W]` in `[-1,1]`. The model conditions on **this
prepared tensor**, not on raw browser pixels.

**There is no `POST /api/{id}/reference` or any equivalent that accepts reference
frames from a client.** The browser is a controls-only client. This is the
single most important fact driving the bridge design.

### 1.3 Model output transport (`matrix_game/server/transport/`)

Decoded RGB leaves the model and is packed through a **separate** `!II`
length-prefixed pipe (JSON + RGB24) into a **GI/GStreamer sidecar**
(`output.py`, `publisher.py`, `rtsp.py`):

- `WebRTCModelOutput` spawns `matrix_game.server.transport.publisher` as a child
  with an independent Python interpreter (`STUDIO_WEBRTC_PYTHON`), no ML imports.
- `RTSPPublisher` pushes I420 → `x264enc tune=zerolatency speed-preset=veryfast
  bframes=0 bitrate=1800` → `h264parse` → `rtspclientsink
  protocols=tcp` → `rtsp://127.0.0.1:8555/native-{generation_id}`.
- Per-frame metadata (game state + RTP timestamp + `capture_wall_ms` +
  `encoded_wall_ms`) flows back over the child's stdout as NDJSON; the server
  turns that into `webrtc_frames`/`stats` messages on the `/api/{id}/ws`
  control socket. The RTP timestamp is what the browser uses to *match* HUD/audio
  to a presented video frame.

### 1.4 MediaMTX / WHEP (`configs/mediamtx.yml`, `web/mediamtx-reader.js`)

- MediaMTX: RTSP listener `127.0.0.1:8555` (TCP only), WebRTC/WHEP listener
  `127.0.0.1:8890`, `webrtcAllowOrigins` restricts to the loopback web origins,
  `webrtcLocalTCPAddress: 127.0.0.1:8190`, ICE restricted to `127.0.0.1`. Only
  `native-{a-f0-9}{32}` paths are publish/readable.
- Browser WHEP client is `MediaMTXWebRTCReader`: `OPTIONS` (ICE server `Link`
  header) → `POST` SDP offer → `PATCH` trickle-ICE candidates → attaches
  `MediaStream` to a `<video>`, with playback (video frame) timestamps used to
  match HUD/audio via `requestVideoFrameCallback` and `rtpTimestamp`.

## 2. The existing ZekNova adapter, as it is

`packages/neural-rendering/src/MatrixGame4Adapter.js` correctly mirrors the
upstream **control** contract (`GET /api/status`, `POST /api/start`,
`POST /api/{id}/stop`, loopback-only) but is honest about the gap:

- It exposes `submitReference()` against a **proposed** `zge-reference-bridge/0`
  endpoint (`POST /api/{id}/reference`, header `X-ZGE-Bridge`), implemented only
  by the ZGE loopback test double, **not** by upstream.
- Its `capabilities()` returns `acceptsExternalReferenceFrames: false` and
  `bridgeIsUpstream: false`.

The ZGE `FramePreprocessor` (`packages/rendering/src/FramePreprocessor.js`)
matches upstream's crop/resize *geometry* exactly (scale → round → centre-crop;
`frames_to_tensor` normalisation), with the documented caveat that the resize is
a plain 2×2 bilinear rather than PIL's antialiased BILINEAR, so pixels are not
guaranteed bit-exact on downscales.

## 3. The incompatibility (recorded)

1. **Ingestion**: upstream conditions on *its own* native game frames. ZekNova
   must feed *browser-originated* clean reference frames. No upstream endpoint
   accepts them; a **bridge service** must be built on the Linux/NVIDIA host that
   speaks the upstream game-IPC role (hello/request/frame/end at 1280×720,
   1-then-4 frames per chunk, credit-paced) while receiving frames from the
   browser over a private channel. This is the `zge-reference-bridge/0` surface.
2. **Pixel timing**: upstream reads RGBA at 1280×720 and reformats internally.
   ZekNova captures 1280×720 RGBA on the browser (already verified) and can
   submit either RGBA or RGB; the bridge must not double-apply the crop/resize
   (see §4).
3. **Cross-language fidelity**: upstream `!II` framing exists in **both** the
   game IPC (RGBA) and the output pipe (RGB24). The ZGE JS envelope mirrors the
   `!II` shape and bounds, so a Python bridge can parse ZGE envelopes mapping
   directly to upstream `game._read()` / `output.write_all()` — but the two are
   distinct streams and must stay distinct.
4. **WHEP is loopback-only upstream**: MediaMTX `webrtcAddress: 127.0.0.1:8890`
   and `webrtcAllowOrigins` are fixed to loopback web origins. A remote browser
   cannot reach the WHEP endpoint or the ICE candidates without an explicit
   private transport design (Phase 3).

## 4. Bridge design decision

Build a **source-owned, CPU-compatible bridge** (`packages/neural-bridge/`) that:

- **Ingress (browser → bridge)**: receives ZekNova reference frames as
  `zge-reference-bridge/0` envelopes over the private channel (HTTP for the
  loopback certification path; WebSocket/WebRTC-data as the transport upgrade).
- **Validation**: uses the existing `FramePreprocessor`/`assertFrame` contracts
  to reject bad pixel format, wrong dimensions, oversized payloads, non-monotonic
  frame order, stale generations, session mismatch, corrupt frames, unsupported
  camera settings, and queue overflow.
- **Egress (bridge → model service, future GPU)**: exposes a strictly-scoped
  *adapter* that translates validated ZGE envelopes into upstream's game-IPC
  `!II` frame/chunk stream, so the only thing left for the GPU host is to run
  `Session.produce()` against that adapter in place of the native game. This is
  the **narrowly-scoped adapter** the directive requires — it does **not**
  rewrite the inference server, and it never claims compatibility from matching
  function names alone.

The loopback-only certification mode is labelled:

```
REFERENCE TRANSPORT TEST — NOT NEURAL INFERENCE
```

and never presents reference frames as generated video.
