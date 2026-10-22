# ZGE-BENCH-01 defect register

**Confirmed product findings: P0=0, P1=2, P2=3, P3=2.** The two P1 findings affect separate products: original-game construction layout and source-world sustained input. These counts exclude open investigations, coverage gaps and harness failures. They do not certify the absence of other defects. Source-world continuous input is now evaluated and fails its responsiveness gate; durable authority remains intact. Final Studio evidence is still being assessed.

macOS 26.5.2, Apple M1 Pro, 16 GiB; Chrome 155.0.8059.85 driven by Playwright; 1440×1000 viewport, DPR 1, native WebGPU unless stated; isolated local PHP fixtures on 127.0.0.1:8790. No production account/database was used.

The original minified runtime, golden expectations and production state were not changed. No newly demonstrated persistent corruption, unauthorized mutation, duplicated charge or duplicated boss reward was observed. Production remains NO-GO because existing release gates are not closed.

| ID | Severity | Finding | Classification |
|---|---|---|---|
| B01 | P1 | Selecting a visible construction option scrolls the game shell and clips the viewport | CONFIRMED_BROWSER_REPRODUCTION |
| B07 | P1 | Normal continuous source-world input outruns quotas and stalls authoritative movement | CONFIRMED_SOURCE_GAMEPLAY_INPUT_STALL |
| B02 | P2 | Gameplay keyboard input continues beneath a blocking diplomacy decision | CONFIRMED_INPUT_ISOLATION_FAILURE |
| B03 | P2 | A retried save regenerates its operation identity after a lost acknowledgment | CONFIRMED_TRANSPORT_IDEMPOTENCY_FAILURE |
| B04 | P2 | Restored authentication does not resume saving on the same page | CONFIRMED_RECOVERY_UX_LIMIT |
| B05 | P3 | Guardian objective repeats the travel instruction | CONFIRMED_VISIBLE_TEXT_DUPLICATION |
| B06 | P3 | Four unavailable optional bridge imports generate startup 404 errors | CONFIRMED_RETAINED_OPTIONAL_IMPORT_ERRORS |

## B01 — Selecting a visible construction option scrolls the game shell and clips the viewport (P1)

**Reproduce:** Open the authenticated original game at 1440×1000. Enter command mode. Confirm the Solar Grid button is visible (recorded top 845 px, height 74 px). Physically click it, then inspect the canvas and #game-shell scroll position.

**Expected:** Selecting a building keeps the full canvas and HUD aligned within the viewport.

**Observed:** The canvas top changes 0→−382 px and its bottom becomes 618 px; #game-shell scrollTop changes 0→382 while window.scrollY remains 0. The shell has scrollHeight 1660 px and clientHeight 1000 px despite overflow:hidden. Top HUD is clipped and lower map/operations content fills the displaced area.

**Evidence:** [original-asset-audit.json](evidence/original/original-asset-audit.json), [build-menu-layout.png](evidence/original/build-menu-layout.png), [original-physics-retest.json](evidence/original/original-physics-retest.json).

**Suspected subsystem / confidence:** HUD layout, focus/scroll handling and construction selection; exact triggering focus/scroll call is not isolated. High confidence in the symptom, medium confidence in the CSS/focus/scroll cause. Native human browser reproduction and smaller viewports remain to be checked.

**Suggested fix:** Keep the viewport outside scrollable HUD flow; constrain HUD panels and control focus scrolling. Add a physical selection regression asserting canvas rect and shell scroll remain stable.

**Regression:** UNKNOWN. No equivalent historical geometry measurement establishes introduction time.

**Retest:** At 1440×1000 and smaller supported sizes, enter/exit command mode and select every visible building with pointer and keyboard. Canvas remains full-height at the viewport origin, HUD remains reachable, and physical placement uses the intended terrain point.

## B07 — Normal continuous source-world input outruns quotas and stalls authoritative movement (P1)

**Environment:** Same macOS/Chrome host as original tests; independent supervised PHP/SQLite source-world fixture, native WebGL2 foreground canvas, eight independently authenticated browser contexts. One actor remains foreground throughout; seven peers retain normal 1500 ms polling. Principal 240/min and world-IP 600/min quotas unchanged.

