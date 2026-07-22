import {
  Box3,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  OctahedronGeometry,
  Quaternion,
  TetrahedronGeometry,
  Vector3,
} from './vendor/three.module.min.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { MeshoptDecoder } from './vendor/meshopt_decoder.module.js';

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

const ASSETS = {
  spikyPlant: { path: './assets/models/environment/alien-spiky-plant.glb', height: 3.2, distance: 72, shadow: false },
  palmTree: { path: './assets/models/environment/alien-palm-tree.glb', height: 8.5, distance: 76, shadow: false },
  coralGround: { path: './assets/models/environment/alien-coral-ground.glb', height: 4.2, distance: 28, shadow: false, heavy: true },
  giantCanopyTree: { path: './assets/models/environment/giant-canopy-tree.glb', height: 12.5, distance: 46, shadow: false, heavy: true },
  tieredStonePillar: { path: './assets/models/environment/tiered-stone-pillar.glb', height: 7.5, distance: 54, shadow: false, heavy: true },
  redTrumpetFlower: { path: './assets/models/environment/red-trumpet-flower.glb', height: 1.45, distance: 34, shadow: false },
  spiralFernCluster: { path: './assets/models/environment/spiral-fern-cluster.glb', height: 1.8, distance: 38, shadow: false },
  pitcherPlantCluster: { path: './assets/models/environment/pitcher-plant-cluster.glb', height: 2.8, distance: 40, shadow: false },
  purplePodPlant: { path: './assets/models/environment/purple-pod-plant.glb', height: 3.4, distance: 42, shadow: false },
};

const ARCTIC_VILLAGE_ASSETS = [
  { key: 'arcticVillageCouncil', path: './assets/models/environment/zeknovan-village-council-arctic.glb', height: 5.8, directionX: 0, directionZ: -1, rotation: 0.18 },
  { key: 'arcticVillageShrine', path: './assets/models/environment/zeknovan-village-shrine-arctic.glb', height: 5.2, directionX: -0.866, directionZ: 0.5, rotation: 1.02 },
  { key: 'arcticVillageHabitat', path: './assets/models/environment/zeknovan-village-habitat-arctic.glb', height: 4.9, directionX: 0.866, directionZ: 0.5, rotation: -0.72 },
];

// The three structures form a triangle around a navigable central plaza. Their
// final distance is derived from the normalized GLB footprint so a wider Meshy
// export cannot silently overlap its neighbours.
const ARCTIC_VILLAGE_COURTYARD_RADIUS = 7.5;

// Share a small high-detail pool, but give each AO its own nearby tree recipe.
const TREE_ASSET_MIX = {
  forest: ['giantCanopyTree', 'palmTree', 'palmTree', 'spikyPlant'],
  desert: ['spikyPlant', 'spikyPlant', 'palmTree'],
  highlands: ['spikyPlant', 'giantCanopyTree', 'spikyPlant'],
  arctic: ['spikyPlant', 'spikyPlant'],
  wetlands: ['palmTree', 'giantCanopyTree', 'palmTree', 'spikyPlant'],
};

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function groundPoint(random, heightAt, radius = 78) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const x = (random() * 2 - 1) * radius;
    const z = (random() * 2 - 1) * radius;
    const y = heightAt(x, z);
    if (y > 0.55 && y < 16 && Math.hypot(x, z) > 12) return { x, y, z };
  }
  return null;
}

