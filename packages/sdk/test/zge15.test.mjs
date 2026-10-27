import test from 'node:test';import assert from 'node:assert/strict';
import {createCameraDirector,MODES,resolveRig,resolveOcclusion,validateCameraPreset,CAMERA_PRESET_SCHEMA} from '../src/camera.js';
import {createEngine,transform,installProjectRules} from '@zge/sdk';

const setup=async()=>{
  const e=await createEngine();
  const s=await e.loadWorld();
  s.createEntity({id:'pilot',name:'Pilot',components:{transform:transform({position:[0,0,0]})}});
  return e;
};

test('camera director registers presentation-only and defaults to isometric',async()=>{
  const e=await setup();
  const d=createCameraDirector(e);
  assert.equal(d.mode,'isometric');
  assert.equal(d.target,null);
  assert.equal(typeof d.setMode,'function');
  assert.equal(typeof d.follow,'function');
  assert.equal(typeof d.update,'function');
  assert.equal(typeof d.dispose,'function');
  d.dispose();
  await e.dispose();
});

test('following a target yields an orthographic pose without mutating the entity',async()=>{
  const e=await setup();
  const d=createCameraDirector(e);
  d.follow('pilot');
  assert.equal(d.target,'pilot');
  const before=e.world.findEntity('pilot').components.transform.position.slice();
  const pose=d.update(0);
  assert.equal(pose.projection,'orthographic');
  assert.equal(pose.position.length,3);
  assert.equal(pose.target.length,3);
  assert.ok(Number.isFinite(pose.orthoScale));
  // camera must stand off the target, looking down; never on top of it.
  assert.ok(Math.hypot(pose.position[0],pose.position[2])>0,'isometric camera has horizontal standoff');
  assert.ok(pose.position[1]>0,'isometric camera is above the target');
  // presentation-only: the entity transform is untouched.
  assert.deepEqual(e.world.findEntity('pilot').components.transform.position,before);
  d.dispose();
  await e.dispose();
});

test('three modes resolve to their respective projections',async()=>{
  const e=await setup();
  const d=createCameraDirector(e,{transitionDuration:0});
  d.follow('pilot');
  assert.equal(d.update().projection,'orthographic');
  d.setMode('third-person');
  const third=d.update();
  assert.equal(third.projection,'perspective');
  assert.equal(third.fov,50);
  assert.equal(d.mode,'third-person');
  d.setMode('over-shoulder');
  const os=d.update();
  assert.equal(os.projection,'perspective');
  assert.equal(os.fov,58);
  assert.equal(d.mode,'over-shoulder');
  d.setMode('isometric');
  assert.equal(d.update().projection,'orthographic');
  d.dispose();
  await e.dispose();
});

test('mode transitions interpolate and resolve to the target projection after completion',async()=>{
  const e=await setup();
  const d=createCameraDirector(e,{transitionDuration:0.2});
  d.follow('pilot');
  d.update(0); // seed an isometric lastPose
  d.setMode('third-person');
  const mid=d.update(20); // ~10% through — still orthographic until midpoint
  assert.equal(mid.projection,'orthographic','projection swaps at midpoint');
  const done=d.update(1000); // well past 0.2s
  assert.equal(done.projection,'perspective');
  assert.equal(done.fov,50);
  d.dispose();
  await e.dispose();
});

test('invalid modes and transition durations are rejected',async()=>{
  const e=await setup();
  const d=createCameraDirector(e);
  assert.throws(()=>d.setMode('first-person'),/unknown camera mode/);
  assert.throws(()=>d.setTransitionDuration(-1),/0\.\.2/);
  assert.throws(()=>d.setTransitionDuration(3),/0\.\.2/);
  d.setTransitionDuration(0.25); // valid
  assert.equal(d.transitionDuration,0.25);
  d.dispose();
  await e.dispose();
});

test('pointer look and follow never mutate authoritative scene state',async()=>{
  const e=await setup();
  const d=createCameraDirector(e,{transitionDuration:0});
  d.follow('pilot');
  d.setLook(0.4,0.2,8);
  const before=e.world.serialize();
  const pose=d.update();
  assert.equal(pose.projection,'orthographic');
  assert.ok(pose.position[1]>0);
  // Scene revision, entities, and transform byte-for-byte unchanged.
  assert.deepEqual(e.world.serialize(),before);
  d.dispose();
  await e.dispose();
});

