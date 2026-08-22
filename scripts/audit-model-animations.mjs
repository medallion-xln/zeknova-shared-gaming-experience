import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { GLTFLoader } from "../assets/vendor/GLTFLoader.js";
import { MeshoptDecoder } from "../assets/vendor/meshopt_decoder.module.js";
import { Texture } from "../assets/vendor/three.module.min.js";

globalThis.self ??= globalThis;
globalThis.createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });
await MeshoptDecoder.ready;

const runtimePath = new URL("../assets/model-runtime-c96327ba.js", import.meta.url);
const runtime = readFileSync(runtimePath, "utf8");
const modelPaths = [...new Set([...runtime.matchAll(/["'](\.\/assets\/models\/[^"'?]+\.glb)(?:\?[^"']*)?["']/g)].map(([, path]) => path.slice(2)))];
const quarantined = [
  "assets/models/captain-mech-run.anim.glb",
  "assets/models/zeknovan-juggernaut-run.anim.glb",
  "assets/models/zeknovan-saboteur-run.anim.glb",
  "assets/models/zeknovan-skyray-run.anim.glb",
  "assets/models/zeknovan-spitter-run.anim.glb",
  "assets/models/zeknovan-stalker-run.anim.glb",
];
for (const path of quarantined) assert.ok(!modelPaths.includes(path), `Corrupt clip is still referenced: ${path}`);

const loader = new GLTFLoader()
  .setMeshoptDecoder(MeshoptDecoder)
  .setKTX2Loader({
    load(_url, onLoad) {
      const texture = new Texture();
      queueMicrotask(() => onLoad(texture));
      return texture;
    },
  });
async function load(path) {
  const buffer = readFileSync(resolve(path));
  return new Promise((accept, reject) => loader.parse(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    "",
    accept,
    reject,
  ));
}

const purposeRules = [
  [/run(?:-v2)?(?:\.anim)?\.glb$/, /running/i, "run"],
  [/(?:walk|engineer|astronaut|juggernaut|stalker|saboteur|spitter|skyray)\.glb$/, /walking|stance/i, "locomotion base"],
  [/-idle\.anim\.glb$/, /idle|stance|breathe|look/i, "idle"],
  [/-death\.anim\.glb$/, /death|shot|blown/i, "death"],
  [/-heavy-minigun\.anim\.glb$/, /carry|heavy|cannon/i, "heavy weapon pose"],
  [/-roll-fire\.anim\.glb$/, /roll.*fire/i, "roll fire"],
  [/-rifle-fire\.anim\.glb$/, /draw.*shoot|rifle|fire/i, "rifle fire"],
  [/-judgment\.anim\.glb$/, /judgment|skill|slash/i, "boss judgment"],
  [/-combo\.anim\.glb$/, /combo/i, "boss combo"],
  [/-spin\.anim\.glb$/, /spin/i, "boss spin"],
  [/-slash\.anim\.glb$/, /slash|combo/i, "boss slash"],
  [/-dive\.anim\.glb$/, /dive|jump.*ground/i, "boss dive"],
  [/-slam\.anim\.glb$/, /slam|stomp|punch/i, "boss slam"],
  [/-throw\.anim\.glb$/, /pitch|throw/i, "boss throw"],
  [/-ritual\.anim\.glb$/, /cheer|ritual/i, "boss ritual"],
  [/-volley\.anim\.glb$/, /archery|shot/i, "boss volley"],
  [/-hook\.anim\.glb$/, /hook/i, "boss hook"],
  [/-roar\.anim\.glb$/, /gesture|roar/i, "boss roar"],
];

const rows = [];
for (const path of modelPaths) {
  const gltf = await load(path);
  for (const clip of gltf.animations) {
    assert.ok(clip.tracks.length > 0, `${path}: ${clip.name} has no tracks`);
    assert.ok(Number.isFinite(clip.duration) && clip.duration >= 0.05 && clip.duration <= 30, `${path}: invalid duration ${clip.duration}`);
    for (const track of clip.tracks) {
      assert.ok([...track.times, ...track.values].every(Number.isFinite), `${path}: ${clip.name} has non-finite samples`);
      for (let index = 1; index < track.times.length; index += 1) {
        assert.ok(track.times[index] >= track.times[index - 1], `${path}: ${clip.name} timestamps are unordered`);
      }
    }
    const rule = purposeRules.find(([file]) => file.test(basename(path)));
    if (rule) assert.match(clip.name, rule[1], `${path}: clip does not match ${rule[2]} purpose`);
    rows.push({ path, clip: clip.name, duration: Number(clip.duration.toFixed(3)), tracks: clip.tracks.length, purpose: rule?.[2] || "static/base model" });
  }
}

// Animation-only exports must bind to the same 72-track Meshy rig used by a
// loaded full model. This catches semantically named clips exported from an
// incompatible skeleton even when their timestamps are otherwise valid.
const fullRigSignatures = new Set();
const animationRigRows = [];
for (const path of modelPaths) {
  const gltf = await load(path);
  for (const clip of gltf.animations) {
    const signature = [...new Set(clip.tracks.map((track) => track.name.split(".")[0]))].sort().join("|");
    if (path.endsWith(".anim.glb")) animationRigRows.push({ path, signature });
    else fullRigSignatures.add(signature);
  }
}
for (const { path, signature } of animationRigRows) assert.ok(fullRigSignatures.has(signature), `${path}: animation rig does not match a runtime model`);

console.table(rows);
console.log(`Animation audit passed: ${modelPaths.length} runtime model assets, ${rows.length} clips, ${quarantined.length} corrupt exports quarantined.`);
