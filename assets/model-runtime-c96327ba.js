import {
  AnimationMixer,
  Box3,
  Color,
  Group,
  LoopOnce,
  Vector3,
} from './vendor/three.module.min.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { KTX2Loader } from './vendor/KTX2Loader.bundle.js';
import { MeshoptDecoder } from './vendor/meshopt_decoder.module.js';
import { clone as cloneSkinnedModel } from './vendor/SkeletonUtils.js';
import { currentModelQuality, originalModelPath, resolveModelLodPath } from './model-lod-manifest.js';

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const ktx2Loader = new KTX2Loader().setTranscoderPath('./assets/vendor/basis/');
let ktx2Configured = false;

// GLTFLoader decoding and GPU texture preparation can spike memory when several
// rigged files arrive together. Keep one shared queue for every officer,
// companion, and enemy GLB handled by this runtime.
let modelAssetQueue = Promise.resolve();

function configureKtx2Loader() {
  const renderer = globalThis.ZekNovaGame?.renderer;
  if (!renderer || ktx2Configured) return;
  ktx2Loader.detectSupport(renderer);
  loader.setKTX2Loader(ktx2Loader);
  ktx2Configured = true;
}

function loadGlbOneAtATime(path) {
  configureKtx2Loader();
  const selectedPath = resolveModelLodPath(path);
  const sourcePath = originalModelPath(path);
  const task = modelAssetQueue.then(async () => {
    try {
      return await loader.loadAsync(selectedPath);
    } catch (error) {
      if (selectedPath === sourcePath) throw error;
      console.warn(`ZekNova LOD ${selectedPath} was unavailable; loading its source model.`, error);
      return loader.loadAsync(sourcePath);
    }
  });
  modelAssetQueue = task.then(() => undefined, () => undefined);
  return task;
}

const shadowWorldPosition = new Vector3();

function createShadowBudget(root, important = false) {
  const meshes = [];
  root.traverse((object) => {
    if (!object.isMesh) return;
    meshes.push(object);
    object.castShadow = false;
  });
  let elapsed = Number.POSITIVE_INFINITY;
  let active = false;
  return {
    update(delta = 0) {
      elapsed += Math.max(0, Number(delta) || 0);
      if (elapsed < 0.4) return;
      elapsed = 0;
      const camera = globalThis.ZekNovaGame?.camera;
      const tier = currentModelQuality();
      const distanceLimit = tier === 'high'
        ? (important ? 52 : 38)
        : tier === 'low'
          ? (important ? 18 : 10)
          : (important ? 36 : 24);
      root.getWorldPosition(shadowWorldPosition);
      const nextActive = Boolean(camera && root.visible && shadowWorldPosition.distanceTo(camera.position) <= distanceLimit);
      if (nextActive === active) return;
      active = nextActive;
      for (const mesh of meshes) mesh.castShadow = active;
    },
    dispose() {
      for (const mesh of meshes) mesh.castShadow = false;
      meshes.length = 0;
    },
  };
}

function updateModelShadows(root, delta) {
  root.userData.shadowBudget?.update(delta);
}

function rebuildModelShadowBudget(root, important = false) {
  root.userData.shadowBudget?.dispose?.();
  root.userData.shadowBudget = createShadowBudget(root, important);
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
    object.castShadow = false;
    object.receiveShadow = true;
    // Animated Meshy bounds are authored under nested rig transforms and are
    // not reliable for renderer frustum tests after normalization. A valid
    // character could therefore exist in the scene but never be drawn.
    object.frustumCulled = !object.isSkinnedMesh;
  });

  // Meshy rigs are authored in centimetres. Keep them safely hidden near their
  // expected scale until their skeleton can be measured after game attachment.
  normalizationFrame.scale.setScalar(0.01);
  root.userData.shadowBudget = createShadowBudget(root, /boss|sunscar/i.test(name));
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
  // Renormalize rotation keys. The separate `.anim.glb` clips are meshopt-quantized,
  // which stores quaternions as 16-bit integers; decoding them yields values that are
  // no longer unit length. A quaternion of length L scales the bone it drives by L^2,
  // and that compounds down the chain - measured on the Captain mech, 20 of 24 bones
  // decoded with |q| up to 1.51 and the rig inflated ~10x on sprint. Rotation tracks
  // are deliberately kept by the filter above, so this is the one place the corruption
  // survives. Normalizing here fixes every rig that loads a quantized clip.
  for (const track of safeClip.tracks) {
    if (!track.name.endsWith('.quaternion')) continue;
    const values = track.values;
    for (let i = 0; i + 3 < values.length; i += 4) {
      const x = values[i], y = values[i + 1], z = values[i + 2], w = values[i + 3];
      const length = Math.sqrt(x * x + y * y + z * z + w * w);
      if (!Number.isFinite(length) || length < 1e-6) {
        values[i] = 0; values[i + 1] = 0; values[i + 2] = 0; values[i + 3] = 1;
        continue;
      }
      values[i] = x / length;
      values[i + 1] = y / length;
      values[i + 2] = z / length;
      values[i + 3] = w / length;
    }
  }
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
  // Unit correction is a property of the SOURCE FILE (metre- vs centimetre-authored),
  // not of the current pose - but it was being re-derived from live skinned bounds on
  // every calibrate() call via a `size.y < 0.1` threshold. Swapping walk -> run on
  // sprint moves those bounds, and when size.y straddles 0.1 the correction flips
  // between 1 and 100, rescaling the rig by 100x. Decide it once from the first
  // measurement and reuse it for the lifetime of the model, so later calibrations can
  // still refine the scale but can never change units underneath it.
  // Only trust a stored correction once a calibration has actually validated with it;
  // an early measurement (model not yet fully posed) can be wrong, and pinning that
  // would freeze the fault rather than fix it.
  const pinnedCorrection = root.userData.calibrated === true
    ? root.userData.boundUnitCorrection
    : null;
  const boundUnitCorrection = (pinnedCorrection === 1 || pinnedCorrection === 100)
    ? pinnedCorrection
    : (size.y < 0.1 ? 100 : 1);
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
  root.userData.shadowBudget?.dispose?.();
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

function attachWeaponModel(characterScene, weaponScene, {
  id,
  length,
  position = [0.08, 0.02, 0],
  rotation = [0, 0, 0],
  gripOffset = [0, 0, 0],
}) {
  const hand = characterScene.getObjectByName('RightHand');
  if (!hand) {
    disposeModel(weaponScene);
    return null;
  }
  const mount = new Group();
  mount.name = `weapon-${id}`;
  const box = new Box3().setFromObject(weaponScene);
  const size = box.getSize(new Vector3());
  const longest = Math.max(size.x, size.y, size.z, 0.0001);
  const weaponScale = length / longest;
  // The imported weapon origin is its geometric center, not its handle. Scale
  // the centering correction into hand space, then offset the body so the
  // RightHand socket lands on the rear grip/trigger instead of mid-barrel.
  weaponScene.position.copy(box.getCenter(new Vector3())).multiplyScalar(-weaponScale);
  weaponScene.position.add(new Vector3().fromArray(gripOffset));
  weaponScene.scale.setScalar(weaponScale);
  weaponScene.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = false;
    object.receiveShadow = false;
    object.frustumCulled = false;
  });
  mount.position.fromArray(position);
  mount.rotation.set(...rotation);
  mount.add(weaponScene);
  hand.add(mount);
  return mount;
}

const OFFICER_WEAPON_PATHS = {
  voidsting: './assets/models/weapon-voidsting.glb',
  singularity: './assets/models/weapon-singularity.glb',
  thunderclaw: './assets/models/weapon-thunderclaw.glb',
};

