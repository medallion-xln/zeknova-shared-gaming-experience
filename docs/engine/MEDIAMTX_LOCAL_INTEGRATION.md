# MediaMTX Local Integration (ZGE-16.2 — Phase 1)

Status: **VERIFIED — loopback-only MediaMTX v1.21.2 serving RTSP→WHEP/WebRTC.**

## What was installed (non-persistent, authorized)

- **MediaMTX v1.21.2** `darwin_arm64`, downloaded to `/tmp/zge-mediamtx/` only.
- Integrity verified against `checksums.sha256`: `7d0d0c5c11527cbd10bde1c3d728864eb0334a9b653566cd73c0259750cbf093`.
- Not placed on PATH, no launchd/systemd unit, no startup script — it is a
  test-only child process owned and terminated by this milestone.

## Loopback configuration

`/tmp/zge-mediamtx/run/mediamtx-loopback.yml` (not in the repo, per "keep large
binary/test state outside Git"):

| Listener | Binding | Purpose |
|---|---|---|
| RTSP | `127.0.0.1:8554` (TCP-only) | FFmpeg publisher (reference frames) |
| WebRTC / WHEP | `127.0.0.1:8889` | browser receiver |
| ICE (TCP alternate) | `127.0.0.1:8189` | SSH/ICE-TCP tunnel media (no public UDP) |

Disabled: RTMP, HLS, SRT, MoQ, API, metrics, playback. Origins restricted to
`http://127.0.0.1:8790` and `http://localhost:8790`.

Declared path `native-reference` (`source: publisher`) is what FFmpeg publishes to
and the WHEP receiver reads.

## Publishing

```
ffmpeg -re -f lavfi -i testsrc2=size=640x360:rate=30 \
  -c:v libx264 -profile:v baseline -level 3.1 -pix_fmt yuv420p \
  -preset veryfast -tune zerolatency -b:v 1200k -g 60 -bf 0 \
  -f rtsp -rtsp_transport tcp rtsp://127.0.0.1:8554/native-reference
```

MediaMTX confirmed: `[path native-reference] stream is available and online, 1
track (H264)` and `is publishing to path 'native-reference'`.

## Reading (WHEP)

- OPTIONS `http://127.0.0.1:8889/native-reference/whep` → `204` with
  `Accept-Post: application/sdp` and CORS `Access-Control-Allow-Origin` for the
  configured origin.
- The existing `WHEPReceiver` negotiates POST offer → answer → ICE → track attach
  against this server with a real `RTCPeerConnection`.

## Note on version drift

MediaMTX v1.21.2 changed the `paths:` schema (no `publish`/`read` booleans; paths
must be declared with `source: publisher`) and deprecated `protocols` in favour of
`rtspTransports`. These were reconciled here and are the binding facts for any
future re-run.
