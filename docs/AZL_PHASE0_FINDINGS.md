# AZL Phase 0 Reconnaissance Findings — ZekNova

Reconnaissance only. No AZL engine code was written or modified. This report
answers the seven Phase 0 deliverables against the real ZekNova codebase.

---

## TL;DR — the forward model does NOT need a refactor

**The single biggest risk in this integration is already retired.** ZekNova
ships a self-contained, pure, cloneable abstract colony forward model *today*:
`zkRunStrategicSearch(context, options)` at
`assets/index-02987539.js:1130`. It already runs a UCT MCTS (up to 128 sims,
depth 6) inside a Blob Web Worker, over a flat abstract state, with 13
macro-actions, a legality predicate, a pure `apply()` transition, a scalar
`evaluate()`, and an `prior()` action-score function. It touches no DOM, no
Three.js singletons, no network, no audio, and uses a seeded RNG — **not**
`Math.random()`.

That function *is* the AZL `sim` contract in miniature. Binding AZL to ZekNova
is a **thin wrapper at the abstract-colony level**, not a parallel headless
simulation and not a refactor of the Three.js engine. You do not simulate the
renderer; you simulate the same abstract telemetry the game already builds to
feed its own advisor.

**The one real blocker is not code, it's access:** the AZL contract file
`public_html/azl/azl-ref-adapter.js` and the AZL codec live on the server and
are **not present in this repo**. I inferred the contract from the brief's
inline code block, which is enough to draft the adapter, but I have not read the
authoritative header comment or the codec's NaN/normalization semantics. See
[§8 Blockers](#8-blockers-and-what-i-need-to-write-the-adapter). Everything
below is written so the adapter can be produced the moment those three files are
available (or you confirm the brief's inline contract is authoritative).

---

## 1. Repo map

The project has **no build step**. `npm run dev` just launches `php -S`
(`scripts/dev.mjs`). What ships is what runs.

There are two layers:

| Layer | Location | Role |
|---|---|---|
| Auth + loader shell (editable ES modules) | `src/**` (~1,245 lines total) | Login gate, style loading, then imports the runtime bundle. |
| **The actual game** (semi-minified bundle) | `assets/index-02987539.js` (1.13 MB, 1,745 lines) | Three.js renderer + full simulation, exposed as `globalThis.ZekNovaLegacyBridge`. |

`src/main.js` runs the login page, then `new Game().start({user})`
(`src/game/Game.js:90`) dynamically imports the bundle and calls
`globalThis.ZekNovaLegacyBridge.start(user)`. The bundle dispatches
`zeknova:gameplay-ready` when live. The small `src/game/*.js` and `src/world/*.js`
modules hold *migrated constants* (missions, enemy profiles, biomes, collision
radii); the simulation loop itself is still in the bundle.

Key locations inside the bundle:

- **Game state object** — the `Simulation` class (`IR`) at
  `assets/index-02987539.js:874`. Holds `resources`, `indicators`,
  `civilizationScore`, `phase`.
- **Main game orchestrator** — class `zR` (referenced at `:1160`,
  `:928`, `:883`, `:890`). Owns `this.simulation`, `this.buildings`,
  `this.enemies`, `this.player`, diplomacy state, AO state, mission state.
- **Tick/update loop** — `Simulation.update(dt, buildingCounts)` at `:875`
  runs the passive economy on a 1-second accumulator. The render/step driver is
  a `requestAnimationFrame` loop inside `zR` (many `requestAnimationFrame`
  call sites; the HUD refresh is `updateHud` at `:928`).
- **Player action dispatch** — `zR.onKeyDown` (game-level handler, bound at
  `:881`; body begins `onKeyDown=e=>{if(VR(e.target))return...`). Construction
  placement flows through `this.buildings.place(...)` and building records are
  added via `LR.prototype.addRecord` / `zkOriginalAddBuilding` at `:967`.
- **Win/loss / terminal conditions** — **none exist for the colony.**
  `civilizationScore` is clamped `0..100` and `phase` is derived from it
  (`:875`, `>=72→4, >=48→3, >=24→2, else 1`). A grep for
  game-over / defeat / collapse / "colony lost" returns nothing at the colony
  level. The game is open-ended and score-driven across 12 missions / 4 tiers.
  (`defeat`/`health<=0` exists only per-enemy and per-player in combat.)
- **Existing hand-written AI** — **yes, and it is the crux of this integration**:
  `zkRunStrategicSearch` (`:1130`) + `zkStrategicPlanner` (`:1157`), wired
  into the SCOUT-01 advisor at `:1159`–`:1160`.

---

## 2. State shape inventory (→ `baseFeatureSpec`)

The canonical abstract state is exactly what `zR.askAdvisor` assembles at
`:1160` and feeds to the planner. Raw ranges below come from the `Simulation`
class defaults/clamps (`:874`) and the planner's own normalization (`:1132`).
`He(x,min,max)` is the clamp used throughout.

### 2a. Resources — `this.simulation.resources` (learnable)

| key | type | raw min | raw max (hard clamp) | realistic max | default (new colony) |
|---|---|---|---|---|---|
| energy | float | 0 | 999 | ~300 | 42 |
| water | float | 0 | 999 | ~300 | 38 |
| minerals | float | 0 | 999 | ~400 | 95 |
| iron | float | 0 | 999 | ~120 | 0 |
| biomass | float | 0 | 999 | ~300 | 72 |
| timber | float | 0 | 999 | ~300 | 0 |
| data | float | 0 | 999 | ~200 | 18 |
| credits | float | 0 | 999 | ~150 | 0 |
| trust | float | 0 | 100 | 100 | 52 |

Use the **realistic max** as the `baseFeatureSpec.max` so normalization uses the
useful dynamic range, not the 999 safety clamp. `def` = the new-colony default.

### 2b. Indicators — `this.simulation.indicators` (learnable, all 0..100)

| key | default | notes |
|---|---|---|
| habitability | 12 | driven by habitat/water/power buildings |
| ecology | 76 | starts high; harvesting timber lowers it |
| morale | 44 | habitat/culture/trust driven |
| governance | 5 | governance/research driven |
| economy | 18 | habitat/research/governance/bridge/boat driven |
| defense | 8 | defense/power driven |
| resilience | 14 | mean of habitability/ecology/governance/defense |

### 2c. Building counts — `this.buildings.countByType()` (learnable, each 0..4)

Exactly nine keys, confirmed at the `countByType` definition:
`power, water, habitat, research, culture, governance, defense, bridge, boat`.
The planner caps each build at `<4` (`:1147`), so treat each as `0..4`, def `0`.
`boat` is the Survey Skiff.

### 2d. Derived scalars (learnable)

| feature | source | raw range | default |
|---|---|---|---|
| civilizationScore | `this.simulation.civilizationScore` | 0..100 | 8 |
| phase | derived from score | 1..4 | 1 |
| threat | `enemyCount*8 + (war?34:0)` (`:1132`) | 0..~150 | 0 |
| tension (diplomacy) | `this.diplomacyTension` | 0..100 | 50 |
| missionProgress | `campaign.currentIndex/total*100` | 0..100 | 0 |
| enemyCount | live non-guardian hostiles with health>0 | 0..~12 | 0 |
| specialGauge | `this.specialAttackGauge` | 0..100 | 0 |

### 2e. Categorical → one-hot (learnable)

- `diplomacyOutcome` ∈ {null, "share", "negotiate", "force"} → 4 one-hot
  features (`0/1` each). This is a **persistent First Contact outcome**, not a
  transient.
- `currentAO` ∈ {forest, desert, highlands, arctic, wetlands} → 5 one-hot.
- `completedAOCount` (from `this.completedAOs`) → single `0..5` feature.

**Feature budget: ~42 features** (9 resources + 7 indicators + 9 buildings +
7 scalars + 4 diplomacy + 5 currentAO + 1 completedAO). Comfortably inside the
40–80 target. Headroom to add derived utility-connectivity counts (online vs.
disconnected structures — the game already computes these via the 18 m utility
spatial hash / adjacency graph at `:967`) in Phase 1 if the signal proves weak.

### 2f. Presentation-only / do NOT feed as features

Player world position, health, stamina, xp; camera/mode; renderer label; mesh
handles; all Three.js geometry; harvested-tree/mined-rock/power-up ID sets
(these are world-dedup bookkeeping, not colony health). `resilience` is
**derived** from four other indicators — keep it (it's a useful summary) but
know it is redundant, not independent.

---

## 3. Action inventory (→ `actions` + `legalMask` + `safeActionIndex`)

**Two distinct action layers — do not conflate them.**

- **Micro-actions** (human keystrokes, `zR.onKeyDown`): WASD move, `E` context
  action (collect/chop/mine/pickup), `Space` fire, `Tab` mode, `R` reset,
  `F` flight, `Q` special, `P`/`Esc` pause. These are **not** the AZL action
  space — they are continuous control, not discrete strategic decisions.
- **Macro-actions** (strategic decisions): the 13 actions already enumerated in
  `zkRunStrategicSearch` (`:1133`–`:1146`). **These are the AZL `actions[]`.**

Stable ordered action list (index = position; append-only forever):

| idx | key | legality precondition | effect summary |
|---|---|---|---|
| 0 | mine-iron | always legal | +10 iron, +4 minerals |
| 1 | harvest-timber | always legal | +30 timber, +3 credits, −2.4 ecology |
| 2 | **recover-materials** | always legal | +20 minerals, +12 biomass |
| 3 | contain-threats | `threat > 0` | −18 threat, +2 credits, −1 trust, +1 defense |
| 4 | stabilize-relations | `tension > 22` & data≥5 | −12 tension, +8 trust, +4 governance |
| 5 | build-power | affordable & count<4 | +Solar Grid |
| 6 | build-water | +power≥1 & affordable & count<4 | +Water Works |
| 7 | build-habitat | +power≥1,water≥1 | +Habitat |
| 8 | build-defense | +power≥1 | +Defense Beacon |
| 9 | build-research | +power≥1,water≥1 | +AI Research Lab |
| 10 | build-culture | +power≥1,water≥1 | +Creator Commons |
| 11 | build-governance | +power≥1,water≥1,research≥1 | +Civic Hall |
| 12 | build-crossing | affordable & count<4 | +Canopy Bridge |

`legalMask` = the planner's `legal(s, action)` predicate (`:1147`): affordable
cost AND `requires` building prereqs met AND optional `when(s)` guard AND (if a
build) current count `< 4`.

**`safeActionIndex = 2` (recover-materials).** It is the truest "do no harm"
action: no cost, no `when` guard, no build cap, purely additive, and — unlike
`harvest-timber` — it carries **no ecology penalty**. It is always legal, so
`legalMask` can never return all-zeros as long as index 2 is included.
(`mine-iron` is also always-legal; recover-materials is preferred as the safe
default.)

> Optional Phase-1 addition: append an explicit **index 13 `hold`** no-op that
> only advances passive production (see [§9](#9-notes-for-phase-1)). Appending is
> index-safe. It gives MCTS a clean "wait and let the economy tick" branch. Not
> required for Phase 0.

---

## 4. Forward-model feasibility report — the critical one

**Verdict: thin wrapper. The forward model exists and satisfies every hard
requirement on `sim`.** Point-by-point against the brief:

1. **`step` pure-ish, no DOM/network/audio/singletons/`Math.random`** — ✅
   Already true. `apply(source, action)` (`:1147`) reads only its two
   arguments, calls `copy()`, and returns a new state. The MCTS runs inside a
   Blob Worker (`zkStrategicPlanner.createWorker`, `:1157`) with **zero**
   access to the main thread — it is serialized via `zkRunStrategicSearch.toString()`,
   so by construction it cannot close over game singletons. Randomness comes
   from a **seeded FNV/xorshift RNG** keyed on `JSON.stringify(context)`
   (`:1147`), never `Math.random()`. Wiring AZL's `rng.next()`/`rng.int(n)` in
   place of that internal seed is trivial.

2. **`clone` deep copy** — ✅ `copy(state)` (`:1131`) spreads every nested
   object (`{...resources}`, `{...indicators}`, `{...buildings}`) and copies
   `[...missionTargets]`. Every leaf is a primitive — no class instances, no
   `Map`, no closures, no cyclic references. It is structured-clone-safe and
   JSON-safe. **Mutating a clone cannot touch the original.**

3. **`step`+`clone` fast (<~20 µs)** — ✅ The state is ~28 numeric fields plus a
   tiny string array. `copy` is a handful of object spreads; `apply` iterates
   at most a few `cost`/`delta`/`indicators` entries. The existing planner
   already runs 72–128 of these per decision inside an 8 ms worker budget, so
   per-step cost is comfortably sub-microsecond-to-single-digit-µs. AZL's
   120–800 sims/decision is well within reach.

4. **Stable action indices** — ✅ The 13 actions are a fixed literal array in
   source order. Preserve that order; append only.

5. **`toBaseFeatures` writes RAW, codec normalizes** — ✅ Trivial: copy the
   ~42 raw fields from the abstract state into the output `Float32Array`. The
   game's `Simulation` already stores raw values; no normalization needed on
   our side.

**What it currently touches that it must not:** *nothing.* This is the rare
case where the answer is genuinely clean. The only main-thread coupling in the
whole subsystem is `zkStrategicPlanner`'s worker plumbing (Blob/Worker/URL),
which is orchestration, not simulation — AZL replaces that layer entirely with
its own MCTS and keeps only `apply`/`copy`/`legal`/`evaluate`/`prior`.

**Effort estimate: thin wrapper (1–2 days), not a moderate refactor and
definitely not a parallel headless model.** The abstract model is done. The
work is: (a) port `apply/copy/legal/evaluate/prior` into the adapter's `sim`
object, adapting signatures to AZL's `(state, actionIdx, rng, outArray)` shape;
(b) write `captureSearchState()` = the existing `askAdvisor` context builder
(`:1160`); (c) define `health`, `entities`, `tick`, and the feature spec.

**One honest caveat.** The existing abstract model is a *coarse* one-step-per-
macro-action abstraction with **no passive-economy dynamics between actions**
(building outputs accrue in the real `Simulation.update` loop at `:875`, but the
planner's `apply` does not simulate that accrual). That is fine for the current
advisor and fine for Phase 0 conformance, but it means multi-step AZL lookahead
will slightly *underweight* the compounding value of early infrastructure. If
learned play looks myopic, fold a simplified version of `Simulation.update`
into `step` in Phase 1 (see [§9](#9-notes-for-phase-1)). Flagging now so it is a
known design knob, not a surprise.

---

## 5. Signal definitions

The game gives us a ready-made evaluator and action-scorer; `health` needs
defining because the game has no bounded outcome scalar.

### `health(state)` — primary learning target, [-1,1]

Proposed composite spined on `civilizationScore` (the game's own 0..100 "how
well is this colony doing" number from `:875`, which already blends all seven
indicators + trust, a build-diversity bonus, and a balance penalty), modulated
by the threat/diplomacy pressures the score itself ignores:

```
health(s) =
  clamp(
      (s.civilizationScore / 50) - 1          // 0→-1, 50→0, 100→+1
    + (s.missionProgress / 100) * 0.20         // mission advancement
    - Math.min(s.threat / 100, 1) * 0.40       // active military pressure
    - Math.max(0, s.tension - 50) / 50 * 0.20  // diplomatic instability
    + (s.resources.trust - 50) / 50 * 0.10,    // ZekNovan goodwill
    -1, 1)
```

Rationale: `civilizationScore` already encodes resources→indicators→balance, so
reusing it avoids re-deriving a colony-health formula from scratch and keeps the
learning target consistent with what the game shows the player. Threat and
tension are added because they are the two failure vectors the score omits.

### `heuristicValue(state)` — existing hand evaluator, [-1,1]

Reuse the planner's `evaluate(s)` (`:1147`) — a proven weighted blend of
indicator average, weakest indicator, build diversity, resource sufficiency,
trust, mission progress, minus threat/tension penalties. It is unbounded
(roughly `0..120`), so squash:

```
heuristicValue(s) = Math.tanh((evaluate(s) - 40) / 40)   // ~[-1,1]
```

### `actionScores(state, out)` — Level-3 fallback, per-action desirability

Reuse the planner's `prior(s, action)` (`:1147`):
`max(0.05, 1 + evaluateGain + missionBonus + urgency)`. Write one score per
action index; illegal actions get `0`. This is already the hand-authored
desirability heuristic — no new work.

### `terminalValue` — colony collapse vs. successful session

The game has **no hard terminal**, so AZL's `step` is depth-bounded like the
existing MCTS (which never terminates, only hits `maxDepth`). Proposed policy:

- **Success terminal (`+1`)**: all 12 missions complete OR `phase === 4` with
  `civilizationScore >= 90`. Mirrors "Frontier Stronghold operational."
- **Synthetic collapse terminal (`-1`)**: sustained failure —
  `civilizationScore <= 8` AND `diplomacyOutcome === "force"` (at war) AND
  total defense buildings `=== 0`. This is not a state the game itself declares
  lost, so treat it as an AZL-side floor, not a game event.
- **Otherwise**: `terminal:false`; at depth cutoff, back up `health(state)`.

---

## 6. Entity + Oracle grouping

### `entities(state)` — map/graph entities

Live sources on the `zR` game object:

- **Hostiles** — `this.enemies` (array). Per-enemy `mesh.userData`:
  `enemyType`, `health`, `maxHealth`, `hostile` (bool), `guardian` (bool),
  `damage`, `collisionRadius`, `speed`; position from `mesh.position` (x/z).
  Six roles: Stalker, Saboteur, Spitter, Skyray, Juggernaut, Burrower.
  → `{ id, type: enemyType, x, y:z, threat: health*damage (normalized),
       hostile: userData.hostile && !userData.guardian, critical:false, deps:[] }`
- **Structures** — `this.buildings.records` (each has `x`, `z`, type). These
  are the `critical:true` entities the AI should protect. `deps` = utility
  dependencies (power/water/data links already modeled by the utility adjacency
  graph at `:967`).
- **Guardians** — enemies with `userData.guardian === true` are pacified
  Juggernauts (post Shared-Water/Safe-Zone). Emit as `hostile:false`.

Note: `captureSearchState()` runs on the **main thread** (allowed to read live
game objects); only `sim.*` must stay pure. `entities()` is a main-thread
snapshot, so reading `this.enemies`/`this.buildings.records` directly is fine.

### Oracle trend groups (6) — feature-index groups

Group the `baseFeatureSpec` indices for trend analysis:

| group | member features |
|---|---|
| resources | energy, water, minerals, iron, biomass, timber, data, credits |
| threat | threat, enemyCount, tension, defense(indicator) |
| population | habitability, morale, habitat(count) |
| construction | power, water, habitat, research, culture, governance, defense, bridge, boat, missionProgress, economy |
| mobility | bridge, boat, currentAO(one-hot), completedAOCount |
| stability | civilizationScore, resilience, governance(indicator), trust, ecology |

(Exact integer indices are assigned once `baseFeatureSpec` order is frozen in
the adapter — the groups above are by feature key.)

### `relationalConfig.distThresh`

Propose **18** — the game's canonical "near the colony" radius (the 18 m
negotiated safe-work zone, and the 18 m utility-source spatial hash). It is the
distance at which entities meaningfully interact with colony infrastructure.

---

## 7. Integration points

- **Where advice renders**: the SCOUT-01 advisor console
  (`zR.askAdvisor` → `advisor.advise`, `:883`/`:1160`) and the HUD panel that
  the README places "beneath Hackathon Standings." `HudDirector`
  (`src/ui/HudDirector.js`) arms the HUD from the shell; the in-bundle
  `zR.updateHud` (`:928`) is the per-frame refresh. AZL advice should mount as
  an overlay adjacent to these, reusing the existing advisor panel container.
- **`recordPlayerAction` hook points** (map real events → macro-action index):
  - building completed → `LR.prototype.addRecord` / `zkOriginalAddBuilding`
    (`:967`) → `build-*` (idx 5–12) or `build-crossing` (12).
  - rock mined → `mine-iron` (0). tree harvested → `harvest-timber` (1).
  - enemy defeated → `contain-threats` (3).
  - diplomacy incident choice → `stabilize-relations` (4) / sets
    `diplomacyOutcome`.
  These are the training tuples' player-action labels.
- **`startSession` / `endSession`**: session start = the `zeknova:gameplay-ready`
  event (`:1541`, also `src/game/Game.js:94`). Session end = `beforeunload`
  (`zR` binds `onBeforeUnload` at `:881`) and/or `zR.save()` (`:890`).
- **CSRF token** — ⚠️ **does not exist.** There is no `window.MEDALLION_CSRF`
  or any CSRF token exposed to JS anywhere in `src/`, the bundle, or `api/`.
  Every existing endpoint uses same-origin **cookie session** with
  `fetch(..., { credentials: "include" })` (e.g. `ER.advise` at `:830`,
  `ai-advisor.php`). **AZL must adopt the same cookie-session pattern** rather
  than assume a CSRF token — or a token has to be added to both sides. This is
  the one integration assumption in the brief that the codebase contradicts;
  calling it out now.
- **OTP / session accessor** for `azl-auth-bridge.php`: the shared Medallion XLN
  PHP session. `api/bootstrap.php` exposes `zeknova_current_user()` (`:64`) and
  `zeknova_auth_context()` (`:77`), reading `$_SESSION['user_id']`,
  `$_SESSION['user_email']`, `$_SESSION['user_name']`. `azl-auth-bridge.php`
  should `require_once bootstrap.php` and reuse these (exactly as
  `ai-advisor.php:3-4` does: `require bootstrap.php; $user = zeknova_require_user();`).
  Local dev: `ZEKNOVA_AUTH_MODE === 'demo'` (`bootstrap.php:9`) bypasses the gate.
  Team scoping and file-locked per-team/per-user JSON quota+memory files
  (`ai-advisor.php:27,80`) are the pattern for any AZL server-side persistence.

---

## 8. Blockers — RESOLVED (adapter written and passing)

**Status update.** The AZL contract (`azl-ref-adapter.js`) was supplied, which
was the one hard blocker. The adapter and its Node test are now written and
green:

- **`azl/zeknova-adapter.js`** — the real `ZekNovaAdapter`, implementing the
  full contract over ZekNova's own 13 strategic macro-actions. The forward
  model is a faithful port of **both** `zkRunStrategicSearch.apply/legal/evaluate`
  **and** the `Simulation.update` passive economy + indicator recomputation +
  `civilizationScore`/`phase` derivation, so multi-step lookahead reflects
  infrastructure compounding (the fix for the §4 myopia caveat). 56 features,
  `safeActionIndex = 2` (recover_materials). Buildless global-namespace classic
  script; registers `globalThis.AZL_ADAPTER` (and `AZL.ZekNovaAdapter`). Ships a
  self-contained `Util` fallback so it runs standalone in Node while preferring
  `AZL.Util` in production.
- **`tests/azl-zeknova-adapter.test.cjs`** — 20 checks, all passing: 200 random
  steps without throw; clone isolation + deep-copy proof; determinism by
  seed+sequence; `legalMask` never all-zeros; `health`/`heuristicValue`/
  `terminalValue` in [-1,1]; finite features; entity contract; and **one 400-sim
  UCT MCTS end-to-end through the adapter's own `sim` surface** (rootVisits=400).

**Deployment target:** `public_html/azl/zeknova-adapter.js` on the server (AZL is
a sibling of the ZekNova app). It is authored here so it versions with the game
it binds to.

**One integration hook ZekNova must add** (documented in the adapter header):
the live game instance is the module-private `_s` in the bundle and is not
exposed, so `captureSearchState()` has nothing to read. Add a one-liner in `kR`
after `_s = new zR(...)`:

```js
globalThis.ZekNovaGame = _s;      // and set null on logout/dispose
```

Optionally also `_s.getAdvisorTelemetry = () => (/* the askAdvisor context */)`
for a precise `missionProgress`/`missionTargets`; `captureSearchState()` prefers
it and degrades to a build-diversity approximation without it.

**Integration completed in this repository:** `azl/azl-engine.js` now supplies
the six-expert policy router and PUCT search, `azl/azl-worker.js` keeps the
search off the render thread, and `src/game/StrategicAI.js` connects the live
SCOUT-01 console to the engine. The original planner remains a runtime fallback.
The adapter contract, engine, worker dependency graph, and live-state capture
are covered by the repository's Node tests and were also exercised through the
local browser build.

---

### Historical note — what was blocking before the contract arrived

The AZL side was not in this repo: the contract header, the codec
normalization/NaN semantics, and the MCTS `rng` interface all had to come from
the server. Those specifics:

- `public_html/azl/azl-ref-adapter.js` — **THE CONTRACT header comment** (the
  brief explicitly says "read the full documented contract in the header
  first"). Not present here.
- The AZL **codec** (normalization: how `min/max` map to [-1,1], exact NaN→`def`
  substitution, whether one-hot features want a different codec treatment).
- The MCTS driver signature that calls `sim.step(state, actionIdx, rng)` and
  the exact `rng` interface (`.next()`, `.int(n)`) — confirmed only from the
  brief's prose, not from source.

I can proceed one of two ways (your call):

1. **Draft the adapter now against the brief's inline contract** (the code block
   in the brief), clearly marked as pending verification against the server-side
   header + codec. Fast, but conformance is asserted, not proven.
2. **Wait for the three files above** (or a copy of `public_html/azl/`), then
   write an adapter I can actually test end-to-end against the real engine and
   re-baseline `bench.html` — the standard the brief asks for.

I recommend (2) for the final artifact, with (1) available immediately if you
want a reviewable draft in parallel. Either way, the reconnaissance above is
what the `ZekNovaAdapter` binds to, and it is unusually favorable.

---

## 9. Notes for Phase 1

- **Passive economy in `step`**: to fix lookahead myopia (see [§4](#4-forward-model-feasibility-report--the-critical-one)),
  port a simplified `Simulation.update(dt, buildingCounts)` (`:875`) into the
  transition so building outputs accrue over simulated ticks. Keep it pure and
  deterministic (the real one already is — no RNG, no DOM).
- **Utility-connectivity features**: the game distinguishes *online* vs.
  *disconnected* structures via the 18 m utility spatial hash + adjacency graph
  (`:967`). A disconnected Solar Grid contributes nothing. Feeding
  connected-count (not just built-count) per utility would sharpen the state.
- **Append, never reorder** actions. If adding `hold`, it is index 13.
- **Node test plan** (unchanged from brief, ready to implement once §8 clears):
  200 random-action steps without throw; clone-isolation; determinism by seed;
  `legalMask` never all-zero (index 2 guarantees it); `health`/`heuristicValue`
  ∈ [-1,1]; one 400-sim MCTS end-to-end.

---

*Reconnaissance performed against `assets/index-02987539.js` (build
`2026-07-18-auth64`), `src/**`, and `api/**`. No AZL engine files were found in
this repository; no game or AZL code was modified.*
