export function sampleHeightGrid(heights, gridSize, worldSize, x, z) {
  if (!(heights instanceof Float32Array) || gridSize < 2 || heights.length !== gridSize * gridSize) return Number.NaN;
  const half = worldSize * 0.5;
  const step = worldSize / (gridSize - 1);
  const gx = Math.max(0, Math.min(gridSize - 1, (x + half) / step));
  const gz = Math.max(0, Math.min(gridSize - 1, (z + half) / step));
  const x0 = Math.floor(gx), z0 = Math.floor(gz);
  const x1 = Math.min(gridSize - 1, x0 + 1), z1 = Math.min(gridSize - 1, z0 + 1);
  const tx = gx - x0, tz = gz - z0;
  const near = heights[z0 * gridSize + x0] + (heights[z0 * gridSize + x1] - heights[z0 * gridSize + x0]) * tx;
  const far = heights[z1 * gridSize + x0] + (heights[z1 * gridSize + x1] - heights[z1 * gridSize + x0]) * tx;
  return near + (far - near) * tz;
}

export function buildHeightGrid({ gridSize = 161, worldSize = 180, heightAt }) {
  if (typeof heightAt !== "function") throw new TypeError("heightAt must be a function");
  const heights = new Float32Array(gridSize * gridSize);
  const half = worldSize * 0.5;
  const step = worldSize / (gridSize - 1);
  for (let z = 0; z < gridSize; z += 1) {
    for (let x = 0; x < gridSize; x += 1) heights[z * gridSize + x] = heightAt(-half + x * step, -half + z * step);
  }
  return { heights, gridSize, worldSize, step };
}

