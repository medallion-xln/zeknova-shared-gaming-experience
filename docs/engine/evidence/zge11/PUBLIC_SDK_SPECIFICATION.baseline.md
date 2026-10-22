# Public SDK preview 10

The local SDK is `@zge/sdk` version `0.1.0-preview.10`. `npm run build:sdk` creates deterministic distributable ESM exports. `npm pack ./packages/sdk` produces an installable artifact containing only `dist`, package metadata and README. The independent project imports `@zge/sdk` and `@zge/sdk/three`, never an engine source path or ZekNova gameplay module. Browser import maps resolve those public entries. The clean-build certification installs that packed artifact in a fresh environment and executes the same public tests there.

The SDK owns project/scene schemas, component registry, local transactional entity operations, stable identifiers, previews, revision history, permission-filtered inspection and public asset identity mapping. It composes the existing kernel lifecycle, clock, events, systems, metrics and plugin dependency/disposal machinery, plus AssetService. It is more than aliases for private runtime methods. The original core/authority interfaces remain compatible.

```js
import {createEngine} from '@zge/sdk';
const engine = await createEngine({project: './my-world', renderer: 'auto'});
const world = await engine.loadWorld('main');
world.createEntity({name: 'Structure', components: {transform: {position: [0, 0, 0]}}});
await engine.start();
// Default manual scheduler: the host drives engine.frame(time).
```

A string fetches `project.json` relative to the browser, or a supplied JSON URL. Node hosts can supply the manifest object or an absolute HTTP URL. Local filesystem project discovery is unsupported. A project declares schema, ID, name, entry world, embedded scene data, assets, prefabs and trusted plugin IDs. `sdk:manifest` generates the independent project's stable JSON; `--check` verifies it. No automatic arbitrary project JavaScript loading occurs.

| Surface | Public contract |
|---|---|
| Creation | async `createEngine({project,renderer,scheduler,authorize})`; `dispose()` idempotently releases owned registries/assets/kernel/presentation |
| Project/world/scene | `loadWorld(id)`, `createWorld(id)`, `world`; a world in this preview is one flat authoring scene, with one active scene for systems |
| Entity | `createEntity({id?,name?,components?})`, `findEntity`, `entities`, `deleteEntity`; detached reads |
| Components | `registerComponent(type,validator)`, `setComponent`; builtins transform, primitive mesh, AABB collider, generic state, public asset reference |
| Systems | `registerSystem({id,phase,run(scene,dt,info),dispose})`; kernel phases/order and fixed steps; trusted synchronous callbacks |
| Prefabs | project templates; `createPrefabInstance`, new stable ID, optional transform override |
| Assets | `assetReference(id)`, `acquireAsset(id,options)` resolves registered project path through `engine.assets`; no hidden model loader |
| Transform | complete position/XYZ Euler radians/positive scale; numeric edits support all vectors, pointer gizmo supports X/Z translation |
| Lifecycle | `start`, `pause`, `resume`, `step(1..120)`, `frame`; explicit step requires pause |
| Serialization | detached `zge.sdk.scene.v1`; atomic validated restore, no automatic migration from legacy saves or ZGE-09 ECS scene format |
| Events/metrics | `events.on/emit`, explicit authoritative/visualization channel; existing kernel diagnostics and system timings through `metrics()` |
| Inspection | `inspectEntity`; private player/team/AI fields require includePrivate and synchronous named authorization, default deny |
| Rendering | preference none/auto/webgpu/webgl; separate `/three` adapter accepts the host's shared Three namespace; `attachRenderer` optionally owns manual-frame sync/present/disposal |
| Plugins | `use({id,requires?,install,start?,stop?,dispose?})` before start; callbacks receive public engine only |

The manual scheduler makes deterministic headless stepping and host-controlled rendering explicit. `scheduler:'auto'` schedules kernel systems; the host remains responsible for presentation unless it supplies its own render system. Browser samples use manual frames. The `/three` adapter initializes WebGPU where available and uses the same injected r185 graph's WebGL backend on explicit request or failed/unavailable GPU initialization. It imports no second Three runtime. No legacy embedded Three deduplication is claimed.

Formats are versioned preview contracts, not a stable 1.0 ABI. Unsupported features include parenting, general rigid bodies, arbitrary scripts from JSON, remote editor authority, multiplayer undo, full V4 migration and real AI inference. Trusted local plugins/validators are not sandboxed malicious code. Asset SHA declarations identify content but loader-specific byte verification is still the host's responsibility. See `packages/sdk/README.md` and transaction/lifecycle documents.