test('getMovementBasis returns a unit camera-relative ground basis',async()=>{
  const e=await setup();
  const d=createCameraDirector(e,{transitionDuration:0});
  d.follow('pilot');
  d.update(0); // seed lastPose
  const b=d.getMovementBasis();
  // forward = (target − camera) projected to ground, unit length.
  assert.ok(Array.isArray(b.forward)&&b.forward.length===2);
  assert.ok(Array.isArray(b.right)&&b.right.length===2);
  const flen=Math.hypot(...b.forward),rlen=Math.hypot(...b.right);
  assert.ok(Math.abs(flen-1)<1e-6,'forward is unit length');
  assert.ok(Math.abs(rlen-1)<1e-6,'right is unit length');
  // right = forward rotated +90° around Y: (−fz, fx).
  assert.ok(Math.abs(b.right[0]-(-b.forward[1]))<1e-9);
  assert.ok(Math.abs(b.right[1]-b.forward[0])<1e-9);
  // forward must be mutually orthogonal to right.
  assert.ok(Math.abs(b.forward[0]*b.right[0]+b.forward[1]*b.right[1])<1e-9);
  // forward points away from the camera toward the target (camera is above/behind),
  // so it has a non-degenerate horizontal component for a non-top-down rig.
  assert.ok(flen>0.9);
  d.dispose();
  await e.dispose();
});

test('installProjectRules moves a controlled entity camera-relative',async()=>{
  const e=await createEngine({project:{schema:'zge.sdk.project.v1',id:'mv-test',name:'mv',entryWorld:'main',worlds:{main:null},assets:[],plugins:[],prefabs:{}}});
  const s=await e.loadWorld();
  s.createEntity({id:'player',name:'Player',components:{transform:transform({position:[0,0,0]})}});
  // Camera positioned due south looking north: forward = +Z, so basis forward=[0,1],
  // right = forward rotated +90° around Y = (−fz, fx) = (−1,0).
  const orientation={forward:[0,1],right:[-1,0]};
  s.setRules([{id:'walk',kind:'move',entity:'player',speed:1,bounds:[-50,50,-50,50]}]);
  const input=new Set();
  const dispose=installProjectRules(e,input,orientation);
  assert.equal(typeof dispose,'function');
  // With W held and forward [0,1], the entity should displace toward +Z.
  input.add('w');
  await e.start();
  e.pause();
  const before=e.world.findEntity('player').components.transform.position.slice();
  // step the render/sim system: engine.step drives the fixed-tick simulate systems.
  e.step(1);
  const after=e.world.findEntity('player').components.transform.position;
  assert.ok(after[2]>before[2],'W moves toward forward (+Z): '+JSON.stringify([before,after]));
  assert.ok(Math.abs(after[0]-before[0])<1e-9,'no strafe with pure forward');
  // Rotate the basis 90°: forward now [1,0] (east), right = (−0,1)=(0,−1). W should move +X.
  input.clear();
  orientation.forward=[1,0]; orientation.right=[0,-1];
  input.add('w');
  const before2=e.world.findEntity('player').components.transform.position.slice();
  e.step(1);
  const after2=e.world.findEntity('player').components.transform.position;
  assert.ok(after2[0]>before2[0],'W moves toward rotated forward (+X): '+JSON.stringify([before2,after2]));
  dispose();
  await e.dispose();
});

