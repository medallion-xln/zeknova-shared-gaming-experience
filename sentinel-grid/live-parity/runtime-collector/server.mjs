import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createCollectorRuntime } from './collector-core.mjs';

const configPath = path.resolve(process.argv[2] ?? process.env.SENTINEL_GRID_COLLECTOR_CONFIG ?? './config.json');
const config = JSON.parse(await readFile(configPath, 'utf8'));
const runtime = await createCollectorRuntime(config);
let queue = Promise.resolve();

function originAllowed(origin) {
  if (!origin || origin === 'null') return true;
  try {
    const url = new URL(origin);
    return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
  } catch { return false; }
}

function send(response, status, body, origin = null) {
  const json = `${JSON.stringify(body, null, 2)}\n`;
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...(originAllowed(origin) && origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
  });
  response.end(json);
}

async function readBody(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > 8 * 1024 * 1024) throw Object.assign(new Error('Request body exceeds 8 MiB'), { statusCode: 413 });
    chunks.push(chunk);
  }
  if (total === 0) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Request body must be valid JSON'), { statusCode: 400 }); }
}

const server = http.createServer(async (request, response) => {
  const origin = request.headers.origin ?? null;
  if (!originAllowed(origin)) return send(response, 403, { pass: false, error: 'Origin is not allowed' });
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': origin ?? 'null',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Sentinel-Grid-Collector-Token',
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
    });
    return response.end();
  }
  const url = new URL(request.url, `http://${config.host}:${config.port}`);
  try {
    if (request.method === 'GET' && url.pathname === '/v1/status') return send(response, 200, { pass: true, ...(await runtime.status()) }, origin);
    if (request.method !== 'POST') return send(response, 404, { pass: false, error: 'Not found' }, origin);
    if (request.headers['x-sentinel-grid-collector-token'] !== config.token) return send(response, 401, { pass: false, error: 'Collector token rejected' }, origin);
    const body = await readBody(request);
    const operation = url.pathname === '/v1/session/start'
      ? () => runtime.startSession(body)
      : url.pathname === '/v1/capture'
        ? () => runtime.submitCapture(body)
        : url.pathname === '/v1/session/end'
          ? () => runtime.endSession(body)
          : null;
    if (!operation) return send(response, 404, { pass: false, error: 'Not found' }, origin);
    const result = await (queue = queue.then(operation, operation));
    return send(response, 200, { pass: true, result }, origin);
  } catch (error) {
    const status = error.statusCode ?? (error.code === 'SESSION_NOT_ACTIVE' ? 409 : 422);
    return send(response, status, { pass: false, error: error.message, code: error.code ?? 'COLLECTOR_ERROR' }, origin);
  }
});

server.listen(config.port, config.host, async () => {
  console.log(JSON.stringify({ pass: true, event: 'collector-listening', ...(await runtime.status()) }, null, 2));
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
