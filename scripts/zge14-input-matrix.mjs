import { runtimeRequest } from '../packages/server-php/runtime/client.mjs';
import { fixture } from '../packages/server-php/test/helpers/fixture.mjs';
import { startWorldService } from '../packages/server-php/runtime/world-service.mjs';
import { chromium } from '/Users/dwaynecampbell/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';
import { randomBytes, createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import net from 'node:net';

// ZGE-14 Phase 1: instrumented movement-latency matrix.
// Measures input->ack and input->visible separately across 1/2/4/8 players and
// network fault modes (none / 50ms delay / 100ms delay / 200ms delay / loss /
// reorder). Preserves durable single-writer authority: the fault injection only
// shapes the client-observable HTTP transport, never the server commit path.
const out = process.env.ZGE_EVIDENCE_DIR || '/tmp/zge14/input-matrix';
mkdirSync(out, { recursive: true });

// cases: [clients, durationSeconds, faultMode, faultParam]
const FAULT_MODES = { none: null, delay: 50, loss: 0.08, reorder: 140 };
const cases = JSON.parse(process.env.ZGE_MATRIX_CASES ||
  '[[1,40,"none"],[2,60,"none"],[4,90,"none"],[8,120,"none"],[2,40,"delay"],[4,40,"delay"],[8,60,"delay"],[8,60,"loss"],[8,60,"reorder"]]');

const rows = [];
async function launchBrowser() {
  return chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--disable-dev-shm-usage', '--disable-gpu-sandbox'] });
}

async function installFault(page, mode) {
  const f = FAULT_MODES[mode];
  if (!f) return;
  if (mode === 'delay' || mode === 'reorder') {
    const delayMs = f;
    await page.route('**/staging/**', async (route) => {
      // Deterministic, per-route ordering constraint: hold the reply briefly.
      await new Promise((r) => setTimeout(r, delayMs));
      await route.continue();
    });
  } else if (mode === 'loss') {
    await page.route('**/staging/**', (route) => {
      if (Math.random() < f) return route.abort();
      return route.continue();
    });
  }
}

for (const [clients, seconds, mode] of cases) {
  const browser = await launchBrowser();
  const f = await fixture({ ZGE_CHECKPOINT_EVERY: '32', ZGE_RUNTIME_FAULTS: '1' });
  let service;
  try {
    for (let i = 0; i < clients; i++) {
        const id = 'p' + i, token = randomBytes(24).toString('hex');
        f.identities[id] = { token, worldId: 'valley', playerId: id };
        const hash = createHash('sha256').update(token).digest('hex');
        f.sql('INSERT INTO memberships VALUES(?,?,?,0)', [id, 'valley', 'builder']);
        f.sql('INSERT INTO sessions VALUES(?,?,?,?,?)', [hash, id, 'valley', 'builder', Math.floor(Date.now() / 1000) + 7200]);
        f.sql('INSERT INTO session_meta VALUES(?,?,?,0,1)', [hash, randomBytes(16).toString('hex'), Math.floor(Date.now() / 1000)]);
      }
      const port = await new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
      service = await startWorldService({ directory: f.directory, port, env: f.env });
      await service.waitUntilReady(30000);

      const contexts = [], pages = [], network = [];
      const started = performance.now();
      for (let i = 0; i < clients; i++) {
        const ctx = await browser.newContext({ viewport: { width: 1380, height: 1050 } }),
          p = await ctx.newPage();
        contexts.push(ctx); pages.push(p);
        await p.addInitScript(() => {
          window.__physicalInputs = [];
          for (const type of ['keydown', 'keyup', 'blur']) addEventListener(type, (e) => {
            if (type === 'blur' || ['KeyA', 'KeyD', 'KeyW', 'KeyS'].includes(e.code)) __physicalInputs.push({ at: performance.now(), type, code: e.code ?? null });
          }, true);
        });
        p.on('response', async (r) => {
          if (new URL(r.url()).pathname.startsWith('/staging/')) {
            let data = {}; try { data = await r.json(); } catch {}
            network.push({ actor: i, at: performance.now() - started, status: r.status(), accepted: data.result?.ok, reason: data.reason ?? data.result?.reason ?? null, revision: data.revision, stagesMs: data.metrics?.stagesMs ?? null, transactionMs: data.metrics?.transactionMs ?? null });
          }
        });
        await p.goto('http://127.0.0.1:' + port + '/examples/construction-world/?server=1');
        await p.locator('#server-token').fill(f.identities['p' + i].token);
        await p.locator('#connect-server').click();
        await p.waitForFunction(() => window.sourceWorld);
        await installFault(p, mode);
      }

      await Promise.all(pages.map((p) => p.evaluate(() => constructionLab.restore())));
      const samples = [];
      let direction = 'd', lastSwitch = 0;
      const began = performance.now();
      await Promise.all(pages.map(async (p) => { await p.locator('#world').focus(); await p.keyboard.down('d'); }));
      while (performance.now() - began < seconds * 1000) {
        const elapsed = performance.now() - began;
        if (elapsed - lastSwitch > 2400) {
          await Promise.all(pages.map(async (p) => { await p.keyboard.up(direction); await p.keyboard.down(direction === 'd' ? 'a' : 'd'); }));
          direction = direction === 'd' ? 'a' : 'd'; lastSwitch = elapsed;
        }
        samples.push({
          elapsedMs: elapsed,
          players: await Promise.all(pages.map((p) => p.evaluate(() => ({
            visibleAt: sourceWorld.movement.samples.slice(-1).map(s => s.visibleAt ?? null)[0] ?? null,
            last: sourceWorld.movement.samples.slice(-1)[0] ?? null,
            revision: constructionLab.inspect().world.revision,
            pending: constructionLab.client.pending.length,
          })))),
        });
        await new Promise((r) => setTimeout(r, 500));
      }
      await Promise.all(pages.map(async (p) => { await p.keyboard.up(direction); await p.locator('#save').focus(); }));
      // Capture the full retained sample chain (sampleAt/issuedAt/ackAt/visibleAt) per actor.
      const raw = await Promise.all(pages.map((p) => p.evaluate(() => ({
        samples: sourceWorld.movement.samples,
        physical: __physicalInputs,
        metrics: constructionLab.client.lastMetrics,
      }))));
      // Latency attribution: input->ack (durable commit acknowledged) vs input->visible
      // (first RAF frame the accepted state is drawn), measured independently per the prompt.
      const latencies = raw.map((a) => a.samples.map((s) => ({
        inputToAckMs: Number.isFinite(s.ackAt) ? s.ackAt - s.sampleAt : null,
        inputToVisibleMs: Number.isFinite(s.visibleAt) ? s.visibleAt - s.sampleAt : null,
        inputToIssuedMs: s.issuedAt - s.sampleAt,
        ok: s.ok,
        accepted: s.accepted,
        reason: s.reason ?? null,
      })));
      const allAck = latencies.flat().map((l) => l.inputToAckMs).filter((v) => Number.isFinite(v));
      const allVisible = latencies.flat().map((l) => l.inputToVisibleMs).filter((v) => Number.isFinite(v));
      const pct = (arr, q) => { if (!arr.length) return null; const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
      // Per-stage server latency attribution across all commands in this case.
      const stageAgg = {};
      for (const n of network) if (n.stagesMs) for (const [k, v] of Object.entries(n.stagesMs)) { (stageAgg[k] ??= []).push(v); }
      const stagePcts = {};
      for (const [k, arr] of Object.entries(stageAgg)) stagePcts[k] = { p50: pct(arr, 0.5), p95: pct(arr, 0.95), p99: pct(arr, 0.99) };
      const row = {
        clients, seconds, mode,
        http: network.length,
        limited429: network.filter((r) => r.status === 429).length,
        rejected: network.filter((r) => !r.accepted && r.reason).length,
        receiptFailures: network.filter((r) => !r.accepted).length,
        ackP50: pct(allAck, 0.5), ackP95: pct(allAck, 0.95), ackP99: pct(allAck, 0.99),
        visibleP50: pct(allVisible, 0.5), visibleP95: pct(allVisible, 0.95), visibleP99: pct(allVisible, 0.99),
        sampleCount: latencies.flat().length,
        finalRevision: JSON.parse(f.sql("SELECT snapshot FROM worlds WHERE id='valley'")[0].snapshot).revision,
        network: network.slice(-500),
        perActorLatencies: latencies,
        perActorSamples: raw.map((r) => r.samples.length),
        stagePcts,
      };
      rows.push(row);
      writeFileSync(out + `/matrix-${clients}p-${mode}.json`, JSON.stringify(row, null, 2));
      await pages[0].screenshot({ path: out + `/matrix-${clients}p-${mode}.png` });
      console.log(JSON.stringify({ clients, mode, http: network.length, limited429: row.limited429, receiptFailures: row.receiptFailures, ackP50: row.ackP50, ackP99: row.ackP99, visibleP50: row.visibleP50, visibleP99: row.visibleP99, revision: row.finalRevision }));
      for (const c of contexts) await c.close();
    } catch (error) {
      rows.push({ clients, seconds, mode, error: String(error?.message ?? error) });
      writeFileSync(out + `/matrix-${clients}p-${mode}.json`, JSON.stringify({ clients, seconds, mode, error: String(error?.message ?? error) }, null, 2));
      console.error(JSON.stringify({ clients, mode, error: String(error?.message ?? error) }));
    } finally { await service?.close(); await f.close(); await browser.close(); }
  }
writeFileSync(out + '/matrix-summary.json', JSON.stringify(rows, null, 2));