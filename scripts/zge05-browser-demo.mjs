import fs from 'node:fs';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = process.env.ZGE_EVIDENCE_DIR || '/tmp/zge05-evidence'; fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1380, height: 1100 } }), errors = [], report = {};
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto('http://127.0.0.1:8790/examples/construction-world/?present=neural'); await page.waitForFunction(() => window.sourceWorld);
  report.initial = await page.evaluate(() => sourceWorld.session.inspect());
  // Physical keyboard movement, terrain and placed-building collision, same authoritative player.
  await page.locator('#world').focus(); await page.keyboard.down('d'); await page.waitForTimeout(450); await page.keyboard.up('d');
  report.movement = await page.evaluate(() => sourceWorld.session.inspect().player); assert.ok(report.movement.x > report.initial.player.x);
  report.collision = await page.evaluate(() => {
    const s = sourceWorld.session; for (let i = 0; i < 12; i++) s.move(0, .4);
    const player = s.inspect().player; s.place(player.x, player.z + 1, 'shelter'); const blocked = s.move(0, .4);
    const id = s.inspect().world.buildings.at(-1).id; s.remove(id); return { blocked, restoredMovement: s.move(0, .4) };
  }); assert.equal(report.collision.blocked.reason, 'collision'); assert.equal(report.collision.restoredMovement.ok, true);
  // Real form and canvas construction, inventory deduction, mission and reward once.
  await page.locator('#place').click(); const placed = await page.evaluate(() => constructionLab.inspect()); assert.equal(placed.world.buildings.length, 1);
  const before = placed.world.inventory.stone; await page.locator('#place').click(); assert.match(await page.locator('#status').innerText(), /occupied/);
  await page.locator('#invalid').click(); assert.match(await page.locator('#status').innerText(), /terrain/);
  await page.locator('#grant').click(); assert.equal(await page.evaluate(() => constructionLab.inspect().world.inventory.stone), before + 8);
  const pointer = await page.evaluate(() => sourceWorld.scene.project(-5, -5)); await page.mouse.click(pointer.x, pointer.y);
  report.pointer = await page.evaluate(() => constructionLab.inspect()); assert.equal(report.pointer.world.buildings.length, 2); assert.equal(report.pointer.mission.status, 'complete'); assert.equal(report.pointer.player.xp, 25);
  await page.locator('#second').click(); report.second = await page.evaluate(() => constructionLab.inspect()); assert.equal(report.second.world.buildings.length, 3); assert.equal(report.second.player.xp, 25);
  await page.locator('#save').click(); report.ack = JSON.parse(await page.locator('#status').innerText()); assert.equal(report.ack.ok, true);
  await page.locator('#replay').click(); assert.equal(JSON.parse(await page.locator('#status').innerText()).deterministic, true);
  report.capture = await page.evaluate(async () => { const frame = await sourceWorld.scene.capture(); return { metadata: frame.metadata, lit: frame.pixels().some((v, i) => i % 4 !== 3 && v > 30) }; }); assert.equal(report.capture.lit, true);
  report.beforeRestart = await page.evaluate(() => sourceWorld.diagnostics());
  for (let i = 0; i < 3; i++) { await page.locator('#restart').click(); await page.waitForTimeout(200); }
  report.afterRestart = await page.evaluate(() => sourceWorld.diagnostics()); assert.equal(report.afterRestart.listeners, report.beforeRestart.listeners); assert.equal(report.afterRestart.rafLoops, 1); assert.equal(report.afterRestart.renderer.native.geometries, report.beforeRestart.renderer.native.geometries);
  await page.reload(); await page.waitForFunction(() => window.sourceWorld);
  report.restored = await page.evaluate(() => constructionLab.inspect()); assert.deepEqual(report.restored.world.buildings, report.second.world.buildings); assert.equal(report.restored.player.xp, 25); assert.equal(report.restored.world.inventory.stone, report.second.world.inventory.stone);
  assert.equal(await page.evaluate(() => constructionLab.replay().deterministic), true);
  report.rendering = await page.evaluate(() => sourceWorld.scene.status()); assert.equal(report.rendering.native.backend, 'webgl2'); assert.equal(report.rendering.presentation.mode, 'NATIVE'); assert.match(report.rendering.presentation.fallbackReason, /no inference/);
  await page.waitForTimeout(3100); report.performance = await page.evaluate(() => sourceWorld.diagnostics());
  await page.screenshot({ path: output + '/standalone-3d.png', fullPage: true });
  await page.evaluate(() => sourceWorld.dispose()); report.disposed = await page.evaluate(() => sourceWorld.diagnostics()); assert.equal(report.disposed.rafLoops, 0); assert.equal(report.disposed.listeners, 0);
  assert.deepEqual(errors, []); report.errors = errors; fs.writeFileSync(output + '/browser-source-world.json', JSON.stringify(report, null, 2)); console.log('Source-owned 3D world: PASS');
} catch (error) { report.failure = error.stack; report.errors = errors; fs.writeFileSync(output + '/browser-source-world.json', JSON.stringify(report, null, 2)); throw error; }
finally { await browser.close(); }
