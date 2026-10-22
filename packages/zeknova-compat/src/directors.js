/**
 * Director registry — a verbatim, dependency-declared port of the install chain
 * that `src/main.js` used to run inline after `Game.start()`.
 *
 * Every entry becomes an engine plugin. `install(ctx)` receives the kernel
 * PluginContext plus `ctx.legacy` (see plugin.js):
 *   legacy.user            authenticated officer
 *   legacy.importModule    import relative to src/ (so "./game/X.js" resolves like main.js)
 *   legacy.modules         map of preloaded source modules (filled by "legacy-source-modules")
 *   legacy.game()          the live bundle Game instance (globalThis.ZekNovaGame)
 *   legacy.flags           { worldclaw, sentinelCollector, ... }
 *   legacy.window/document
 *
 * `restart` classifies teardown honesty:
 *   "disposable" — every object the director creates exposes dispose()/teardown()
 *                  and the registry knows how to call it. Eligible for in-page restart.
 *   "page-only"  — at least one created object has no teardown path (verified by
 *                  the ZGE-01 census). Only a full-page restart is lifecycle-safe.
 */
import { installLegacySaveInterceptor } from "../../persistence/src/index.js";
import { installAssetRequestCache, LoaderWatchdog, installWorkerObserver } from "../../assets/src/index.js";

const MODULES = Object.freeze([
  "./game/Game.js", "./game/Player.js", "./game/Enemies.js", "./game/Missions.js", "./game/Buildings.js",
  "./world/Terrain.js", "./world/Collision.js", "./world/Biomes.js", "./multiplayer/MultiplayerClient.js",
  "./ui/MessageCenter.js", "./ui/TeamChat.js", "./game/StrategicAI.js", "./game/RelationsPanel.js",
  "./game/IdentityIntegration.js", "./game/PerceptionEventIntegration.js", "./game/FactionKnowledgeIntegration.js",
  "./game/FactionObservationIntegration.js", "./game/ForestDefensiveActionIntegration.js",
  "./game/ObservationLegalityIntegration.js", "./game/PrimeShadowIntegration.js", "./game/SentinelPrimeExecutor.js",
  "./game/SentinelPrimeR1CanarySession.js", "./game/LiveParityIntegration.js", "./game/ForestDefensiveCommandIntegration.js",
  "./game/ForestDefensiveCommandIntegrationV2.js", "./game/LiveParityClosureIntegration.js",
  "./game/ForestObjectiveScenarioIntegration.js", "./game/SentinelPrimePolicyEvaluationIntegration.js",
]);

export const GAMEPLAY_BRIDGES = Object.freeze(["./game/HarvestRewards.js", "./game/BossReplaySettings.js", "./game/StructureDesign.js", "./game/DefenseTowers.js", "./game/OfficerRank.js"]);

export const GAME_STYLES = Object.freeze([
  ["./assets/index-Bjdqeidf.css", "game-core"], ["./assets/campaign-35cfe1bd.css", "game-campaign"],
  ["./assets/message-center.css?v=azl1", "game-messages"], ["./assets/team-chat.css?v=azl1", "game-chat"],
  ["./assets/weapon-system.css?v=officer-armory1", "game-weapons"], ["./assets/hud-focus.css?v=utility-layout4", "game-hud-focus"],
]);

const mod = (ctx, path) => { const m = ctx.legacy.modules.get(path); if (!m) throw new Error(`source module ${path} was not preloaded`); return m; };
const game = (ctx) => ctx.legacy.game();
const setFlag = (ctx, key, value) => { const root = ctx.legacy.document?.documentElement; if (root) root.dataset[key] = value; };
const disposer = (object, method = "dispose") => () => { if (object && typeof object[method] === "function") object[method](); };

