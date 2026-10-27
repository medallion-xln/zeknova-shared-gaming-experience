# Remote GPU Activation Runbook (ZGE-16.1 — Phase 7)

Status: **PREPARED — NOT EXECUTED.** No GPU was provisioned; no weights were
downloaded; no persistent service was installed; no paid resource was created.
This runbook is the operator-controlled package for the *future* authorized GPU
stage, and is intentionally not auto-run.

## Why this exists

Real Matrix-Game 4 inference requires Linux + NVIDIA + CUDA (see
`NEURAL_INFERENCE_HARDWARE.md`). This writes down exactly what to do, against the
pinned upstream revision, so the future GPU step is a mechanical, verified
sequence rather than an open investigation.

## 1. Pinned inputs

| Item | Value |
|---|---|
| Upstream repo | `https://github.com/SkyworkAI/Matrix-Game` |
| Repo commit | `c7a88bfc039cd97695082484986e95b962390676` |
| Model/asset revision | `2c53100457da7abcf0e966f75637c644d3423a63` |
| Base-model revision | `b8bc1a65ab71d054ba4636dc0dac104aa4df2686` |
| Model download manifest | `Matrix-Game-4/releases/models.json` |
| Asset download manifest | `Matrix-Game-4/releases/game-assets.json` |
| Bridge protocol | `zge-reference-bridge/0` (source-owned, this repo) |

## 2. Target host

- OS: Linux; Python 3.12; NVIDIA GPU (A100-80GB, RTX 5090, RTX 5080, or RTX
  5070 Ti); torch 2.12.0 + CUDA 13.2.
- VRAM: ≥ ~13 GB (RTX 5080-sage) to 80 GB (A100); disk: **~24 GB per scene**
  weights + assets, plus Hub cache.

## 3. Environment (once authorized)

```bash
git clone https://github.com/SkyworkAI/Matrix-Game.git && cd Matrix-Game-4
git checkout c7a88bfc039cd97695082484986e95b962390676
python3.12 -m venv .venv && source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install torch==2.12.0 torchvision==0.27.0 --index-url https://download.pytorch.org/whl/cu132
python -m pip install -e '.[inference,server,download,test]'
```

## 4. Download + integrity (one scene, e.g. ancient-egypt)

```bash
matrix-game download --manifest releases/game-assets.json --repo-id Skywork/Matrix-Game-4.0 --repo-type model --revision 2c53100457da7abcf0e966f75637c644d3423a63 --scene ancient-egypt --resources resources
matrix-game download --manifest releases/models.json --repo-id Skywork/Matrix-Game-4.0 --repo-type model --revision 2c53100457da7abcf0e966f75637c644d3423a63 --scene ancient-egypt --resources resources
matrix-game verify --manifest releases/models.json --scene ancient-egypt --resources resources   # SHA256 via pinned manifest
```

The downloader verifies sizes + SHA256 against the pinned manifests. Do **not**
proceed past here if verification fails.

## 5. Health / readiness

```bash
nvidia-smi                       # GPU present + driver
python -c 'import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))'
matrix-game --help
```

## 6. Private transport (loopback by default)

- MediaMTX listens on `127.0.0.1` (RTSP :8555 TCP, WebRTC :8890). Do **not**
  change `webrtcAddress`/`webrtcAllowOrigins` to a public interface.
- Remote browser access uses an authenticated **SSH tunnel** and an ICE-compatible
  transport (ICE-TCP / TURN / relay) as decided in Phase 3; SSH `-L` does **not**
  by itself carry WebRTC UDP media.

## 7. Offline inference proof (must precede any live demo)

```bash
matrix-game render --scene ancient-egypt --input lowpoly.mp4 --resources resources --preset realtime --prompt-mode fixed --output outputs/egypt
```

Confirm `rendered.mp4` + `config report`, then:

```bash
matrix-game render --take /path/to/take-1 --resources resources --preset realtime --prompt-mode fixed --output outputs/take-1
```

Do **not** bypass this proof to reach a visually impressive browser demo.

## 8. Browser inference test

```bash
mediamtx configs/mediamtx.yml                       # terminal 1
CUDA_VISIBLE_DEVICES=0 bash scripts/serve.sh --scene ancient-egypt --resources resources --preset realtime --fps 40   # terminal 2
```

Open `http://127.0.0.1:8025/`. Use `--reference-only` first to validate transport
against real software before the model path.

## 9. ZekNova live connection (future)

Connect the ZekNova reference-frame bridge (`zge-reference-bridge/0`) to a narrow
adapter that feeds the upstream game-IPC role in place of the native game. The
adapter is documented in `NEURAL_BRIDGE_PROTOCOL.md` and is the remaining
integration surface.

## 10. Benchmark / telemetry collection

Record model FPS, action-to-photon latency (browser input → presented video),
server `online_fps`/`model_fps`, staleness rate, and fallback rate. Source
digests are pinned by the manifests; store session `session-*.json` +
`profile-*.json` reports.

## 11. Shutdown / cleanup

```bash
curl -X POST http://127.0.0.1:8025/api/{id}/stop   # stop session
# then terminate mediamtx + serve.sh; no persistent systemd units
```

## 12. Standing prohibitions (unchanged)

No automatic paid resources; no public unauthenticated inference endpoint; no
model training; large weights stay outside Git; no gameplay-authority transfer;
no fabricated model output.
