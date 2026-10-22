import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AssetRequestCache, LoaderWatchdog, installWorkerObserver, scanImportSpecifiers, buildImportMap, parseImportMapFromHtml } from "../src/index.js";

const root = new URL("../../../", import.meta.url);
const bin = (n, fill = 7) => new Response(new Uint8Array(n).fill(fill), { status: 200, headers: { "Content-Type": "model/gltf-binary" } });

test("request cache coalesces concurrent requests and serves repeats from cache within the byte budget", async () => {
  let downloads = 0; const fetchImpl = async (url) => { downloads += 1; await new Promise((r) => setTimeout(r, 5)); return bin(1000); };
  const cache = new AssetRequestCache({ fetchImpl, budgetBytes: 2500 });
  const [a, b, c] = await Promise.all([cache.fetch("/assets/models/x.glb"), cache.fetch("/assets/models/x.glb"), cache.fetch("/assets/models/x.glb")]);
  assert.equal(downloads, 1); assert.equal((await a.arrayBuffer()).byteLength, 1000); assert.equal(b.headers.get("X-ZGE-Asset-Cache"), "joined"); assert.equal(c.headers.get("X-ZGE-Asset-Cache"), "joined");
  const d = await cache.fetch("/assets/models/x.glb"); assert.equal(d.headers.get("X-ZGE-Asset-Cache"), "hit"); assert.equal(downloads, 1);
  await cache.fetch("/assets/models/y.glb"); await cache.fetch("/assets/models/z.glb"); // 3000 bytes > 2500 budget → LRU eviction of x
  const s = cache.status(); assert.equal(s.evictions, 1); assert.equal(s.entries, 2); assert.ok(s.bytes <= 2500);
  await cache.fetch("/assets/models/x.glb"); assert.equal(downloads, 4, "evicted entry is downloaded again");
  await cache.fetch("/api/save.php", { method: "POST" }); assert.equal(cache.status().bypassed, 1);
  assert.equal(s.bytesServedFromCache, 1000); assert.equal(s.joined, 2);
});

test("request cache passes real errors through and does not cache them", async () => {
  let calls = 0; const fetchImpl = async () => { calls += 1; return new Response("nope", { status: 404 }); };
  const cache = new AssetRequestCache({ fetchImpl });
  const r1 = await cache.fetch("/assets/models/missing.glb"); assert.equal(r1.status, 404); const r2 = await cache.fetch("/assets/models/missing.glb"); assert.equal(r2.status, 404); assert.equal(calls, 4, "miss + passthrough each time, nothing cached"); assert.equal(cache.status().entries, 0);
});

test("loader watchdog tracks loads, settles both paths, and reports stalls with loader diagnostics", async () => {
  class FakeGLTFLoader { constructor() { this.ktx2Loader = null; } load(url, onLoad, _p, onError) { if (url.endsWith("ok.glb")) setTimeout(() => onLoad({ scene: {} }), 2); else if (url.endsWith("bad.glb")) setTimeout(() => onError(new Error("boom")), 2); /* hang.glb never settles */ } }
  const events = []; let t = 0; const now = () => t; const timers = []; const wd = new LoaderWatchdog({ now, stallMs: 100, onEvent: (type, d) => events.push([type, d]) });
  assert.equal(wd.patch(FakeGLTFLoader, { setIntervalImpl: (fn) => { timers.push(fn); return 1; }, clearIntervalImpl: () => {} }), true);
  const loader = new FakeGLTFLoader(); await new Promise((r) => loader.load("a/ok.glb", () => r()));
  await new Promise((r) => loader.load("a/bad.glb", null, null, () => r())); loader.load("a/hang.glb", () => {});
  t = 50; assert.deepEqual(wd.sweep(), []); t = 150; const stalled = wd.sweep(); assert.equal(stalled.length, 1); assert.equal(stalled[0].url, "a/hang.glb"); assert.equal(wd.sweep().length, 0, "reported once");
  const s = wd.status(); assert.equal(s.completed, 2); assert.equal(s.failures, 1); assert.equal(s.stalls, 1); assert.equal(s.pending.length, 1); assert.ok(events.some(([type]) => type === "asset:load-stalled"));
  wd.dispose(); assert.equal(FakeGLTFLoader.prototype.__zgeWatchdog, undefined);
});

test("worker observer counts live workers and records error events", () => {
  class FakeWorker { constructor(url) { this.url = url; this.listeners = {}; } addEventListener(t, fn) { this.listeners[t] = fn; } removeEventListener(t) { delete this.listeners[t]; } terminate() { this.terminated = true; } }
  const win = { Worker: FakeWorker }; const events = []; const obs = installWorkerObserver(win, { onEvent: (t, d) => events.push([t, d]) });
  const w1 = new win.Worker("blob:abc"), w2 = new win.Worker("/x/basis_transcoder.js"); assert.equal(obs.status().live, 2); assert.equal(obs.status().byScript["blob:"], 1);
  w1.listeners.error({ message: "crashed" }); assert.equal(obs.status().errors, 1); assert.equal(events[0][0], "asset:worker-error");
  w1.terminate(); assert.equal(obs.status().live, 1); assert.equal(w1.terminated, true); assert.equal(w1.listeners.error, undefined, "observer releases its handler on terminate"); obs.dispose(); assert.equal(win.Worker, FakeWorker);
});

test("index.html import map covers every ?v= variant the bundle imports and maps it to the canonical module", () => {
  const bundle = readFileSync(new URL("assets/index-02987539.js", root), "utf8");
  const specs = scanImportSpecifiers(bundle); const expected = buildImportMap(specs);
  assert.ok(Object.keys(expected.imports).length >= 6, JSON.stringify(expected));
  const html = readFileSync(new URL("index.html", root), "utf8"); const actual = parseImportMapFromHtml(html);
  assert.ok(actual, "index.html must declare an import map before the module entry");
  assert.deepEqual(actual.imports, expected.imports);
  assert.ok(html.indexOf('type="importmap"') < html.indexOf('type="module"'), "import map must precede the module script");
  for (const value of Object.values(actual.imports)) assert.ok(["./assets/model-runtime-c96327ba.js", "./assets/environment-runtime.js", "./assets/model-runtime.js"].includes(value));
});
