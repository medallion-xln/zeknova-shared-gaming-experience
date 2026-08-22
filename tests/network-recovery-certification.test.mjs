import assert from 'node:assert/strict';
import { MultiplayerClient } from '../src/multiplayer/MultiplayerClient.js';
import { createStage2FCollectorClient } from '../src/game/Stage2FRuntimeCollectorClient.js';

let now=1000, calls=0;
const responses=[new Response('{}',{status:503}),new Response('{}',{status:200,headers:{'Content-Type':'application/json'}})];
const client=new MultiplayerClient({fetchImpl:async()=>{calls++;return responses.shift();},now:()=>now,random:()=>0});
let result=await client.sync({}); assert.equal(result.reason,'network-error'); assert.equal(calls,1);
result=await client.sync({}); assert.equal(result.reason,'backoff'); assert.equal(calls,1,'backoff suppresses polling traffic');
now=result.retryAt; result=await client.sync({}); assert.deepEqual(result,{}); assert.equal(client.status().state,'online');

const expired=new MultiplayerClient({fetchImpl:async()=>new Response('{}',{status:401})});
assert.equal((await expired.sync({})).reason,'session-expired'); assert.equal((await expired.sync({})).reason,'session-expired');
expired.resumeAfterAuthentication(); assert.equal(expired.status().terminal,false);

const originalFetch=globalThis.fetch, originalWarn=console.warn; let fetches=0,warnings=0;
globalThis.fetch=async()=>{fetches++;throw new TypeError('collector absent')}; console.warn=()=>{warnings++};
try {
  const collector=createStage2FCollectorClient({endpoint:'http://127.0.0.1:43127',token:'test',evidenceMode:'QUALIFICATION',environmentId:'test'});
  collector.registerProvider({diagnose:async()=>({ready:true,sampling:{stateIdentity:'a'.repeat(64)}}),collect:async()=>({envelope:{metadata:{stateIdentity:'a'.repeat(64)}},legacyEvidence:{},context:{}})});
  await assert.rejects(()=>collector.pollOnce()); const backedOff=await collector.pollOnce();
  assert.equal(backedOff.reason,'collector-unavailable-backoff'); assert.equal(fetches,1); assert.equal(warnings,1,'collector outage logs once, not every interval');
  assert.equal(collector.diagnose().authority.tier,'R0');
} finally { globalThis.fetch=originalFetch; console.warn=originalWarn; }
console.log('ZEK-15 network recovery certification: PASS');
