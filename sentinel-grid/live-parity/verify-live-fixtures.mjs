import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const marker = JSON.parse(await readFile(path.join(root, '..', 'integration.json'), 'utf8'));
const requireProduction = process.argv.includes('--require-production') || process.argv.includes('--require');
const kernelScript = path.join(marker.kernelPath, 'scripts', 'certify-zeknova-live-shadow.mjs');
const output = path.join(root, 'evidence', 'latest.json');
await mkdir(path.dirname(output), { recursive: true });
const originalArgv = [...process.argv];
process.argv = [process.execPath, kernelScript, '--fixtures', path.join(root, 'fixtures'), '--output', output, ...(requireProduction ? ['--require-production'] : [])];
try { await import(`${pathToFileURL(kernelScript).href}?bridge=${Date.now()}`); }
finally { process.argv = originalArgv; }
