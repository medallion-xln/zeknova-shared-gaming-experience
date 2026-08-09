export const BUILDING_COLLISION_RADII = Object.freeze({
  power: 1.55,
  water: 1.45,
  defense: 1.35,
  research: 1.7,
  habitat: 1.9,
  culture: 1.55,
  governance: 1.75,
  communications: 1.7,
  capitol: 2.2,
  hospital: 2.05,
  university: 2.2,
  transit: 2.1,
  commerce: 2.0,
  planetary_capitol: 2.5,
  war_economy: 2.45,
  defense_contractor: 2.35,
  corporate_hq: 2.3,
  stock_exchange: 2.4,
  zek_clinic: 1.85,
  zek_watershed: 1.75,
  zek_beacon: 1.45,
  zek_grove: 1.65,
  zek_habitat: 2.05,
  zek_archive: 1.55,
  zek_market: 2,
  zek_watch: 1.65,
  zek_transit: 2.15,
});
export const ENEMY_COLLISION_RADII = Object.freeze({ juggernaut: 1.75, burrower: 1.35, skyray: 0.7, default: 0.78 });

export function buildingCollisionRadius(type) {
  return BUILDING_COLLISION_RADII[type] ?? 1.3;
}

export function enemyCollisionRadius(typeOrEnemy) {
  const type = typeof typeOrEnemy === "string" ? typeOrEnemy : String(typeOrEnemy?.userData?.enemyType ?? "");
  return ENEMY_COLLISION_RADII[type] ?? ENEMY_COLLISION_RADII.default;
}

export class SpatialHash {
  constructor(cellSize = 8) {
    this.cellSize = cellSize;
    this.cells = new Map();
    this.memberships = new Map();
  }

  clear() {
    this.cells.clear();
    this.memberships.clear();
  }
  key(x, z) { return `${Math.floor(x / this.cellSize)}:${Math.floor(z / this.cellSize)}`; }
  insert(item, x = item?.position?.x ?? item?.x ?? 0, z = item?.position?.z ?? item?.z ?? 0, radius = 0) {
    this.remove(item);
    const memberships = [];
    const minX = Math.floor((x - radius) / this.cellSize);
    const maxX = Math.floor((x + radius) / this.cellSize);
    const minZ = Math.floor((z - radius) / this.cellSize);
    const maxZ = Math.floor((z + radius) / this.cellSize);
    for (let cellZ = minZ; cellZ <= maxZ; cellZ += 1) {
      for (let cellX = minX; cellX <= maxX; cellX += 1) {
        const key = `${cellX}:${cellZ}`;
        if (!this.cells.has(key)) this.cells.set(key, new Set());
        this.cells.get(key).add(item);
        memberships.push(key);
      }
    }
    this.memberships.set(item, memberships);
    return item;
  }
  remove(item) {
    for (const key of this.memberships.get(item) ?? []) {
      const cell = this.cells.get(key);
      cell?.delete(item);
      if (cell?.size === 0) this.cells.delete(key);
    }
    this.memberships.delete(item);
  }
  query(x, z, radius) {
    const found = new Set(), reach = Math.ceil(radius / this.cellSize), cx = Math.floor(x / this.cellSize), cz = Math.floor(z / this.cellSize);
    for (let dz = -reach; dz <= reach; dz += 1) for (let dx = -reach; dx <= reach; dx += 1) for (const item of this.cells.get(`${cx + dx}:${cz + dz}`) ?? []) found.add(item);
    return found;
  }
}
