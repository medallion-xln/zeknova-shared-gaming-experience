# Graphics and frame performance

M1Pro10CPU/16GPU,16GiB; macOS26.5.2, Chrome155.0.8059.85, Playwright1.64.0-alpha-1790635538000; 1440×1000 CSS viewport,DPR1. The physical display is120Hz, but this headless capture paced near60Hz. Neither120FPS support nor120FPS failure is established. Node22.22.2/PHP8.5.9; Three0.185.0 is the installed SDK peer. The original bundle also embeds a separate Three runtime.

Actual original-game paths: WebGPU; WebGL safe mode; navigator.gpu-unavailable fixture→actual automaticWebGL fallback; native reference capture; unavailable neural service→native; explicit labeled neural mock. **No Matrix-Game inference occurred.** Safe mode substitutes simpler assets, so its FPS is not an equivalent-content renderer speedup.

| Trial/path | Repeat | Frames | AvgFPS | 1%lowFPS | p95ms | p99ms | Maxms |
|---|---:|---:|---:|---:|---:|---:|---:|
| webgpu / WebGPU | 1 | 600 | 60.00 | 59.52 | 16.80 | 16.80 | 16.80 |
| webgpu / WebGPU | 2 | 599 | 59.80 | 44.84 | 16.80 | 16.80 | 33.30 |
| webgl-safe / WebGL | 1 | 590 | 59.00 | 22.46 | 16.70 | 16.80 | 100.10 |
| webgl-safe / WebGL | 2 | 556 | 55.60 | 7.20 | 16.80 | 16.80 | 499.90 |
| neural-none / WebGPU | 1 | 601 | 60.00 | 59.52 | 16.70 | 16.80 | 16.80 |
| neural-none / WebGPU | 2 | 600 | 59.90 | 51.15 | 16.70 | 16.80 | 33.30 |
| reference / WebGPU | 1 | 600 | 60.00 | 59.52 | 16.80 | 16.80 | 16.80 |
| reference / WebGPU | 2 | 600 | 59.90 | 51.15 | 16.80 | 16.80 | 33.30 |
| neural-mock / WebGPU | 1 | 599 | 59.90 | 51.11 | 16.80 | 16.80 | 33.40 |
| neural-mock / WebGPU | 2 | 592 | 59.10 | 25.70 | 16.80 | 33.30 | 50.10 |

Each row is a fixed10s foreground idle trial after boot/warm-up. The natural loop separately exercises movement/combat/harvest/HUD/save/camera and real streaming. Full timed trace: **59.50FPS**, **32.31FPS1%low**, p95/p99 **16.80/16.80ms**, max **316.7ms**; 106 intervals>33.33ms and 36 >100ms. It includes later modal-obscured rendering. Through the last successful pointer workflow525.707s: **59.58FPS**, **35.03FPS1%low**. These windows must not be combined or treated as uninterrupted visible900s gameplay.

Average=1000/mean interval; median=1000/median interval;1%low=1000/mean of slowest ceil(1%N) intervals. Percentiles use floor((N−1)p). Strict16.67ms counts are sensitive to Chrome's16.7/16.8ms timestamp quantization. RAF measures frame opportunities, not GPU presentation latency; renderer draw submissions and real screenshots corroborate active rendering. No GPU timestamp duration or GPU utilization was captured despite available timestamp-query capability. CDP renderer main-thread TaskDuration was 36.10% of one core over the sampled span; this is not whole-host CPU utilization.

| Cache condition | Nav→usablems | Physicalclick→gameplay-readyms | Click→covergone/enginerunningms | Nav→canvasdoubleRAFproxyms |
|---|---:|---:|---:|---:|
| Cold HTTP | 2803.3 | 321.7 | 2636.4 | 481.9 |
| Warm HTTP | 1457.9 | 351.0 | 1308.3 | 494.3 |
| Cold HTTP | 1357.5 | 306.4 | 1223.7 | 435.0 |
| Warm HTTP | 1413.8 | 243.0 | 1274.3 | 378.0 |
| Cold HTTP | 1611.3 | 323.9 | 1399.9 | 530.0 |
| Warm HTTP | 1245.8 | 290.5 | 1121.7 | 407.3 |

Cold means browser HTTP cache cleared, then cache allowed to populate; warm retains the same profile cache. OS cache is uncontrolled. Navigation→usable includes the scripted launcher interaction but not browser-process launch. Actual gameplay-ready event, lifecycle-running/cover-gone and first-canvas-doubleRAF proxy are different gates. The proxy is not proof of first useful rendered pixels; precise first-useful-pixel timing remains NOT_MEASURED. Startup diagnostics time terrain/world initialization separately from GLTF/shader settlement.

Scene coverage: A idle,B movement,D ordinarycombat,H HUD,I saves appear in the natural trace; E realboss combat and F physical construction have fixture trials; G Highlands/Desert transitions occur in movement; J source multiplayer reconciliation is separately measured. The default world has54residents and persistent enemies, but no equivalent maximum-density canonical fixture or full-five-biome traversal is claimed. Boss/renderer trials are small samples, not minimum-FPS guarantees.

Historical ZGE02~118.8FPS and earlier startup numbers have different pacing/scene/measurement boundaries; classification **NONCOMPARABLE**, no percentage regression claim. Source short-workload versus900/1200s historical latency is also duration-limited. Test screenshots/checkpoints can perturb tails; spikes have not been assigned solely to gameplay, shaders, GC or storage.

[Charts](charts/README.md): frame/FPS distributions, spikes, startup, memory, CPU, assets, source scaling, latency and save acknowledgments.
