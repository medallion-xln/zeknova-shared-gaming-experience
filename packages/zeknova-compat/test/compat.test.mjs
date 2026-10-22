import { test } from "node:test";
import assert from "node:assert/strict";
import { createEngine } from "../../core/src/index.js";
import { DIRECTORS, DIRECTOR_IDS, DISPOSABLE_DIRECTORS, PAGE_ONLY_DIRECTORS, installZekNovaCompat, createZekNovaCompatPlugins, FULL_PAGE_RESTART_KEY } from "../src/index.js";

// The order src/main.js executed its installs in (ZGE-00 RUNTIME_ARCHITECTURE.md §1), post-runtime part.
const MAIN_JS_POST_RUNTIME_ORDER = ["construction-shadow","first-fifteen","music","campaign-finale","render-performance","graphics-ownership","adaptive-runtime","worldclaw","pause-menu","mission-clarity","combat-feedback","game-mode","boss-encounter","physics-bridge","strategic-state-clock","identity","perception","knowledge","faction-observation","forest-actions","observation-legality","prime-shadow","relations-panel","forest-commands-v2","prime-executor","live-parity","live-parity-closure","forest-scenarios","prime-policy-evaluation","strategic-ai","goban-shadow","picasso-visual"];

test("registry integrity: unique ids, declared deps exist, every entry classified, 32 post-runtime directors", () => {
  assert.equal(new Set(DIRECTOR_IDS).size, DIRECTOR_IDS.length);
  for (const d of DIRECTORS) {
    for (const dep of [...(d.requires ?? []), ...(d.optional ?? [])]) assert.ok(DIRECTOR_IDS.includes(dep), `${d.id} depends on unknown ${dep}`);
    assert.ok(["disposable", "page-only"].includes(d.restart), `${d.id} must declare restart class`);
    if (d.restart === "disposable") assert.equal(typeof d.dispose, "function", `${d.id} is disposable but has no dispose()`);
    if (d.id === "first-fifteen") assert.equal(d.restart, "disposable");
    assert.ok(d.description.length > 10);
  }
  assert.deepEqual(DIRECTORS.filter((d) => d.phase === "post-runtime").map((d) => d.id), MAIN_JS_POST_RUNTIME_ORDER);
  assert.equal(DISPOSABLE_DIRECTORS.length + PAGE_ONLY_DIRECTORS.length, DIRECTOR_IDS.length);
});

