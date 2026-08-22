import { runLoginPage } from "./ui/LoginPage.js";

document.documentElement.dataset.zeknovaSource = "boss-threat1";

function loadGameStyles() {
  const styles = [
    ["./assets/index-Bjdqeidf.css", "game-core"],
    ["./assets/campaign-35cfe1bd.css", "game-campaign"],
    ["./assets/message-center.css?v=azl1", "game-messages"],
    ["./assets/team-chat.css?v=azl1", "game-chat"],
    ["./assets/weapon-system.css?v=officer-armory1", "game-weapons"],
    ["./assets/hud-focus.css?v=utility-layout4", "game-hud-focus"],
    ["./assets/boss-system.css?v=compact-combat3", "game-boss-status"],
    ["./assets/relations-multiplayer.css?v=live-relations2", "game-live-relations"],
    ["./assets/building-relocate.css?v=knight3", "game-building-relocate"],
    ["./assets/picasso-theme.css?v=r0-visual2", "game-picasso-theme"],
    ["./assets/mission-clarity.css?v=clarity2", "game-mission-clarity"],
    ["./assets/game-modes.css?v=civilian1", "game-mode-separation"],
    ["./assets/combat-feedback.css?v=zek20-1", "game-combat-feedback"],
  ];
  for (const [href, id] of styles) {
    if (document.querySelector(`link[data-zeknova-style="${id}"]`)) continue;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.zeknovaStyle = id;
    document.head.appendChild(link);
  }
}

