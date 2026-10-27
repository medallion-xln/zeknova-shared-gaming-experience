# Rebuild spec — required behaviours recovered from the frozen bundle

**ZGE-17 AC4.** Status: **normative for the rebuild.**

The rebuild (ZGE-17 §13) re-derives ZekNova onto `@zge/sdk` using the frozen bundle
`assets/index-02987539.js` as its specification. The bundle is not a build input and is never
modified.

This document exists because **three behaviours that the shipping game depends on exist only as
minified bytes**. They were fixed directly inside the bundle and never written back to
`src/runtime-reconstructed/`, which is the repository's nominal source lineage. Anyone
reimplementing these systems from that lineage — or from a reading of the segments — would
faithfully reproduce three serious defects.

Each entry below records the symptom, the stale behaviour, and the behaviour the rebuild must
have. They are acceptance conditions, not notes.

## How this was established

`node tests/runtime-reconstruction.test.mjs` fails: the live bundle hashes
`25665bd856768b89f2283f6e44a8f93efafe074f9d0fcace5efd8296c991d115`, while the segments in
`src/runtime-reconstructed/compat/segments/` rebuild to
`7a9cdfeec0c7b2ffe6e3f0f250fafb0e0d41ef0bd66d823240086985f36f5dab` — which is also what the
committed artifact and the test's expectation hold. The segments and the artifact agree with each
other; the **live bundle drifted away from both**.

Concatenating the eight segments with the same algorithm as
`scripts/build-reconstructed-runtime.mjs` and diffing against the live bundle isolates the drift
to exactly **three lines**: 1122, 1144 and 1168. All three are stall or soft-lock fixes.

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

## RB-3 — A charging juggernaut must always resolve its charge

**This is the most serious of the three: it is a permanent soft-lock in a boss encounter.**

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

The timer decrement and the crash check sit **inside** the no-collision branch. A juggernaut that
collides mid-charge therefore never decrements `stateTimer` and never crashes out — it remains in
`"charge"` forever, blocked against whatever it hit, for the rest of the session.

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
document in the same change**. The hash gate cannot be relied on to catch drift: it is currently
red, and `tests/runtime-graphics-context.test.mjs` carries the same stale expectation at line 2.