function fakeLegacyEnvironment() {
  const calls = [];
  const dataset = {};
  const document = { documentElement: { dataset }, body: { append() {}, appendChild() {}, querySelector: () => null }, head: { appendChild() {} }, createElement: () => ({ style: {}, dataset: {}, setAttribute() {} }), querySelector: () => null, getElementById: () => null, readyState: "complete", addEventListener() {} };
  const listeners = new Map();
  const window = { fetch: async () => new Response("{}", { status: 200 }), Worker: class { constructor() {} addEventListener() {} terminate() {} }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, navigator: {}, location: { search: "", reload: () => calls.push("reload") }, sessionStorage: { store: new Map(), setItem(k, v) { this.store.set(k, v); }, getItem(k) { return this.store.get(k) ?? null; }, removeItem(k) { this.store.delete(k); } }, addEventListener: (type, fn) => { listeners.set(type, fn); }, removeEventListener() {} };
  const game = { disposed: false, renderer: { backend: { isWebGPUBackend: true } }, player: { xp: 0 }, user: { teamCode: "T", id: "u1" }, enemies: [] };
  class Game { constructor() { this.started = false; } async start({ user }) { if (!user) throw new Error("user"); this.started = true; globalThis.ZekNovaGame = game; globalThis.ZekNovaLegacyBridge = { start() {}, dispose() {} }; listeners.get("zeknova:gameplay-ready")?.({ detail: { elapsedMs: 1, trees: 336 } }); } }
  const stub = (name, { installReturnsSelf = true, teardown = "dispose" } = {}) => class { constructor(opts = {}) { this.opts = opts; this.name = name; calls.push(`new ${name}`); } install() { calls.push(`install ${name}`); return installReturnsSelf ? this : true; } arm() {} mount() {} init() { return this; } runLocalShadow() { return { ok: true }; } captureLocalParity() {} captureLocalClosure() {} captureDeclaration() { return { ok: true }; } runShadow() {} run() { return null; } activeThemeId() { return "zeknova"; } onThemeChange() {} refreshVerticalSlice() {} createThemeSelector() {} status() {} snapshot() { return {}; } [teardown]() { calls.push(`${teardown} ${name}`); } };
  const modules = {
    "./game/Game.js": { Game }, "./ui/TeamChat.js": { TeamChat: stub("TeamChat") }, "./ui/HudDirector.js": { HudDirector: stub("HudDirector") },
    "./game/FirstFifteenDirector.js": { FirstFifteenDirector: stub("FirstFifteen", { teardown: "teardown" }) }, "./game/MusicDirector.js": { MusicDirector: stub("Music") }, "./game/CampaignFinale.js": { CampaignFinale: stub("Finale") },
    "./game/RenderPerformanceDirector.js": { RenderPerformanceDirector: stub("RenderPerf") }, "./game/RuntimeGraphicsContext.js": { RuntimeGraphicsContext: stub("Graphics") }, "./game/RenderModelRegistry.js?v=zek18d1": { RenderModelRegistry: stub("Registry") }, "./game/PerformanceFixtures.js": { PerformanceFixtureController: stub("Fixtures"), PERFORMANCE_FIXTURES: [], fixtureById: () => null }, "./game/PerformanceFixtureMaterializer.js?v=zek19metric5": { PerformanceFixtureMaterializer: Object.assign(stub("Materializer"), { allowed: () => false }) },
    "./game/AdaptiveSimulationDirector.js": { AdaptiveSimulationDirector: stub("Adaptive") }, "./worldclaw/WorldClawEditor.js": { allowed: () => false, WorldClawEditor: stub("WorldClaw") }, "./ui/PauseMenuDirector.js": { PauseMenuDirector: stub("Pause") }, "./ui/MissionClarityDirector.js": { MissionClarityDirector: stub("Clarity") },
    "./game/CombatFeedbackDirector.js": { CombatFeedbackDirector: stub("CombatFeedback"), COMBAT_FEEDBACK_AUTHORITY: {} }, "./game/CombatResult.js": { CombatResultPublisher: stub("CombatResults"), COMBAT_RESULT_AUTHORITY: {}, COMBAT_RESULT_SUPPORT: {} }, "./game/CombatReactionDirector.js": { CombatReactionDirector: stub("Reactions") }, "./game/CombatAudioDirector.js": { CombatAudioDirector: stub("CombatAudio") },
    "./game/GameModeDirector.js": { GameModeDirector: stub("GameMode") }, "./game/BossEncounterDirector.js": { BossEncounterDirector: stub("Boss") }, "./game/physics/PhysicsRuntimeBridge.js": { PhysicsRuntimeBridge: stub("Physics") }, "./game/StrategicStateClock.js": { StrategicStateClock: class extends stub("Clock") { currentQuantum() { return 1; } } },
    "./game/SentinelGobanShadowIntegration.js": { SentinelGobanShadowIntegration: stub("Goban") }, "./game/VisualThemeManager.js": { VisualThemeManager: stub("VTM") }, "./game/Picasso.js": { Picasso: {}, PICASSO_AUTHORITY: {} }, "./game/PicassoCombatCertification.js": { default: {} }, "./game/SentinelExpertRouter.js": { createSentinelVisualRouter: () => ({}) },
  };
  for (const path of ["./game/Player.js","./game/Enemies.js","./game/Missions.js","./game/Buildings.js","./world/Terrain.js","./world/Collision.js","./world/Biomes.js","./ui/MessageCenter.js"]) modules[path] = { MessageCenter: stub("MessageCenter") };
  modules["./multiplayer/MultiplayerClient.js"] = { MultiplayerClient: stub("MP") };
  for (const [path, name] of [["./game/StrategicAI.js","StrategicAI"],["./game/RelationsPanel.js","RelationsPanel"],["./game/IdentityIntegration.js","IdentityIntegration"],["./game/PerceptionEventIntegration.js","PerceptionEventIntegration"],["./game/FactionKnowledgeIntegration.js","FactionKnowledgeIntegration"],["./game/FactionObservationIntegration.js","FactionObservationIntegration"],["./game/ForestDefensiveActionIntegration.js","ForestDefensiveActionIntegration"],["./game/ObservationLegalityIntegration.js","ObservationLegalityIntegration"],["./game/PrimeShadowIntegration.js","PrimeShadowIntegration"],["./game/SentinelPrimeExecutor.js","SentinelPrimeExecutor"],["./game/SentinelPrimeR1CanarySession.js","SentinelPrimeR1CanarySession"],["./game/LiveParityIntegration.js","LiveParityIntegration"],["./game/ForestDefensiveCommandIntegration.js","ForestDefensiveCommandIntegration"],["./game/ForestDefensiveCommandIntegrationV2.js","ForestDefensiveCommandIntegrationV2"],["./game/LiveParityClosureIntegration.js","LiveParityClosureIntegration"],["./game/ForestObjectiveScenarioIntegration.js","ForestObjectiveScenarioIntegration"],["./game/SentinelPrimePolicyEvaluationIntegration.js","SentinelPrimePolicyEvaluationIntegration"]]) modules[path] = { [name]: stub(name) };
  const importModule = async (path) => { if (path === "../assets/vendor/GLTFLoader.js") return { GLTFLoader: class { load() {} } }; if (path.startsWith("./game/HarvestRewards") || path.startsWith("./game/BossReplaySettings") || path.startsWith("./game/StructureDesign") || path.startsWith("./game/DefenseTowers")) throw new Error("404"); if (path === "./game/OfficerRank.js") return {}; const m = modules[path]; if (!m) throw new Error(`no stub for ${path}`); return m; };
  return { calls, dataset, document, window, game, Game, importModule };
}

