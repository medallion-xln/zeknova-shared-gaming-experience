/** Reproducible local verification; never writes release assets or golden hashes.
 * Start npm run dev separately for --browser. Output defaults outside the repo. */
import { spawnSync } from 'node:child_process';
import { readdirSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
const output = path.resolve(process.env.ZGE_EVIDENCE_DIR || '/tmp/zge05-verification'); mkdirSync(output, { recursive: true });
const historical = new Set(['tests/runtime-reconstruction.test.mjs', 'tests/renderer-ownership-certification.test.mjs', 'tests/runtime-graphics-context.test.mjs']);
const results = [], env = { ...process.env, ZGE_EVIDENCE_DIR: output, ZGE_PARITY_REPORT: output + '/node-parity.json', RESULT_PATH: output + '/live-performance.json' };
function run(label, executable, args, expectedFailure = false, timeout = 180000) {
  const began = performance.now(), result = spawnSync(executable, args, { env, encoding: 'utf8', timeout, maxBuffer: 32 * 1024 * 1024 });
  writeFileSync(output + '/' + label.replaceAll('/', '_') + '.log', (result.stdout || '') + (result.stderr || '') + (result.error ? String(result.error) : ''));
  results.push({ label, executable, args, exit: result.status, signal: result.signal, ms: performance.now() - began, expectedFailure });
  writeFileSync(output + '/verification-runs.json', JSON.stringify(results, null, 2));
  console.log(label, result.status === 0 ? 'PASS' : expectedFailure ? 'HISTORICAL FAILURE (inspect log)' : 'FAIL');
}
const dirty = spawnSync('git', ['status', '--short'], { encoding: 'utf8' }).stdout;
writeFileSync(output + '/working-tree.txt', dirty);
run('engine', 'npm', ['run', 'test:engine']);
for (const name of readdirSync('tests').filter(n => /\.test\.(mjs|cjs)$/.test(n)).sort()) { const file = 'tests/' + name; run(file, 'node', [file], historical.has(file)); }
run('picasso-report', 'node', ['tests/picasso-performance-report.mjs']);
run('source-check', 'npm', ['run', 'check']); run('animation-audit', 'npm', ['run', 'audit:animations']); run('node-demo', 'npm', ['run', 'demo:engine']);
run('benchmark-construction', 'node', ['scripts/zge04-benchmark.mjs']); run('benchmark-source-world', 'node', ['--expose-gc', 'scripts/zge05-benchmark.mjs']);
if (process.argv.includes('--browser')) for (const script of ['zge05-browser-certification.mjs', 'zge04-browser-parity.mjs', 'zge04-browser-live-flow.mjs', 'zge03-browser-followup.mjs', 'zge04-browser-demo.mjs', 'zge05-browser-demo.mjs', 'zge04-browser-performance.mjs']) run(script, 'node', ['scripts/' + script], false, 600000);
const artifacts = ['assets/index-02987539.js', 'assets/model-runtime-c96327ba.js', 'assets/model-runtime.js', 'assets/environment-runtime.js'];
writeFileSync(output + '/artifact-hashes.json', JSON.stringify(Object.fromEntries(artifacts.map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')])), null, 2));
// An unexpected success also needs owner investigation: do not silently bless new goldens.
process.exitCode = results.some(r => r.expectedFailure ? r.exit !== 1 : r.exit !== 0) ? 1 : 0;
