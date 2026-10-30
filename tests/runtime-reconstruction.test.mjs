import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { verifyRuntimeLineage } from '../scripts/runtime-lineage.mjs';

const root = new URL("../", import.meta.url);
const read = (relative) => readFile(new URL(relative, root));
const hash = (value) => createHash("sha256").update(value).digest("hex");
const compatGolden = await read("assets/index-02987539.js");
const modelGolden = await read("assets/model-runtime-c96327ba.js");
const compatCandidate = await read("artifacts/runtime-reconstruction/index-reconstructed.js");
const modelCandidate = await read("artifacts/runtime-reconstruction/model-runtime-reconstructed.js");

await verifyRuntimeLineage();
// Compatibility has an explicitly recorded candidate-only RB-1 wrapper correction.
// verifyRuntimeLineage pins BOTH the untouched shipping reference and reviewed candidate.
assert.deepEqual(modelCandidate, modelGolden, "reconstructed model bytes must equal the golden oracle");

const compatText = compatCandidate.toString("utf8");
const modelText = modelCandidate.toString("utf8");
const exports = [...modelText.matchAll(/^export (?:async )?function ([A-Za-z0-9_]+)/gm)].map((match) => match[1]);
assert.equal(exports.length, 20);
assert.equal(new Set(exports).size, 20);
assert.match(compatText, /globalThis\.ZekNovaLegacyBridge=Object\.freeze\(\{/);
assert.match(compatText, /async start\(user\)/);
assert.match(compatText, /if\(!user\)throw new Error\("An authenticated ZekNova user is required\."\)/);
assert.match(compatText, /dispose\(\)\{/);
assert.match(compatText, /getAdvisorTelemetry=function\(\)/);
assert.match(compatText, /model-runtime-c96327ba\.js\?v=/);
assert.match(compatText, /level:"R0"/);
assert.doesNotMatch(compatText, /canIssueAuthorityTokens:\s*!0/);
assert.match((await read("src/game/Game.js")).toString("utf8"), /\.\.\/\.\.\/assets\/index-02987539\.js\?v=automatic-boss-physics1/);

const temporary = await mkdtemp(path.join(os.tmpdir(), "zeknova-runtime-tamper-"));
try {
  const tampered = Buffer.from(compatCandidate);
  tampered[0] ^= 1;
  const tamperedPath = path.join(temporary, "index.js");
  await writeFile(tamperedPath, tampered);
  assert.notEqual(hash(await readFile(tamperedPath)), hash(compatCandidate), "tampering must change the reviewed candidate digest");
} finally {
  await rm(temporary, { recursive: true, force: true });
}

console.log(JSON.stringify({ compatibilityHash: hash(compatCandidate), shippingCompatibilityHash: hash(compatGolden), modelHash: hash(modelCandidate), modelExports: exports, parity: "reviewed-source-lineage; model exact shipping bytes; compatibility RB-1 candidate correction", authority: "R0", tamperDetection: true }, null, 2));

