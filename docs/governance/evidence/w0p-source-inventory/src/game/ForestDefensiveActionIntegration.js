import { forestDefensiveActionContract } from "../world/ForestDefensiveActions.js";
import "../../azl/zeknova-forest-defensive-action-adapter-v1.js";

const DEFAULT_CAPACITIES = Object.freeze({ materials: 40, patrolSlots: 2, readiness: 60, repairCrewSlots: 1 });

export class ForestDefensiveActionIntegration {
  constructor({ game, identityIntegration, observationIntegration, capacityProjectionProvider = null } = {}) {
    if (!game) throw new Error("ForestDefensiveActionIntegration requires the live ZekNova game.");
    if (!identityIntegration?.registry) throw new Error("ForestDefensiveActionIntegration requires W0-O.0 IdentityIntegration.");
    if (!observationIntegration?.captureForFaction) throw new Error("ForestDefensiveActionIntegration requires W0-O.3 FactionObservationIntegration.");
    this.game = game;
    this.identityIntegration = identityIntegration;
    this.observationIntegration = observationIntegration;
    this.capacityProjectionProvider = capacityProjectionProvider;
    this.installed = false;
  }

  install() {
    if (this.installed) return this;
    this.installed = true;
    globalThis.ZekNovaForestDefensiveActionIntegration = this;
    if (globalThis.document?.documentElement) document.documentElement.dataset.zeknovaForestDefensiveActions = "w0af-v1";
    if (typeof globalThis.dispatchEvent === "function" && typeof globalThis.CustomEvent === "function") {
      const C = forestDefensiveActionContract();
      globalThis.dispatchEvent(new CustomEvent("zeknova:forest-defensive-actions-ready", { detail: { actionSpaceId: C.ACTION_SPACE_ID, actionCount: C.ACTION_COUNT, rootStance: C.ROOT_STANCE, authority: C.AUTHORITY } }));
    }
    return this;
  }

  resolveCapacities(factionId, options = {}) {
    if (options.capacities) return { capacities: options.capacities, source: options.capacitySource || "explicit-call" };
    if (typeof this.capacityProjectionProvider === "function") {
      const value = this.capacityProjectionProvider({ factionId, game: this.game, quantum: options.quantum });
      if (!value?.capacities) throw new Error("capacityProjectionProvider must return { capacities, source }.");
      return { capacities: value.capacities, source: String(value.source || "configured-provider") };
    }
    return { capacities: { ...DEFAULT_CAPACITIES }, source: "development-default-no-live-resource-claim" };
  }

  captureForFaction(factionId, options = {}) {
    if (!this.installed) throw new Error("ForestDefensiveActionIntegration is not installed.");
    const C = forestDefensiveActionContract();
    const observation = this.observationIntegration.captureForFaction(factionId, { quantum: options.quantum });
    const projection = this.resolveCapacities(factionId, options);
    const state = C.createPlanningState({ observation, capacities: projection.capacities, capacitySource: projection.source, lifecycle: options.lifecycle, metrics: options.metrics, terminal: options.terminal ?? false, replanBoundary: options.replanBoundary ?? false, rootStance: "defensive" });
    const candidateSet = C.computeCandidateSet(state, observation);
    return globalThis.ZekNovaIdentityContract.stableClone({ observation, state, candidateSet });
  }

  captureLocalActionSet(options = {}) { return this.captureForFaction(this.identityIntegration.humanFactionId, options); }

  projectForFaction(factionId, actionIndex, targetId, options = {}) {
    const bundle = this.captureForFaction(factionId, options);
    const C = forestDefensiveActionContract();
    const outcome = C.projectOutcome(bundle.state, bundle.observation, bundle.candidateSet, actionIndex, targetId ?? null);
    return globalThis.ZekNovaIdentityContract.stableClone({ ...bundle, outcome });
  }

  projectLocalOutcome(actionIndex, targetId, options = {}) { return this.projectForFaction(this.identityIntegration.humanFactionId, actionIndex, targetId, options); }

  dispose() {
    this.installed = false;
    if (globalThis.ZekNovaForestDefensiveActionIntegration === this) globalThis.ZekNovaForestDefensiveActionIntegration = null;
  }
}