**Reproduce:** Open eight authenticated source-world contexts in one isolated world. Keep seven normal polling peers. In the same foreground actor, continuously hold/release alternating movement keys for 60 seconds using the existing UI. Do not rotate actors, reset quotas, coalesce accepted commands or bypass authentication. Observe HTTP status, original outbox, authoritative pose and rendered frames.

**Expected:** Normal continuous controls have an explicit sustainable request budget and responsive authoritative movement. Rate-limit recovery must not conceal a long freeze behind smooth rendering.

**Observed:** During 60000.7 ms, 694 HTTP responses comprised 693×200 and one 429 rate-limited at 21990.78 ms. The foreground submitted 375 movement requests. One pending original command and pending-recovery-required followed; authoritative X stayed 0.4 from about 22.2 to 42.4 seconds and resumed around 43.4 seconds. The renderer still delivered about 60 FPS with frame p99=16.8ms. Outbox drained to 0, all replicas converged and 399 archived commands/1207 events replayed exactly. This is a user responsiveness failure alongside preserved durable authority, not corruption.

**Evidence:** [continuous-input-60s.json](evidence/multiplayer/continuous-input/continuous-input-60s.json), [continuous-input-60s.png](evidence/multiplayer/continuous-input/continuous-input-60s.png), [continuous-source-archive-archive-audit.json](evidence/multiplayer/continuous-input/continuous-source-archive-archive-audit.json).

**Suspected subsystem / confidence:** Source UI command cadence, shared polling budget, per-principal/IP quotas and pending-command backpressure/retry scheduling. PHP/SQLite single-writer durability behaved correctly. High in physical-input/HTTP/pose evidence; exact rate-limit scope should be confirmed from admission metrics before implementation.

**Suggested fix:** Budget UI movement and polling within the unchanged server policy, expose backpressure clearly and preserve/retry the original pending command safely. Do not raise quotas or hide/dismiss throttles to obtain a pass. Distinct accepted command semantics and single-writer authority must remain intact.

**Regression:** UNKNOWN. Earlier short smoke/burst tests did not sustain the same actor long enough; this run reveals a previously uncertified player path.

**Retest:** Repeat 2/4/8-context continuous controls for at least 60 seconds per condition with normal quotas and one unchanged foreground identity. Require bounded measured input-to-authoritative-motion latency throughout, explicit throttling behavior, no multi-second silent freeze, original-command recovery, zero duplicate effects and exact final replay.

## B02 — Gameplay keyboard input continues beneath a blocking diplomacy decision (P2)

**Reproduce:** In a local normal game, allow a diplomatic incident modal to open. Leave its decision unanswered. Try pointer Save/camera controls, then press movement/fire keys and observe player position, health and combat state.

**Expected:** A blocking decision has a clear input scope; background movement/combat hotkeys cannot unintentionally affect gameplay while the decision owns interaction.

**Observed:** The diplomacy modal intercepts pointer events while game.paused remains false and physical movement/combat continues. The timed harness recorded 12 Save and 9 camera timeouts after the unanswered incident, with changing gameplay state and continuing RAF delivery. Leaving the modal unanswered is a harness omission; the modal blocking pointer controls is expected. The inconsistent keyboard scope is the product finding.

**Evidence:** [original-long.json](evidence/original/original-long.json), [original-targeted.json](evidence/original/original-targeted.json), [long-end.png](evidence/original/long-end.png).

**Suspected subsystem / confidence:** Global gameplay keyboard handlers versus diplomacy modal focus/input ownership. High for pointer-versus-keyboard inconsistency; final product policy should define whether simulation itself pauses or only gameplay input is suspended.

**Suggested fix:** Centralize modal input ownership, release held movement controls on open, and route keyboard actions to the decision UI while preserving deliberate multiplayer simulation policy.

**Regression:** UNKNOWN; not newly introduced by this verification.

**Retest:** Open every blocking modal while movement is held, then send movement/fire/build shortcuts. No unintended world command occurs; the modal remains keyboard accessible; intended controls resume after a physical decision.

