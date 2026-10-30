# Rebuild spec — required behaviours recovered from the frozen bundle

**ZGE-17 AC4.** Status: **normative for the rebuild.**

The rebuild (ZGE-17 §13) re-derives ZekNova onto `@zge/sdk` using the frozen bundle
`assets/index-02987539.js` as its specification. The bundle is not a build input and is never
modified.

This document originally recorded **three behaviours that existed only as minified bytes**.
ZGE-18A reconciles them into source with executable regressions. Historically they were fixed
directly inside the bundle and never written back to
`src/runtime-reconstructed/`, the nominal source lineage. Before reconciliation, those
segments restored unbounded asset waits and differed from shipping charge/recovery timing.

Each entry below records the symptom, the stale behaviour, and the behaviour the rebuild must
have. They are acceptance conditions, not notes.

## How this was established

At the ZGE-17.1 baseline, `node tests/runtime-reconstruction.test.mjs` failed: the live bundle hashed
`25665bd856768b89f2283f6e44a8f93efafe074f9d0fcace5efd8296c991d115`, while the segments in
`src/runtime-reconstructed/compat/segments/` rebuild to
`7a9cdfeec0c7b2ffe6e3f0f250fafb0e0d41ef0bd66d823240086985f36f5dab` — which is also what the
committed artifact and the test's expectation held. Those segments and the artifact agreed with
each other; the **live bundle had drifted away from both**.

Concatenating the eight segments with the same algorithm as
`scripts/build-reconstructed-runtime.mjs` and diffing against the live bundle isolates the drift
to exactly **three lines**: 1122, 1144 and 1168. They contain two readiness bounds and a
charge/recovery timer placement change; the latter does not establish a permanent soft-lock.

The model runtime drifted the same way: live `assets/model-runtime-c96327ba.js` hashes
`078bd4e54aa7d7de6890779b1c9c7e945ab069c37f84dfd236643f3eb6a43f8e` against the lineage's
`e6af33cdf1f56c098d16156ce34ff435c7fa7a5490ed640a63c6e5e43ca726d0`.

## RB-1 — HQ asset load must not be able to deadlock startup

**Symptom if lost.** The game hangs permanently on startup. `PLAY_README.md` records this as the
headline fix of its build: "HQ asset loading no longer hangs the game (was: infinite deadlock)."

**Stale lineage (bundle line 1122), inside `loadAOEnvironment`:**

```js
await this.player?.hqReady;
```

If `hqReady` never settles, environment loading never proceeds and startup never completes.

**Required behaviour (live bundle):**

```js
await Promise.race([this.player?.hqReady, new Promise(r => setTimeout(r, 3000))]);
```

**Acceptance.** Waiting on HQ readiness must be bounded. A never-settling HQ promise must delay
startup by at most its timeout and must not prevent gameplay from becoming ready. The rebuild may
choose a different bound, but an unbounded await of an asset promise on the startup path is a
defect.

## RB-2 — Environment load must not be able to block the ready signal

**Stale lineage (bundle line 1144), inside `initialize`:**

```js
return zkLoadAOState(this), Promise.resolve(this.loadAOEnvironment()).finally(e), t;
```

`e` resolves `environmentReady`. If `loadAOEnvironment()` never settles, `environmentReady` never
resolves.

**Required behaviour (live bundle):**

```js
return zkLoadAOState(this),
  Promise.resolve(Promise.race([
    this.loadAOEnvironment(),
    new Promise(r => setTimeout(() => r('ao-timeout'), 20000)),
  ])).finally(e), t;
```

**Acceptance.** The environment-ready signal must be independent of whether optional environment
assets finish loading. A world that cannot load its decoration must still become playable, with
procedural fallback — which the surrounding `catch` already provides ("ZekNova environment mesh
upgrade unavailable; procedural vegetation remains active").

## RB-3 — Charge timer placement and recovery transitions

**ZGE-18A correction:** the byte difference is real; a permanent collision soft-lock was not
established. In both lineages the collision helper already calls `zkJuggernautCrash` on every
true return, entering recovery with a 2.1-second timer. The shipping branch also decrements
that recovery timer during the same update. Executable regressions preserve this behavior.

**Stale lineage (bundle line 1168), inside `zkUpdateHostileJuggernaut`, state `"charge"`:**

```js
if (!zkJuggernautChargeCollision(e, t, p, f))
  t.position.x = p,
  t.position.z = f,
  t.position.y = e.terrain.heightAt(p, f),
  i.stateTimer -= s,
  i.stateTimer <= 0 && zkJuggernautCrash(e, t, null);
return;
```

The timer decrement and expiry check sit inside the no-collision branch. This differs from
shipping behavior, but does not prove a permanent lock because the collision helper itself
performs the crash transition. Tests cover unblocked expiry, collision/recovery, repeated
obstruction, animation state changes, restart and idempotent cleanup.

**Required behaviour (live bundle):**

```js
if (!zkJuggernautChargeCollision(e, t, p, f)) {
  t.position.x = p;
  t.position.z = f;
  t.position.y = e.terrain.heightAt(p, f);
}
i.stateTimer -= s;
if (i.stateTimer <= 0) zkJuggernautCrash(e, t, null);
return;
```

**Acceptance.** State-machine timers must advance independently of whether movement succeeded.
Generalised for the rebuild: **no behaviour state may have its exit condition gated on a movement
or collision result.** Collision decides whether the actor *moves*; it must never decide whether
the actor's state can *end*. This belongs in the behaviour-plugin contract (ZGE-17 §13, Q2
boundary) as a structural rule, not as three special cases.

## Related encounter timings the rebuild must preserve

From the same function, for tuning dash and double jump against existing content (ZGE-17 §12):

| State | Duration | Cooldown |
| --- | --- | --- |
| `telegraph` | 0.92 s | charge 6.8 s |
| `charge` | 1.55 s | — |
| `slam` | 0.72 s | slam 7.5 s |
| `brace` | 1.65 s | brace 7.5 s |
| `recover` | 1.55 s | — |

Charge speed is 9.4 units/s, clamped to ±82 on both axes. Engagement bands: slam within 4.8 units,
brace between 5 and 18, charge between 7 and 17.

## Standing rule

While the bundle remains the specification, **any further fix made inside it must be added to this
document in the same change**. The ZGE-18A integrity gate verifies shipping-reference hashes, reconstructed source and reviewed
candidate hashes independently. Historical hashes remain provenance, not current expectations.
See `src/runtime-reconstructed/provenance.json`.

## ZGE-18A candidate-only RB-1 correction

Testing found a later staged `loadAOEnvironment` wrapper that still awaited HQ without a bound.
The shipping reference remains untouched. The source-derived candidate bounds that wait at
3,000 ms, retains the 5,500 ms staging pause, skips a second HQ wait in the inner loader,
catches HQ rejection for procedural fallback and checks disposal around staging. This explicit
failure-path correction preserves successful loading semantics. Its reviewed candidate digest
and disposition are recorded separately from the shipping reference. Adoption by the launch
path is a separate release decision.

Run `npm run test:runtime:behaviours`. Tests execute verbatim candidate functions with controlled
clocks; fixtures replace collaborators, not the implementation. Cancellation means token/disposal
fencing of attachment, not network abort. Existing environment disposal can run twice after late
readiness and must remain idempotent. These are bounded function-level regressions, not whole-game
lifecycle or GPU resource certification.
