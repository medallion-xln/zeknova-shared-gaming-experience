# Responsive multiplayer movement — ZGE-13

**A bounded intent-pacing input model that keeps authoritative server state intact. No client prediction, no quota change, no command coalescing.**

## Design

`examples/construction-world/MovementSampler.js` replaces the naive "sample every key repeat" with a bounded, rate-aware movement-intent sampler. It has exactly these responsibilities:

- **Normalize diagonals.** `send(dx/len * .4, dz/len * .4)` keeps the speed magnitude constant for diagonal vs. cardinal movement (unit-speed cap `0.4` per server authority).
- **Never replace an in-flight receipt.** `sample()` returns `false` immediately while `busy` (an outstanding `send` promise) or before `next` (the next permitted timestamp). A distinct authoritative command that has not yet been acknowledged is never silently dropped or overwritten — the caller retries on a later tick.
- **Population-aware pace.** `interval() = max(400, min(64, population()) * 150)` ms. A single player samples no faster than 400 ms; with 8 players the floor rises to 1200 ms, scaling the client's send rate down as the shared durable writer contends — **without** the client knowing or increasing any server quota.
- **Record the full chain.** Each sample stores `sampleAt`, `issuedAt`, `ackAt`, `visibleAt`, `ok`, `accepted`, `reason`, enabling the input-to-visible-response measurement required by acceptance.

The serial in-flight guard is enforced inside `StagingWorldClient.submit` (`packages/persistence/src/StagingWorldClient.js`): a client with any persisted pending command rejects a new distinct command until recovery, and persisted outbox replays the *original* command ID on reconnect. This is the "durable original-ID recovery" mandated by the prompt.

## What was deliberately *not* implemented

- **No client-side prediction.** Position is never advanced locally ahead of the authoritative revision; no predicted state grants resources, teleports through collisions, or alters committed state.
- **No per-tick command aggregation that would coalesce distinct intents.** Two distinct directional changes at distinct times remain two receipts.
- **No quota increase.** Admission class limits (`movement<=8`, `<=2/actor`) and the 240/principal/min and 600/IP/min request limits are unchanged.

## Protocol / compatibility

The movement wire contract (`action:'move', dx, dz` plus `expectedRevision` / `expectedPlayerRevision`) is unchanged and remains versioned under the existing `zge.multiplayer-view.v1` snapshot protocol. The change is client-local pacing only, so no server migration is required and existing clients remain compatible.

## Regression tests

- `packages/persistence/test/zge13.test.mjs` — "movement sampler bounds issued commands, normalizes diagonals and never replaces an in-flight receipt": asserts the second in-flight sample returns `false`, diagonal normalization to `hypot≈0.4`, and `interval()===1200` for a population of 8.
- `scripts/zge13-input.mjs` — the sustained browser harness: simultaneous 8-player physical input, direction changes every 2.4 s, focus loss (`blur`), 180 ms request-admission delay, physical disconnect/reconnect, concurrent construction (`#place`), and an owned launcher `SIGKILL` with outer-service recovery. It records input→visible latency, per-command server stage spans, admission 429 counts, and final durable revision.

## Measured results

See [CONTINUOUS_INPUT_ROOT_CAUSE.md](CONTINUOUS_INPUT_ROOT_CAUSE.md). Summary of the *bounded* policy (the fixed behavior):

| Players | Input→visible p50 | p95 | p99 | 429s | receipt failures |
|---|---|---|---|---|---|
| 2 | 33.0 ms | 181.1 | 366.3 | 0 | 1 |
| 4 | 66.1 ms | 266.3 | 416.2 | 0 | 0 |
| 8 | 99.5 ms | 1382.6 | 2726.7 | 0 | 15 collision |

A server reporting 200 is not sufficient: the harness asserts final durable `revision` advances monotonically and that the replayed outbox and health endpoint remain intact after the worker crash. Physical key input is recorded (`window.__physicalInputs`) to prove the movement is genuinely player-driven, not harness-injected state.

## Remaining limit

At 8 simultaneous players the sustained input→visible p99 reaches ~2.7 s because every distinct intent is an individually committed SQLite transaction under single-writer `FULL` durability. This is a correct, measured authority-preservation cost, retained as an explicit blocker rather than hidden. It is not a client bug and does not grant any prediction-based advantage.
