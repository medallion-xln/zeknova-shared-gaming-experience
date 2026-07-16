import {
  AnimationMixer,
  Box3,
  Group,
  Vector3,
} from './vendor/three.module.min.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { MeshoptDecoder } from './vendor/meshopt_decoder.module.js';
import { clone as cloneSkinnedModel } from './vendor/SkeletonUtils.js';

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

// GLTFLoader decoding and GPU texture preparation can spike memory when several
// rigged files arrive together. Keep one shared queue for every officer,
// companion, and enemy GLB handled by this runtime.
let modelAssetQueue = Promise.resolve();

function loadGlbOneAtATime(path) {
  const task = modelAssetQueue.then(() => loader.loadAsync(path));
  modelAssetQueue = task.then(() => undefined, () => undefined);
  return task;
}

function refreshSkinnedBounds(root) {
  const frame = root.userData.normalizationFrame;
  const savedScale = frame?.scale.clone();
  const savedPosition = frame?.position.clone();
  if (frame) {
    frame.scale.set(1, 1, 1);
    frame.position.set(0, 0, 0);
  }
  root.updateWorldMatrix(true, true);
  root.traverse((object) => {
    if (!object.isSkinnedMesh) return;
    object.skeleton?.update();
    object.boundingBox = null;
    object.computeBoundingBox();
    object.boundingSphere = null;
    object.computeBoundingSphere();
  });
  root.updateWorldMatrix(true, true);
  const rawBox = new Box3().setFromObject(root);
  if (frame) {
    frame.scale.copy(savedScale);
    frame.position.copy(savedPosition);
    root.updateWorldMatrix(true, true);
  }
  return rawBox;
}

function prepareModel(scene, targetHeight, name) {
  const root = new Group();
  root.name = name;
  const normalizationFrame = new Group();
  normalizationFrame.name = `${name}NormalizationFrame`;
  normalizationFrame.add(scene);
  root.add(normalizationFrame);
  root.userData.normalizationFrame = normalizationFrame;
  root.userData.targetHeight = targetHeight;

  scene.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    // Animated Meshy bounds are authored under nested rig transforms and are
    // not reliable for renderer frustum tests after normalization. A valid
    // character could therefore exist in the scene but never be drawn.
    object.frustumCulled = !object.isSkinnedMesh;
  });

  // Meshy rigs are authored in centimetres. Keep them safely hidden near their
  // expected scale until their skeleton can be measured after game attachment.
  normalizationFrame.scale.setScalar(0.01);
  return root;
}

function removeUnsafeScaleTracks(clip) {
  if (!clip) return null;
  const safeClip = clip.clone();
  // Meshy exports scale keys on every bone. Cross-file walk/run clips can use
  // different bind scales, which makes a skinned model explode to giant size.
  // Bone translation is also authored in each source file's coordinate system;
  // applying those keys to another imported bind pose moves the mesh off camera.
  // Rotation keys retain the walk/run motion without the destructive offsets.
  safeClip.tracks = safeClip.tracks.filter((track) => (
    !track.name.endsWith('.scale')
    && !track.name.endsWith('.position')
  ));
  return safeClip;
}

function calibrateAttachedModel(root, targetHeight) {
  const frame = root.userData.normalizationFrame;
  if (!frame) return false;
  const box = refreshSkinnedBounds(root);
  const size = box.getSize(new Vector3());
  if (!Number.isFinite(size.y) || size.y < 0.0001) return false;

  // The newer enemy exports carry a centimetre conversion inside the armature.
  // SkinnedMesh.computeBoundingBox() applies that 0.01 conversion a second time,
  // while the GPU skinning path does not. Correct the CPU-only discrepancy before
  // deriving the visible wrapper scale and origin.
  const boundUnitCorrection = size.y < 0.1 ? 100 : 1;
  const scale = targetHeight / (size.y * boundUnitCorrection);
  // The imported roster mixes metre-authored player rigs and centimetre-authored
  // enemy rigs. Reject only truly implausible results so a bad skeleton bound
  // cannot hide or explode a replacement model.
  if (!Number.isFinite(scale) || scale < 0.0005 || scale > 6) {
    root.userData.calibrated = false;
    return false;
  }
  const center = root.worldToLocal(box.getCenter(new Vector3()));
  const ground = root.worldToLocal(new Vector3(box.getCenter(new Vector3()).x, box.min.y, box.getCenter(new Vector3()).z));
  frame.scale.setScalar(scale);
  frame.position.set(
    -center.x * scale * boundUnitCorrection,
    -ground.y * scale * boundUnitCorrection,
    -center.z * scale * boundUnitCorrection,
  );
  root.updateWorldMatrix(true, true);
  const finalHeight = new Box3().setFromObject(root).getSize(new Vector3()).y * boundUnitCorrection;
  const calibrated = Number.isFinite(finalHeight)
    && finalHeight >= targetHeight * 0.72
    && finalHeight <= targetHeight * 1.28;
  root.userData.calibrated = calibrated;
  root.userData.boundUnitCorrection = boundUnitCorrection;
  if (!calibrated) {
    frame.scale.setScalar(0.01);
    frame.position.set(0, 0, 0);
    root.updateWorldMatrix(true, true);
  }
  return calibrated;
}

