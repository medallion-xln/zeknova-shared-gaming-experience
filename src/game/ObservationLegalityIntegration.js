import {
  buildObservationTargetView,
  computeObservationLegality,
} from "../world/ObservationLegality.js";
import "../../azl/zeknova-observation-legality-adapter-v1.js";

export class ObservationLegalityIntegration {
  constructor({ game, identityIntegration, observationIntegration } = {}) {
    if (!game) throw new Error("ObservationLegalityIntegration requires the live ZekNova game.");
    if (!identityIntegration?.registry) throw new Error("ObservationLegalityIntegration requires W0-O.0 IdentityIntegration.");
    if (!observationIntegration?.captureForFaction) throw new Error("ObservationLegalityIntegration requires W0-O.3 FactionObservationIntegration.");
    this.game = game;
    this.identityIntegration = identityIntegration;
    this.observationIntegration = observationIntegration;
    this.installed = false;
  }

  install() {
    if (this.installed) return this;
    this.installed = true;
    globalThis.ZekNovaObservationLegalityIntegration = this;
    if (globalThis.document?.documentElement) document.documentElement.dataset.zeknovaObservationLegality = "w0o5-v1";
    if (typeof globalThis.dispatchEvent === "function" && typeof globalThis.CustomEvent === "function") {
      globalThis.dispatchEvent(new CustomEvent("zeknova:observation-legality-ready", {
        detail: {
          actionSpaceId: globalThis.ZekNovaObservationLegalityContract?.ACTION_SPACE_ID,
          actionCount: globalThis.ZekNovaObservationLegalityContract?.ACTION_COUNT,
          authority: "read-only-no-action-execution",
        },
      }));
    }
    return this;
  }

  captureObservation(factionId, options = {}) {
    return this.observationIntegration.captureForFaction(factionId, options);
  }

  captureTargetView(factionId, options = {}) {
    return buildObservationTargetView(this.captureObservation(factionId, options));
  }

  captureLocalTargetView(options = {}) {
    return this.captureTargetView(this.identityIntegration.humanFactionId, options);
  }

  intersectForFaction(factionId, upstreamMask, options = {}) {
    const observation = this.captureObservation(factionId, options);
    return {
      observation,
      targetView: buildObservationTargetView(observation),
      legality: computeObservationLegality({
        observation,
        upstreamMask,
        terminal: options.terminal ?? false,
        replanBoundary: options.replanBoundary ?? false,
      }),
    };
  }

  intersectForLocalFaction(upstreamMask, options = {}) {
    return this.intersectForFaction(this.identityIntegration.humanFactionId, upstreamMask, options);
  }

  dispose() {
    if (!this.installed) return;
    this.installed = false;
    if (globalThis.ZekNovaObservationLegalityIntegration === this) globalThis.ZekNovaObservationLegalityIntegration = null;
  }
}