## B03 — A retried save regenerates its operation identity after a lost acknowledgment (P2)

**Reproduce:** Start from a settled acknowledged save. Physically Save. Let the first actual POST commit, but drop its response. Allow the unchanged transport to retry and compare operation IDs, revisions and duplicate flags.

**Expected:** The same pending save job reuses one persisted operation ID and recovers its original acknowledgment.

**Observed:** The first POST committed revision 190. The retry of sequence 6 used a different timestamp-suffixed operation ID, encountered a stale-revision conflict, then committed revision 191 with duplicate:false. schema.operationId calls Date.now() on each flush. No duplicated charge, resource grant or boss reward was observed; do not classify this as a demonstrated P0 economic duplication.

**Evidence:** [original-persistence.json](evidence/original/original-persistence.json), [schema.js](../../../packages/persistence/src/schema.js), [SaveTransport.js](../../../packages/persistence/src/SaveTransport.js), [save.php](../../../api/save.php).

**Suspected subsystem / confidence:** packages/persistence/src/schema.js operationId; SaveTransport.flush/flushBeacon; api/save.php operation-ID comparison. High: actual commit/lost-reply trace and matching source mechanism. Existing unit tests do not assert stable identity after commit-then-lost-ACK.

**Suggested fix:** Generate operation identity once when creating a job, store it with pending state, and reuse it across retry, beacon and reload. Add actual commit-then-lost-reply regression coverage.

**Regression:** UNKNOWN; present in the existing implementation before BENCH01 changes.

**Retest:** After a committed reply is lost, the same operation ID returns duplicate:true at the original revision; supplies, buildings, XP and claims do not change twice. Repeat across page reload and a competing save.

## B04 — Restored authentication does not resume saving on the same page (P2)

**Reproduce:** Begin with settled authenticated saving. Remove only the isolated test session cookies and verify direct GET 401. Physically Save and wait for an actual POST 401/auth-expired. Restore the original private cookies, verify authenticated GET 200, and physically Save again without reloading.

**Expected:** After authentication is valid again, the player has a visible, safe route to resume the retained pending save.

**Observed:** Real GET/POST 401 and auth-expired were observed. After cookies were restored, the same page remained terminal in auth-expired; a full-page reload recovered and acknowledged the retained job. The transport exposes resume(), but no tested player-facing action resumed it. This is a recoverable usability defect, not proof of permanent save loss or authorization bypass.

**Evidence:** [original-recovery-retest.json](evidence/original/original-recovery-retest.json), [auth-denied-real.png](evidence/original/auth-denied-real.png).

**Suspected subsystem / confidence:** Persistence/authentication lifecycle and player-facing save feedback/recovery. High for this cookie-removal/recovery fixture. Elapsed session TTL and a production identity provider were not tested.

**Suggested fix:** Show the authentication/save failure clearly, offer reauthentication or a documented reload action, then resume retained work only after verified identity continuity.

**Regression:** UNKNOWN. Earlier core tests demonstrate explicit transport.resume(), not the complete player-facing path.

**Retest:** A genuine401 cannot mutate durable state. Reauthentication produces a visible successful recovery with the original pending state preserved; no hidden direct test-only flush/resume is required to certify the user workflow.

## B05 — Guardian objective repeats the travel instruction (P3)

**Reproduce:** Open the original Mission1 objective panel or inspect Mission2 after the first boss victory. Read the Guardian Encounter instruction.

**Expected:** One concise boss objective and one canonical destination instruction.

**Observed:** The objective repeats “Travel to Desert AO to start the boss fight” twice; Mission2 similarly repeats the Wetlands destination. The duplicated text takes scarce HUD space.

**Evidence:** [full-assets.png](evidence/original/full-assets.png), [boss-highlands-result.png](evidence/original/boss-highlands-result.png).

**Suspected subsystem / confidence:** Mission objective label composition and HUD presentation; route text already appears in the objective and is appended again. High, directly visible in screenshots.

**Suggested fix:** Render the canonical boss destination in one place and shorten the objective panel text.

