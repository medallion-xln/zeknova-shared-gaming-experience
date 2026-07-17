export const BUILDING_COLLISION_RADII = Object.freeze({ power: 1.55, water: 1.45, defense: 1.35, research: 1.7, habitat: 1.9, culture: 1.55, governance: 1.75 });
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
  }

  clear() { this.cells.clear(); }
  key(x, z) { return `${Math.floor(x / this.cellSize)}:${Math.floor(z / this.cellSize)}`; }
  insert(item, x = item?.position?.x ?? 0, z = item?.position?.z ?? 0) {
    const key = this.key(x, z);
    if (!this.cells.has(key)) this.cells.set(key, new Set());
    this.cells.get(key).add(item);
  }
  query(x, z, radius) {
    const found = new Set(), reach = Math.ceil(radius / this.cellSize), cx = Math.floor(x / this.cellSize), cz = Math.floor(z / this.cellSize);
    for (let dz = -reach; dz <= reach; dz += 1) for (let dx = -reach; dx <= reach; dx += 1) for (const item of this.cells.get(`${cx + dx}:${cz + dz}`) ?? []) found.add(item);
    return found;
  }
}

