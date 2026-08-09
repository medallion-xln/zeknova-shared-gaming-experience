/* Read-only Stage 1A-Z.1 adapter. No command or live-world authority. */
(function (root) {
  'use strict';
  var C = root.ZekNovaSentinelPrimePolicyEvaluationContract;
  if (!C || C.CONTRACT_ID !== 'zeknova-sentinel-prime-policy-evaluation-contract-v1') throw new Error('Policy evaluation contract is unavailable.');
  root.ZekNovaSentinelPrimePolicyEvaluationAdapter = Object.freeze({
    id:'zeknova-sentinel-prime-policy-evaluation-adapter-v1',
    contractId:C.CONTRACT_ID,
    evaluationId:C.EVALUATION_ID,
    mode:C.MODE,
    authority:C.AUTHORITY,
    policyCount:C.POLICY_COUNT,
    scenarioCount:7,
    captureDeclaration:function(){
      return root.ZekNovaIdentityContract.stableClone({
        contractId:C.CONTRACT_ID,evaluationId:C.EVALUATION_ID,registryId:C.REGISTRY_ID,
        mode:C.MODE,authority:C.AUTHORITY,policyCount:C.POLICY_COUNT,
        primaryPolicyIds:C.PRIMARY_POLICY_IDS,spamPolicyCount:C.SPAM_POLICY_IDS.length,
        primeSimulations:C.PRIME_SIMULATIONS,strategicCompetenceCertified:false,
        productionAuthorityClaim:false,primeOutperformsActualIncumbentClaim:false
      });
    },
    runEvaluation:function(seedCount){return C.evaluateAll(seedCount);}
  });
})(typeof globalThis!=='undefined'?globalThis:this);
