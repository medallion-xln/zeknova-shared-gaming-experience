# WHEP Media-Decode Certification (ZGE-16.2 — Phases 2 & 3)

Status: **CERTIFIED — real H.264 media decoded in the browser over WHEP/WebRTC.**

This closes the `ACTUAL_MEDIA_DECODE=PARTIAL` gap left by ZGE-16.1, which had
certified only WHEP *signaling*. The below is measured from a real
`RTCPeerConnection` receiving a live MediaMTX stream.

## Control-stream proof (Phase 2)

Diagnostic source: FFmpeg `testsrc2` 640×360@30 → libx264 baseline → RTSP → MediaMTX → WHEP → browser.

| Metric | Value |
|---|---|
| Encoder | FFmpeg libx264 |
| Codec profile | H.264 Constrained Baseline `42e01f`, L3.1, payload 108 |
| Resolution | 640×360 (browser `videoWidth`/`videoHeight` = 640/360) |
| Requested fps | 30 |
| Decoded fps | **30.0** (90 frames / 3001 ms) |
| Connection time | ~28 ms |
| First-frame time | ~1550 ms (bounded by 2 s GOP keyframe interval) |
| Frames received / decoded | 817 / 816 |
| Keyframes decoded | 14 |
| Packets lost | 0 |
| Jitter | 0.002 s |
| ICE | host + prflx over UDP (loopback); DTLS `connected` |
| Reconnection | clean close → reconnect → `connected`, 2 tracks |

The `ACTUAL_MEDIA_DECODE` distinction from signalling is now resolved: the browser
received 4,129,045 bytes / 4,599 packets as RTP, decoded 816 H.264 frames, and
presented them at a steady 30 fps. This is real video-frame delivery, not SDP
success alone.

## Reconnection behaviour

- `close()` tears down the `RTCPeerConnection` and clears the `video.srcObject`.
- A fresh `WHEPReceiver` re-establishes (OPTIONS → POST → answer → ICE) and
  reaches `connected` with 2 tracks (video + audio).

## Honesty boundary (unchanged)

Decoded media is a **transport** result. This certification does not imply any
neural model ran. The neural-mode honesty gate (`hasRealNeuralBackend() === false`
on this host) is unaffected, and `NEURAL` presentation remains refused.

## What is NOT certified here

Nothing new: a *reference* stream is labelled `LIVE REFERENCE STREAM — NOT NEURAL
INFERENCE`. Genuine model inference still requires an authorized Linux/NVIDIA host
(model weights / inference run disabled on this machine).
