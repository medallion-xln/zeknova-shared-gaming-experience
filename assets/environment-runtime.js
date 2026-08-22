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
import { KTX2Loader } from './vendor/KTX2Loader.bundle.js';
import { MeshoptDecoder } from './vendor/meshopt_decoder.module.js';
import { originalModelPath, resolveModelLodPath } from './model-lod-manifest.js';

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const ktx2Loader = new KTX2Loader().setTranscoderPath('./assets/vendor/basis/');
let ktx2Configured = false;

function configureKtx2Loader() {
  const renderer = globalThis.ZekNovaGame?.renderer;
  if (!renderer || ktx2Configured) return;
  ktx2Loader.detectSupport(renderer);
  loader.setKTX2Loader(ktx2Loader);
  ktx2Configured = true;
}

async function loadEnvironmentGlb(path) {
  configureKtx2Loader();
  const selectedPath = resolveModelLodPath(path);
  const sourcePath = originalModelPath(path);
  try {
    return await loader.loadAsync(selectedPath);
  } catch (error) {
    if (selectedPath === sourcePath) throw error;
    console.warn(`ZekNova environment LOD ${selectedPath} was unavailable; loading its source model.`, error);
    return loader.loadAsync(sourcePath);
  }
}

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

// All checked-in static environment meshes participate in the live world. Loading
// remains serialized and visibility remains distance-managed, but no landmark,
// village kit, or ground mesh is retired solely because it is classified as heavy.
const STATIC_MESH_ASSETS_ENABLED = true;

// Meshy supplied these as dense sculpted ground tiles. The checked-in copies
// are simplified, Meshopt-compressed variants with WebP PBR textures. Only a
// small pool surrounding the player is rendered, so the Desert gains close-up
// detail without drawing a full 36x180 world-space carpet every frame.
const DESERT_GROUND_TILE_ASSETS = [
  { key: 'sunCrackedSandstone', path: './assets/models/environment/desert-ground/sun-cracked-sandstone.glb' },
  { key: 'rootBoundPath', path: './assets/models/environment/desert-ground/root-bound-path.glb' },
  { key: 'dryVineGround', path: './assets/models/environment/desert-ground/dry-vine-ground.glb' },
  { key: 'wovenMosaic', path: './assets/models/environment/desert-ground/woven-mosaic.glb' },
];
// Ground tiles form a continuous Desert skin. Every placement is sampled from the
// live heightfield and aligned to its local normal so the material follows dunes
// instead of reading as a flat pavement layer.
const DESERT_GROUND_TILES_ENABLED = true;
// Tiles are flat rigid quads, so their size is bounded by how much the dunes curve
// across one tile. Measured against the live heightfield, an 8.4m tile misses the
// ground by ~1.07m at the median corner; 3.5m brings that to ~0.21m.
const DESERT_GROUND_TILE_SIZE = 3;
// Instanced, so a larger pool costs instances rather than draw calls. Raised to keep
// ground coverage roughly constant now that each tile covers less area.
const DESERT_GROUND_POOL_CAPACITY = 256;
// How far a tile may wander from its grid slot, as a fraction of the grid step.
const DESERT_GROUND_JITTER_FRACTION = 0.08;
// Continuous coverage is intentional: neighbouring tiles overlap slightly so the
// Desert surface reaches end-to-end without exposing the base terrain at seams.
const DESERT_GROUND_SKIP_CHANCE = 0;
const CORNER_OFFSETS = [[-1, -1], [1, -1], [-1, 1], [1, 1]];

// Forest settlement kit. Arranged as an inner ring of dwellings/workshops and an
// outer ring of smaller service props, so the settlement reads as a village rather
// than a circle of identical huts. `height` normalises each model's world scale.
const FOREST_VILLAGE_ASSETS = [
  { key: 'forestElderTreeHouse', path: './assets/models/environment/forest-village/elder-tree-house.glb', height: 8.4, ring: 0, shadow: true },
  { key: 'forestDwelling', path: './assets/models/environment/forest-village/forest-dwelling.glb', height: 5.4, ring: 0, shadow: true },
  { key: 'forestMarketPavilion', path: './assets/models/environment/forest-village/village-market-pavilion.glb', height: 5.8, ring: 0, shadow: true },
  { key: 'forestArtisanWorkshop', path: './assets/models/environment/forest-village/artisan-workshop.glb', height: 5.2, ring: 0, shadow: true },
  { key: 'forestHerbalistHut', path: './assets/models/environment/forest-village/herbalist-hut.glb', height: 5.0, ring: 0, shadow: true },
  { key: 'forestBakeryOven', path: './assets/models/environment/forest-village/village-bakery-oven.glb', height: 3.4, ring: 1, shadow: true },
  { key: 'forestCraftingStation', path: './assets/models/environment/forest-village/outdoor-crafting-station.glb', height: 2.8, ring: 1, shadow: true },
  { key: 'forestCommunityWell', path: './assets/models/environment/forest-village/community-well.glb', height: 2.6, ring: 1, shadow: true },
  { key: 'forestGardenBridge', path: './assets/models/environment/forest-village/stone-garden-bridge.glb', height: 2.2, ring: 1, shadow: false },
  { key: 'forestBanner', path: './assets/models/environment/forest-village/decorative-banner.glb', height: 4.2, ring: 1, shadow: false },
];
// Courtyard kept clear of trees at the village centre.
const FOREST_VILLAGE_COURTYARD_RADIUS = 5.5;
// The forest band is narrow east-west (roughly x -90..-54) and long north-south, so
// structures are distributed on an ellipse matching that shape. A circular ring
// collapsed the outer structures into two pockets due north and due south, because
// those were the only bearings that stayed on forest ground.
const FOREST_VILLAGE_RING_X = [12, 15];
const FOREST_VILLAGE_RING_Z = [18, 40];
// Minimum clear gap between two structures, on top of both their footprints.
const FOREST_VILLAGE_MIN_GAP = 3;
// Playable world half-extent. Region centres run -72..+72 with radius 18, so the
// terrain ends near +/-90; keep structures inside this to avoid the void.
const WORLD_HALF_EXTENT = 84;
function clampToWorld(value) {
  return Math.max(-WORLD_HALF_EXTENT, Math.min(WORLD_HALF_EXTENT, value));
}

