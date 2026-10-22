# @zge/sdk · preview 11

Local authoring and isolated simulation SDK. Node22+, modern browsers, pinned host Three0.185.0. No original ZekNova game bundle is needed. Plugins are trusted executable code, not a malicious-code sandbox. PHP/SQLite gameplay authority is separate.

Install the SDK tarball with `npm install ./zge-sdk-0.1.0-preview.11.tgz three@0.185.0`. Use an ESM project (`"type":"module"`). Public package exports include TypeScript declarations. Build from captured source with pinned esbuild0.25.11 and `node scripts/zge10-build.mjs`; declarations are emitted into `dist` from the maintained public declaration sources. A clean installed consumer is typechecked with TypeScript6.0.3.

This complete example is executed by documentation certification:

```js
import {createEngine,createProject,transform,parseProject} from '@zge/sdk';
const engine=await createEngine({project:createProject({id:'quickstart',name:'My world'})});
engine.registerComponent('health',{schema:'zge.component.v1',label:'Health',fields:{amount:{type:'number',min:0}}});
const world=await engine.loadWorld('main');
const palette=await engine.importAsset({id:'palette',data:{primitive:'box',color:'#a1c6b1'},license:{source:'self-created example',redistribution:'unknown'}});
const entity=world.createEntity({name:'Explorer',components:{transform:transform({position:[0,.5,0]}),mesh:{primitive:'box',color:'#a1c6b1'},health:{amount:10},asset:{id:palette.id}}});
engine.createPrefab('explorer',entity.id);
const instance=world.instantiatePrefab({prefab:'explorer',overrides:{transform:transform({position:[2,.5,0]})}});
engine.use({id:'example-hooks',install(api){api.events.emit('example:installed',{ready:true});},dispose(){}});
engine.registerSystem({id:'regenerate',run(scene,dt){const e=scene.findEntity(entity.id),health=e.components.health;if(health.amount<10)scene.setComponent(e.id,'health',{amount:Math.min(10,health.amount+dt)});}});
await engine.start();engine.pause();engine.step(1);
const lease=await engine.acquireAsset('palette');const detached=lease.instantiate();lease.release();
const exported=JSON.stringify(engine.exportProject());
const reopened=await createEngine({project:parseProject(exported)});await reopened.loadWorld();
if(!reopened.world.findEntity(instance.id)||detached.color!=='#a1c6b1')throw Error('Roundtrip failed');
await reopened.dispose();await engine.dispose();
```

For browser presentation import `createViewport` from `@zge/sdk/three`, import one shared namespace from `three/webgpu`, and inject `{three:THREE,controls:{OrbitControls,TransformControls},canvas,renderer:'auto'}`. Controls come from the host's `three/addons/controls/...` exports. Use one import-map graph for `three`, `three/webgpu` and addons. The adapter creates no second Three copy. Call `engine.frame(time)` and `viewport.sync(engine.world.entities()); viewport.render()` in your host frame. Default scheduling is manual; explicit step requires pause. Dispose the viewport and engine on close. `attachRenderer` can own manual-frame presentation instead. Camera controls, transform modes/space/snaps and debug methods are declared by the `/three` public entry.

Projects v2 include SDK compatibility, metadata, scenes, declarative component definitions, assets, prefabs, plugin/rule dependencies and import provenance. `parseProject` safely validates JSON and migrates known v1 project files; scenes retain `zge.sdk.scene.v1`. Unknown future versions fail with `SDKError.code`. Negative zero normalizes to JSON zero. No original game/V4 migration is implied. Function validators and arbitrary JS plugin code cannot be serialized; register them explicitly in the trusted host. Portable data-only component definitions recreate their validation exactly.

Reflection supports number, boolean, string, enum, vector, asset and entity fields. `componentSchemas` returns detached metadata; `editProperties` enforces reflected read-only and permission fields. `inspectEntity` filters private player/team/AI and permission-protected components/fields. Raw scenes belong to trusted local application code. These permissions do not sandbox code with direct engine access.

Scene commands are atomic optimistic batches with exact baseRevision and expected entity existence. Supported operations include create/delete/rename/transform/components/prefab instance. Entity IDs persist; duplicate creates a new ID. Organizational/transform hierarchy uses the `editor` component `{parent:null,hidden:false,locked:false,group:'World'}`; references and cycles validate before commit. Parent transforms apply in presentation. Custom runtime rules must account for local parent coordinates. Referenced entities cannot be deleted unless references/children are handled in the same batch. Undo/redo is bounded to100 snapshots, with monotonic revisions and no generated-ID reuse. No-op edits create no revision/history entry. Scene restore starts a new history. Editor undo is unrelated to durable multiplayer rollback.

