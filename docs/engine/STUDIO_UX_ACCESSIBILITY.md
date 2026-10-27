# Studio UX + accessibility — ZGE-13

**Automated browser-interface evaluation against selected WCAG 2.2 criteria. Not full conformance, no human usability research.**

## ZGE-12 scorecard → ZGE-13 changes

ZGE-12 was PARTIAL with a hard `1.4.10 reflow` failure at 320 px (document stuck at 1000 px). ZGE-13 implements a responsive fallback for the editor chrome and re-verifies.

## 320 px reflow — RESOLVED

`scripts/zge13-workflow.mjs` and `scripts/zge13-accessibility.mjs` resize to `320 × 800` and record `document.documentElement.scrollWidth`. Result: **document width 320 px at a 320 px viewport** (`saveReachable:true`), in both WebGPU and WebGL.

| Criterion | Status | Evidence |
|---|---|---|
| 1.4.10 Reflow | **BOUNDED_PASS_320PX** (was FAIL) | scrollWidth 320 at 320 viewport |
| 1.4.4 Resize text (200%) | Sampled, clipping review | root text 13→26 px; screenshots retained |
| 2.1.1 Keyboard | PARTIAL | hierarchy Arrow/Home/End + Tab exit pass; full 3D camera equivalence unproven |
| 2.1.2 No keyboard trap | Tested | hierarchy focus can Tab out |
| 2.4.7 Focus visible | Tested | outlineStyle solid on focused control |
| 2.5.7 Dragging | Alternative provided | placement button + numeric transform fields |
| 2.5.8 Target size | Sampled, needs review | small-target list retained for spacing/exception analysis |
| 3.1.1 Language | PASS | `lang="en"` |
| 4.1.2 Name/Role/Value | PARTIAL | sampled accessible names/button state; no screen reader |
| 4.1.3 Status | PASS | `role="status"` live polite |

The 3D **spatial viewport** is not claimed under reflow/text-resize; only the surrounding editor chrome is covered. No full 2.1.1/4.1.2 certificate is inferred.

## Professional authoring UX (ZGE-12 gaps)

- **Multi-select visibility / group transform feedback** — atomic `batchTransform` (1–100 unlocked local offsets) with whole-batch validation, optimistic revision, one-step undo; shared-pivot/box selection remain not claimed.
- **Gizmo selection** — retained ZGE-11 physical orbit/pan/zoom + cancellation regression; hit-test cancellation exercised in the large-scene matrix.
- **Hierarchy search / organization** — indexed virtualized hierarchy; keyboard Arrow/Home/End + Tab.
- **Asset placement** — native drag + keyboard button alternative.
- **Inspector clarity** — reflected definition fields, validated IDs, cached recompute.
- **Loading / error recovery** — explicit open/loading/status + invalid-data errors atomically reject without corrupting the scene.
- **Undo/redo discoverability** — visible controls + tested one-step semantics.

## Measured interaction latency

From `scripts/zge13-large-scenes.mjs` (WebGL/WebGPU, 100→5000 entities): selection p95 103–188 ms (ZGE-12 had ~1091 ms before virtualization at 5000), save 237–279 ms at 5000, import 93–512 ms. DOM stays ~267 nodes at scale due to virtualization. See `LARGE_PLAYABLE_SCENE_BENCHMARKS.md` and `evidence/zge13/charts/`.

## Explicit non-claims

- **No WCAG 2.2 AA conformance** — only the criteria listed above were tested, in a headless automated browser.
- **No assistive-technology interoperability** (no screen-reader run).
- **No unfamiliar-human usability study** — this is automated development-workflow certification.
- **No contrast or complete-focus-sequence audit.**

Camera/3D keyboard equivalence and full screen-reader semantics remain future work. Referenced standard: [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/).
