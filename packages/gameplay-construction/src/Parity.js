import { immutableData } from '../../core/src/index.js';
export const PARITY_CLASSES = Object.freeze(['ACCEPTANCE_MISMATCH','RESOURCE_COST_MISMATCH','POSITION_MISMATCH','COLLISION_MISMATCH','WORLD_STATE_MISMATCH','EVENT_ORDER_MISMATCH','SERIALIZATION_MISMATCH','EXPECTED_NORMALIZATION']);
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const near = (a,b) => Math.abs(a-b) <= 1e-8;
export function compareConstruction(observation) {
  const o=immutableData(observation),differences=[],unobservable=[...(o.unobservable??[])];
  const add=(classification,detail)=>differences.push({classification,detail});
  const accepted=Boolean(o.actual);
  if(accepted!==o.predicted.ok)add('ACCEPTANCE_MISMATCH',{legacy:accepted,engine:o.predicted.ok,engineReason:o.predicted.reason??null});
  const expectedInventory={...o.before.inventory};
  if(o.predicted.ok)for(const [k,v]of Object.entries(o.predicted.cost))expectedInventory[k]=(expectedInventory[k]??0)-v;
  for(const key of new Set([...Object.keys(expectedInventory),...Object.keys(o.after.inventory)]))if(!near(expectedInventory[key]??0,o.after.inventory[key]??0))add('RESOURCE_COST_MISMATCH',{resource:key,expected:expectedInventory[key]??0,actual:o.after.inventory[key]??0});
  if(accepted&&o.predicted.ok){
    for(const key of ['type','x','y','z','level']){
      const a=o.actual[key],b=o.predicted.building[key];if(typeof a==='number'? !near(a,b):a!==b)add('POSITION_MISMATCH',{key,expected:b,actual:a});
    }
    if(o.identityControlled){if(o.actual.id!==o.predicted.building.id)add('WORLD_STATE_MISMATCH',{field:'id'});}else add('EXPECTED_NORMALIZATION',{field:'id',rule:'opaque legacy UUID mapped to request id; uniqueness and persistence checked separately'});
    if(o.rotationControlled||o.request.type==='bridge'){if(!near(o.actual.rotation,o.predicted.building.rotation))add('POSITION_MISMATCH',{field:'rotation',actual:o.actual.rotation,expected:o.predicted.building.rotation});}else unobservable.push('random-rotation-draw');
  }
  if(o.after.records.length!==o.before.records.length+(accepted?1:0))add('WORLD_STATE_MISMATCH',{field:'record-count'});
  const expectedIds=new Set(o.before.records.map(r=>r.id));if(accepted&&expectedIds.has(o.actual.id))add('WORLD_STATE_MISMATCH',{field:'duplicate-id'});
  if(accepted&&!o.after.records.some(r=>r.id===o.actual.id))add('WORLD_STATE_MISMATCH',{field:'missing-record'});
  if(!accepted&&!same(o.before.records,o.after.records))add('WORLD_STATE_MISMATCH',{field:'rejected-world-mutation'});
  if(o.collisionActual!=null&&o.collisionExpected!=null){if(o.collisionActual!==o.collisionExpected)add('COLLISION_MISMATCH',{expected:o.collisionExpected,actual:o.collisionActual});}else unobservable.push('raw-collision-query');
  if(o.serializedRecords){const parsed=JSON.parse(o.serializedRecords);if(!same(parsed,o.after.records))add('SERIALIZATION_MISMATCH',{field:'records'});}else unobservable.push('server-save-restore');
  if(o.serializedEngineState&&o.serializedLegacyState){if(!same(JSON.parse(o.serializedEngineState),JSON.parse(o.serializedLegacyState)))add('SERIALIZATION_MISMATCH',{field:'engine-versus-legacy-placement-projection'});}else unobservable.push('engine-save-projection');
  if(o.events){const placed=o.events.indexOf('record-added'),progress=o.events.indexOf('progression'),save=o.events.indexOf('save-requested');if(accepted&&((placed<0)||(progress>=0&&progress<placed)||(save>=0&&save<placed)))add('EVENT_ORDER_MISMATCH',{events:o.events});}else unobservable.push('inner-events');
  if(o.errorActual!=null&&o.errorExpected!=null&&o.errorActual!==o.errorExpected)add('WORLD_STATE_MISMATCH',{field:'error-classification',expected:o.errorExpected,actual:o.errorActual});
  if(!accepted&&o.errorActual==null)unobservable.push('legacy-error-classification');
  const mismatches=differences.filter(d=>d.classification!=='EXPECTED_NORMALIZATION');
  return immutableData({fixtureId:o.fixtureId,request:o.request,canonical:{before:o.before,after:o.after,actual:o.actual,predicted:o.predicted,events:o.events??null},matched:mismatches.length===0,differences,unobservable:[...new Set(unobservable)],fullyObservable:unobservable.length===0,reproduce:o.reproduce??'Replay captured request with before state'});
}
export class ConstructionParityReport {
  constructor({limit=100}={}){this.limit=limit;this.rows=[];this.total=0;this.mismatched=0;this.unobservable=0;this.classes={};}
  record(observation){const row=compareConstruction(observation);this.total++;if(!row.matched)this.mismatched++;if(row.unobservable.length)this.unobservable++;for(const d of row.differences)this.classes[d.classification]=(this.classes[d.classification]??0)+1;this.rows.push(row);if(this.rows.length>this.limit)this.rows.shift();return row;}
  snapshot(){return structuredClone({schema:'zge.construction-parity.v1',total:this.total,matched:this.total-this.mismatched,mismatched:this.mismatched,unobservable:this.unobservable,classes:this.classes,rows:this.rows});}
}
