import { WorldEvaluator } from './evaluator.mjs';
import { PerformanceObserver } from 'node:perf_hooks';
const gc={count:0,durationMs:0};
const observer=new PerformanceObserver(list=>{for(const item of list.getEntries()){gc.count++;gc.durationMs+=item.duration;}});
observer.observe({entryTypes:['gc']});
const worldId=process.env.ZGE_RUNTIME_WORLD,workerId=process.env.ZGE_RUNTIME_WORKER;
const evaluator=new WorldEvaluator(worldId);let running=false,disposed=false;
process.on('message',async message=>{
 if(message.op==='dispose'){disposed=true;evaluator.dispose();process.send?.({op:'disposed'});process.disconnect();return;}
 if(message.op!=='evaluate'||running||disposed)return;running=true;
 try{
  const {input,id}=message;
  if(process.env.ZGE_RUNTIME_FAULTS==='1'&&input.runtimeFault==='crash-before-execution')process.exit(73);
  const started=performance.now(),data=await evaluator.evaluate(input);data.runtimeMetrics={evaluationMs:performance.now()-started,memory:process.memoryUsage(),gc:{...gc}};
  if(process.env.ZGE_RUNTIME_FAULTS==='1'&&input.runtimeFault==='crash-before-response')process.exit(75);
  if(process.env.ZGE_RUNTIME_FAULTS==='1'&&input.runtimeFault==='delay-short-response')await new Promise(resolve=>setTimeout(resolve,50));
  if(process.env.ZGE_RUNTIME_FAULTS==='1'&&input.runtimeFault==='delay-response')await new Promise(resolve=>setTimeout(resolve,5000));
  process.send?.({op:'result',id,workerId,data});
 }catch{process.send?.({op:'result',id:message.id,workerId,error:'runtime-validation-failed'});}
 finally{running=false;}
});
process.on('disconnect',()=>{evaluator.dispose();process.exit(0);});
process.send?.({op:'ready',workerId,worldId});
