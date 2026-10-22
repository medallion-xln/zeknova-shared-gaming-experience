import { ConstructionParityReport } from '../../gameplay-construction/src/index.js';
import { immutableData } from '../../core/src/index.js';
import { CONSTRUCTION_CATALOG, evaluateZekNovaPlacement } from '../../../src/game/construction/policy.js';
import { buildingCollisionRadius } from '../../../src/world/Collision.js';
const recordsOf = buildings => (buildings?.records??[]).map(b=>({id:b.id,type:b.type,x:b.x,y:b.y,z:b.z,rotation:b.rotation,level:b.level??1,health:b.health??1000}));
export function captureConstructionInput(game, point, resources, { id='shadow-proposal',rotation }={}) {
  const t=game.terrain,x=point.x,z=point.z,records=recordsOf(game.buildings),obstacles=[];
  const addObstacle=o=>{if(Math.hypot(o.x-x,o.z-z)<o.radius+3)obstacles.push(o);};
  for(const o of t.mineableRocks??[])if(o.visible&&o.userData?.rockId)addObstacle({x:o.position.x,z:o.position.z,radius:Number(o.userData.collisionRadius??1)});
  for(const o of t.harvestableTrees??[])if(o.visible&&!o.userData?.falling&&o.userData?.harvestableTree){const u=o.userData,procedural=.18+Number(u.widthScale??1)*(u.treeSize==='large'?.24:u.treeSize==='medium'?.18:.12);addObstacle({x:o.position.x,z:o.position.z,radius:Number(u.highDetailCollisionRadius??procedural)});}
  for(const r of records)if(!['bridge','boat'].includes(r.type)&&r.health>0&&r.id!==t.collisionIgnoreRecord?.id)addObstacle({x:r.x,z:r.z,radius:buildingCollisionRadius(r.type)});
  for(const o of t.worldEnvironmentObstacles??[])addObstacle({x:Number(o.x),z:Number(o.z),radius:Number(o.radius??.7)});
  const bridgeRotation=t.bridgeRotationAt?.(x)??0,sin=Math.sin(bridgeRotation),cos=Math.cos(bridgeRotation),waterLevel=-.35;
  const request={id,type:game.buildings.selectedType,x,z};if(rotation!=null)request.rotation=rotation;
  return immutableData({request,inventory:{...resources},records,officerClass:game.buildings.officerClass??'ensign',aidCooldownRemaining:Math.max(0,Number(game.zeknovanAidCooldownUntil??0)-Date.now()),terrain:{worldSize:t.worldSize??180,waterLevel,height:t.heightAt(x,z),heights:[t.heightAt(x+1.5,z),t.heightAt(x-1.5,z),t.heightAt(x,z+1.5),t.heightAt(x,z-1.5)],waterInfrastructure:Boolean(t.isWaterAt?.(x,z,1.15)||t.riverDistanceAt?.(x,z)<=6),bridgeRotation,bridgeHeight:Math.max(waterLevel+.65,...[-9,-7.5,-6.25,6.25,7.5,9].map(a=>t.heightAt(x+sin*a,z+cos*a)))+.08,obstacles}});
}
/** This observer has no writer, save, network or progression interface. Captured
 * facts are immutable and contain no live methods. LEGACY remains the one mutator. */
export function installConstructionShadow(game, { mode='LEGACY', definitions=CONSTRUCTION_CATALOG, context=()=>({}), evaluate=evaluateZekNovaPlacement }={}) {
  if(!['LEGACY','SHADOW'].includes(mode))throw new Error('live ENGINE construction is not certified');
  const metrics={mode,compared:0,mismatches:0,errors:0,differences:[]},report=new ConstructionParityReport({limit:20});
  const buildings=game.buildings,original=buildings?.place;
  const status=()=>({...structuredClone(metrics),parity:report.snapshot()});
  if(mode==='LEGACY'||typeof original!=='function')return {status,dispose(){}};
  const wrapper=function(point,resources,terrain){
    let facts,predicted,ctx={};
    try{
      ctx=context();facts=captureConstructionInput(game,point,resources,ctx);
      // Small synthetic consumers from ZGE-03 may supply a custom catalog and terrain.
      predicted=evaluate(facts,definitions);
    }catch{metrics.errors++;}
    const actual=original.call(this,point,resources,terrain);
    if(facts&&predicted)try{
      const row=report.record({fixtureId:ctx.fixtureId??`live-${metrics.compared+1}`,request:facts.request,before:{inventory:facts.inventory,records:facts.records},after:{inventory:{...resources},records:recordsOf(buildings)},actual:actual?{id:actual.id,type:actual.type,x:actual.x,y:actual.y,z:actual.z,rotation:actual.rotation,level:actual.level??1}:null,predicted,identityControlled:Boolean(ctx.identityControlled),rotationControlled:Boolean(ctx.rotationControlled),unobservable:['pointer-prechecks','mission-progression-side-effects','network-authority'],reproduce:'Local construction=shadow; replay captured fixture at the recorded coordinates'});
      metrics.compared++;if(!row.matched){metrics.mismatches++;if(metrics.differences.length<20)metrics.differences.push(row);}
    }catch{metrics.errors++;}
    return actual;
  };
  buildings.place=wrapper;
  return {status,dispose(){if(buildings.place===wrapper)buildings.place=original;}};
}
