import{test}from'node:test';import assert from'node:assert/strict';import{Construction}from'../src/index.js';import{SaveTransport}from'../../persistence/src/index.js';import{createFakeSaveServer}from'../../persistence/test/fakeSaveServer.mjs';
const make=()=>new Construction({definitions:[{type:'hut',radius:1,cost:{stone:4}}],inventory:{stone:10},terrain:{isValid:()=>true,heightAt:()=>0}});
const command={id:'hut',type:'hut',commandId:'place',action:'place',x:1,z:1};
test('network timeout and save conflict retries transport a snapshot without reapplying the placement',async()=>{
 const c=make();c.execute(command);const server=createFakeSaveServer({failures:['hang',409]});server.revision=1;
 const transport=new SaveTransport({fetchImpl:server.fetch,teamCode:'SYNTHETIC',userId:'qa',requestTimeoutMs:20,baseBackoffMs:2,maxBackoffMs:5});
 const snapshot=c.snapshot();await transport.submit({version:4,user:{teamCode:'SYNTHETIC',id:'qa'},buildings:snapshot.buildings,resources:snapshot.inventory,zge:{extra:{construction:snapshot}}});
 assert.equal(transport.status().state,'saved');assert.ok(transport.status().counters.retried>=1);assert.equal(c.snapshot().inventory.stone,6);assert.equal(c.snapshot().buildings.length,1);c.execute(command);assert.equal(c.snapshot().inventory.stone,6);transport.dispose();
});
test('remote snapshot update fences stale local construction commands without claiming distributed authority',()=>{
 const c=make();const remote=c.snapshot();remote.revision=1;remote.inventoryRevision=1;remote.inventory.stone=6;remote.buildings=[{id:'remote',type:'hut',x:5,y:0,z:5,rotation:0,radius:1,level:1,state:'complete'}];c.restore(remote);
 assert.equal(c.execute({...command,expectedRevision:0,expectedInventoryRevision:0}).ok,false);assert.equal(c.snapshot().inventory.stone,6);assert.equal(c.snapshot().buildings.length,1);
});
