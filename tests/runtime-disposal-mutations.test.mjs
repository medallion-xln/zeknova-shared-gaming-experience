// Test-only negative controls. Mutate scratch artifacts, never source or working-tree outputs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, copyFile, symlink, rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const first = 'if(this.disposed)return;await zkAssetPause(5500);if(this.disposed)return;console.info';
const second = 'await zkAssetPause(5500);if(this.disposed)return;console.info';
const inner = 'setTimeout(r,3000))]);if(this.disposed||e!==this.aoEnvironmentLoadToken)return;const t=await import';
const cases = [
  ['M3', first, 'await zkAssetPause(5500);if(this.disposed)return;console.info',
    'RB-1 disposal before or during the HQ wait schedules no staging pause and runs no inner loader', /5500/],
  ['M4', second, 'await zkAssetPause(5500);console.info',
    'RB-1 disposal during the 5500ms staging pause stops before the inner loader touches anything', /2 !== 1/],
  ['M5', first, 'await zkAssetPause(5500);console.info',
    'RB-1 disposal before or during the HQ wait schedules no staging pause and runs no inner loader', /5500/],
  ['M10', inner, 'setTimeout(r,3000))]);const t=await import',
    'RB-1 inner loader contract: disposal or supersession during its own HQ wait stops before module import', /1 !== 0/],
];
const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
for (const [id, before, after, name, failure] of cases) {
  test(`${id} is killed by its attributable disposal regression (with passing control)`, async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), `zge18a2-${id}-`));
    try {
      for (const file of ['tests/runtime-required-behaviours.test.mjs', 'tests/helpers/runtime-behaviour-harness.mjs', 'assets/vendor/three.module.min.js']) {
        const target = path.join(dir, file); await mkdir(path.dirname(target), {recursive: true});
        await copyFile(path.join(root, file), target);
      }
      await symlink(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
      await writeFile(path.join(dir, 'package.json'), '{"type":"module"}\n');
      const artifact = 'artifacts/runtime-reconstruction/index-reconstructed.js';
      await mkdir(path.dirname(path.join(dir, artifact)), {recursive: true});
      const source = await readFile(path.join(root, artifact), 'utf8');
      assert.equal(source.split(before).length, 2, `${id}: mutation must apply exactly once`);
      // A nested Node test runner otherwise inherits the parent's internal IPC reporter.
      const env = {...process.env}; delete env.NODE_TEST_CONTEXT;
      const run = () => spawnSync(process.execPath, ['--experimental-vm-modules', '--test', '--test-reporter=tap',
        `--test-name-pattern=^${escapeRegex(name)}$`, 'tests/runtime-required-behaviours.test.mjs'],
        {cwd: dir, env, encoding: 'utf8', timeout: 15000});
      await writeFile(path.join(dir, artifact), source);
      const control = run(); assert.ifError(control.error);
      assert.equal(control.status, 0, control.stdout + control.stderr);
      assert.match(control.stdout, /# pass 1\b/); assert.match(control.stdout, /# tests 1\b/);
      await writeFile(path.join(dir, artifact), source.replace(before, after));
      const mutant = run(); assert.ifError(mutant.error);
      assert.equal(mutant.status, 1, `${id}: survived\n${mutant.stdout}${mutant.stderr}`);
      assert.match(mutant.stdout, /# fail 1\b/); assert.match(mutant.stdout, /# cancelled 0\b/);
      assert.match(mutant.stdout, /ERR_ASSERTION/); assert.match(mutant.stdout, failure);
      console.log(`${id}: KILLED by "${name}"; control PASS; assertion ${failure}`);
    } finally { await rm(dir, {recursive: true, force: true}); }
  });
}
