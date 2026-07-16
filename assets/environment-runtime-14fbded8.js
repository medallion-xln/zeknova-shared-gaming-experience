import { Box3, Group, Vector3 } from './vendor/three.module.min.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { MeshoptDecoder } from './vendor/meshopt_decoder.module.js';

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

const ASSETS = {
  spikyPlant: { path: './assets/models/environment/alien-spiky-plant.glb', height: 3.2, distance: 72, shadow: true },
  rockMesa: { path: './assets/models/environment/alien-rock-mesa.glb', height: 11, distance: 86, shadow: true },
  palmTree: { path: './assets/models/environment/alien-palm-tree.glb', height: 8.5, distance: 76, shadow: true },
  coralGround: { path: './assets/models/environment/alien-coral-ground.glb', height: 4.2, distance: 28, shadow: false, heavy: true },
};

function prepareModel(scene, targetHeight, castShadow) {
  const box = new Box3().setFromObject(scene);
  const size = box.getSize(new Vector3());
  scene.scale.setScalar(targetHeight / Math.max(size.y, 0.0001));
  scene.updateMatrixWorld(true);

  const scaledBox = new Box3().setFromObject(scene);
  const center = scaledBox.getCenter(new Vector3());
  scene.position.x -= center.x;
  scene.position.z -= center.z;
  scene.position.y -= scaledBox.min.y;
  scene.updateMatrixWorld(true);

  scene.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = castShadow;
    object.receiveShadow = true;
    object.frustumCulled = true;
    object.matrixAutoUpdate = true;
  });

  const root = new Group();
  root.add(scene);
  return root;
}

function disposeSharedModels(models) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();

  for (const model of models) {
    model.traverse((object) => {
      if (!object.isMesh) return;
      object.geometry && geometries.add(object.geometry);
      const list = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of list) {
        if (!material) continue;
        materials.add(material);
        for (const value of Object.values(material)) value?.isTexture && textures.add(value);
      }
    });
  }

  geometries.forEach((geometry) => geometry.dispose());
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
}

function idleTurn() {
  return new Promise((resolve) => {
    if ('requestIdleCallback' in window) window.requestIdleCallback(resolve, { timeout: 1800 });
    else window.setTimeout(resolve, 120);
  });
}

export function createAreaEnvironment({ areas, placements, heightAt, harvestableTrees = [], onAssetLoaded }) {
  const root = new Group();
  root.name = 'areaOfOperationEnvironment';
  const areaGroups = new Map();
  const sharedModels = [];
  const treeModels = [];
  let disposed = false;

  for (const area of areas) {
    const group = new Group();
    group.name = `ao-${area.id}`;
    group.userData.areaId = area.id;
    root.add(group);
    areaGroups.set(area.id, group);
  }

  async function loadAsset(assetKey) {
    const definition = ASSETS[assetKey];
    const assetPlacements = placements.filter((placement) => placement.asset === assetKey);
    const isTreeAsset = assetKey === 'palmTree' || assetKey === 'spikyPlant';
    if (!definition || (!assetPlacements.length && !isTreeAsset)) return;

    const gltf = await loader.loadAsync(definition.path);
    const base = prepareModel(gltf.scene, definition.height, definition.shadow);
    sharedModels.push(base);
    if (disposed) return;

    for (const placement of assetPlacements) {
      const instance = base.clone(true);
      const y = heightAt(placement.x, placement.z);
      instance.position.set(placement.x, y + (placement.yOffset || 0), placement.z);
      instance.rotation.y = placement.rotation || 0;
      instance.scale.setScalar(placement.scale || 1);
      instance.userData.areaId = placement.area;
      instance.userData.environmentAsset = assetKey;
      areaGroups.get(placement.area)?.add(instance);
    }

    if (isTreeAsset) {
      for (const tree of harvestableTrees) {
        const treeNumber = Number.parseInt(String(tree.userData.treeId || '').split('-').pop(), 10) || 0;
        const size = tree.userData.treeSize || 'medium';
        const usePalm = size === 'large' || (size === 'medium' && treeNumber % 2 === 0) || (size === 'small' && treeNumber % 5 === 0);
        if ((usePalm ? 'palmTree' : 'spikyPlant') !== assetKey) continue;

        const instance = base.clone(true);
        const scaleBySize = assetKey === 'palmTree'
          ? { small: 0.52, medium: 0.76, large: 1.02 }
          : { small: 0.78, medium: 1.02, large: 1.22 };
        instance.rotation.y = (treeNumber * 2.3999632297) % (Math.PI * 2);
        instance.scale.setScalar(scaleBySize[size] || 1);
        instance.userData.environmentTreeModel = true;
        tree.add(instance);
        treeModels.push({ root: tree, model: instance });
      }
    }

    onAssetLoaded?.(assetKey, assetPlacements.length + treeModels.length);
  }

  const ready = (async () => {
    await MeshoptDecoder.ready;
    const lightAssets = Object.keys(ASSETS).filter((key) => !ASSETS[key].heavy);
    const heavyAssets = Object.keys(ASSETS).filter((key) => ASSETS[key].heavy);
    await Promise.all(lightAssets.map(loadAsset));
    await idleTurn();
    const deviceMemory = Number(navigator.deviceMemory || 8);
    const cpuThreads = Number(navigator.hardwareConcurrency || 8);
    const allowHeavyProps = window.innerWidth >= 900 && deviceMemory >= 6 && cpuThreads >= 6;
    if (!disposed && allowHeavyProps) await Promise.all(heavyAssets.map(loadAsset));
  })();

  return {
    group: root,
    ready,
    update(playerPosition) {
      if (!playerPosition) return;
      for (const area of areas) {
        const group = areaGroups.get(area.id);
        if (!group) continue;
        const distance = Math.hypot(playerPosition.x - area.center.x, playerPosition.z - area.center.z);
        group.visible = distance <= area.radius + 68;
        group.traverse((object) => {
          const assetKey = object.userData.environmentAsset;
          if (!assetKey) return;
          const maxDistance = ASSETS[assetKey]?.distance ?? 70;
          object.visible = distance <= area.radius + maxDistance;
        });
      }
      for (const entry of treeModels) {
        const distance = Math.hypot(playerPosition.x - entry.root.position.x, playerPosition.z - entry.root.position.z);
        entry.model.visible = entry.root.visible && distance <= 52;
      }
    },
    dispose() {
      disposed = true;
      root.removeFromParent();
      disposeSharedModels(sharedModels);
      sharedModels.length = 0;
    },
  };
}
