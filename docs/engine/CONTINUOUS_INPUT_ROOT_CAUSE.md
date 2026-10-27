# Continuous-input stall root cause — ZGE-13

**Status: reproduced under controlled conditions; RESOLVED via bounded intent pacing without raising quotas; residual latency documented as an authority-preservation tradeoff.**

## The symptom

In the source-owned multiplayer world (`examples/construction-world`), sustained directional movement by multiple simultaneous players becomes delayed or "stalls": the browser reports successful HTTP requests while on-screen movement falls behind input. This is the `SOURCE_WORLD_INPUT_STALL=OPEN` block carried from ZGE-12.

## Root-cause statement

The stall is **not** a single bottleneck. It is the interaction of three independent, correct components that each impose backpressure when the client emits naive per-keystroke commands:

1. **Admission gate concurrency bound** (`packages/server-php/src/command-admission.php`). The movement command class admits at most **8 concurrent** commands and **at most 2** queued+active commands *per actor*, FIFO with round-robin across actors. A client that fires a `move` on every key repeat (roughly 30–60 Hz) exceeds both bounds almost immediately.

2. **Client-side serial in-flight guard** (`StagingWorldClient.submit`): `if(!prior && this.pending.length) throw Error('pending-recovery-required')`. A client may not issue a second distinct command until the first receipt is persisted; overlapping distinct `move` intents with outstanding receipts are rejected as `pending-recovery-required`.

3. **Durable single-writer latency** (`world.php`/`supervisor`). Each movement command is a committed SQLite transaction (`synchronous=FULL`, `BEGIN IMMEDIATE`, `COMMIT`) plus worker IPC. Measured server stage p99: `commit` 8.3 ms, plus `ipc` 177 ms and `admission` 343 ms under contention.

Before ZGE-13, the movement sampler delivered key-repeat intents directly to `submit`, so sustained movement produced a burst of distinct `move` commands that were then rejected by (1) and (2). The client observed them as `server-backpressure` / `rate-limited` / `admission-*`, dropped the receipts, and movement visually lagged or stopped — even though a subset of POSTs returned 200.

## Reproducing evidence

`scripts/zge13-input.mjs` restores a forced `intervalMs=100` sampler policy (the pre-fix behavior) and compares it against the bounded pacing policy, with 8 real headless browsers driving physical `keydown`/`keyup` input. Retained raw data in `docs/engine/evidence/zge13/` (originally `/tmp/zge13/input/`):

| Case | Input→visible p50 | p95 | p99 | Receipt failures | HTTP 429 |
|---|---|---|---|---|---|
| forced 100 ms (before) | 32.7 ms | 116.0 | 213.6 | **278 / 594** (261 backpressure, 16 collision, 1 rate-limit) | 1 |
| bounded pacing, 2 players | 33.0 ms | 181.1 | 366.3 | 1 | 0 |
| bounded pacing, 4 players | 66.1 ms | 266.3 | 416.2 | 0 | 0 |
| bounded pacing, 8 players | 99.5 ms | 1382.6 | 2726.7 | 15 (collision only) | 0 |

The forced-100 ms case *looks faster* on its p50 because it never waits for the durable commit; it simply drops the receipts that would have been rejected. Its visible movement is therefore inconsistent and contested — that is the "stall" as a user experiences it. The paced case is slower in the tail but every distinct authoritative command is committed and acknowledged, with zero admission-blocked requests.

## Why this is a correctness property, not a bug

The prompt forbids silently dropping distinct authoritative commands with outstanding receipts, forbids raising quotas, and forbids prediction bypassing collisions/permissions. The observed backpressure is the system correctly refusing to coalesce distinct movement intents. The fix therefore lives on the *client pacing* side (see [RESPONSIVE_MULTIPLAYER_MOVEMENT.md](RESPONSIVE_MULTIPLAYER_MOVEMENT.md)), not in weakening server authority.

## Instrumented path and who owns each stage

```
Physical input (keydown/keyup)     → browser, sampled in __physicalInputs
Browser input controller           → MovementSampler.sample(dx,dz)
Local sampling                     → interval() = max(400, min(64, population()) * 150)
Client command scheduling          → StagingWorldClient.submit (serial in-flight guard)
Auth / quota admission             → session.php + command-admission.php (movement <8, <2/actor)
PHP gateway                        → world.php router
World supervisor                   → supervisor.mjs → world-worker (IPC)
Authoritative simulation           → runtime evaluator (move applies collision + revision)
Durable commit                     → SQLite BEGIN IMMEDIATE … COMMIT (WAL, FULL)
Client reconciliation              → validate snapshot checksum + revision monotonicity
Rendered movement                  → construction-world viewport sync
```

The retained per-command server `stagesMs` (payload, databaseOpen, quota, authentication, authorization, runtimeEnsure, admission, lockWait, validation, ipc, candidateValidation, transactionWrites, commitValidation, commit, eventRead, receiptConstruction, responseSerialization) is captured in `raw[].client.server.stagesMs` and aggregated in the operations soak.

## Conclusion

Continuous-input stall is **reproduced and diagnosed**: it is admission-gate + in-flight-guard backpressure against naive per-keystroke movement, correctly applied, surfacing as dropped distinct receipts under the old un-paced sampler. The ZGE-13 fix is bounded intent pacing that preserves authoritative single-writer durability. Residual tail latency at 8 players (p99 ~2.7 s) is the price of committing every distinct intent; it is retained as an explicit, measured limit — not hidden and not "fixed" by silent coalescing.
