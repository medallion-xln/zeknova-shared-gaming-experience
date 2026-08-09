/* Stage 1A-Z read-only evaluation adapter. No live commands or authority. */
(function (root) {
  'use strict';
  var C = root.ZekNovaForestObjectiveScenarioContract;
  if (!C) throw new Error('Forest objective scenario contract must load before adapter.');
  var adapter = Object.freeze({
    id:'zeknova-forest-objective-scenario-adapter-v1',
    contractId:C.CONTRACT_ID,
    registryId:C.REGISTRY_ID,
    objectiveProfileId:C.OBJECTIVE_PROFILE_ID,
    certificationId:C.CERTIFICATION_ID,
    mode:C.MODE,
    authority:C.AUTHORITY,
    scenarioCount:C.SCENARIO_COUNT,
    captureDeclaration:function(){
      var integration=root.ZekNovaForestObjectiveScenarioIntegration;
      if(!integration)throw new Error('Forest objective scenario integration is unavailable.');
      return integration.captureDeclaration();
    },
    runCertification:function(options){
      var integration=root.ZekNovaForestObjectiveScenarioIntegration;
      if(!integration)throw new Error('Forest objective scenario integration is unavailable.');
      return integration.runCertification(options||{});
    },
    runScenario:function(options){
      var integration=root.ZekNovaForestObjectiveScenarioIntegration;
      if(!integration)throw new Error('Forest objective scenario integration is unavailable.');
      return integration.runScenario(options||{});
    }
  });
  root.ZEK_FOREST_OBJECTIVE_SCENARIO_ADAPTER=adapter;
  if(typeof module==='object'&&module.exports)module.exports=adapter;
})(typeof globalThis!=='undefined'?globalThis:this);