const ARCTIC_VILLAGE_ASSETS = [
  { key: 'arcticVillageCouncil', path: './assets/models/environment/zeknovan-village-council-arctic.glb', height: 5.8, directionX: 0, directionZ: -1, rotation: 0.18, shadow: true },
  { key: 'arcticVillageShrine', path: './assets/models/environment/zeknovan-village-shrine-arctic.glb', height: 5.2, directionX: -0.866, directionZ: 0.5, rotation: 1.02, shadow: true },
  { key: 'arcticVillageHabitat', path: './assets/models/environment/zeknovan-village-habitat-arctic.glb', height: 4.9, directionX: 0.866, directionZ: 0.5, rotation: -0.72, shadow: true },
];

const INSTANCE_ASSET_KEYS = new Set([
  'tieredStonePillar',
  'coralGround',
  'redTrumpetFlower',
  'spiralFernCluster',
  'pitcherPlantCluster',
  'purplePodPlant',
]);

// The source GLB is a complete 24-piece village kit. Each object is exported
// separately so Forest and Desert can stream their settlements instead of
// decoding the original 1.5-million-triangle scene. Woodland, garden, water,
// and bridge pieces belong to Forest; shade, trade, and shelter pieces belong
// to Desert. Offsets deliberately leave navigable lanes between structures.
const VILLAGE_KIT_ASSETS = [
  { key: 'gardenStand', biome: 'forest', file: 'garden-stand.glb', height: 2.0, x: -10, z: -6, rotation: 0.28, radius: 1.35 },
  { key: 'sacredShrub', biome: 'forest', file: 'sacred-shrub.glb', height: 1.35, x: 8, z: -8, rotation: -0.44, radius: 0 },
  { key: 'canopyTreehouse', biome: 'forest', file: 'canopy-treehouse.glb', height: 7.4, x: 0, z: 0, rotation: 0.12, radius: 3.0, shadow: true },
  { key: 'sacredGarden', biome: 'forest', file: 'sacred-garden.glb', height: 1.0, x: 10, z: 4, rotation: 1.08, radius: 0 },
  { key: 'mossCottage', biome: 'forest', file: 'moss-cottage.glb', height: 4.6, x: -10, z: 5, rotation: -0.74, radius: 2.15, shadow: true },
  { key: 'boneRailing', biome: 'forest', file: 'bone-railing.glb', height: 1.1, x: -15, z: 0, rotation: 0.15, radius: 0 },
  { key: 'villageHearth', biome: 'forest', file: 'village-hearth.glb', height: 1.55, x: 0, z: 10, rotation: 0, radius: 0 },
  { key: 'roundMarketHut', biome: 'forest', file: 'round-market-hut.glb', height: 4.4, x: 10, z: 12, rotation: 0.45, radius: 2.25, shadow: true },
  { key: 'hangingWaypost', biome: 'forest', file: 'hanging-waypost.glb', height: 4.0, x: -15, z: -7, rotation: -0.2, radius: 0.45 },
  { key: 'waterStation', biome: 'forest', file: 'water-station.glb', height: 3.0, x: 14, z: -4, rotation: 0.45, radius: 1.35, waterAdjacent: true },
  { key: 'archedBridge', biome: 'forest', file: 'arched-bridge.glb', height: 2.35, x: -4, z: 0, rotation: 0, radius: 0, bridge: true, shadow: true },
  { key: 'timberWalkwayA', biome: 'forest', file: 'timber-walkway-a.glb', height: 0.48, x: -5, z: 15, rotation: 0.4, radius: 0 },
  { key: 'timberWalkwayB', biome: 'forest', file: 'timber-walkway-b.glb', height: 0.48, x: 5, z: 16, rotation: -0.5, radius: 0 },

  // Highlands trade settlement. These static pieces were exported from the same
  // village kit but were previously left unreferenced. They now form a dispersed
  // civic and supply district along the north/south length of the Highlands band.
  { key: 'highlandsSupplyTable', biome: 'highlands', file: 'supply-table.glb', height: 1.35, x: -10, z: -14, rotation: 0.2, radius: 0.8 },
  { key: 'highlandsTradeSupplies', biome: 'highlands', file: 'trade-supplies.glb', height: 1.2, x: 8, z: -15, rotation: -0.6, radius: 0 },
  { key: 'highlandsProvisionSacks', biome: 'highlands', file: 'provision-sacks.glb', height: 1.0, x: -6, z: -25, rotation: 0.8, radius: 0 },
  { key: 'highlandsPotteryTable', biome: 'highlands', file: 'pottery-table.glb', height: 1.45, x: 11, z: -27, rotation: -0.25, radius: 0.8 },
  { key: 'highlandsVillageBanner', biome: 'highlands', file: 'village-banner.glb', height: 4.4, x: 0, z: -34, rotation: 0.1, radius: 0.45 },
  { key: 'highlandsShadeCanopy', biome: 'highlands', file: 'shade-canopy.glb', height: 4.6, x: -11, z: 10, rotation: 0.65, radius: 2.0, shadow: true },
  { key: 'highlandsLeafShelter', biome: 'highlands', file: 'leaf-shelter.glb', height: 3.8, x: 10, z: 11, rotation: -0.7, radius: 1.8, shadow: true },
  { key: 'highlandsSeedPodHut', biome: 'highlands', file: 'seed-pod-hut.glb', height: 4.2, x: -8, z: 25, rotation: 0.35, radius: 2.0, shadow: true },
  { key: 'highlandsTradePavilion', biome: 'highlands', file: 'trade-pavilion.glb', height: 4.8, x: 9, z: 27, rotation: -0.15, radius: 2.2, shadow: true },
  { key: 'highlandsBoundaryPole', biome: 'highlands', file: 'boundary-pole.glb', height: 4.0, x: -12, z: 37, rotation: 0, radius: 0.4 },
  { key: 'highlandsOvalAwning', biome: 'highlands', file: 'oval-awning.glb', height: 3.5, x: 11, z: 39, rotation: 0.5, radius: 1.7, shadow: true },

  // Desert settlement. Replaces the original low-detail prop kit with high-quality
  // structures. Offsets are relative to the Desert region centre (-36, 0); x stays
  // within +/-14 so everything remains inside the desert band (x -54..-18), while z
  // spreads +/-34 along the band so the settlement reads as a town, not a huddle.
  { key: 'elderCommunalDome', biome: 'desert', dir: 'desert-village', file: 'elder-communal-dome.glb', height: 6.5, x: 0, z: 0, rotation: 0.2, radius: 2.6, shadow: true },
  { key: 'sanctuaryDome', biome: 'desert', dir: 'desert-village', file: 'sanctuary-dome.glb', height: 5.5, x: -12, z: -8, rotation: 0.9, radius: 2.3, shadow: true },
  { key: 'sandstoneDomeDwelling', biome: 'desert', dir: 'desert-village', file: 'sandstone-dome-dwelling.glb', height: 4.6, x: 11, z: -7, rotation: -0.6, radius: 2.1, shadow: true },
  { key: 'desertMarketPavilion', biome: 'desert', dir: 'desert-village', file: 'desert-market-pavilion.glb', height: 5.2, x: -2, z: 12, rotation: Math.PI, radius: 2.5, shadow: true },
  { key: 'communalOven', biome: 'desert', dir: 'desert-village', file: 'communal-oven.glb', height: 3.0, x: 12, z: 9, rotation: 0.45, radius: 1.5 },
  { key: 'beaconWatchtower', biome: 'desert', dir: 'desert-village', file: 'beacon-watchtower.glb', height: 8.5, x: -13, z: 24, rotation: 0.15, radius: 1.6, shadow: true },
  { key: 'windCatcherSail', biome: 'desert', dir: 'desert-village', file: 'wind-catcher-sail.glb', height: 6.5, x: 9, z: 26, rotation: -0.8, radius: 1.4 },
  { key: 'waterCollectorTower', biome: 'desert', dir: 'desert-village', file: 'water-collector-tower.glb', height: 7.0, x: -11, z: -24, rotation: 0.5, radius: 1.6, shadow: true },
  { key: 'crystalEnergyArray', biome: 'desert', dir: 'desert-village', file: 'crystal-energy-array.glb', height: 4.5, x: 10, z: -25, rotation: -0.3, radius: 1.9 },
  { key: 'mineEntrance', biome: 'desert', dir: 'desert-village', file: 'mine-entrance.glb', height: 4.0, x: -14, z: -34, rotation: 1.1, radius: 2.2, shadow: true },
  { key: 'crystalHarvestingRig', biome: 'desert', dir: 'desert-village', file: 'crystal-harvesting-rig.glb', height: 5.0, x: 13, z: 34, rotation: -1.2, radius: 2.0, shadow: true },

  // Wetlands settlement. Offsets are relative to the Wetlands centre (72, 0); x stays
  // within +/-14 so everything remains inside the wetlands band (x 54..90). The
  // water-dependent structures use `waterAdjacent`, which snaps them to the river
  // channel and requires open water within 6 units; the rest spread inland along z.
  // bankOffset alternates north/south of the river channel at varying distances so
  // the riverside structures form a settlement along both banks rather than a row.
  { key: 'wetlandsBoatDock', biome: 'wetlands', dir: 'wetlands-village', file: 'boat-dock.glb', height: 2.6, x: -14, z: 0, rotation: 0.1, radius: 1.5, waterAdjacent: true, bankOffset: 4.5 },
  { key: 'wetlandsFishingHutPier', biome: 'wetlands', dir: 'wetlands-village', file: 'fishing-hut-pier.glb', height: 4.2, x: -5, z: 0, rotation: -0.4, radius: 1.8, waterAdjacent: true, bankOffset: -6.5, shadow: true },
  { key: 'wetlandsWaterWheelMill', biome: 'wetlands', dir: 'wetlands-village', file: 'water-wheel-mill.glb', height: 6.0, x: 4, z: 0, rotation: 0.6, radius: 2.2, waterAdjacent: true, bankOffset: 8, shadow: true },
  { key: 'wetlandsSmallDam', biome: 'wetlands', dir: 'wetlands-village', file: 'small-dam.glb', height: 3.4, x: 12, z: 0, rotation: 0, radius: 2.4, waterAdjacent: true, bankOffset: -5 },
  { key: 'wetlandsCanalLockSluice', biome: 'wetlands', dir: 'wetlands-village', file: 'canal-lock-sluice.glb', height: 3.8, x: -9, z: 0, rotation: 0.25, radius: 2.0, waterAdjacent: true, bankOffset: -11 },
  // Inland structures, spread well off the channel to break up the waterline.
  { key: 'wetlandsStiltDwelling', biome: 'wetlands', dir: 'wetlands-village', file: 'stilt-dwelling.glb', height: 5.6, x: -12, z: -24, rotation: 0.85, radius: 2.0, shadow: true },
  { key: 'wetlandsReedLilyPadGarden', biome: 'wetlands', dir: 'wetlands-village', file: 'reed-lily-pad-garden.glb', height: 1.6, x: 10, z: 23, rotation: -0.7, radius: 0 },
  { key: 'wetlandsLanternPost', biome: 'wetlands', dir: 'wetlands-village', file: 'wetland-lantern-post.glb', height: 4.0, x: -6, z: 34, rotation: 1.15, radius: 0.5 },
].map((definition) => ({
  ...definition,
  path: `./assets/models/environment/${definition.dir || 'village-kit'}/${definition.file}`,
  distance: definition.bridge ? 72 : 58,
  shadow: Boolean(definition.shadow),
}));

