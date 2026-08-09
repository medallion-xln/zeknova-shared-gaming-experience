import { forestObjectiveScenarioContract } from "../world/ForestObjectiveScenarios.js";
import "../../azl/zeknova-forest-objective-scenario-adapter-v1.js";

export class ForestObjectiveScenarioIntegration {
  constructor() {
    this.installed = false;
  }

  install() {
    if (this.installed) return this;
    this.installed = true;
    globalThis.ZekNovaForestObjectiveScenarioIntegration = this;
    if (globalThis.document?.documentElement) {
      document.documentElement.dataset.zeknovaForestScenarioCertification = "stage1az-v1";
    }
    return this;
  }

  captureDeclaration() {
    if (!this.installed) throw new Error("ForestObjectiveScenarioIntegration is not installed.");
    const C = forestObjectiveScenarioContract();
    return globalThis.ZekNovaIdentityContract.stableClone({
      contractId: C.CONTRACT_ID,
      registryId: C.REGISTRY_ID,
      objectiveProfile: C.OBJECTIVE_PROFILE,
      scenarioCount: C.SCENARIO_COUNT,
      scenarios: C.SCENARIOS.map((scenario) => ({
        id: scenario.id,
        version: scenario.version,
        title: scenario.title,
        objective: scenario.objective,
        requiredActions: scenario.requiredActions,
        criticalActions: scenario.criticalActions,
        horizonQuanta: scenario.horizonQuanta,
      })),
      mode: C.MODE,
      authority: C.AUTHORITY,
      strategicCompetenceClaim: false,
      productionAuthorityClaim: false,
    });
  }

  runCertification({ seedCount } = {}) {
    if (!this.installed) throw new Error("ForestObjectiveScenarioIntegration is not installed.");
    return forestObjectiveScenarioContract().certifyAll(seedCount);
  }

  runScenario({ scenarioId, plan, seed }) {
    if (!this.installed) throw new Error("ForestObjectiveScenarioIntegration is not installed.");
    return forestObjectiveScenarioContract().runScenario(scenarioId, plan, seed);
  }

  dispose() {
    this.installed = false;
    if (globalThis.ZekNovaForestObjectiveScenarioIntegration === this) {
      globalThis.ZekNovaForestObjectiveScenarioIntegration = null;
    }
  }
}