Only JSON data assets are imported by the portable loader, at most1MiB each. Relative paths, declared hash, parse/size errors and content SHA are checked. Embedded data survives export; no JavaScript is evaluated. Asset manifests support type/name/source/author/SPDX/redistribution metadata; unknown rights do not grant permission. Public `acquireAsset` uses the existing shared AssetService and verifies the canonical JSON hash. `.value` is shared parsed data treated as immutable; `.instantiate()` is detached mutable state. Release leases; loaders own arbitrary resource clone/disposal correctness. GLTF watchdog/fallback in existing engine assets is unchanged and not a new Studio import promise.

`exportProject` is the current portable truth; `engine.project` is initial metadata. Project resources and prefab definitions are included; scene prefab instances preserve source IDs and overrides. Resource creation is not scene undo. Save the returned JSON with explicit user action (Studio downloads it or stores a local browser copy). No unrestricted filesystem/HTTP write API exists. The data-only `installProjectRules` supports bounded move/collect/goal rules; arbitrary plugins require trusted host registration, never implicit code import from a project file.

Common errors: `PROJECT_PARSE` means invalid JSON; `PROJECT_VERSION`/`SDK_VERSION` require a supported version; `REVISION_CONFLICT` needs a new preview on current revision; `PRECONDITION` means entity/component existence changed; `COMPONENT_VALIDATION` identifies invalid component data or references; `OPERATION_UNSUPPORTED` rejects unknown commands. Private or read-only controls cannot be edited through `editProperties`. Missing assets/hash mismatch appear as validation errors. Camera/gizmo interaction requires injecting both controls; no fake handles are displayed when absent.

Mock proposals remain deterministic fixtures with explicit approve/reject and provenance. No natural-language inference, live publishing, production SLA, arbitrary rigid-body physics or full legacy migration is claimed.

### Preview 12: selection batches and static GLB

`scene.batchTransform(['a','b'], [1,0,0], {baseRevision: scene.revision})`
adds a local position offset to 1–100 unique unlocked entities as one atomic
transaction and one undo step. A missing entity, invalid offset, locked entity,
or stale revision rejects the entire batch. Parent and child offsets each apply
in their own local coordinates; this API does not compute a shared world pivot.

`await engine.importModel({id:'marker', bytes:new Uint8Array(await file.arrayBuffer()),
license:{redistribution:'unknown'}})` imports a bounded **static GLB 2** subset.
Only one embedded buffer, one scene/node/mesh, 1–16 triangle primitives,
POSITION/optional NORMAL float attributes, optional uint16/uint32 indices and
opaque base colors are supported. Bake node transforms before import. Limits:
512 KiB source, 30,000 vertices, 1 MiB normalized JSON asset and 4 MiB project.
External references, textures, extensions, animations, rigs, morphs, compressed
geometry and arbitrary executable code are rejected. This is not a general glTF
loader. `inspectGLB(bytes)` returns the validated data-only geometry summary.

The existing AssetService handles hashes, coalescing, leases and detached clones.
Use `engine.acquireAsset(id)` and release its lease. To present verified model
data, call `viewport.setModelAssets([{...reference, data:lease.instantiate()}])`
for the complete model registry before syncing entities with `asset:{id}`.
The viewport owns and disposes its converted GPU geometry/materials; it shares
those resources across instances. Project close must clear that registry with
`setModelAssets([])`; viewport disposal also clears it. Imported rights default
to unknown. Portable projects embed normalized geometry and the source SHA-256;
source bytes are not retained as executable or remotely fetched dependencies.

New projects require preview12, while existing project v1 and preview11/v2 files
remain accepted. Scene v1 stays unchanged. Missing prefab identities and duplicate
asset paths now reject rather than opening ambiguous references. Treat these as
validation tightening when upgrading old malformed files. Nested prefab
propagation and box/group gizmos remain unsupported. Studio provides Ctrl/⌘ and
Shift row selection, a numeric local-offset batch, virtualized large hierarchies,
and a keyboard-accessible Place selected asset alternative to dragging.

Asset paths also reject percent escapes, dot/empty segments and surrounding whitespace to avoid URL-normalization aliases or encoded traversal. This is validation tightening for previously ambiguous files.

Importing a static model into an older supported project raises its exported minimumPreview to12. Portable model data labeled preview11 is rejected so older hosts cannot silently claim model support.
