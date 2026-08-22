import assert from "node:assert/strict";
import { CombatReactionDirector, ANIMATION_CAPABILITIES, REACTION_AUTHORITY } from "../src/game/CombatReactionDirector.js";
import { CombatAudioDirector, COMBAT_AUDIO_POLICY } from "../src/game/CombatAudioDirector.js";

const timers = new Map(); let timerId = 0;
const windowRef = { setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); } };
const reactions = new CombatReactionDirector({ windowRef, now: () => timerId });
assert.equal(ANIMATION_CAPABILITIES.ordinaryEnemies.directionalHit, false);
assert.equal(REACTION_AUTHORITY.canMutateAI, false);

for (const direction of ["front", "back", "left", "right"]) {
  const enemy = { rotation: { y: 1 } };
  reactions.procedural(enemy, direction, false);
  assert.notEqual(enemy.rotation.y, 1);
  timers.get(timerId)();
  assert.equal(enemy.rotation.y, 1, `${direction} reaction recovers`);
}

const rapidEnemy = { rotation: { y: 0 } };
for (let hit = 0; hit < 25; hit += 1) reactions.procedural(rapidEnemy, hit % 2 ? "left" : "right", hit % 5 === 0);
timers.get(timerId)();
assert.equal(rapidEnemy.rotation.y, 0, "rapid reactions restore navigation rotation");

const modelCalls = [];
const boss = { userData: { bossId: "arctic_white_screecher", bossHqModel: { playAttack: (id) => modelCalls.push(id), playDeath: () => modelCalls.push("death") } }, rotation: { y: 0 } };
const stagger = { id: "r1", damageApplied: true, targetType: "boss", bossStaggered: true, killed: false };
reactions.request(stagger, boss, { direction: "front" });
assert.equal(modelCalls[0], "screecher_judgment");
assert.equal(reactions.phase(boss, "phase_2"), true);
assert.equal(reactions.phase(boss, "phase_2"), false, "phase choreography is exact once");
reactions.request({ ...stagger, id: "r2", killed: true }, boss, {});
assert.equal(modelCalls.at(-1), "death");

class AudioParam { setValueAtTime() {} exponentialRampToValueAtTime() {} }
class Oscillator { constructor() { this.frequency = new AudioParam(); } connect(node) { return node; } start() {} stop() {} disconnect() {} }
class Gain { constructor() { this.gain = new AudioParam(); } connect(node) { return node; } disconnect() {} }
class AudioContext { constructor() { this.state = "running"; this.currentTime = 0; this.destination = {}; this.nodes = []; } createOscillator() { const node = new Oscillator(); this.nodes.push(node); return node; } createGain() { return new Gain(); } close() {} }
const audio = new CombatAudioDirector({ windowRef: { AudioContext } });
for (let hit = 0; hit < 100; hit += 1) audio.play({ id: `hit-${hit}`, kind: hit % 10 ? "normal" : "boss-stagger", target: "boss" });
assert.equal(audio.snapshot().peakVoices, COMBAT_AUDIO_POLICY.maxVoices);
assert.equal(audio.snapshot().activeVoices, 16);
for (const voice of [...audio.voices]) voice.onended();
assert.equal(audio.snapshot().activeVoices, 0, "audio voices release without leaks");
assert.ok(audio.snapshot().events <= 64);

console.log("ZEK-22 animation/audio choreography: PASS");