/** @type {Array<{ id: string, requires?: string[], optional?: string[], phase: 'pre-runtime'|'runtime'|'post-runtime', restart: 'disposable'|'page-only', description: string, install: Function, dispose?: Function }>} */
export const DIRECTORS = Object.freeze([
  // ───────────── pre-runtime ─────────────
  {
    id: "persistence-transport", phase: "pre-runtime", restart: "page-only", description: "ZGE-02: acknowledged, coalescing, retrying save transport installed at the fetch boundary before the bundle loads; replaces the swallowed keepalive autosave, restores player XP from the zge extension after gameplay-ready, and uses a beacon only at unload. Page-only because the bundle holds the wrapped fetch for its lifetime.",
    install(ctx) {
      const w = ctx.legacy.window; if (!w || ctx.legacy.flags.persistenceTransport === false) return null;
      const user = ctx.legacy.user; const teamCode = user.teamCode, userId = user.id;
      const handle = installLegacySaveInterceptor({ window: w, teamCode, userId, getGame: () => ctx.legacy.game(), log: (level, message, detail) => ctx.log(level, message, detail), onEvent: (type, detail) => { ctx.events.emit(type, detail); ctx.metrics.counter(type); const root = ctx.legacy.document?.documentElement; if (root && type === "persistence:state") root.dataset.zgePersistence = detail.state; } });
      ctx.setResource("persistence", handle);
      const root = ctx.legacy.document?.documentElement; if (root) root.dataset.zgePersistence = handle.status().state;
      return handle;
    },
    dispose(ctx, handle) { handle?.dispose(); ctx.world.deleteResource("persistence"); },
  },
  {
    id: "asset-consolidation", phase: "pre-runtime", restart: "page-only", description: "ZGE-02: fetch-level GLB/KTX2/WASM request cache with in-flight coalescing, GLTFLoader watchdog (stall reporting) and Worker observer, installed before the bundle so every loader instance shares them. The module de-duplication itself is the import map in index.html.",
    async install(ctx) {
      const w = ctx.legacy.window; if (!w || ctx.legacy.flags.assetConsolidation === false) return null;
      const emit = (type, detail) => { ctx.events.emit(type, detail); ctx.metrics.counter(type); if (type === "asset:load-stalled" || type === "asset:worker-error") ctx.log("warn", `[assets] ${type} ${JSON.stringify(detail).slice(0, 300)}`); };
      const workers = installWorkerObserver(w, { onEvent: emit });
      const cache = installAssetRequestCache(w, { onEvent: emit, budgetBytes: Number(ctx.legacy.flags.assetCacheBudgetBytes) || 64 * 1024 * 1024 });
      const watchdog = new LoaderWatchdog({ stallMs: Number(ctx.legacy.flags.assetStallMs) || 15000, onEvent: emit, workerObserver: workers });
      try { const { GLTFLoader } = await ctx.legacy.importModule("../assets/vendor/GLTFLoader.js"); watchdog.patch(GLTFLoader); } catch (error) { ctx.log("warn", "asset watchdog could not patch GLTFLoader", error); }
      const { getThreeAssetService } = await ctx.legacy.importModule("../packages/assets/src/threeAssetService.js").catch(() => ({ getThreeAssetService: () => null }));
      const parsed = getThreeAssetService();
      const handle = { cache: cache.cache, watchdog, workers, status: () => Object.freeze({ cache: cache.cache.status(), parsed: parsed?.status() ?? null, loader: watchdog.status(), workers: workers?.status() ?? null }), dispose() { watchdog.dispose(); cache.dispose(); parsed?.dispose(); workers?.dispose(); } };
      ctx.setResource("assets", handle);
      return handle;
    },
    dispose(ctx, handle) { handle?.dispose(); ctx.world.deleteResource("assets"); },
  },
  {
    id: "legacy-gameplay-bridges", phase: "pre-runtime", restart: "page-only", description: "Five optional gameplay bridge modules the bundle reads through globalThis (four are absent in the repository; absence degrades to bundle fallbacks).",
    async install(ctx) {
      const missing = [];
      await Promise.all(GAMEPLAY_BRIDGES.map(async (path) => { try { await ctx.legacy.importModule(path); } catch { missing.push(path); } }));
      if (missing.length) ctx.log("warn", `ZekNova gameplay bridges unavailable (${missing.join(", ")}); the runtime bundle's built-in fallbacks remain active.`);
      ctx.metrics.gauge("compat.bridges.missing", missing.length);
      return { missing };
    },
  },
  {
    id: "legacy-source-modules", phase: "pre-runtime", restart: "page-only", description: "Preloads the 28 readable source modules and publishes window.ZekNovaSource (kept for unknown external readers).",
    async install(ctx) {
      const entries = await Promise.all(MODULES.map(async (path) => [path, await ctx.legacy.importModule(path)]));
      for (const [path, module] of entries) ctx.legacy.modules.set(path, module);
      const m = (p) => ctx.legacy.modules.get(p);
      const source = Object.freeze({
        Game: m("./game/Game.js").Game, Player: m("./game/Player.js"), Enemies: m("./game/Enemies.js"), Missions: m("./game/Missions.js"), Buildings: m("./game/Buildings.js"),
        Terrain: m("./world/Terrain.js"), Collision: m("./world/Collision.js"), Biomes: m("./world/Biomes.js"),
        MultiplayerClient: m("./multiplayer/MultiplayerClient.js").MultiplayerClient, MessageCenter: m("./ui/MessageCenter.js").MessageCenter, TeamChat: m("./ui/TeamChat.js").TeamChat,
        StrategicAI: m("./game/StrategicAI.js").StrategicAI, RelationsPanel: m("./game/RelationsPanel.js").RelationsPanel,
        IdentityIntegration: m("./game/IdentityIntegration.js").IdentityIntegration, PerceptionEventIntegration: m("./game/PerceptionEventIntegration.js").PerceptionEventIntegration,
        FactionKnowledgeIntegration: m("./game/FactionKnowledgeIntegration.js").FactionKnowledgeIntegration, FactionObservationIntegration: m("./game/FactionObservationIntegration.js").FactionObservationIntegration,
        ForestDefensiveActionIntegration: m("./game/ForestDefensiveActionIntegration.js").ForestDefensiveActionIntegration, ObservationLegalityIntegration: m("./game/ObservationLegalityIntegration.js").ObservationLegalityIntegration,
        PrimeShadowIntegration: m("./game/PrimeShadowIntegration.js").PrimeShadowIntegration, LiveParityIntegration: m("./game/LiveParityIntegration.js").LiveParityIntegration,
        ForestDefensiveCommandIntegration: m("./game/ForestDefensiveCommandIntegration.js").ForestDefensiveCommandIntegration, ForestDefensiveCommandIntegrationV2: m("./game/ForestDefensiveCommandIntegrationV2.js").ForestDefensiveCommandIntegrationV2,
        LiveParityClosureIntegration: m("./game/LiveParityClosureIntegration.js").LiveParityClosureIntegration, ForestObjectiveScenarioIntegration: m("./game/ForestObjectiveScenarioIntegration.js").ForestObjectiveScenarioIntegration,
        SentinelPrimePolicyEvaluationIntegration: m("./game/SentinelPrimePolicyEvaluationIntegration.js").SentinelPrimePolicyEvaluationIntegration,
      });
      const w = ctx.legacy.window; if (w) w.ZekNovaSource = source;
      setFlag(ctx, "zeknovaModules", Object.keys(source).join(","));
      ctx.setResource("legacy.source", source);
      return { count: entries.length };
    },
  },
  {
    id: "legacy-styles", phase: "pre-runtime", restart: "page-only", description: "Injects the six game stylesheets (idempotent by data-zeknova-style id).",
    install(ctx) {
      const document = ctx.legacy.document; if (!document) return { injected: 0 };
      let injected = 0;
      for (const [href, id] of GAME_STYLES) {
        if (document.querySelector(`link[data-zeknova-style="${id}"]`)) continue;
        const link = document.createElement("link"); link.rel = "stylesheet"; link.href = href; link.dataset.zeknovaStyle = id; document.head.appendChild(link); injected += 1;
      }
      return { injected };
    },
  },
  {
    id: "team-chat", phase: "pre-runtime", restart: "page-only", requires: ["legacy-source-modules"], description: "TeamChat installed before the runtime so every heartbeat carries chat traffic.",
    install(ctx) { const { TeamChat } = mod(ctx, "./ui/TeamChat.js"); const chat = new TeamChat({ user: ctx.legacy.user }); chat.install(); chat.mount(ctx.legacy.document.body); ctx.setResource("legacy.teamChat", chat); return chat; },
  },
  {
    id: "hud-director", phase: "pre-runtime", restart: "page-only", requires: ["team-chat"], description: "Re-tiers the bundle HUD; armed before the runtime, initialises on gameplay-ready.",
    async install(ctx) { const { HudDirector } = await ctx.legacy.importModule("./ui/HudDirector.js"); const hud = new HudDirector({ chat: ctx.getResource("legacy.teamChat") }); hud.arm(); return hud; },
  },
  // ───────────── runtime ─────────────
  {
    id: "legacy-runtime", phase: "runtime", restart: "page-only", requires: ["persistence-transport", "asset-consolidation", "legacy-gameplay-bridges", "legacy-source-modules", "legacy-styles", "team-chat", "hud-director"], failurePolicy: "fatal",
    description: "Loads the authoritative bundle through src/game/Game.js (unchanged) and waits for zeknova:gameplay-ready. Time, physics, gameplay and persistence remain owned by the bundle.",
    async install(ctx) { return ctx.legacy.runtime.start(ctx); },
  },
  // ───────────── post-runtime directors (order = src/main.js order) ─────────────
  {
    id: "construction-shadow", phase: "post-runtime", restart: "disposable", requires: ["legacy-runtime"],
    description: "Optional construction rule comparison; legacy remains the sole live mutator.",
    async install(ctx) {
      const { installConstructionShadow } = await import("./constructionShadow.js");
      const { HUMAN_BUILDINGS } = await ctx.legacy.importModule("./game/Buildings.js");
      const h = installConstructionShadow(game(ctx), { mode: ctx.legacy.flags.constructionAuthority ?? "LEGACY", definitions: Object.values(HUMAN_BUILDINGS ?? {}) });
      ctx.setResource("construction.shadow", h); return h;
    },
    dispose(ctx, h) { h?.dispose(); ctx.world.deleteResource("construction.shadow"); },
  },
  {
    id: "first-fifteen", phase: "post-runtime", restart: "disposable", requires: ["legacy-runtime"], description: "MUSE-ZEK-01 onboarding. ZGE-01 measured 5 leaked listeners per teardown; ZGE-02 made every listener owned and removed in teardown() (re-measured: Δ 0).",
    async install(ctx) { const { FirstFifteenDirector } = await ctx.legacy.importModule("./game/FirstFifteenDirector.js"); const ff = new FirstFifteenDirector({ game: game(ctx) }).install(); if (ff) globalThis.ZekNovaFirstFifteen = ff; return ff; },
    dispose(_ctx, ff) { disposer(ff, "teardown")(); if (globalThis.ZekNovaFirstFifteen === ff) delete globalThis.ZekNovaFirstFifteen; },
  },
  {
    id: "music", phase: "post-runtime", restart: "disposable", requires: ["legacy-runtime"], description: "Authored background score; armed inside the launch gesture.",
    async install(ctx) {
      const { MusicDirector } = await ctx.legacy.importModule("./game/MusicDirector.js"); const music = new MusicDirector({ game: game(ctx) });
      if (music.install()) { music.arm(); globalThis.ZekNovaMusic = Object.freeze({ director: music, snapshot: () => music.snapshot(), setMuted: (m) => music.setMuted(m), setVolume: (v) => music.setVolume(v) }); setFlag(ctx, "zeknovaMusic", "authored-score-v1"); }
      return music;
    },
    dispose(_ctx, music) { disposer(music)(); if (globalThis.ZekNovaMusic?.director === music) delete globalThis.ZekNovaMusic; },
  },
  {
    id: "campaign-finale", phase: "post-runtime", restart: "disposable", requires: ["legacy-runtime"], description: "Campaign ending screen (polls for completion).",
    async install(ctx) {
      const { CampaignFinale } = await ctx.legacy.importModule("./game/CampaignFinale.js"); const finale = new CampaignFinale({ game: game(ctx) });
      if (finale.install()) { globalThis.ZekNovaFinale = Object.freeze({ director: finale, snapshot: () => finale.snapshot(), preview: () => finale.show(finale.constructor === CampaignFinale ? { projects: 12, totalProjects: 12, structures: 60, guardians: 12, biomes: 5, rank: "captain" } : {}) }); setFlag(ctx, "zeknovaFinale", "campaign-ending-v1"); }
      return finale;
    },
    dispose(_ctx, finale) { disposer(finale)(); if (globalThis.ZekNovaFinale?.director === finale) delete globalThis.ZekNovaFinale; },
  },
  {
    id: "render-performance", phase: "post-runtime", restart: "disposable", requires: ["legacy-runtime"], description: "Distance LOD / shadow budget + frame capture.",
    async install(ctx) { const { RenderPerformanceDirector } = await ctx.legacy.importModule("./game/RenderPerformanceDirector.js"); const d = new RenderPerformanceDirector({ game: game(ctx) }).install(); setFlag(ctx, "zeknovaRenderPerformance", "distance-lod-shadow-budget-v1"); ctx.setResource("legacy.renderPerformance", d); return d; },
    dispose(ctx, d) { disposer(d)(); ctx.world.deleteResource("legacy.renderPerformance"); },
  },
  {
    id: "graphics-ownership", phase: "post-runtime", restart: "disposable", requires: ["legacy-runtime"], optional: ["render-performance"], description: "RuntimeGraphicsContext + RenderModelRegistry + performance fixtures/materializer. ZGE-02: dispose() calls both runtime disposers, removes the fixture output node and drops the global (fixture controller owns no timers/listeners).",
    async install(ctx) {
      const runtimeGame = game(ctx); const renderPerformance = ctx.getResource("legacy.renderPerformance") ?? null;
      const [{ RuntimeGraphicsContext }, { RenderModelRegistry }, { PerformanceFixtureController, PERFORMANCE_FIXTURES, fixtureById }, { PerformanceFixtureMaterializer }] = await Promise.all([
        ctx.legacy.importModule("./game/RuntimeGraphicsContext.js"), ctx.legacy.importModule("./game/RenderModelRegistry.js?v=zek18d1"), ctx.legacy.importModule("./game/PerformanceFixtures.js"), ctx.legacy.importModule("./game/PerformanceFixtureMaterializer.js?v=zek19metric5"),
      ]);
      const registry = new RenderModelRegistry({ game: runtimeGame }).install();
      const graphics = new RuntimeGraphicsContext({ game: runtimeGame, registry, capture: renderPerformance });
      const fixtures = new PerformanceFixtureController({ game: runtimeGame, registry, capture: renderPerformance });
      const materializer = PerformanceFixtureMaterializer.allowed() ? new PerformanceFixtureMaterializer({ game: runtimeGame, registry, settled: fixtures, capture: renderPerformance }) : null;
      globalThis.ZekNovaGraphics = Object.freeze({ graphics, registry, fixtures, materializer, definitions: PERFORMANCE_FIXTURES, fixtureById, resetCapture: () => renderPerformance?.resetSamples(), report: () => renderPerformance?.report(), authority: "RECONSTRUCTIBLE_GRAPHICS_BRIDGE_V1" });
      setFlag(ctx, "zeknovaGraphicsOwnership", "explicit-v1");
      if (materializer) {
        const document = ctx.legacy.document; const fixtureId = new URLSearchParams(ctx.legacy.window.location.search).get("performanceFixture");
        const output = document.createElement("output"); output.id = "zeknova-performance-fixture-result"; output.setAttribute("aria-hidden", "true"); output.style.cssText = "position:fixed;opacity:0;pointer-events:none"; document.body.append(output);
        materializer.materialize(fixtureId).then(() => materializer.captureRun()).then(async (result) => {
          let combatCertification = null;
          if (new URLSearchParams(ctx.legacy.window.location.search).has("combatCertification")) { const { certifyLiveCombat } = await ctx.legacy.importModule("./game/CombatLiveCertification.js"); combatCertification = certifyLiveCombat({ game: runtimeGame, results: globalThis.ZekNovaCombatResults?.publisher, feedback: globalThis.ZekNovaCombatFeedback?.director }); }
          output.textContent = JSON.stringify({ ...result, ...(combatCertification ? { combatCertification } : {}) }); output.dataset.status = result.match ? "complete" : "failed";
        }).catch((error) => { output.textContent = JSON.stringify({ fixtureId, match: false, error: String(error?.message || error) }); output.dataset.status = "failed"; });
      }
      return { graphics, registry, fixtures, materializer };
    },
    dispose(ctx, h) { disposer(h?.graphics)(); disposer(h?.registry)(); ctx.legacy.document?.getElementById("zeknova-performance-fixture-result")?.remove(); if (globalThis.ZekNovaGraphics?.graphics === h?.graphics) delete globalThis.ZekNovaGraphics; },
  },
  {
    id: "adaptive-runtime", phase: "post-runtime", restart: "disposable", requires: ["legacy-runtime"], description: "Tiered simulation recommendations (R0) + quality tiers.",
    async install(ctx) { const { AdaptiveSimulationDirector } = await ctx.legacy.importModule("./game/AdaptiveSimulationDirector.js"); const d = new AdaptiveSimulationDirector({ game: game(ctx) }).install(); setFlag(ctx, "zeknovaAdaptiveRuntime", "tiered-r0"); ctx.setResource("legacy.adaptiveDirector", d); return d; },
    dispose(ctx, d) { disposer(d)(); ctx.world.deleteResource("legacy.adaptiveDirector"); },
  },
  {
    id: "worldclaw", phase: "post-runtime", restart: "page-only", requires: ["legacy-runtime"], description: "Developer world-generation tooling (?worldclaw=1); no authority over the live scene.",
    async install(ctx) {
      const { allowed, WorldClawEditor } = await ctx.legacy.importModule("./worldclaw/WorldClawEditor.js");
      if (!allowed()) return null;
      const editor = new WorldClawEditor({ game: game(ctx) });
      if (!editor.install()) return null;
      const [{ WORLDCLAW_AUTHORITY }, { generateDesertCivilisation, describeDesertCivilisation }] = await Promise.all([ctx.legacy.importModule("./worldclaw/WorldClawDirector.js"), ctx.legacy.importModule("./worldclaw/DesertCivilization.js")]);
      globalThis.ZekNovaWorldClaw = Object.freeze({ editor, authority: WORLDCLAW_AUTHORITY, demo: (options) => generateDesertCivilisation(options), describe: (result) => describeDesertCivilisation(result), show: () => editor.showInWorld(), hide: () => editor.removeFromWorld() });
      setFlag(ctx, "zeknovaWorldclaw", "developer-tooling-v1");
      return editor;
    },
  },
  {
    id: "pause-menu", phase: "post-runtime", restart: "page-only", requires: ["legacy-runtime"], description: "Restart control / pause interface (no teardown).",
    async install(ctx) { const { PauseMenuDirector } = await ctx.legacy.importModule("./ui/PauseMenuDirector.js"); return new PauseMenuDirector({ game: game(ctx) }).install(); },
  },
  {
    id: "mission-clarity", phase: "post-runtime", restart: "page-only", requires: ["legacy-runtime"], description: "Mission navigation overlay (no teardown).",
    async install(ctx) { const { MissionClarityDirector } = await ctx.legacy.importModule("./ui/MissionClarityDirector.js"); return new MissionClarityDirector({ game: game(ctx) }).install(); },
  },
  {
    id: "combat-feedback", phase: "post-runtime", restart: "disposable", requires: ["legacy-runtime"], description: "Combat result publisher + feedback/reaction/audio directors. ZGE-02: dispose() tears down publisher, feedback and audio; CombatReactionDirector owns only ≤240 ms self-guarded timeouts and no listeners.",
    async install(ctx) {
      const runtimeGame = game(ctx);
      const [{ CombatFeedbackDirector, COMBAT_FEEDBACK_AUTHORITY }, { CombatResultPublisher, COMBAT_RESULT_AUTHORITY, COMBAT_RESULT_SUPPORT }, { CombatReactionDirector }, { CombatAudioDirector }] = await Promise.all([ctx.legacy.importModule("./game/CombatFeedbackDirector.js"), ctx.legacy.importModule("./game/CombatResult.js"), ctx.legacy.importModule("./game/CombatReactionDirector.js"), ctx.legacy.importModule("./game/CombatAudioDirector.js")]);
      const combatResults = new CombatResultPublisher({ game: runtimeGame }).install();
      const combatReactions = new CombatReactionDirector(); const combatAudio = new CombatAudioDirector();
      const combatFeedback = new CombatFeedbackDirector({ game: runtimeGame, resultSource: combatResults, reactionDirector: combatReactions, audioDirector: combatAudio }).install();
      globalThis.ZekNovaCombatResults = Object.freeze({ publisher: combatResults, snapshot: () => combatResults.snapshot(), authority: COMBAT_RESULT_AUTHORITY, support: COMBAT_RESULT_SUPPORT });
      globalThis.ZekNovaCombatFeedback = Object.freeze({ director: combatFeedback, reactions: combatReactions, audio: combatAudio, snapshot: () => Object.freeze({ feedback: combatFeedback.snapshot(), reactions: combatReactions.snapshot(), audio: combatAudio.snapshot() }), authority: COMBAT_FEEDBACK_AUTHORITY });
      setFlag(ctx, "zeknovaCombatFeedback", "r0-presentation-v1");
      return { combatResults, combatReactions, combatAudio, combatFeedback };
    },
    dispose(_ctx, h) { disposer(h?.combatFeedback)(); disposer(h?.combatResults)(); if (globalThis.ZekNovaCombatFeedback?.director === h?.combatFeedback) delete globalThis.ZekNovaCombatFeedback; if (globalThis.ZekNovaCombatResults?.publisher === h?.combatResults) delete globalThis.ZekNovaCombatResults; },
  },
  { id: "game-mode", phase: "post-runtime", restart: "disposable", requires: ["legacy-runtime"], description: "Civilian/Battle mode separation. ZGE-02: GameModeDirector.dispose() restores the two wrapped methods (identity-guarded), clears its interval and removes its DOM.", async install(ctx) { const { GameModeDirector } = await ctx.legacy.importModule("./game/GameModeDirector.js"); const d = new GameModeDirector({ game: game(ctx) }); d.install(); return d; }, dispose(_ctx, d) { disposer(d)(); } },
  {
    id: "boss-encounter", phase: "post-runtime", restart: "disposable", requires: ["legacy-runtime"], description: "Automatic Guardian routing state machine.",
    async install(ctx) { const { BossEncounterDirector } = await ctx.legacy.importModule("./game/BossEncounterDirector.js"); return new BossEncounterDirector({ game: game(ctx) }).install(); },
    dispose(_ctx, d) { disposer(d)(); },
  },
  {
    id: "physics-bridge", phase: "post-runtime", restart: "disposable", requires: ["legacy-runtime"], description: "Shadow fixed-step physics diagnostics (wraps three bundle update methods; dispose() stops its loop).",
    async install(ctx) { const { PhysicsRuntimeBridge } = await ctx.legacy.importModule("./game/physics/PhysicsRuntimeBridge.js"); return new PhysicsRuntimeBridge({ game: game(ctx) }).install(); },
    dispose(_ctx, d) { disposer(d)(); },
  },
  {
    id: "strategic-state-clock", phase: "post-runtime", restart: "disposable", requires: ["legacy-runtime"], description: "Sentinel Grid strategic quantum clock.",
    async install(ctx) { const m = await ctx.legacy.importModule("./game/StrategicStateClock.js"); const clock = new m.StrategicStateClock({ game: game(ctx) }).install(); ctx.setResource("legacy.quantumProvider", () => clock.currentQuantum()); return clock; },
    dispose(ctx, clock) { disposer(clock)(); ctx.world.deleteResource("legacy.quantumProvider"); },
  },
  {
    id: "identity", phase: "post-runtime", restart: "disposable", requires: ["legacy-runtime", "legacy-source-modules"], description: "W0-O.0 identity capture.",
    install(ctx) { const { IdentityIntegration } = mod(ctx, "./game/IdentityIntegration.js"); const i = new IdentityIntegration({ game: game(ctx) }); i.install(); ctx.setResource("legacy.identity", i); return i; },
    dispose(ctx, i) { disposer(i)(); ctx.world.deleteResource("legacy.identity"); },
  },
  {
    id: "perception", phase: "post-runtime", restart: "disposable", requires: ["identity"], optional: ["strategic-state-clock"], description: "W0-O.1 grounded perception events.",
    install(ctx) { const { PerceptionEventIntegration } = mod(ctx, "./game/PerceptionEventIntegration.js"); const q = ctx.getResource("legacy.quantumProvider"); const p = new PerceptionEventIntegration({ game: game(ctx), identityIntegration: ctx.getResource("legacy.identity"), ...(q ? { quantumProvider: q } : {}) }); p.install(); ctx.setResource("legacy.perception", p); return p; },
    dispose(ctx, p) { disposer(p)(); ctx.world.deleteResource("legacy.perception"); },
  },
  {
    id: "knowledge", phase: "post-runtime", restart: "disposable", requires: ["identity", "perception"], optional: ["strategic-state-clock"], description: "W0-O.2 private faction knowledge ledger.",
    install(ctx) { const { FactionKnowledgeIntegration } = mod(ctx, "./game/FactionKnowledgeIntegration.js"); const q = ctx.getResource("legacy.quantumProvider"); const k = new FactionKnowledgeIntegration({ game: game(ctx), identityIntegration: ctx.getResource("legacy.identity"), perceptionIntegration: ctx.getResource("legacy.perception"), ...(q ? { quantumProvider: q } : {}) }); k.install(); ctx.setResource("legacy.knowledge", k); return k; },
    dispose(ctx, k) { disposer(k)(); ctx.world.deleteResource("legacy.knowledge"); },
  },
  {
    id: "faction-observation", phase: "post-runtime", restart: "disposable", requires: ["identity", "knowledge"], optional: ["strategic-state-clock"], description: "W0-O.3 faction observation vectors.",
    install(ctx) { const { FactionObservationIntegration } = mod(ctx, "./game/FactionObservationIntegration.js"); const q = ctx.getResource("legacy.quantumProvider"); const o = new FactionObservationIntegration({ game: game(ctx), identityIntegration: ctx.getResource("legacy.identity"), knowledgeIntegration: ctx.getResource("legacy.knowledge"), ...(q ? { quantumProvider: q } : {}) }); o.install(); ctx.setResource("legacy.observation", o); return o; },
    dispose(ctx, o) { disposer(o)(); ctx.world.deleteResource("legacy.observation"); },
  },
  {
    id: "forest-actions", phase: "post-runtime", restart: "disposable", requires: ["identity", "faction-observation"], description: "W0-AF read-only Forest defensive action candidates.",
    install(ctx) { const { ForestDefensiveActionIntegration } = mod(ctx, "./game/ForestDefensiveActionIntegration.js"); const f = new ForestDefensiveActionIntegration({ game: game(ctx), identityIntegration: ctx.getResource("legacy.identity"), observationIntegration: ctx.getResource("legacy.observation") }); f.install(); ctx.setResource("legacy.forestActions", f); return f; },
    dispose(ctx, f) { disposer(f)(); ctx.world.deleteResource("legacy.forestActions"); },
  },
  {
    id: "observation-legality", phase: "post-runtime", restart: "disposable", requires: ["identity", "faction-observation"], description: "W0-O.5 observation-sensitive legality masks.",
    install(ctx) { const { ObservationLegalityIntegration } = mod(ctx, "./game/ObservationLegalityIntegration.js"); const l = new ObservationLegalityIntegration({ game: game(ctx), identityIntegration: ctx.getResource("legacy.identity"), observationIntegration: ctx.getResource("legacy.observation") }); l.install(); ctx.setResource("legacy.legality", l); return l; },
    dispose(ctx, l) { disposer(l)(); ctx.world.deleteResource("legacy.legality"); },
  },
  {
    id: "prime-shadow", phase: "post-runtime", restart: "disposable", requires: ["identity", "observation-legality"], description: "W0-O.6 Sentinel Prime shadow policy (R0; runs a local shadow immediately).",
    install(ctx) { const { PrimeShadowIntegration } = mod(ctx, "./game/PrimeShadowIntegration.js"); const s = new PrimeShadowIntegration({ game: game(ctx), identityIntegration: ctx.getResource("legacy.identity"), observationLegalityIntegration: ctx.getResource("legacy.legality"), autoRunOnPerception: true }); s.install(); s.runLocalShadow({ upstreamMaskSource: "w0o6-development-all-open-projection" }); ctx.setResource("legacy.primeShadow", s); return s; },
    dispose(ctx, s) { disposer(s)(); ctx.world.deleteResource("legacy.primeShadow"); },
  },
  {
    id: "relations-panel", phase: "post-runtime", restart: "disposable", requires: ["legacy-runtime", "legacy-source-modules"], description: "Relations HUD panel.",
    install(ctx) { const { RelationsPanel } = mod(ctx, "./game/RelationsPanel.js"); const panel = new RelationsPanel({ game: game(ctx) }); panel.install(); globalThis.ZekNovaRelationsPanel = panel; ctx.setResource("legacy.relationsPanel", panel); return panel; },
    dispose(ctx, panel) { disposer(panel)(); if (globalThis.ZekNovaRelationsPanel === panel) delete globalThis.ZekNovaRelationsPanel; ctx.world.deleteResource("legacy.relationsPanel"); },
  },
  {
    id: "forest-commands-v2", phase: "post-runtime", restart: "disposable", requires: ["identity", "forest-actions", "relations-panel"], optional: ["perception", "knowledge"], description: "W0-P.2 incumbent Forest command runtime (v1 module is loaded for ZekNovaSource but not installed, as in main.js).",
    install(ctx) { const { ForestDefensiveCommandIntegrationV2 } = mod(ctx, "./game/ForestDefensiveCommandIntegrationV2.js"); const c = new ForestDefensiveCommandIntegrationV2({ game: game(ctx), identityIntegration: ctx.getResource("legacy.identity"), forestActionIntegration: ctx.getResource("legacy.forestActions"), perceptionIntegration: ctx.getResource("legacy.perception") ?? null, knowledgeIntegration: ctx.getResource("legacy.knowledge") ?? null, relationsPanel: ctx.getResource("legacy.relationsPanel") }); c.install(); ctx.setResource("legacy.forestCommands", c); return c; },
    dispose(ctx, c) { disposer(c)(); ctx.world.deleteResource("legacy.forestCommands"); },
  },
  {
    id: "prime-executor", phase: "post-runtime", restart: "disposable", requires: ["prime-shadow", "forest-commands-v2"], optional: ["strategic-state-clock"], description: "Sentinel Prime R1 executor + canary session (awaited, R0 awaiting human authorization). ZGE-02: owns no listeners or timers; dispose() drops its globals and evidence reference.",
    async install(ctx) {
      const { SentinelPrimeExecutor } = mod(ctx, "./game/SentinelPrimeExecutor.js"); const { SentinelPrimeR1CanarySession } = mod(ctx, "./game/SentinelPrimeR1CanarySession.js");
      const primeShadowIntegration = ctx.getResource("legacy.primeShadow"); const commandIntegration = ctx.getResource("legacy.forestCommands");
      const primeExecutor = new SentinelPrimeExecutor({ commandIntegration, quantumProvider: ctx.getResource("legacy.quantumProvider") ?? null });
      const controller = Object.freeze({
        status: () => primeExecutor.status(),
        dryRun: (options = {}) => primeExecutor.dryRun(primeShadowIntegration.runLocalShadow(options), options),
        killSwitch: (reason) => primeExecutor.killSwitch(reason),
      });
      globalThis.ZekNovaSentinelPrimeR1 = controller; setFlag(ctx, "zeknovaPrimeAuthority", "r0-awaiting-human-authorization");
      const canary = new SentinelPrimeR1CanarySession({ executor: primeExecutor, shadowIntegration: primeShadowIntegration, commandIntegration, user: ctx.legacy.user });
      const evidence = await canary.run(); if (evidence) globalThis.ZekNovaSentinelPrimeCanaryEvidence = Object.freeze(evidence);
      return { primeExecutor, controller, canary };
    },
    dispose(_ctx, h) { if (globalThis.ZekNovaSentinelPrimeR1 === h?.controller) delete globalThis.ZekNovaSentinelPrimeR1; delete globalThis.ZekNovaSentinelPrimeCanaryEvidence; },
  },
  {
    id: "live-parity", phase: "post-runtime", restart: "disposable", requires: ["identity", "forest-actions"], optional: ["perception", "relations-panel"], description: "W0-P live parity evidence capture.",
    install(ctx) { const { LiveParityIntegration } = mod(ctx, "./game/LiveParityIntegration.js"); const l = new LiveParityIntegration({ game: game(ctx), identityIntegration: ctx.getResource("legacy.identity"), forestActionIntegration: ctx.getResource("legacy.forestActions"), perceptionIntegration: ctx.getResource("legacy.perception") ?? null, relationsPanel: ctx.getResource("legacy.relationsPanel") ?? null }); l.install(); l.captureLocalParity(); return l; },
    dispose(_ctx, l) { disposer(l)(); },
  },
  {
    id: "live-parity-closure", phase: "post-runtime", restart: "disposable", requires: ["identity", "forest-actions", "forest-commands-v2"], description: "W0-P.3 exact command parity closure.",
    install(ctx) { const { LiveParityClosureIntegration } = mod(ctx, "./game/LiveParityClosureIntegration.js"); const l = new LiveParityClosureIntegration({ game: game(ctx), identityIntegration: ctx.getResource("legacy.identity"), forestActionIntegration: ctx.getResource("legacy.forestActions"), commandIntegrationV2: ctx.getResource("legacy.forestCommands") }); l.install(); l.captureLocalClosure(); return l; },
    dispose(_ctx, l) { disposer(l)(); },
  },
  {
    id: "forest-scenarios", phase: "post-runtime", restart: "disposable", requires: ["legacy-runtime", "legacy-source-modules"], description: "Stage 1A-Z failure-possible scenario declarations.",
    install(ctx) { const { ForestObjectiveScenarioIntegration } = mod(ctx, "./game/ForestObjectiveScenarioIntegration.js"); const s = new ForestObjectiveScenarioIntegration(); s.install(); globalThis.ZekNovaForestScenarioDeclaration = s.captureDeclaration(); return s; },
    dispose(_ctx, s) { disposer(s)(); },
  },
  {
    id: "prime-policy-evaluation", phase: "post-runtime", restart: "disposable", requires: ["legacy-runtime", "legacy-source-modules"], description: "Stage 1A-Z.1 offline policy comparison declaration.",
    install(ctx) { const { SentinelPrimePolicyEvaluationIntegration } = mod(ctx, "./game/SentinelPrimePolicyEvaluationIntegration.js"); const p = new SentinelPrimePolicyEvaluationIntegration(); p.install(); globalThis.ZekNovaSentinelPrimePolicyEvaluationDeclaration = p.captureDeclaration(); return p; },
    dispose(_ctx, p) { disposer(p)(); },
  },
  {
    id: "strategic-ai", phase: "post-runtime", restart: "disposable", requires: ["legacy-runtime", "legacy-source-modules"], description: "AZL strategic integration (MoE-PUCT router over the bundle's MCTS worker).",
    async install(ctx) { const { StrategicAI } = mod(ctx, "./game/StrategicAI.js"); const ai = new StrategicAI(); await ai.install({ game: game(ctx) }); return ai; },
    dispose(_ctx, ai) { disposer(ai)(); },
  },
  {
    id: "goban-shadow", phase: "post-runtime", restart: "disposable", requires: ["legacy-runtime"], description: "Sentinel Goban shadow adapters (R0 shadow only). ZGE-02: owns no listeners; one bounded timeout inside runShadow; dispose() drops the global.",
    async install(ctx) {
      const { SentinelGobanShadowIntegration } = await ctx.legacy.importModule("./game/SentinelGobanShadowIntegration.js");
      const gobanShadow = new SentinelGobanShadowIntegration({ game: game(ctx), authenticatedSession: true });
      globalThis.ZekNovaSentinelGobanShadow = Object.freeze({ runShadow: (o) => gobanShadow.runShadow(o), runParityWindow: (o) => gobanShadow.runParityWindow(o), captureEvidence: () => gobanShadow.captureEvidence(), certify: (o) => gobanShadow.certify(o), certifyCoverage: (o) => gobanShadow.certifyCoverage(o), authority: Object.freeze({ tier: "R0_EVALUATION", canDispatch: false, canMutateLiveWorld: false }) });
      gobanShadow.runShadow(); setFlag(ctx, "zeknovaGobanAdapters", "r0-shadow-only"); return gobanShadow;
    },
    dispose() { delete globalThis.ZekNovaSentinelGobanShadow; },
  },
  {
    id: "picasso-visual", phase: "post-runtime", restart: "disposable", requires: ["legacy-runtime"], optional: ["adaptive-runtime"], description: "Picasso Visual Diffuser theme manager (R0 visual-only). ZGE-02: dispose() removes the two window listeners and the theme selector, calls VisualThemeManager.reset() and drops the globals; styled material values persist (idempotent re-apply on reinstall).",
    async install(ctx) {
      const { VisualThemeManager } = await ctx.legacy.importModule("./game/VisualThemeManager.js"); const { Picasso, PICASSO_AUTHORITY } = await ctx.legacy.importModule("./game/Picasso.js");
      const { default: PicassoCombatCertification } = await ctx.legacy.importModule("./game/PicassoCombatCertification.js"); const { createSentinelVisualRouter } = await ctx.legacy.importModule("./game/SentinelExpertRouter.js");
      const visualRouter = createSentinelVisualRouter(); const vtm = new VisualThemeManager({ game: game(ctx), router: visualRouter }).init();
      const adaptive = ctx.getResource("legacy.adaptiveDirector"); if (adaptive) adaptive.visualThemeManager = vtm;
      globalThis.ZekNovaSentinelVisualRouter = visualRouter; globalThis.ZekNovaPicasso = Picasso; globalThis.ZekNovaPicassoAuthority = PICASSO_AUTHORITY; globalThis.ZekNovaPicassoCombatCertification = PicassoCombatCertification; globalThis.ZekNovaVisualThemeManager = vtm;
      setFlag(ctx, "zeknovaVisualTheme", vtm.activeThemeId()); vtm.onThemeChange((profile) => setFlag(ctx, "zeknovaVisualTheme", profile.id));
      const w = ctx.legacy.window; const refresh = () => vtm.refreshVerticalSlice();
      w.addEventListener("zeknova:visual-refresh", refresh); w.addEventListener("zeknova:gameplay-ready", refresh, { once: true });
      const document = ctx.legacy.document;
      const mountThemeSelector = () => { const hud = document.getElementById("hud") || document.body; if (hud && !hud.querySelector('[data-testid="visual-theme-selector"]')) vtm.createThemeSelector({ mount: hud }); };
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountThemeSelector, { once: true }); else mountThemeSelector();
      return { vtm, visualRouter, refresh };
    },
    dispose(ctx, h) {
      const w = ctx.legacy.window; if (h?.refresh && w) { w.removeEventListener("zeknova:visual-refresh", h.refresh); w.removeEventListener("zeknova:gameplay-ready", h.refresh); }
      ctx.legacy.document?.querySelector('[data-testid="visual-theme-selector"]')?.remove();
      try { h?.vtm?.reset?.(); } catch {}
      const adaptive = ctx.getResource("legacy.adaptiveDirector"); if (adaptive && adaptive.visualThemeManager === h?.vtm) adaptive.visualThemeManager = null;
      for (const key of ["ZekNovaSentinelVisualRouter", "ZekNovaPicasso", "ZekNovaPicassoAuthority", "ZekNovaPicassoCombatCertification"]) delete globalThis[key];
      if (globalThis.ZekNovaVisualThemeManager === h?.vtm) delete globalThis.ZekNovaVisualThemeManager;
    },
  },
]);

