import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../../../assets/index-02987539.js', import.meta.url), 'utf8');
const between = (a, b) => { const start = source.indexOf(a); assert.ok(start >= 0, a); const end = source.indexOf(b, start); assert.ok(end > start, b); return source.slice(start, end); };
const pointer = between('onPointerDown=e=>', '\ntoggleCaptainFlight(){');
const klass = between('class LR{', 'createModel(e,t){') + 'createModel(){return {}}}';
function fixture({ protectedTerritory = false, diplomacy = null, valid = true, addThrows = false, toastThrows = false } = {}) {
  const events = [], records = [], context = vm.createContext({
    Ge: class { add() {} }, crypto: { randomUUID: () => 'controlled-id' }, Math, w: class { project() {} },
    eo: [{ type: 'power', label: 'Power', cost: { stone: 4 } }], zkZeknovanAidTypes: new Set(), GR: () => '',
    window: { setTimeout: () => { events.push('diplomacy-timer'); } },
    zkCampaignState: () => { events.push(records.length ? 'mission-after' : 'mission-before'); return { current: { id: records.length ? 'next' : 'first', tier: 1, title: 'Next' } }; },
  });
  vm.runInContext(klass + ';globalThis.Legacy=LR;', context);
  const buildings = new context.Legacy('ensign'); buildings.selectedType = 'power'; buildings.records = records;
  buildings.isValidSite = () => { events.push('validation'); return valid; };
  buildings.siteHeight = () => 1; buildings.addRecord = record => { events.push('record-add'); if (addThrows) throw Error('model failed'); records.push(record); };
  const progression = source.slice(source.indexOf('LR.prototype.place=function(...args)'), source.indexOf('\n', source.indexOf('LR.prototype.place=function(...args)')));
  vm.runInContext('const zkProgressionPlace=LR.prototype.place;' + progression, context);
  buildings.onProgressionPlacement = () => events.push('personal-objective');
  const game = { renderer: { domElement: { focus() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) } }, terrain: { mesh: {}, protectedTerritoryAt: () => protectedTerritory, isBuildable: () => valid }, player: { machine: { getWorldPosition() {} }, xp: 0 }, pointer: {}, pointerWorld: { x: 2, z: 2, copy() {} }, raycaster: { setFromCamera() {}, intersectObject: () => [{ point: { x: 2, z: 2 } }] }, mode: 'command', camera: {}, buildings, simulation: { resources: { stone: 20, trust: 50 }, indicators: { ecology: 50 } }, getMissionContext() {}, diplomacyOutcome: diplomacy, ui: { showToast: label => { events.push('toast:' + label); if (toastThrows) throw Error('presentation failed'); } }, updateHud: () => events.push('hud'), save: () => events.push('save') };
  context.game = game; vm.runInContext('(function(){this.' + pointer + '}).call(game)', context);
  return { game, events, click: () => game.onPointerDown({ button: 0, clientX: 40, clientY: 40 }) };
}
test('actual canvas handler orders deduction/add/progression before campaign, XP, HUD and save', () => {
  const { game, events, click } = fixture(); click();
  assert.equal(game.simulation.resources.stone, 16); assert.equal(game.player.xp, 14);
  assert.deepEqual(events, ['mission-before', 'validation', 'record-add', 'personal-objective', 'mission-after', 'toast:Mission unlocked', 'toast:Power deployed', 'hud', 'save']);
});
test('actual protected shared territory precheck blocks place; ordinary protected build reduces trust/ecology', () => {
  const blocked = fixture({ protectedTerritory: true, diplomacy: 'share' }); blocked.click(); assert.equal(blocked.game.simulation.resources.stone, 20); assert.equal(blocked.game.buildings.records.length, 0); assert.ok(!blocked.events.includes('validation'));
  const allowed = fixture({ protectedTerritory: true }); allowed.click(); assert.equal(allowed.game.simulation.resources.trust, 38); assert.equal(allowed.game.simulation.indicators.ecology, 46); assert.ok(allowed.events.includes('diplomacy-timer')); assert.equal(allowed.events.at(-1), 'save');
});
test('actual rejected placement has denial UI and no cost, XP, progress or save', () => {
  const { game, events, click } = fixture({ valid: false }); click(); assert.equal(game.simulation.resources.stone, 20); assert.equal(game.player.xp, 0); assert.ok(events.includes('toast:Construction denied')); assert.ok(!events.includes('personal-objective')); assert.ok(!events.includes('save'));
});
test('actual legacy model failure occurs after spending, with no transaction rollback', () => {
  const { game, events, click } = fixture({ addThrows: true }); assert.throws(click, /model failed/); assert.equal(game.simulation.resources.stone, 16); assert.equal(game.buildings.records.length, 0); assert.ok(!events.includes('save'));
});
test('actual legacy toast failure can interrupt post-placement XP/save; source runtime must isolate presentation', () => {
  const { game, events, click } = fixture({ toastThrows: true }); assert.throws(click, /presentation failed/); assert.equal(game.buildings.records.length, 1); assert.equal(game.simulation.resources.stone, 16); assert.equal(game.player.xp, 0); assert.ok(!events.includes('save'));
});
test('actual personal construction achievement is a persisted set, not repeat XP application', () => {
  const writes = [], timers = [], context = vm.createContext({ zR: function () {}, localStorage: { setItem: (key, value) => writes.push({ key, value }) }, window: { clearTimeout() {}, setTimeout: (_run, delay) => timers.push(delay) } });
  vm.runInContext('zR.prototype.' + between('recordPersonalObjective=function', '\nzR.prototype.updateRankProgress='), context);
  const game = new context.zR(); Object.assign(game, { user: { teamCode: 'fixture', id: 'owner' }, missionStats: {}, ui: { showToast() {} }, updateRankProgress() {} });
  assert.equal(game.recordPersonalObjective('build-power'), true); assert.equal(game.recordPersonalObjective('build-power'), false); assert.equal(writes.length, 1); assert.deepEqual(timers, [220]); assert.equal(JSON.parse(writes[0].value)[0], 'build-power');
});
test('actual relocation mutates record and visual position then invalidates utility index', () => {
  const calls = [], context = vm.createContext({ zkRelocateMeshFor: () => ({ position: { set: (...args) => calls.push(args) } }) });
  vm.runInContext(between('function zkRelocateMove(', '\nfunction zkRelocateFinish('), context);
  const record = { id: 'b', x: 0, y: 0, z: 0 }, game = { buildings: { siteHeight: () => 3, refreshUtilityRecords: () => calls.push('utility-refresh') } };
  context.zkRelocateMove(game, record, 6, 8); assert.deepEqual(record, { id: 'b', x: 6, y: 3, z: 8 }); assert.equal(game.buildings.zkUtilityIndexedCount, -1); assert.deepEqual(calls, [[6, 3, 8], 'utility-refresh']);
});
test('legacy aid effect wrapper has no earlier implementation in this artifact; exposes partial-failure gate', () => {
  assert.equal(source.match(/applyZeknovanAidProject/g).length, 3);
  const context = vm.createContext({ zR: function () {} });
  vm.runInContext(between('const zkApplyAidProject=zR.prototype.applyZeknovanAidProject;', '\nconst zkAidInitialize='), context);
  const game = new context.zR(); let cooldown = 0; game.beginZeknovanAidCooldown = () => cooldown++;
  assert.throws(() => game.applyZeknovanAidProject({ id: 'aid' }, { type: 'zek_grove' }), /call/); assert.equal(cooldown, 1);
});
