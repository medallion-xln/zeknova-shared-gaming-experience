import { test } from "node:test";
import assert from "node:assert/strict";
import { SaveTransport, migrateSnapshot, validateSnapshot, attachExtension, readExtension, installLegacySaveInterceptor, SaveSchemaError } from "../src/index.js";
import { createFakeSaveServer } from "./fakeSaveServer.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const snap = (n, extra = {}) => ({ version: 4, user: { id: "u1", teamCode: "TEAM-1" }, buildings: [], resources: { iron: n }, worldProgress: {}, missionStats: {}, updatedAt: new Date(1700000000000 + n * 1000).toISOString(), ...extra });
const memStore = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), size: () => m.size }; };
const transport = (server, extra = {}) => new SaveTransport({ fetchImpl: server.fetch, teamCode: "TEAM-1", userId: "u1", baseBackoffMs: 5, maxBackoffMs: 20, requestTimeoutMs: 200, pendingStore: memStore(), ...extra });

test("a save is reported saved only after server acknowledgement, with the revision", async () => {
  const server = createFakeSaveServer(); const t = transport(server);
  const result = await t.submit(snap(1));
  assert.deepEqual(result, { ok: true, revision: 1, seq: 1 }); assert.equal(t.state, "saved"); assert.equal(server.posts.length, 1); assert.equal(t.status().lastAck.revision, 1);
  assert.equal(server.posts[0].persistence.operationId.startsWith("zge-TEAM-1-u1-1-"), true);
});

test("rapid saves coalesce: only the newest snapshot is posted and older requests never overwrite newer state", async () => {
  const server = createFakeSaveServer({ failures: [] }); const t = transport(server);
  const results = await Promise.all([t.submit(snap(1)), t.submit(snap(2)), t.submit(snap(3))]);
  assert.ok(results.every((r) => r.ok)); assert.equal(server.posts.length, 1); assert.equal(server.posts[0].resources.iron, 3);
  await t.submit(snap(4)); assert.equal(server.posts.at(-1).resources.iron, 4); assert.equal(t.status().counters.coalesced, 2);
  for (let i = 5; i < 55; i += 1) t.submit(snap(i)); await sleep(60); assert.ok(server.posts.length <= 6, `50 rapid submits produced ${server.posts.length} posts`); assert.equal(server.personal.resources.iron, 54);
});

test("transient failures retry with bounded backoff and preserve the dirty snapshot; success after recovery", async () => {
  const server = createFakeSaveServer({ failures: ["network", 503, "network"] }); const events = []; const t = transport(server, { onEvent: (type, d) => events.push([type, d.state]) });
  const result = await t.submit(snap(7));
  assert.equal(result.ok, true); assert.equal(t.status().counters.retried, 3); assert.equal(server.posts.length, 1); assert.equal(server.posts[0].resources.iron, 7);
  assert.ok(events.some(([type]) => type === "persistence:retry")); assert.equal(t.state, "saved");
});

test("degraded after maxRetries but keeps trying and keeps the pending snapshot in the store", async () => {
  const server = createFakeSaveServer({ failures: ["network", "network", "network", "network"] }); const store = memStore(); const t = transport(server, { maxRetries: 2, pendingStore: store });
  const p = t.submit(snap(9)); await sleep(40); assert.equal(["degraded", "retrying"].includes(t.state), true); assert.ok(store.size() === 1, "pending snapshot persisted while unconfirmed");
  const result = await p; assert.equal(result.ok, true); assert.equal(t.state, "saved"); assert.equal(store.size(), 0, "store cleared after acknowledgement");
});

