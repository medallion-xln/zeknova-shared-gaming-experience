import { primeSearchDiagnosisImprovementContract } from "../world/PrimeSearchDiagnosisImprovement.js";
import "../../azl/zeknova-prime-search-diagnosis-improvement-adapter-v1.js";

export class PrimeSearchDiagnosisImprovementIntegration{
  constructor(){this.installed=false;}
  install(){
    if(this.installed)return this;
    this.installed=true;
    globalThis.ZekNovaPrimeSearchDiagnosisImprovementIntegration=this;
    if(globalThis.document?.documentElement) document.documentElement.dataset.zeknovaPrimeSearchDiagnosis="stage1az2-v1";
    return this;
  }
  captureDeclaration(){
    if(!this.installed)throw new Error("PrimeSearchDiagnosisImprovementIntegration is not installed.");
    return globalThis.ZekNovaPrimeSearchDiagnosisImprovementAdapter.captureDeclaration();
  }
  runEvaluation({diagnosisSeedCount,holdoutSeedCount}={}){
    if(!this.installed)throw new Error("PrimeSearchDiagnosisImprovementIntegration is not installed.");
    return primeSearchDiagnosisImprovementContract().evaluateAll(diagnosisSeedCount,holdoutSeedCount);
  }
  runCandidate({scenarioId,seed}){
    if(!this.installed)throw new Error("PrimeSearchDiagnosisImprovementIntegration is not installed.");
    const C=primeSearchDiagnosisImprovementContract();
    return C.runVariant(scenarioId,C.V2_POLICY_ID,seed);
  }
  dispose(){
    this.installed=false;
    if(globalThis.ZekNovaPrimeSearchDiagnosisImprovementIntegration===this)globalThis.ZekNovaPrimeSearchDiagnosisImprovementIntegration=null;
  }
}
