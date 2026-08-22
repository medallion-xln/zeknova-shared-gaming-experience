import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { evaluateSentinelExpertAblation } from "../src/world/SentinelExpertAblation.js";

const root = path.resolve(import.meta.dirname, "..");
for (const file of [
  "zeknova-identity-contract-v1.js", "zeknova-perception-event-contract-v1.js", "zeknova-knowledge-ledger-contract-v1.js",
  "zeknova-faction-observation-contract-v1.js", "zeknova-forest-defensive-action-contract-v1.js",
  "zeknova-forest-defensive-command-contract-v2.js", "zeknova-live-parity-closure-contract-v1.js",
  "zeknova-forest-objective-scenario-contract-v1.js", "zeknova-sentinel-prime-policy-evaluation-contract-v1.js",
  "zeknova-prime-search-observability-contract-v1.js", "zeknova-prime-root-exploration-correction-contract-v1.js",
  "zeknova-prime-value-objective-calibration-contract-v1.js", "zeknova-prime-horizon-delayed-consequences-contract-v1.js",
  "zeknova-prime-search-efficiency-contract-v1.js", "zeknova-adaptive-compute-allocation-contract-v1.js",
  "zeknova-baseline-incumbent-certification-contract-v1.js", "zeknova-expanded-scenario-coverage-contract-v1.js",
  "zeknova-expert-evaluation-contract-v1.js",
]) vm.runInThisContext(fs.readFileSync(path.join(root, "azl", file), "utf8"), { filename: file });

const report = evaluateSentinelExpertAblation({ seedCount: Number(process.argv[2] || 2) });
const contributions = Object.fromEntries(report.summaries.filter((row) => row.activeExperts.length === 1).map((row) => [row.activeExperts[0], row.classification]));
console.log(JSON.stringify({
  reportId: report.reportId,
  primeOnlyBaselineComplete: report.primeOnlyBaselineComplete,
  expertsTested: report.expertsTested,
  scenariosTested: report.scenariosTested,
  deterministicReplayPass: report.deterministicReplayPass,
  contributions,
  singleSummaries: report.summaries.filter((row) => row.activeExperts.length === 1),
  bestSingleExpert: report.bestSingleExpert,
  bestPair: report.bestPair,
  bestThreeExpertTeam: report.bestThreeExpertTeam,
  bestOverallTeam: report.bestOverallTeam,
  bestTeamOutcomeDelta: report.bestTeamOutcomeDelta,
  bestTeamLatencyDeltaMs: report.bestTeamLatencyDeltaMs,
  synergyGroups: report.synergyGroups,
  redundantGroups: report.redundantGroups,
  interferenceGroups: report.interferenceGroups,
  routingPolicyRecommendation: report.routingPolicyRecommendation,
  primeQualityImproved: report.primeQualityImproved,
  evidenceSufficient: report.evidenceSufficient,
  r1CanaryFailureRootCause: report.r1CanaryFailureRootCause,
  r1CanaryRetryRecommendation: report.r1CanaryRetryRecommendation,
  topConfigurations: report.summaries.filter((row) => row.configurationId !== "prime-only").sort((a, b) => b.deltaOutcomeScore - a.deltaOutcomeScore || a.configurationId.localeCompare(b.configurationId)).slice(0, 8),
  authority: report.authority,
}, null, 2));
