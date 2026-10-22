// Example content, intentionally outside reusable mechanics.
export const definitions = [
  { type: 'shelter', radius: 1, cost: { stone: 4 } },
  { type: 'beacon', radius: .7, cost: { stone: 6 } },
];
export const rocks = [{ x: -3, z: 0, radius: 1.6 }, { x: 6, z: -4, radius: 1.2 }];
export const heightAt = (x, z) => .18 * Math.sin(x * .32) * Math.cos(z * .3);
export const waterAt = (x, z) => x < -8 && z > 4;
export const canWalk = (x, z, radius = .4) => Math.abs(x) <= 12 - radius && Math.abs(z) <= 12 - radius && !waterAt(x, z) && !rocks.some(r => Math.hypot(r.x - x, r.z - z) < radius + r.radius);
export const worldOptions = {
  worldId: 'construction-valley', owner: 'independent-engine', definitions, inventory: { stone: 12 },
  player: { id: 'player', x: 0, y: heightAt(0, -5), z: -5, radius: .4, xp: 0 },
  terrain: { isValid: (definition, x, z) => canWalk(x, z, definition.radius), heightAt: (_definition, x, z) => heightAt(x, z) }, canWalk,
};