function measureModel(root) {
  refreshSkinnedBounds(root);
  const size = new Box3().setFromObject(root).getSize(new Vector3());
  size.multiplyScalar(Number(root.userData.boundUnitCorrection || 1));
  return {
    width: Number(size.x.toFixed(2)),
    height: Number(size.y.toFixed(2)),
    depth: Number(size.z.toFixed(2)),
  };
}

function disposeModel(root) {
  root.removeFromParent();
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry?.dispose?.();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material) continue;
      for (const value of Object.values(material)) value?.isTexture && value.dispose();
      material.dispose?.();
    }
  });
}

function createMotionController(scene, walkClip, runClip = null) {
  const mixer = new AnimationMixer(scene);
  const safeWalkClip = removeUnsafeScaleTracks(walkClip);
  const safeRunClip = removeUnsafeScaleTracks(runClip);
  const walkAction = safeWalkClip ? mixer.clipAction(safeWalkClip) : null;
  const runAction = safeRunClip ? mixer.clipAction(safeRunClip) : null;
  let activeMotion = 'idle';

  return {
    update(delta, moving, sprinting) {
      const nextMotion = moving ? (sprinting && runAction ? 'run' : 'walk') : 'idle';
      if (nextMotion !== activeMotion) {
        mixer.stopAllAction();
        const nextAction = nextMotion === 'run' ? runAction : walkAction;
        nextAction?.reset().play();
        activeMotion = nextMotion;
      }

      if (moving && walkAction && !runAction) {
        walkAction.setEffectiveTimeScale(sprinting ? 1.35 : 1);
      }
      moving && mixer.update(delta);
    },
    dispose() {
      mixer.stopAllAction();
    },
  };
}

export async function loadEnsignEngineerModel() {
  await MeshoptDecoder.ready;
  const engineerGltf = await loadGlbOneAtATime('./assets/models/ensign-engineer.glb');
  const runningEngineerGltf = await loadGlbOneAtATime('./assets/models/ensign-engineer-run.glb');

  const root = prepareModel(engineerGltf.scene, 3.35, 'ensignHighQualityModel');

  const motion = createMotionController(
    engineerGltf.scene,
    engineerGltf.animations[0],
    runningEngineerGltf.animations[0],
  );
  disposeModel(runningEngineerGltf.scene);

  return {
    root,
    calibrate() {
      return calibrateAttachedModel(root, 3.35);
    },
    update(delta, moving, sprinting) {
      motion.update(delta, moving, sprinting);
    },
    dispose() {
      motion.dispose();
      disposeModel(root);
    },
  };
}

export async function loadEnsignScoutModel() {
  await MeshoptDecoder.ready;
  const scoutGltf = await loadGlbOneAtATime('./assets/models/ensign-support-scout.glb');
  const root = prepareModel(scoutGltf.scene, 1.8, 'ensignScoutHighQualityModel');
  root.rotation.y = Math.PI;

  return {
    root,
    calibrate() {
      return calibrateAttachedModel(root, 1.8);
    },
    update() {},
    dispose() {
      disposeModel(root);
    },
  };
}

export async function loadEnsignModels() {
  const engineerModel = await loadEnsignEngineerModel();
  const scoutModel = await loadEnsignScoutModel();

  return {
    engineer: engineerModel.root,
    scout: scoutModel.root,
    calibrate() {
      const engineerReady = engineerModel.calibrate();
      const scoutReady = scoutModel.calibrate();
      return engineerReady && scoutReady;
    },
    update(delta, moving, sprinting) {
      engineerModel.update(delta, moving, sprinting);
    },
    dispose() {
      engineerModel.dispose();
      scoutModel.dispose();
    },
  };
}

