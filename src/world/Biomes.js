export const BIOMES = Object.freeze([
  { id: "forest", name: "FOREST AO", center: { x: -72, z: 0 }, radius: 18, color: 0x36af4b, terrainColor: 0x174f32, resources: ["Timber", "Biomass"], hazard: "Neurospore canopy", objective: "Secure living material and a protected logistics lane.", value: "Renewable construction stock and ecosystem recovery." },
  { id: "desert", name: "DESERT AO", center: { x: -36, z: 0 }, radius: 18, color: 0xeabe38, terrainColor: 0xb87532, resources: ["Iron", "Minerals"], hazard: "Twin-sun heat exposure", objective: "Survey the exposed ore seam and establish solar reach.", value: "Highest solar yield and accessible metal reserves." },
  { id: "highlands", name: "HIGHLANDS AO", center: { x: 0, z: 0 }, radius: 18, color: 0x977e87, terrainColor: 0x566d63, resources: ["Iron", "Data"], hazard: "Rockfall and electrical storms", objective: "Hold the ridgeline and establish early warning coverage.", value: "Dominant defensive terrain and long-range surveillance." },
  { id: "arctic", name: "ARCTIC AO", center: { x: 36, z: 0 }, radius: 18, color: 0x78c7ff, terrainColor: 0xa8d5e3, resources: ["Water", "Data"], hazard: "Cryogenic wind chill", objective: "Recover climate archives and stabilize remote power.", value: "Freshwater ice, climate intelligence, and resilient research." },
  { id: "wetlands", name: "WETLANDS AO", center: { x: 72, z: 0 }, radius: 18, color: 0x28c7bd, terrainColor: 0x1d6259, resources: ["Water", "Biomass"], hazard: "Contaminated mire and movement drag", objective: "Control the watershed without collapsing local ecology.", value: "Watershed control, biomass, and ZekNovan diplomatic leverage." },
]);

export const BIOME_TREE_DENSITY = Object.freeze({
  forest: 1,
  desert: 0.12,
  highlands: 0.48,
  arctic: 0.2,
  wetlands: 0.78,
});

export function biomeAt(x, worldSize = 180) {
  const index = Math.max(0, Math.min(BIOMES.length - 1, Math.floor((x + worldSize * 0.5) / (worldSize / BIOMES.length))));
  return BIOMES[index] ?? BIOMES[2];
}

export function cloneBiomes() {
  return BIOMES.map((biome) => ({ ...biome, center: { ...biome.center }, resources: [...biome.resources] }));
}
