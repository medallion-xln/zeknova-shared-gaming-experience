# ZekNova — WorldClaw Discovery Report (Phase 0)

Repository audit completed before any invasive change. Nothing in this document
is speculative: every claim below is anchored to a file and, where the runtime is
minified, to the identifier the bundle actually uses.

---

## 1. Is there an official WorldClaw to depend on?

**No. Verified, not assumed.**

| Fact | Value | Source |
| --- | --- | --- |
| Paper | *WorldClaw: Agentic 3D Open-World Generation at Scale*, arXiv 2608.05248, 2026-08-05 | arXiv / HuggingFace |
| Official repo | `Tencent-Hunyuan/Hunyuan3D-WorldClaw` | GitHub API |
| Repo contents | `README.md` (1,333 bytes), `.gitignore` (10 bytes), `assets/` (teaser + pipeline JPGs) | GitHub contents API |
| `language` | `null` — **no source code of any language** | GitHub API |
| `license` | `null` — **no license grant** | GitHub API |
| Last push | 2026-08-13 | GitHub API |
| Weights / pip package / hosted API | none published | README "News" lists only paper + project page |

The published pipeline depends on **GPT Image 2** (scene imagery), **Meta SAM 3**
(part segmentation), **Hunyuan3D** (image→mesh), orchestrated by an LLM agent
backbone. Those are third-party inference endpoints, not a library.

**Conclusion.** There is no production-usable WorldClaw implementation, package,
checkpoint or license to introduce as a dependency. Per the implementation rule,
this integration builds the **WorldClaw-compatible abstraction and a ZekNova-native
deterministic pipeline**, with a `Generative3DProvider` seam so an official
implementation (or Meshy/Tripo/Hunyuan3D) can be attached later without touching
gameplay. No fabricated API, package name, or import is introduced anywhere.

---

## 2. What ZekNova already has

### 2.1 Where the world actually lives

ZekNova's world runtime is **not** in `src/world/`. It is inside the shipped bundle
`assets/index-02987539.js` (1.43 MB, minified), with a readable-ish reconstruction
under `src/runtime-reconstructed/compat/segments/`. `src/world/*.js` are thin
**contract modules** (24–84 lines) that the bundle reads through `globalThis`, plus
a large body of Sentinel/Prime AI-governance contracts unrelated to world building.

This matters: WorldClaw must **produce data the bundle consumes**, not try to
rewrite the bundle.

| Concern | Owner | Location |
| --- | --- | --- |
| Terrain / world class | `PR` | `segments/03-world-and-game-core.js` |
| Terrain noise | `zkH` (fbm), `zkT` (composite height), `FR` (value noise), `ih` | `segments/03` |
| PRNG | `pn` (xorshift-ish, seeded), `BR` (FNV-1a string hash) | `segments/03` |
| World config | `Be` — `worldSize:180`, `waterLevel:-0.35`, `maxPixelRatio:1.75` | `segments/01` |
| Biome bands | `zkAreasOfOperation`, `zkAOAt` | `segments/04` |
| Environment dressing | `createAreaEnvironment` | `assets/environment-runtime.js` |
| Spatial index | `zkSpatialHash` / `SpatialHash` | `src/world/Collision.js` |
| Physics | `PhysicsWorld`, `CollisionWorld`, `Narrowphase`, `CharacterController` | `src/game/physics/` |
| Missions | `MISSION_OBJECTIVES`, `CAMPAIGN_TIERS` | `src/game/Missions.js` |
| Campaign matrix | `PROJECT_LADDER` (12 projects × 5 biomes) | `src/game/CampaignPlan.js` |
| Bosses | `BOSS_CONFIGS`, `MISSION_BOSS_IDS` (12 bosses) | `src/game/BossSystem.js` |
| Utility network | `zkUtilityNetwork` — power 30 m, water 36 m, data 36 m | `segments/01` |
| Persistence | `api/save.php`, `api/progression.php`, `src/game/GameReset.js` | — |
| LOD | `assets/model-lod-manifest.js`, `RenderPerformanceDirector` | — |
| Worker | `src/workers/adaptive-runtime-worker.js` (tier classification, R0 advisory) | — |

### 2.2 The world's actual shape

```
worldSize        180 × 180 world units (playable half-extent ±84)
heightGrid       129 × 129 Float32Array (97 × 97 in startup safe mode)
waterLevel       -0.35
biomes           5 fixed vertical bands, 36 units wide, centres x = -72,-36,0,+36,+72
seed             BR("<teamCode>:<teamName>:shared-world")  — FNV-1a, deterministic per team
river            single sinusoidal centreline: sin(x·0.052)·6.4 + sin(x·0.018+1.15)·2.6
```

