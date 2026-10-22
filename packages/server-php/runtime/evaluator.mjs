import { createHash } from 'node:crypto';
import { canonicalJSON } from '../../core/src/index.js';
import { ConstructionPort } from '../../gameplay-construction/src/index.js';
import { worldOptions } from '../../../examples/construction-world/world.js';
const checksum=value=>createHash('sha256').update(canonicalJSON(value)).digest('hex');
/** The stdin compatibility path and supervised child share this one evaluator.
 * Its state is speculative; PHP always supplies the durable snapshot. */
export class WorldEvaluator {
 #runtime; #kind; #roster; #worldId; #stats={created:0,restored:0,cacheHits:0}; #fault='';
 constructor(worldId){this.#worldId=worldId;}
 async #create(input){
  const kind=input.multiPlayer||input.snapshot?.schema==='zge.multiplayer-construction.v1'?'multiplayer':'legacy';
  const roster=canonicalJSON(input.players??[]);
  if(this.#runtime&&this.#kind===kind){
   if(kind==='multiplayer'&&this.#roster!==roster){
    if(typeof this.#runtime.setPlayers==='function')this.#runtime.setPlayers(input.players??[]);
    else{this.#runtime.dispose();this.#runtime=null;}
   }
   if(this.#runtime){this.#roster=roster;return;}
  }
  this.#runtime?.dispose();this.#stats.created++;this.#kind=kind;this.#roster=roster;
  if(kind==='multiplayer'){
   const{MultiplayerConstructionRuntime}=await import('../../gameplay-construction/src/MultiplayerConstructionRuntime.js');
   this.#runtime=new MultiplayerConstructionRuntime({...worldOptions,worldId:this.#worldId,owner:'php-staging-server',multiPlayer:true,players:input.players??[],beforeCommit:()=>{if(this.#fault==='crash-during-validation')process.exit(74);}});
  }else this.#runtime=new ConstructionPort({...worldOptions,worldId:this.#worldId,owner:'php-staging-server',beforeCommit:()=>{if(this.#fault==='crash-during-validation')process.exit(74);}});
 }
 async evaluate(input){
  if(input.worldId!==this.#worldId)throw Error('world mismatch');
  this.#fault=process.env.ZGE_RUNTIME_FAULTS==='1'?(input.runtimeFault??''):'';
  await this.#create(input);
  if(input.snapshot){if(canonicalJSON(input.snapshot)!==canonicalJSON(this.#runtime.snapshot())){this.#runtime.restore(input.snapshot);this.#stats.restored++;}else this.#stats.cacheHits++;}
  else if(this.#runtime.snapshot().revision!==0){this.#runtime.dispose();this.#runtime=null;await this.#create(input);}
  if(this.#fault==='crash-during-validation'&&!input.command&&!input.commands?.length)process.exit(74);
  const events=[],results=[];
  let commandIndex=0;
  for(const command of(input.commands??(input.command?[input.command]:[]))){
   const before=this.#runtime.snapshot().events.length;
   results.push(this.#runtime.dispatch(command,{playerId:input.commandActors?.[commandIndex++]??input.playerId}));events.push(...this.#runtime.snapshot().events.slice(before));
   if(this.#runtime.snapshot().ledger.length>=(input.checkpointEvery??32))this.#runtime.compact({receiptsArchived:true});
  }
  const snapshot=this.#runtime.snapshot(),world=this.#runtime.worldState();
  const data={evaluation:{...this.#stats},snapshot,snapshotChecksum:checksum(snapshot),world,result:results.at(-1)??null,results,events,replay:input.replay?this.#runtime.replay():null};
  if(this.#kind==='multiplayer'&&input.playerId){data.projection=this.#runtime.viewerProjection(input.playerId);data.projectionChecksum=checksum(data.projection);data.eventsFiltered=this.#runtime.eventsFor(input.playerId,events);}
  return data;
 }
 dispose(){this.#runtime?.dispose();this.#runtime=null;}
}
