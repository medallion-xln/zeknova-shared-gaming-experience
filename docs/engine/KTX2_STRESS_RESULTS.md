# KTX2 worker stress results — ZGE-03

Real Chrome, local development server, real checked-in `captain-mech-walk.low.glb`, embedded KTX2 data and checked-in Basis WASM. No generated model weights or external inference. The fixture runs in WebGL through `examples/asset-stress/`; the browser certification imports the same fixture with the live game's actual WebGPU renderer. Raw results are in `evidence/zge03/stress-*.json`.

Reproduce:

```sh
npm run dev
# Open http://127.0.0.1:8790/examples/asset-stress/
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node scripts/zge03-browser-certification.mjs
```

`CHROME_PATH` can select an installed Chrome. This QA script creates an isolated local team/save; do not point it at a production service. No package installation is required if Playwright is already available. All fixtures use local resources and preserve procedural fallback paths.

| Case | Mechanism | Expected result |
|---|---|---|
| Pool sizes 1, 2, 4, 8 | 16 concurrent real transcodes per size | All settle successfully; live worker count ≤ configured limit |
| Concurrent GLTF | 4 real GLTF loads per cycle, three new loader/disposal cycles | All settle; textures/materials/geometry and pool disposed each cycle |
| Worker termination | Post a real transcode, immediately terminate its worker | Replacement pool rejects immediately; fresh-byte retry succeeds |
| Silent worker | Suppress the transcode post | 2-second fixture timeout rejects; fresh-byte retry succeeds |
| Original-pool oracle | Same forced termination with unmodified vendor pool | Remains pending at the fixture's 250-ms deadline |
| Malformed bytes | Invalid KTX2 identifier | Synchronous/bounded error |
| Unsupported format | Valid KTX2 container with unsupported Vulkan format | Bounded error |
| Initialization failure | Missing transcoder path | Bounded worker/error rejection |
| Page restart | Reload fixture and rerun all cases | Newly created pools settle and dispose |
| Browser process restart | Independent fresh Chrome runs of the certification | Cases reproduced in new browser processes |

Measured runs completed all normal work at every pool size. Forced termination rejected in under 2 ms; deliberately silent work rejected at approximately 2000 ms in the fixture, then retries succeeded. Normal concurrent transcodes were roughly 70–215 ms per sixteen-texture batch; GLTF batches varied with backend/cache and browser scheduling. Exact timings are evidence samples, not universal performance bounds. Live default pool is 4, deadline 15 seconds; full asset load deadline is 45 seconds.

## What was reproduced

The original WorkerPool returns a Promise with only a resolver and no worker-error/termination rejection path. Fault injection reproduces its orphaned request: after termination it does not settle by the independent deadline. The replacement has error and messageerror listeners, termination interception, deadlines covering queued and active work, and generation reset. Reset rejects every outstanding task, clears timers, removes listeners and terminates old workers. Subsequent work creates fresh workers. Transfer buffers are detached on post; retry must fetch/clone new source bytes. The fixture does exactly that.

This is a conclusive reproduction and repair of **a worker-death non-settlement failure mode**. It is **not** a conclusive reproduction or attribution of the historical GLTF initialization hang. There is no captured original crash trace, OOM evidence or matching historical session. `GLTF_HANG_ROOT_CAUSE=UNRESOLVED`; worker pressure remains a plausible contributor. Consolidation reduces the normal two-pool/eight-worker maximum to one pool/four workers. Real native worker crashes without an error event remain bounded by deadline rather than immediate detection.

Initialization failures are bounded by worker/asset guards but an initialization promise can remain rejected inside a KTX2Loader. Pool restart certification covers worker-generation failures after successful initialization; full transcoder initialization recovery may require disposing/recreating the asset service. No transparent infinite retries are enabled in gameplay.
