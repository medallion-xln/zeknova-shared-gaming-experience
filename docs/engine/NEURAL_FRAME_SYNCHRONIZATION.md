# Neural Frame Synchronization (ZGE-16.1 — Phase 5)

Status: **DESIGNED + PARTIALLY IMPLEMENTED (transport-side timestamps present;
model-side pipeline timing blocked on inference).**

## Doctrine

HUD and audio live **outside** the neural model and must follow the *presented*
frame, not message arrival. The conventional engine remains the authority for
simulation time; the neural layer only decorates how a frame is displayed.

## The timestamp chain

Each reference frame carries, through `zge.capture-metadata.v1`, an identity tuple
usable for end-to-end latency measurement once inference exists:

| Field | Set by | Meaning | Availability |
|---|---|---|---|
| `frameIndex` | capture | source frame id (consecutive) | always (capture path) |
| `simulationTime` | capture | sim tick at capture | always |
| `capturedAt` | capture | wall clock at capture | always |
| `inputProvenance` | capture | which input produced this frame | nullable (privacy-safe) |
| **preprocessed-at** | bridge/frame preprocessor | when crop/resize ran | CPU-compatible today |
| **queue-entry** | bridge | ingestion queue enqueue time | CPU-compatible today |
| `generatedFrameId` / `generatedAt` | model service | generated frame identity | **BLOCKED** (no inference) |
| `encodeTimestamp` / `encoded_wall_ms` | GStreamer sidecar | encode completion | CPU-compatible (future host) |
| `rtpTimestamp` | RTP payloader | media RTP timestamp | CPU-compatible (future host) |
| `mediaReceivedAt` | WHEP receiver | decoded frame arrival | transport testable |
| `presentedAt` | browser presenter | video frame presented | transport testable |

## Availability flags

Because genuine model-side timing does not yet exist, every stage uses an explicit
**availability flag** rather than implying a value:

- `modelGenerated = false` whenever no verified model session produced the frame.
- `encodeTimestamp` and `rtpTimestamp` are only populated when a real encoder ran
  (not in the in-process loopback, which has no encoder).
- The upstream metadata sidechannel (`webrtc_frames` records carrying
  `rtp_timestamp`) is **not** available end-to-end until the Linux/NVIDIA host's
  GStreamer/MediaMTX stack runs. The bridge records only what it has: capture,
  preprocessing, and queue timestamps.

## Bounded policy for stale frames, resets, lost transport

- **Stale**: the existing `FrameSequencer`/`NeuralRenderer` drops out-of-order and
  duplicate generated frames, and only ever presents monotonically increasing
  frames. A stale reference frame is rejected at ingest (`NON_MONOTONIC`).
- **Session resets**: hard discontinuities (teleport / camera-cut / camera-switch
  / scene-change / finite frame budget) reset the backend session and start a new
  stream generation; stale generations are rejected.
- **Lost transport**: no generated frame within `stallTimeoutMs` → degrade to
  native; finite reconnect budget; never silently show old reference frames as
  authoritative gameplay.

## The honest HUD-alignment limitation

Frame-level identity cannot be *guaranteed* through **encoded media alone**, because
H.264/RTP in the upstream transport relates display frames to game state only via
the out-of-band RTP timestamp → game-state map emitted on the control socket
(`matrix_game/server/app.py` `metadata`/`webrtc_frames`). That map:

- is matched **approximately** in the upstream browser (`requestVideoFrameCallback`
  + last-known RTP timestamp, so a decoded frame is matched to the nearest declared
  game frame, not a bit-accurate index);
- requires the side channel and is not available in the CPU loopback.

ZGE-16 reports this limitation explicitly (as the directive requires) rather than
claiming exact HUD alignment. The design is a **synchronized side channel**:
presentation metadata travels with the encoded frame's declared game index, so HUD
aligns to the *presented* frame's simulation time, one game frame of tolerance, only
after a real encoder + side channel exist. Exact frame-level identity through media
alone is out of scope and is flagged as such in `ZGE_16_1_IMPLEMENTATION_REPORT.md`.