async function launch() {
  const root = document.getElementById("app");
  const { user } = await runLoginPage(root);
  if (!user) throw new Error("An authenticated officer is required to launch ZekNova.");

  loadGameStyles();
  const [gameModule, Player, Enemies, Missions, Buildings, Terrain, Collision, Biomes, multiplayerModule, messageModule, chatModule, strategicModule, relationsModule, identityModule, perceptionModule, knowledgeModule, observationModule, forestActionModule, observationLegalityModule, primeShadowModule, primeExecutorModule, primeCanaryModule, liveParityModule, forestCommandModule, forestCommandV2Module, liveParityClosureModule, objectiveScenarioModule, primePolicyEvaluationModule] = await Promise.all([
    import("./game/Game.js"),
    import("./game/Player.js"),
    import("./game/Enemies.js"),
    import("./game/Missions.js"),
    import("./game/Buildings.js"),
    import("./world/Terrain.js"),
    import("./world/Collision.js"),
    import("./world/Biomes.js"),
    import("./multiplayer/MultiplayerClient.js"),
    import("./ui/MessageCenter.js"),
    import("./ui/TeamChat.js"),
    import("./game/StrategicAI.js"),
    import("./game/RelationsPanel.js"),
    import("./game/IdentityIntegration.js"),
    import("./game/PerceptionEventIntegration.js"),
    import("./game/FactionKnowledgeIntegration.js"),
    import("./game/FactionObservationIntegration.js"),
    import("./game/ForestDefensiveActionIntegration.js"),
    import("./game/ObservationLegalityIntegration.js"),
    import("./game/PrimeShadowIntegration.js"),
    import("./game/SentinelPrimeExecutor.js"),
    import("./game/SentinelPrimeR1CanarySession.js"),
    import("./game/LiveParityIntegration.js"),
    import("./game/ForestDefensiveCommandIntegration.js"),
    import("./game/ForestDefensiveCommandIntegrationV2.js"),
    import("./game/LiveParityClosureIntegration.js"),
    import("./game/ForestObjectiveScenarioIntegration.js"),
    import("./game/SentinelPrimePolicyEvaluationIntegration.js"),
  ]);
  const { HudDirector } = await import("./ui/HudDirector.js");
  const { Game } = gameModule;
  window.ZekNovaSource = Object.freeze({
    Game, Player, Enemies, Missions, Buildings, Terrain, Collision, Biomes,
    MultiplayerClient: multiplayerModule.MultiplayerClient,
    MessageCenter: messageModule.MessageCenter,
    TeamChat: chatModule.TeamChat,
    StrategicAI: strategicModule.StrategicAI,
    RelationsPanel: relationsModule.RelationsPanel,
    IdentityIntegration: identityModule.IdentityIntegration,
    PerceptionEventIntegration: perceptionModule.PerceptionEventIntegration,
    FactionKnowledgeIntegration: knowledgeModule.FactionKnowledgeIntegration,
    FactionObservationIntegration: observationModule.FactionObservationIntegration,
    ForestDefensiveActionIntegration: forestActionModule.ForestDefensiveActionIntegration,
    ObservationLegalityIntegration: observationLegalityModule.ObservationLegalityIntegration,
    PrimeShadowIntegration: primeShadowModule.PrimeShadowIntegration,
    LiveParityIntegration: liveParityModule.LiveParityIntegration,
    ForestDefensiveCommandIntegration: forestCommandModule.ForestDefensiveCommandIntegration,
    ForestDefensiveCommandIntegrationV2: forestCommandV2Module.ForestDefensiveCommandIntegrationV2,
    LiveParityClosureIntegration: liveParityClosureModule.LiveParityClosureIntegration,
    ForestObjectiveScenarioIntegration: objectiveScenarioModule.ForestObjectiveScenarioIntegration,
    SentinelPrimePolicyEvaluationIntegration: primePolicyEvaluationModule.SentinelPrimePolicyEvaluationIntegration,
  });
  document.documentElement.dataset.zeknovaModules = Object.keys(window.ZekNovaSource).join(",");
  // Install before the runtime loads so every heartbeat carries chat traffic.
  const teamChat = new chatModule.TeamChat({ user });
  teamChat.install();
  teamChat.mount(document.body);
  new HudDirector({ chat: teamChat }).arm();
  const game = new Game();
  await game.start({ user });
  let renderPerformance = null;
  try {
    const { RenderPerformanceDirector } = await import("./game/RenderPerformanceDirector.js");
    renderPerformance = new RenderPerformanceDirector({ game: globalThis.ZekNovaGame || game }).install();
    document.documentElement.dataset.zeknovaRenderPerformance = "distance-lod-shadow-budget-v1";
  } catch (error) {
    console.warn("Render performance director unavailable; gameplay remains at canonical fidelity.", error);
  }
  try {
    const runtimeGame = globalThis.ZekNovaGame || game;
    const [{ RuntimeGraphicsContext }, { RenderModelRegistry }, { PerformanceFixtureController, PERFORMANCE_FIXTURES, fixtureById }, { PerformanceFixtureMaterializer }] = await Promise.all([
      import("./game/RuntimeGraphicsContext.js"), import("./game/RenderModelRegistry.js?v=zek18d1"), import("./game/PerformanceFixtures.js"), import("./game/PerformanceFixtureMaterializer.js?v=zek19metric5"),
    ]);
    const registry = new RenderModelRegistry({ game: runtimeGame }).install();
    const graphics = new RuntimeGraphicsContext({ game: runtimeGame, registry, capture: renderPerformance });
    const fixtures = new PerformanceFixtureController({ game: runtimeGame, registry, capture: renderPerformance });
    const materializer = PerformanceFixtureMaterializer.allowed() ? new PerformanceFixtureMaterializer({ game: runtimeGame, registry, settled: fixtures, capture: renderPerformance }) : null;
    globalThis.ZekNovaGraphics = Object.freeze({ graphics, registry, fixtures, materializer, definitions: PERFORMANCE_FIXTURES, fixtureById, resetCapture: () => renderPerformance?.resetSamples(), report: () => renderPerformance?.report(), authority: "RECONSTRUCTIBLE_GRAPHICS_BRIDGE_V1" });
    document.documentElement.dataset.zeknovaGraphicsOwnership = "explicit-v1";
    if (materializer) {
      const fixtureId = new URLSearchParams(location.search).get("performanceFixture");
      const output = document.createElement("output");
      output.id = "zeknova-performance-fixture-result";
      output.setAttribute("aria-hidden", "true");
      output.style.cssText = "position:fixed;opacity:0;pointer-events:none";
      document.body.append(output);
      materializer.materialize(fixtureId).then(() => materializer.captureRun()).then(async result => {
        let combatCertification = null;
        if (new URLSearchParams(location.search).has("combatCertification")) {
          const { certifyLiveCombat } = await import("./game/CombatLiveCertification.js");
          combatCertification = certifyLiveCombat({ game: runtimeGame, results: globalThis.ZekNovaCombatResults?.publisher, feedback: globalThis.ZekNovaCombatFeedback?.director });
        }
        output.textContent = JSON.stringify({ ...result, ...(combatCertification ? { combatCertification } : {}) });
        output.dataset.status = result.match ? "complete" : "failed";
      }).catch(error => {
        output.textContent = JSON.stringify({ fixtureId, match: false, error: String(error?.message || error) });
        output.dataset.status = "failed";
      });
    }
  } catch (error) {
    console.warn("Graphics ownership diagnostics unavailable; canonical runtime ownership is unchanged.", error);
  }
  let adaptiveDirector = null;
  try {
    const { AdaptiveSimulationDirector } = await import("./game/AdaptiveSimulationDirector.js");
    adaptiveDirector = new AdaptiveSimulationDirector({ game: globalThis.ZekNovaGame || game }).install();
    document.documentElement.dataset.zeknovaAdaptiveRuntime = "tiered-r0";
  } catch (error) {
    console.warn("Adaptive runtime unavailable; deterministic full-fidelity simulation remains active.", error);
  }
  try {
    const { PauseMenuDirector } = await import("./ui/PauseMenuDirector.js");
    new PauseMenuDirector({ game: globalThis.ZekNovaGame || game }).install();
  } catch (error) {
    console.warn("Restart control is unavailable; Escape and Resume remain functional.", error);
  }
  try {
    const { MissionClarityDirector } = await import("./ui/MissionClarityDirector.js");
    new MissionClarityDirector({ game: globalThis.ZekNovaGame || game }).install();
  } catch (error) {
    console.warn("Mission clarity navigation is unavailable; core gameplay continues.", error);
  }
  try {
    const runtimeGame = globalThis.ZekNovaGame || game;
    const [{ CombatFeedbackDirector, COMBAT_FEEDBACK_AUTHORITY }, { CombatResultPublisher, COMBAT_RESULT_AUTHORITY, COMBAT_RESULT_SUPPORT }, { CombatReactionDirector }, { CombatAudioDirector }] = await Promise.all([import("./game/CombatFeedbackDirector.js"), import("./game/CombatResult.js"), import("./game/CombatReactionDirector.js"), import("./game/CombatAudioDirector.js")]);
    const combatResults = new CombatResultPublisher({ game: runtimeGame }).install();
    const combatReactions = new CombatReactionDirector();
    const combatAudio = new CombatAudioDirector();
    const combatFeedback = new CombatFeedbackDirector({ game: runtimeGame, resultSource: combatResults, reactionDirector: combatReactions, audioDirector: combatAudio }).install();
    globalThis.ZekNovaCombatResults = Object.freeze({ publisher: combatResults, snapshot: () => combatResults.snapshot(), authority: COMBAT_RESULT_AUTHORITY, support: COMBAT_RESULT_SUPPORT });
    globalThis.ZekNovaCombatFeedback = Object.freeze({ director: combatFeedback, reactions: combatReactions, audio: combatAudio, snapshot: () => Object.freeze({ feedback: combatFeedback.snapshot(), reactions: combatReactions.snapshot(), audio: combatAudio.snapshot() }), authority: COMBAT_FEEDBACK_AUTHORITY });
    document.documentElement.dataset.zeknovaCombatFeedback = "r0-presentation-v1";
  } catch (error) {
    console.warn("Combat feedback is unavailable; authoritative combat continues unchanged.", error);
  }
  try {
    const { GameModeDirector } = await import("./game/GameModeDirector.js");
    new GameModeDirector({ game: globalThis.ZekNovaGame || game }).install();
  } catch (error) {
    console.warn("Civilian/Battle mode separation is unavailable; Battle Mode remains active.", error);
  }
  try {
    const { BossEncounterDirector } = await import("./game/BossEncounterDirector.js");
    new BossEncounterDirector({ game: globalThis.ZekNovaGame || game }).install();
  } catch (error) {
    console.warn("Automatic Guardian routing is unavailable; mission progress remains intact.", error);
  }
  try {
    const { PhysicsRuntimeBridge } = await import("./game/physics/PhysicsRuntimeBridge.js");
    new PhysicsRuntimeBridge({ game: globalThis.ZekNovaGame || game }).install();
  } catch (error) {
    console.warn("Central physics diagnostics are unavailable; canonical collision remains active.", error);
  }
  let strategicStateClock = null;
  let quantumProvider = null;
  try {
    const strategicStateClockModule = await import("./game/StrategicStateClock.js");
    strategicStateClock = new strategicStateClockModule.StrategicStateClock({
      game: globalThis.ZekNovaGame,
    }).install();
    quantumProvider = () => strategicStateClock.currentQuantum();
  } catch (error) {
    console.warn(
      "[Sentinel Grid] StrategicStateClock unavailable; " +
      "preserving the pre-patch integration path.",
      error,
    );
  }
  let identityIntegration = null;
  try {
    identityIntegration = new identityModule.IdentityIntegration({ game: globalThis.ZekNovaGame });
    identityIntegration.install();
  } catch (error) {
    console.warn("ZekNova identity integration is unavailable; gameplay continues without W0-O.0 identity capture.", error);
  }
  let perceptionIntegration = null;
  if (identityIntegration) {
    try {
      perceptionIntegration = new perceptionModule.PerceptionEventIntegration({
        game: globalThis.ZekNovaGame,
        identityIntegration,
        ...(quantumProvider ? { quantumProvider } : {}),
      });
      perceptionIntegration.install();
    } catch (error) {
      console.warn("ZekNova grounded perception events are unavailable; gameplay continues without W0-O.1 event capture.", error);
    }
  }
  let knowledgeIntegration = null;
  if (identityIntegration && perceptionIntegration) {
    try {
      knowledgeIntegration = new knowledgeModule.FactionKnowledgeIntegration({
        game: globalThis.ZekNovaGame,
        identityIntegration,
        perceptionIntegration,
        ...(quantumProvider ? { quantumProvider } : {}),
      });
      knowledgeIntegration.install();
    } catch (error) {
      console.warn("ZekNova private faction knowledge is unavailable; gameplay continues without W0-O.2 knowledge capture.", error);
    }
  }
  let observationIntegration = null;
  if (identityIntegration && knowledgeIntegration) {
    try {
      observationIntegration = new observationModule.FactionObservationIntegration({
        game: globalThis.ZekNovaGame,
        identityIntegration,
        knowledgeIntegration,
        ...(quantumProvider ? { quantumProvider } : {}),
      });
      observationIntegration.install();
    } catch (error) {
      console.warn("ZekNova faction observations are unavailable; gameplay continues without W0-O.3 observation capture.", error);
    }
  }
  let forestDefensiveActionIntegration = null;
  if (identityIntegration && observationIntegration) {
    try {
      forestDefensiveActionIntegration = new forestActionModule.ForestDefensiveActionIntegration({
        game: globalThis.ZekNovaGame,
        identityIntegration,
        observationIntegration,
      });
      forestDefensiveActionIntegration.install();
    } catch (error) {
      console.warn("ZekNova Forest defensive action registry is unavailable; gameplay continues without W0-AF read-only action candidates.", error);
    }
  }
  let observationLegalityIntegration = null;
  if (identityIntegration && observationIntegration) {
    try {
      observationLegalityIntegration = new observationLegalityModule.ObservationLegalityIntegration({
        game: globalThis.ZekNovaGame,
        identityIntegration,
        observationIntegration,
      });
      observationLegalityIntegration.install();
    } catch (error) {
      console.warn("ZekNova observation-sensitive legality is unavailable; gameplay continues without W0-O.5 read-only mask capture.", error);
    }
  }
  let primeShadowIntegration = null;
  if (identityIntegration && observationLegalityIntegration) {
    try {
      primeShadowIntegration = new primeShadowModule.PrimeShadowIntegration({
        game: globalThis.ZekNovaGame,
        identityIntegration,
        observationLegalityIntegration,
        autoRunOnPerception: true,
      });
      primeShadowIntegration.install();
      primeShadowIntegration.runLocalShadow({
        upstreamMaskSource: "w0o6-development-all-open-projection",
      });
    } catch (error) {
      console.warn("Sentinel Prime shadow mode is unavailable; gameplay continues with no W0-O.6 recommendations or action authority.", error);
    }
  }
  const relationsPanel = new relationsModule.RelationsPanel({ game: globalThis.ZekNovaGame });
  relationsPanel.install();
  globalThis.ZekNovaRelationsPanel = relationsPanel;
  let forestDefensiveCommandIntegration = null;
  if (identityIntegration && forestDefensiveActionIntegration) {
    try {
      forestDefensiveCommandIntegration = new forestCommandV2Module.ForestDefensiveCommandIntegrationV2({
        game: globalThis.ZekNovaGame,
        identityIntegration,
        forestActionIntegration: forestDefensiveActionIntegration,
        perceptionIntegration,
        knowledgeIntegration,
        relationsPanel,
      });
      forestDefensiveCommandIntegration.install();
    } catch (error) {
      console.warn("ZekNova incumbent Forest command runtime is unavailable; gameplay continues without W0-P.2 full Forest command handlers or Sentinel authority.", error);
    }
  }
  if (primeShadowIntegration && forestDefensiveCommandIntegration) {
    try {
      const primeExecutor = new primeExecutorModule.SentinelPrimeExecutor({
        commandIntegration: forestDefensiveCommandIntegration,
        quantumProvider,
      });
      const controller = Object.freeze({
        status: () => primeExecutor.status(),
        dryRun: (options = {}) => primeExecutor.dryRun(primeShadowIntegration.runLocalShadow(options), options),
        killSwitch: (reason) => primeExecutor.killSwitch(reason),
      });
      globalThis.ZekNovaSentinelPrimeR1 = controller;
      document.documentElement.dataset.zeknovaPrimeAuthority = "r0-awaiting-human-authorization";
      const canary = new primeCanaryModule.SentinelPrimeR1CanarySession({
        executor: primeExecutor,
        shadowIntegration: primeShadowIntegration,
        commandIntegration: forestDefensiveCommandIntegration,
        user,
      });
      const evidence = await canary.run();
      if (evidence) globalThis.ZekNovaSentinelPrimeCanaryEvidence = Object.freeze(evidence);
    } catch (error) {
      console.warn("Sentinel Prime R1 executor is unavailable; R0 shadow mode remains active.", error);
    }
  }
  if (identityIntegration && forestDefensiveActionIntegration) {
    try {
      const liveParityIntegration = new liveParityModule.LiveParityIntegration({
        game: globalThis.ZekNovaGame,
        identityIntegration,
        forestActionIntegration: forestDefensiveActionIntegration,
        perceptionIntegration,
        relationsPanel,
      });
      liveParityIntegration.install();
      liveParityIntegration.captureLocalParity();
    } catch (error) {
      console.warn("ZekNova live parity measurement is unavailable; gameplay continues without W0-P parity evidence or action authority.", error);
    }
  }
  if (identityIntegration && forestDefensiveActionIntegration && forestDefensiveCommandIntegration) {
    try {
      const liveParityClosureIntegration = new liveParityClosureModule.LiveParityClosureIntegration({
        game: globalThis.ZekNovaGame,
        identityIntegration,
        forestActionIntegration: forestDefensiveActionIntegration,
        commandIntegrationV2: forestDefensiveCommandIntegration,
      });
      liveParityClosureIntegration.install();
      liveParityClosureIntegration.captureLocalClosure();
    } catch (error) {
      console.warn("ZekNova live parity closure is unavailable; gameplay continues without W0-P.3 exact command parity evidence or Sentinel authority.", error);
    }
  }
  try {
    const objectiveScenarioIntegration = new objectiveScenarioModule.ForestObjectiveScenarioIntegration();
    objectiveScenarioIntegration.install();
    globalThis.ZekNovaForestScenarioDeclaration = objectiveScenarioIntegration.captureDeclaration();
  } catch (error) {
    console.warn("ZekNova Forest objective scenarios are unavailable; gameplay continues without Stage 1A-Z failure-possible scenario declarations or Sentinel authority.", error);
  }
  try {
    const primePolicyEvaluationIntegration = new primePolicyEvaluationModule.SentinelPrimePolicyEvaluationIntegration();
    primePolicyEvaluationIntegration.install();
    globalThis.ZekNovaSentinelPrimePolicyEvaluationDeclaration = primePolicyEvaluationIntegration.captureDeclaration();
  } catch (error) {
    console.warn("Sentinel Prime policy evaluation is unavailable; gameplay continues without Stage 1A-Z.1 offline policy comparison or Sentinel authority.", error);
  }
  try {
    const strategicAI = new strategicModule.StrategicAI();
    await strategicAI.install({ game: globalThis.ZekNovaGame });
  } catch (error) {
    console.warn("AZL strategic integration is unavailable; the built-in planner remains active.", error);
  }
  // Sentinel Goban candidate adapters: authenticated live capture, shadow proposals only.
  try {
    const { SentinelGobanShadowIntegration } = await import("./game/SentinelGobanShadowIntegration.js");
    const gobanShadow = new SentinelGobanShadowIntegration({ game: globalThis.ZekNovaGame, authenticatedSession: true });
    globalThis.ZekNovaSentinelGobanShadow = Object.freeze({
      runShadow: (options) => gobanShadow.runShadow(options),
      runParityWindow: (options) => gobanShadow.runParityWindow(options),
      captureEvidence: () => gobanShadow.captureEvidence(),
      certify: (options) => gobanShadow.certify(options),
      certifyCoverage: (options) => gobanShadow.certifyCoverage(options),
      authority: Object.freeze({ tier: "R0_EVALUATION", canDispatch: false, canMutateLiveWorld: false }),
    });
    gobanShadow.runShadow();
    document.documentElement.dataset.zeknovaGobanAdapters = "r0-shadow-only";
  } catch (error) {
    console.warn("Sentinel Goban shadow adapters are unavailable; no live control was enabled.", error);
  }
  // Sentinel Grid — Picasso Visual Diffuser (R0 visual-only, never mutates gameplay)
  try {
    const { VisualThemeManager } = await import("./game/VisualThemeManager.js");
    const { Picasso, PICASSO_AUTHORITY } = await import("./game/Picasso.js");
    const { default: PicassoCombatCertification } = await import("./game/PicassoCombatCertification.js");
    const { createSentinelVisualRouter } = await import("./game/SentinelExpertRouter.js");
    const visualRouter = createSentinelVisualRouter();
    const vtm = new VisualThemeManager({
      game: globalThis.ZekNovaGame,
      router: visualRouter,
    }).init();
    if (adaptiveDirector) adaptiveDirector.visualThemeManager = vtm;
    globalThis.ZekNovaSentinelVisualRouter = visualRouter;
    globalThis.ZekNovaPicasso = Picasso;
    globalThis.ZekNovaPicassoAuthority = PICASSO_AUTHORITY;
    globalThis.ZekNovaPicassoCombatCertification = PicassoCombatCertification;
    globalThis.ZekNovaVisualThemeManager = vtm;
    document.documentElement.dataset.zeknovaVisualTheme = vtm.activeThemeId();
    vtm.onThemeChange((profile) => {
      document.documentElement.dataset.zeknovaVisualTheme = profile.id;
    });
    const refreshVisualTargets = () => vtm.refreshVerticalSlice();
    globalThis.addEventListener("zeknova:visual-refresh", refreshVisualTargets);
    globalThis.addEventListener("zeknova:gameplay-ready", refreshVisualTargets, { once: true });
    // Theme selector mounted into HUD when available — no reload required
    const mountThemeSelector = () => {
      const hud = document.getElementById("hud") || document.body;
      if (hud && !hud.querySelector("[data-testid=\"visual-theme-selector\"]")) {
        vtm.createThemeSelector({ mount: hud });
      }
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", mountThemeSelector, { once: true });
    } else mountThemeSelector();
  } catch (error) {
    console.warn("Picasso visual theme is unavailable; gameplay continues with default rendering.", error);
  }
}

launch().catch((error) => {
  console.error("ZekNova failed to start.", error);
  const root = document.getElementById("app");
  if (root) root.innerHTML = '<main class="fatal-error"><h1>ZekNova could not start</h1><p>Reload the page or contact mission control.</p></main>';
});

// SENTINEL_GRID_STAGE2F_RUNTIME_COLLECTOR_BEGIN
// Read-only Stage 2F-Z provenance collector. Does not execute or mutate game actions.
import './game/Stage2FRuntimeCollectorBinding.js';
// SENTINEL_GRID_STAGE2F_RUNTIME_COLLECTOR_END

// Sentinel Grid Stage 2F-Z exact read-only provider bridge (R0)
import '../sentinel-grid/live-parity/runtime-collector/Stage2FExactProviderBridgeSafe.js';