Height is composed, not raw noise — `zkT` already does domain warping, a ridged
band for mountains, a second ridged band subtracted for valleys, and a
high-frequency detail band attenuated inside ridges. `rawHeightAt` then adds a
radial rim beyond r=48, carves the river with a Gaussian, and clamps the riverbed.

### 2.3 What already exists that WorldClaw must NOT duplicate

- **Deterministic seeded terrain** with fbm + domain warp + ridged mountains.
- **Height grid + bilinear sampling** (`buildHeightGrid` / `heightAt`,
  mirrored node-side in `src/world/Terrain.js`).
- **A slope+water+obstacle placement validator** — `isObstacleAt`, and the
  build test `height > waterLevel+0.8 && height < 18 && |dH/dx|+|dH/dz| < 3.3`.
- **A navigation-ish spawn solver** — `findSafeSpawn` does an expanding ring
  search with slope and water rejection.
- **A spatial hash** for broadphase and nearby queries.
- **Distance-managed visibility + 4-level LOD** (`source/high/medium/low`) and a
  render performance director with a shadow-caster budget.
- **Instancing** for vegetation (`INSTANCE_ASSET_KEYS`) and a 256-slot pooled
  desert ground-tile carpet.
- **211 authored GLB models** (193 MB), including complete ZekNovan village kits.

### 2.4 What is genuinely missing — the WorldClaw gap

| Capability | Status today |
| --- | --- |
| Machine-readable world specification | **absent** — the world is code, not data |
| Intent → world planning | **absent** |
| Semantic regions / biome adjacency | **absent** — 5 hard vertical bands, no transitions |
| Semantic object placement | **absent** — settlements are hand-typed `x`/`z` literals |
| Asset metadata / semantic query | **absent** — assets are 5 hardcoded arrays in `environment-runtime.js` |
| World critique with scores | **absent** |
| Bounded world repair | **absent** |
| Region/chunk streaming | **absent** — one 180² grid, built once at construct time |
| Generative-3D provider seam | **absent** |
| Blender round-trip | **absent** |
| Developer world editor | **absent** |
| Generated-world persistence | **absent** — save stores `buildings` + `worldProgress` only |

**The single clearest illustration of the gap** (`assets/environment-runtime.js:178-188`):
the entire Desert civilisation is eleven structures at hand-typed offsets —
`{ x: 0, z: 0 }`, `{ x: -12, z: -8 }`, `{ x: 11, z: -7 }` … There is no rule
saying *why* the water-collector tower sits at `(-11, -24)`. That is exactly the
"predetermined collection of environments" this integration is meant to replace.

### 2.5 Assets available for the demonstration region

`assets/models/environment/` already ships a complete ZekNovan desert kit —
`elder-communal-dome`, `sanctuary-dome`, `sandstone-dome-dwelling`,
`desert-market-pavilion`, `communal-oven`, `beacon-watchtower`, `wind-catcher-sail`,
`water-collector-tower`, `crystal-energy-array`, `crystal-harvesting-rig`,
`mine-entrance` — plus a 24-piece shared `village-kit`, four desert ground tiles,
and alien vegetation. **The Phase 22 demo region needs no new art.**

---

## 3. Blocking defect found during the audit (pre-existing, not introduced here)

`src/main.js` (uncommitted working-tree change) adds four **static** imports to
modules that do not exist and never existed in git history:

```
src/game/HarvestRewards.js       MISSING
src/game/BossReplaySettings.js   MISSING
src/game/StructureDesign.js      MISSING
src/game/DefenseTowers.js        MISSING
src/game/OfficerRank.js          present
```

A static `import` of a missing module fails the **whole** module graph, so
`launch()` never runs and the game does not boot at all in a browser today.
`npm run check` does not catch it because `scripts/check-source.mjs` never imports
`main.js`. The comment above the imports states the intent was a soft, optional
bridge — which is what a guarded dynamic import gives.

**Confirmed in a browser, not only by reading the code.** Served from the local
PHP dev server, the network log showed four `404 … ERR_ABORTED` entries for those
modules and `document.body` rendered completely empty — no login page, no error
message, nothing. `launch()` never ran.

