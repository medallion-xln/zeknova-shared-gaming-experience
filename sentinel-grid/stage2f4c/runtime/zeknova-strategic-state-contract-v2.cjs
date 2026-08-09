const crypto=require('node:crypto');
const Catalog=require('./zeknova-strategic-action-catalog-v2.cjs');
const AUTHORITY=Object.freeze({tier:'R0',canDispatch:false,canMutateLiveWorld:false});
function assert(c,m){if(!c)throw new Error(m);}
function finite(v,n){assert(Number.isFinite(Number(v)),n+' must be finite');return Number(v);}
function unit(v){v=finite(v,'metric');if(v>1&&v<=100)v/=100;return Math.max(0,Math.min(1,v));}
function cloneSort(v){if(Array.isArray(v))return v.map(cloneSort);if(v&&typeof v==='object')return Object.keys(v).sort().reduce((o,k)=>(o[k]=cloneSort(v[k]),o),{});return v;}
function canonicalStringify(v){return JSON.stringify(cloneSort(v));}
function stableEntities(v){return Array.isArray(v)?v.map(cloneSort).sort((a,b)=>canonicalStringify(a).localeCompare(canonicalStringify(b))):[];}
function hash32(s,seed=0){let h=(2166136261^seed)>>>0;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}return h>>>0;}
function hashFeatures(value){const s=canonicalStringify(value);return [0,1,2,3].map(i=>hash32(s,(i*2654435761)>>>0)/4294967295);}
function oneHot(value,values){return values.map(v=>value===v?1:0);}
function buildCanonicalState(input){
 assert(input&&typeof input==='object','input required');const identity=input.identity||{},mission=input.mission||{},metrics=input.strategicMetrics||{},knowledge=input.knowledge||{},surface=input.actionSurface||{},terminal=input.terminal||{};
 ['factionId','biomeId','operationalAreaId'].forEach(k=>assert(typeof identity[k]==='string'&&identity[k],k+' required'));
 ['missionId','missionPhase','objectiveId'].forEach(k=>assert(typeof mission[k]==='string'&&mission[k],k+' required'));
 assert(Array.isArray(surface.actionKeys)&&surface.actionKeys.length===13,'13 action keys required');Catalog.ACTION_KEYS.forEach((k,i)=>assert(surface.actionKeys[i]===k,'action order mismatch at '+i));
 assert(Array.isArray(surface.legalMask)&&surface.legalMask.length===13,'13-bit legal mask required');surface.legalMask.forEach(x=>assert(x===0||x===1,'legal mask must be binary'));
 return cloneSort({formatId:'zeknova/stage2f-strategic-state-json@2',schemaVersion:2,authority:AUTHORITY,
 identity:{factionId:identity.factionId,biomeId:identity.biomeId,operationalAreaId:identity.operationalAreaId},
 mission:{missionId:mission.missionId,missionPhase:mission.missionPhase,objectiveId:mission.objectiveId,objectiveProgress:unit(mission.objectiveProgress)},
 strategicMetrics:{tensionValue:unit(metrics.tensionValue),tensionBand:metrics.tensionBand,infrastructureReliability:unit(metrics.infrastructureReliability),infrastructureBand:metrics.infrastructureBand},
 knowledge:{knownRoutes:stableEntities(knowledge.knownRoutes),hostileContacts:stableEntities(knowledge.hostileContacts),attackerAlerts:stableEntities(knowledge.attackerAlerts),knownStructures:stableEntities(knowledge.knownStructures),knownResources:stableEntities(knowledge.knownResources),shareableIntelligence:stableEntities(knowledge.shareableIntelligence)},
 actionSurface:{catalogId:surface.catalogId||Catalog.CONTRACT_ID,actionKeys:Catalog.ACTION_KEYS.slice(),legalMask:surface.legalMask.slice(),targetSlots:cloneSort(surface.targetSlots||{}),candidateSetId:String(surface.candidateSetId||''),targetViewId:String(surface.targetViewId||'')},
 terminal:{isTerminal:Boolean(terminal.isTerminal),terminalReason:terminal.terminalReason==null?null:String(terminal.terminalReason),requiresReplan:Boolean(terminal.requiresReplan)}});
}
function encodeObservationV2(state){const f=[];['factionId','biomeId','operationalAreaId'].forEach(k=>f.push(...hashFeatures(state.identity[k])));['missionId','objectiveId','candidateSetId','targetViewId'].forEach(k=>f.push(...hashFeatures(k in state.mission?state.mission[k]:state.actionSurface[k])));f.push(state.mission.objectiveProgress,state.strategicMetrics.tensionValue,state.strategicMetrics.infrastructureReliability);f.push(...oneHot(state.mission.missionPhase,['opening','midgame','late']));f.push(...oneHot(state.strategicMetrics.tensionBand,['low','medium','high']));f.push(...oneHot(state.strategicMetrics.infrastructureBand,['degraded','developing','stable']));['knownRoutes','hostileContacts','attackerAlerts','knownStructures','knownResources','shareableIntelligence'].forEach(k=>f.push(Math.min(1,state.knowledge[k].length/32)));['knownRoutes','hostileContacts','attackerAlerts','knownStructures','knownResources','shareableIntelligence'].forEach(k=>{const h=hashFeatures(state.knowledge[k]);f.push(h[0],h[1]);});f.push(...state.actionSurface.legalMask);Catalog.ACTION_KEYS.forEach(k=>{const row=state.actionSurface.targetSlots[k];f.push(Math.min(1,(Array.isArray(row)?row.length:0)/16));});f.push(state.terminal.isTerminal?1:0,state.terminal.requiresReplan?1:0,1);assert(f.length===87,'v2 feature count mismatch: '+f.length);return f;}
function sha256Hex(text){return crypto.createHash('sha256').update(text).digest('hex');}
function hashState(state){return sha256Hex(canonicalStringify(state));}
function hashObservation(state){return sha256Hex('zeknova-strategic-observation-v2-87f\n'+canonicalStringify(encodeObservationV2(state)));}
function hashLegalMask(surface){return sha256Hex(Catalog.CONTRACT_ID+'\n'+surface.legalMask.join(''));}
function hashTargetSlots(surface){return sha256Hex(Catalog.CONTRACT_ID+'\n'+canonicalStringify(surface.targetSlots));}
module.exports=Object.freeze({CONTRACT_ID:'zeknova-strategic-state-contract-v2',FORMAT_ID:'zeknova/stage2f-strategic-state-json@2',OBSERVATION_CODEC_ID:'zeknova-strategic-observation-v2-87f',FEATURE_COUNT:87,AUTHORITY,canonicalStringify,buildCanonicalState,encodeObservationV2,hashState,hashObservation,hashLegalMask,hashTargetSlots});