**Regression:** UNKNOWN; no prior screenshot comparison establishes introduction time.

**Retest:** All12mission Guardian objectives show a single correct route instruction in normal and expanded HUD views.

## B06 — Four unavailable optional bridge imports generate startup 404 errors (P3)

**Reproduce:** Launch the unchanged original game and record console/network failures after loading.

**Expected:** A shipped local build resolves enabled integrations or deliberately disables absent optional modules without failed requests.

**Observed:** HarvestRewards.js, BossReplaySettings.js, StructureDesign.js and DefenseTowers.js are unavailable. Four 404 messages and a combined fallback warning are emitted; built-in runtime fallbacks allow gameplay to continue. Separate existing Three duplication/deprecation warnings remain.

**Evidence:** [original-long.json](evidence/original/original-long.json), [original-targeted.json](evidence/original/original-targeted.json).

**Suspected subsystem / confidence:** Compatibility director import manifest and original-game source/build provenance. High. The exact gameplay feature consequences of each absent bridge are not comprehensively certified.

**Suggested fix:** Restore reproducible sources for intended bridges or explicitly disable unavailable optional imports while retaining tested runtime fallbacks. Consolidate Three only through a reviewed reproducible source strategy.

**Regression:** UNCHANGED_HISTORICAL: documented since ZGE00.

**Retest:** A clean boot has no missing integration requests; affected harvesting/boss/build/defense workflows retain their expected semantics and the three golden provenance failures are resolved through approved lineage, not repinning to hide changes.

## Investigation and coverage priorities — excluded from confirmed defect counts

### I01 — Attribute rare frame stalls before setting the release performance budget

**Priority:** P2_INVESTIGATION. **Evidence:** original-analysis.json: full timed capture59.50 FPS,1%low32.31 FPS,106 intervals>33.33 ms,36>100 ms,max316.7 ms; pointer-confirmed prefix59.58 FPS,1%low35.03 FPS.

**Reproduce / expected:** Repeat the same physical scene with fixed viewport/renderer and reduced instrumentation, preserving all raw frames. A scoped frame budget and controlled capture should distinguish rendering/simulation/GC from observer overhead.

**Suspected subsystem / confidence:** Unassigned: gameplay, rendering, streaming, GC and benchmark checkpoint/screenshot instrumentation are candidates. High in observed RAF intervals; insufficient evidence for causal attribution or a new regression.

**Suggested work:** Capture narrow traces around spikes, correlate task/GC/asset/GPU events where supported, and compare instrumented versus minimal observer runs.

**Regression:** NONCOMPARABLE to earlier120Hz interactive measurements. **Retest:** Repeat equivalent scenes, retain inclusive frame distributions, attribute long frames and demonstrate compliance with an explicitly accepted budget.
### I02 — Measure fixed-state retention and reduce renderer/HUD resource pressure

**Priority:** P2_INVESTIGATION. **Evidence:** original-analysis.json: renderer-reported estimate84.72→982.99 MiB, CDP heap48.92→126.75 MiB, performance.memory137.23→832.10 MiB; DOM nodes5796→22716; live listeners184→199; workers5 and intervals31remain bounded.

**Reproduce / expected:** Warm the same content, hold comparable state, sample retained allocations and repeat owned scene/page restart. A defined resource budget and bounded retained owners after equivalent warm states, disposal and repeated restart.

**Suspected subsystem / confidence:** Asset instances, backend resource estimates, HUD DOM churn and normal streaming/GC accounting. High in samples; leak status unresolved. Distinct byte scopes must not be summed or called exact GPU allocations.

**Suggested work:** Use allocation/retaining-path evidence, deterministic warmed scenes and lifecycle audits before optimizing shared ownership/cache limits.

**Regression:** INSUFFICIENT_DATA; no equivalent retained-object baseline. **Retest:** Show plateau or explained bounded growth under fixed-state runs and disposal, while preserving independent animation/material behavior.
### G01 — Complete natural campaign, rank and broader world/boss coverage