export async function loadLieutenantModels() {
  const astronautModel = await loadLieutenantMarineModel();
  const mechModel = await loadLieutenantMechModel();

  return {
    astronaut: astronautModel.root,
    mech: mechModel.root,
    calibrate() {
      const astronautReady = astronautModel.calibrate();
      const mechReady = mechModel.calibrate();
      return astronautReady && mechReady;
    },
    update(delta, moving, sprinting) {
      astronautModel.update(delta, moving, sprinting);
      mechModel.update(delta, moving, sprinting);
    },
    dispose() {
      astronautModel.dispose();
      mechModel.dispose();
    },
  };
}

export async function loadCaptainModels() {
  const captainModel = await loadCaptainMarineModel();
  const mechModel = await loadCaptainMechModel();

  return {
    captain: captainModel.root,
    mech: mechModel.root,
    calibrate() {
      const captainReady = captainModel.calibrate();
      const mechReady = mechModel.calibrate();
      return captainReady && mechReady;
    },
    update(delta, moving, sprinting) {
      captainModel.update(delta, moving, sprinting);
      mechModel.update(delta, moving, sprinting);
    },
    dispose() {
      captainModel.dispose();
      mechModel.dispose();
    },
  };
}

async function loadAnimatedOfficerModel({ walkPath, runPath, targetHeight, name }) {
  await MeshoptDecoder.ready;
  const walkingGltf = await loadGlbOneAtATime(walkPath);
  const runningGltf = await loadGlbOneAtATime(runPath);
  const root = prepareModel(walkingGltf.scene, targetHeight, name);
  const motion = createMotionController(
    walkingGltf.scene,
    walkingGltf.animations[0],
    runningGltf.animations[0],
  );
  disposeModel(runningGltf.scene);

  return {
    root,
    calibrate() {
      return calibrateAttachedModel(root, targetHeight);
    },
    update(delta, moving, sprinting) {
      motion.update(delta, moving, sprinting);
    },
    dispose() {
      motion.dispose();
      disposeModel(root);
    },
  };
}

export function loadLieutenantMarineModel() {
  return loadAnimatedOfficerModel({
    walkPath: './assets/models/lieutenant-astronaut.glb',
    runPath: './assets/models/lieutenant-astronaut-run.glb',
    targetHeight: 3.35,
    name: 'lieutenantHighQualityModel',
  });
}

export function loadLieutenantMechModel() {
  return loadAnimatedOfficerModel({
    walkPath: './assets/models/lieutenant-mech-walk.glb',
    runPath: './assets/models/lieutenant-mech-run.glb',
    targetHeight: 4.45,
    name: 'lieutenantCompanionHighQualityModel',
  });
}

export function loadCaptainMarineModel() {
  return loadAnimatedOfficerModel({
    walkPath: './assets/models/captain-engineer-walk.glb',
    runPath: './assets/models/captain-engineer-run.glb',
    targetHeight: 3.35,
    name: 'captainHighQualityModel',
  });
}

export function loadCaptainMechModel() {
  return loadAnimatedOfficerModel({
    walkPath: './assets/models/captain-mech-walk.glb',
    runPath: './assets/models/captain-mech-run.glb',
    targetHeight: 4.75,
    name: 'captainMechHighQualityModel',
  });
}

function createEnemyMotionController(scene, walkClip, runClip = null) {
  const mixer = new AnimationMixer(scene);
  const safeWalkClip = removeUnsafeScaleTracks(walkClip);
  const safeRunClip = removeUnsafeScaleTracks(runClip);
  const walkAction = safeWalkClip ? mixer.clipAction(safeWalkClip) : null;
  const runAction = safeRunClip ? mixer.clipAction(safeRunClip) : null;
  let activeAction = null;

  return {
    update(delta, moving, charging) {
      const nextAction = charging && runAction ? runAction : walkAction;
      if (nextAction !== activeAction) {
        activeAction?.stop();
        nextAction?.reset().play();
        activeAction = nextAction;
      }
      if (!activeAction) return;
      activeAction.paused = !moving;
      if (moving) mixer.update(delta);
    },
    dispose() {
      mixer.stopAllAction();
    },
  };
}

