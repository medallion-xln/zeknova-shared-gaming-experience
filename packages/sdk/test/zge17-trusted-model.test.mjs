import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {
  createEngine, createProject, parseProject, SDKError,
  describeTrustedModel, validateTrustedModel, readGLBHeader, requiredDecoders,
  TRUSTED_MODEL_SCHEMA, KNOWN_EXTENSIONS,
} from '../src/index.js';

/* ZGE-17 AC6/AC7 — asset pipeline parity against the project's REAL first-party art.
 *
 * These run in Node against assets/models/*.glb. They read each file's JSON chunk and its
 * digest, so they need no GPU, no browser and no decode — which is what makes them a usable
 * CI gate. Actually loading the geometry (AC5) and proving residency under a live renderer
 * (AC8) require a browser; examples/asset-parity/ does that half. */

const root = new URL('../../../', import.meta.url);
const read = (relative) => readFile(fileURLToPath(new URL(relative, root)));

/* 20 models spanning every category the game ships: player officers, the enemy/boss roster,
 * standalone animation clips, environment, and the three village kits. Chosen to cover each
 * decoder path (meshopt, Basis/KTX2, WebP) and both skinned and static content. */
const SUBSET = Object.freeze([
  // player / officer
  'assets/models/captain-engineer-walk.glb',
  'assets/models/captain-engineer-run.glb',
  'assets/models/lieutenant-astronaut.glb',
  'assets/models/captain-mech-run.glb',
  // enemy + boss roster
  'assets/models/boss-obsidian-knight.glb',
  'assets/models/boss-archive-shade.glb',
  'assets/models/boss-insect-king.glb',
  'assets/models/boss-ancient-thornwarden.glb',
  'assets/models/zeknovan-skyray-walk.glb',
  // standalone animation clips
  'assets/models/boss-archive-shade-slash.anim.glb',
  'assets/models/boss-insect-king-spin.anim.glb',
  // environment
  'assets/models/environment/alien-palm-tree.glb',
  'assets/models/environment/giant-canopy-tree.glb',
  'assets/models/environment/tiered-stone-pillar.glb',
  'assets/models/environment/alien-coral-ground.glb',
  // village kits
  'assets/models/environment/village-kit/oval-awning.glb',
  'assets/models/environment/village-kit/round-market-hut.glb',
  'assets/models/environment/forest-village/community-well.glb',
  'assets/models/environment/desert-village/elder-communal-dome.glb',
  'assets/models/environment/wetlands-village/water-wheel-mill.glb',
]);

const manifests = new Map();
for (const path of SUBSET) {
  const bytes = await read(path);
  manifests.set(path, { bytes, manifest: await describeTrustedModel({path, bytes}) });
}

test('AC6: every model in the subset describes cleanly with no unrecognised extensions', () => {
  assert.equal(SUBSET.length, 20, 'the subset is twenty models');
  assert.equal(new Set(SUBSET).size, 20, 'no duplicates');
  for (const [path, {manifest}] of manifests) {
    validateTrustedModel(manifest);
    assert.equal(manifest.schema, TRUSTED_MODEL_SCHEMA, path);
    assert.deepEqual(manifest.unknownExtensions, [], `${path} uses an extension the pipeline does not know`);
    // Geometry files carry meshes; *.anim.glb clip files carry only animation to retarget.
    if (manifest.kind === 'geometry') {
      assert.ok(manifest.vertices > 0, `${path} is geometry but reports no vertices`);
      assert.ok(manifest.meshes > 0, `${path} is geometry but has no meshes`);
    } else {
      assert.equal(manifest.kind, 'animation', path);
      assert.equal(manifest.meshes, 0, `${path} is a clip file but carries meshes`);
      assert.ok(manifest.animations.length > 0, `${path} is a clip file with no clips`);
      assert.ok(manifest.nodes > 0, `${path} has no hierarchy to retarget onto`);
    }
    for (const name of manifest.extensions) assert.ok(name in KNOWN_EXTENSIONS, `${path}: ${name}`);
  }
});

test('AC6: materials and textures survive description, and the subset spans every decoder path', () => {
  const all = [...manifests.values()].map((v) => v.manifest);
  const textured = all.filter((m) => m.textured);
  assert.ok(textured.length >= 10, `expected most of the subset to carry textures, got ${textured.length}`);
  for (const m of textured) {
    assert.ok(m.materials > 0, `${m.path} has textures but no materials`);
    assert.ok(m.textures > 0 && m.images > 0, `${m.path} texture/image counts disagree`);
    assert.ok(m.attributes.includes('TEXCOORD_0'), `${m.path} is textured but has no TEXCOORD_0`);
  }
  const decoders = requiredDecoders(all);
  assert.ok(decoders.includes('meshopt'), 'subset must exercise EXT_meshopt_compression');
  assert.ok(decoders.includes('ktx2') || decoders.includes('webp'), 'subset must exercise a compressed texture path');

  const skinned = all.filter((m) => m.skinned);
  assert.ok(skinned.length >= 5, `expected skinned models in the subset, got ${skinned.length}`);
  for (const m of skinned) {
    assert.ok(m.attributes.includes('JOINTS_0') && m.attributes.includes('WEIGHTS_0'), `${m.path} is skinned without joint attributes`);
  }
  assert.ok(all.some((m) => m.animations.length > 0), 'subset must include animation clips');
});