**Priority:** RELEASE_CERTIFICATION_GAP. **Evidence:** Two fixtures complete Mission1/Sunscar from final objectives in Desert and Highlands, then unlock Mission2; the natural902.836sloop stays on Mission1.

**Reproduce / expected:** Start a fresh unseeded local campaign and use physical controls for prerequisites, construction and rank progression. Natural end-to-end progression through all 12 missions, rank unlocks and representative world/encounter failure paths.

**Suspected subsystem / confidence:** Campaign/economy/onboarding coverage; absence of certification is not an invented gameplay bug. High in the stated coverage limit.

**Suggested work:** Add recorded natural progression checkpoints and targeted integration cases for remaining missions/bosses; assess early pressure and deaths in human testing.

**Regression:** NOT_APPLICABLE: coverage gap. **Retest:** Each mission and boss is individually exercised, rewards remain once-only after reload, rank gates/unlocks and new-player completion routes are verified.
### G02 — Retain original source, live authority and production security/operations gates

**Priority:** RELEASE_CERTIFICATION_GAP. **Evidence:** Baseline manifests/reports retain absent original reproducible build, three golden mismatches, unresolved historical GLTF attribution, legacy authority and owner-controlled release/security gates.

**Reproduce / expected:** Review the current baseline manifest, clean original build capability and migration/security gate checklist without printing credentials. A reproducible approved artifact lineage, complete writer/effect migration and approved production identity/TLS/operations/credential remediation.

**Suspected subsystem / confidence:** Build provenance, authority migration and release operations. High in documented unmet gates; no production credential mutation or full security audit was attempted in BENCH01.

**Suggested work:** Run an explicitly scoped source/release milestone; retain legacy authority until closure and owner approval.

**Regression:** UNCHANGED_HISTORICAL. **Retest:** Clean approved original build and semantic/golden lineage verification, complete fenced writer/effect coverage, identity/TLS/operational/security postchecks and owner release approval.

## Findings not classified as product failures

- The long run left a diplomatic decision unanswered. Its pointer blocking was expected; the 21timeouts limit uninterrupted-play coverage. Only keyboard leakage beneath the blocking modal is counted as a defect.
- The first outbox test stopped at 30 seconds without retaining enough state. The controlled retest recovered after 36.342 seconds, including real 409conflict handling. This is a measured recoverable delay, not evidence of irreversible save loss.
- The first cookie test restored credentials before an actual denial was proven. The controlled retest records real 401 and auth-expired; the later full-page recovery succeeds.
- The original 900-second run completed before its final Response.status serialization error. Guarded evidence recovery retains that error and all frames; this is a harness defect, not a game crash.
- Initial untargeted collision/protected-site probes had insufficient or invalid setup. The final physical retests show7.816 metres approach, a2.2009 metre stop distance and0sampled grounding error; protected Shared Water placement adds no building.
- Fixture-assisted final objectives and boss fights are valid scoped evidence. They do not become an unseeded full-campaign playthrough.

## Ten prioritized improvements

1. Pace source-world continuous movement and peer polling within normal quotas without silent freezes (B07).
2. Fix construction-selection shell scrolling and verify canvas/HUD alignment (B01).
3. Enforce clear gameplay input ownership while a diplomacy modal is active (B02).
4. Persist one save operation identity across lost acknowledgments, retries and reloads (B03).
5. Expose a working player-facing reauthentication/save recovery path (B04).
6. Attribute and reduce measured frame-time spikes with minimally perturbing comparative traces (I01).
7. Establish fixed-state memory/HUD/asset budgets and retained-object evidence (I02).
8. Remove repeated route text and resolve unavailable optional bridge requests while retaining tested fallbacks (B05/B06).
9. Complete natural campaign/rank/encounter coverage and conduct actual human onboarding/fun testing (G01).
10. Close source/build, live writer and production identity/TLS/security/operations gates before release (G02).

Source-world continuous input: **FAIL** for normal sustained player responsiveness (B07). Durable authority/recovery: **PASS_WITH_LIMITS**; 56 integration tests and 36 exact backend workload conditions passed. Smooth rendering and eventual exact convergence do not erase the observed movement stall. Final Studio browser results remain separate.