/**
 * Fallback warnings — the exact console messages src/main.js emitted when a director
 * could not install. The compat plugin logs them on failure so operators see the same
 * wording, and scripts/check-source.mjs asserts the governance phrases here.
 */
export const FALLBACK_WARNINGS = Object.freeze({
  "first-fifteen": "First-fifteen onboarding unavailable; core gameplay is unchanged.",
  "music": "Background score unavailable; gameplay audio is unchanged.",
  "campaign-finale": "Campaign finale unavailable; the campaign still completes.",
  "render-performance": "Render performance director unavailable; gameplay remains at canonical fidelity.",
  "graphics-ownership": "Graphics ownership diagnostics unavailable; canonical runtime ownership is unchanged.",
  "adaptive-runtime": "Adaptive runtime unavailable; deterministic full-fidelity simulation remains active.",
  "worldclaw": "WorldClaw developer tooling is unavailable; the authored world is unchanged.",
  "pause-menu": "Restart control is unavailable; Escape and Resume remain functional.",
  "mission-clarity": "Mission clarity navigation is unavailable; core gameplay continues.",
  "combat-feedback": "Combat feedback is unavailable; authoritative combat continues unchanged.",
  "game-mode": "Civilian/Battle mode separation is unavailable; Battle Mode remains active.",
  "boss-encounter": "Automatic Guardian routing is unavailable; mission progress remains intact.",
  "physics-bridge": "Central physics diagnostics are unavailable; canonical collision remains active.",
  "strategic-state-clock": "[Sentinel Grid] StrategicStateClock unavailable; preserving the pre-patch integration path.",
  "identity": "ZekNova identity integration is unavailable; gameplay continues without W0-O.0 identity capture.",
  "perception": "ZekNova grounded perception events are unavailable; gameplay continues without W0-O.1 event capture.",
  "knowledge": "ZekNova private faction knowledge is unavailable; gameplay continues without W0-O.2 knowledge capture.",
  "faction-observation": "ZekNova faction observations are unavailable; gameplay continues without W0-O.3 observation capture.",
  "forest-actions": "ZekNova Forest defensive action registry is unavailable; gameplay continues without W0-AF read-only action candidates.",
  "observation-legality": "ZekNova observation-sensitive legality is unavailable; gameplay continues without W0-O.5 read-only mask capture.",
  "prime-shadow": "Sentinel Prime shadow mode is unavailable; gameplay continues with no W0-O.6 recommendations or action authority.",
  "forest-commands-v2": "ZekNova incumbent Forest command runtime is unavailable; gameplay continues without W0-P.2 full Forest command handlers or Sentinel authority.",
  "prime-executor": "Sentinel Prime R1 executor is unavailable; R0 shadow mode remains active.",
  "live-parity": "ZekNova live parity measurement is unavailable; gameplay continues without W0-P parity evidence or action authority.",
  "live-parity-closure": "ZekNova live parity closure is unavailable; gameplay continues without W0-P.3 exact command parity evidence or Sentinel authority.",
  "forest-scenarios": "ZekNova Forest objective scenarios are unavailable; gameplay continues without Stage 1A-Z failure-possible scenario declarations or Sentinel authority.",
  "prime-policy-evaluation": "Sentinel Prime policy evaluation is unavailable; gameplay continues without Stage 1A-Z.1 offline policy comparison or Sentinel authority.",
  "strategic-ai": "AZL strategic integration is unavailable; the built-in planner remains active.",
  "goban-shadow": "Sentinel Goban shadow adapters are unavailable; no live control was enabled.",
  "picasso-visual": "Picasso visual theme is unavailable; gameplay continues with default rendering.",
});

export const DIRECTOR_IDS = Object.freeze(DIRECTORS.map((d) => d.id));
export const POST_RUNTIME_DIRECTORS = Object.freeze(DIRECTORS.filter((d) => d.phase === "post-runtime").map((d) => d.id));
export const DISPOSABLE_DIRECTORS = Object.freeze(DIRECTORS.filter((d) => d.restart === "disposable").map((d) => d.id));
export const PAGE_ONLY_DIRECTORS = Object.freeze(DIRECTORS.filter((d) => d.restart === "page-only").map((d) => d.id));
