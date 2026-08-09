import { liveParityContract } from "../world/LiveParity.js";
import "../../azl/zeknova-live-parity-adapter-v1.js";

function hasFunction(value, key) {
  return Boolean(value && typeof value[key] === "function");
}

export class LiveParityIntegration {
  constructor({ game, identityIntegration, forestActionIntegration, perceptionIntegration = null, relationsPanel = null } = {}) {
    if (!game) throw new Error("LiveParityIntegration requires the live ZekNova game.");
    if (!identityIntegration?.humanFactionId) throw new Error("LiveParityIntegration requires W0-O.0 IdentityIntegration.");
    if (!forestActionIntegration?.captureForFaction) throw new Error("LiveParityIntegration requires W0-AF ForestDefensiveActionIntegration.");
    this.game = game;
    this.identityIntegration = identityIntegration;
    this.forestActionIntegration = forestActionIntegration;
    this.perceptionIntegration = perceptionIntegration;
    this.relationsPanel = relationsPanel;
    this.installed = false;
  }

  install() {
    if (this.installed) return this;
    this.installed = true;
    globalThis.ZekNovaLiveParityIntegration = this;
    if (globalThis.document?.documentElement) document.documentElement.dataset.zeknovaLiveParity = "w0p-v1";
    if (typeof globalThis.dispatchEvent === "function" && typeof globalThis.CustomEvent === "function") {
      const C = liveParityContract();
      globalThis.dispatchEvent(new CustomEvent("zeknova:live-parity-ready", {
        detail: { paritySpaceId: C.PARITY_SPACE_ID, actionCount: C.BINDINGS.length, mode: C.MODE, authority: C.AUTHORITY },
      }));
    }
    return this;
  }

  captureRuntimeSurface() {
    const game = this.game;
    const relations = this.relationsPanel || globalThis.ZekNovaRelationsPanel;
    const perception = this.perceptionIntegration || globalThis.ZekNovaPerceptionEventIntegration;
    const C = liveParityContract();
    return C.createRuntimeSurface({
      gameEnemyArray: Array.isArray(game?.enemies),
      gameProcessEnemySpawning: hasFunction(game, "processEnemySpawning"),
      gameResolveDiplomacy: hasFunction(game, "resolveDiplomacy"),
      gameSpawnEnemy: hasFunction(game, "spawnEnemy"),
      gameUpdateEnemies: hasFunction(game, "updateEnemies"),
      perceptionShareEvent: hasFunction(perception, "shareEvent"),
      relationsBeginCeasefire: hasFunction(relations, "beginCeasefire"),
      relationsPerform: hasFunction(relations, "perform"),
      relationsRecordDelta: hasFunction(relations, "recordDelta"),
      relationsUpdateCeasefire: hasFunction(relations, "updateCeasefire"),
      sourceVersion: "zeknova-live-runtime-surface-v1",
    });
  }

  captureForFaction(factionId, options = {}) {
    if (!this.installed) throw new Error("LiveParityIntegration is not installed.");
    const forest = this.forestActionIntegration.captureForFaction(factionId, options);
    const C = liveParityContract();
    const report = C.createParityReport({
      worldId: forest.observation.worldId,
      factionId: forest.observation.factionId,
      quantum: forest.observation.quantum,
      observationId: forest.observation.observationId,
      planningStateId: forest.state.stateId,
      candidateSetId: forest.candidateSet.candidateSetId,
      runtimeSurface: options.runtimeSurface || this.captureRuntimeSurface(),
    });
    return globalThis.ZekNovaIdentityContract.stableClone({
      observation: forest.observation,
      planningState: forest.state,
      candidateSet: forest.candidateSet,
      parityReport: report,
    });
  }

  captureLocalParity(options = {}) {
    return this.captureForFaction(this.identityIntegration.humanFactionId, options);
  }

  dispose() {
    this.installed = false;
    if (globalThis.ZekNovaLiveParityIntegration === this) globalThis.ZekNovaLiveParityIntegration = null;
  }
}
