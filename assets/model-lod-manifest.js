const LOD_MODELS = new Set([
  "environment/alien-coral-ground.glb",
  "environment/alien-palm-tree.glb",
  "environment/alien-spiky-plant.glb",
  "environment/giant-canopy-tree.glb",
  "environment/tiered-stone-pillar.glb",
  "environment/zeknovan-village-council-arctic.glb",
  "environment/zeknovan-village-shrine-arctic.glb",
  "environment/zeknovan-village-habitat-arctic.glb",
  "ensign-support-scout.glb",
  "lieutenant-astronaut.glb",
  "lieutenant-mech-walk.glb",
  "captain-mech-walk.glb",
  "zeknovan-juggernaut-walk.glb",
  "zeknovan-stalker-walk.glb",
  "zeknovan-saboteur-walk.glb",
  "zeknovan-spitter-walk.glb",
  "zeknovan-skyray-walk.glb",
  "boss-sunscar-colossus.glb",
  "weapon-voidsting.glb",
  "weapon-singularity.glb",
  "weapon-thunderclaw.glb",
]);

export function currentModelQuality() {
  const quality = globalThis.ZekNovaGame?.graphicsQuality
    || document.documentElement.dataset.graphicsQuality
    || "balanced";
  return quality === "high" ? "high" : quality === "low" ? "low" : "medium";
}

export function resolveModelLodPath(path, quality = currentModelQuality()) {
  const [pathname, query = ""] = String(path).split("?");
  const marker = "/assets/models/";
  const markerIndex = pathname.indexOf(marker);
  const relative = markerIndex >= 0 ? pathname.slice(markerIndex + marker.length) : pathname.replace(/^\.\/?assets\/models\//, "");
  if (!LOD_MODELS.has(relative)) return path;
  const tier = quality === "high" ? "high" : quality === "low" ? "low" : "medium";
  const resolved = pathname.replace(/\.glb$/i, `.${tier}.glb`);
  return query ? `${resolved}?${query}` : resolved;
}

export function originalModelPath(path) {
  return String(path).replace(/\.(?:high|medium|low)\.glb(?=\?|$)/i, ".glb");
}
