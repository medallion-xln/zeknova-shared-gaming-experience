import{fixture as baseFixture}from'./fixture.mjs';import{startSupervisor}from'../../runtime/supervisor.mjs';import{runtimeRequest}from'../../runtime/client.mjs';
export async function supervisedFixture(options={}){
 const f=await baseFixture(options.env??{});Object.assign(f.env,{ZGE_RUNTIME_SOCKET:f.directory+'/runtime.sock',ZGE_RUNTIME_KEY_FILE:f.directory+'/runtime.key',ZGE_MULTIPLAYER_WORLD:options.multiplayer===false?'0':'1'});
 let service=await startSupervisor({dbPath:f.env.ZGE_STAGING_DB,socketPath:f.env.ZGE_RUNTIME_SOCKET,keyPath:f.env.ZGE_RUNTIME_KEY_FILE,faults:true,...options.supervisor});
 const request=(op,input)=>runtimeRequest({socketPath:f.env.ZGE_RUNTIME_SOCKET,keyPath:f.env.ZGE_RUNTIME_KEY_FILE},op,input);
 const close=f.close;f.close=async()=>{await close();await service.close();};
 f.runtime=request;f.health=()=>service.health();f.restartRuntime=async()=>{await service.close();service=await startSupervisor({dbPath:f.env.ZGE_STAGING_DB,socketPath:f.env.ZGE_RUNTIME_SOCKET,keyPath:f.env.ZGE_RUNTIME_KEY_FILE,faults:true,...options.supervisor});};
 f.join=async(server,player='alice')=>{const before=await f.send(server,player);return f.send(server,player,{command:{commandId:'join-'+player,action:'join',expectedRevision:before.revision}});};
 return f;
}
