# ZGE-08 implementation report

2026-10-21 · bounded local staging certification · no production activation

The isolated durable world now runs through supervised persistent world workers. Independent authenticated players have separate avatars, personal XP, ranks and progression; shared supplies and collective mission rewards remain shared. Actual process, transport and database failure tests preserve committed effects and prevent duplicate rewards. PHP/SQLite retains the sole durable gameplay writer.

## Scope reconciliation and source custody

The attached request ended mid-sentence in phase 2. Its complete supplied portion and the repository ZGE-08 prompt were read with the ZGE-07 security/recovery/coverage/V4/readiness contracts. The user's subsequent four priorities defined this implementation: supervised workers, independent players, recovery and measured multiplayer capacity. The repository prompt's broader live-aid/writer/V4/production goals remain explicit gates; none was silently marked complete.

HEAD remains `138220f4909b3fd6a3e0dd2e62ebab63785336d7` on `main`. Baseline fingerprints cover 7,038 files; all prior dirty changes and the dirty submodule were preserved. No existing file was deleted, no legacy bundle/golden hash was regenerated, and no commit, reset, deployment, credential change or production migration occurred. The final inventory records only this milestone's changes against that dirty baseline; Git status alone cannot distinguish them because much prior work was already untracked.

Baseline was independently verified at **191/191 engine tests** and **83/86 legacy files**. Final engine certification is **221/221**. Legacy remains **83/86**, with the same three historical golden failures in runtime reconstruction, renderer ownership and runtime graphics context. They expect bundle SHA-256 `7a9cdfeec0c7b2ffe6e3f0f250fafb0e0d41ef0bd66d823240086985f36f5dab`; the preserved pre-existing bundle is `25665bd856768b89f2283f6e44a8f93efafe074f9d0fcace5efd8296c991d115`. These failures are disclosed, not re-pinned.

## Delivered behavior

- A private authenticated Unix socket joins PHP to a bounded supervisor, one persistent child/runtime per world, readiness/heartbeat/health, restart backoff, SQL generations and fail-closed lease fencing. PHP holds `BEGIN IMMEDIATE` over candidate evaluation and atomic durable publication. No second gameplay writer was introduced.
- Explicit actor joins, trusted identity injection, independent movement revisions, private personal progress, public pose/rank projections and exact historical collective provenance. Placement grants the authenticated builder 14 XP; first-colony grants 25 team XP once. Actual standing-infrastructure rank policy is actor-attributed. Gold/blue avatars and the peer panel show independent participants.
- Exactly-once effects through stable receipts, atomic personal/team claim keys and original outbox replay. Worker crashes, stale replies, competing owners, lost heartbeat, concurrent gateways, SQL errors and process death before/after COMMIT are covered.
- CLI consistent backup/isolated restore, complete archive replay and corruption/schema/content checks, interrupted-publication denial, damaged-state audit recovery and real SQLite allocation exhaustion rollback.
- Reproducible scripts: `dev:staging-world`, `test:supervised-world`, `test:engine:browser:multiplayer`, `benchmark:multiplayer`, `verify:zge08`. The old collective launcher is retained as `dev:staging-world:compat`.

Detailed contracts: [supervisor](SUPERVISED_WORLD_RUNTIME.md), [ownership](PLAYER_OWNERSHIP_ZGE_08.md), [durability](OPERATIONAL_DURABILITY_ZGE_08.md). Full source/evidence digests: [manifest](ZGE_08_VERIFICATION_MANIFEST.json), [inventory](evidence/zge08/file-inventory.json).

## Measured local multiplayer capacity

Final isolated run: authenticated HTTP, real PHP gateways, one persistent Node world worker, SQLite FULL synchronous WAL. Each row sends 512 actual actor movement commands and verifies durable receipts, complete ordered events, exact replay, unchanged supplies and private progression. No commands failed. Earlier initial and CPU-contended runs are retained as diagnostics; the table reports the final isolated run.