test("auth expiry is terminal and surfaced; resume() re-sends the preserved snapshot", async () => {
  const server = createFakeSaveServer({ authenticated: false }); const events = []; const t = transport(server, { onEvent: (type, d) => events.push(type) });
  const result = await t.submit(snap(3)); assert.deepEqual(result, { ok: false, reason: "auth-expired", status: 401 }); assert.equal(t.state, "auth-expired"); assert.equal(server.posts.length, 0); assert.ok(events.includes("persistence:auth-expired"));
  t.submit(snap(4)); await sleep(20); assert.equal(server.posts.length, 0, "no retries while auth-expired");
  server.authenticated = true; assert.equal(t.resume(), true); await sleep(30); assert.equal(server.posts.length, 1); assert.equal(server.posts[0].resources.iron, 4); assert.equal(t.state, "saved");
});

test("permanent rejections (422/413) are surfaced, not retried, and do not block later saves", async () => {
  const server = createFakeSaveServer({ failures: [422] }); const events = []; const t = transport(server, { onEvent: (type) => events.push(type) });
  const clientSide = await t.submit({ ...snap(1), buildings: new Array(3001).fill({ id: "x" }) });
  assert.equal(clientSide.ok, false); assert.equal(clientSide.reason, "rejected"); assert.equal(clientSide.status, null); assert.match(clientSide.message, /3000 buildings/); assert.equal(t.state, "rejected"); assert.ok(events.includes("persistence:rejected"));
  const serverSide = await t.submit(snap(1)); assert.equal(serverSide.ok, false); assert.equal(serverSide.reason, "rejected"); assert.equal(serverSide.status, 422); assert.equal(t.status().counters.retried, 0, "rejections are not retried");
  const good = await t.submit(snap(2)); assert.equal(good.ok, true); assert.equal(t.state, "saved");
  const bad = await t.submit({ version: 9, buildings: [], user: { teamCode: "T" } }); assert.equal(bad.reason, "rejected"); assert.ok(bad.message.includes("unsupported snapshot version"));
  assert.ok(SaveSchemaError);
});

test("409 conflict refreshes the server revision and retries once with the newer base", async () => {
  const server = createFakeSaveServer(); const t = transport(server);
  await t.submit(snap(1)); assert.equal(t.revision, 1);
  server.revision = 5; // another tab saved
  const result = await t.submit(snap(2)); assert.equal(result.ok, true); assert.equal(t.status().counters.conflicts, 1); assert.equal(t.revision, 6); assert.equal(server.posts.at(-1).persistence.baseRevision, 5);
});

test("request timeout is a transient failure that retries", async () => {
  const server = createFakeSaveServer({ failures: ["hang"] }); const t = transport(server, { requestTimeoutMs: 30 });
  const result = await t.submit(snap(5)); assert.equal(result.ok, true); assert.equal(t.status().counters.retried, 1); assert.match(String(t.status().counters.acked), /1/);
});

test("reload recovery: an unacknowledged snapshot survives in the store and a new transport re-sends it", async () => {
  const store = memStore(); const down = createFakeSaveServer({ failures: ["network", "network", "network", "network", "network", "network"] });
  const t1 = transport(down, { pendingStore: store, maxRetries: 1 }); t1.submit(snap(42)); await sleep(15); t1.dispose();
  assert.equal(store.size(), 1, "pending survives the 'reload'");
  const up = createFakeSaveServer(); const t2 = transport(up, { pendingStore: store });
  await sleep(30); assert.equal(up.posts.length, 1); assert.equal(up.posts[0].resources.iron, 42); assert.equal(t2.status().counters.recoveredFromStore, 1); assert.equal(store.size(), 0);
});

test("unload: best-effort beacon carries the pending snapshot and is never reported as saved", async () => {
  const server = createFakeSaveServer({ failures: ["network"] }); const beacons = []; const t = transport(server, { beacon: (url, blob) => { beacons.push({ url, size: blob.size, type: blob.type }); return true; } });
  t.submit(snap(8)); const sent = t.flushBeacon("pagehide"); assert.equal(sent, true); assert.equal(beacons.length, 1); assert.ok(beacons[0].size > 100); assert.match(beacons[0].type, /^text\/plain/, "beacon body type must be CORS-safelisted or Chrome refuses it"); assert.equal(t.state, "saving", "beacon does not acknowledge");
  const later = t.submit(snap(9)); assert.equal(beacons.length, 2, "submissions during unload go straight to the beacon"); t.dispose(); assert.deepEqual(await later, { ok: false, reason: "disposed" });
});