// Kit anchors are offsets from their region centre. The Desert kit used to sit at
// z +30 - well outside the Desert AO's radius of 18 - which pushed its props up to
// 51 units north and drifted the western ones onto the Forest boundary at x -54.
// It is now anchored inside its own region and nudged east, away from the Forest.
const VILLAGE_KIT_ANCHOR_Z = {
  forest: -30,
  // The desert and wetlands structures carry their own spread offsets relative to
  // their region centre, so no extra anchor shift is applied.
  desert: 0,
  wetlands: 0,
  highlands: 0,
};
const VILLAGE_KIT_ANCHOR_X = {
  desert: 0,
  wetlands: 0,
  highlands: 0,
};

const VILLAGE_KIT_BIOMES = new Set(['forest', 'desert', 'highlands', 'wetlands']);

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
    object.castShadow = false;
    object.userData.shadowEligible = Boolean(castShadow);
    object.receiveShadow = true;
    object.frustumCulled = true;
    object.updateMatrix();
    object.matrixAutoUpdate = false;
  });

  const root = new Group();
  root.add(scene);
  return root;
}

function prepareGroundTileModel(scene, targetSize = DESERT_GROUND_TILE_SIZE) {
  const box = new Box3().setFromObject(scene);
  const size = box.getSize(new Vector3());
  const horizontalScale = targetSize / Math.max(size.x, size.z, 0.0001);
  // Preserve the relief but prevent a Meshy ground slab from becoming a wall
  // after its horizontal footprint is expanded to world-tile dimensions.
  const verticalScale = 0.16 / Math.max(size.y, 0.0001);
  scene.scale.set(horizontalScale, verticalScale, horizontalScale);
  scene.updateMatrixWorld(true);

  const scaledBox = new Box3().setFromObject(scene);
  const center = scaledBox.getCenter(new Vector3());
  scene.position.x -= center.x;
  scene.position.z -= center.z;
  scene.position.y -= scaledBox.min.y;
  scene.updateMatrixWorld(true);

  scene.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = false;
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

export function createAreaEnvironment({
  areas,
  placements,
  heightAt,
  areaAt,
  isWaterAt = () => false,
  riverCenterAt = () => 0,
  bridgeRotationAt = () => 0,
  harvestableTrees = [],
  updateTreeInstance,
  settlements = [],
  settlementFallbacks = [],
  onAssetLoaded,
  onVillageReady,
}) {
  const root = new Group();
  root.name = 'areaOfOperationEnvironment';
  const areaGroups = new Map();
  const visibilityBuckets = new Map();
  const visibilityState = new Map();
  const sharedModels = [];
  const treePools = new Map();
  const treeCandidates = new Map();
  const windObjects = [];
  const shadowRoots = [];
  const villageRoots = [];
  const villageKitRoots = [];
  const villageKitLoadPromises = new Map();
  const villageKitOccupied = new Map();
  const villageHiddenTrees = [];
  const desertGroundRoot = new Group();
  desertGroundRoot.name = 'desertGroundDetailTiles';
  desertGroundRoot.visible = false;
  const desertGroundPools = new Map();
  let desertGroundPlacements = [];
  let desertGroundLoadPromise = null;
  let desertGroundLoaded = false;
  let desertGroundActiveCount = 0;
  let lastDesertGroundX = Number.POSITIVE_INFINITY;
  let lastDesertGroundZ = Number.POSITIVE_INFINITY;
  const lastDesertPlayerPosition = new Vector3();
  const ambientLife = createAmbientLife(heightAt);
  const arcticSettlementIndex = settlements.findIndex((center) => areaAt?.(center.x, center.z)?.id === 'arctic');
  const arcticSettlement = arcticSettlementIndex >= 0 ? settlements[arcticSettlementIndex] : null;
  const arcticFallbackObjects = arcticSettlementIndex >= 0 ? (settlementFallbacks[arcticSettlementIndex] || []) : [];
  const forestSettlementIndex = settlements.findIndex((center) => areaAt?.(center.x, center.z)?.id === 'forest');
  // The generated world does not always place a settlement inside the Forest AO, so
  // fall back to the region centre and let the village define the settlement itself.
  const forestArea = areas.find((area) => area.id === 'forest') || null;
  const forestSettlement = forestSettlementIndex >= 0
    ? settlements[forestSettlementIndex]
    : (forestArea ? { x: forestArea.center.x, z: forestArea.center.z } : null);
  const forestFallbackObjects = forestSettlementIndex >= 0 ? (settlementFallbacks[forestSettlementIndex] || []) : [];
  let villageLoadPromise = null;
  let forestVillageLoadPromise = null;
  let disposed = false;
  let lastTreePoolUpdateAt = 0;
  let lastTreePoolX = Number.POSITIVE_INFINITY;
  let lastTreePoolZ = Number.POSITIVE_INFINITY;
  let lastAnimationAt = 0;
  let qualityTier = ['low', 'balanced', 'high'].includes(globalThis.ZekNovaGame?.graphicsQuality)
    ? globalThis.ZekNovaGame.graphicsQuality
    : 'balanced';
  let animationInterval = 1 / 24;
  let lastShadowUpdateAt = 0;
  let lastShadowX = Number.POSITIVE_INFINITY;
  let lastShadowZ = Number.POSITIVE_INFINITY;
  const eagerVillageKit = STATIC_MESH_ASSETS_ENABLED
    || new URLSearchParams(window.location.search).has('qaVillageKit');

  root.add(ambientLife.group);
  root.add(desertGroundRoot);
  sharedModels.push(ambientLife.group);

  for (const area of areas) {
    const group = new Group();
    group.name = `ao-${area.id}`;
    group.userData.areaId = area.id;
    root.add(group);
    areaGroups.set(area.id, group);
    visibilityBuckets.set(area.id, new Map());
  }

  function registerDistanceObject(areaId, object, maxDistance) {
    const areaBuckets = visibilityBuckets.get(areaId);
    if (!areaBuckets || !object) return;
    const distance = Math.round(Number(maxDistance) || 70);
    if (!areaBuckets.has(distance)) areaBuckets.set(distance, new Set());
    areaBuckets.get(distance).add(object);
  }

  function registerShadowRoot(model) {
    if (!model) return;
    let eligible = false;
    model.traverse((object) => {
      if (object.isMesh && object.userData.shadowEligible) eligible = true;
    });
    if (eligible) shadowRoots.push({ model, active: false });
  }

  function buildDesertGroundPlacements() {
    const desert = areas.find((area) => area.id === 'desert');
    if (!desert) return [];
    const placements = [];
    const random = seededRandom(0x44534552);
    // Overlap neighbours so tile seams sit under adjacent tiles instead of forming
    // continuous straight lines across the dunes.
    const step = DESERT_GROUND_TILE_SIZE * 0.84;
    const jitter = step * DESERT_GROUND_JITTER_FRACTION;
    const minX = desert.center.x - desert.radius + step * 0.48;
    const maxX = desert.center.x + desert.radius - step * 0.48;
    for (let x = minX, column = 0; x <= maxX + 0.01; x += step, column += 1) {
      for (let z = -78 + step * 0.5, row = 0; z <= 78 - step * 0.5; z += step, row += 1) {
        if (random() < DESERT_GROUND_SKIP_CHANCE) continue;
        // Large offsets break the lattice so tiles no longer line up in rows.
        const tileX = x + (random() - 0.5) * 2 * jitter;
        const tileZ = z + (random() - 0.5) * 2 * jitter;
        const y = heightAt(tileX, tileZ);
        if (areaAt?.(tileX, tileZ)?.id !== 'desert' || isWaterAt(tileX, tileZ, 0.3)) continue;
        // Sample the normal across the tile's own footprint, not a small local
        // patch, so the tilt represents the ground the tile actually covers.
        const span = DESERT_GROUND_TILE_SIZE * 0.5;
        const normal = new Vector3(
          heightAt(tileX - span, tileZ) - heightAt(tileX + span, tileZ),
          span * 2,
          heightAt(tileX, tileZ - span) - heightAt(tileX, tileZ + span),
        ).normalize();
        // A flat tile cannot follow curvature. Measure how far each corner of the
        // tilted plane would sit from the real terrain and drop tiles that would
        // visibly float or cut through the dunes.
        const denominator = Math.max(0.001, normal.y);
        let cornerDeviation = 0;
        for (const [offsetX, offsetZ] of CORNER_OFFSETS) {
          const cornerX = tileX + offsetX * span;
          const cornerZ = tileZ + offsetZ * span;
          const predicted = y - (normal.x * offsetX * span + normal.z * offsetZ * span) / denominator;
          cornerDeviation = Math.max(cornerDeviation, Math.abs(heightAt(cornerX, cornerZ) - predicted));
        }
        // Small overlapping tiles remain continuous even on curved dunes. Keep the
        // measured deviation for diagnostics, but never punch visible holes into
        // the Desert skin; local-normal tilt handles the dominant slope.
        placements.push({
          // Random asset instead of (column * 3 + row), which repeated on a diagonal.
          key: DESERT_GROUND_TILE_ASSETS[Math.floor(random() * DESERT_GROUND_TILE_ASSETS.length)].key,
          x: tileX,
          y: y + 0.035,
          z: tileZ,
          normal,
          cornerDeviation,
          // Free rotation, not 90-degree steps: quantised yaw kept every tile edge
          // parallel, which is the strongest cue that the ground is tiled.
          yaw: random() * Math.PI * 2,
          scale: 1.04 + random() * 0.08,
        });
      }
    }
    return placements;
  }

  function updateDesertGroundTiles(playerPosition, force = false) {
    if (!DESERT_GROUND_TILES_ENABLED) {
      desertGroundRoot.visible = false;
      return;
    }
    if (!playerPosition) return;
    lastDesertPlayerPosition.copy(playerPosition);
    const insideDesert = areaAt?.(playerPosition.x, playerPosition.z)?.id === 'desert';
    desertGroundRoot.visible = insideDesert && desertGroundLoaded;
    if (!insideDesert || !desertGroundLoaded) {
      desertGroundActiveCount = 0;
      for (const pool of desertGroundPools.values()) pool.mesh.visible = false;
      return;
    }
    if (!force && Math.hypot(playerPosition.x - lastDesertGroundX, playerPosition.z - lastDesertGroundZ) < 3.2) return;
    lastDesertGroundX = playerPosition.x;
    lastDesertGroundZ = playerPosition.z;
    const limit = qualityTier === 'low' ? 384 : qualityTier === 'high' ? 1024 : 768;
    const selected = desertGroundPlacements
      .map((placement) => ({ placement, distance: Math.hypot(playerPosition.x - placement.x, playerPosition.z - placement.z) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit)
      .map((entry) => entry.placement);
    const byAsset = new Map(DESERT_GROUND_TILE_ASSETS.map((definition) => [definition.key, []]));
    for (const placement of selected) byAsset.get(placement.key)?.push(placement);
    const placementMatrix = new Matrix4();
    const combinedMatrix = new Matrix4();
    const tilt = new Quaternion();
    const yaw = new Quaternion();
    const rotation = new Quaternion();
    const scale = new Vector3();
    const position = new Vector3();
    const up = new Vector3(0, 1, 0);
    desertGroundActiveCount = 0;
    for (const [key, pool] of desertGroundPools) {
      const active = (byAsset.get(key) || []).slice(0, DESERT_GROUND_POOL_CAPACITY);
      active.forEach((placement, index) => {
        tilt.setFromUnitVectors(up, placement.normal);
        yaw.setFromAxisAngle(up, placement.yaw);
        rotation.copy(tilt).multiply(yaw);
        position.set(placement.x, placement.y, placement.z);
        scale.setScalar(placement.scale);
        placementMatrix.compose(position, rotation, scale);
        combinedMatrix.copy(placementMatrix).multiply(pool.sourceMatrix);
        pool.mesh.setMatrixAt(index, combinedMatrix);
      });
      pool.mesh.count = active.length;
      pool.mesh.visible = active.length > 0;
      pool.mesh.instanceMatrix.needsUpdate = true;
      if (active.length) pool.mesh.computeBoundingSphere();
      pool.mesh.userData.activeTileCount = active.length;
      desertGroundActiveCount += active.length;
    }
  }

  async function loadDesertGroundTiles() {
    if (desertGroundLoaded || disposed) return;
    desertGroundPlacements = buildDesertGroundPlacements();
    for (const definition of DESERT_GROUND_TILE_ASSETS) {
      if (disposed) return;
      try {
        const gltf = await loadEnvironmentGlb(definition.path);
        const base = prepareGroundTileModel(gltf.scene);
        if (disposed) {
          disposeSharedModels([base]);
          return;
        }
        base.updateMatrixWorld(true);
        const meshes = [];
        base.traverse((object) => object.isMesh && meshes.push(object));
        if (meshes.length !== 1 || meshes[0].isSkinnedMesh) {
          console.warn(`ZekNova skipped ${definition.key}; the ground tile was not a single static mesh.`);
          disposeSharedModels([base]);
          continue;
        }
        const source = meshes[0];
        const instances = new InstancedMesh(source.geometry, source.material, DESERT_GROUND_POOL_CAPACITY);
        instances.name = `desert-ground-${definition.key}-pool`;
        instances.count = 0;
        instances.visible = false;
        instances.castShadow = false;
        instances.receiveShadow = true;
        instances.frustumCulled = true;
        instances.userData.areaId = 'desert';
        instances.userData.environmentAsset = definition.key;
        instances.userData.groundDetail = true;
        instances.userData.collisionRadius = 0;
        desertGroundRoot.add(instances);
        desertGroundPools.set(definition.key, { mesh: instances, sourceMatrix: source.matrixWorld.clone() });
        sharedModels.push(base, instances);
        await idleTurn(160);
      } catch (error) {
        console.warn(`ZekNova desert ground tile ${definition.key} could not be loaded.`, error);
      }
    }
    desertGroundLoaded = desertGroundPools.size > 0;
    updateDesertGroundTiles(lastDesertPlayerPosition, true);
    onAssetLoaded?.('desertGroundTiles', desertGroundPlacements.length);
    console.info(`ZekNova Desert ground streamed ${desertGroundPools.size}/4 optimized tile materials across ${desertGroundPlacements.length} reusable placements.`);
  }

  function requestDesertGroundTiles(playerPosition) {
    if (!DESERT_GROUND_TILES_ENABLED) return;
    if (desertGroundLoadPromise || disposed || areaAt?.(playerPosition.x, playerPosition.z)?.id !== 'desert') return;
    lastDesertPlayerPosition.copy(playerPosition);
    desertGroundLoadPromise = loadDesertGroundTiles();
  }

  function updateNearbyShadows(playerPosition, now) {
    const moved = Math.hypot(playerPosition.x - lastShadowX, playerPosition.z - lastShadowZ) >= 2.5;
    if (!moved && now - lastShadowUpdateAt < 500) return;
    lastShadowUpdateAt = now;
    lastShadowX = playerPosition.x;
    lastShadowZ = playerPosition.z;
    const distanceLimit = qualityTier === 'high' ? 34 : qualityTier === 'low' ? 0 : 22;
    for (const entry of shadowRoots) {
      const active = distanceLimit > 0
        && entry.model.visible
        && Math.hypot(playerPosition.x - entry.model.position.x, playerPosition.z - entry.model.position.z) <= distanceLimit;
      if (active === entry.active) continue;
      entry.active = active;
      entry.model.traverse((object) => {
        if (object.isMesh && object.userData.shadowEligible) object.castShadow = active;
      });
    }
  }

  function publishVillageObstacles() {
    const obstacles = [...villageRoots, ...villageKitRoots]
      .filter((model) => Number(model.userData.collisionRadius || 0) > 0)
      .map((model) => ({
        x: model.position.x,
        z: model.position.z,
        radius: Number(model.userData.collisionRadius),
        kind: model.name,
      }));
    onVillageReady?.(obstacles);
  }

  function hasNearbyWater(x, z, radius = 5) {
    for (let index = 0; index < 12; index += 1) {
      const angle = (index / 12) * Math.PI * 2;
      if (isWaterAt(x + Math.cos(angle) * radius, z + Math.sin(angle) * radius, 0.35)) return true;
    }
    return false;
  }

  function bridgePlacement(definition, area) {
    const x = area.center.x + definition.x;
    const z = riverCenterAt(x);
    const rotation = bridgeRotationAt(x);
    const acrossX = Math.sin(rotation);
    const acrossZ = Math.cos(rotation);
    const bankA = heightAt(x + acrossX * 7, z + acrossZ * 7);
    const bankB = heightAt(x - acrossX * 7, z - acrossZ * 7);
    return { x, z, y: Math.max(bankA, bankB) - 0.35, rotation };
  }

  function findVillageKitPlacement(definition, area) {
    if (definition.bridge) return bridgePlacement(definition, area);
    const anchorZ = Number(VILLAGE_KIT_ANCHOR_Z[area.id] ?? 26);
    const anchorX = Number(VILLAGE_KIT_ANCHOR_X[area.id] ?? 0);
    const desiredX = area.center.x + anchorX + definition.x;
    // Water-adjacent structures sit a per-definition distance from the river centre.
    // A single shared offset put every riverside building on the same bank at the
    // same distance, which read as one straight line of structures.
    const bankOffset = Number.isFinite(definition.bankOffset) ? definition.bankOffset : 5.5;
    const desiredZ = definition.waterAdjacent ? riverCenterAt(desiredX) + bankOffset : area.center.z + anchorZ + definition.z;
    const occupied = villageKitOccupied.get(area.id) || [];
    const radius = Math.max(0.6, Number(definition.radius || 0) + 0.4);
    for (let attempt = 0; attempt < 36; attempt += 1) {
      const ring = Math.floor(attempt / 8);
      const angle = ((attempt % 8) / 8) * Math.PI * 2 + definition.x * 0.17 + definition.z * 0.11;
      const distance = ring * 1.6;
      const x = desiredX + Math.cos(angle) * distance;
      const z = desiredZ + Math.sin(angle) * distance;
      const y = heightAt(x, z);
      if (areaAt?.(x, z)?.id !== area.id || y < 0.3 || y > 18 || isWaterAt(x, z, 0.45)) continue;
      if (definition.waterAdjacent && !hasNearbyWater(x, z, 6)) continue;
      if (occupied.some((entry) => Math.hypot(entry.x - x, entry.z - z) < entry.radius + radius + 0.8)) continue;
      occupied.push({ x, z, radius });
      villageKitOccupied.set(area.id, occupied);
      return { x, z, y, rotation: definition.rotation };
    }
    return null;
  }

  function hideTreesForVillageModel(model) {
    const radius = Number(model.userData.footprintRadius || model.userData.collisionRadius || 0);
    if (radius <= 0) return;
    for (const tree of harvestableTrees) {
      if (!tree.visible || villageHiddenTrees.includes(tree)) continue;
      if (Math.hypot(tree.position.x - model.position.x, tree.position.z - model.position.z) > radius + 1.25) continue;
      tree.visible = false;
      villageHiddenTrees.push(tree);
      updateTreeInstance?.(tree);
    }
  }

  async function loadVillageKitArea(area) {
    if (!area || disposed) return;
    const definitions = VILLAGE_KIT_ASSETS.filter((definition) => definition.biome === area.id);
    let loadedCount = 0;
    for (const definition of definitions) {
      if (disposed) return;
      try {
        const placement = findVillageKitPlacement(definition, area);
        if (!placement) {
          console.warn(`ZekNova skipped ${definition.key}; no safe ${area.id} placement was available.`);
          continue;
        }
        const gltf = await loadEnvironmentGlb(definition.path);
        if (disposed) {
          disposeSharedModels([gltf.scene]);
          return;
        }
        const model = prepareModel(gltf.scene, definition.height, definition.shadow);
        model.name = definition.key;
        model.position.set(placement.x, placement.y, placement.z);
        model.rotation.y = placement.rotation || 0;
        model.userData.areaId = area.id;
        model.userData.environmentAsset = definition.key;
        model.userData.villageKit = true;
        model.userData.collisionRadius = Number(definition.radius || 0);
        const bounds = new Box3().setFromObject(model);
        const size = bounds.getSize(new Vector3());
        model.userData.footprint = { width: size.x, depth: size.z };
        model.userData.footprintRadius = Math.max(Number(definition.radius || 0), Math.min(4.5, Math.min(size.x, size.z) * 0.36));
        areaGroups.get(area.id)?.add(model);
        registerDistanceObject(area.id, model, definition.distance);
        sharedModels.push(model);
        villageKitRoots.push(model);
        registerShadowRoot(model);
        hideTreesForVillageModel(model);
        loadedCount += 1;
        await idleTurn(240);
      } catch (error) {
        console.warn(`ZekNova village prop ${definition.key} could not be loaded; the remaining ${area.id} kit will continue.`, error);
      }
    }
    publishVillageObstacles();
    onAssetLoaded?.(`villageKit:${area.id}`, loadedCount);
    console.info(`ZekNova ${area.id} village kit streamed ${loadedCount}/${definitions.length} individually optimized props.`);
  }

  function requestVillageKitArea(area) {
    if (!area || !VILLAGE_KIT_BIOMES.has(area.id) || villageKitLoadPromises.has(area.id) || disposed) return;
    villageKitLoadPromises.set(area.id, ready.then(() => disposed ? undefined : loadVillageKitArea(area)));
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

  function createInstancedPlacements(base, assetKey, definition, assetPlacements) {
    if (!INSTANCE_ASSET_KEYS.has(assetKey) || !assetPlacements.length) return false;
    base.updateMatrixWorld(true);
    const meshes = [];
    base.traverse((object) => object.isMesh && meshes.push(object));
    // Meshy environmental exports are normally a single materialized mesh.
    // Keep the clone path for multi-mesh assets so no hierarchy is lost.
    if (meshes.length !== 1 || meshes[0].isSkinnedMesh) return false;
    const sourceMesh = meshes[0];
    const byArea = new Map();
    for (const placement of assetPlacements) {
      if (!byArea.has(placement.area)) byArea.set(placement.area, []);
      byArea.get(placement.area).push(placement);
    }
    const placementMatrix = new Matrix4();
    const combinedMatrix = new Matrix4();
    const position = new Vector3();
    const rotation = new Quaternion();
    const scale = new Vector3();
    const up = new Vector3(0, 1, 0);
    for (const [areaId, areaPlacements] of byArea) {
      const instances = new InstancedMesh(sourceMesh.geometry, sourceMesh.material, areaPlacements.length);
      instances.name = `${assetKey}-${areaId}-instances`;
      instances.castShadow = false;
      instances.receiveShadow = true;
      instances.userData.areaId = areaId;
      instances.userData.environmentAsset = assetKey;
      areaPlacements.forEach((placement, index) => {
        const scalar = Number(placement.scale || 1);
        position.set(
          placement.x,
          heightAt(placement.x, placement.z) + Number(placement.yOffset || 0),
          placement.z,
        );
        rotation.setFromAxisAngle(up, Number(placement.rotation || 0));
        scale.setScalar(scalar);
        placementMatrix.compose(position, rotation, scale);
        combinedMatrix.copy(placementMatrix).multiply(sourceMesh.matrixWorld);
        instances.setMatrixAt(index, combinedMatrix);
      });
      instances.instanceMatrix.needsUpdate = true;
      instances.computeBoundingSphere();
      areaGroups.get(areaId)?.add(instances);
      registerDistanceObject(areaId, instances, definition.distance);
    }
    return true;
  }

  async function loadAsset(assetKey) {
    const definition = ASSETS[assetKey];
    const assetPlacements = placements.filter((placement) => placement.asset === assetKey);
    const isTreeAsset = assetKey === 'palmTree' || assetKey === 'spikyPlant' || assetKey === 'giantCanopyTree';
    if (!definition || (!assetPlacements.length && !isTreeAsset)) return;

    const gltf = await loadEnvironmentGlb(definition.path);
    const base = prepareModel(gltf.scene, definition.height, definition.shadow);
    if (disposed) {
      disposeSharedModels([base]);
      return;
    }
    sharedModels.push(base);

    const instanced = createInstancedPlacements(base, assetKey, definition, assetPlacements);
    if (!instanced) {
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
        registerDistanceObject(placement.area, instance, definition.distance);
      }
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

  async function loadForestVillage() {
    if (!forestSettlement || disposed) return;
    const prepared = [];
    try {
      await MeshoptDecoder.ready;
      const ringCounts = FOREST_VILLAGE_ASSETS.reduce((counts, definition) => {
        counts[definition.ring] = (counts[definition.ring] || 0) + 1;
        return counts;
      }, {});
      const ringSeen = {};
      for (const definition of FOREST_VILLAGE_ASSETS) {
        if (disposed) {
          disposeSharedModels(prepared);
          return;
        }
        const gltf = await loadEnvironmentGlb(definition.path);
        if (disposed) {
          disposeSharedModels(prepared);
          return;
        }
        const model = prepareModel(gltf.scene, definition.height, definition.shadow);
        model.name = definition.key;
        model.userData.areaId = 'forest';
        model.userData.environmentAsset = definition.key;
        model.userData.forestVillage = true;
        const bounds = new Box3().setFromObject(model);
        const size = bounds.getSize(new Vector3());
        const footprintRadius = Math.max(2.2, Math.min(8, Math.hypot(size.x, size.z) * 0.5));
        // Spread each ring evenly, offsetting the outer ring by half a step so the
        // outer props sit in the gaps between the inner buildings.
        const index = ringSeen[definition.ring] = (ringSeen[definition.ring] || 0);
        ringSeen[definition.ring] += 1;
        const count = Math.max(1, ringCounts[definition.ring] || 1);
        let angle = (index / count) * Math.PI * 2 + (definition.ring === 1 ? Math.PI / count : 0) + 0.35;
        // The AO marker circle is only radius 18, but the Forest *biome* runs the
        // full depth of the map between the world edge and the Desert boundary.
        // Spread across that band and validate each candidate by biome, rather than
        // clamping to the marker radius (which packed the whole village together).
        let spreadX = FOREST_VILLAGE_RING_X[definition.ring] + footprintRadius * 0.35;
        let spreadZ = FOREST_VILLAGE_RING_Z[definition.ring] + footprintRadius * 0.35;
        const usable = (px, pz) => areaAt?.(px, pz)?.id === 'forest'
          && Math.abs(px) <= WORLD_HALF_EXTENT
          && Math.abs(pz) <= WORLD_HALF_EXTENT
          && heightAt(px, pz) > 0.35
          && !isWaterAt(px, pz, 0.4)
          // Keep clear of everything already placed, or the sweep piles structures
          // into whichever pocket it finds first.
          && prepared.every((other) => Math.hypot(other.position.x - px, other.position.z - pz)
            > footprintRadius + Number(other.userData.footprintRadius || 2) + FOREST_VILLAGE_MIN_GAP);
        const at = (a, sx, sz) => ({
          x: forestSettlement.x + Math.cos(a) * sx,
          z: forestSettlement.z + Math.sin(a) * sz,
        });
        let spot = at(angle, spreadX, spreadZ);
        // Sweep the ellipse for forest ground; only tighten if a full revolution fails.
        for (let attempt = 0; attempt < 40 && !usable(spot.x, spot.z); attempt += 1) {
          angle += Math.PI / 10;
          if (attempt > 0 && attempt % 20 === 0) {
            spreadX = Math.max(7, spreadX - 3);
            spreadZ = Math.max(9, spreadZ - 6);
          }
          spot = at(angle, spreadX, spreadZ);
        }
        const x = clampToWorld(spot.x);
        const z = clampToWorld(spot.z);
        model.position.set(x, heightAt(x, z) - 0.12, z);
        // Face the courtyard.
        model.rotation.y = -angle + Math.PI / 2;
        model.userData.collisionRadius = definition.shadow
          ? Math.max(1.6, Math.min(5.5, Math.min(size.x, size.z) * 0.4))
          : 0;
        model.userData.footprint = { width: size.x, depth: size.z };
        model.userData.footprintRadius = footprintRadius;
        if (definition.shadow) registerShadowRoot(model);
        prepared.push(model);
        await idleTurn(700);
      }
      if (disposed) {
        disposeSharedModels(prepared);
        return;
      }
      const forestGroup = areaGroups.get('forest');
      for (const model of prepared) {
        forestGroup?.add(model);
        registerDistanceObject('forest', model, 150);
        sharedModels.push(model);
        villageRoots.push(model);
      }
      // Clear the courtyard and each structure's footprint so buildings do not
      // intersect the procedural forest.
      for (const tree of harvestableTrees) {
        const inCourtyard = Math.hypot(tree.position.x - forestSettlement.x, tree.position.z - forestSettlement.z) <= FOREST_VILLAGE_COURTYARD_RADIUS + 1.5;
        const inStructure = prepared.some((model) => Math.hypot(tree.position.x - model.position.x, tree.position.z - model.position.z) <= Number(model.userData.footprintRadius || 3) + 1.5);
        if (!tree.visible || (!inCourtyard && !inStructure)) continue;
        tree.visible = false;
        villageHiddenTrees.push(tree);
        updateTreeInstance?.(tree);
      }
      for (const fallback of forestFallbackObjects) fallback.visible = false;
      publishVillageObstacles();
      console.info(`ZekNova Forest village added ${prepared.length} optimized structures around the settlement courtyard.`);
      onAssetLoaded?.('forestVillage', prepared.length);
    } catch (error) {
      disposeSharedModels(prepared);
      console.warn('ZekNova Forest village kit unavailable; procedural settlement remains active.', error);
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
        const gltf = await loadEnvironmentGlb(definition.path);
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
        registerShadowRoot(model);
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
        registerDistanceObject('arctic', model, 64);
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
      publishVillageObstacles();
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
    await idleTurn();
    if (!disposed) await loadAsset('coralGround');
    await idleTurn();
    if (!disposed) await loadAsset('tieredStonePillar');
  })();

  const residencyReady = eagerVillageKit
    ? ready.then(async () => {
      if (disposed) return;
      // Decode every static ground and settlement family up front. They are still
      // culled by AO and distance after registration, so eager availability does
      // not force every mesh into every rendered frame.
      lastDesertPlayerPosition.set(-36, heightAt(-36, 0), 0);
      desertGroundLoadPromise ||= loadDesertGroundTiles();
      await desertGroundLoadPromise;
      for (const area of areas.filter((candidate) => VILLAGE_KIT_BIOMES.has(candidate.id))) {
        if (disposed) return;
        requestVillageKitArea(area);
        await villageKitLoadPromises.get(area.id);
      }
      if (!disposed && forestSettlement && !forestVillageLoadPromise) {
        forestVillageLoadPromise = loadForestVillage();
        await forestVillageLoadPromise;
      }
      if (!disposed && arcticSettlement && !villageLoadPromise) {
        villageLoadPromise = loadArcticVillage();
        await villageLoadPromise;
      }
    })
    : ready;

  return {
    group: root,
    ready,
    residencyReady,
    update(playerPosition) {
      if (!playerPosition) return;
      requestDesertGroundTiles(playerPosition);
      updateDesertGroundTiles(playerPosition);
      requestVillageKitArea(areaAt?.(playerPosition.x, playerPosition.z));
      if (arcticSettlement && !villageLoadPromise && Math.hypot(playerPosition.x - arcticSettlement.x, playerPosition.z - arcticSettlement.z) <= 52) {
        villageLoadPromise = ready.then(() => disposed ? undefined : loadArcticVillage());
      }
      if (forestSettlement && !forestVillageLoadPromise && Math.hypot(playerPosition.x - forestSettlement.x, playerPosition.z - forestSettlement.z) <= 130) {
        forestVillageLoadPromise = ready.then(() => disposed ? undefined : loadForestVillage());
      }
      for (const area of areas) {
        const group = areaGroups.get(area.id);
        if (!group) continue;
        const distance = Math.hypot(playerPosition.x - area.center.x, playerPosition.z - area.center.z);
        const groupVisible = distance <= area.radius + 68;
        const groupStateKey = `${area.id}:group`;
        if (visibilityState.get(groupStateKey) !== groupVisible) {
          group.visible = groupVisible;
          visibilityState.set(groupStateKey, groupVisible);
        }
        for (const [maxDistance, objects] of visibilityBuckets.get(area.id) ?? []) {
          const visible = groupVisible && distance <= area.radius + maxDistance;
          const stateKey = `${area.id}:${maxDistance}`;
          if (visibilityState.get(stateKey) === visible) continue;
          visibilityState.set(stateKey, visible);
          for (const object of objects) object.visible = visible;
        }
      }
      const now = performance.now();
      updateNearbyShadows(playerPosition, now);
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
          .slice(0, qualityTier === 'low' ? Math.max(1, Math.ceil(pool.length * 0.5)) : qualityTier === 'balanced' ? Math.max(1, Math.ceil(pool.length * 0.75)) : pool.length);
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
    },
    setQuality(tier = 'balanced') {
      qualityTier = ['low', 'balanced', 'high'].includes(tier) ? tier : 'balanced';
      animationInterval = qualityTier === 'low' ? 1 / 15 : qualityTier === 'high' ? 1 / 30 : 1 / 24;
      // Force the high-detail pools to be reconsidered on the next update.
      lastTreePoolUpdateAt = 0;
      lastTreePoolX = Number.POSITIVE_INFINITY;
      lastTreePoolZ = Number.POSITIVE_INFINITY;
      lastShadowUpdateAt = 0;
      lastShadowX = Number.POSITIVE_INFINITY;
      lastShadowZ = Number.POSITIVE_INFINITY;
      lastDesertGroundX = Number.POSITIVE_INFINITY;
      lastDesertGroundZ = Number.POSITIVE_INFINITY;
      updateDesertGroundTiles(lastDesertPlayerPosition, true);
    },
    animate(time) {
      if (time - lastAnimationAt < animationInterval) return;
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
      shadowRoots.length = 0;
    },
    getDesertGroundStats() {
      return {
        loaded: desertGroundLoaded,
        materials: desertGroundPools.size,
        placements: desertGroundPlacements.length,
        active: desertGroundActiveCount,
        visible: desertGroundRoot.visible,
        quality: qualityTier,
      };
    },
  };
}
