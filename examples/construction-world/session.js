import {createEngine,immutableData} from '../../packages/core/src/index.js';
import {installConstruction} from '../../packages/gameplay-construction/src/index.js';

export async function createConstructionSession() {
 const engine=createEngine({id:'construction-demo-v2',scheduler:'manual',config:{features:{construction:'ENGINE'}}});
 const builder=engine.world.createEntity('builder');engine.world.addComponent(builder,'transform',{x:0,y:0,z:0});
 const handle=installConstruction(engine,{definitions:[{type:'shelter',radius:1,cost:{stone:4}}],inventory:{stone:20},terrain:{isValid:(_d,x,z)=>Math.abs(x)<=10&&Math.abs(z)<=10,heightAt:()=>0}});await engine.start();
 const initial=engine.snapshot();let actions=[],nextId=1,lastResult=null;
 const sync=()=>engine.world.setResource('construction',handle.construction.snapshot());
 const apply=action=>{
  if(action.kind==='rollback'){handle.construction.rollback(action.commandId);sync();lastResult={ok:true,action:'rollback'};}
  else{engine.commands.enqueue(action.command);engine.step();lastResult=engine.commands.results.get(action.command.id);}
  return structuredClone(lastResult);
 };
 return {
  engine,
  place(x,z){const id='request-'+nextId++;const action={kind:'command',command:{id,type:'construction',payload:{action:'place',commandId:id,id:'building-'+id,type:'shelter',x,z}}};const result=apply(action);actions.push(action);return result;},
  remove(id){const commandId='request-'+nextId++;const action={kind:'command',command:{id:commandId,type:'construction',payload:{action:'remove',commandId,id}}};const result=apply(action);actions.push(action);return result;},
  rollback(){const commandId=handle.construction.snapshot().ledger.at(-1)?.commandId;if(!commandId)return {ok:false,reason:'nothing-to-rollback'};const action={kind:'rollback',commandId};const result=apply(action);actions.push(action);return result;},
  stage(x,z){const id='request-'+nextId++;handle.construction.stage({action:'place',commandId:id,id:'building-'+id,type:'shelter',x,z});sync();return id;},
  inspect(){return immutableData({world:handle.construction.worldState({domain:'construction',owner:'engine-local-fixture',epoch:0}),construction:handle.construction.snapshot(),step:engine.clock.stepNumber,lastResult,actions});},
  save(){return JSON.stringify({schema:'zge.demo-session.v2',engine:engine.snapshot(),actions,nextId});},
  restore(serialized){const saved=JSON.parse(serialized);if(saved.schema!=='zge.demo-session.v2')throw new Error('unsupported demo save');engine.restore(saved.engine);handle.construction.recoverPending();sync();actions=structuredClone(saved.actions);nextId=saved.nextId;lastResult={ok:true,action:'restore'};},
  replay(){const expected=JSON.stringify(handle.construction.snapshot()),step=engine.clock.stepNumber;engine.restore(initial);for(const action of actions)apply(action);return {deterministic:expected===JSON.stringify(handle.construction.snapshot())&&step===engine.clock.stepNumber,steps:engine.clock.stepNumber};},
  async dispose(){await engine.dispose();},
 };
}
