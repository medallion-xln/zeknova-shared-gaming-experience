const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function boundingRadius(body) {
  const s = body.shape;
  if (s.kind === "aabb") return Math.hypot(s.halfX, s.halfY, s.halfZ);
  return Number(s.radius ?? .5) + (s.kind === "capsule" ? Number(s.halfHeight ?? 0) : 0);
}

export function intersectBodies(a, b) {
  const dx = b.position.x - a.position.x, dy = b.position.y - a.position.y, dz = b.position.z - a.position.z;
  const distance = Math.hypot(dx, dy, dz), penetration = boundingRadius(a) + boundingRadius(b) - distance;
  if (penetration <= 0) return null;
  const inv = distance > 1e-8 ? 1 / distance : 0;
  return { a, b, penetration, normal: distance > 1e-8 ? { x: dx * inv, y: dy * inv, z: dz * inv } : { x: 1, y: 0, z: 0 }, point: { x: (a.position.x + b.position.x) * .5, y: (a.position.y + b.position.y) * .5, z: (a.position.z + b.position.z) * .5 } };
}

export function sweepSphere(start, end, radius, body) {
  const center = body.position, expanded = radius + boundingRadius(body);
  const vx = end.x - start.x, vy = end.y - start.y, vz = end.z - start.z;
  const wx = center.x - start.x, wy = center.y - start.y, wz = center.z - start.z;
  const vv = vx * vx + vy * vy + vz * vz;
  const t = vv > 1e-10 ? clamp((wx * vx + wy * vy + wz * vz) / vv, 0, 1) : 0;
  const px = start.x + vx * t, py = start.y + vy * t, pz = start.z + vz * t;
  const dx = px - center.x, dy = py - center.y, dz = pz - center.z;
  if (dx * dx + dy * dy + dz * dz > expanded * expanded) return null;
  const length = Math.hypot(dx, dy, dz) || 1;
  return { body, fraction: t, point: { x: px, y: py, z: pz }, normal: { x: dx / length, y: dy / length, z: dz / length } };
}

