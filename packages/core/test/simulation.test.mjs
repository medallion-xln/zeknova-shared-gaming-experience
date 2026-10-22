import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../src/index.js';
test('system dependencies schedule deterministically and invalid graphs are rejected',async()=>{
 const e=createEngine({scheduler:'manual'}),order=[];
 e.addSystem({id:'a',run:()=>order.push('a')});e.addSystem({id:'c',after:['a'],run:()=>order.push('c')});e.addSystem({id:'b',after:['a'],run:()=>order.push('b')});
 assert.throws(()=>e.addSystem({id:'missing',after:['absent'],run(){}}),/requires/);
 e.addSystem({id:'render',phase:'render',run(){}});assert.throws(()=>e.addSystem({id:'backwards',phase:'physics',after:['render'],run(){}}),/backwards/);
 await e.start();e.step();assert.deepEqual(order,['a','c','b']);await e.dispose();
});
test('command IDs, ordering and pending state survive restoration without replaying deductions',async()=>{
 const e=createEngine({scheduler:'manual',config:{features:{inventory:'ENGINE'}}});
 e.commands.register('add','inventory',(w,c)=>{w.setResource('n',(w.getResource('n')??0)+c.amount);return w.getResource('n');});await e.start();
 e.commands.enqueue({id:'1',type:'add',amount:3});const pending=e.snapshot();e.step();assert.equal(e.world.getResource('n'),3);
 e.restore(pending);e.step();assert.equal(e.world.getResource('n'),3);assert.equal(e.commands.enqueue({id:'1',type:'add',amount:9}),false);
 const snapshot=e.snapshot();e.world.setResource('n',99);e.restore(snapshot);assert.equal(e.world.getResource('n'),3);await e.dispose();
});
test('registered component validation and snapshot restore do not alias caller state',()=>{
 const e=createEngine({scheduler:'manual'});e.world.registerComponent('health',p=>Number.isFinite(p.value)&&p.value>=0);const id=e.world.createEntity();
 assert.throws(()=>e.world.addComponent(id,'health',{value:-1}),/invalid/);e.world.addComponent(id,'health',{value:3});const snap=e.world.snapshot();e.world.restore(snap);snap.entities[0].components.health.value=9;assert.equal(e.world.getComponent(id,'health').value,3);
});
test('restore preserves fixed-step remainder and rejects incompatible clock configurations',async()=>{
 const e=createEngine({scheduler:'manual'});await e.start();e.frame(0);e.frame(25);const saved=e.snapshot();e.frame(75);e.restore(saved);assert.deepEqual(e.snapshot(),saved);const other=createEngine({scheduler:'manual',clock:{fixedStep:1/30}});assert.throws(()=>other.restore(saved),/fixed step/);await e.dispose();await other.dispose();
});
