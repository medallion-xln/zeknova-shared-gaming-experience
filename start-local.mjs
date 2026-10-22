// Simple static server for playing ZekNova locally (no PHP needed)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = 8790;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, user: null, environment: 'local' }));
    return;
  }
  let file = normalize(join(ROOT, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  try {
    const st = await stat(file);
    if (st.isDirectory()) file = join(file, 'index.html');
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('not found'); }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  ZekNova is running at: http://127.0.0.1:${PORT}\n`);
  console.log('  Open that URL in your browser, then click ENLIST to create a local player.\n');
});
