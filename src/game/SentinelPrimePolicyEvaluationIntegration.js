import { sentinelPrimePolicyEvaluationContract } from "../world/SentinelPrimePolicyEvaluation.js";
import "../../azl/zeknova-sentinel-prime-policy-evaluation-adapter-v1.js";

export class SentinelPrimePolicyEvaluationIntegration{
  constructor(){this.installed=false;}
  install(){
    if(this.installed)return this;
    this.installed=true;
    globalThis.ZekNovaSentinelPrimePolicyEvaluationIntegration=this;
    if(globalThis.document?.documentElement) document.documentElement.dataset.zeknovaPrimePolicyEvaluation="stage1az1-v1";
    return this;
  }
  captureDeclaration(){
    if(!this.installed)throw new Error("SentinelPrimePolicyEvaluationIntegration is not installed.");
    return globalThis.ZekNovaSentinelPrimePolicyEvaluationAdapter.captureDeclaration();
  }
  runEvaluation({seedCount}={}){
    if(!this.installed)throw new Error("SentinelPrimePolicyEvaluationIntegration is not installed.");
    return sentinelPrimePolicyEvaluationContract().evaluateAll(seedCount);
  }
  runPolicy({scenarioId,policyId,seed}){
    if(!this.installed)throw new Error("SentinelPrimePolicyEvaluationIntegration is not installed.");
    return sentinelPrimePolicyEvaluationContract().runPolicy(scenarioId,policyId,seed);
  }
  dispose(){
    this.installed=false;
    if(globalThis.ZekNovaSentinelPrimePolicyEvaluationIntegration===this)globalThis.ZekNovaSentinelPrimePolicyEvaluationIntegration=null;
  }
}
