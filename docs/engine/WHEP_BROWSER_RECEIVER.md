# WHEP Browser Receiver (ZGE-16.1 — Phase 3)

Status: **IMPLEMENTED + TESTED (signaling state machine) — media decode against
MediaMTX BLOCKED on local host.**

## What was built

`packages/neural-bridge/src/WHEPReceiver.js` — a source-owned WebRTC/WHEP client
for ZekNova fullscreen Play Mode. It implements the full WHEP negotiation
sequence and the lifecycle the receiver must honour:

- **Session connection**: `OPTIONS` (read `Link: rel="ice-server"` header) →
  create `RTCPeerConnection` with `recvonly` video+audio transceivers.
- **WHEP negotiation**: `POST` SDP offer (`application/sdp`) → expect `201` +
  `Location` → server `ANSWER`.
- **SDP exchange**: `setLocalDescription` → `setRemoteDescription`.
- **ICE candidate handling**: trickle-ICE (queue before `Location`, else `PATCH`
  with `application/trickle-ice-sdpfrag`, `If-Match: *`).
- **Stream attachment**: `ontrack` → `video.srcObject = stream` → `play()`.
- **Media playback errors**: `onconnectionstatechange` detects
  `failed`/`disconnected`.
- **Stream disconnect / restart**: exponential-free retry with a bounded pause,
  `DELETE` of the prior session URL.
- **Clean teardown**: `close()` closes the PC, clears the video `srcObject`, and
  cancels any pending restart.

It is written from the WHEP I-D and public MediaMTX WHEP-sink behaviour; it does
**not** copy upstream's MIT `mediamtx-reader.js`.

## Remote networking — the honest transport story

Upstream MediaMTX is configured **loopback-only** (`webrtcAddress: 127.0.0.1:8890`,
`webrtcAllowOrigins` restricted to loopback origins, ICE host `127.0.0.1`). A
remote browser cannot reach that WHEP endpoint as-is. The directory of options,
matching upstream's own constraints:

| Transport | Fits? | Notes |
|---|---|---|
| Loopback (same host) | yes | upstream default; not remote-capable |
| SSH TCP port-forward (`-L`) | **partial** | forwards WHEP *signaling* HTTP, but **not** WebRTC **UDP media** |
| ICE-TCP (`webrtcLocalTCPAddress`) | yes | MediaMTX already binds ICE-TCP on `127.0.0.1:8190`; use this for a tunnel that carries TCP media |
| TURN relay | yes | a private TURN server relays UDP/TCP media; introduces a relay hop |
| Private-network / VPN | yes | inline with `webrtcAdditionalHosts` to advertise the private address |

The binding rule: **do not expose unauthenticated media endpoints publicly**, and
carry media over a controlled private connection (SSH+ICE-TCP, TURN, or a private
network), not a public UDP port. Browser/CORS/origin restrictions: `webrtcAllowOrigins`
must list exactly the ZekNova web origin; the signaling page must be served over
HTTPS for `getUserMedia`-free receive-only WHEP but must match the MediaMTX allow
list (which defaults to `http://127.0.0.1:8025`).

## Test coverage

`packages/neural-bridge/test/whep-receiver.test.mjs` drives the receiver against a
**real local HTTP stub** and asserts the exact `OPTIONS → POST offer → PATCH
candidates` sequence, the ICE-server Link parsing, and candidate-fragment
generation. A browser fixture page confirms the client loads and negotiates with a
real `RTCPeerConnection`.

## What is NOT certified here

Full **media decode** of an H.264/RTP stream through WHEP requires MediaMTX (or an
equivalent WHEP server) plus the GPU host's GStreamer pipeline. No such service is
installed on the local machine (and none was installed, per the "no persistent
system services" constraint). That final hop is exercised on the authorized GPU
host during the `--reference-only` run (see `REMOTE_GPU_ACTIVATION_RUNBOOK.md`
§8). This is a **transport** client, not neural inference; a received stream is
never presented as generated video without a verified model session.
