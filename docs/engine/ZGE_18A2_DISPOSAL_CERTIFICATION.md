# ZGE-18A.2 — RB-1 disposal-fence certification

Date: 2026-10-30 (America/Los_Angeles). Scope: test-only, local, no publication.

## Disposition

**GO for the bounded disposal-fence test certification. CONDITIONAL GO for candidate publication.** All four requested mutants are killed and all required local and fresh-install gates pass. No runtime behavior change was required. Hosted CI remains unverified and full-class/browser lifecycle integration remains outside this source-slice certification. Publication remains separately authorized; no branch, commit, push, PR, merge, deployment or CI trigger occurred, including in scratch snapshots. No ZGE-18B work occurred.

## Inspected implementation

The unchanged candidate in segment 04 wraps `loadAOEnvironment()` with a 3,000 ms HQ readiness race, a disposal fence, a 5,500 ms staging pause, a second disposal fence, and an inner call with `hqWaitComplete=true`. The inner loader increments `aoEnvironmentLoadToken`, resets obstacle arrays, and checks both `disposed` and token ownership before importing, after importing, after construction, and after environment readiness. The segment 04 dispose wrapper increments the token, disposes/detaches the environment and calls the base disposer. Segment 03's real `zR.dispose()` sets `disposed=true` before its synchronous cleanup. Segment 06 wraps the load with quality/index updates and wraps disposal with quality cleanup.

The first staged fence must prevent scheduling the staging timer. The second must prevent the staged log, token increment, obstacle resets and module import. Environment non-attachment alone cannot distinguish those fences from the inner loader's redundant checks.

## Cases and harness

The workspace already contained 29 passing behavior tests at the start of this request, including eleven disposal cases previously labeled ZGE-18A.2. This run preserves those assertions and adds three tests, for **32 behavior tests**:

- Disposed `initialize()` with unresolved HQ, exact 2,999/3,000 ms advancement, readiness settlement, no staging timer, and late HQ completion.
- Overlapping `initialize()` calls with independent readiness promises, disposal during staging, no inner loader entry, and timer drain.
- Disposal immediately before versus immediately after the 3,000 ms timeout continuation. Only timeout-first may already have scheduled the 5,500 ms timer; neither order may enter the inner loader afterward.

Existing cases cover disposal before loading; disposal during unresolved HQ and dynamic import; staging disposal at 0, 3,000 and 5,499 ms; flag-only disposal; token supersession; overlapping module imports; separate game instances; throwing teardown; successful, failed and late HQ; and readiness/recovery regressions. Assertions inspect scheduled timers, token ownership, array identity, logs, imports, constructed environments and attached groups. The harness now counts initialization and provides a monitor collaborator so the verbatim segment 06 initialization wrapper can run.

**Integration limitation:** this is a source-slice lifecycle integration harness. It executes the verbatim class disposer/field initializers in a minimal class shell and selected segment 04/06 wrappers with stubbed DOM/renderer/world/base-initialize/monitor collaborators. It does not instantiate the complete `zR` constructor, execute real renderer/base initialization, install every later runtime wrapper, or establish whole-game/browser disposal certification. The existing test names that say “real class” refer to its verbatim disposer, not construction of the complete class. Isolated inner-loader tests deliberately bypass staging to test its independent contract.

Overlapping live staged loads can issue two dynamic imports while only the latest token constructs/attaches one environment; that is existing candidate behavior. The tests do not claim cancellation or global network deduplication. Existing timers can fire after disposal, and the segment 06 outer wrapper still rebuilds obstacle indexes after return. Certification prohibits new staging work at the first fence and inner-loader work at the second fence; it does not claim all post-disposal callbacks or outer-wrapper work cease.

## Independent mutation probes

`node --test tests/runtime-disposal-mutations.test.mjs` runs each exact historical mutation in a separate temporary artifact. Each named regression first passes against an unchanged control in a separate process. Mutation application must match exactly once; kills require `ERR_ASSERTION`, one failed test, zero cancellations, and the expected failure evidence. Startup/import errors, timeouts and runner cancellation are not accepted as kills. Active source/artifact files are never mutated.

| Mutant | Exact change | Direct test and observed assertion |
|---|---|---|
| M3 | Remove the fence after the HQ race | “disposal before or during the HQ wait schedules no staging pause…” detects forbidden `5500` timer. |
| M4 | Remove the fence after staging | “disposal during the 5500ms staging pause stops before the inner loader…” detects token `2 !== 1`. |
| M5 | Remove both staged fences | Same pre/during-HQ regression detects forbidden `5500` timer. |
| M10 | Remove the whole inner disposed/token check after HQ | “inner loader contract: disposal or supersession during its own HQ wait stops before module import” detects imports `1 !== 0`. |

All four are **KILLED**, with four passing controls. There is no assertion weakening or production edit. The runner explicitly clears inherited `NODE_TEST_CONTEXT` and selects TAP so nested Node test output is independently inspectable.

## Boundary semantics

For unresolved HQ, no staging timer exists at 2,999 ms; advancing to 3,000 ms and flushing promise continuations schedules staging at that clock time. Environment import waits for another 5,500 ms. Late HQ resolution cannot duplicate work. Both HQ-resolution ordering fixtures yield one load.

