# Reference Ingestion Certification (ZGE-16.1 — Phase 1)

Status: **COMPLETE — CPU-compatible reference-frame ingestion bridge, tested.**

## What was built

`packages/neural-bridge/` — a source-owned, CPU-compatible ingestion boundary
between ZekNova's clean reference frames and the Matrix-Game 4 conditioning
boundary. It contains no model, no GPU dependency, and no gameplay authority.

- `src/protocol.js` — the `zge-reference-bridge/0` validation contract: schema/
  id checks, pixel-format and dimension checks, payload-size and integrity
  checks, monotonic-order / session-identity / stale-generation checks,
  unsupported-camera checks, and a stable `INGEST_ERROR` code table.
- `src/ReferenceIngestBridge.js` — stateful ingestion: a bounded queue with an
  explicit drop/reject overflow policy, generation tracking, and Matrix-Game-4
  chunk-boundary framing (first chunk = 1 frame, later chunks = 4).
- `src/LoopbackTransport.js` — an in-process loopback HTTP transport that carries
  real frame bytes through the ingest pipe and back, loopback-only, with every
  frame stamped `REFERENCE TRANSPORT TEST — NOT NEURAL INFERENCE`.

## Required inputs honoured

Frame ID, capture timestamp, simulation tick, camera mode, camera pose and
projection, source dimensions, RGB payload, session generation, and
privacy-safe provenance — all flow through `zge.capture-metadata.v1` and are
validated by `validateMetadata` / `validateCameraSettings`.

## Validation coverage (all tested in `packages/neural-bridge/test/`)

| Requirement | Behaviour | Test |
|---|---|---|
| Pixel format | rejects non-`rgba8`/non-`rgb8` | ✓ |
| Frame dimensions | rejects non-canonical 1280×720 capture | ✓ |
| Maximum payload size | rejects oversized pixel buffers | ✓ |
| Monotonic frame order | rejects `frameIndex < expected` | ✓ |
| Session identity | rejects a mismatch vs the active session | ✓ |
| Stale generations | rejects a frame from a superseded generation | ✓ |
| Corrupt frames | rejects truncated/malformed pixel buffers | ✓ |
| Unsupported camera settings | rejects missing camera id / non-finite pose | ✓ |
| Queue overflow | bounded drop/reject policies, counted | ✓ |

## The honest boundary

Every loopback output is labelled `REFERENCE TRANSPORT TEST — NOT NEURAL
INFERENCE` (in the health payload, the accept payload, an `X-ZGE-Transport-Test`
header, and the stats object). `isNeuralInference` is always `false`. Passing a
reference frame is "valid conditioning input", never "model output", and the
loopback mode never presents reference frames as generated video.

## What this does NOT certify

This certifies **transport** (ingestion, validation, framing, backpressure,
ordering) against real frame bytes. It does **not** run model inference, and it
does not satisfy the ZGE-16 neural certification Levels 1–4, which remain
`BLOCKED` on authorized GPU execution (see
`NEURAL_INFERENCE_HARDWARE.md`).
