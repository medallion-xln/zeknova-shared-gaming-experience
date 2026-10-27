# Multiplayer movement input protocol — ZGE-14

**Evaluation of a dedicated movement protocol against ZGE-13's bounded intent pacing. The eligible, provably-safe improvement is fixed-tick movement batching inside the existing durable single-writer authority; it is version-gated and does not weaken durability, quotas, collision, or the client's serial in-flight guard.**

## 1. The problem, restated precisely

ZGE-13 ([CONTINUOUS_INPUT_ROOT_CAUSE.md](CONTINUOUS_INPUT_ROOT_CAUSE.md)) established that the continuous-input stall is admission-gate concurrency + a serial in-flight guard + single-writer `synchronous=FULL` SQLite commit, triggered when a client emits naive per-keystroke commands. The bounded-intent-pacing fix drove admission-blocked 429s to zero while preserving every distinct authoritative command. The residual cost is a growing tail: at 8 players, input→visible p99 ≈ 2.7 s, because **every distinct movement intent is its own durable transaction**.

Two latencies must be kept separate throughout (the prompt is explicit):

- **Input→acknowledgment** — physical key → server `COMMIT` ack returned (`ackAt − sampleAt`).
- **Input→visible** — physical key → first frame the accepted state is drawn (`visibleAt − sampleAt`).

A 2.7 s ack and a 2.7 s freeze are different defects. ZGE-14's matrix harness (`scripts/zge14-input-matrix.mjs`) measures both independently across 1/2/4/8 players and fault modes (none / 50–200 ms delay / loss / reorder).

## 2. Why movement is not the same as construction

| Domain | Nature | Transport/durability |
|---|---|---|
| **movement / select / join** | frequent spatial state, per-actor, order-dependent collision | high frequency, small state delta |
| **place / remove / inventory / purchase / reward** | durable economic transactions | low frequency, must be individually idempotent |

The prompt's critical separation is honored: movement may use a higher update frequency, but it **must remain consistent with the same authoritative world**. There is exactly one world simulation; movement never forks into a second authority.

## 3. Client must not authoritatively determine state

Reaffirmed and unchanged. The client never decides position, collision validity, speed, inventory, awards, teleports, world revision, or mission completion. Any prediction introduced in the future is presentational only until the server confirms.

## 4. The decisive capability finding

The evaluator already supports ordered batch dispatch. `packages/server-php/runtime/evaluator.mjs` line 35–40 applies `input.commands[]` with per-command `input.commandActors[]`, each `dispatch` mutating the evolving snapshot in strict array order. The already-shipped **recovery replay** (`packages/server-php/src/recover.php`, `recover-multiplayer.php`) uses this same batch form and asserts, per command, that the replayed `receipt` is byte-identical to the original individually-committed receipt:

- `recover.php:18` — `worker([... 'commands'=>$inputs ...])`
- `recover.php:19` — `if canonical(candidate['results'][$i]) !== canonical(original receipt) throw`
- `recover-multiplayer.php:23` — `'commands'=>$group['commands'], 'commandActors'=>$group['actors']`

This is strong evidence that **batch dispatch is semantically identical to individual dispatch** — otherwise recovery could not reproduce the same receipts. It is order-preserving, because every `move` reads the snapshot produced by the prior `dispatch` (collision is inherently order-dependent: A then B is valid, B then A may collide).

## 5. The safe improvement: fixed-tick movement batch

### Design

Within a single PHP request admission window, collect up to `K` distinct `move` intents that are **provably independent** of each other (different actors, or same actor with monotonically increasing `expectedPlayerRevision`), then dispatch them as one ordered `commands[]` array to the worker so they commit in **one** `BEGIN IMMEDIATE … COMMIT` transaction.

### What changes

- **Server evaluation layer** (`supervised-world.php` + a new bounded admission path): when a movement-class command is admitted, instead of immediately beginning the write transaction, it participates in a short fixed-tick window (bounded by a monotonic deadline, default a few milliseconds) that coalesces concurrent movement intents into one ordered batch.
- **Worker IPC**: pass `commands[]` + `commandActors[]` instead of a single `command`. No worker change required — the evaluator already consumes this.
- **Durability**: one `COMMIT` for the batch; every command still writes its own `commands` row (idempotency preserved), its own events, and its own ledger entry. Nothing is dropped or coalesced.
- **Versioning/rollout**: gated behind `ZGE_MOVEMENT_BATCH=1` env + a `zge.movement-batch.v1` capability flag. Default off; the existing single-command path is byte-for-byte unchanged.

### What is preserved (non-negotiable)

- **Single authoritative world** — one `MultiplayerConstructionRuntime`, one snapshot.
- **Order-dependent collision** — each `dispatch` in the batch sees the prior state.
- **Per-command idempotency** — each `commandId` still writes a `commands` row with its SHA-256 fingerprint; duplicates resolve identically.
- **Client serial in-flight guard** — `StagingWorldClient.submit` still rejects a second distinct command while one is pending; the batch only shortens the server-side transaction count, not the client's correctness contract.
- **Durable original-ID replay** — reconnect recovery still replays the original `commandId`.
- **Quotas** — 240/principal/min, 600/IP/min, and admission class limits (`movement ≤ 8`, `≤ 2/actor`) are unchanged.
- **No client prediction** — position is never advanced ahead of the acknowledged revision.

### Anti-cheat

The batch admits only commands the server independently validates (collision against the evolving snapshot, movement magnitude `≤ 0.51`, expected revisions). No client can force an illegal move into a batch: dispatch is deterministic on the server. "Distinct durable effects" are never silently discarded — every admitted command produces a receipt.

### Why PARTIAL remains honest if the tail persists

If the 8-player tail cannot be fully resolved without either (a) weakening `synchronous=FULL` durability, (b) raising quotas, or (c) introducing presentational client prediction, then multiplayer responsiveness is reported **PARTIAL** with the exact residual cause. Batch amortizes per-transaction overhead; it does not remove the fundamental single-writer serialization point. The acceptance criteria (no double application, no stale worker authority, correct collision, correct rollback, safe reconnect) are asserted independently of the tail number.

## 6. Compatibility and safety net

- **No wire-protocol change for existing clients** in the default path. The batch is a server-internal scheduling decision.
- **Rollout flags** gate the behavior; a re-run of `scripts/zge13-input.mjs` under the unchanged default path must reproduce ZGE-13's zero-429 result before the batch is enabled.
- **Crash safety** is inherited: the batch uses the same `BEGIN IMMEDIATE`/`COMMIT` + runtime-fence validation as the single-command path (see [DURABLE_SERVER_AUTHORITY.md](DURABLE_SERVER_AUTHORITY.md)), so a SIGKILL mid-batch rolls back atomically.

## 7. Measurement plan (Phase 1/2)

The matrix harness records, per sample, `sampleAt`, `issuedAt`, `ackAt`, `visibleAt`, plus the per-command server `stagesMs` (admission, lockWait, validation, ipc, transactionWrites, commit, eventRead, receiptConstruction) to attribute the residual tail to admission wait vs. IPC vs. COMMIT. Charts: input latency by player count, visible vs ack latency, command backlog over time.

## 8. Status

Feasible and safe as a bounded, version-gated server-side optimization. Implemented only if Phase 1 matrix data confirms the tail is dominated by per-transaction overhead (admission + IPC + COMMIT) rather than by the collision/simulation work itself. If the tail is dominated by legitimate collision rejection or by irreducible single-writer fsync, the batch is *not* implemented and responsiveness is classified PARTIAL with the exact cause.