// Meshy officer rigs share the same named biped skeleton, but their armor and
// hand proportions are different. Keep every socket adjustment rank-local so
// grip tuning never changes another officer's pose.
const OFFICER_WEAPON_RIGS = {
  ensign: {
    voidsting: { length: 54, position: [2, 0, 0], rotation: [Math.PI, 0, 0], gripOffset: [8, -7, 0] },
    singularity: { length: 100, position: [2, -1, 0], rotation: [Math.PI, 0, 0], gripOffset: [20, -5, 0] },
    thunderclaw: { length: 115, position: [1, -2, 0], rotation: [Math.PI, 0, 0], gripOffset: [26, -7, 0] },
  },
  lieutenant: {
    voidsting: { length: 50, position: [1.4, 0.5, -0.5], rotation: [Math.PI, 0.02, -0.04], gripOffset: [7, -5.5, 0] },
    singularity: { length: 92, position: [1.2, -0.2, -0.6], rotation: [Math.PI, 0.02, -0.03], gripOffset: [17.5, -4.2, 0] },
    thunderclaw: { length: 104, position: [0.4, -1.1, -0.8], rotation: [Math.PI, 0.03, -0.05], gripOffset: [22.5, -5.8, 0] },
  },
  captain: {
    voidsting: { length: 58, position: [2.6, -0.1, 0.5], rotation: [Math.PI, -0.02, 0.035], gripOffset: [9, -7.2, 0] },
    singularity: { length: 106, position: [2.2, -1.2, 0.4], rotation: [Math.PI, -0.025, 0.025], gripOffset: [21.5, -5.4, 0] },
    thunderclaw: { length: 122, position: [1.3, -2.2, 0.2], rotation: [Math.PI, -0.03, 0.035], gripOffset: [28, -7.3, 0] },
  },
};

async function loadOfficerWeaponModels(characterScene, rank) {
  const profile = OFFICER_WEAPON_RIGS[rank];
  if (!profile) return {};
  const weapons = {};
  for (const [id, path] of Object.entries(OFFICER_WEAPON_PATHS)) {
    const gltf = await loadGlbOneAtATime(path);
    weapons[id] = attachWeaponModel(characterScene, gltf.scene, { id, ...profile[id] });
  }
  return weapons;
}

function weaponRigDiagnostics(characterScene, weapons, rank, motion) {
  const requiredBones = ['RightArm', 'RightForeArm', 'RightHand', 'LeftArm', 'LeftForeArm', 'LeftHand'];
  characterScene.updateWorldMatrix(true, true);
  const bones = Object.fromEntries(requiredBones.map((name) => [name, Boolean(characterScene.getObjectByName(name))]));
  const segmentLength = (from, to) => {
    const start = characterScene.getObjectByName(from);
    const end = characterScene.getObjectByName(to);
    if (!start || !end) return null;
    const length = start.getWorldPosition(new Vector3()).distanceTo(end.getWorldPosition(new Vector3()));
    return Number.isFinite(length) ? Number(length.toFixed(3)) : null;
  };
  const armSegments = {
    rightShoulderToWrist: segmentLength('RightArm', 'RightHand'),
    rightForearm: segmentLength('RightForeArm', 'RightHand'),
    leftShoulderToWrist: segmentLength('LeftArm', 'LeftHand'),
    leftForearm: segmentLength('LeftForeArm', 'LeftHand'),
  };
  const finiteSegments = Object.values(armSegments).filter(Number.isFinite);
  return {
    rank,
    ready: Object.values(bones).every(Boolean)
      && Object.values(weapons).filter(Boolean).length === Object.keys(OFFICER_WEAPON_PATHS).length
      && finiteSegments.length === 4
      && finiteSegments.every((length) => length > 0),
    bones,
    armSegments,
    weaponMounts: Object.fromEntries(Object.entries(weapons).map(([id, mount]) => [id, Boolean(mount)])),
    animations: {
      rifleBrace: motion.hasAction('carryHeavyWeapon'),
      carryHeavyWeapon: motion.hasAction('carryHeavyWeapon'),
    },
  };
}

function createWeaponRecoilController(characterScene, weapons) {
  const rightArm = characterScene.getObjectByName('RightArm');
  const leftArm = characterScene.getObjectByName('LeftArm');
  const spine = characterScene.getObjectByName('Spine2')
    || characterScene.getObjectByName('Spine1')
    || characterScene.getObjectByName('Spine');
  const mountPositions = new Map(Object.entries(weapons).flatMap(([id, mount]) => (
    mount ? [[id, mount.position.clone()]] : []
  )));
  let activeWeapon = null;
  let recoil = 0;
  let appliedRightArm = 0;
  let appliedLeftArm = 0;
  let appliedSpine = 0;

  function removeAppliedBoneOffsets() {
    if (rightArm) rightArm.rotation.x -= appliedRightArm;
    if (leftArm) leftArm.rotation.x -= appliedLeftArm;
    if (spine) spine.rotation.x -= appliedSpine;
    appliedRightArm = 0;
    appliedLeftArm = 0;
    appliedSpine = 0;
  }

  return {
    beginFrame() {
      removeAppliedBoneOffsets();
      for (const [id, mount] of Object.entries(weapons)) {
        const basePosition = mountPositions.get(id);
        if (mount && basePosition) mount.position.copy(basePosition);
      }
    },
    update(delta, equippedWeapon) {
      recoil *= Math.exp(-Math.max(0, delta) * 18);
      const id = activeWeapon || equippedWeapon;
      const mount = weapons[id];
      const basePosition = mountPositions.get(id);
      if (!mount || !basePosition || recoil < 0.002) return;

      // Weapon models are authored lengthwise on local X. A small displacement
      // along that axis gives every burst round a visible kick without moving
      // the character root or disturbing the planted lower-body pose.
      mount.position.copy(basePosition);
      mount.position.x -= recoil * 1.45;
      appliedRightArm = recoil * 0.018;
      appliedLeftArm = recoil * 0.013;
      appliedSpine = recoil * 0.006;
      if (rightArm) rightArm.rotation.x += appliedRightArm;
      if (leftArm) leftArm.rotation.x += appliedLeftArm;
      if (spine) spine.rotation.x += appliedSpine;
    },
    pulse(id, strength = 0.72) {
      if (!weapons[id]) return false;
      activeWeapon = id;
      recoil = Math.max(recoil, Math.min(1, Math.max(0.1, Number(strength) || 0.72)));
      return true;
    },
    dispose() {
      removeAppliedBoneOffsets();
      for (const [id, mount] of Object.entries(weapons)) {
        const basePosition = mountPositions.get(id);
        if (mount && basePosition) mount.position.copy(basePosition);
      }
    },
  };
}

function createMotionController(scene, walkClip, runClip = null, combatClips = {}) {
  const mixer = new AnimationMixer(scene);
  const safeWalkClip = removeUnsafeScaleTracks(walkClip);
  const safeRunClip = removeUnsafeScaleTracks(runClip);
  const walkAction = safeWalkClip ? mixer.clipAction(safeWalkClip) : null;
  const runAction = safeRunClip ? mixer.clipAction(safeRunClip) : null;
  const combatActions = Object.fromEntries(Object.entries(combatClips).flatMap(([name, clip]) => {
    const safeClip = removeUnsafeScaleTracks(clip);
    return safeClip ? [[name, mixer.clipAction(safeClip)]] : [];
  }));
  let activeMotion = 'idle';
  let lockedAction = null;
  let lockedUntil = 0;
  let idleCombatName = null;

  function applyIdleCombatPose() {
    const action = combatActions[idleCombatName];
    if (!action) return false;
    action.reset();
    action.enabled = true;
    action.setEffectiveWeight(1);
    action.setEffectiveTimeScale(1);
    action.play();
    action.time = action.getClip().duration * (idleCombatName === 'carryHeavyWeapon' ? 0.18 : 0.5);
    action.paused = true;
    mixer.update(0);
    return true;
  }

  function clearAction() {
    lockedAction?.stop();
    lockedAction = null;
    lockedUntil = 0;
    activeMotion = '';
  }

  return {
    update(delta, moving, sprinting) {
      if (lockedAction) {
        mixer.update(delta);
        if (performance.now() < lockedUntil) return;
        clearAction();
      }
      const nextMotion = moving ? (sprinting && runAction ? 'run' : 'walk') : 'idle';
      if (nextMotion !== activeMotion) {
        mixer.stopAllAction();
        const nextAction = nextMotion === 'run' ? runAction : walkAction;
        if (nextMotion === 'idle') applyIdleCombatPose();
        else nextAction?.reset().play();
        activeMotion = nextMotion;
      }

      if (moving && walkAction && !runAction) {
        walkAction.setEffectiveTimeScale(sprinting ? 1.35 : 1);
      }
      moving && mixer.update(delta);
    },
    play(name, { timeScale = 1, hold = false } = {}) {
      const action = combatActions[name];
      if (!action) return 0;
      mixer.stopAllAction();
      action.reset();
      action.enabled = true;
      action.clampWhenFinished = hold;
      action.setLoop(LoopOnce, 1);
      action.setEffectiveTimeScale(timeScale);
      action.play();
      lockedAction = action;
      const duration = Math.max(0.2, action.getClip().duration / Math.max(0.1, timeScale));
      lockedUntil = hold ? Number.POSITIVE_INFINITY : performance.now() + duration * 1000;
      activeMotion = `combat:${name}`;
      return duration;
    },
    holdPose(name, { normalizedTime = 0.18, duration = 1 } = {}) {
      const action = combatActions[name];
      if (!action) return 0;
      mixer.stopAllAction();
      action.reset();
      action.enabled = true;
      action.setEffectiveWeight(1);
      action.setEffectiveTimeScale(1);
      action.setLoop(LoopOnce, 1);
      action.play();
      action.time = action.getClip().duration * Math.min(0.98, Math.max(0.02, normalizedTime));
      action.paused = true;
      mixer.update(0);
      lockedAction = action;
      lockedUntil = performance.now() + Math.max(0.2, duration) * 1000;
      activeMotion = `pose:${name}`;
      return Math.max(0.2, duration);
    },
    clearAction,
    hasAction(name) {
      return Boolean(combatActions[name]);
    },
    setIdleCombat(name) {
      idleCombatName = combatActions[name] ? name : null;
      activeMotion = '';
    },
    dispose() {
      mixer.stopAllAction();
    },
  };
}

