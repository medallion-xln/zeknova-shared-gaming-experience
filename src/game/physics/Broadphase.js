function extent(body) {
  const s = body.shape;
  if (s.kind === "aabb") return { x: s.halfX, y: s.halfY, z: s.halfZ };
  const r = Number(s.radius ?? .5), h = s.kind === "capsule" ? Number(s.halfHeight ?? 1) : r;
  return { x: r, y: h + r, z: r };
}

export class SpatialHashBroadphase {
  constructor(cellSize = 8) { this.cellSize = cellSize; this.cells = new Map(); this.candidateCount = 0; }
  key(x, y, z) { return `${x},${y},${z}`; }
  rebuild(bodies) {
    this.cells.clear();
    for (const body of [...bodies].sort((a, b) => a.id.localeCompare(b.id))) {
      if (body.tier === "T4") continue;
      const e = extent(body), p = body.position;
      const minX = Math.floor((p.x - e.x) / this.cellSize), maxX = Math.floor((p.x + e.x) / this.cellSize);
      const minY = Math.floor((p.y - e.y) / this.cellSize), maxY = Math.floor((p.y + e.y) / this.cellSize);
      const minZ = Math.floor((p.z - e.z) / this.cellSize), maxZ = Math.floor((p.z + e.z) / this.cellSize);
      for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) for (let z = minZ; z <= maxZ; z++) {
        const key = this.key(x, y, z), cell = this.cells.get(key) || [];
        cell.push(body); this.cells.set(key, cell);
      }
    }
  }
  pairs() {
    const unique = new Map();
    for (const cell of this.cells.values()) for (let i = 0; i < cell.length; i++) for (let j = i + 1; j < cell.length; j++) {
      const a = cell[i], b = cell[j]; if (!a.inverseMass && !b.inverseMass) continue;
      const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`; unique.set(key, a.id < b.id ? [a, b] : [b, a]);
    }
    this.candidateCount = unique.size;
    return [...unique.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, pair]) => pair);
  }
  queryPoint(point, radius = 0) {
    const result = new Map(), r = Math.ceil(radius / this.cellSize), cx = Math.floor(point.x / this.cellSize), cy = Math.floor(point.y / this.cellSize), cz = Math.floor(point.z / this.cellSize);
    for (let x = cx - r; x <= cx + r; x++) for (let y = cy - r; y <= cy + r; y++) for (let z = cz - r; z <= cz + r; z++) for (const body of this.cells.get(this.key(x, y, z)) || []) result.set(body.id, body);
    return [...result.values()].sort((a, b) => a.id.localeCompare(b.id));
  }
}

