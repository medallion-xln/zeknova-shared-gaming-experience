import test from 'node:test';
import assert from 'node:assert/strict';
import {deferred, flush, startupHarness, juggernautHarness} from './helpers/runtime-behaviour-harness.mjs';

test('RB-1 successful HQ loads one environment; late timer cannot duplicate it', async () => {
  const h = await startupHarness(); await h.game.loadAOEnvironment();
  assert.equal(h.stats.created, 1); assert.equal(h.children.size, 1);
  await h.advance(3000); assert.equal(h.stats.created, 1);
});
test('RB-1 unresolved HQ is bounded at exactly 3000ms; late HQ does not duplicate', async () => {
  const hq = deferred(), h = await startupHarness({hq: hq.promise});
  const work = h.game.loadAOEnvironment(); await flush();
  await h.advance(2999); assert.equal(h.stats.imports, 0);
  await h.advance(1); await work; assert.equal(h.stats.created, 1);
  hq.resolve(); await flush(); assert.equal(h.stats.created, 1);
});
test('RB-1 rejected HQ retains procedural fallback', async () => {
  const hq = deferred(), h = await startupHarness({hq: hq.promise});
  const work = h.game.loadAOEnvironment(); hq.reject(Error('HQ failure')); await work;
  assert.equal(h.stats.created, 0); assert.equal(h.stats.warnings, 1);
});
test('RB-1 disposal during HQ or module import prevents attachment', async () => {
  for (const at of ['hq', 'import']) {
    const gate = deferred();
    const h = await startupHarness(at === 'hq' ? {hq: gate.promise} : {importing: gate.promise});
    const work = h.game.loadAOEnvironment(); await flush(); h.game.dispose();
    gate.resolve(); await work;
    assert.equal(h.stats.created, 0); assert.equal(h.children.size, 0);
  }
});
test('RB-1 superseded initialization cannot duplicate world entities', async () => {
  const hq = deferred(), h = await startupHarness({hq: hq.promise});
  const first = h.game.loadAOEnvironment(), second = h.game.loadAOEnvironment();
  hq.resolve(); await Promise.all([first, second]); assert.equal(h.stats.created, 1);
});
test('RB-1 final staged wrapper bounds HQ once, preserves 5500ms staging and prevents resurrection', async () => {
  for (const dispose of [false, true]) {
    const hq = deferred(), h = await startupHarness({hq: hq.promise}); h.installStagedWrapper();
    const work = h.game.loadAOEnvironment(); await flush();
    await h.advance(2999); assert.equal(h.stats.imports, 0);
    await h.advance(1); assert.equal(h.stats.imports, 0);
    if (dispose) h.game.dispose();
    await h.advance(5499); assert.equal(h.stats.imports, 0);
    await h.advance(1); await work; assert.equal(h.stats.created, dispose ? 0 : 1);
    hq.resolve(); await flush(); assert.equal(h.stats.created, dispose ? 0 : 1);
  }
});
test('RB-1 final staged wrapper handles successful and rejected HQ without duplicate loads', async () => {
  for(const rejected of [false,true]) {
    const hq=deferred(),h=await startupHarness({hq:hq.promise});h.installStagedWrapper();
    const work=h.game.loadAOEnvironment();
    if(rejected)hq.reject(Error('HQ failed'));else hq.resolve();
    await flush();await h.advance(5500);await work;
    assert.equal(h.stats.created,rejected?0:1);assert.equal(h.stats.warnings,rejected?1:0);
    await h.advance(3000);assert.equal(h.stats.created,rejected?0:1);
  }
});
// ZGE-18A.2 disposal-fence certification. These run the verbatim segment 03 class dispose(), the
// segment 04 staged wrapper / inner loader / dispose wrapper and the segment 06 outer wrappers.
// The zR constructor is not instantiated (renderer, DOM and WebGL are stubs). Fence kills are
// attributed through forbidden side effects (timers, token bump, terrain resets, logs), because the
// inner loader's own checks independently keep a disposed game from ever attaching an environment.
const STAGED_LOG = 'ZekNova beginning staged environmental mesh loading.';
const productionChain = async options => {
  const h = await startupHarness({realClass: true, ...options}); h.installProductionChain();
  h.village = h.game.terrain.worldVillageObstacles; return h;
};
const delays = h => h.scheduled.map(t => t.ms);
// Turns a never-settling load (a fake clock leaves no real timer to wake it) into a clear assertion failure.
const settled = async (promise, label) => {
  let done = false; promise.then(() => { done = true; }, () => { done = true; }); await flush();
  assert.equal(done, true, `${label}: load settled`); await promise;
};
// Dispose bumps the load token exactly once (0 -> 1); any inner-loader entry would bump it again.
const assertInnerLoaderNeverRan = (h, label) => {
  assert.equal(h.game.disposed, true, label); assert.equal(h.game.aoEnvironmentLoadToken, 1, label);
  assert.equal(h.game.terrain.worldEnvironmentObstacles, undefined, label);
  assert.equal(h.game.terrain.worldVillageObstacles, h.village, label);
  assert.equal(h.logs.includes(STAGED_LOG), false, label);
  assert.equal(h.stats.imports, 0, label); assert.equal(h.stats.created, 0, label);
  assert.equal(h.children.size, 0, label); assert.equal(h.game.aoEnvironment, null, label);
};
test('RB-1 disposal harness runs the real class dispose and the verbatim wrapper chain', async () => {
  const h = await productionChain();
  assert.equal(h.game.disposed, false); assert.equal(h.stats.playerDisposed, 0);
  h.game.dispose();
  assert.equal(h.game.disposed, true); assert.equal(h.stats.playerDisposed, 1);
  assert.equal(h.game.aoEnvironmentLoadToken, 1); assert.equal(h.game.aoEnvironment, null);
});
test('RB-1 real class dispose publishes the disposed flag before teardown can throw', async () => {
  const h = await productionChain(), failure = Error('teardown failed');
  h.game.player.dispose = () => { throw failure; };
  assert.throws(() => h.game.dispose(), e => e === failure);
  assert.equal(h.game.disposed, true);
  const work = h.game.loadAOEnvironment(); await flush(); assert.deepEqual(delays(h), [3000]);
  await h.advance(60000); await settled(work, 'after failed teardown');
  assert.deepEqual(delays(h), [3000]); assert.equal(h.stats.imports, 0); assert.equal(h.stats.created, 0);
});
test('RB-1 disposal before or during the HQ wait schedules no staging pause and runs no inner loader', async () => {
  for (const when of ['before-call', 'during-hq-wait']) {
    const hq = deferred(), h = await productionChain(when === 'before-call' ? {} : {hq: hq.promise});
    let work;
    if (when === 'before-call') { h.game.dispose(); work = h.game.loadAOEnvironment(); await flush(); }
    else { work = h.game.loadAOEnvironment(); await flush(); h.game.dispose(); await h.advance(2999); }
    await h.advance(1); assert.deepEqual(delays(h), [3000], when); await settled(work, when);
    assertInnerLoaderNeverRan(h, when);
    hq.resolve(); await h.advance(60000);
    assert.deepEqual(delays(h), [3000], `${when}: late HQ completion`); assertInnerLoaderNeverRan(h, `${when}: late HQ`);
  }
});
test('RB-1 disposal during the 5500ms staging pause stops before the inner loader touches anything', async () => {
  for (const at of [0, 3000, 5499]) {
    const h = await productionChain(), work = h.game.loadAOEnvironment(); await flush();
    assert.deepEqual(delays(h), [3000, 5500], `pause scheduled once at ${at}`);
    await h.advance(at); h.game.dispose(); await h.advance(5499 - at); assert.equal(h.stats.imports, 0, `before pause end ${at}`);
    await h.advance(1); await settled(work, `dispose at ${at}`);
    assertInnerLoaderNeverRan(h, `dispose at ${at}`); assert.deepEqual(delays(h), [3000, 5500], `no new timers ${at}`);
    await h.advance(60000); assertInnerLoaderNeverRan(h, `dispose at ${at}: after drain`);
  }
});
test('RB-1 inner loader contract: disposal or supersession during its own HQ wait stops before module import', async () => {
  const gone = deferred(), h = await startupHarness({realClass: true, hq: gone.promise});
  const work = h.game.loadAOEnvironment(); await flush(); h.game.dispose(); gone.resolve(); await settled(work, 'disposed');
  assert.equal(h.stats.imports, 0, 'disposed'); assert.equal(h.stats.created, 0); assert.equal(h.children.size, 0);
  const gate = deferred(), s = await startupHarness({realClass: true, hq: gate.promise});
  const first = s.game.loadAOEnvironment(), second = s.game.loadAOEnvironment(); await flush();
  gate.resolve(); await Promise.all([first, second]);
  assert.equal(s.stats.imports, 1, 'superseded'); assert.equal(s.stats.created, 1); assert.equal(s.children.size, 1);
});
test('RB-1 inner loader: the disposed flag alone fences a call that starts late or an import in flight', async () => {
  const late = await startupHarness({realClass: true}); late.game.dispose();
  await late.game.loadAOEnvironment(); // starts after disposal: the token is fresh, only the flag can stop it
  assert.equal(late.stats.imports, 0, 'late start'); assert.equal(late.stats.created, 0); assert.equal(late.children.size, 0);
  const importing = deferred(), h = await startupHarness({realClass: true, importing: importing.promise});
  const work = h.game.loadAOEnvironment(); await flush(); assert.equal(h.stats.imports, 1);
  h.game.disposed = true; // flag set without a token bump, as the class dispose publishes it first
  importing.resolve(); await settled(work, 'flag-only');
  assert.equal(h.stats.created, 0, 'flag-only: nothing constructed'); assert.equal(h.children.size, 0);
});
test('RB-1 overlapping staged loads: the stale call cannot attach, the latest owns the single live environment', async () => {
  const importing = deferred(), h = await productionChain({importing: importing.promise});
  const first = h.game.loadAOEnvironment(); await flush(); await h.advance(100);
  const second = h.game.loadAOEnvironment(); await flush();
  await h.advance(5400); await h.advance(100); assert.equal(h.stats.imports, 2);
  importing.resolve(); await Promise.all([first, second]);
  assert.equal(h.stats.created, 1); assert.equal(h.children.size, 1); assert.equal(h.stats.disposed, 0);
  assert.equal(h.game.aoEnvironmentLoadToken, 2); assert.ok(h.children.has(h.game.aoEnvironment.group));
});
test('RB-1 disposal during overlapping staged module imports attaches nothing from either call', async () => {
  const importing = deferred(), h = await productionChain({importing: importing.promise});
  const first = h.game.loadAOEnvironment(); await flush(); await h.advance(100);
  const second = h.game.loadAOEnvironment(); await flush();
  await h.advance(5500); assert.equal(h.stats.imports, 2);
  h.game.dispose(); importing.resolve(); await Promise.all([first, second]); await h.advance(60000);
  assert.equal(h.stats.created, 0); assert.equal(h.children.size, 0); assert.equal(h.game.aoEnvironment, null);
  assert.equal(h.game.disposed, true);
});
test('RB-1 disposing one game does not disturb a concurrently initializing game', async () => {
  const h = await productionChain(), other = h.newGame();
  const first = h.game.loadAOEnvironment(), second = other.loadAOEnvironment(); await flush();
  await h.advance(1000); h.game.dispose(); await h.advance(4500); await Promise.all([first, second]);
  assert.equal(h.game.disposed, true); assert.equal(other.disposed, false);
  assert.equal(h.stats.created, 1); assert.equal(h.children.size, 1); assert.ok(h.children.has(other.aoEnvironment.group));
  assert.equal(h.game.aoEnvironment, null); assert.equal(h.stats.disposed, 0);
});
test('RB-1 bound semantics at 3000ms: guaranteed (not order-dependent) results', async () => {
  const hq = deferred(), h = await productionChain({hq: hq.promise}), work = h.game.loadAOEnvironment(); await flush();
  await h.advance(2999); assert.deepEqual(h.scheduled, [{ms: 3000, at: 0}]);
  await h.advance(1); assert.deepEqual(h.scheduled, [{ms: 3000, at: 0}, {ms: 5500, at: 3000}]);
  await h.advance(5499); assert.equal(h.stats.imports, 0);
  await h.advance(1); await work; assert.equal(h.stats.created, 1);
  hq.resolve(); await h.advance(60000); assert.equal(h.stats.created, 1); assert.equal(h.stats.imports, 1);
  for (const order of ['hq-first', 'timer-first']) {
    const gate = deferred(), b = await productionChain({hq: gate.promise}), done = b.game.loadAOEnvironment(); await flush();
    await b.advance(2999);
    if (order === 'hq-first') { gate.resolve(); await b.advance(1); } else { await b.advance(1); gate.resolve(); }
    assert.deepEqual(delays(b), [3000, 5500], order); await b.advance(5500); await done;
    assert.equal(b.stats.created, 1, order); assert.equal(b.stats.warnings, 0, order);
  }
});
test('RB-1 HQ rejection around the 3000ms bound: strict sides guaranteed, boundary tick is order-dependent', async () => {
  const run = async rejectAt => {
    const hq = deferred(), h = await productionChain({hq: hq.promise}), work = h.game.loadAOEnvironment(); await flush();
    await h.advance(rejectAt === 'tick' ? 2999 : rejectAt === 'before' ? 2998 : 3001);
    if (rejectAt === 'tick') { hq.reject(Error('HQ failed')); await h.advance(1); } else hq.reject(Error('HQ failed'));
    await flush(); await h.advance(60000); await work; return h;
  };
  const before = await run('before'), after = await run('after'), tick = await run('tick');
  assert.equal(before.stats.warnings, 1); assert.equal(before.stats.created, 0); assert.deepEqual(delays(before), [3000]);
  assert.equal(after.stats.warnings, 0); assert.equal(after.stats.created, 1); assert.deepEqual(delays(after), [3000, 5500]);
  // Same-tick settlement order depends on promise realm and microtask scheduling; only the invariant is guaranteed.
  const loaded = tick.stats.created === 1 && tick.stats.warnings === 0, fell = tick.stats.created === 0 && tick.stats.warnings === 1;
  assert.ok(loaded !== fell, `exactly one outcome: created=${tick.stats.created} warnings=${tick.stats.warnings}`);
  assert.equal(tick.stats.imports, tick.stats.created);
});
test('RB-1 initialize chain: disposal during unresolved HQ prevents staging and late resurrection', async () => {
  const hq = deferred(), h = await productionChain({hq: hq.promise});
  assert.equal(await h.game.initialize(), 'initialized');
  const ready = h.game.environmentReady;
  await flush(); assert.equal(h.stats.initializes, 1);
  await h.advance(2999); h.game.dispose(); await h.advance(1);
  await settled(ready, 'disposed initialize readiness');
  assertInnerLoaderNeverRan(h, 'disposed initialize');
  assert.deepEqual(delays(h), [3000, 20000]);
  hq.resolve(); await h.advance(60000);
  assert.deepEqual(delays(h), [3000, 20000]); assertInnerLoaderNeverRan(h, 'late HQ after initialize');
});
test('RB-1 overlapping initialize calls disposed during staging never enter the inner loader', async () => {
  const h = await productionChain();
  await h.game.initialize(); const firstReady = h.game.environmentReady; await flush();
  await h.advance(100); await h.game.initialize(); const secondReady = h.game.environmentReady; await flush();
  assert.notEqual(firstReady, secondReady); assert.equal(h.stats.initializes, 2);
  h.game.dispose(); const timers = [...delays(h)];
  await h.advance(5400); await settled(firstReady, 'first initialize');
  await h.advance(100); await settled(secondReady, 'second initialize');
  assertInnerLoaderNeverRan(h, 'both initializations');
  await h.advance(60000); assert.deepEqual(delays(h), timers); assertInnerLoaderNeverRan(h, 'after drain');
});
test('RB-1 disposal at the HQ timeout boundary fences both settlement orders', async () => {
  for (const order of ['dispose-before-timeout', 'timeout-before-dispose']) {
    const hq = deferred(), h = await productionChain({hq: hq.promise});
    const work = h.game.loadAOEnvironment(); await flush(); await h.advance(2999);
    if (order === 'dispose-before-timeout') { h.game.dispose(); await h.advance(1); }
    else { await h.advance(1); h.game.dispose(); }
    // Timeout-first legitimately schedules staging before disposal; disposal-first cannot do so.
    assert.deepEqual(delays(h), order === 'dispose-before-timeout' ? [3000] : [3000, 5500], order);
    await h.advance(5500); await settled(work, order); assertInnerLoaderNeverRan(h, order);
    hq.resolve(); await h.advance(60000); assertInnerLoaderNeverRan(h, `${order}: late HQ`);
  }
});
test('RB-2 normal environment completion resolves readiness', async () => {
  const ready = deferred(), h = await startupHarness({ready: ready.promise});
  assert.equal(await h.game.initialize(), 'initialized'); let signaled = false;
  h.game.environmentReady.then(() => { signaled = true; }); await flush();
  assert.equal(signaled, false); ready.resolve(); await flush(); assert.equal(signaled, true);
});
test('RB-2 never-settling initialization resolves readiness at exactly 20000ms', async () => {
  const ready = deferred(), h = await startupHarness({ready: ready.promise});
  await h.game.initialize(); let signaled = false;
  h.game.environmentReady.then(() => { signaled = true; }); await flush();
  await h.advance(19999); assert.equal(signaled, false);
  await h.advance(1); assert.equal(signaled, true); assert.equal(h.stats.created, 1);
  ready.resolve(); await flush(); assert.equal(h.stats.created, 1);
});
test('RB-2 rejected environment import or ready promise signals fallback readiness', async () => {
  for (const at of ['import', 'ready']) {
    const ready = deferred(), h = await startupHarness(at === 'import' ? {importError: Error('import failed')} : {ready: ready.promise});
    await h.game.initialize(); await flush(); if (at === 'ready') ready.reject(Error('decode failed'));
    await h.game.environmentReady; assert.equal(h.stats.warnings, 1);
  }
});
test('RB-2 base initialization rejection resolves ready and propagates original error', async () => {
  const error = Error('base failed'), h = await startupHarness({initializeError: error});
  await assert.rejects(h.game.initialize(), e => e === error); await h.game.environmentReady;
});
test('RB-2 timeout then disposal fences late module completion', async () => {
  const importing = deferred(), h = await startupHarness({importing: importing.promise});
  await h.game.initialize(); await flush(); await h.advance(20000); await h.game.environmentReady;
  h.game.dispose(); importing.resolve(); await flush();
  assert.equal(h.stats.created, 0); assert.equal(h.children.size, 0);
});
test('RB-2 disposal cancels attachment via token, not network abort; late ready stays detached', async () => {
  const ready = deferred(), h = await startupHarness({ready: ready.promise});
  await h.game.initialize(); await flush(); assert.equal(h.children.size, 1);
  h.game.dispose(); ready.resolve(); await h.game.environmentReady; await flush();
  assert.equal(h.children.size, 0); assert.equal(h.game.aoEnvironment, null);
  assert.equal(h.stats.updates, 1); assert.equal(h.stats.disposed, 2);
});
test('RB-3 unblocked charge moves, expires into recovery and terminates recovery', async () => {
  const h = await juggernautHarness(); h.step(1);
  assert.equal(h.enemy.position.z, 9.4); assert.ok(Math.abs(h.enemy.userData.stateTimer - .55) < 1e-9);
  h.step(.56); assert.equal(h.enemy.userData.juggernautState, 'recover'); assert.equal(h.stats.impacts, 1);
  h.step(2.1); assert.equal(h.enemy.userData.juggernautState, 'stalk');
});
test('RB-3 real terrain collision crashes, decrements recovery timer and repeated obstruction does not retrigger', async () => {
  const h = await juggernautHarness(); h.game.terrain.isObstacleAt = () => true; h.step(.1);
  assert.equal(h.enemy.position.z, 0); assert.equal(h.enemy.userData.juggernautState, 'recover');
  assert.equal(h.enemy.userData.stateTimer, 2); assert.equal(h.stats.impacts, 1);
  for (let i = 0; i < 10; i++) h.step(.1);
  assert.equal(h.stats.impacts, 1); assert.ok(h.enemy.userData.stateTimer < 1.01);
});
test('RB-3 player, building, rock and other-actor collisions use real crash transitions', async () => {
  for (const kind of ['player', 'building', 'rock', 'actor']) {
    const h = await juggernautHarness();
    if (kind === 'player') h.game.player.group.position.set(0, 0, .94);
    if (kind === 'building') h.game.buildings.records.push({x: 0, z: .94});
    if (kind === 'rock') h.game.terrain.nearby = () => [{visible: true, position: {x: 0, z: .94}, userData: {rockId: 'rock'}}];
    if (kind === 'actor') { const other = h.actor(); other.position.z = .94; h.game.enemies.push(other); }
    h.step(.1); assert.equal(h.enemy.userData.juggernautState, 'recover', kind); assert.equal(h.stats.impacts, 1);
  }
});
test('RB-3 state changed during animation preserves shipping branch semantics', async () => {
  const h = await juggernautHarness();
  h.enemy.userData.hqModel = {update() { h.enemy.userData.juggernautState = 'recover'; h.enemy.userData.stateTimer = 2.1; }};
  h.step(.1); assert.equal(h.enemy.userData.juggernautState, 'recover'); assert.equal(h.enemy.userData.stateTimer, 2);
  assert.equal(h.enemy.position.z, .9400000000000001); // Current charge branch completes after animation callback.
});
test('RB-3 cleanup is idempotent and replacement model can be cleaned after restart', async () => {
  const h = await juggernautHarness(); h.enemy.userData.hqModel = h.model();
  h.cleanup(); h.cleanup(); assert.equal(h.stats.disposed, 1); assert.equal(h.enemy.userData.hqModel, null);
  h.enemy.userData.hqModel = h.model(); h.enemy.userData.hqModelDisposed = false;
  h.enemy.userData.juggernautState = 'charge'; h.enemy.userData.stateTimer = .01;
  h.step(.02); assert.equal(h.enemy.userData.juggernautState, 'recover');
  h.cleanup(); assert.equal(h.stats.disposed, 2); assert.equal(h.stats.removed, 2);
});
