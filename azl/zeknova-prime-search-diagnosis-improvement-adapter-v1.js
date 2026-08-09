/* Read-only Stage 1A-Z.2 adapter. No command or live-world authority. */
(function (root) {
  'use strict';
  var C = root.ZekNovaPrimeSearchDiagnosisImprovementContract;
  if (!C || C.CONTRACT_ID !== 'zeknova-prime-search-diagnosis-improvement-contract-v1') throw new Error('Prime search diagnosis contract is unavailable.');
  root.ZekNovaPrimeSearchDiagnosisImprovementAdapter = Object.freeze({
    id:'zeknova-prime-search-diagnosis-improvement-adapter-v1',
    contractId:C.CONTRACT_ID,
    evaluationId:C.EVALUATION_ID,
    mode:C.MODE,
    authority:C.AUTHORITY,
    variantCount:C.VARIANT_COUNT,
    candidatePolicyId:C.V2_POLICY_ID,
    captureDeclaration:function(){
      return root.ZekNovaIdentityContract.stableClone({
        authority:C.AUTHORITY,
        candidatePolicyId:C.V2_POLICY_ID,
        candidateSimulations:C.V2_SIMULATIONS,
        contractId:C.CONTRACT_ID,
        diagnosisSeedCount:C.DIAGNOSIS_SEED_COUNT,
        evaluationId:C.EVALUATION_ID,
        holdoutSeedCount:C.HOLDOUT_SEED_COUNT,
        liveAuthorityApproved:false,
        mode:C.MODE,
        productionAuthorityClaim:false,
        registryId:C.REGISTRY_ID,
        searchImprovementEvaluated:true,
        strategicCompetenceCertified:false,
        variantCount:C.VARIANT_COUNT
      });
    },
    runEvaluation:function(diagnosisSeedCount,holdoutSeedCount){return C.evaluateAll(diagnosisSeedCount,holdoutSeedCount);}
  });
})(typeof globalThis!=='undefined'?globalThis:this);
