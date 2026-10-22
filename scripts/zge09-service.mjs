import { startWorldService,serviceRequest } from '../packages/server-php/runtime/world-service.mjs';
const operation=process.argv[2]??'start',directory=process.env.ZGE_STAGING_DIR??'/tmp/zge09-world';
try{
 if(operation==='status'||operation==='stop'){console.log(JSON.stringify(await serviceRequest(directory,operation)));}
 else if(operation==='start'){
  const service=await startWorldService({directory});let stopping=false;
  for(const signal of['SIGINT','SIGTERM'])process.on(signal,async()=>{if(stopping)return;stopping=true;await service.close();});
  console.log(JSON.stringify({event:'service-started',protocol:'zge.world-service.v1',pid:process.pid,directory,controlPath:service.controlPath}));await service.closed;
 }else throw Error('invalid operation');
}catch{console.error(JSON.stringify({event:'service-operation-failed',reason:'configuration-ownership-or-service-unavailable'}));process.exitCode=1;}
