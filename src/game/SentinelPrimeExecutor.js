import {
  PRIME_R1_ACTION_BINDINGS,
  PRIME_R1_AUTHORITY,
  PRIME_R1_BASELINE,
  PRIME_R1_CONTRACT_ID,
  PRIME_R1_FRESHNESS_QUANTA,
  PRIME_R1_MANIFEST_SHA256,
  assertPrimeR1Provenance,
  primeR1Binding,
} from "../world/PrimeR1Authority.js";

const clone = (value) => globalThis.ZekNovaIdentityContract?.stableClone?.(value) ?? structuredClone(value);
const AUTHORIZED_TOKENS = new WeakSet();

/** Narrow Prime -> certified incumbent command adapter. Never mutates game state directly. */
export class SentinelPrimeExecutor {
  constructor({ commandIntegration, quantumProvider, provenance = PRIME_R1_BASELINE } = {}) {
    if (!commandIntegration?.captureCommandContext || !commandIntegration?.controller?.issue) throw new Error("Prime R1 requires the supported W0-P.2 command runtime.");
    this.commandIntegration = commandIntegration;
    this.quantumProvider = quantumProvider || (() => commandIntegration.currentQuantum);
    this.provenance = Object.freeze({ ...provenance });
    this.enabled = false;
    this.killed = false;
    this.killReason = null;
    this.sessionId = null;
    this.lastRecommendationId = null;
    this.ledger = [];
  }

  status() { return Object.freeze({ authority: this.enabled && !this.killed ? PRIME_R1_AUTHORITY : Object.freeze({ tier: "R0", canDispatch: false, canMutateLiveWorld: false }), enabled: this.enabled, killed: this.killed, killReason: this.killReason, allowedActionCount: PRIME_R1_ACTION_BINDINGS.length, executionCount: this.ledger.filter((x) => x.executorResult?.dispatched).length }); }
  authorize({ manifestHash, authorizationId, sessionId } = {}) {
    if (!manifestHash || manifestHash !== PRIME_R1_MANIFEST_SHA256) throw new Error("Prime R1 authorization manifest hash is absent or mismatched.");
    if (!authorizationId || !sessionId) throw new Error("Prime R1 requires explicit authorization and one authenticated session identity.");
    assertPrimeR1Provenance(this.provenance);
    const token = Object.freeze({ contractId: PRIME_R1_CONTRACT_ID, authorizationId: String(authorizationId), sessionId: String(sessionId) });
    AUTHORIZED_TOKENS.add(token); this.enabled = true; this.killed = false; this.killReason = null; this.sessionId = token.sessionId;
    return token;
  }
  killSwitch(reason = "human_kill_switch") { this.enabled = false; this.killed = true; this.killReason = String(reason); return this.status(); }
  fallbackR0(reason) { return this.killSwitch(reason || "r0_fallback"); }

  verify(searchResult, options = {}) {
    assertPrimeR1Provenance(options.provenance || this.provenance);
    const recommendation = searchResult?.recommendation, legality = searchResult?.legality;
    if (!recommendation || !legality) throw new Error("Prime R1 requires canonical search and legality evidence.");
    if (recommendation.worldId !== legality.worldId || recommendation.factionId !== legality.factionId || recommendation.quantum !== legality.quantum) throw new Error("Prime R1 canonical state identity mismatch.");
    if (recommendation.finalMaskHash !== legality.finalMaskHash) throw new Error("Prime R1 legal-mask provenance mismatch.");
    const index = recommendation.selectedActionIndex, binding = primeR1Binding(index, recommendation.selectedActionKey);
    if (!binding) throw new Error("Prime R1 command is not allowlisted.");
    if (legality.finalMask[index] !== 1 || recommendation.rankedActions?.find((x) => x.actionIndex === index)?.legal !== true) throw new Error("Prime R1 rejected an illegal recommendation.");
    const currentQuantum = Math.trunc(options.quantum ?? this.quantumProvider());
    if (currentQuantum < recommendation.quantum || currentQuantum - recommendation.quantum > PRIME_R1_FRESHNESS_QUANTA) throw new Error("Prime R1 state identity is stale.");
    const bundle = this.commandIntegration.captureCommandContext(recommendation.factionId, { quantum: currentQuantum });
    if (bundle.observation.worldId !== recommendation.worldId || bundle.observation.factionId !== recommendation.factionId) throw new Error("Prime R1 live state identity changed.");
    const candidate = bundle.candidateSet.entries[binding.commandIndex];
    if (!candidate?.legal) throw new Error("Prime R1 hard-safety gate rejected the command.");
    let targetId = null;
    if (candidate.requiresTarget) {
      const target = candidate.targets.find((item) => item.subjectId === recommendation.selectedSubjectId);
      if (!target) throw new Error("Prime R1 target binding failed.");
      targetId = target.targetId;
    }
    if (recommendation.recommendationId === this.lastRecommendationId) throw new Error("Prime R1 repeated-command loop detected.");
    return Object.freeze({ binding, bundle, currentQuantum, targetId });
  }

  dryRun(searchResult, options = {}) {
    const verified = this.verify(searchResult, options);
    return clone({ authorityDecision: "shadow-approved-not-dispatched", contractId: PRIME_R1_CONTRACT_ID, recommendationId: searchResult.recommendation.recommendationId, stateId: verified.bundle.state.stateId, candidateSetId: verified.bundle.candidateSet.candidateSetId, action: verified.binding, targetId: verified.targetId, provenance: this.provenance, executorResult: { dispatched: false } });
  }

  execute(searchResult, options = {}) {
    if (!this.enabled || this.killed || !AUTHORIZED_TOKENS.has(options.authorityToken) || options.authorityToken.sessionId !== this.sessionId) throw new Error("Prime R1 authority token is absent or inactive.");
    let verified;
    try {
      verified = this.verify(searchResult, options);
      const before = this.commandIntegration.captureRuntimeSnapshot();
      const issued = this.commandIntegration.controller.issue({ factionId: searchResult.recommendation.factionId, actionIndex: verified.binding.commandIndex, targetId: verified.targetId, recipientFactionId: options.recipientFactionId ?? null, quantum: verified.currentQuantum });
      const after = this.commandIntegration.captureRuntimeSnapshot();
      this.lastRecommendationId = searchResult.recommendation.recommendationId;
      const record = clone({ state: { worldId: searchResult.recommendation.worldId, observationId: searchResult.recommendation.observationId, stateId: verified.bundle.state.stateId }, primeRecommendation: searchResult.recommendation, legalMask: searchResult.legality, searchTrace: searchResult.recommendation.rankedActions, authorityDecision: "R1_LIMITED_AUTHORIZED", executedCommand: issued.command, gameResult: "accepted", incumbentCounterfactual: searchResult.comparison || null, stateAfter: after, stateBefore: before, violationStatus: "none", executorResult: { dispatched: true } });
      this.ledger.push(record); return clone(record);
    } catch (error) {
      this.fallbackR0(`executor_exception:${error.message}`);
      throw error;
    }
  }
}

export default SentinelPrimeExecutor;
