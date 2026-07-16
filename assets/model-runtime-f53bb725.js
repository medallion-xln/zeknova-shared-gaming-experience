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

export async function loadEnsignModels() {
  await MeshoptDecoder.ready;
  const [engineerGltf, scoutGltf] = await Promise.all([
    loader.loadAsync('./assets/models/ensign-engineer.glb'),
    loader.loadAsync('./assets/models/ensign-support-scout.glb'),
  ]);

  const engineer = prepareModel(engineerGltf.scene, 3.35, 'ensignHighQualityModel');
  const scout = prepareModel(scoutGltf.scene, 1.8, 'ensignScoutHighQualityModel');
  scout.rotation.y = Math.PI;

  const mixer = new AnimationMixer(engineerGltf.scene);
  const action = engineerGltf.animations[0] ? mixer.clipAction(engineerGltf.animations[0]) : null;
  action?.play();
  action && (action.paused = true);

  return {
    engineer,
    scout,
    update(delta, moving, sprinting) {
      if (!action) return;
      action.paused = !moving;
      action.setEffectiveTimeScale(sprinting ? 1.35 : 0.9);
      moving && mixer.update(delta);
    },
    dispose() {
      mixer.stopAllAction();
      disposeModel(engineer);
      disposeModel(scout);
    },
  };
}

export async function loadLieutenantModels() {
  await MeshoptDecoder.ready;
  const [astronautGltf, mechGltf] = await Promise.all([
    loader.loadAsync('./assets/models/lieutenant-astronaut.glb'),
    loader.loadAsync('./assets/models/lieutenant-companion-mech.glb'),
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

  const mixer = new AnimationMixer(astronautGltf.scene);
  const action = astronautGltf.animations[0]
    ? mixer.clipAction(astronautGltf.animations[0])
    : null;
  action?.play();
  action && (action.paused = true);

  return {
    astronaut,
    mech,
    update(delta, moving, sprinting) {
      if (!action) return;
      action.paused = !moving;
      action.setEffectiveTimeScale(sprinting ? 1.45 : 1);
      moving && mixer.update(delta);
    },
    dispose() {
      mixer.stopAllAction();
      disposeModel(astronaut);
      disposeModel(mech);
    },
  };
}
