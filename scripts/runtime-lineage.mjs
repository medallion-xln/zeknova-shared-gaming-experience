import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

/** Verify all four lineage categories, not just a hard-coded live digest. */
export async function verifyRuntimeLineage(root = fileURLToPath(new URL('../', import.meta.url))) {
  const read = file => readFile(path.join(root, file));
  const config = JSON.parse(await read('src/runtime-reconstructed/runtime-build.json'));
  const provenance = JSON.parse(await read('src/runtime-reconstructed/provenance.json'));
  const derived = {
    compatibility: Buffer.concat(await Promise.all(config.compatibility.segments.map(read))),
    model: await read(config.model.entrypoint),
  };
  const result = {};
  for (const key of ['compatibility', 'model']) {
    const entry = provenance[key];
    assert.equal(config[key].output, entry.candidate, `${key} output mapping`);
    assert.equal(entry.deploymentPath, entry.shipping, `${key} deployment mapping`);
    const shipping = await read(entry.shipping), candidate = await read(entry.candidate);
    assert.equal(sha256(shipping), entry.shippingSha256 ?? entry.sha256, `${key} shipping reference drift`);
    assert.equal(sha256(derived[key]), entry.sha256, `${key} source lineage drift`);
    assert.deepEqual(candidate, derived[key], `${key} candidate is not source-derived`);
    if (!entry.shippingSha256) assert.deepEqual(candidate, shipping, `${key} candidate differs from shipping baseline`);
    assert.notEqual(entry.historicalSha256, entry.sha256, `${key} history must remain explicit`);
    result[key] = {sha256: entry.sha256, bytes: candidate.length};
  }
  return result;
}