test("schema: v1–v4 migrate to the v4 shape with defaults; unsupported versions are rejected; extension round-trips XP", () => {
  const v1 = { version: 1, user: { id: "u", teamCode: "T" }, buildings: [{ id: "b" }], resources: { iron: 1 } };
  const { snapshot, steps } = migrateSnapshot(v1);
  assert.equal(snapshot.version, 4); assert.deepEqual(steps.map((s) => s.split(":")[0]), ["v1→v2", "v2→v3", "v3→v4"]); assert.deepEqual(snapshot.worldProgress.minedRockIds, []); assert.equal(snapshot.diplomacy.tension, 50); assert.equal(snapshot.player.health, 100); assert.deepEqual(snapshot.buildings, [{ id: "b" }]);
  assert.deepEqual(migrateSnapshot(snap(1)).steps, []);
  assert.throws(() => validateSnapshot({ version: 5, buildings: [], user: { teamCode: "T" } }), /unsupported snapshot version 5/);
  const withExt = attachExtension(snap(1), { xp: 596, officerClass: "ensign", rankXp: 12 });
  assert.equal(withExt.zge.schema, "zge.save-extension.v1"); const ext = readExtension(JSON.parse(JSON.stringify(withExt))); assert.equal(ext.player.xp, 596); assert.equal(ext.player.officerClass, "ensign"); assert.equal(readExtension(snap(1)), null);
});

test("legacy interceptor: keepalive POST becomes an acknowledged save with XP attached; GET restores pending-newer state and XP after ready", async () => {
  const server = createFakeSaveServer(); const listeners = new Map(); const store = memStore();
  const win = { fetch: server.fetch, localStorage: store, navigator: { sendBeacon: () => true }, addEventListener: (t, fn) => listeners.set(t, fn), removeEventListener: (t) => listeners.delete(t) };
  const game = { player: { xp: 596 }, user: { officerClass: "ensign", rankXp: 0 } };
  const events = []; const handle = installLegacySaveInterceptor({ window: win, teamCode: "TEAM-1", userId: "u1", getGame: () => game, transportOptions: { baseBackoffMs: 5, maxBackoffMs: 20 }, onEvent: (t) => events.push(t) });
  assert.ok(win.fetch.__zgeSaveInterceptor);
  const r = await win.fetch("./api/save.php", { method: "POST", keepalive: true, body: JSON.stringify(snap(1)) });
  assert.equal(r.status, 202); await sleep(20); assert.equal(server.posts.length, 1); assert.equal(server.posts[0].zge.player.xp, 596); assert.equal(handle.status().state, "saved");
  // Simulate reload: game lost its XP, server has the extension → GET then gameplay-ready restores it.
  game.player.xp = 12; const g = await (await win.fetch("./api/save.php?team=TEAM-1")).json(); assert.equal(g.save.zge.player.xp, 596); listeners.get("zeknova:gameplay-ready")(); assert.equal(game.player.xp, 596); assert.equal(handle.status().restoredXp, 596);
  // Pending newer than server (network down) → GET returns the pending state merged over the server copy.
  server.postFailures.push("network", "network", "network", "network", "network", "network"); await win.fetch("./api/save.php", { method: "POST", body: JSON.stringify(snap(2, { resources: { iron: 99 } })) }); await sleep(5);
  const g2 = await (await win.fetch("./api/save.php?team=TEAM-1")).json(); assert.equal(g2.save.resources.iron, 99); assert.ok(events.includes("persistence:restored-from-pending"));
  handle.dispose(); assert.equal(win.fetch, server.fetch);
});
