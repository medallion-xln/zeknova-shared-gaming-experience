import { liveParityClosureContract } from "../world/LiveParityClosure.js";
import "../../azl/zeknova-live-parity-closure-adapter-v1.js";

function hasFunction(value, key) {
  return Boolean(value && typeof value[key] === "function");
}

export class LiveParityClosureIntegration {
  constructor({ game, identityIntegration, forestActionIntegration, commandIntegrationV2 = null } = {}) {
    if (!game) throw new Error("LiveParityClosureIntegration requires the live ZekNova game.");
    if (!identityIntegration?.humanFactionId) throw new Error("LiveParityClosureIntegration requires W0-O.0 IdentityIntegration.");
    if (!forestActionIntegration?.captureForFaction) throw new Error("LiveParityClosureIntegration requires W0-AF ForestDefensiveActionIntegration.");
    this.game = game;
    this.identityIntegration = identityIntegration;
    this.forestActionIntegration = forestActionIntegration;
    this.commandIntegrationV2 = commandIntegrationV2;
    this.installed = false;
  }

  install() {
    if (this.installed) return this;
    this.installed = true;
    globalThis.ZekNovaLiveParityClosureIntegration = this;
    if (globalThis.document?.documentElement) document.documentElement.dataset.zeknovaLiveParityClosure = "w0p3-v1";
    if (typeof globalThis.dispatchEvent === "function" && typeof globalThis.CustomEvent === "function") {
      const C = liveParityClosureContract();
      globalThis.dispatchEvent(new CustomEvent("zeknova:live-parity-closure-ready", {
        detail: { paritySpaceId: C.PARITY_SPACE_ID, actionCount: C.BINDINGS.length, mode: C.MODE, authority: C.AUTHORITY },
      }));
    }
    return this;
  }

  captureRuntimeSurface() {
    const C = liveParityClosureContract();
    const commandContract = globalThis.ZekNovaForestDefensiveCommandContractV2;
    const runtime = this.commandIntegrationV2 || globalThis.ZekNovaForestDefensiveCommandIntegrationV2;
    const controller = globalThis.ZekNovaIncumbentForestCommandControllerV2;
    const adapter = globalThis.ZEK_FOREST_DEFENSIVE_COMMAND_ADAPTER_V2;
    const supported = Array.isArray(controller?.supportedActionIndexes) ? controller.supportedActionIndexes.length : 0;
    return C.createRuntimeSurface({
      commandContractV2: Boolean(commandContract && commandContract.CONTRACT_ID === "zeknova-forest-defensive-command-contract-v2" && commandContract.COMMAND_DEFINITIONS?.length === 13),
      commandIntegrationV2: Boolean(runtime && hasFunction(runtime, "captureRuntimeSnapshot") && hasFunction(runtime, "getCommand")),
      forestActionIntegration: hasFunction(this.forestActionIntegration, "captureForFaction"),
      incumbentControllerV2: Boolean(controller && controller.id === "zeknova-incumbent-forest-command-controller-v2" && hasFunction(controller, "issue") && hasFunction(controller, "advanceToQuantum")),
      publicAdapterV2: Boolean(adapter && adapter.id === "zeknova-forest-defensive-command-adapter-v2" && adapter.actionCount === 13 && !hasFunction(adapter, "issue") && !hasFunction(adapter, "execute") && !hasFunction(adapter, "dispatch") && !hasFunction(adapter, "apply")),
      registryBindingCount: Number(commandContract?.COMMAND_DEFINITIONS?.length || 0),
      sourceVersion: "zeknova-live-parity-closure-runtime-surface-v1",
      supportedActionCount: supported,
    });
  }

  captureForFaction(factionId, options = {}) {
    if (!this.installed) throw new Error("LiveParityClosureIntegration is not installed.");
    const before = this.commandIntegrationV2?.captureRuntimeSnapshot?.() || globalThis.ZekNovaForestDefensiveCommandIntegrationV2?.captureRuntimeSnapshot?.() || null;
    const forest = this.forestActionIntegration.captureForFaction(factionId, options);
    const C = liveParityClosureContract();
    const report = C.createClosureReport({
      worldId: forest.observation.worldId,
      factionId: forest.observation.factionId,
      quantum: forest.observation.quantum,
      observationId: forest.observation.observationId,
      planningStateId: forest.state.stateId,
      candidateSetId: forest.candidateSet.candidateSetId,
      runtimeSurface: options.runtimeSurface || this.captureRuntimeSurface(),
    });
    const after = this.commandIntegrationV2?.captureRuntimeSnapshot?.() || globalThis.ZekNovaForestDefensiveCommandIntegrationV2?.captureRuntimeSnapshot?.() || null;
    if (before && after && globalThis.ZekNovaIdentityContract.canonicalStringify(before) !== globalThis.ZekNovaIdentityContract.canonicalStringify(after)) {
      throw new Error("Parity closure capture mutated the command runtime.");
    }
    return globalThis.ZekNovaIdentityContract.stableClone({
      observation: forest.observation,
      planningState: forest.state,
      candidateSet: forest.candidateSet,
      closureReport: report,
    });
  }

  captureLocalClosure(options = {}) {
    return this.captureForFaction(this.identityIntegration.humanFactionId, options);
  }

  dispose() {
    this.installed = false;
    if (globalThis.ZekNovaLiveParityClosureIntegration === this) globalThis.ZekNovaLiveParityClosureIntegration = null;
  }
}
