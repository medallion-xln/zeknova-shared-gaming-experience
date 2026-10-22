import test from 'node:test';
import assert from 'node:assert/strict';
import {StagingWorldClient} from '../src/StagingWorldClient.js';
import {ConstructionRuntime} from '../../gameplay-construction/src/ConstructionRuntime.js';
import {worldOptions} from '../../../examples/construction-world/world.js';
test('client metrics separate transport acknowledgment and validated replica reconciliation and hooks cannot alter success',async()=>{
 const runtime=new ConstructionRuntime({...worldOptions,worldId:'valley'});let observed;const client=new StagingWorldClient({worldId:'valley',token:'private-fixture',onMetrics:m=>{observed=m;assert.ok(client.view);throw Error('observer');},fetchFn:async()=>({ok:true,json:async()=>({ok:true,snapshot:runtime.snapshot(),world:runtime.worldState(),revision:0,cursor:0,events:[],runtime:{generation:1},metrics:{schema:'zge.command-metrics.v1',totalMs:2}})})});
 const reply=await client.request();assert.equal(reply.ok,true);assert.equal(client.connected,true);assert.equal(observed.schema,'zge.client-command-metrics.v1');assert.equal(observed.generation,1);assert.ok(observed.httpAcknowledgmentMs>=0);assert.ok(observed.reconciliationMs>=0);assert.ok(observed.totalMs>=observed.httpAcknowledgmentMs);assert.equal(JSON.stringify(observed).includes('private-fixture'),false);assert.ok(Object.isFrozen(client.lastMetrics));runtime.dispose();
});
