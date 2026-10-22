# ZekNova Engine · AI-Native Capabilities

Goal: make intelligent simulation a first-class engine concern while keeping every external intelligence (Sentinel Grid, AZL, LLMs) an **optional adapter** with explicit, enforced authority. The engine must run offline with no model API and no Sentinel kernel.

---

## 1. What exists today (audited)

| Capability | Status | Where | Authority |
|---|---|---|---|
| Scripted NPC behaviour (state strings, 15 Hz) | **Implemented** (bundle `updateEnemyUnit`, juggernaut FSM `stalk/charge/slam/brace`, residents roaming) | bundle | Executes gameplay |
| Abstract colony forward model + UCT MCTS (≤128 sims, depth 6, 13 macro-actions, seeded RNG) in a blob Web Worker | **Implemented** | bundle `zkRunStrategicSearch`, `StrategicAI.js` (MoE-PUCT router), `SentinelExpertRouter.js` | Advisor only (telemetry → HUD/"SCOUT-01") |
| LLM advisor (DeepSeek/OpenAI via PHP proxy, per-user quota + memory file) | **Implemented** (server-side keys) | `api/ai-advisor.php`, `data/advisor-*.json` | Text advice only |
| Entity/faction identity | **Implemented, tested** | `src/world/EntityIdentity.js`, `FactionIdentity.js`, `IdentityIntegration.js`, `azl/zeknova-identity-contract-v1.js` | Observe |
| Grounded perception events (typed, quantised by `StrategicStateClock`) | **Implemented, tested** | `PerceptionEvent.js`, `PerceptionEventIntegration.js` | Observe |
| Private faction knowledge ledger | **Implemented, tested** | `FactionKnowledgeLedger.js`, `FactionKnowledgeIntegration.js` | Observe |
| Faction observation feature vectors (fixed layout/count) | **Implemented, tested** | `FactionObservation.js` (+ contract) | Observe |
| Observation-sensitive legality masks (action space) | **Implemented, tested** | `ObservationLegality.js`, `ForestDefensiveActions.js` | Observe |
| Prime shadow policy (recommendations computed locally from masks) | **Implemented, tested** | `PrimeShadow.js`, `PrimeShadowIntegration.js` | R0 observe |
| Forest defensive **commands** (executable handlers) | **Implemented** (v2) | `ForestDefensiveCommandIntegrationV2.js` | Executed only by player/scripted path; Prime executor gated |
| Prime R1 executor + canary + kill switch | **Implemented**, awaiting human authorisation | `SentinelPrimeExecutor.js`, `SentinelPrimeR1CanarySession.js`, `PrimeR1Authority.js`, `docs/governance/*` | `r0-awaiting-human-authorization` |
| Live parity / closure evidence capture | **Implemented** | `LiveParity*.js`, `sentinel-grid/live-parity/**` | Evidence only |
| Sentinel Grid kernel bridge (Stage 2F-Z collector) | **Implemented**, kernel external (`~/Desktop/sentinel-grid`, v0.9.0), live captures 0, `controlledDecisionStatus: blocked-live-campaign-not-certified` | `sentinel-grid/integration.json`, `Stage2F*` | R0, `canDispatch:false`, `canMutateLiveWorld:false` |
| Goban shadow adapters, expert ablation, policy evaluation, deadline-risk rollout, adversarial generalisation | **Implemented as offline evaluations** with registries/evidence JSON | `src/world/Sentinel*`, `src/world/Prime*`, `docs/governance/*` | Evaluation |
| Adaptive tier recommendations (worker classifier) | **Implemented** | `adaptive-runtime-worker.js` | R0 recommendation |
| WorldClaw agentic world generation (planner → placement → critic → repair) | **Implemented offline**, no live authority | `src/worldclaw/*` | Dev tool |
| Behaviour trees, utility AI, GOAP/HTN planner, learned policies, persistent NPC memory, multi-agent coordination, economies/ecosystems, procedural mission generation, AI-directed world events, agent-driven testing, LLM characters | **Conceptual** (no code) | — | — |

Key fact: ZekNova already has the *hardest* parts of an AI-native loop — a pure, seeded forward model, typed perception, knowledge/legality separation, and an authority ladder with evidence. What it lacks is an engine-level home for them: today they are 12 K lines of integrations bolted onto a `Game` object via `globalThis`.

## 2. Target architecture (`@zge/ai`)

```
                       ┌────────────── Engine kernel ──────────────┐
  World components ──► PerceptionSystem ──► Observation (per agent/faction, masked)
                        │                        │
                        ▼                        ▼
                  KnowledgeLedger          LegalityMask (action space × observation)
                        │                        │
                        └──────────► DecisionRunner ◄─────────── Policy (BT | Utility | Planner | Learned | Remote adapter)
                                           │ proposals (Command, confidence, rationale)
                                           ▼
                                      CommandBus ── AuthorityTier gate ── execute → world mutations (events)
                                           │
                                      EvidenceLog (replayable, hashed)  ──► Sentinel/AZL adapter (optional, outbound only)
```

