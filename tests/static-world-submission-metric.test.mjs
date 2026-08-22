import assert from 'node:assert/strict';
import {PerformanceFixtureMaterializer} from '../src/game/PerformanceFixtureMaterializer.js';

const makeMesh=(name,family)=>({isMesh:true,name,parent:null,userData:family?{environmentAsset:family}:{},geometry:{index:{count:6},attributes:{position:{count:4}}},material:{type:'MeshStandardMaterial'},onBeforeRender:null});
const flower=makeMesh('flower','redTrumpetFlower'),village=makeMesh('hut','villageHut'),actor=makeMesh('body');
const meshes=[flower,village,actor];
const info={render:{calls:99,triangles:99,points:0,lines:0},memory:{geometries:3,textures:1},reset(){}};
const game={scene:{traverse(callback){for(const mesh of meshes)callback(mesh)}},camera:{},renderer:{info,render(){for(const mesh of meshes)mesh.onBeforeRender?.(this,game.scene,game.camera,mesh.geometry,mesh.material,null)}}};
const capture={resetRendererCounters(){for(const key of['calls','triangles','points','lines'])info.render[key]=0},report(){return{renderer:{...info.render},scene:{},active:{},frame:{}}}};
const materializer=new PerformanceFixtureMaterializer({game,capture});
const measured=materializer.measureRepresentativeDraws();
assert.equal(measured.draws,3,'actual onBeforeRender submissions, not the embedded counter, own the representative metric');
assert.equal(measured.groups.redTrumpetFlower.draws,1);
assert.equal(measured.groups.villageHut.draws,1);
assert.equal(measured.groups['scene/body'].draws,1);
assert.equal(meshes.every(mesh=>mesh.onBeforeRender===null),true,'temporary QA hooks are always restored');
console.log('ZEK-19 representative submission metric: PASS (canonical renderer hooks, family attribution, hook cleanup)');
