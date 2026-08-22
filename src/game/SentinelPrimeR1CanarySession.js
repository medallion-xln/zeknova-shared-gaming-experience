import { PRIME_R1_MANIFEST_SHA256 } from "../world/PrimeR1Authority.js";

export const PRIME_R1_CANARY_GRANT = Object.freeze({
  authorizationId: "human-explicit-20260809-prime-r1-one-local-canary",
  queryKey: "primeR1Canary",
  queryValue: "45acf446b4c13b0beaf0e339b713a5ad41c8ac6673f013b0877418b47d75d9ea",
  artifacts: Object.freeze([
    Object.freeze({ path: "docs/governance/SENTINEL_PRIME_R1_CANARY_PROPOSAL.json", sha256: "45acf446b4c13b0beaf0e339b713a5ad41c8ac6673f013b0877418b47d75d9ea" }),
    Object.freeze({ path: "docs/governance/SENTINEL_PRIME_R1_AUTHORIZATION_PACKAGE.json", sha256: "76073de4ec75ec174a17ceb4d576394eff8c21f784f061d8200f6d3fe15939a4" }),
    Object.freeze({ path: "docs/SENTINEL_PRIME_R1_AUTHORIZATION_MANIFEST.md", sha256: PRIME_R1_MANIFEST_SHA256 }),
    Object.freeze({ path: "src/world/PrimeR1Authority.js", sha256: "7debd0d883f7abf6e2b305d5d15df6147167e9b56edbed8ddb7815324839ae65" }),
    Object.freeze({ path: "src/game/SentinelPrimeExecutor.js", sha256: "4a9c3b3537adf63615103d0dbb69789dd38434d25faf33466598ccd3548b4569" }),
  ]),
  allowedActions: Object.freeze(["stabilize", "scout_region", "intercept_contact", "fortify_known_route", "repair_known_structure", "share_intelligence"]),
});