test("ZekNova runs through the kernel boundary: install order == main.js order, legacy runtime owns time, no duplicate installs", async () => {
  const env = fakeLegacyEnvironment();
  const engine = createEngine({ scheduler: "manual", clock: { mode: "delegated" } });
  const compat = installZekNovaCompat(engine, { user: { id: "u1", displayName: "Audit", teamCode: "T" }, Game: env.Game, importModule: env.importModule, window: env.window, document: env.document });
  await engine.start();
  const diag = engine.plugins.diagnostics();
  assert.equal(diag.counts.failed ?? 0, 0, JSON.stringify(diag.plugins.filter((p) => p.status === "failed")));
  const order = diag.order.filter((id) => MAIN_JS_POST_RUNTIME_ORDER.includes(id));
  assert.deepEqual(order, MAIN_JS_POST_RUNTIME_ORDER, "dependency resolution must reproduce the main.js install order");
  assert.equal(diag.order.indexOf("legacy-runtime") < diag.order.indexOf("first-fifteen"), true);
  assert.equal(diag.order.indexOf("hud-director") < diag.order.indexOf("legacy-runtime"), true);
  assert.ok(diag.order.indexOf("persistence-transport") < diag.order.indexOf("legacy-runtime") && diag.order.indexOf("asset-consolidation") < diag.order.indexOf("legacy-runtime"), "ZGE-02 pre-runtime directors install before the bundle loads");
  assert.equal(env.calls.filter((c) => c === "install Music").length, 1);
  assert.equal(engine.clock.mode, "delegated"); engine.frame(0); engine.frame(16); assert.equal(engine.clock.stepNumber, 0);
  assert.equal(compat.ownership().timeOwner.includes("delegated"), true);
  assert.equal(engine.world.getResource("legacy.game"), env.game);
  assert.equal(env.dataset.zeknovaMusic, "authored-score-v1"); assert.equal(env.dataset.zeknovaPrimeAuthority, "r0-awaiting-human-authorization");
  assert.equal(await engine.initialize(), false, "second initialize is a no-op");
  await engine.dispose();
});

test("in-page restart only covers directors with complete teardown and no page-only dependents; the rest is page-only", async () => {
  const env = fakeLegacyEnvironment();
  const engine = createEngine({ scheduler: "manual", clock: { mode: "delegated" } });
  const compat = installZekNovaCompat(engine, { user: { id: "u1", teamCode: "T" }, Game: env.Game, importModule: env.importModule, window: env.window, document: env.document });
  await engine.start();
  const restartable = compat.inPageRestartable();
  assert.equal(restartable.length, DISPOSABLE_DIRECTORS.length, "ZGE-02: every disposable director is free of page-only dependents");
  for (const id of ["legacy-runtime", "pause-menu", "mission-clarity", "hud-director", "team-chat", "worldclaw", "persistence-transport", "asset-consolidation"]) assert.ok(!restartable.includes(id), `${id} must stay page-only`);
  for (const id of ["prime-shadow", "identity", "prime-executor", "forest-commands-v2", "game-mode", "combat-feedback", "graphics-ownership", "picasso-visual", "first-fifteen"]) assert.ok(restartable.includes(id), `${id} became in-page restartable in ZGE-02`);
  for (const id of ["music", "campaign-finale", "boss-encounter", "physics-bridge", "strategic-ai"]) assert.ok(restartable.includes(id), `${id} should be in-page restartable`);
  const before = env.calls.length;
  const result = await compat.restartDirectorLayer();
  assert.equal(result.certified, true); assert.equal(result.legacyRuntimeRestarted, false);
  assert.deepEqual(result.disposed.slice().sort(), restartable.slice().sort()); assert.deepEqual(result.installed.slice().sort(), restartable.slice().sort());
  const after = env.calls.slice(before);
  assert.ok(after.includes("dispose Music") && after.includes("dispose Finale"), "disposers ran");
  assert.equal(after.filter((c) => c === "install Music").length, 1);
  await assert.rejects(() => engine.plugins.reinstall(["identity"], engine.context), /reinstall refused/);
  await engine.dispose();
});