### 2.1 Interfaces
```ts
interface Agent { id: EntityId; faction: FactionId; sensors: SensorSpec[]; memory: AgentMemory; policy: PolicyRef; tier: 'T0'|'T1'|'T2'|'T3'|'T4'; }
interface Observation { agent: EntityId; tick: number; features: Float32Array /* fixed layout id */; visible: EntityId[]; mask: LegalityMask; }
interface Policy { id: string; kind: 'bt'|'utility'|'planner'|'learned'|'remote'; decide(obs: Observation, mem: AgentMemory, rng: RNG): Proposal[]; }
interface Proposal { command: Command; confidence: number; rationale?: string; authority: AuthorityTier; }   // R0 proposals are logged, never executed
interface AgentMemory { episodic: RingBuffer<MemoryEvent>; semantic: KnowledgeLedger; decay(tick): void; serialize(): Json; }
interface Coordinator { group: EntityId[]; plan(obs: Observation[], mem): GroupPlan; assign(plan): Map<EntityId, Command>; }
interface WorldDirector { evaluate(worldState, metrics): WorldEvent[]; }   // pacing/economy/ecosystem/events; proposals through CommandBus
interface MissionGenerator { generate(seed, worldState, constraints): MissionSpec; validate(spec): Issue[]; }  // reuse WorldClaw validator pattern
interface ModelAdapter { kind: 'sentinel'|'llm'|'custom'; propose(obs): Promise<Proposal[]>; health(): AdapterStatus; }  // network optional, timeout-guarded
```

### 2.2 Authority tiers (engine-enforced)
| Tier | Meaning | Who may hold it |
|---|---|---|
| R0 | Observe + propose; proposals are logged | All adapters by default (Sentinel today) |
| R1 | Execute a declared allow-list of commands inside a canary budget with kill switch | Granted per plugin by project manifest after human sign-off (matches `SENTINEL_PRIME_R1_AUTHORIZATION_MANIFEST`) |
| R2 | Execute within a faction/arena scope | Scripted NPC policies, Coordinators |
| R3 | World-director scope (events, economy) | Built-in WorldDirector |
| Player | Direct input | Input system |

`CommandBus.execute` rejects any command whose token tier is lower than the command's declared tier. The existing 18 `AUTHORITY` objects collapse into plugin manifests.

### 2.3 Built-in policies for 1.0
- **Behaviour trees** (data-defined JSON, ticked by tier interval) — replaces `switch`-string NPC states.
- **Utility AI** (scored considerations) — for residents/economy agents.
- **Planner** — the existing MCTS worker generalised: `ForwardModel` interface (`clone/legal/apply/evaluate/prior`) so any game can plug a model. Seeded, off-thread.
- **Learned policy hook** — `onnxruntime-web` or remote inference behind `ModelAdapter`; never required.
- **Persistent NPC memory** — `AgentMemory` serialized into the save envelope under its own schema id.
- **Multi-agent coordination** — `Coordinator` with role assignment; emergent faction behaviour from shared `KnowledgeLedger` + utility weights per faction.
- **Dynamic economy/ecosystem** — resource flow graph as a system (the utility graph and ore regeneration already model this partially).
- **Procedural missions** — `MissionGenerator` over the objective DSL in `Missions.js`, validated by placement/critic rules from WorldClaw.
- **AI-directed events** — `WorldDirector` proposals (R3) with pacing metrics.
- **Agent-driven testing** — headless runner spawns `Agent`s with test policies; `EvidenceLog` + replay make failures reproducible (the Sentinel live-parity harness is the seed).
- **LLM characters** — `ModelAdapter{kind:'llm'}` via `ai-advisor.php`-style proxy; dialogue only unless granted R1 for an allow-list.

## 3. Sentinel Grid integration (preserved, optional)
- `@zge/ai-sentinel` wraps today's identity/perception/knowledge/legality/shadow/live-parity contracts (`azl/*`, `src/game/*Integration.js`) as one plugin with `authority: R0`.
- Collector endpoint/token move to project manifest; disabled unless configured (removes the hard-coded loopback polling).
- R1 path stays exactly as implemented: executor allow-list, canary session, kill switch, evidence package — but goes through `CommandBus` instead of patching `ForestDefensiveCommandIntegrationV2`.
- Tested capabilities carried over unchanged: 45 contract/integration tests + registries in `docs/governance/`.
- Engine runs with the plugin absent; no Sentinel kernel path is referenced from engine packages.

## 4. Differentiation
No mainstream engine ships perception/knowledge/legality separation, authority-gated command buses, or replayable evidence logs as engine primitives. Unity ML-Agents and Godot/Bevy AI crates are training/behaviour add-ons without authority governance. A browser-native engine whose persistent worlds can host observe-only, canary and fully-authorised agents on the same simulation, with deterministic replay for audit, is a defensible niche — provided the kernel (ZGE-01/02) exists first.
