import { immutableData, canonicalJSON } from '../../core/src/index.js';
/** Exact event projection for recovery/audit. Retains ownership/resources/rewards.
 * Command receipts remain a separate durable table; this is never a reward executor. */
export function historyState(snapshot){return structuredClone({worldId:snapshot.worldId,revision:snapshot.revision,inventory:snapshot.construction.inventory,inventoryRevision:snapshot.construction.inventoryRevision,buildings:Object.fromEntries(snapshot.construction.buildings.map(b=>[b.id,b])),player:snapshot.player,selectedType:snapshot.selectedType,built:snapshot.built,mission:{status:snapshot.mission.status,progress:snapshot.mission.progress??[]},rewardIds:snapshot.rewardIds,authority:{mode:'ENGINE',owner:'php-staging-server'}});}
export function applyWorldEvent(state,event){
 if(event.worldId!==state.worldId||event.authority?.mode!=='ENGINE'||event.authority.owner!==state.authority.owner)throw new Error('history authority mismatch');
 switch(event.type){
 case 'ResourcesChanged':state.inventory=structuredClone(event.inventory);state.inventoryRevision=event.inventoryRevision;break;
 case 'BuildingCreated':if(Object.hasOwn(state.buildings,event.building.id))throw new Error('duplicate history building');Object.defineProperty(state.buildings,event.building.id,{value:structuredClone(event.building),enumerable:true,writable:true,configurable:true});state.built++;break;
 case 'BuildingRemoved':delete state.buildings[event.building.id];break;
 case 'PlayerMoved':state.player=structuredClone(event.player);break;
 case 'BuildingSelected':state.selectedType=event.buildingType;break;
 case 'MissionProgressChanged':{const d=event.detail;if(d.type==='objective:progress'){const p={id:d.id,value:d.value,target:d.target,complete:d.complete},index=state.mission.progress.findIndex(p=>p.id===d.id);if(index<0)state.mission.progress.push(p);else state.mission.progress[index]=p;}if(d.type==='mission:complete')state.mission.status='complete';break;}
 case 'MissionRewardApplied':if(state.rewardIds.includes(event.rewardId))throw new Error('duplicate reward in history');state.rewardIds.push(event.rewardId);state.player.xp+=event.xp;break;
 }
 state.revision=event.revision;return state;
}
export function replayWorldEvents(checkpoint,events,{cursor=0}={}){const state=structuredClone(checkpoint);for(const event of events){if(event.sequence!==cursor++)throw new Error('noncontiguous history cursor');applyWorldEvent(state,event);}return immutableData({state,cursor,checksum:canonicalJSON(state)});}