test("full-page restart path sets a marker and reloads; marker is consumed once", () => {
  const env = fakeLegacyEnvironment();
  const engine = createEngine({ scheduler: "manual", clock: { mode: "delegated" } });
  const compat = installZekNovaCompat(engine, { user: { id: "u9", teamCode: "T" }, Game: env.Game, importModule: env.importModule, window: env.window, document: env.document });
  compat.requestFullPageRestart({ reason: "test" });
  assert.deepEqual(env.calls, ["reload"]);
  const marker = compat.consumeFullPageRestartMarker(env.window);
  assert.equal(marker.reason, "test"); assert.equal(marker.user.id, "u9");
  assert.equal(env.window.sessionStorage.getItem(FULL_PAGE_RESTART_KEY), null);
  assert.equal(compat.consumeFullPageRestartMarker(env.window), null);
});

test("a failing director is isolated: the game still reaches ready and dependents are skipped", async () => {
  const env = fakeLegacyEnvironment();
  const broken = DIRECTORS.map((d) => d.id === "identity" ? { ...d, install() { throw new Error("identity exploded"); } } : d);
  const engine = createEngine({ scheduler: "manual", clock: { mode: "delegated" } });
  installZekNovaCompat(engine, { user: { id: "u1", teamCode: "T" }, Game: env.Game, importModule: env.importModule, window: env.window, document: env.document, directors: broken });
  await engine.start();
  const diag = engine.plugins.diagnostics();
  assert.equal(diag.plugins.find((p) => p.id === "legacy-runtime").status, "started");
  assert.equal(diag.plugins.find((p) => p.id === "identity").status, "failed");
  assert.equal(diag.plugins.find((p) => p.id === "perception").status, "skipped");
  assert.equal(diag.plugins.find((p) => p.id === "music").status, "started");
  await engine.dispose();
});

test("compat refuses to start without an officer and the runtime host refuses a second in-page start", async () => {
  const env = fakeLegacyEnvironment();
  assert.throws(() => createZekNovaCompatPlugins({ user: null, Game: env.Game, importModule: env.importModule }), /authenticated officer/);
  const { runtime } = createZekNovaCompatPlugins({ user: { id: "x", teamCode: "T" }, Game: env.Game, importModule: env.importModule, window: env.window, document: env.document });
  await runtime.start(null);
  await assert.rejects(() => runtime.start(null), /full-page restart/);
});

test("repeated director-layer restart cycles are stable: same restartable set, no failures, balanced install/dispose counts", async () => {
  const env = fakeLegacyEnvironment();
  const engine = createEngine({ scheduler: "manual", clock: { mode: "delegated" } });
  const compat = installZekNovaCompat(engine, { user: { id: "u1", teamCode: "T" }, Game: env.Game, importModule: env.importModule, window: env.window, document: env.document });
  await engine.start();
  const first = compat.inPageRestartable();
  for (let cycle = 0; cycle < 5; cycle += 1) { const r = await compat.restartDirectorLayer(); assert.equal(r.certified, true, `cycle ${cycle}`); assert.deepEqual(compat.inPageRestartable(), first); }
  const installs = env.calls.filter((c) => c === "install Music").length, disposes = env.calls.filter((c) => c === "dispose Music").length;
  assert.equal(installs, 6); assert.equal(disposes, 5);
  assert.equal(engine.plugins.diagnostics().counts.failed ?? 0, 0);
  await engine.dispose(); assert.equal(engine.lifecycle.state, "disposed");
});

test('construction shadow observes one legacy mutation, never persists a prediction, and restores method identity',async()=>{
 const { installConstructionShadow }=await import('../src/constructionShadow.js');
 const resources={stone:10};const game={buildings:{selectedType:'hut',records:[],isValidSite:()=>true,siteHeight:()=>2,effectiveCost:()=>({stone:4}),place(point,inventory){inventory.stone-=4;const row={type:'hut',...point};this.records.push(row);return row;}}};
 const original=game.buildings.place;const h=installConstructionShadow(game,{mode:'SHADOW',definitions:[{type:'hut',cost:{stone:4}}]});
 const row=game.buildings.place({x:1,z:2},resources,{});assert.equal(row.type,'hut');assert.equal(resources.stone,6);assert.equal(game.buildings.records.length,1);assert.equal(h.status().mismatches,0);assert.equal('shadow' in game,false);
 h.dispose();assert.equal(game.buildings.place,original);assert.throws(()=>installConstructionShadow(game,{mode:'ENGINE'}),/not certified/);
});
test('combat audio releases its context once across repeated disposal',async()=>{
 const { CombatAudioDirector }=await import('../../../src/game/CombatAudioDirector.js');const audio=new CombatAudioDirector();let closes=0;audio.context={state:'suspended',close(){closes++;return Promise.resolve();}};audio.dispose();audio.dispose();assert.equal(closes,1);
});