function createAmbientLife(heightAt) {
  const group = new Group();
  group.name = 'alienFlowersAndFauna';
  const random = seededRandom(0x5a454b4e);
  const flowerCount = 66;
  const matrix = new Matrix4();
  const rotation = new Quaternion();
  const position = new Vector3();
  const scale = new Vector3();
  const up = new Vector3(0, 1, 0);
  const flowerPositions = [];

  while (flowerPositions.length < flowerCount) {
    const point = groundPoint(random, heightAt);
    if (!point) break;
    flowerPositions.push({
      ...point,
      height: 0.55 + random() * 0.9,
      width: 0.65 + random() * 0.8,
      yaw: random() * Math.PI * 2,
    });
  }

  const stemGeometry = new CylinderGeometry(0.025, 0.045, 1, 5);
  const stemMaterial = new MeshStandardMaterial({ color: 0x245f55, roughness: 0.9 });
  const stems = new InstancedMesh(stemGeometry, stemMaterial, flowerPositions.length);
  stems.name = 'alienFlowerStems';
  flowerPositions.forEach((flower, index) => {
    position.set(flower.x, flower.y + flower.height * 0.5, flower.z);
    rotation.setFromAxisAngle(up, flower.yaw);
    scale.set(flower.width, flower.height, flower.width);
    matrix.compose(position, rotation, scale);
    stems.setMatrixAt(index, matrix);
  });
  stems.instanceMatrix.needsUpdate = true;
  stems.computeBoundingSphere();
  group.add(stems);

  const blossomDefinitions = [
    { geometry: new ConeGeometry(0.28, 0.62, 5), color: 0xff4fd8, emissive: 0x5b123f },
    { geometry: new OctahedronGeometry(0.3, 0), color: 0x63f7ff, emissive: 0x14556a },
    { geometry: new TetrahedronGeometry(0.34, 0), color: 0xffb84f, emissive: 0x6b3510 },
  ];
  blossomDefinitions.forEach((definition, variant) => {
    const blossoms = flowerPositions.filter((_, index) => index % blossomDefinitions.length === variant);
    const material = new MeshStandardMaterial({
      color: definition.color,
      emissive: definition.emissive,
      emissiveIntensity: 1.4,
      roughness: 0.48,
    });
    const mesh = new InstancedMesh(definition.geometry, material, blossoms.length);
    mesh.name = `alienFlowerVariant${variant + 1}`;
    blossoms.forEach((flower, index) => {
      position.set(flower.x, flower.y + flower.height + 0.12, flower.z);
      rotation.setFromAxisAngle(up, flower.yaw);
      scale.set(flower.width, 0.75 + flower.width * 0.28, 1.35 - flower.width * 0.2);
      matrix.compose(position, rotation, scale);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  });

  const fauna = [];
  const bodyGeometries = [
    new DodecahedronGeometry(0.3, 0),
    new OctahedronGeometry(0.34, 0),
    new TetrahedronGeometry(0.36, 0),
  ];
  const bodyMaterials = [
    new MeshStandardMaterial({ color: 0x77f0b7, emissive: 0x153d34, emissiveIntensity: 1.2, roughness: 0.55 }),
    new MeshStandardMaterial({ color: 0x8aa7ff, emissive: 0x202c65, emissiveIntensity: 1.25, roughness: 0.5 }),
    new MeshStandardMaterial({ color: 0xff8fe6, emissive: 0x59214d, emissiveIntensity: 1.15, roughness: 0.58 }),
  ];
  const appendageGeometry = new ConeGeometry(0.13, 0.48, 3);

  for (let index = 0; index < 9; index += 1) {
    const point = groundPoint(random, heightAt, 72);
    if (!point) continue;
    const variant = index % 3;
    const creature = new Group();
    creature.name = ['glowHopper', 'triWingMote', 'shellCrawler'][variant];
    const body = new Mesh(bodyGeometries[variant], bodyMaterials[variant]);
    body.scale.set(1 + random() * 0.45, 0.62 + random() * 0.4, 0.8 + random() * 0.55);
    body.castShadow = false;
    creature.add(body);
    const appendageCount = variant === 1 ? 3 : 2;
    for (let part = 0; part < appendageCount; part += 1) {
      const appendage = new Mesh(appendageGeometry, bodyMaterials[(variant + 1) % 3]);
      const side = part % 2 === 0 ? -1 : 1;
      appendage.position.set(side * 0.3, variant === 1 ? 0.12 : -0.18, (part - 1) * 0.18);
      appendage.rotation.z = side * (variant === 1 ? 1.15 : 0.72);
      appendage.scale.setScalar(variant === 1 ? 0.9 : 0.62);
      creature.add(appendage);
    }
    creature.position.set(point.x, point.y + 0.42, point.z);
    creature.userData.origin = point;
    creature.userData.phase = random() * Math.PI * 2;
    creature.userData.speed = 0.35 + random() * 0.6;
    creature.userData.radius = 0.45 + random() * 1.15;
    creature.userData.variant = variant;
    fauna.push(creature);
    group.add(creature);
  }

  return {
    group,
    fauna,
    update(playerPosition) {
      for (const creature of fauna) {
        const origin = creature.userData.origin;
        creature.visible = Math.hypot(playerPosition.x - origin.x, playerPosition.z - origin.z) <= 46;
      }
    },
    animate(time) {
      for (const creature of fauna) {
        if (!creature.visible) continue;
        const { origin, phase, speed, radius, variant } = creature.userData;
        const angle = time * speed + phase;
        creature.position.x = origin.x + Math.cos(angle) * radius;
        creature.position.z = origin.z + Math.sin(angle * 0.83) * radius;
        creature.position.y = origin.y + 0.35 + Math.abs(Math.sin(angle * (variant === 0 ? 2.8 : 1.7))) * (variant === 0 ? 0.42 : 0.2);
        creature.rotation.y = -angle + Math.PI * 0.5;
        if (variant === 1) creature.rotation.z = Math.sin(angle * 3.2) * 0.14;
      }
    },
  };
}

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
    object.updateMatrix();
    object.matrixAutoUpdate = false;
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

function idleTurn(delay = 2400) {
  return new Promise((resolve) => {
    window.setTimeout(() => {
      if ('requestIdleCallback' in window) window.requestIdleCallback(resolve, { timeout: 1200 });
      else resolve();
    }, delay);
  });
}

export function createAreaEnvironment({ areas, placements, heightAt, areaAt, harvestableTrees = [], updateTreeInstance, settlements = [], settlementFallbacks = [], onAssetLoaded, onVillageReady }) {
  const root = new Group();
  root.name = 'areaOfOperationEnvironment';
  const areaGroups = new Map();
  const sharedModels = [];
  const treePools = new Map();
  const treeCandidates = new Map();
  const windObjects = [];
  const villageRoots = [];
  const villageHiddenTrees = [];
  const ambientLife = createAmbientLife(heightAt);
  const arcticSettlementIndex = settlements.findIndex((center) => areaAt?.(center.x, center.z)?.id === 'arctic');
  const arcticSettlement = arcticSettlementIndex >= 0 ? settlements[arcticSettlementIndex] : null;
  const arcticFallbackObjects = arcticSettlementIndex >= 0 ? (settlementFallbacks[arcticSettlementIndex] || []) : [];
  let villageLoadPromise = null;
  let disposed = false;
  let lastTreePoolUpdateAt = 0;
  let lastTreePoolX = Number.POSITIVE_INFINITY;
  let lastTreePoolZ = Number.POSITIVE_INFINITY;
  let lastAnimationAt = 0;

  root.add(ambientLife.group);
  sharedModels.push(ambientLife.group);

  for (const area of areas) {
    const group = new Group();
    group.name = `ao-${area.id}`;
    group.userData.areaId = area.id;
    root.add(group);
    areaGroups.set(area.id, group);
  }

  function configureTreeModel(instance, tree, assetKey) {
    const treeNumber = Number.parseInt(String(tree.userData.treeId || '').split('-').pop(), 10) || 0;
    const size = tree.userData.treeSize || 'medium';
    const scaleBySize = assetKey === 'giantCanopyTree'
      ? { small: 0.58, medium: 0.7, large: 0.82 }
      : assetKey === 'palmTree'
        ? { small: 0.68, medium: 0.96, large: 1.28 }
        : { small: 1.05, medium: 1.34, large: 1.58 };
    const baseScale = scaleBySize[size] || 1;
    const heightScale = Number(tree.userData.heightScale || 1);
    const widthScale = Number(tree.userData.widthScale || 1);
    const depthScale = Number(tree.userData.depthScale || 1);
    const lean = Number(tree.userData.lean || 0);
    instance.position.set(0, 0, 0);
    instance.rotation.set(lean * 0.55, (treeNumber * 2.3999632297) % (Math.PI * 2), -lean);
    instance.scale.set(baseScale * widthScale, baseScale * heightScale, baseScale * depthScale);
    instance.userData.environmentTreeModel = true;
    instance.userData.treeVariant = Number(tree.userData.treeVariant ?? treeNumber % 8);
    instance.userData.windBaseRotationX = instance.rotation.x;
    instance.userData.windBaseRotationZ = instance.rotation.z;
    instance.userData.windPhase = treeNumber * 1.61803398875;
    if (assetKey === 'giantCanopyTree') tree.userData.highDetailCollisionRadius = 0.72;
  }

  function areaForTree(tree) {
    const directArea = areaAt?.(tree.position.x, tree.position.z);
    if (directArea) return directArea;
    let nearest = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const area of areas) {
      const distance = Math.abs(tree.position.x - area.center.x);
      if (distance < nearestDistance) {
        nearest = area;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  function treeAssetFor(tree) {
    const treeNumber = Number.parseInt(String(tree.userData.treeId || '').split('-').pop(), 10) || 0;
    const variant = Number(tree.userData.treeVariant ?? treeNumber % 8);
    const mix = TREE_ASSET_MIX[areaForTree(tree)?.id] || ['palmTree', 'spikyPlant'];
    let assetKey = mix[variant % mix.length];
    if (assetKey === 'giantCanopyTree' && tree.userData.treeSize !== 'large') {
      assetKey = mix.find((candidate) => candidate !== 'giantCanopyTree') || 'spikyPlant';
    }
    return assetKey;
  }

  async function loadAsset(assetKey) {
    const definition = ASSETS[assetKey];
    const assetPlacements = placements.filter((placement) => placement.asset === assetKey);
    const isTreeAsset = assetKey === 'palmTree' || assetKey === 'spikyPlant' || assetKey === 'giantCanopyTree';
    if (!definition || (!assetPlacements.length && !isTreeAsset)) return;

    const gltf = await loader.loadAsync(definition.path);
    const base = prepareModel(gltf.scene, definition.height, definition.shadow);
    if (disposed) {
      disposeSharedModels([base]);
      return;
    }
    sharedModels.push(base);

    for (const placement of assetPlacements) {
      const instance = base.clone(true);
      const y = heightAt(placement.x, placement.z);
      instance.position.set(placement.x, y + (placement.yOffset || 0), placement.z);
      instance.rotation.y = placement.rotation || 0;
      instance.scale.setScalar(placement.scale || 1);
      instance.userData.areaId = placement.area;
      instance.userData.environmentAsset = assetKey;
      if (!['tieredStonePillar', 'coralGround'].includes(assetKey)) {
        instance.userData.windBaseRotationX = instance.rotation.x;
        instance.userData.windBaseRotationZ = instance.rotation.z;
        instance.userData.windPhase = (placement.x * 0.37 + placement.z * 0.61) % (Math.PI * 2);
        instance.userData.windStrength = assetKey === 'giantCanopyTree' || assetKey === 'palmTree' ? 0.035 : 0.075;
        windObjects.push(instance);
      }
      areaGroups.get(placement.area)?.add(instance);
    }

    if (isTreeAsset) {
      const candidates = harvestableTrees.filter((tree) => treeAssetFor(tree) === assetKey);
      const pool = [];
      const poolSize = assetKey === 'giantCanopyTree' ? 3 : 8;
      for (let index = 0; index < poolSize; index += 1) {
        const instance = base.clone(true);
        instance.visible = false;
        pool.push({ model: instance, currentRoot: null });
      }
      treePools.set(assetKey, pool);
      treeCandidates.set(assetKey, candidates);
      onAssetLoaded?.(assetKey, assetPlacements.length + pool.length);
    } else {
      onAssetLoaded?.(assetKey, assetPlacements.length);
    }
  }

  async function loadArcticVillage() {
    if (!arcticSettlement || disposed) return;
    const prepared = [];
    try {
      await MeshoptDecoder.ready;
      for (const definition of ARCTIC_VILLAGE_ASSETS) {
        if (disposed) {
          disposeSharedModels(prepared);
          return;
        }
        const gltf = await loader.loadAsync(definition.path);
        if (disposed) {
          disposeSharedModels(prepared);
          return;
        }
        const model = prepareModel(gltf.scene, definition.height, true);
        model.name = definition.key;
        model.userData.areaId = 'arctic';
        model.userData.environmentAsset = definition.key;
        model.userData.arcticVillage = true;
        const bounds = new Box3().setFromObject(model);
        const size = bounds.getSize(new Vector3());
        const footprintRadius = Math.max(2.2, Math.min(8, Math.hypot(size.x, size.z) * 0.5));
        const slotDistance = ARCTIC_VILLAGE_COURTYARD_RADIUS + footprintRadius + 1;
        const x = arcticSettlement.x + definition.directionX * slotDistance;
        const z = arcticSettlement.z + definition.directionZ * slotDistance;
        model.position.set(
          x,
          heightAt(x, z) - 0.14,
          z,
        );
        model.rotation.y = definition.rotation;
        model.userData.collisionRadius = Math.max(1.8, Math.min(5.5, Math.min(size.x, size.z) * 0.4));
        model.userData.footprint = { width: size.x, depth: size.z };
        model.userData.footprintRadius = footprintRadius;
        prepared.push(model);
        await idleTurn(700);
      }
      if (disposed) {
        disposeSharedModels(prepared);
        return;
      }
      const arcticGroup = areaGroups.get('arctic');
      for (const model of prepared) {
        arcticGroup?.add(model);
        sharedModels.push(model);
        villageRoots.push(model);
      }
      // Preserve a clear courtyard and approach lanes. These protected trees
      // are restored if the upgraded village is ever disposed or fails over.
      for (const tree of harvestableTrees) {
        const inCourtyard = Math.hypot(tree.position.x - arcticSettlement.x, tree.position.z - arcticSettlement.z) <= ARCTIC_VILLAGE_COURTYARD_RADIUS + 1.5;
        const inStructure = villageRoots.some((model) => Math.hypot(tree.position.x - model.position.x, tree.position.z - model.position.z) <= Number(model.userData.footprintRadius || 3) + 1.5);
        if (!tree.visible || (!inCourtyard && !inStructure)) continue;
        tree.visible = false;
        villageHiddenTrees.push(tree);
        updateTreeInstance?.(tree);
      }
      for (const fallback of arcticFallbackObjects) fallback.visible = false;
      onVillageReady?.(villageRoots.map((model) => ({
        x: model.position.x,
        z: model.position.z,
        radius: Number(model.userData.collisionRadius || 2.5),
        kind: model.name,
      })));
      console.info(`ZekNova Arctic village replaced ${arcticFallbackObjects.length} procedural pieces with ${villageRoots.length} optimized structures and conservative collision proxies.`);
      onAssetLoaded?.('arcticVillage', villageRoots.length);
    } catch (error) {
      disposeSharedModels(prepared);
      console.warn('ZekNova Arctic village upgrade unavailable; procedural settlement remains active.', error);
    }
  }

  const ready = (async () => {
    await MeshoptDecoder.ready;
    // Keep GLTF decoding serialized. Loading several Meshy scenes together can
    // briefly multiply texture, geometry, and decoder memory in the browser.
    for (const assetKey of ['palmTree', 'spikyPlant']) {
      if (disposed) return;
      await loadAsset(assetKey);
      await idleTurn();
    }
    await idleTurn();
    if (!disposed) await loadAsset('giantCanopyTree');
    await idleTurn();
    if (!disposed) await loadAsset('redTrumpetFlower');
    await idleTurn();
    if (!disposed) await loadAsset('spiralFernCluster');
    await idleTurn();
    if (!disposed) await loadAsset('pitcherPlantCluster');
    await idleTurn();
    if (!disposed) await loadAsset('purplePodPlant');
  })();

  return {
    group: root,
    ready,
    update(playerPosition) {
      if (!playerPosition) return;
      if (arcticSettlement && !villageLoadPromise && Math.hypot(playerPosition.x - arcticSettlement.x, playerPosition.z - arcticSettlement.z) <= 52) {
        villageLoadPromise = ready.then(() => disposed ? undefined : loadArcticVillage());
      }
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
      const now = performance.now();
      const treePoolMoved = Math.hypot(playerPosition.x - lastTreePoolX, playerPosition.z - lastTreePoolZ) >= 3.5;
      const refreshTreePools = treePoolMoved || now - lastTreePoolUpdateAt >= 1400;
      if (refreshTreePools) for (const [assetKey, pool] of treePools) {
        const nearest = (treeCandidates.get(assetKey) || [])
          .filter((tree) => tree.visible && !tree.userData.falling)
          .map((tree) => ({
            tree,
            distance: Math.hypot(playerPosition.x - tree.position.x, playerPosition.z - tree.position.z),
          }))
          .filter((entry) => entry.distance <= 52)
          .sort((a, b) => a.distance - b.distance)
          .slice(0, pool.length);
        const selected = new Set(nearest.map((entry) => entry.tree));

        for (const entry of pool) {
          if (!entry.currentRoot || selected.has(entry.currentRoot)) continue;
          entry.currentRoot.remove(entry.model);
          entry.currentRoot.userData.highDetailAttached = false;
          if (assetKey === 'giantCanopyTree') delete entry.currentRoot.userData.highDetailCollisionRadius;
          updateTreeInstance?.(entry.currentRoot);
          entry.currentRoot = null;
          entry.model.visible = false;
        }

        const assigned = new Set(pool.map((entry) => entry.currentRoot).filter(Boolean));
        for (const nearestEntry of nearest) {
          if (assigned.has(nearestEntry.tree)) continue;
          const freeEntry = pool.find((entry) => !entry.currentRoot);
          if (!freeEntry) break;
          configureTreeModel(freeEntry.model, nearestEntry.tree, assetKey);
          nearestEntry.tree.add(freeEntry.model);
          nearestEntry.tree.userData.highDetailAttached = true;
          updateTreeInstance?.(nearestEntry.tree);
          freeEntry.currentRoot = nearestEntry.tree;
          freeEntry.model.visible = true;
          assigned.add(nearestEntry.tree);
        }

        for (const entry of pool) entry.model.visible = !!entry.currentRoot?.visible;
      }
      if (refreshTreePools) {
        lastTreePoolUpdateAt = now;
        lastTreePoolX = playerPosition.x;
        lastTreePoolZ = playerPosition.z;
      }
      ambientLife.update(playerPosition);
      for (const model of villageRoots) {
        model.visible = Math.hypot(playerPosition.x - model.position.x, playerPosition.z - model.position.z) <= 64;
      }
    },
    animate(time) {
      if (time - lastAnimationAt < 1 / 30) return;
      lastAnimationAt = time;
      ambientLife.animate(time);
      const gust = 0.58 + Math.sin(time * 0.23 + Math.sin(time * 0.071) * 2.4) * 0.26 + Math.sin(time * 0.67) * 0.12;
      const crosswind = Math.sin(time * 0.13) * 0.35;
      for (const object of windObjects) {
        if (!object.visible) continue;
        const phase = Number(object.userData.windPhase ?? 0);
        const strength = Number(object.userData.windStrength ?? 0.05);
        object.rotation.z = Number(object.userData.windBaseRotationZ ?? 0) + Math.sin(time * 1.45 + phase) * strength * gust;
        object.rotation.x = Number(object.userData.windBaseRotationX ?? 0) + Math.sin(time * 0.92 + phase * 0.73) * strength * crosswind;
      }
      for (const pool of treePools.values()) {
        for (const entry of pool) {
          if (!entry.currentRoot || !entry.model.visible) continue;
          const phase = Number(entry.model.userData.windPhase ?? 0);
          entry.model.rotation.z = Number(entry.model.userData.windBaseRotationZ ?? 0) + Math.sin(time * 1.08 + phase) * 0.032 * gust;
          entry.model.rotation.x = Number(entry.model.userData.windBaseRotationX ?? 0) + Math.sin(time * 0.79 + phase * 0.6) * 0.018 * gust;
        }
      }
    },
    dispose() {
      disposed = true;
      for (const pool of treePools.values()) {
        for (const entry of pool) {
          if (!entry.currentRoot) continue;
          entry.currentRoot.remove(entry.model);
          entry.currentRoot.userData.highDetailAttached = false;
          delete entry.currentRoot.userData.highDetailCollisionRadius;
          updateTreeInstance?.(entry.currentRoot);
          entry.currentRoot = null;
        }
      }
      treePools.clear();
      treeCandidates.clear();
      for (const tree of villageHiddenTrees) {
        tree.visible = true;
        updateTreeInstance?.(tree);
      }
      villageHiddenTrees.length = 0;
      for (const fallback of arcticFallbackObjects) fallback.visible = true;
      root.removeFromParent();
      disposeSharedModels(sharedModels);
      sharedModels.length = 0;
    },
  };
}
