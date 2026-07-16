import {
  AnimationMixer,
  Box3,
  Group,
  Vector3,
} from './vendor/three.module.min.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { MeshoptDecoder } from './vendor/meshopt_decoder.module.js';

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

function prepareModel(scene, targetHeight, name) {
  const root = new Group();
  root.name = name;
  root.add(scene);

  scene.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    object.frustumCulled = true;
  });

  const box = new Box3().setFromObject(scene);
  const size = box.getSize(new Vector3());
  const scale = targetHeight / Math.max(size.y, 0.0001);
  scene.scale.setScalar(scale);

  const scaledBox = new Box3().setFromObject(scene);
  const center = scaledBox.getCenter(new Vector3());
  scene.position.x -= center.x;
  scene.position.z -= center.z;
  scene.position.y -= scaledBox.min.y;

  return root;
}

function disposeModel(root) {
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
  const walkAction = walkClip ? mixer.clipAction(walkClip) : null;
  const runAction = runClip ? mixer.clipAction(runClip) : null;
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

export async function loadEnsignModels() {
  await MeshoptDecoder.ready;
  const [engineerGltf, runningEngineerGltf, scoutGltf] = await Promise.all([
    loader.loadAsync('./assets/models/ensign-engineer.glb'),
    loader.loadAsync('./assets/models/ensign-engineer-run.glb'),
    loader.loadAsync('./assets/models/ensign-support-scout.glb'),
  ]);

  const engineer = prepareModel(engineerGltf.scene, 3.35, 'ensignHighQualityModel');
  const scout = prepareModel(scoutGltf.scene, 1.8, 'ensignScoutHighQualityModel');
  scout.rotation.y = Math.PI;

  const engineerMotion = createMotionController(
    engineerGltf.scene,
    engineerGltf.animations[0],
    runningEngineerGltf.animations[0],
  );
  disposeModel(runningEngineerGltf.scene);

  return {
    engineer,
    scout,
    update(delta, moving, sprinting) {
      engineerMotion.update(delta, moving, sprinting);
    },
    dispose() {
      engineerMotion.dispose();
      disposeModel(engineer);
      disposeModel(scout);
    },
  };
}

export async function loadLieutenantModels() {
  await MeshoptDecoder.ready;
  const [astronautGltf, runningAstronautGltf, mechGltf, runningMechGltf] = await Promise.all([
    loader.loadAsync('./assets/models/lieutenant-astronaut.glb'),
    loader.loadAsync('./assets/models/lieutenant-astronaut-run.glb'),
    loader.loadAsync('./assets/models/lieutenant-mech-walk.glb'),
    loader.loadAsync('./assets/models/lieutenant-mech-run.glb'),
  ]);

  const astronaut = prepareModel(
    astronautGltf.scene,
    3.35,
    'lieutenantHighQualityModel',
  );
  const mech = prepareModel(
    mechGltf.scene,
    4.45,
    'lieutenantCompanionHighQualityModel',
  );
  mech.position.y = -0.7;

  const astronautMotion = createMotionController(
    astronautGltf.scene,
    astronautGltf.animations[0],
    runningAstronautGltf.animations[0],
  );
  const mechMotion = createMotionController(
    mechGltf.scene,
    mechGltf.animations[0],
    runningMechGltf.animations[0],
  );
  disposeModel(runningAstronautGltf.scene);
  disposeModel(runningMechGltf.scene);

  return {
    astronaut,
    mech,
    update(delta, moving, sprinting) {
      astronautMotion.update(delta, moving, sprinting);
      mechMotion.update(delta, moving, sprinting);
    },
    dispose() {
      astronautMotion.dispose();
      mechMotion.dispose();
      disposeModel(astronaut);
      disposeModel(mech);
    },
  };
}

export async function loadCaptainModels() {
  await MeshoptDecoder.ready;
  const [captainGltf, runningCaptainGltf, mechGltf, runningMechGltf] = await Promise.all([
    loader.loadAsync('./assets/models/captain-engineer-walk.glb'),
    loader.loadAsync('./assets/models/captain-engineer-run.glb'),
    loader.loadAsync('./assets/models/captain-mech-walk.glb'),
    loader.loadAsync('./assets/models/captain-mech-run.glb'),
  ]);

  const captain = prepareModel(
    captainGltf.scene,
    3.35,
    'captainHighQualityModel',
  );
  const mech = prepareModel(
    mechGltf.scene,
    6.15,
    'captainMechHighQualityModel',
  );
  mech.position.y = -1.1;

  const captainMotion = createMotionController(
    captainGltf.scene,
    captainGltf.animations[0],
    runningCaptainGltf.animations[0],
  );
  const mechMotion = createMotionController(
    mechGltf.scene,
    mechGltf.animations[0],
    runningMechGltf.animations[0],
  );
  disposeModel(runningCaptainGltf.scene);
  disposeModel(runningMechGltf.scene);

  return {
    captain,
    mech,
    update(delta, moving, sprinting) {
      captainMotion.update(delta, moving, sprinting);
      mechMotion.update(delta, moving, sprinting);
    },
    dispose() {
      captainMotion.dispose();
      mechMotion.dispose();
      disposeModel(captain);
      disposeModel(mech);
    },
  };
}
