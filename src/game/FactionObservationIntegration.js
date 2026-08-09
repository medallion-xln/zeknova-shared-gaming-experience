import { createFactionObservation } from "../world/FactionObservation.js";
import "../../azl/zeknova-faction-observation-adapter-v1.js";

export class FactionObservationIntegration {
  constructor({ game, identityIntegration, knowledgeIntegration, quantumProvider } = {}) {
    if (!game) throw new Error("FactionObservationIntegration requires the live ZekNova game.");
    if (!identityIntegration?.registry) throw new Error("FactionObservationIntegration requires W0-O.0 IdentityIntegration.");
    if (!knowledgeIntegration?.ledger) throw new Error("FactionObservationIntegration requires W0-O.2 FactionKnowledgeIntegration.");
    this.game = game;
    this.identityIntegration = identityIntegration;
    this.knowledgeIntegration = knowledgeIntegration;
    this.quantumProvider = typeof quantumProvider === "function" ? quantumProvider : () => {
      const candidate = this.game.perceptionQuantum ?? this.game.controlQuantum ?? this.game.worldQuantum ?? this.game.tick ?? 0;
      const value = Number(candidate);
      return Number.isSafeInteger(value) && value >= 0 ? value : 0;
    };
    this.installed = false;
  }

  currentQuantum(options = {}) {
    const value = options.quantum ?? this.quantumProvider();
    const quantum = Number(value);
    if (!Number.isSafeInteger(quantum) || quantum < 0) throw new Error("Observation quantum must be a non-negative safe integer.");
    return quantum;
  }

  install() {
    if (this.installed) return this;
    this.installed = true;
    globalThis.ZekNovaFactionObservationIntegration = this;
    if (globalThis.document?.documentElement) document.documentElement.dataset.zeknovaFactionObservation = "w0o3-v1";
    if (typeof globalThis.dispatchEvent === "function" && typeof globalThis.CustomEvent === "function") {
      globalThis.dispatchEvent(new CustomEvent("zeknova:faction-observation-ready", {
        detail: {
          worldId: this.identityIntegration.worldId,
          featureLayoutId: globalThis.ZekNovaFactionObservationContract?.FEATURE_LAYOUT_ID,
          featureCount: globalThis.ZekNovaFactionObservationContract?.FEATURE_COUNT,
        },
      }));
    }
    return this;
  }

  captureForFaction(factionId, options = {}) {
    const quantum = this.currentQuantum(options);
    this.knowledgeIntegration.sync();
    if (quantum < this.knowledgeIntegration.ledger.currentQuantum) {
      throw new Error("Live faction observation quantum may not precede the knowledge ledger quantum.");
    }
    this.knowledgeIntegration.advanceToQuantum(quantum);
    return createFactionObservation({
      identitySnapshot: this.identityIntegration.captureSnapshot(),
      ledgerSnapshot: this.knowledgeIntegration.captureSnapshot(),
      factionId,
      quantum,
    });
  }

  captureLocalFaction(options = {}) {
    return this.captureForFaction(this.identityIntegration.humanFactionId, options);
  }

  primeInputForFaction(factionId, options = {}) {
    const packet = this.captureForFaction(factionId, options);
    return {
      factionId: packet.factionId,
      featureCount: packet.featureCount,
      featureLayoutId: packet.featureLayoutId,
      featureVector: packet.featureVector.slice(),
      observationId: packet.observationId,
      quantum: packet.quantum,
      worldId: packet.worldId,
    };
  }

  dispose() {
    if (!this.installed) return;
    this.installed = false;
    if (globalThis.ZekNovaFactionObservationIntegration === this) globalThis.ZekNovaFactionObservationIntegration = null;
  }
}
