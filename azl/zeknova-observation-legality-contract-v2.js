(function(root,factory){
  var api=factory(root.ZekNovaStrategicActionCatalogV2);
  if(typeof module==='object'&&module.exports) module.exports=api;
  root.ZekNovaObservationLegalityContractV2=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Catalog){
  'use strict';
  var AUTHORITY=Object.freeze({tier:'R0',canDispatch:false,canMutateLiveWorld:false});
  function assert(c,m){if(!c)throw new Error(m);}
  function clone(v){return JSON.parse(JSON.stringify(v));}
  function buildActionSurface(candidateSet,targetSlots,meta){
    var entries=Array.isArray(candidateSet)?candidateSet:(candidateSet&&candidateSet.entries);
    Catalog.assertComplete(entries);meta=meta||{};targetSlots=targetSlots||{};
    var byKey={};entries.forEach(function(e){byKey[e.actionKey]=e;});
    var legalMask=[],canonicalTargets={};
    Catalog.ACTION_KEYS.forEach(function(key){
      var e=byKey[key],legal=e.legal===true,requiresTarget=e.requiresTarget===true||Catalog.REQUIRES_TARGET[key]===true;
      var targets=Array.isArray(targetSlots[key])?targetSlots[key].map(clone):[];
      if(legal&&requiresTarget)assert(targets.length>0,'legal targeted action has no target: '+key);
      legalMask.push(legal?1:0);canonicalTargets[key]=targets;
    });
    return Object.freeze({catalogId:Catalog.CONTRACT_ID,actionKeys:Catalog.ACTION_KEYS.slice(),legalMask:legalMask,targetSlots:canonicalTargets,candidateSetId:String(meta.candidateSetId||candidateSet.candidateSetId||''),targetViewId:String(meta.targetViewId||'')});
  }
  function assertNoOmittedLiveLegalActions(liveEntries,surface){
    var projected=new Set(surface.actionKeys.filter(function(_,i){return surface.legalMask[i]===1;}));
    var omitted=(liveEntries||[]).filter(function(e){return e&&e.legal===true&&!projected.has(e.actionKey);}).map(function(e){return e.actionKey;});
    assert(omitted.length===0,'omitted live legal actions: '+omitted.join(','));return true;
  }
  function assertIllegalVisitsZero(visits,surface){
    assert(Array.isArray(visits)&&visits.length===13,'13 visit counts required');
    visits.forEach(function(v,i){assert(Number.isInteger(v)&&v>=0,'visit count invalid');if(surface.legalMask[i]===0)assert(v===0,'illegal action received visits: '+surface.actionKeys[i]);});return true;
  }
  return Object.freeze({CONTRACT_ID:'zeknova-observation-legality-contract-v2',SCHEMA_VERSION:2,AUTHORITY:AUTHORITY,buildActionSurface:buildActionSurface,assertNoOmittedLiveLegalActions:assertNoOmittedLiveLegalActions,assertIllegalVisitsZero:assertIllegalVisitsZero});
});
