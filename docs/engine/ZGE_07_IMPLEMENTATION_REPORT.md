# ZGE-07 — Persistent sessions and source construction boundary

**Bounded staging implementation complete; live authority transfer remains NO-GO.** The independent world now has hardened persistent sessions, a private source construction port, explicit unsupported-effect quarantine, isolated V4 forward/rollback, audited corruption recovery and authenticated long-history backfill. This is not full legacy construction parity or production readiness.

## Baseline and preservation

HEAD remains `138220f4909b3fd6a3e0dd2e62ebab63785336d7`. Before edits, Git status, process names/PIDs/cwd and SHA-256 fingerprints for 6,934 existing files were recorded. The baseline engine suite passed 167/167; legacy tests passed 83/86 with the same three historical golden-hash assertions. Every pre-existing file is retained; unrelated dirty changes and the dirty submodule are preserved. No process arguments or credentials were printed.

The authoritative bundle and existing model/environment artifacts retain their baseline hashes. No golden re-pinning, commit, deployment, production database migration or production credential change occurred. Only temporary staging SQLite schemas were extended, including the existing loopback demonstration DB after isolated tests passed.

## Implementation against the nine phases

| Phase | Result and evidence |
|---|---|
| 1. Session security | Current server-side world memberships/roles, access expiry/revocation, separately hashed reauthentication credential, origin/header boundary, quotas, strict inputs/cursors, private DB/directory ownership, generic errors and production-default denial. See SESSION_SECURITY_ZGE_07.md. |
| 2. Continuity | Versioned persistent session identity and separate connection IDs; connect/disconnect/reauth/revoke, restart, stable identity-based outbox and initial/in-session renewal. Whole-reply validation precedes replica publication; stale/generation replies cannot advance state. |
| 3. Construction effects | Actual lifecycle inventory uses all five requested classifications. Existing 702 Node/390 browser manager cases still match; missing utility/health/campaign/personal/economic effects remain named. See CONSTRUCTION_COVERAGE_ZGE_07.md. |
| 4. Aid investigation | Three unchanged artifact occurrences; no recovered original base benefit callback. Actual wrapper tests prove cost/record/tags/cooldown before the missing-method failure. Independent source port quarantines aid before spending; live callback remains unresolved. |
| 5. Source construction | Local game and PHP worker use ConstructionPort with private runtime, strict single-mode flags, immutable shadow candidates and no legacy import. Independent select/move/place/remove, resources/buildings, collective mission/once-only reward, persistence, replication, recovery and committed presentation run end to end. Aid/repair/relocation are explicitly excluded. |
| 6. Live gate | Complete disablement of competing live writers cannot be demonstrated. No live ENGINE mode or prototype patch was introduced. The concrete replacement boundary and exact remaining gates are in LIVE_AUTHORITY_READINESS_ZGE_07.md. |
| 7. V4 | Separate isolated editable branch validates provenance/identity/world/revisions, exports V4 fields plus versioned source extension, reimports, preserves unknown data and rolls back to the exact original. CAS-store contract covers stale/interrupted writes. Full live execution remains UNCERTIFIED. |
| 8. Durability/history | Snapshot/checkpoint/page integrity, full archive retention, bounded tails/pages, audited command/receipt/event/claim reconstruction, pre/post-commit mission process-death tests and SQL write-rejection rollback. Representative 1K/10K/100K authenticated HTTP replay matches exactly. |
| 9. Browser demonstration | Two authorized builders plus a third denied browser context; movement/shared construction/conflict/mission, snapshot mismatch, disconnect/reconnect, lost reply, actual access expiry, full reload, private reauthentication, original outbox recovery, server restart, saved progress, event/revision inspection and native fallback capture all pass. |

## Certification

- Engine: **191/191**, zero failures/skips, adding 24 tests to the checked 167-test baseline. Includes **21 actual PHP/SQLite tests**, not just mocks.
- Legacy: **83/86 before and after**. Only `runtime-reconstruction`, `runtime-graphics-context`, and `renderer-ownership-certification` retain their original bundle-golden failures. Assertions and expected hashes are unchanged.
- Bounded placement corpus: **702 Node + 390 browser matches, zero mismatches/skips**. This does not establish full construction effect parity.
- Source checks, animation audit, Node demo and retained construction/runtime benchmarks pass.
- Final four-mode game run: WebGPU, safe WebGL, boss WebGPU and unavailable-neural native fallback; movement about 9.45–10.56 m, successful actual placement/collision/combat, shadow mismatch/error counts zero, three director restarts per mode, save/full-page restore, WebGPU/WebGL asset/worker stress and page-reload stress pass. No page errors in these four runs.
- Remaining browser suites for actual pointer/save/network recovery, boss rewards/reference capture, old transaction demo, source 3D lifecycle and live/shadow performance pass. See `evidence/zge07/browser-final-assessment.json`.

The first inherited restart probe failed with one additional interval. Its failure/log/partial report remain in evidence. `zge07-browser-certification.mjs` adds timer-origin and before/after diagnostics while retaining the same assertions; all four modes then pass with zero interval delta. The transient cause remains unresolved, and RAF/AbortSignal/detached-node readings do not certify whole-page teardown. No legacy behavior was patched or assertion relaxed.

The final actual PHP mixed request sample is 38 requests: p50 88.70 ms, p95 200.22 ms, including PHP/SQLite and per-request Node startup. Sample size is insufficient for a useful p99 capacity claim. This remains a staging host, not a production throughput certificate.

The final representative 100K archive uses **67,121,152 bytes**, full JS replay **72.01 ms**, checkpoint replay **1.62 ms**, authenticated loopback HTTP backfill **5985.92 ms** across **391 pages**, with a **256-event client window**. All archived events remain retained; checkpoint corruption/event gaps and unauthorized reads reject. This is representative event history, not 100K full construction commands or WAN measurement. See PERSISTENT_RECOVERY_ZGE_07.md for 1K/10K results, memory and recovery limits.

## Reproduction and remaining boundaries

Use `npm run test:engine`, `npm run test:php-security`, `npm run benchmark:world-history:hardened`, and `npm run test:engine:browser:hardened`. `node scripts/zge07-verify.mjs --browser` reproduces the full local verification matrix; start the normal loopback game separately and supply the installed Playwright module/Chrome paths as documented in the manifest. Output defaults outside the repository. The verifier does not build/replace release bundles and checks the exact historical hash-failure signature.

The existing demo remains at `http://127.0.0.1:8796/examples/construction-world/?server=1`. `npm run dev:staging-world` provisions fresh isolated fixtures when started with a new private `/tmp` directory. Login accepts an access token or separately provisioned private reauthentication credential; fixture values stay in the private identity file, never in this report/evidence. The screenshot is `evidence/zge07/hardened-world.png`.

Remaining live blockers: unrestricted historical pointer/addRecord/repair/relocation/damage/restore/room/reset/economy writers; unresolved aid benefit; incomplete utility/health/personal/campaign/rank parity; full execution migration and fenced live rollback; original build provenance and owner release/security gates. Staging still shares one colony avatar and collective XP. Supervised gameplay workers, per-player progression, remote identity/TLS, larger actual-command/backup/disk-full tests and operational capacity/retention remain future work. Existing provider/collector credential rotation, original GLTF attribution, duplicate Three and page-only lifecycle limits remain open.

`ZGE_07_VERIFICATION_MANIFEST.json`, file inventory and raw evidence identify the exact result. The roadmap execution ledger is extended without rewriting its original forecast. ZGE_08_IMPLEMENTATION_PROMPT.md describes the next bounded work; no scheduled work or new task was created.
