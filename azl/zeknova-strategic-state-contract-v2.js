(function(root,factory){
  var api=factory(root.ZekNovaStrategicActionCatalogV2);
  if(typeof module==='object'&&module.exports) module.exports=api;
  root.ZekNovaStrategicStateContractV2=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Catalog){
  'use strict';
  var AUTHORITY=Object.freeze({tier:'R0',canDispatch:false,canMutateLiveWorld:false});
  function assert(c,m){if(!c)throw new Error(m);}
  function finite(v,n){assert(Number.isFinite(Number(v)),n+' must be finite');return Number(v);}
  function unit(v){v=finite(v,'metric');if(v>1&&v<=100)v=v/100;return Math.max(0,Math.min(1,v));}
  function cloneSort(v){
    if(Array.isArray(v))return v.map(cloneSort);
    if(v&&typeof v==='object')return Object.keys(v).sort().reduce(function(o,k){o[k]=cloneSort(v[k]);return o;},{});
    return v;
  }
  function canonicalStringify(v){return JSON.stringify(cloneSort(v));}
  function stableEntities(v){
    if(!Array.isArray(v))return [];
    return v.map(cloneSort).sort(function(a,b){return canonicalStringify(a).localeCompare(canonicalStringify(b));});
  }
  function hash32(s,seed){var h=(2166136261^(seed||0))>>>0;for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}return h>>>0;}
  function hashFeatures(value){var s=canonicalStringify(value);return [0,1,2,3].map(function(i){return hash32(s,i*2654435761)/4294967295;});}
  function oneHot(value,values){return values.map(function(v){return value===v?1:0;});}
  function buildCanonicalState(input){
    assert(input&&typeof input==='object','input required');
    var identity=input.identity||{}, mission=input.mission||{}, metrics=input.strategicMetrics||{}, knowledge=input.knowledge||{}, surface=input.actionSurface||{}, terminal=input.terminal||{};
    ['factionId','biomeId','operationalAreaId'].forEach(function(k){assert(typeof identity[k]==='string'&&identity[k],k+' required');});
    ['missionId','missionPhase','objectiveId'].forEach(function(k){assert(typeof mission[k]==='string'&&mission[k],k+' required');});
    assert(Catalog&&Catalog.ACTION_COUNT===13,'v2 catalog unavailable');
    assert(Array.isArray(surface.actionKeys)&&surface.actionKeys.length===13,'13 action keys required');
    Catalog.ACTION_KEYS.forEach(function(k,i){assert(surface.actionKeys[i]===k,'action order mismatch at '+i);});
    assert(Array.isArray(surface.legalMask)&&surface.legalMask.length===13,'13-bit legal mask required');
    surface.legalMask.forEach(function(x){assert(x===0||x===1,'legal mask must be binary');});
    var state={
      formatId:'zeknova/stage2f-strategic-state-json@2',schemaVersion:2,
      authority:AUTHORITY,
      identity:{factionId:identity.factionId,biomeId:identity.biomeId,operationalAreaId:identity.operationalAreaId},
      mission:{missionId:mission.missionId,missionPhase:mission.missionPhase,objectiveId:mission.objectiveId,objectiveProgress:unit(mission.objectiveProgress)},
      strategicMetrics:{tensionValue:unit(metrics.tensionValue),tensionBand:metrics.tensionBand,infrastructureReliability:unit(metrics.infrastructureReliability),infrastructureBand:metrics.infrastructureBand},
      knowledge:{
        knownRoutes:stableEntities(knowledge.knownRoutes),hostileContacts:stableEntities(knowledge.hostileContacts),attackerAlerts:stableEntities(knowledge.attackerAlerts),
        knownStructures:stableEntities(knowledge.knownStructures),knownResources:stableEntities(knowledge.knownResources),shareableIntelligence:stableEntities(knowledge.shareableIntelligence)
      },
      actionSurface:{catalogId:surface.catalogId||Catalog.CONTRACT_ID,actionKeys:Catalog.ACTION_KEYS.slice(),legalMask:surface.legalMask.slice(),targetSlots:cloneSort(surface.targetSlots||{}),candidateSetId:String(surface.candidateSetId||''),targetViewId:String(surface.targetViewId||'')},
      terminal:{isTerminal:Boolean(terminal.isTerminal),terminalReason:terminal.terminalReason==null?null:String(terminal.terminalReason),requiresReplan:Boolean(terminal.requiresReplan)}
    };
    return cloneSort(state);
  }
  function encodeObservationV2(state){
    var f=[];
    ['factionId','biomeId','operationalAreaId'].forEach(function(k){f.push.apply(f,hashFeatures(state.identity[k]));});
    ['missionId','objectiveId','candidateSetId','targetViewId'].forEach(function(k){var v=(k in state.mission)?state.mission[k]:state.actionSurface[k];f.push.apply(f,hashFeatures(v));});
    f.push(state.mission.objectiveProgress,state.strategicMetrics.tensionValue,state.strategicMetrics.infrastructureReliability);
    f.push.apply(f,oneHot(state.mission.missionPhase,['opening','midgame','late']));
    f.push.apply(f,oneHot(state.strategicMetrics.tensionBand,['low','medium','high']));
    f.push.apply(f,oneHot(state.strategicMetrics.infrastructureBand,['degraded','developing','stable']));
    ['knownRoutes','hostileContacts','attackerAlerts','knownStructures','knownResources','shareableIntelligence'].forEach(function(k){f.push(Math.min(1,state.knowledge[k].length/32));});
    ['knownRoutes','hostileContacts','attackerAlerts','knownStructures','knownResources','shareableIntelligence'].forEach(function(k){var h=hashFeatures(state.knowledge[k]);f.push(h[0],h[1]);});
    f.push.apply(f,state.actionSurface.legalMask);
    Catalog.ACTION_KEYS.forEach(function(k){var row=state.actionSurface.targetSlots[k];var count=Array.isArray(row)?row.length:0;f.push(Math.min(1,count/16));});
    f.push(state.terminal.isTerminal?1:0,state.terminal.requiresReplan?1:0,1);
    assert(f.length===87,'v2 feature count mismatch: '+f.length);
    return f;
  }
  async function sha256Hex(text){
    assert(rootCrypto(),'Web Crypto unavailable');
    var bytes=new TextEncoder().encode(text);var digest=await rootCrypto().subtle.digest('SHA-256',bytes);
    return Array.from(new Uint8Array(digest)).map(function(b){return b.toString(16).padStart(2,'0');}).join('');
  }
  function rootCrypto(){return (typeof globalThis!=='undefined'&&globalThis.crypto)?globalThis.crypto:null;}
  async function hashState(state){return sha256Hex(canonicalStringify(state));}
  async function hashObservation(state){return sha256Hex('zeknova-strategic-observation-v2-87f\n'+canonicalStringify(encodeObservationV2(state)));}
  return Object.freeze({CONTRACT_ID:'zeknova-strategic-state-contract-v2',FORMAT_ID:'zeknova/stage2f-strategic-state-json@2',OBSERVATION_CODEC_ID:'zeknova-strategic-observation-v2-87f',FEATURE_COUNT:87,AUTHORITY:AUTHORITY,canonicalStringify:canonicalStringify,buildCanonicalState:buildCanonicalState,encodeObservationV2:encodeObservationV2,hashState:hashState,hashObservation:hashObservation});
});