test('AC6: descriptions are deterministic and anchored to file content', async () => {
  for (const [path, {bytes, manifest}] of manifests) {
    const again = await describeTrustedModel({path, bytes});
    assert.deepEqual(again, manifest, `${path} description is not deterministic`);
    // Independent digest, computed with a different implementation than the SDK's.
    const expected = createHash('sha256').update(bytes).digest('hex');
    assert.equal(manifest.sourceSha256, expected, `${path} digest mismatch`);
    assert.equal(manifest.sourceBytes, bytes.length, `${path} size mismatch`);
    // A single flipped byte in the BIN chunk must change custody without breaking the header.
    const tampered = Uint8Array.from(bytes); tampered[tampered.length - 1] ^= 1;
    const after = await describeTrustedModel({path, bytes: tampered});
    assert.notEqual(after.sourceSha256, manifest.sourceSha256, `${path} tampering went undetected`);
  }
});

test('AC7: importing carries sha256 custody and licence for every model, and round-trips', async () => {
  const engine = await createEngine({project: createProject()});
  await engine.loadWorld();
  let n = 0;
  for (const [path, {bytes}] of manifests) {
    const asset = await engine.importTrustedModel({
      id: `m${n++}`, path, bytes,
      license: {source: 'first-party', spdx: 'LicenseRef-ZekNova-Internal', redistribution: 'permitted'},
    });
    assert.equal(asset.type, 'trusted-model');
    assert.equal(asset.path, path, 'the project references the real file, not a copy');
    assert.match(asset.sha256, /^[a-f0-9]{64}$/, 'manifest integrity digest');
    assert.match(asset.data.sourceSha256, /^[a-f0-9]{64}$/, 'file custody digest');
    assert.equal(asset.license.redistribution, 'permitted');
    assert.equal(asset.license.source, 'first-party');
  }
  const trusted = engine.trustedModels();
  assert.equal(trusted.length, 20);
  assert.ok(trusted.every((a) => /^[a-f0-9]{64}$/.test(a.data.sourceSha256)), 'every model carries custody');
  assert.ok(engine.requiredDecoders().includes('meshopt'), 'the project reports the decoders it needs');

  // The manifest survives export/parse, so a consumer can check custody without the files.
  const exported = engine.exportProject();
  const reopened = await createEngine({project: parseProject(JSON.stringify(exported))});
  await reopened.loadWorld();
  assert.deepEqual(reopened.trustedModels(), trusted);
  assert.deepEqual(reopened.requiredDecoders(), engine.requiredDecoders());
  await reopened.dispose();
  await engine.dispose();
});

test('AC7: licence defaults to unknown redistribution, as the untrusted tier does', async () => {
  const engine = await createEngine({project: createProject()});
  await engine.loadWorld();
  const path = SUBSET[0];
  const asset = await engine.importTrustedModel({id: 'unlicensed', path, bytes: manifests.get(path).bytes});
  assert.equal(asset.license.redistribution, 'unknown', 'provenance is unknown until a creator supplies it');
  await engine.dispose();
});

test('the trusted tier rejects bad input rather than trusting its name', async () => {
  const good = manifests.get(SUBSET[0]).bytes;
  await assert.rejects(() => describeTrustedModel({path: '/absolute.glb', bytes: good}), (e) => e instanceof SDKError);
  await assert.rejects(() => describeTrustedModel({path: '../escape.glb', bytes: good}), (e) => e instanceof SDKError);
  await assert.rejects(() => describeTrustedModel({path: 'ok.glb', bytes: new Uint8Array(8)}), (e) => e instanceof SDKError);
  await assert.rejects(() => describeTrustedModel({path: 'ok.glb', bytes: good, maxBytes: 1024}), (e) => e instanceof SDKError);
  const notGLB = Uint8Array.from(good); notGLB[0] = 0;
  await assert.rejects(() => describeTrustedModel({path: 'ok.glb', bytes: notGLB}), (e) => e instanceof SDKError);
  assert.throws(() => readGLBHeader(new Uint8Array(4)), (e) => e instanceof SDKError);
  assert.throws(() => validateTrustedModel({schema: 'wrong'}), (e) => e instanceof SDKError);

  const engine = await createEngine({project: createProject()});
  await engine.loadWorld();
  await assert.rejects(() => engine.importTrustedModel({id: 'bad', path: 'nope.glb', bytes: new Uint8Array(8)}));
  assert.equal(engine.trustedModels().length, 0, 'a rejected import leaves no asset behind');
  assert.throws(() => engine.registerAssetLoader('gltf', {}), (e) => e instanceof SDKError);
  await engine.dispose();
});

test('the untrusted tier is unchanged and still refuses this art', async () => {
  const engine = await createEngine({project: createProject()});
  await engine.loadWorld();
  // Every one of these would be accepted by no version of inspectGLB: that is the point of the
  // two tiers, and the reason widening the hardened parser was not the answer.
  for (const path of SUBSET.slice(0, 5)) {
    await assert.rejects(
      () => engine.importModel({id: `u-${path.replace(/\W/g, '')}`.slice(0, 60), bytes: manifests.get(path).bytes}),
      (e) => e instanceof SDKError,
      `${path} must NOT pass the untrusted importer`,
    );
  }
  await engine.dispose();
});

test('AC6: the subset carries both geometry and retargetable clip files', () => {
  const all = [...manifests.values()].map((v) => v.manifest);
  const geometry = all.filter((m) => m.kind === 'geometry');
  const clips = all.filter((m) => m.kind === 'animation');
  assert.ok(geometry.length >= 15, `expected mostly geometry, got ${geometry.length}`);
  assert.equal(clips.length, 2, 'subset includes the two standalone clip files');
  for (const m of clips) {
    assert.ok(m.path.endsWith('.anim.glb'), `${m.path} is a clip file but not named .anim.glb`);
    assert.equal(m.skins, 0, `${m.path} clip files retarget rather than carry their own skin`);
  }
});
