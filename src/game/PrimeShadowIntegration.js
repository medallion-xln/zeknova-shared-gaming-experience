import {
  PrimeShadowLedger,
  createPrimeShadowRecommendation,
  comparePrimeShadowWithIncumbent,
} from "../world/PrimeShadow.js";
import "../../azl/zeknova-prime-shadow-adapter-v1.js";

const ALL_OPEN_DEVELOPMENT_MASK = Object.freeze([1, 1, 1, 1, 1, 1]);

export class PrimeShadowIntegration {
  constructor({
    game,
    identityIntegration,
    observationLegalityIntegration,
    upstreamMaskProvider = null,
    incumbentProvider = null,
    storage = null,
    autoRunOnPerception = false,
  } = {}) {
    if (!game) throw new Error("PrimeShadowIntegration requires the live ZekNova game.");
    if (!identityIntegration?.registry) throw new Error("PrimeShadowIntegration requires W0-O.0 IdentityIntegration.");
    if (!observationLegalityIntegration?.intersectForFaction) throw new Error("PrimeShadowIntegration requires W0-O.5 ObservationLegalityIntegration.");
    this.game = game;
    this.identityIntegration = identityIntegration;
    this.observationLegalityIntegration = observationLegalityIntegration;
    this.upstreamMaskProvider = upstreamMaskProvider;
    this.incumbentProvider = incumbentProvider;
    this.storage = storage;
    this.autoRunOnPerception = autoRunOnPerception === true;
    this.ledger = new PrimeShadowLedger({ worldId: identityIntegration.worldId });
    this.installed = false;
    this.onPerceptionEvent = () => {
      try { this.runLocalShadow(); }
      catch (error) { console.warn("Sentinel Prime shadow scan skipped.", error); }
    };
  }

  install() {
    if (this.installed) return this;
    this.installed = true;
    this.restore();
    globalThis.ZekNovaPrimeShadowIntegration = this;
    if (globalThis.document?.documentElement) document.documentElement.dataset.zeknovaPrimeShadow = "w0o6-v1";
    if (this.autoRunOnPerception && typeof globalThis.addEventListener === "function") {
      globalThis.addEventListener("zeknova:perception-event", this.onPerceptionEvent);
    }
    if (typeof globalThis.dispatchEvent === "function" && typeof globalThis.CustomEvent === "function") {
      globalThis.dispatchEvent(new CustomEvent("zeknova:prime-shadow-ready", {
        detail: {
          engineId: globalThis.ZekNovaPrimeShadowContract?.ENGINE_ID,
          featureCount: globalThis.ZekNovaPrimeShadowContract?.FEATURE_COUNT,
          actionCount: globalThis.ZekNovaPrimeShadowContract?.ACTION_COUNT,
          mode: "shadow-only",
          authority: "none-no-action-execution",
        },
      }));
    }
    return this;
  }

  resolveUpstreamMask(factionId, options = {}) {
    if (options.upstreamMask) {
      return { mask: Array.from(options.upstreamMask), source: options.upstreamMaskSource || "explicit-call" };
    }
    if (typeof this.upstreamMaskProvider === "function") {
      const provided = this.upstreamMaskProvider({ factionId, game: this.game, quantum: options.quantum });
      if (Array.isArray(provided) || ArrayBuffer.isView(provided)) {
        return { mask: Array.from(provided), source: "configured-provider" };
      }
      if (provided?.mask) {
        return { mask: Array.from(provided.mask), source: String(provided.source || "configured-provider") };
      }
      throw new Error("Prime shadow upstreamMaskProvider returned an invalid projection.");
    }
    return { mask: Array.from(ALL_OPEN_DEVELOPMENT_MASK), source: "development-all-open-projection" };
  }

  resolveIncumbent(factionId, shadowInputs, options = {}) {
    if (options.incumbent) return options.incumbent;
    if (typeof this.incumbentProvider === "function") {
      return this.incumbentProvider({ factionId, game: this.game, ...shadowInputs }) || {
        available: false,
        policyId: "configured-incumbent-unavailable",
      };
    }
    return {
      available: false,
      policyId: "zeknova-scripted-ai-unmapped-v1",
    };
  }

  runForFaction(factionId, options = {}) {
    if (!this.installed) throw new Error("PrimeShadowIntegration is not installed.");
    const projection = this.resolveUpstreamMask(factionId, options);
    const legalityBundle = this.observationLegalityIntegration.intersectForFaction(
      factionId,
      projection.mask,
      {
        quantum: options.quantum,
        terminal: options.terminal ?? false,
        replanBoundary: options.replanBoundary ?? false,
      },
    );
    const context = {
      seed: options.seed ?? 18427,
      simulations: options.simulations,
      cPuctMilli: options.cPuctMilli,
      upstreamMaskSource: projection.source,
    };
    const recommendation = createPrimeShadowRecommendation({
      observation: legalityBundle.observation,
      targetView: legalityBundle.targetView,
      legality: legalityBundle.legality,
      context,
    });
    const incumbent = this.resolveIncumbent(factionId, legalityBundle, options);
    const comparison = comparePrimeShadowWithIncumbent(recommendation, incumbent);
    const telemetryEntry = this.ledger.append(recommendation, comparison);
    this.persist();
    const result = {
      observation: legalityBundle.observation,
      targetView: legalityBundle.targetView,
      legality: legalityBundle.legality,
      recommendation,
      comparison,
      telemetryEntry,
    };
    if (typeof globalThis.dispatchEvent === "function" && typeof globalThis.CustomEvent === "function") {
      globalThis.dispatchEvent(new CustomEvent("zeknova:prime-shadow-recommendation", {
        detail: globalThis.ZekNovaIdentityContract.stableClone({ recommendation, comparison }),
      }));
    }
    return globalThis.ZekNovaIdentityContract.stableClone(result);
  }

  runLocalShadow(options = {}) {
    return this.runForFaction(this.identityIntegration.humanFactionId, options);
  }

  captureTelemetrySnapshot() {
    return this.ledger.snapshot();
  }

  captureTelemetryHash() {
    return this.ledger.hash();
  }

  entries() {
    return this.ledger.snapshot().entries;
  }

  restore(snapshot = null) {
    const saved = snapshot ?? this.storage?.load?.("zeknova-prime-shadow-v1");
    if (!saved) return this;
    this.ledger = PrimeShadowLedger.fromSnapshot(saved);
    return this;
  }

  persist() {
    this.storage?.save?.("zeknova-prime-shadow-v1", this.ledger.snapshot());
  }

  dispose() {
    if (!this.installed) return;
    if (this.autoRunOnPerception && typeof globalThis.removeEventListener === "function") {
      globalThis.removeEventListener("zeknova:perception-event", this.onPerceptionEvent);
    }
    this.installed = false;
    if (globalThis.ZekNovaPrimeShadowIntegration === this) globalThis.ZekNovaPrimeShadowIntegration = null;
  }
}
