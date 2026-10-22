import{createEngine,immutableData}from'../../packages/core/src/index.js';
import{StagingWorldClient}from'../../packages/persistence/src/index.js';
export async function createServerGameplaySession({auth,storage}){
 const client=new StagingWorldClient({...auth,historyEndpoint:'/staging/events'});
 const identity=/^[a-f0-9]{64}$/.test(auth.token)?await client.reauthenticate(auth.token,{resume:false}):await client.connect();
 auth.token=client.token;
 // Stable across access-token renewal; authorized identity is known before reading an outbox.
 const key='zge.staging.pending.v2.'+JSON.stringify([identity.worldId,identity.playerId]);
 const legacyKey='zge.staging.pending.'+auth.worldId+'.'+auth.token.slice(0,8);
 const saved=storage.getItem(key)??storage.getItem(legacyKey)??'[]';
 client.pending=JSON.parse(saved);client.persist=value=>storage.setItem(key,JSON.stringify(value));
 storage.setItem(key,saved);storage.removeItem(legacyKey);
 await client.reconnect();if(client.view.schema==='zge.multiplayer-view.v1'&&!client.view.player&&identity.role==='builder'){await client.submit({action:'join',commandId:crypto.randomUUID()});}
 const engine=createEngine({id:'server-world-view',scheduler:'manual'});await engine.start();let lastResult=null,queue=Promise.resolve(),disposed=false,inputActive=false;const serial=fn=>{const task=queue.then(fn);queue=task.catch(()=>{});return task;};
 const sync=()=>{engine.world.setResource('source-world',client.world);engine.step();};sync();
 const session={engine,isServer:true,client,setInputActive(value){inputActive=!!value;},
  execute(command){const task=queue.then(async()=>{if(client.pending.length)await client.reconnect();const response=await client.submit({...command,commandId:command.commandId??crypto.randomUUID()});lastResult=response.result;sync();return response.result;});queue=task.catch(()=>{});return task;},
  place(x,z,type=client.view.selectedType){const id=crypto.randomUUID();return session.execute({action:'place',id:'b-'+id,type,x,z,rotation:0});},move(dx,dz){return session.execute({action:'move',dx,dz});},select(type){return session.execute({action:'select',type});},remove(id){return session.execute({action:'remove',id});},grant(){return{ok:false,reason:'server-controlled-supplies'};},
  inspect(){const s=client.view;return immutableData({world:client.world,construction:s.construction,player:s.player??{id:'spectator',x:0,y:0,z:-5,xp:0},players:s.players??[],team:s.team??null,mission:s.team?.mission??s.mission,rewardIds:s.rewardIds,selectedType:s.selectedType,built:s.team?.built??s.built,events:client.events,failures:[],lastResult,step:engine.clock.stepNumber,connection:{sessionId:client.sessionId,connectionId:client.connectionId,identity:client.identity,expires:client.expires,connected:client.connected,revision:s.revision,cursor:client.serverCursor,downloadedCursor:client.cursor,pending:client.pending.length}});},
  async reauthenticate(secret){await queue;const result=await client.reauthenticate(secret);auth.token=client.token;storage.setItem('zge.staging.auth',JSON.stringify(auth));sync();return result;},async disconnect(){await queue;return client.disconnect();},snapshot(){return client.view;},async save(){return serial(async()=>{const data=await client.request();sync();return data.acknowledgment;});},async restore(){return serial(async()=>{const result=await client.reconnect();sync();return result;});},async replay(){await queue;const response=await client.request({replay:true});return response.replay;},subscribe(){return()=>{};},async dispose(){disposed=true;clearInterval(poll);await queue;try{await client.disconnect();}catch{}await engine.dispose();}
 };
 const poll=setInterval(()=>{if(!disposed&&!inputActive&&client.connectionId&&Date.now()>=client.retryAt)serial(()=>(client.pending.length?client.reconnect():client.request())).then(()=>{if(!disposed)sync();}).catch(()=>{});},10000);return session;
}