export async function loadJuggernautModel() {
  await MeshoptDecoder.ready;
  const walkingGltf = await loadGlbOneAtATime('./assets/models/zeknovan-juggernaut-walk.glb');
  const runningGltf = await loadGlbOneAtATime('./assets/models/zeknovan-juggernaut-run.glb');

  const root = prepareModel(
    walkingGltf.scene,
    5.6,
    'zeknovanJuggernautHighQualityModel',
  );
  const motion = createEnemyMotionController(
    walkingGltf.scene,
    walkingGltf.animations[0],
    runningGltf.animations[0],
  );
  motion.update(0, true, false);
  motion.update(0, false, false);
  disposeModel(runningGltf.scene);

  return {
    root,
    calibrate() {
      return calibrateAttachedModel(root, 5.6);
    },
    update(delta, moving, charging) {
      motion.update(delta, moving, charging);
    },
    measure() {
      return measureModel(root);
    },
    dispose() {
      motion.dispose();
      disposeModel(root);
    },
  };
}

const ENEMY_MODEL_PROFILES = {
  stalker: {
    walk: './assets/models/zeknovan-stalker-walk.glb',
    run: './assets/models/zeknovan-stalker-run.glb',
    height: 3.35,
    name: 'zeknovanStalkerHighQualityModel',
  },
  saboteur: {
    walk: './assets/models/zeknovan-saboteur-walk.glb',
    run: './assets/models/zeknovan-saboteur-run.glb',
    height: 2.9,
    name: 'zeknovanSaboteurHighQualityModel',
  },
  spitter: {
    walk: './assets/models/zeknovan-spitter-walk.glb',
    run: './assets/models/zeknovan-spitter-run.glb',
    height: 3.45,
    name: 'zeknovanSpitterHighQualityModel',
  },
  skyray: {
    walk: './assets/models/zeknovan-skyray-walk.glb',
    run: './assets/models/zeknovan-skyray-run.glb',
    height: 3.25,
    name: 'zeknovanSkyrayHighQualityModel',
  },
};

const enemySourcePromises = new Map();

async function loadEnemySource(type) {
  if (!enemySourcePromises.has(type)) {
    const profile = ENEMY_MODEL_PROFILES[type];
    if (!profile) throw new Error(`Unknown high-quality enemy model: ${type}`);
    enemySourcePromises.set(type, (async () => {
      await MeshoptDecoder.ready;
      const walkingGltf = await loadGlbOneAtATime(profile.walk);
      const runningGltf = await loadGlbOneAtATime(profile.run);
      const runClip = runningGltf.animations[0]?.clone();
      disposeModel(runningGltf.scene);
      return { profile, walkingGltf, runClip };
    })());
  }
  return enemySourcePromises.get(type);
}

export async function loadEnemyModel(type) {
  const { profile, walkingGltf, runClip } = await loadEnemySource(type);
  const scene = cloneSkinnedModel(walkingGltf.scene);
  const ownedMaterials = new Set();

  scene.traverse((object) => {
    if (!object.isMesh) return;
    if (Array.isArray(object.material)) {
      object.material = object.material.map((material) => {
        const clone = material.clone();
        ownedMaterials.add(clone);
        return clone;
      });
    } else if (object.material) {
      object.material = object.material.clone();
      ownedMaterials.add(object.material);
    }
  });

  const root = prepareModel(scene, profile.height, profile.name);
  const motion = createEnemyMotionController(
    scene,
    walkingGltf.animations[0],
    runClip,
  );
  motion.update(0, true, false);
  motion.update(0, false, false);

  return {
    root,
    calibrate() {
      return calibrateAttachedModel(root, profile.height);
    },
    update(delta, moving, sprinting) {
      motion.update(delta, moving, sprinting);
    },
    setOpacity(opacity) {
      for (const material of ownedMaterials) {
        material.transparent = opacity < 0.99;
        material.opacity = opacity;
        material.depthWrite = opacity >= 0.62;
        material.needsUpdate = true;
      }
    },
    measure() {
      return measureModel(root);
    },
    dispose() {
      motion.dispose();
      root.removeFromParent();
      for (const material of ownedMaterials) material.dispose();
      ownedMaterials.clear();
    },
  };
}
