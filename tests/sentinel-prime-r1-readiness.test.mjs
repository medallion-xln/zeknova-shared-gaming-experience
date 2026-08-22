import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PRIME_R1_ACTION_BINDINGS, PRIME_R1_MANIFEST_SHA256, PRIME_R1_PROHIBITED } from "../src/world/PrimeR1Authority.js";

const manifest = await readFile(new URL("../docs/SENTINEL_PRIME_R1_AUTHORIZATION_MANIFEST.md", import.meta.url));
const manifestHash = createHash("sha256").update(manifest).digest("hex");
assert.equal(manifestHash, PRIME_R1_MANIFEST_SHA256, "manifest hash must match the runtime contract");

const packageData = JSON.parse(await readFile(new URL("../docs/governance/SENTINEL_PRIME_R1_AUTHORIZATION_PACKAGE.json", import.meta.url), "utf8"));
assert.equal(packageData.manifest.sha256, manifestHash);
assert.equal(packageData.authority.primeR1Authorized, false);
assert.equal(packageData.authority.canaryStarted, false);
assert.equal(packageData.authority.liveExecutionEnabled, false);
assert.equal(packageData.authority.currentAuthority, "R0");
assert.equal(PRIME_R1_ACTION_BINDINGS.length, 6);
assert.deepEqual(packageData.allowedActions, PRIME_R1_ACTION_BINDINGS.map((binding) => ({ prime: binding.primeKey, command: binding.commandKey })));
assert.deepEqual(packageData.prohibitedActions, [...PRIME_R1_PROHIBITED]);
assert.equal(packageData.gobanBoundary.authority, "R0_EVALUATION");
assert.equal(packageData.gobanBoundary.r1ManifestPrepared, false);

const mainSource = await readFile(new URL("../src/main.js", import.meta.url), "utf8");
const controllerMatch = mainSource.match(/const controller = Object\.freeze\(\{([\s\S]*?)\}\);\s*globalThis\.ZekNovaSentinelPrimeR1/);
assert.ok(controllerMatch, "Prime browser controller must be present");
const exposed = [...controllerMatch[1].matchAll(/^\s*([A-Za-z][A-Za-z0-9]*)\s*:/gm)].map((match) => match[1]).sort();
assert.deepEqual(exposed, ["dryRun", "killSwitch", "status"]);
assert.equal(/SentinelPrimeExecutor:\s*primeExecutorModule/.test(mainSource), false, "executor class must not be exposed through ZekNovaSource");
assert.equal(/authorize\s*:/.test(controllerMatch[1]), false);
assert.equal(/execute\s*:/.test(controllerMatch[1]), false);

console.log("Sentinel Prime R1 readiness package checks passed.");
