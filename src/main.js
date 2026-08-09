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
  const [gameModule, Player, Enemies, Missions, Buildings, Terrain, Collision, Biomes, multiplayerModule, messageModule, chatModule, strategicModule, relationsModule, identityModule, perceptionModule, knowledgeModule, observationModule, forestActionModule, observationLegalityModule, primeShadowModule, liveParityModule, forestCommandModule, forestCommandV2Module, liveParityClosureModule, objectiveScenarioModule, primePolicyEvaluationModule] = await Promise.all([
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
  if (identityIntegration && observationLegalityIntegration) {
    try {
      const primeShadowIntegration = new primeShadowModule.PrimeShadowIntegration({
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
