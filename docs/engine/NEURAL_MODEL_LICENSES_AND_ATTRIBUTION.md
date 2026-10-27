# Neural Model Licenses & Attribution (ZGE-16 Phase 0)

Pinned upstream revision examined: repository commit
`c7a88bfc039cd97695082484986e95b962390676` (cloned to `/tmp/matrix-game-research`,
outside the ZekNova tree); Matrix-Game-4 model/asset revision
`2c53100457da7abcf0e966f75637c644d3423a63`; shared base-model revision
`b8bc1a65ab71d054ba4636dc0dac104aa4df2686`.

This document records **license obligations and third-party dependencies** for
the Matrix-Game 4.0 integration. It is informational; it does not yet license
anything into ZekNova, because **no upstream code or weights have been copied
into this repository**.

## 1. Primary license — Matrix-Game 4.0

- **Apache-2.0** (`Matrix-Game-4/LICENSE`, read verbatim). Root repository README
  also notes a project-level MIT (`LICENSE`) that covers earlier versions only;
  Matrix-Game **4.0** is Apache-2.0.
- Earlier versions (1.0/2.0/3.0) retain their own terms and are not in scope for
  this milestone.

Apache-2.0 obligations that apply **if and when** upstream-derived code or assets
are redistributed:

- Retain the copyright/attribution notices.
- Include a copy of the License and the NOTICE file (if present) with any
  Derivative Work.
- Mark modified files as changed (§4(b)).
- No trademark grant for "Skywork" / "Matrix-Game".
- Patent grant terminates if the licensee initiates patent litigation.

## 2. Third-party dependencies (from `THIRD_PARTY_NOTICES.md`)

The project Apache-2.0 license does **not** replace these; each retains its own
terms. All are used as source libraries or external runtime dependencies, not
rebranded assets.

| Component | Location / use | License / provenance |
|---|---|---|
| MG4CF model implementation | `matrix_game/inference/wan`, wrappers, loading, scheduler, decoder, rollout | Apache-2.0; extracted from MG4CF `d5b0307`; `licenses/MG4CF-LICENSE` |
| Wan model / codec code | same model modules | Alibaba/Wan notices; project snapshot Apache-2.0 |
| TAEHV (fast codec) | `matrix_game/inference/taehv.py` | MIT; Ollin Boer Bohan; commit `011dfc2112197741c540e0bdd5b7b67bcc930771`; `licenses/TAEHV-LICENSE` |
| MediaMTX reader | `matrix_game/web/mediamtx-reader.js` | MIT; `mediamtx-reader.LICENSE` |
| Jolt Physics | `game/third_party/JoltPhysics` | MIT |
| Recast/Detour | `game/third_party/recastnavigation` | zlib |
| DirectXMath + SAL | `game/third_party/DirectXMath` | included `LICENSE` / `SAL-LICENSE.txt` |
| stb | `game/third_party/stb` | dual license |
| nlohmann/json | `game/third_party/json.hpp` | MIT |
| Racing engine/tire/impact audio | `racing/assets/audio` | CC0 + CC BY 3.0; retain `audio/CREDITS.md` |

Installed-but-not-bundled runtime dependencies (MediaMTX, GStreamer, x264, FFmpeg,
SDL2, PyTorch) carry their own licenses and must be reviewed before distributing
any binary installer.

## 3. Model weights & game assets (distributed separately)

- Hosted on Hugging Face `Skywork/Matrix-Game-4.0` + `alibaba-pai/Wan2.2-Fun-5B-Control`.
- **Not part of the source repository license.** Weight and asset distributions
  carry their own accompanying license statements.
- The `releases/models.json` manifest declares `"license": "Apache-2.0; TAEHV MIT"`
  at the bundle level; `game-assets.json` declares
  `"license": "Apache-2.0; racing audio CC0 and CC BY 3.0"`.
- **Obligation:** before redistributing or training/deriving from the weights,
  review the license statements that accompany each upstream distribution
  (`licenses/TAEHV-LICENSE`, `licenses/MG4CF-LICENSE`, and the base-model weight
  licenses). Downloaded package total per scene ≈ 24 GB (see
  `NEURAL_INFERENCE_HARDWARE.md` §4); large model files stay outside Git.

## 4. Boundary, as it applies to ZekNova today

No code from the upstream Matrix-Game tree has been copied into ZekNova for
ZGE-16. The ZGE-01 neural-rendering boundary already documents what was adapted
(interface shapes — `crop_and_resize` geometry, the `!II` length-prefix envelope
shape, and the HTTP control contract — re-implemented in JS from reading
upstream, attributed in source comments). Anything further that is *adapted*
rather than *inspired* must carry the corresponding attribution; anything
*original* (kernel, adapter orchestration, mock, tests, presentation controller)
remains ZekNova-owned.

## 5. Standing obligations in effect for this milestone

- Do **not** fabricate model outputs or present a mock/upscaler/prerecorded clip
  as genuine model inference.
- Do **not** include private credentials or session identifiers in model prompt text.
- Keep **large model files outside Git**.
- Attribution and notices as in §1–§3 apply at the moment any derived artifact is
  committed or distributed — not before.
