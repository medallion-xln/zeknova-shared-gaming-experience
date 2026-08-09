(function(root,factory){
  var api=factory(root.ZekNovaStrategicActionCatalogV2,root.ZekNovaStrategicStateContractV2,root.ZekNovaObservationLegalityContractV2);
  if(typeof module==='object'&&module.exports) module.exports=api;
  root.ZekNovaStage2FV2Projection=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Catalog,State,Legality){
  'use strict';
  var AUTHORITY=Object.freeze({tier:'R0',canDispatch:false,canMutateLiveWorld:false});
  function missing(input){var required=['identity','mission','strategicMetrics','knowledge','candidateSet','targetSlots','terminal'];return required.filter(function(k){return !input||input[k]==null;});}
  function diagnose(input){var m=missing(input);return Object.freeze({ready:m.length===0,missing:m,authority:AUTHORITY,actionCount:Catalog?Catalog.ACTION_COUNT:null,formatId:State?State.FORMAT_ID:null});}
  function project(input){var d=diagnose(input);if(!d.ready)throw new Error('Stage2F v2 projection incomplete: '+d.missing.join(','));var surface=Legality.buildActionSurface(input.candidateSet,input.targetSlots,{candidateSetId:input.candidateSetId,targetViewId:input.targetViewId});Legality.assertNoOmittedLiveLegalActions(Array.isArray(input.candidateSet)?input.candidateSet:input.candidateSet.entries,surface);return State.buildCanonicalState({identity:input.identity,mission:input.mission,strategicMetrics:input.strategicMetrics,knowledge:input.knowledge,actionSurface:surface,terminal:input.terminal});}
  return Object.freeze({BRIDGE_ID:'sentinel-grid-stage2f-v2-projection-v1',AUTHORITY:AUTHORITY,diagnose:diagnose,project:project});
});