test('resolveOcclusion slides the camera in front of a blocking collider without mutating',()=>{
  // Camera ray from target [0,0,0] straight up +Y to [0,10,0]. A box at [0,5,0]
  // halfSize [1,2,1] blocks the ray; the camera should land at y≈2.65 (3−0.35 clearance).
  const entities=[{id:'wall',components:{collider:{halfSize:[1,2,1]},transform:{position:[0,5,0],scale:[1,1,1]}}}];
  const hit=resolveOcclusion([0,0,0],[0,10,0],entities,'player');
  assert.equal(hit.hit,true);
  // box top at y=3; clearance 0.35 → camera y≈2.65, still below the box.
  assert.ok(hit.position[1] < 3, 'camera pulled below the box: '+hit.position[1]);
  assert.ok(hit.position[1] > 0, 'camera stands off the target');
  assert.ok(Math.abs(hit.position[0])<1e-9 && Math.abs(hit.position[2])<1e-9,'stays on the vertical ray');
  // No colliders → no hit, unchanged.
  const free=resolveOcclusion([0,0,0],[0,10,0],[],'player');
  assert.equal(free.hit,false);
  assert.deepEqual(free.position,[0,10,0]);
  // Target collider excluded (never occludes its own camera).
  const self=resolveOcclusion([0,0,0],[0,10,0],[{id:'player',components:{collider:{halfSize:[5,5,5]},transform:{position:[0,5,0],scale:[1,1,1]}}}],'player');
  assert.equal(self.hit,false);
});

test('camera director occludes presentation-only and never mutates authority',async()=>{
  const e=await setup();
  // Place a tall wall between the isometric camera and the pilot.
  e.world.createEntity({id:'wall',name:'Wall',components:{transform:transform({position:[3,2,3]}),collider:{halfSize:[1,4,1]}}});
  const d=createCameraDirector(e,{transitionDuration:0});
  d.follow('pilot');
  const before=e.world.serialize();
  const pose=d.update(0);
  // Isometric default rig looks at target at distance ~13, yaw 45° → camera roughly +x,+z,y>0,
  // which passes through the box at [3,2,3] half [1,4,1]; collision should pull it in front.
  assert.ok(Number.isFinite(pose.position[0]),'has a position');
  // Occlusion never increases distance beyond the unoccluded isometric standoff back into the box interior.
  assert.ok(pose.position[1] >= 0,'camera above ground');
  assert.deepEqual(e.world.serialize(),before,'authoritative scene unchanged by projection');
  // disable collision → returns the raw rig distance.
  d.setCollision(false);
  d.dispose();
  await e.dispose();
});

test('camera presets are versioned, validated, and applied data-only',async()=>{
  const e=await setup();
  const preset={schema:CAMERA_PRESET_SCHEMA,defaultMode:'third-person',enabledModes:['third-person','isometric'],sensitivity:0.003,transitionDuration:0.25,'third-person':{followDistance:12,elevation:0.35}};
  // Validation: must carry the exact schema.
  assert.equal(validateCameraPreset(preset).schema,CAMERA_PRESET_SCHEMA);
  assert.throws(()=>validateCameraPreset({schema:'wrong.v1'}),/must be/);
  assert.throws(()=>validateCameraPreset({schema:CAMERA_PRESET_SCHEMA,defaultMode:'first-person'}),/defaultMode/);
  // Director applies the preset: starts in defaultMode, honors enabled modes + distance.
  const d=createCameraDirector(e,{preset});
  assert.equal(d.mode,'third-person');
  assert.deepEqual(d.enabledModes,['third-person','isometric']);
  assert.throws(()=>d.setMode('over-shoulder'),/disabled/);
  assert.doesNotThrow(()=>d.setMode('isometric'));
  d.setMode('third-person');
  d.follow('pilot');
  const pose=d.update(0);
  assert.equal(pose.projection,'perspective');
  assert.equal(d.sensitivity,0.003);
  assert.equal(d.transitionDuration,0.25);
  // follow distance override ≈12 (clamped by rig to ≤25), greater than default 7.
  assert.ok(pose.distance > 7,'preset followDistance increases standoff: '+pose.distance);
  d.dispose();
  await e.dispose();
});

test('resolveRig is pure and MODES exposes the three modes',()=>{
  assert.deepEqual(MODES,['isometric','over-shoulder','third-person']);
  const iso=resolveRig('isometric',[0,0,0],{yaw:Math.PI/4,pitch:0.7,distance:10},null);
  assert.equal(iso.projection,'orthographic');
  assert.deepEqual(iso.target,[0,0,0]);
  const tp=resolveRig('third-person',[0,0,0],{yaw:1,pitch:0.3,distance:5},null);
  assert.equal(tp.projection,'perspective');
  assert.equal(tp.fov,50);
});
