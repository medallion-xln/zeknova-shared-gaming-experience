# ZekNova Engine · Technical Risk Register

Likelihood/Impact: L/M/H. Owner roles refer to the ZGE specialist team. Evidence points to `CURRENT_STATE_AUDIT.md` (CSA) and `CERTIFICATION_RESULTS.md` (CR).

| ID | Risk | L | I | Evidence | Mitigation | Milestone | Owner |
|---|---|---|---|---|---|---|---|
| R01 | **Core game exists only as a minified bundle; no buildable source** | H | H | CSA §1.3 (no `.ts` ever committed), §2.1 | Behaviour-driven extraction behind contract tests and QA states; never attempt a one-shot de-minification | ZGE-01→06 | Architect |
| R02 | **Reproducibility gate regressed** — working-tree bundles ≠ golden hashes; 3 tests red; `npm test` aborts | H (now) | H | CR §0, CSA §1.2 | User decision: commit patch + re-pin, or revert; replace byte gate with behavioural certification in ZGE-01 | ZGE-00/01 | QA |
| R03 | **Silent autosave loss** — keepalive fetch rejected for life of page, error swallowed | H | H | CR §9 (identical body: keepalive fails, non-keepalive 200) | Non-keepalive save with explicit result + retry; keepalive only for the unload beacon; surface `degraded` status | ZGE-04 (hotfix candidate now) | Multiplayer |
| R04 | **GLTF `loadAsync` hang root cause unknown** — only timeouts | M | H | CR §5.1; uncommitted `Promise.race` diffs | Instrument loader queue/KTX2 pool; single loader; reproduce with fixture; treat timeout as degraded status | ZGE-02 | Graphics |
| R05 | Two Three.js instances + seven model-runtime instances, 11× duplicate GLB downloads | H | M | CR §5, console warnings | Single `three` dependency; `AssetManager` cache | ZGE-02 | Graphics |
| R06 | Dual simulation authority (bundle variable-dt loop + shadow fixed-step physics) and method wrapping | H | M | CSA §2.2, `PhysicsRuntimeBridge.js` | Promote physics to authority behind `PhysicsBackend`; delete wrappers | ZGE-02 | Physics |
| R07 | Restart orphans all directors; only reload is safe | H | M | CR §12 | Kernel-owned lifecycle; dispose in reverse order; test | ZGE-01 | Architect |
| R08 | Startup critical path 7–10 s before world (1.4 MB bundle, 51 imports, WebGPU init) | H | M | CR §1 | Code-split kernel; lazy plugins; measure per phase | ZGE-01/02 | Performance |
| R09 | Frame spikes 100–250 ms during streaming; 5 M triangles at first frame; p99 25–50 ms | M | M | CR §11 | Streaming budget; LOD at load; fixture gates ±10 % | ZGE-02/04 | Performance |
| R10 | Entity scaling unmeasured beyond enemy cap; spawn API gated by undocumented rules | M | M | CR §6, §11 | Fixture materializer path; make caps explicit config | ZGE-02 | QA |
| R11 | Player XP not persisted; health repeatedly 1 at spawn near 10 juggernaut patrols | M | M | CR §9, §6 | Add XP to save v5; spawn safety radius as game data | ZGE-03 | Gameplay |
| R12 | Duplicated data tables (src vs inlined bundle) kept in sync by regex | H | M | CSA §2.1, `check-source.mjs` | Single data owner in `games/zeknova`; delete regex gate | ZGE-03 | Gameplay |
| R13 | 61 globals and 77 raw `Game` fields form an untyped public API with unknown external readers (Sentinel collector) | H | M | CSA §2.1 | Resources + typed API; aliases for one milestone; collector reads a published snapshot | ZGE-01/05 | Architect |
| R14 | 12 K lines (61 %) of R0 governance code on the production path; hard-coded loopback endpoint and committed token; `(0,eval)` in report scripts | H | M | CSA §1.1, §2.1 | Opt-in plugin; config-driven endpoint; rotate token; remove eval | ZGE-01/05 | AI |
| R15 | Secrets in deploy directory (`.env.production`) | M | H | CSA §1.1 | Rotate; move outside web root; verify `.htaccess` deny on target Apache | ZGE-00 (user) | Security |
| R16 | Client-authoritative combat/economy; file-lock PHP backend; polling multiplayer | H | M (for engine), H (for public launch) | README; `api/*.php` | `Transport`/`Store` interfaces now; server-authority plugin later | ZGE-04 / 2.0 | Multiplayer |
| R17 | Tests cover unused code (`MultiplayerClient.js`) and byte identity, not behaviour; zero browser tests | H | M | CR §0, §10 | Headless runner + browser smoke in CI from ZGE-01 | ZGE-01 | QA |
| R18 | Rendering/physics extraction changes game feel (knockback, projectile hits, camera) | M | M | CSA §2.2 | Fixture replays + manual playtest per flag flip | ZGE-02/03 | Gameplay |
| R19 | Save schema migration (v1–4 → v5) and live `data/` corpus | M | H | `api/save.php` versions | Migration corpus tests; dual-read period | ZGE-03/06 | Multiplayer |
| R20 | Medallion production auth untestable locally | M | M | `AuthGate.js`, `bootstrap.php` | Staging environment before ZGE-06 | ZGE-06 | Multiplayer |
| R21 | WebGPU variance across devices/browsers (Firefox/Safari fallback, device loss) | M | M | Three docs; Unity 6.6 device filtering precedent | Backend capability probe; device-loss recovery; WebGL 2 parity fixtures | ZGE-02 | Graphics |
| R22 | Repository weight (1.7 GB submodule, 5,307 evidence JSONs, 193 MB models, third bundle copy) slows CI and clones | H | L | CSA §4 | Evidence repo/LFS; models via asset CDN | ZGE-01 | Tools |
| R23 | Sentinel kernel lives outside the repo (`~/Desktop/sentinel-grid`) with absolute paths in `integration.json` | H | L | `sentinel-grid/integration.json` | Adapter resolves kernel by config; absent = disabled | ZGE-05 | AI |
| R24 | Estimation risk: bundle internals are only partially understood (18-layer `initialize`) | H | M | CSA §2.1 | Time-boxed spikes per domain before committing milestone scope | all | Architect |
| R25 | Team continuity: single-developer history (16 commits), no CI, no branch protection | M | H | git log | CI from ZGE-01; PR workflow per `CONTRIBUTING.md` | ZGE-01 | Tools |

Overall migration risk: **High** (driven by R01, R02, R03, R06, R24). It drops to Medium once ZGE-01 proves the compat plugin and ZGE-02 closes R04–R06.