const clone = (value) => globalThis.ZekNovaIdentityContract?.stableClone?.(value) ?? structuredClone(value);
const hex = (bytes) => [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");

async function sha256Response(response) {
  if (!response.ok) throw new Error(`Canary artifact unavailable (${response.status}).`);
  return hex(await crypto.subtle.digest("SHA-256", await response.arrayBuffer()));
}

function localHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

/** One-use, internally invoked R1 canary. It exposes evidence, never authorization or execution. */
export class SentinelPrimeR1CanarySession {
  constructor({ executor, shadowIntegration, commandIntegration, user, location = globalThis.location, storage = globalThis.localStorage, fetchImpl = globalThis.fetch } = {}) {
    if (!executor?.authorize || !executor?.execute || !executor?.killSwitch) throw new Error("Canary requires the narrow Prime executor.");
    if (!shadowIntegration?.runLocalShadow) throw new Error("Canary requires canonical Prime search.");
    if (!commandIntegration?.captureRuntimeSnapshot || !commandIntegration?.advanceToQuantum) throw new Error("Canary requires the incumbent command lifecycle.");
    this.executor = executor;
    this.shadowIntegration = shadowIntegration;
    this.commandIntegration = commandIntegration;
    this.user = user;
    this.location = location;
    this.storage = storage;
    this.fetchImpl = fetchImpl;
    this.events = [];
    this.report = this.initialReport();
  }

  initialReport() {
    return {
      primeR1Authorized: false, primeCanaryStarted: false, primeLiveExecutionEnabled: false,
      executedActionCount: 0, rejectedActionCount: 0, illegalDispatchCount: 0,
      unsupportedDispatchCount: 0, authorityViolationCount: 0, provenanceFailureCount: 0,
      unexpectedMutationCount: 0, rollbackPass: false, killSwitchPass: false,
      automaticR0FallbackTriggered: false, primeAuthority: "R0", gobanAuthority: "R0_EVALUATION",
      nextGate: "VALID_CANARY_ACTIVATION", events: this.events,
    };
  }

  requested() {
    if (!this.location || !localHost(this.location.hostname)) return false;
    return new URL(this.location.href).searchParams.get(PRIME_R1_CANARY_GRANT.queryKey) === PRIME_R1_CANARY_GRANT.queryValue;
  }

  consumedKey() { return `zeknova.prime-r1-canary.consumed.${PRIME_R1_CANARY_GRANT.queryValue}`; }
  evidenceKey() { return `zeknova.prime-r1-canary.evidence.${PRIME_R1_CANARY_GRANT.queryValue}`; }
  record(type, detail = {}) { this.events.push(Object.freeze({ at: new Date().toISOString(), type, ...clone(detail) })); }

  async verifyArtifacts() {
    const results = [];
    for (const artifact of PRIME_R1_CANARY_GRANT.artifacts) {
      const url = new URL(`/${artifact.path}`, this.location.origin);
      const actual = await sha256Response(await this.fetchImpl(url, { cache: "no-store", credentials: "same-origin" }));
      results.push({ ...artifact, actual, valid: actual === artifact.sha256 });
    }
    if (results.some((item) => !item.valid)) throw new Error("authorization-package/hash mismatch");
    this.record("artifact_hashes_verified", { artifacts: results });
    return results;
  }

  persist() {
    const evidence = clone({ grant: { authorizationId: PRIME_R1_CANARY_GRANT.authorizationId, artifacts: PRIME_R1_CANARY_GRANT.artifacts }, report: this.report, events: this.events });
    this.storage?.setItem?.(this.evidenceKey(), JSON.stringify(evidence));
    const node = document.getElementById("zeknova-prime-canary-evidence") || document.createElement("script");
    node.id = "zeknova-prime-canary-evidence";
    node.type = "application/json";
    node.textContent = JSON.stringify(evidence).replaceAll("<", "\\u003c");
    if (!node.isConnected) document.head.appendChild(node);
    return evidence;
  }

  async run() {
    if (!this.requested()) return null;
    this.report.primeCanaryStarted = true;
    document.documentElement.dataset.zeknovaPrimeCanary = "validating";
    try {
      if (!this.user?.id) throw new Error("authenticated session identity missing");
      if (this.storage?.getItem?.(this.consumedKey())) throw new Error("one-session canary grant already consumed");
      await this.verifyArtifacts();
      this.storage?.setItem?.(this.consumedKey(), new Date().toISOString());
      const sessionId = `local:${this.user.id}:${crypto.randomUUID()}`;
      const authorityToken = this.executor.authorize({ manifestHash: PRIME_R1_MANIFEST_SHA256, authorizationId: PRIME_R1_CANARY_GRANT.authorizationId, sessionId });
      this.report.primeR1Authorized = true;
      this.report.primeLiveExecutionEnabled = true;
      this.report.primeAuthority = "R1_LIMITED";
      this.record("authority_activated", { sessionId, allowedActions: PRIME_R1_CANARY_GRANT.allowedActions });

      const quantum = Math.trunc(this.commandIntegration.currentQuantum);
      const searchResult = this.shadowIntegration.runLocalShadow({ quantum, upstreamMask: [1, 0, 0, 0, 0, 0], upstreamMaskSource: "human-authorized-r1-canary-stabilize-only" });
      this.record("dispatch_attempt", { recommendationId: searchResult.recommendation.recommendationId, action: searchResult.recommendation.selectedActionKey, quantum });
      if (searchResult.recommendation.selectedActionKey !== "stabilize") throw new Error("unsupported action selected for one-command canary");
      const execution = this.executor.execute(searchResult, { authorityToken, quantum });
      this.report.executedActionCount = 1;
      this.record("dispatch_executed", { command: execution.executedCommand, stateBefore: execution.stateBefore, stateAfterIssue: execution.stateAfter });

      const commandId = execution.executedCommand.commandId;
      const completionSnapshot = this.commandIntegration.advanceToQuantum(quantum + 1);
      const completed = this.commandIntegration.getCommand(commandId);
      this.record("command_terminal", { command: completed, stateAfter: completionSnapshot });
      if (completed?.status !== "completed" || completed.actionIndex !== 0) throw new Error("unexpected mutation or incomplete canary command");
      const capacity = completionSnapshot.runtimeCapacities.find((item) => item.factionId === execution.executedCommand.factionId);
      this.report.rollbackPass = !completionSnapshot.commands.some((item) => item.status === "active") && capacity?.availablePatrolSlots === capacity?.totalPatrolSlots && capacity?.availableRepairCrewSlots === capacity?.totalRepairCrewSlots;
      this.record("rollback_verified", { pass: this.report.rollbackPass, meaning: "terminal command; all incumbent assignments released" });
      if (!this.report.rollbackPass) throw new Error("rollback verification failed");

      const killed = this.executor.killSwitch("one_local_canary_completed");
      this.report.killSwitchPass = killed.killed === true && killed.authority.tier === "R0";
      this.report.primeLiveExecutionEnabled = false;
      this.report.primeAuthority = "R0";
      this.report.nextGate = "HUMAN_REVIEW_OF_SINGLE_CANARY_EVIDENCE";
      this.record("kill_switch_verified", { pass: this.report.killSwitchPass, status: killed });
      document.documentElement.dataset.zeknovaPrimeAuthority = "r0-canary-completed";
      document.documentElement.dataset.zeknovaPrimeCanary = "completed";
      return this.persist();
    } catch (error) {
      const reason = String(error?.message || error);
      const status = this.executor.killSwitch(`canary_fallback:${reason}`);
      this.report.automaticR0FallbackTriggered = true;
      this.report.primeLiveExecutionEnabled = false;
      this.report.primeAuthority = "R0";
      this.report.killSwitchPass = status.killed === true && status.authority.tier === "R0";
      this.report.rejectedActionCount += this.report.executedActionCount === 0 ? 1 : 0;
      if (/unsupported action/i.test(reason)) this.report.unsupportedDispatchCount += 1;
      if (/provenance|hash mismatch/i.test(reason)) this.report.provenanceFailureCount += 1;
      if (/authority|session identity/i.test(reason)) this.report.authorityViolationCount += 1;
      if (/unexpected mutation/i.test(reason)) this.report.unexpectedMutationCount += 1;
      this.report.nextGate = "CANARY_FAILURE_REVIEW";
      this.record("automatic_r0_fallback", { reason, status });
      document.documentElement.dataset.zeknovaPrimeAuthority = "r0-canary-fallback";
      document.documentElement.dataset.zeknovaPrimeCanary = "failed";
      document.documentElement.dataset.zeknovaPrimeCanaryReason = reason.replace(/[^a-z0-9:_-]+/gi, "_").slice(0, 160);
      return this.persist();
    }
  }
}
