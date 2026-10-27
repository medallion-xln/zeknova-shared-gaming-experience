# H.264 Reference Encoder (ZGE-16.2 — Phase 1)

Status: **VERIFIED — FFmpeg libx264 Constrained Baseline, live-decoded in browser.**

This documents the CPU video encoder used for the real reference-media path. The
encoder is the H.264 codec applied to reference frames (test-pattern in Phase 2,
then real ZekNova frames in Phase 3); it is **not** the neural model and never
produces or claims generated video.

## Encoder

- **Tool**: FFmpeg 9.0.1 (`/opt/homebrew/bin/ffmpeg`), built with `--enable-libx264`.
- **Codec**: `libx264` (software, CPU).
- **Profile**: `baseline` (H.264 Constrained Baseline), `level 3.1`.
- **Pixel format**: `yuv420p` (browser interoperable; 4:2:0).
- **Rate control**: `-b:v 1200k`, `-preset veryfast`, `-tune zerolatency`.
- **GOP**: `-g 60` (2s at 30fps).
- **B-frames**: `-bf 0` (no B-frame dependencies — required for
  zero-latency browser decode and the future temporal-conditioning model).
- **Resolution**: 640×360 (Phase 2 control stream); 1280×720 for the ZekNova
  reference path where the source captures at that size.

## Verified capabilities

| Check | Result |
|---|---|
| Correct frame dimensions | 640×360 confirmed via browser `videoWidth`/`videoHeight` and decoded RTP |
| Frame rate | 30 fps measured (90 frames / 3001 ms), matching `rate=30` |
| YUV color conversion | RGBA→YUV420P handled by FFmpeg sws; decode path browser-compatible |
| Browser-compatible H.264 | `profile-level-id=42e01f` (Constrained Baseline L3.1), payload 108 |
| No B-frame dependencies | `-bf 0` enforced |
| Keyframe delivery / decoder startup | `keyFramesDecoded: 14`; first frame waits ≤ GOP (2s) for keyframe |
| Stream lifecycle | publish → online → read → teardown exercised |
| Encoder backpressure | TCP RTSP publish; MediaMTX remuxes oversize RTP (`1460 > 1440`) |

## Postulate

The encoder is the same one the upstream Matrix-Game uses in spirit
(`x264enc tune=zerolatency ... bframes=0`), applied here to ZekNova reference
frames rather than model output. This keeps the media pipeline identical while
the inference worker remains the only GPU-dependent stage.

## Custody

FFmpeg is an already-installed local tool; nothing new was installed for the
encoder itself. MediaMTX (the server) was downloaded to `/tmp/zge-mediamtx/` as a
non-persistent test binary (SHA256 `7d0d0c5c…cbf093`) per authorization; it is not
installed on PATH and is not a system service.
