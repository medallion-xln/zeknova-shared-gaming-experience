import {performance} from 'node:perf_hooks';
import {createEngine} from '../packages/core/src/index.js';
import {Construction} from '../packages/gameplay-construction/src/index.js';
const pct=a=>{a.sort((a,b)=>a-b);return {p50:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],p99:a[Math.floor(a.length*.99)]};};
const c=new Construction({definitions:[{type:'unit',cost:{stone:1}}],inventory:{stone:1000},terrain:{isValid:()=>true,heightAt:()=>0}});const validation=[];for(let i=0;i<500;i++){const t=performance.now();c.evaluate({id:String(i),type:'unit',x:i,z:0});validation.push(performance.now()-t);}
const heapBefore=process.memoryUsage().heapUsed;const transactions=[];for(let i=0;i<100;i++){const t=performance.now();c.execute({commandId:String(i),action:'place',id:String(i),type:'unit',x:i,z:0});transactions.push(performance.now()-t);}
const snapshot=c.snapshot(),save=[],restore=[];for(let i=0;i<20;i++){let t=performance.now();JSON.stringify(snapshot);save.push(performance.now()-t);t=performance.now();c.restore(snapshot);restore.push(performance.now()-t);}
const e=createEngine({scheduler:'manual'});await e.start();const steps=[];for(let i=0;i<1000;i++){const t=performance.now();e.step();steps.push(performance.now()-t);}await e.dispose();
console.log(JSON.stringify({validation:pct(validation),transaction:pct(transactions),save:pct(save),restore:pct(restore),simulationStep:pct(steps),heapDelta:process.memoryUsage().heapUsed-heapBefore,serializedBytes:JSON.stringify(snapshot).length},null,2));
