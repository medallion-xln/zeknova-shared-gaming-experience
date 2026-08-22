import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { evaluateSentinelExpertAblation, SENTINEL_EXPERT_ABLATION_AUTHORITY } from "../src/world/SentinelExpertAblation.js";

const root = path.resolve(import.meta.dirname, "..");
for (const file of [
  "zeknova-identity-contract-v1.js", "zeknova-perception-event-contract-v1.js", "zeknova-knowledge-ledger-contract-v1.js",
  "zeknova-faction-observation-contract-v1.js", "zeknova-forest-defensive-action-contract-v1.js",
  "zeknova-forest-defensive-command-contract-v2.js", "zeknova-live-parity-closure-contract-v1.js",
  "zeknova-forest-objective-scenario-contract-v1.js", "zeknova-sentinel-prime-policy-evaluation-contract-v1.js",
  "zeknova-prime-search-observability-contract-v1.js", "zeknova-prime-root-exploration-correction-contract-v1.js",
  "zeknova-prime-value-objective-calibration-contract-v1.js", "zeknova-prime-horizon-delayed-consequences-contract-v1.js",
  "zeknova-prime-search-efficiency-contract-v1.js", "zeknova-adaptive-compute-allocation-contract-v1.js",
  "zeknova-baseline-incumbent-certification-contract-v1.js", "zeknova-expanded-scenario-coverage-contract-v1.js", "zeknova-expert-evaluation-contract-v1.js",
]) vm.runInThisContext(fs.readFileSync(path.join(root, "azl", file), "utf8"), { filename: file });

const first = evaluateSentinelExpertAblation({ seedCount: 1, scenarioLimit: 2, profileLimit: 2 });
const second = evaluateSentinelExpertAblation({ seedCount: 1, scenarioLimit: 2, profileLimit: 2 });
assert.deepEqual(first.summaries.map(({ meanLatencyMs, deltaLatencyMs, ...row }) => row), second.summaries.map(({ meanLatencyMs, deltaLatencyMs, ...row }) => row));
assert.equal(first.deterministicReplayPass, true);
assert.equal(first.configurationCount, 25);
assert.equal(first.expertsTested.length, 5);
assert.equal(first.evidenceSufficient, false);
assert.equal(first.primeQualityImproved, false);
assert.equal(first.r1CanaryRetryRecommendation, "REJECT");
assert.deepEqual(SENTINEL_EXPERT_ABLATION_AUTHORITY, { tier: "R0_EVALUATION", canDispatch: false, canMutateLiveWorld: false, canChangeAuthority: false });
assert.equal(typeof globalThis.ZekNovaExpertEvaluationContract.execute, "undefined");
console.log("Sentinel expert isolation and team ablation tests passed.");