export async function loadEnsignEngineerModel() {
  await MeshoptDecoder.ready;
  const engineerGltf = await loadGlbOneAtATime('./assets/models/ensign-engineer.glb');
  const runningEngineerGltf = await loadGlbOneAtATime('./assets/models/ensign-engineer-run-v2.anim.glb');
  const rollGltf = await loadGlbOneAtATime('./assets/models/ensign-engineer-roll-fire.anim.glb');
  const deathGltf = await loadGlbOneAtATime('./assets/models/ensign-engineer-death.anim.glb');
  const heavyGltf = await loadGlbOneAtATime('./assets/models/ensign-engineer-heavy-minigun.anim.glb');
  const root = prepareModel(engineerGltf.scene, 3.35, 'ensignHighQualityModel');

  const motion = createMotionController(
    engineerGltf.scene,
    engineerGltf.animations[0],
    runningEngineerGltf.animations[0],
    {
      rollFire: rollGltf.animations[0],
      death: deathGltf.animations[0],
      carryHeavyWeapon: heavyGltf.animations[0],
    },
  );
  disposeModel(runningEngineerGltf.scene);
  disposeModel(rollGltf.scene);
  disposeModel(deathGltf.scene);
  disposeModel(heavyGltf.scene);

  const weapons = await loadOfficerWeaponModels(engineerGltf.scene, 'ensign');
  rebuildModelShadowBudget(root);
  const weaponRecoil = createWeaponRecoilController(engineerGltf.scene, weapons);
  const diagnostics = weaponRigDiagnostics(engineerGltf.scene, weapons, 'ensign', motion);
  let nextRigValidationAt = 0;
  let equippedWeapon = 'voidsting';
  for (const [id, mount] of Object.entries(weapons)) if (mount) mount.visible = id === equippedWeapon;
  motion.setIdleCombat(null);

  return {
    root,
    calibrate() {
      return calibrateAttachedModel(root, 3.35);
    },
    update(delta, moving, sprinting) {
      updateModelShadows(root, delta);
      weaponRecoil.beginFrame();
      motion.update(delta, moving, sprinting);
      weaponRecoil.update(delta, equippedWeapon);
      if (performance.now() >= nextRigValidationAt) {
        nextRigValidationAt = performance.now() + 1250;
        root.userData.weaponRigDiagnostics = weaponRigDiagnostics(engineerGltf.scene, weapons, 'ensign', motion);
        if (!root.userData.weaponRigDiagnostics.ready) motion.clearAction();
      }
    },
    play(name, options) {
      return motion.play(name, options);
    },
    holdPose(name, options) {
      return motion.holdPose(name, options);
    },
    recoilWeapon(id, strength) {
      return weaponRecoil.pulse(id, strength);
    },
    clearAction() {
      motion.clearAction();
    },
    equipWeapon(id) {
      if (!weapons[id]) return false;
      equippedWeapon = id;
      for (const [weaponId, mount] of Object.entries(weapons)) if (mount) mount.visible = weaponId === id;
      motion.setIdleCombat(id === 'thunderclaw' || id === 'singularity' ? 'carryHeavyWeapon' : null);
      return true;
    },
    validateWeaponRig() {
      return weaponRigDiagnostics(engineerGltf.scene, weapons, 'ensign', motion);
    },
    diagnostics,
    dispose() {
      weaponRecoil.dispose();
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
    update(delta) {
      updateModelShadows(root, delta);
    },
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
      scoutModel.update(delta);
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

async function loadAnimatedOfficerModel({ walkPath, runPath, targetHeight, name, weaponRig = null }) {
  await MeshoptDecoder.ready;
  const walkingGltf = await loadGlbOneAtATime(walkPath);
  const runningGltf = await loadGlbOneAtATime(runPath);
  const heavyGltf = weaponRig ? await loadGlbOneAtATime('./assets/models/ensign-engineer-heavy-minigun.anim.glb') : null;
  const root = prepareModel(walkingGltf.scene, targetHeight, name);
  const motion = createMotionController(
    walkingGltf.scene,
    walkingGltf.animations[0],
    runningGltf.animations[0],
    weaponRig ? {
      carryHeavyWeapon: heavyGltf?.animations?.[0],
    } : {},
  );
  disposeModel(runningGltf.scene);
  if (heavyGltf?.scene) disposeModel(heavyGltf.scene);
  const weapons = weaponRig ? await loadOfficerWeaponModels(walkingGltf.scene, weaponRig) : {};
  if (weaponRig) rebuildModelShadowBudget(root);
  const weaponRecoil = createWeaponRecoilController(walkingGltf.scene, weapons);
  let equippedWeapon = weaponRig ? 'voidsting' : null;
  for (const [id, mount] of Object.entries(weapons)) if (mount) mount.visible = id === equippedWeapon;
  const diagnostics = weaponRig ? weaponRigDiagnostics(walkingGltf.scene, weapons, weaponRig, motion) : null;
  let nextRigValidationAt = 0;
  if (diagnostics) console.info(`ZekNova ${weaponRig} weapon rig diagnostics`, diagnostics);

  return {
    root,
    calibrate() {
      return calibrateAttachedModel(root, targetHeight);
    },
    update(delta, moving, sprinting) {
      updateModelShadows(root, delta);
      weaponRecoil.beginFrame();
      motion.update(delta, moving, sprinting);
      weaponRecoil.update(delta, equippedWeapon);
      if (weaponRig && performance.now() >= nextRigValidationAt) {
        nextRigValidationAt = performance.now() + 1250;
        root.userData.weaponRigDiagnostics = weaponRigDiagnostics(walkingGltf.scene, weapons, weaponRig, motion);
        if (!root.userData.weaponRigDiagnostics.ready) motion.clearAction();
      }
    },
    play(name, options) {
      return motion.play(name, options);
    },
    holdPose(name, options) {
      return motion.holdPose(name, options);
    },
    recoilWeapon(id, strength) {
      return weaponRecoil.pulse(id, strength);
    },
    clearAction() {
      motion.clearAction();
    },
    equipWeapon(id) {
      if (!weaponRig || !weapons[id]) return false;
      equippedWeapon = id;
      for (const [weaponId, mount] of Object.entries(weapons)) if (mount) mount.visible = weaponId === id;
      motion.setIdleCombat(id === 'thunderclaw' || id === 'singularity' ? 'carryHeavyWeapon' : null);
      return true;
    },
    validateWeaponRig() {
      return weaponRig ? weaponRigDiagnostics(walkingGltf.scene, weapons, weaponRig, motion) : null;
    },
    diagnostics,
    dispose() {
      weaponRecoil.dispose();
      motion.dispose();
      disposeModel(root);
    },
  };
}

export function loadLieutenantMarineModel() {
  return loadAnimatedOfficerModel({
    walkPath: './assets/models/lieutenant-astronaut.glb',
    runPath: './assets/models/lieutenant-astronaut-run.anim.glb',
    targetHeight: 3.35,
    name: 'lieutenantHighQualityModel',
    weaponRig: 'lieutenant',
  });
}

export function loadLieutenantMechModel() {
  return loadAnimatedOfficerModel({
    walkPath: './assets/models/lieutenant-mech-walk.glb',
    runPath: './assets/models/lieutenant-mech-run.anim.glb',
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
    weaponRig: 'captain',
  });
}

export function loadCaptainMechModel() {
  return loadAnimatedOfficerModel({
    walkPath: './assets/models/captain-mech-walk.glb',
    runPath: './assets/models/captain-mech-run.anim.glb',
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
        // Enemy roles can change direction and sprint state several times in a
        // second while steering around terrain. Stopping and resetting the
        // mixer on every change made the rig visibly snap back to frame zero.
        activeAction?.fadeOut(0.16);
        nextAction?.reset().setEffectiveWeight(1).fadeIn(0.16).play();
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
  const runningGltf = await loadGlbOneAtATime('./assets/models/zeknovan-juggernaut-run.anim.glb');

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
      updateModelShadows(root, delta);
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
    run: './assets/models/zeknovan-stalker-run.anim.glb',
    height: 3.35,
    name: 'zeknovanStalkerHighQualityModel',
  },
  saboteur: {
    walk: './assets/models/zeknovan-saboteur-walk.glb',
    run: './assets/models/zeknovan-saboteur-run.anim.glb',
    height: 2.9,
    name: 'zeknovanSaboteurHighQualityModel',
  },
  spitter: {
    walk: './assets/models/zeknovan-spitter-walk.glb',
    run: './assets/models/zeknovan-spitter-run.anim.glb',
    height: 3.45,
    name: 'zeknovanSpitterHighQualityModel',
  },
  skyray: {
    walk: './assets/models/zeknovan-skyray-walk.glb',
    run: './assets/models/zeknovan-skyray-run.anim.glb',
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
      updateModelShadows(root, delta);
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
    setCivilianPalette(color, strength = 0.22) {
      const tint = new Color(color);
      for (const material of ownedMaterials) {
        if (!material.color) continue;
        material.color.lerp(tint, Math.max(0, Math.min(0.45, strength)));
        if (material.emissive) material.emissive.lerp(tint, 0.08);
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

export async function loadWhiteScreecherBossModel() {
  await MeshoptDecoder.ready;
  const gltf = await loadGlbOneAtATime('./assets/models/boss-white-screecher.glb?v=white-screecher-meshy1');
  const runGltf = await loadGlbOneAtATime('./assets/models/boss-white-screecher-run.anim.glb?v=white-screecher-meshy1');
  const judgmentGltf = await loadGlbOneAtATime('./assets/models/boss-white-screecher-judgment.anim.glb?v=white-screecher-meshy1');
  const comboGltf = await loadGlbOneAtATime('./assets/models/boss-white-screecher-combo.anim.glb?v=white-screecher-meshy1');
  const diveGltf = await loadGlbOneAtATime('./assets/models/boss-white-screecher-dive.anim.glb?v=white-screecher-meshy1');
  const scene = gltf.scene;
  const root = prepareModel(scene, 2.2, 'whiteScreecherBossHighQualityModel');
  const mixer = new AnimationMixer(scene);
  const walkClip = removeUnsafeScaleTracks(gltf.animations[0]);
  const runClip = removeUnsafeScaleTracks(runGltf.animations[0]);
  const judgmentClip = removeUnsafeScaleTracks(judgmentGltf.animations[0]);
  const comboClip = removeUnsafeScaleTracks(comboGltf.animations[0]);
  const diveClip = removeUnsafeScaleTracks(diveGltf.animations[0]);
  disposeModel(runGltf.scene);
  disposeModel(judgmentGltf.scene);
  disposeModel(comboGltf.scene);
  disposeModel(diveGltf.scene);
  const walkAction = walkClip ? mixer.clipAction(walkClip) : null;
  const runAction = runClip ? mixer.clipAction(runClip) : walkAction;
  const judgmentAction = judgmentClip ? mixer.clipAction(judgmentClip) : null;
  const comboAction = comboClip ? mixer.clipAction(comboClip) : judgmentAction;
  const diveAction = diveClip ? mixer.clipAction(diveClip) : comboAction;
  let activeLoop = null;
  let activeAttack = null;
  let attackRemaining = 0;
  let dead = false;

  const beginLoop = (action, timeScale = 1) => {
    if (!action || attackRemaining > 0 || dead) return;
    if (action === activeLoop) {
      action.setEffectiveTimeScale(timeScale);
      return;
    }
    activeLoop?.fadeOut(0.16);
    action.reset().setEffectiveWeight(1).setEffectiveTimeScale(timeScale).fadeIn(0.16).play();
    activeLoop = action;
  };

  // The package does not include a separate idle. A heavily slowed walk keeps
  // the airborne silhouette alive without making the encounter root drift.
  beginLoop(walkAction, 0.22);

  return {
    root,
    calibrate() {
      return calibrateAttachedModel(root, 2.2);
    },
    update(delta, moving = true, running = false) {
      updateModelShadows(root, delta);
      if (dead) {
        mixer.update(delta);
        return;
      }
      if (attackRemaining > 0) {
        attackRemaining = Math.max(0, attackRemaining - delta);
        mixer.update(delta);
        if (attackRemaining === 0) {
          activeAttack?.fadeOut(0.12);
          activeAttack = null;
          activeLoop = null;
          beginLoop(moving ? (running ? runAction : walkAction) : walkAction, moving ? (running ? 1.1 : 0.9) : 0.22);
        }
        return;
      }
      beginLoop(moving ? (running ? runAction : walkAction) : walkAction, moving ? (running ? 1.1 : 0.9) : 0.22);
      mixer.update(delta);
    },
    playAttack(patternId = '') {
      if (dead) return;
      const id = String(patternId);
      const action = /dive|finale/i.test(id)
        ? diveAction
        : /barrage|fan|strafe/i.test(id)
          ? comboAction
          : judgmentAction;
      if (!action) return;
      const timeScale = action === comboAction ? 1.18 : action === diveAction ? 1.12 : 1.04;
      activeLoop?.fadeOut(0.1);
      action.reset().setLoop(LoopOnce, 1).setEffectiveWeight(1).setEffectiveTimeScale(timeScale).fadeIn(0.08).play();
      activeAttack = action;
      attackRemaining = Math.max(0.38, action.getClip().duration / timeScale);
    },
    playDeath() {
      if (dead) return;
      dead = true;
      attackRemaining = 0;
      mixer.stopAllAction();
    },
    measure() {
      return measureModel(root);
    },
    dispose() {
      mixer.stopAllAction();
      disposeModel(root);
    },
  };
}

// The Archive Shade ships its own Meshy biped rig (idle / run / combo / spin /
// judgment / slash), so it no longer borrows the Thornwarden silhouette.
export async function loadArchiveShadeBossModel() {
  await MeshoptDecoder.ready;
  const gltf = await loadGlbOneAtATime('./assets/models/boss-archive-shade.glb?v=archive-shade-meshy1');
  const runGltf = await loadGlbOneAtATime('./assets/models/boss-archive-shade-run.anim.glb?v=archive-shade-meshy1');
  const judgmentGltf = await loadGlbOneAtATime('./assets/models/boss-archive-shade-judgment.anim.glb?v=archive-shade-meshy1');
  const comboGltf = await loadGlbOneAtATime('./assets/models/boss-archive-shade-combo.anim.glb?v=archive-shade-meshy1');
  const spinGltf = await loadGlbOneAtATime('./assets/models/boss-archive-shade-spin.anim.glb?v=archive-shade-meshy1');
  const slashGltf = await loadGlbOneAtATime('./assets/models/boss-archive-shade-slash.anim.glb?v=archive-shade-meshy1');
  const scene = gltf.scene;
  const root = prepareModel(scene, 2.6, 'archiveShadeBossHighQualityModel');
  const mixer = new AnimationMixer(scene);
  const walkClip = removeUnsafeScaleTracks(gltf.animations[0]);
  const runClip = removeUnsafeScaleTracks(runGltf.animations[0]);
  const judgmentClip = removeUnsafeScaleTracks(judgmentGltf.animations[0]);
  const comboClip = removeUnsafeScaleTracks(comboGltf.animations[0]);
  const spinClip = removeUnsafeScaleTracks(spinGltf.animations[0]);
  const slashClip = removeUnsafeScaleTracks(slashGltf.animations[0]);
  disposeModel(runGltf.scene);
  disposeModel(judgmentGltf.scene);
  disposeModel(comboGltf.scene);
  disposeModel(spinGltf.scene);
  disposeModel(slashGltf.scene);
  const walkAction = walkClip ? mixer.clipAction(walkClip) : null;
  const runAction = runClip ? mixer.clipAction(runClip) : walkAction;
  const judgmentAction = judgmentClip ? mixer.clipAction(judgmentClip) : null;
  const comboAction = comboClip ? mixer.clipAction(comboClip) : judgmentAction;
  const spinAction = spinClip ? mixer.clipAction(spinClip) : comboAction;
  const slashAction = slashClip ? mixer.clipAction(slashClip) : comboAction;
  let activeLoop = null;
  let activeAttack = null;
  let attackRemaining = 0;
  let dead = false;

  const beginLoop = (action, timeScale = 1) => {
    if (!action || attackRemaining > 0 || dead) return;
    if (action === activeLoop) {
      action.setEffectiveTimeScale(timeScale);
      return;
    }
    activeLoop?.fadeOut(0.16);
    action.reset().setEffectiveWeight(1).setEffectiveTimeScale(timeScale).fadeIn(0.16).play();
    activeLoop = action;
  };

  // The package does not include a separate idle. A heavily slowed walk keeps
  // the airborne silhouette alive without making the encounter root drift.
  beginLoop(walkAction, 0.22);

  return {
    root,
    calibrate() {
      return calibrateAttachedModel(root, 2.2);
    },
    update(delta, moving = true, running = false) {
      updateModelShadows(root, delta);
      if (dead) {
        mixer.update(delta);
        return;
      }
      if (attackRemaining > 0) {
        attackRemaining = Math.max(0, attackRemaining - delta);
        mixer.update(delta);
        if (attackRemaining === 0) {
          activeAttack?.fadeOut(0.12);
          activeAttack = null;
          activeLoop = null;
          beginLoop(moving ? (running ? runAction : walkAction) : walkAction, moving ? (running ? 1.1 : 0.9) : 0.22);
        }
        return;
      }
      beginLoop(moving ? (running ? runAction : walkAction) : walkAction, moving ? (running ? 1.1 : 0.9) : 0.22);
      mixer.update(delta);
    },
    playAttack(patternId = '') {
      if (dead) return;
      const id = String(patternId);
      // Archive Shade patterns: frost fans and thorn bursts read as sweeping
      // slashes, spirals/walls as the blade spin, and the finale as its judgment.
      const action = /finale|blizzard|vault/i.test(id)
        ? judgmentAction
        : /spiral|rotating|whiteout/i.test(id)
          ? spinAction
          : /fan|burst|hail|cryo/i.test(id)
            ? slashAction
            : judgmentAction;
      if (!action) return;
      const timeScale = action === comboAction ? 1.18 : action === slashAction ? 1.14 : action === spinAction ? 1.12 : 1.04;
      activeLoop?.fadeOut(0.1);
      action.reset().setLoop(LoopOnce, 1).setEffectiveWeight(1).setEffectiveTimeScale(timeScale).fadeIn(0.08).play();
      activeAttack = action;
      attackRemaining = Math.max(0.38, action.getClip().duration / timeScale);
    },
    playDeath() {
      if (dead) return;
      dead = true;
      attackRemaining = 0;
      mixer.stopAllAction();
    },
    measure() {
      return measureModel(root);
    },
    dispose() {
      mixer.stopAllAction();
      disposeModel(root);
    },
  };
}

// The Fiery Obsidian Demon Knight: a colossal undead volcanic warrior. Rig is a
// Meshy biped with run / triple-combo / sword-judgment / weapon-combo clips.
export async function loadObsidianKnightBossModel() {
  await MeshoptDecoder.ready;
  const gltf = await loadGlbOneAtATime('./assets/models/boss-obsidian-knight.glb?v=obsidian-knight-meshy1');
  const runGltf = await loadGlbOneAtATime('./assets/models/boss-obsidian-knight-run.anim.glb?v=obsidian-knight-meshy1');
  const judgmentGltf = await loadGlbOneAtATime('./assets/models/boss-obsidian-knight-judgment.anim.glb?v=obsidian-knight-meshy1');
  const comboGltf = await loadGlbOneAtATime('./assets/models/boss-obsidian-knight-combo.anim.glb?v=obsidian-knight-meshy1');
  const slashGltf = await loadGlbOneAtATime('./assets/models/boss-obsidian-knight-slash.anim.glb?v=obsidian-knight-meshy1');
  const scene = gltf.scene;
  const root = prepareModel(scene, 3.4, 'obsidianKnightBossHighQualityModel');
  const mixer = new AnimationMixer(scene);
  const walkClip = removeUnsafeScaleTracks(gltf.animations[0]);
  const runClip = removeUnsafeScaleTracks(runGltf.animations[0]);
  const judgmentClip = removeUnsafeScaleTracks(judgmentGltf.animations[0]);
  const comboClip = removeUnsafeScaleTracks(comboGltf.animations[0]);
  const slashClip = removeUnsafeScaleTracks(slashGltf.animations[0]);
  disposeModel(runGltf.scene);
  disposeModel(judgmentGltf.scene);
  disposeModel(comboGltf.scene);
  disposeModel(slashGltf.scene);
  const walkAction = walkClip ? mixer.clipAction(walkClip) : null;
  const runAction = runClip ? mixer.clipAction(runClip) : walkAction;
  const judgmentAction = judgmentClip ? mixer.clipAction(judgmentClip) : null;
  const comboAction = comboClip ? mixer.clipAction(comboClip) : judgmentAction;
  const slashAction = slashClip ? mixer.clipAction(slashClip) : comboAction;
  let activeLoop = null;
  let activeAttack = null;
  let attackRemaining = 0;
  let dead = false;

  const beginLoop = (action, timeScale = 1) => {
    if (!action || attackRemaining > 0 || dead) return;
    if (action === activeLoop) {
      action.setEffectiveTimeScale(timeScale);
      return;
    }
    activeLoop?.fadeOut(0.16);
    action.reset().setEffectiveWeight(1).setEffectiveTimeScale(timeScale).fadeIn(0.16).play();
    activeLoop = action;
  };

  // The package does not include a separate idle. A heavily slowed walk keeps
  // the airborne silhouette alive without making the encounter root drift.
  beginLoop(walkAction, 0.22);

  return {
    root,
    calibrate() {
      return calibrateAttachedModel(root, 2.2);
    },
    update(delta, moving = true, running = false) {
      updateModelShadows(root, delta);
      if (dead) {
        mixer.update(delta);
        return;
      }
      if (attackRemaining > 0) {
        attackRemaining = Math.max(0, attackRemaining - delta);
        mixer.update(delta);
        if (attackRemaining === 0) {
          activeAttack?.fadeOut(0.12);
          activeAttack = null;
          activeLoop = null;
          beginLoop(moving ? (running ? runAction : walkAction) : walkAction, moving ? (running ? 1.1 : 0.9) : 0.22);
        }
        return;
      }
      beginLoop(moving ? (running ? runAction : walkAction) : walkAction, moving ? (running ? 1.1 : 0.9) : 0.22);
      mixer.update(delta);
    },
    playAttack(patternId = '') {
      if (dead) return;
      const id = String(patternId);
      // A militaristic knight, not a lava beast: finales are a two-handed sword
      // judgment, sustained barrages are the triple combo, and single heavy
      // shots land as one committed slash.
      const action = /finale|overcharge|meteor/i.test(id)
        ? judgmentAction
        : /barrage|double|storm|ring/i.test(id)
          ? comboAction
          : slashAction;
      if (!action) return;
      const timeScale = action === comboAction ? 1.18 : action === slashAction ? 1.12 : 1.04;
      activeLoop?.fadeOut(0.1);
      action.reset().setLoop(LoopOnce, 1).setEffectiveWeight(1).setEffectiveTimeScale(timeScale).fadeIn(0.08).play();
      activeAttack = action;
      attackRemaining = Math.max(0.38, action.getClip().duration / timeScale);
    },
    playDeath() {
      if (dead) return;
      dead = true;
      attackRemaining = 0;
      mixer.stopAllAction();
    },
    measure() {
      return measureModel(root);
    },
    dispose() {
      mixer.stopAllAction();
      disposeModel(root);
    },
  };
}

// The Insect King: a majestic biomechanical hive monarch with translucent wings.
// Rig is a Meshy biped with run / wing-dive / power-spin / charged-slash clips.
export async function loadInsectKingBossModel() {
  await MeshoptDecoder.ready;
  const gltf = await loadGlbOneAtATime('./assets/models/boss-insect-king.glb?v=insect-king-meshy1');
  const runGltf = await loadGlbOneAtATime('./assets/models/boss-insect-king-run.anim.glb?v=insect-king-meshy1');
  const judgmentGltf = await loadGlbOneAtATime('./assets/models/boss-insect-king-judgment.anim.glb?v=insect-king-meshy1');
  const spinGltf = await loadGlbOneAtATime('./assets/models/boss-insect-king-spin.anim.glb?v=insect-king-meshy1');
  const diveGltf = await loadGlbOneAtATime('./assets/models/boss-insect-king-dive.anim.glb?v=insect-king-meshy1');
  const scene = gltf.scene;
  const root = prepareModel(scene, 3.8, 'insectKingBossHighQualityModel');
  const mixer = new AnimationMixer(scene);
  const walkClip = removeUnsafeScaleTracks(gltf.animations[0]);
  const runClip = removeUnsafeScaleTracks(runGltf.animations[0]);
  const judgmentClip = removeUnsafeScaleTracks(judgmentGltf.animations[0]);
  const spinClip = removeUnsafeScaleTracks(spinGltf.animations[0]);
  const diveClip = removeUnsafeScaleTracks(diveGltf.animations[0]);
  disposeModel(runGltf.scene);
  disposeModel(judgmentGltf.scene);
  disposeModel(spinGltf.scene);
  disposeModel(diveGltf.scene);
  const walkAction = walkClip ? mixer.clipAction(walkClip) : null;
  const runAction = runClip ? mixer.clipAction(runClip) : walkAction;
  const judgmentAction = judgmentClip ? mixer.clipAction(judgmentClip) : null;
  const spinAction = spinClip ? mixer.clipAction(spinClip) : judgmentAction;
  const diveAction = diveClip ? mixer.clipAction(diveClip) : spinAction;
  let activeLoop = null;
  let activeAttack = null;
  let attackRemaining = 0;
  let dead = false;

  const beginLoop = (action, timeScale = 1) => {
    if (!action || attackRemaining > 0 || dead) return;
    if (action === activeLoop) {
      action.setEffectiveTimeScale(timeScale);
      return;
    }
    activeLoop?.fadeOut(0.16);
    action.reset().setEffectiveWeight(1).setEffectiveTimeScale(timeScale).fadeIn(0.16).play();
    activeLoop = action;
  };

  // The package does not include a separate idle. A heavily slowed walk keeps
  // the airborne silhouette alive without making the encounter root drift.
  beginLoop(walkAction, 0.22);

  return {
    root,
    calibrate() {
      return calibrateAttachedModel(root, 2.2);
    },
    update(delta, moving = true, running = false) {
      updateModelShadows(root, delta);
      if (dead) {
        mixer.update(delta);
        return;
      }
      if (attackRemaining > 0) {
        attackRemaining = Math.max(0, attackRemaining - delta);
        mixer.update(delta);
        if (attackRemaining === 0) {
          activeAttack?.fadeOut(0.12);
          activeAttack = null;
          activeLoop = null;
          beginLoop(moving ? (running ? runAction : walkAction) : walkAction, moving ? (running ? 1.1 : 0.9) : 0.22);
        }
        return;
      }
      beginLoop(moving ? (running ? runAction : walkAction) : walkAction, moving ? (running ? 1.1 : 0.9) : 0.22);
      mixer.update(delta);
    },
    playAttack(patternId = '') {
      if (dead) return;
      const id = String(patternId);
      // A hive monarch, not a bug: he descends on the arena with a wing dive for
      // finales, answers sustained volleys with a 360 wing spin, and opens single
      // committed strikes with a charged upward slash.
      const action = /finale|tempest|drowning/i.test(id)
        ? diveAction
        : /geyser|lane|wake|eruption|spiral/i.test(id)
          ? spinAction
          : judgmentAction;
      if (!action) return;
      const timeScale = action === spinAction ? 1.18 : action === diveAction ? 1.12 : 1.04;
      activeLoop?.fadeOut(0.1);
      action.reset().setLoop(LoopOnce, 1).setEffectiveWeight(1).setEffectiveTimeScale(timeScale).fadeIn(0.08).play();
      activeAttack = action;
      attackRemaining = Math.max(0.38, action.getClip().duration / timeScale);
    },
    playDeath() {
      if (dead) return;
      dead = true;
      attackRemaining = 0;
      mixer.stopAllAction();
    },
    measure() {
      return measureModel(root);
    },
    dispose() {
      mixer.stopAllAction();
      disposeModel(root);
    },
  };
}

export async function loadSunscarBossModel() {
  await MeshoptDecoder.ready;
  const gltf = await loadGlbOneAtATime('./assets/models/boss-sunscar-colossus.glb?v=sunscar-meshy1');
  const idleGltf = await loadGlbOneAtATime('./assets/models/boss-sunscar-colossus-idle.anim.glb?v=sunscar-meshy1');
  const runGltf = await loadGlbOneAtATime('./assets/models/boss-sunscar-colossus-run.anim.glb?v=sunscar-meshy1');
  const slamGltf = await loadGlbOneAtATime('./assets/models/boss-sunscar-colossus-slam.anim.glb?v=sunscar-meshy1');
  const throwGltf = await loadGlbOneAtATime('./assets/models/boss-sunscar-colossus-throw.anim.glb?v=sunscar-meshy1');
  const scene = gltf.scene;
  const root = prepareModel(scene, 2.2, 'sunscarColossusHighQualityModel');
  const mixer = new AnimationMixer(scene);
  const walkClip = removeUnsafeScaleTracks(gltf.animations[0]);
  const idleClip = removeUnsafeScaleTracks(idleGltf.animations[0]);
  const runClip = removeUnsafeScaleTracks(runGltf.animations[0]);
  const slamClip = removeUnsafeScaleTracks(slamGltf.animations[0]);
  const throwClip = removeUnsafeScaleTracks(throwGltf.animations[0]);
  disposeModel(idleGltf.scene);
  disposeModel(runGltf.scene);
  disposeModel(slamGltf.scene);
  disposeModel(throwGltf.scene);
  const idleAction = idleClip ? mixer.clipAction(idleClip) : null;
  const walkAction = walkClip ? mixer.clipAction(walkClip) : idleAction;
  const runAction = runClip ? mixer.clipAction(runClip) : walkAction;
  const slamAction = slamClip ? mixer.clipAction(slamClip) : null;
  const throwAction = throwClip ? mixer.clipAction(throwClip) : slamAction;
  let activeLoop = null;
  let activeAttack = null;
  let attackRemaining = 0;
  let dead = false;

  const beginLoop = (action) => {
    if (!action || action === activeLoop || attackRemaining > 0 || dead) return;
    activeLoop?.fadeOut(0.18);
    action.reset().setEffectiveWeight(1).fadeIn(0.18).play();
    activeLoop = action;
  };

  beginLoop(idleAction ?? walkAction);

  return {
    root,
    calibrate() {
      return calibrateAttachedModel(root, 2.2);
    },
    update(delta, moving = true, running = false) {
      updateModelShadows(root, delta);
      if (dead) {
        mixer.update(delta);
        return;
      }
      if (attackRemaining > 0) {
        attackRemaining = Math.max(0, attackRemaining - delta);
        mixer.update(delta);
        if (attackRemaining === 0) {
          activeAttack?.fadeOut(0.15);
          activeAttack = null;
          activeLoop = null;
          beginLoop(moving ? (running ? runAction : walkAction) : idleAction);
        }
        return;
      }
      beginLoop(moving ? (running ? runAction : walkAction) : idleAction);
      mixer.update(delta);
    },
    playAttack(patternId = '') {
      if (dead) return;
      const rangedPattern = /rain|storm|radial|spiral|wall|fastball|pitch|focus|overcharge/i.test(String(patternId));
      const action = rangedPattern ? throwAction : slamAction;
      if (!action) return;
      activeLoop?.fadeOut(0.12);
      action.reset().setLoop(LoopOnce, 1).setEffectiveWeight(1).fadeIn(0.1).play();
      activeAttack = action;
      attackRemaining = Math.max(0.35, action.getClip().duration);
    },
    playDeath() {
      if (dead) return;
      dead = true;
      attackRemaining = 0;
      mixer.stopAllAction();
    },
    measure() {
      return measureModel(root);
    },
    dispose() {
      mixer.stopAllAction();
      disposeModel(root);
    },
  };
}

export async function loadMireSirenBossModel() {
  await MeshoptDecoder.ready;
  const gltf = await loadGlbOneAtATime('./assets/models/boss-mire-siren.glb?v=mire-siren1');
  const runGltf = await loadGlbOneAtATime('./assets/models/boss-mire-siren-run.anim.glb?v=mire-siren1');
  const slashGltf = await loadGlbOneAtATime('./assets/models/boss-mire-siren-slash.anim.glb?v=mire-siren1');
  const ritualGltf = await loadGlbOneAtATime('./assets/models/boss-mire-siren-ritual.anim.glb?v=mire-siren1');
  const scene = gltf.scene;
  const root = prepareModel(scene, 2.2, 'mireSirenBossHighQualityModel');
  const mixer = new AnimationMixer(scene);
  const walkClip = removeUnsafeScaleTracks(gltf.animations[0]);
  const runClip = removeUnsafeScaleTracks(runGltf.animations[0]);
  const slashClip = removeUnsafeScaleTracks(slashGltf.animations[0]);
  const ritualClip = removeUnsafeScaleTracks(ritualGltf.animations[0]);
  disposeModel(runGltf.scene);
  disposeModel(slashGltf.scene);
  disposeModel(ritualGltf.scene);
  const walkAction = walkClip ? mixer.clipAction(walkClip) : null;
  const runAction = runClip ? mixer.clipAction(runClip) : walkAction;
  const slashAction = slashClip ? mixer.clipAction(slashClip) : null;
  const ritualAction = ritualClip ? mixer.clipAction(ritualClip) : slashAction;
  let activeLoop = null;
  let activeAttack = null;
  let attackRemaining = 0;
  let dead = false;

  const beginLoop = (action, timeScale = 1) => {
    if (!action || action === activeLoop || attackRemaining > 0 || dead) return;
    activeLoop?.fadeOut(0.18);
    action.reset().setEffectiveWeight(1).setEffectiveTimeScale(timeScale).fadeIn(0.18).play();
    activeLoop = action;
  };

  beginLoop(walkAction, 0.34);

  return {
    root,
    calibrate() {
      return calibrateAttachedModel(root, 2.2);
    },
    update(delta, moving = true, running = false) {
      updateModelShadows(root, delta);
      if (dead) {
        mixer.update(delta);
        return;
      }
      if (attackRemaining > 0) {
        attackRemaining = Math.max(0, attackRemaining - delta);
        mixer.update(delta);
        if (attackRemaining === 0) {
          activeAttack?.fadeOut(0.15);
          activeAttack = null;
          activeLoop = null;
          beginLoop(running ? runAction : walkAction, moving ? 1 : 0.34);
        }
        return;
      }
      beginLoop(running ? runAction : walkAction, moving ? 1 : 0.34);
      mixer.update(delta);
    },
    playAttack(patternId = '') {
      if (dead) return;
      const ritualPattern = /pulse|bolt|spiral|flood|tempest|finale|chorus/i.test(String(patternId));
      const action = ritualPattern ? ritualAction : slashAction;
      if (!action) return;
      activeLoop?.fadeOut(0.12);
      action.reset().setLoop(LoopOnce, 1).setEffectiveWeight(1).setEffectiveTimeScale(1).fadeIn(0.1).play();
      activeAttack = action;
      attackRemaining = Math.max(0.35, action.getClip().duration);
    },
    playDeath() {
      if (dead) return;
      dead = true;
      attackRemaining = 0;
      mixer.stopAllAction();
    },
    measure() {
      return measureModel(root);
    },
    dispose() {
      mixer.stopAllAction();
      disposeModel(root);
    },
  };
}

export async function loadDrownedTremorBossModel() {
  await MeshoptDecoder.ready;
  const gltf = await loadGlbOneAtATime('./assets/models/boss-drowned-tremor.glb?v=drowned-tremor1');
  const runGltf = await loadGlbOneAtATime('./assets/models/boss-drowned-tremor-run.anim.glb?v=drowned-tremor1');
  const volleyGltf = await loadGlbOneAtATime('./assets/models/boss-drowned-tremor-volley.anim.glb?v=drowned-tremor1');
  const scene = gltf.scene;
  const root = prepareModel(scene, 2.2, 'drownedTremorBossHighQualityModel');
  const mixer = new AnimationMixer(scene);
  const walkClip = removeUnsafeScaleTracks(gltf.animations[0]);
  const runClip = removeUnsafeScaleTracks(runGltf.animations[0]);
  const volleyClip = removeUnsafeScaleTracks(volleyGltf.animations[0]);
  disposeModel(runGltf.scene);
  disposeModel(volleyGltf.scene);
  const walkAction = walkClip ? mixer.clipAction(walkClip) : null;
  const runAction = runClip ? mixer.clipAction(runClip) : walkAction;
  const volleyAction = volleyClip ? mixer.clipAction(volleyClip) : null;
  let activeLoop = null;
  let activeAttack = null;
  let attackRemaining = 0;
  let dead = false;

  const beginLoop = (action, timeScale = 1) => {
    if (!action || attackRemaining > 0 || dead) return;
    if (action === activeLoop) {
      action.setEffectiveTimeScale(timeScale);
      return;
    }
    activeLoop?.fadeOut(0.16);
    action.reset().setEffectiveWeight(1).setEffectiveTimeScale(timeScale).fadeIn(0.16).play();
    activeLoop = action;
  };

  beginLoop(walkAction, 0.28);

  return {
    root,
    calibrate() {
      return calibrateAttachedModel(root, 2.2);
    },
    update(delta, moving = true, running = false) {
      updateModelShadows(root, delta);
      if (dead) {
        mixer.update(delta);
        return;
      }
      if (attackRemaining > 0) {
        attackRemaining = Math.max(0, attackRemaining - delta);
        mixer.update(delta);
        if (attackRemaining === 0) {
          activeAttack?.fadeOut(0.12);
          activeAttack = null;
          activeLoop = null;
          beginLoop(running ? runAction : walkAction, moving ? 1 : 0.28);
        }
        return;
      }
      beginLoop(running ? runAction : walkAction, moving ? 1 : 0.28);
      mixer.update(delta);
    },
    playAttack() {
      if (dead || !volleyAction) return;
      activeLoop?.fadeOut(0.1);
      volleyAction.reset().setLoop(LoopOnce, 1).setEffectiveWeight(1).setEffectiveTimeScale(1.05).fadeIn(0.08).play();
      activeAttack = volleyAction;
      attackRemaining = Math.max(0.35, volleyAction.getClip().duration / 1.05);
    },
    playDeath() {
      if (dead) return;
      dead = true;
      attackRemaining = 0;
      mixer.stopAllAction();
    },
    measure() {
      return measureModel(root);
    },
    dispose() {
      mixer.stopAllAction();
      disposeModel(root);
    },
  };
}

export async function loadStormbackBossModel() {
  await MeshoptDecoder.ready;
  const gltf = await loadGlbOneAtATime('./assets/models/boss-stormback.glb?v=stormback1');
  const idleGltf = await loadGlbOneAtATime('./assets/models/boss-stormback-idle.anim.glb?v=stormback1');
  const runGltf = await loadGlbOneAtATime('./assets/models/boss-stormback-run.anim.glb?v=stormback1');
  const hookGltf = await loadGlbOneAtATime('./assets/models/boss-stormback-hook.anim.glb?v=stormback1');
  const slamGltf = await loadGlbOneAtATime('./assets/models/boss-stormback-slam.anim.glb?v=stormback1');
  const roarGltf = await loadGlbOneAtATime('./assets/models/boss-stormback-roar.anim.glb?v=stormback1');
  const scene = gltf.scene;
  const root = prepareModel(scene, 2.2, 'stormbackBossHighQualityModel');
  const mixer = new AnimationMixer(scene);
  const walkClip = removeUnsafeScaleTracks(gltf.animations[0]);
  const idleClip = removeUnsafeScaleTracks(idleGltf.animations[0]);
  const runClip = removeUnsafeScaleTracks(runGltf.animations[0]);
  const hookClip = removeUnsafeScaleTracks(hookGltf.animations[0]);
  const slamClip = removeUnsafeScaleTracks(slamGltf.animations[0]);
  const roarClip = removeUnsafeScaleTracks(roarGltf.animations[0]);
  disposeModel(idleGltf.scene);
  disposeModel(runGltf.scene);
  disposeModel(hookGltf.scene);
  disposeModel(slamGltf.scene);
  disposeModel(roarGltf.scene);
  const idleAction = idleClip ? mixer.clipAction(idleClip) : null;
  const walkAction = walkClip ? mixer.clipAction(walkClip) : idleAction;
  const runAction = runClip ? mixer.clipAction(runClip) : walkAction;
  const hookAction = hookClip ? mixer.clipAction(hookClip) : null;
  const slamAction = slamClip ? mixer.clipAction(slamClip) : hookAction;
  const roarAction = roarClip ? mixer.clipAction(roarClip) : slamAction;
  let activeLoop = null;
  let activeAttack = null;
  let attackRemaining = 0;
  let dead = false;

  const beginLoop = (action, timeScale = 1) => {
    if (!action || attackRemaining > 0 || dead) return;
    if (action === activeLoop) {
      action.setEffectiveTimeScale(timeScale);
      return;
    }
    activeLoop?.fadeOut(0.16);
    action.reset().setEffectiveWeight(1).setEffectiveTimeScale(timeScale).fadeIn(0.16).play();
    activeLoop = action;
  };

  beginLoop(idleAction ?? walkAction, 1);

  return {
    root,
    calibrate() {
      return calibrateAttachedModel(root, 2.2);
    },
    update(delta, moving = true, running = false) {
      updateModelShadows(root, delta);
      if (dead) {
        mixer.update(delta);
        return;
      }
      if (attackRemaining > 0) {
        attackRemaining = Math.max(0, attackRemaining - delta);
        mixer.update(delta);
        if (attackRemaining === 0) {
          activeAttack?.fadeOut(0.12);
          activeAttack = null;
          activeLoop = null;
          beginLoop(moving ? (running ? runAction : walkAction) : idleAction);
        }
        return;
      }
      beginLoop(moving ? (running ? runAction : walkAction) : idleAction);
      mixer.update(delta);
    },
    playAttack(patternId = '') {
      if (dead) return;
      const id = String(patternId);
      const action = /ring|stormfront|crown|finale/i.test(id)
        ? roarAction
        : /hook|fan/i.test(id)
          ? hookAction
          : slamAction;
      if (!action) return;
      activeLoop?.fadeOut(0.1);
      action.reset().setLoop(LoopOnce, 1).setEffectiveWeight(1).setEffectiveTimeScale(1).fadeIn(0.08).play();
      activeAttack = action;
      attackRemaining = Math.max(0.35, action.getClip().duration);
    },
    playDeath() {
      if (dead) return;
      dead = true;
      attackRemaining = 0;
      mixer.stopAllAction();
    },
    measure() {
      return measureModel(root);
    },
    dispose() {
      mixer.stopAllAction();
      disposeModel(root);
    },
  };
}

export async function loadAncientThornwardenBossModel() {
  await MeshoptDecoder.ready;
  const gltf = await loadGlbOneAtATime('./assets/models/boss-ancient-thornwarden.glb?v=thornwarden1');
  const idleGltf = await loadGlbOneAtATime('./assets/models/boss-ancient-thornwarden-idle.anim.glb?v=thornwarden1');
  const runGltf = await loadGlbOneAtATime('./assets/models/boss-ancient-thornwarden-run.anim.glb?v=thornwarden1');
  const slamGltf = await loadGlbOneAtATime('./assets/models/boss-ancient-thornwarden-slam.anim.glb?v=thornwarden1');
  const scene = gltf.scene;
  const root = prepareModel(scene, 2.2, 'ancientThornwardenBossHighQualityModel');
  const mixer = new AnimationMixer(scene);
  const walkClip = removeUnsafeScaleTracks(gltf.animations[0]);
  const idleClip = removeUnsafeScaleTracks(idleGltf.animations[0]);
  const runClip = removeUnsafeScaleTracks(runGltf.animations[0]);
  const slamClip = removeUnsafeScaleTracks(slamGltf.animations[0]);
  disposeModel(idleGltf.scene);
  disposeModel(runGltf.scene);
  disposeModel(slamGltf.scene);
  const idleAction = idleClip ? mixer.clipAction(idleClip) : null;
  const walkAction = walkClip ? mixer.clipAction(walkClip) : idleAction;
  const runAction = runClip ? mixer.clipAction(runClip) : walkAction;
  const slamAction = slamClip ? mixer.clipAction(slamClip) : null;
  let activeLoop = null;
  let activeAttack = null;
  let attackRemaining = 0;
  let dead = false;

  const beginLoop = (action, timeScale = 1) => {
    if (!action || attackRemaining > 0 || dead) return;
    if (action === activeLoop) {
      action.setEffectiveTimeScale(timeScale);
      return;
    }
    activeLoop?.fadeOut(0.18);
    action.reset().setEffectiveWeight(1).setEffectiveTimeScale(timeScale).fadeIn(0.18).play();
    activeLoop = action;
  };

  beginLoop(idleAction ?? walkAction, 1);

  return {
    root,
    calibrate() {
      return calibrateAttachedModel(root, 2.2);
    },
    update(delta, moving = true, running = false) {
      updateModelShadows(root, delta);
      if (dead) {
        mixer.update(delta);
        return;
      }
      if (attackRemaining > 0) {
        attackRemaining = Math.max(0, attackRemaining - delta);
        mixer.update(delta);
        if (attackRemaining === 0) {
          activeAttack?.fadeOut(0.14);
          activeAttack = null;
          activeLoop = null;
          beginLoop(moving ? (running ? runAction : walkAction) : idleAction);
        }
        return;
      }
      beginLoop(moving ? (running ? runAction : walkAction) : idleAction, running ? 1.08 : 0.92);
      mixer.update(delta);
    },
    playAttack() {
      if (dead || !slamAction) return;
      activeLoop?.fadeOut(0.1);
      slamAction.reset().setLoop(LoopOnce, 1).setEffectiveWeight(1).setEffectiveTimeScale(1.12).fadeIn(0.08).play();
      activeAttack = slamAction;
      attackRemaining = Math.max(0.4, slamAction.getClip().duration / 1.12);
    },
    playDeath() {
      if (dead) return;
      dead = true;
      attackRemaining = 0;
      mixer.stopAllAction();
    },
    measure() {
      return measureModel(root);
    },
    dispose() {
      mixer.stopAllAction();
      disposeModel(root);
    },
  };
}