Disposal before the timeout continuation guarantees no staging; disposal after that continuation permits the timer already scheduled and guarantees no subsequent inner entry. HQ rejection strictly before the timeout yields procedural fallback; rejection after timeout loses the race. Same-tick rejection versus timeout depends on promise-realm/microtask ordering. The test guarantees a single coherent outcome and does not assert that one contestant always wins. The fake clock's `advance()` fires due callbacks then flushes promise work; this is a deterministic fixture, not proof of every host event-loop interleaving.

## Local gates and clean replica

**All gates passed in both the current workspace and the clean snapshot.** Complete command output, exit codes, durations and output hashes are retained in [local gate evidence](evidence/zge18a2/local-gates.json) and [clean gate evidence](evidence/zge18a2/clean-gates.json). The replica copies tracked/candidate files, excludes dependency trees, nested checkout and environment files, then performs a fresh `npm ci --ignore-scripts`. It runs the workflow integrity/package/release/reproducibility commands plus the new independent mutation test. Output preservation is compared by complete path set and SHA-256 before/after, without creating a scratch branch or commit. This replaces the workflow's scoped Git diff check for this no-commit task.

The replica uses local macOS, Node 22.22.2 and available PHP/SQLite, not hosted Ubuntu Actions. It does not activate/trigger CI, install OS packages, rerun GPU/browser certification, or certify broad `npm test` and historical milestone scripts.


| Gate | Workspace | Clean snapshot |
|---|---|---|
| Fresh `npm ci --ignore-scripts` | Existing dependencies preserved | PASS |
| `npm run check` | PASS | PASS |
| `npm run runtime:reconstruct:verify` | PASS | PASS |
| Runtime graphics and renderer ownership gates | PASS | PASS |
| Runtime lineage | 2/2; six tamper controls | Same PASS |
| Expanded behavior suite | 32/32 | 32/32 |
| Independent disposal mutation controls | 4/4 killed; 4/4 controls pass | Same PASS |
| SDK output integrity | PASS; four drift controls | Same PASS |
| Engine suite | 347/347 | 347/347 |
| SDK suite | 70/70 (overlaps engine suite) | 70/70 |
| SDK build | PASS | PASS |
| Release / fresh public consumer verification | PASS | PASS |
| Independent clean reproducibility builds | PASS; 11 matching outputs | Same PASS |
| Artifact / SDK output path and byte preservation | PASS | PASS |
| Final `git diff --check` | PASS | Equivalent snapshot output hashes above |

The clean snapshot excludes the root dependency tree and `stable-fast-3d`; dependency installation occurs only in temporary directories. Environment files are not copied. Existing dependency audit findings are unchanged; no audit remediation was attempted. No browser result from the earlier milestone is counted as a new disposal integration result.

## Exact inventory and preservation

The preflight discrepancy is a counting boundary: Git reports **20 tracked dirty paths including `stable-fast-3d`**, whereas the candidate owns **19 tracked modified files excluding that pre-existing dirty gitlink**. Both counts refer to the same baseline. No twentieth candidate-owned tracked file is missing. New tests are untracked additions and do not change the tracked-modification count.

The [exact path manifest](evidence/zge18a2/file-inventory.json) distinguishes the complete ZGE-18A candidate relative to HEAD, the files changed by this request relative to its captured baseline, and unrelated dirty paths. It includes this report and its evidence files.

Shipping runtime, launch binding, candidate runtime source/artifact bytes, nested checkout, installed dependency tree and environment files are preserved. [Preservation evidence](evidence/zge18a2/scope-preservation.json) compares baseline hashes and records an unrelated, concurrently changed Sentinel Grid browser-console log separately. That file was not edited by this task. The protected path set contains 51,092 files, with zero additions, removals or byte changes. HEAD remains `f91da08de12474990e4379b4b6ed906acb8a836b`.

This request changes ten paths: the two existing test/harness files and the original implementation report, plus a new independent mutation test, this certification report, and five evidence files. The complete candidate has 51 paths: 19 tracked modifications and 32 untracked additions. The separate unrelated-path inventory includes the dirty nested gitlink and pre-existing Sentinel Grid tooling/browser artifacts. Relative to the request baseline, the permitted changed paths are:

- `tests/helpers/runtime-behaviour-harness.mjs`
- `tests/runtime-required-behaviours.test.mjs`
- `tests/runtime-disposal-mutations.test.mjs`
- `docs/engine/ZGE_18A_IMPLEMENTATION_REPORT.md`
- `docs/engine/ZGE_18A2_DISPOSAL_CERTIFICATION.md`
- `docs/engine/evidence/zge18a2/local-gates.json`
- `docs/engine/evidence/zge18a2/clean-gates.json`
- `docs/engine/evidence/zge18a2/mutations.tap`
- `docs/engine/evidence/zge18a2/scope-preservation.json`
- `docs/engine/evidence/zge18a2/file-inventory.json`

Mutation evidence is preserved in [mutations.tap](evidence/zge18a2/mutations.tap). Rerun it explicitly with `node --test tests/runtime-disposal-mutations.test.mjs`; the existing hosted workflow definition remains unchanged. Baseline, gate-driver and snapshot artifacts remain under the temporary directory named in the gate evidence. They are local verification artifacts and have no commits.