| Clients | PHP gateways | Commands/s | p50 ms | p95 ms | p99 ms | Worker RSS MiB |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 1 | 88.66 | 11.31 | 15.95 | 17.35 | 88.89 |
| 2 | 2 | 100.64 | 10.72 | 34.25 | 227.81 | 88.64 |
| 4 | 4 | 96.54 | 11.10 | 36.02 | 422.60 | 93.30 |
| 8 | 4 | 95.04 | 22.18 | 198.66 | 1,588.56 | 93.94 |

Each row started one worker and created one runtime instance, generation 1; queue peak was 1 because PHP serializes before candidate execution. Queue overflow is tested separately. RSS is one end-of-run sample, not peak or leak/soak evidence. The database grew to 1.64–1.67 MB with all test receipts/events retained. Extra clients increased tail waiting; these results do not show linear scaling or a supported maximum population.

These are 5–6 second localhost bursts under the supported 600 requests/minute staging configuration. The 600/minute/IP quota caps long-run traffic to about 10 requests/second/IP, including reads/authentication. Polling and realistic construction/economy mixes consume that budget. There is no WAN, sustained-capacity or production SLA claim. [Raw capacity](evidence/zge08/capacity-isolated/multiplayer-capacity.json).

## Recovery and compatibility evidence

All 14 requested failure categories are mapped to actual checks in the durability contract. Whole-launcher SIGKILL stopped owned gateways; explicit relaunch recovered the stale socket and higher SQL fence in **10.24 seconds**, and retry of the lost acknowledgment retained exactly one building, one cost and 14 personal XP. Worker restarts are automatic; whole-launcher restart remains an operator command. Real SQLite `SQLITE_FULL` code 13 rolled back the prepared economic/mission transaction. Full filesystem-volume exhaustion and power loss remain untested.

Final independent-context browser certification passed avatar movement, separate 14-XP placement rewards, team 25 XP, conflict rejection, peer privacy, negative authorization, disconnect/reconnect, lost acknowledgment, pending outbox, reload, launcher restart, replay and reference capture. The earlier collective session browser also passed expiry/reauthentication, identity mismatch, authorization denial and PHP restart after the final client changes.

Retained game regressions passed native WebGPU, safe WebGL, boss combat, fallback/reference capture, KTX2/worker stress, save/network/reload, 390 browser parity cases, source demos and bounded performance checks. The inherited intermittent extra interval was not reproduced in this run; its attribution/whole-page teardown gate remains open.

The first regression attempt failed because the normal 8790 development server was absent; logs are retained. After starting it, the old pointer fixture missed its expected pending placement. A new hit-tested fixture selects a legal non-protected site and verifies `elementFromPoint` is the canvas before the same physical input/assertions; it passed. The initial miss remains disclosed, without claiming an unobserved exact cause. During development one backup test correctly rejected a content-policy change while source was being edited; the final frozen-source run passed all 221 tests. Earlier fixture/privacy and generation-wait diagnostics are retained with their corrections in the assessment. No goldens or gameplay expectations were relaxed.

Authenticated 1k/10k/100k archived-event history replay remains exact. At 100k the HTTP backfill took 5.03 seconds and checkpoint replay 1.54 ms. This archive workload is distinct from the 2,048 actual durable gameplay commands.

## Remaining release gates

`LIVE_ZEKNOVA_AUTHORITY=LEGACY`, `LEGACY_WRITER_DISABLED=NO`, `PRODUCTION_READY=NO`. The staging player port does not claim a complete live utility/health/damage/repair/relocation/economic/campaign/rank writer closure. Original aid benefit remains unresolved and quarantined before spending. Full game-specific V4 execution migration, remote identity/TLS, sustained operational capacity, retention/backup policy, reproducible build, GLTF attribution/duplicate Three/page teardown, provider/collector credential remediation and owner release approval remain independent gates. No Matrix-Game neural gameplay authority is activated.

The local demo is available at `http://127.0.0.1:8798/examples/construction-world/?server=1`; fixture credentials remain only in its private staging directory. [Screenshot](evidence/zge08/multiplayer-world.png).