**Resolved.** The four bridges are now loaded through `loadGameplayBridges()`,
which awaits them as dynamic imports and logs the ones that are absent. That is
precisely the degradation the original comment described; the only thing that
changed is that a missing bridge no longer takes the whole module graph with it.
The game boots again and the login page renders.

The four modules are still missing. If they are work in progress, creating them
will now simply light them up — nothing else has to change. Whoever is authoring
them may want to know that four static imports were the reason the build was
dark.

---

## 4. Integration decisions this audit produces

1. **WorldClaw is a subsystem, not a replacement.** It emits a `WorldSpec`; the
   existing `PR` terrain, physics, missions and bosses stay authoritative.
2. **Reuse, don't fork.** WorldClaw's terrain layer wraps the existing
   `zkT`-equivalent composition and the existing height-grid/slope/water
   validators rather than inventing a second noise stack.
3. **Off by default.** The subsystem is dynamically imported inside `try/catch`
   and gated behind an explicit developer flag, so a WorldClaw failure can never
   take the game down — and so the module graph defect in §3 is not compounded.
4. **Mission supremacy.** Generation is validated *against* `MISSION_OBJECTIVES`,
   `PROJECT_LADDER` and `BOSS_CONFIGS`; a spec that cannot host the campaign is
   rejected, never shipped.
5. **No external AI on the critical path.** The planner is a deterministic
   rule engine. An LLM may only *propose* a spec that the same deterministic
   validator then accepts or rejects.


---

## 5. Outcome (post-implementation)

| | |
| --- | --- |
| Modules created | 14 under `src/worldclaw/`, plus one test suite |
| Test suite | `tests/worldclaw.test.mjs` — **108/108 passing**, wired into `npm test` |
| Full repository suite | **427 assertions passing, exit 0** (baseline 318) |
| Demonstration region | ZEK-NOVA Desert Civilisation, quality **95.1 / 100**, campaign intact |
| Structures placed | 40 / 40 requested, from authored ZekNovan meshes only |
| Boss arenas | 12 / 12 sited, validated and reachable |
| Placeholder assets shipped | 0 |
| External AI used | none — `provider: "null"` |
| Generation time | ~330 ms median (Node), ~8 s (Chrome; see limitations) |

### Defects found and fixed during implementation

Each of these was caught by the critic or the test suite rather than by
inspection, which is the argument for having built them:

1. **Anisotropic build lattice** — a fixed sample count over a band-shaped region
   sampled every 1 m in x and 6.7 m in z, collapsing farthest-point selection so
   two campaign projects landed 1 m apart. Replaced with a fixed 2.5 m
   world-space step.
2. **Circular settlement rings in band-shaped regions** — a 40-structure town
   delivered 26 structures because its outer rings fell outside the 26-unit
   band. Replaced with elliptical rings derived from the region's aspect ratio —
   the same solution the shipped Forest village already uses.
3. **Density calibrated for an open world** — the desert generated with zero
   plants. Recalibrated against the live game's own 672 instanced trees across
   2.8 playable hectares.
4. **Cost metadata not propagated to placements** — the budget guessed triangle
   cost from mesh height and counted every instanced fern as its own draw call,
   inflating a region to 1.5M triangles.
5. **Provisional positions surviving a refusal** — a mission hook or boss arena
   that failed siting kept an unvalidated placeholder at the region centre,
   turning a spacing preference into a campaign failure.
6. **Arena cover counted against arena navigability** — placing the cover an
   arena needed made it fail the check that placing it was meant to satisfy.
7. **Repair applying build rules to props** — an ore seam exists *because* it is
   on a slope, so every attempt to separate two overlapping seams was refused as
   "illegal ground".
8. **Two allocation hot spots in `heightAt`** — a per-call weights array and a
   per-call closure inside `valueNoise`, together several million allocations per
   generation. Hot-path sampling improved from 73 ms to 51 ms per 100k samples in
   Node.

### Known limitations

- **Chrome is ~15x slower than Node** for identical, byte-identical output
  (~8 s vs ~330 ms). Both allocation fixes above measurably helped, but a
  residual engine gap remains that has not been isolated. Acceptable for a
  button-press developer tool; it would need profiling before any player-facing
  use.
- **`WorldClawRuntime` has not been exercised against a live scene.** Doing so
  requires an authenticated session, and the bridge is written to be additive
  and reversible, but "additive in principle" is not the same as "verified in
  the running game".
- **The generated world is not yet what the player sees.** WorldClaw produces and
  validates specifications; the shipped `createAreaEnvironment` still dresses the
  live world. Swapping it is a deliberate, separate decision.
