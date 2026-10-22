# Original ZekNova gameplay analysis — BENCH01 supplement

This supplement analyses the recorded **902.836-second** physical-input browser session. Its raw capture contains **53,953 RAF intervals**, including approximately 4.75 seconds before the timed loop. The filtered timed window contains **53,714 intervals**. This is browser automation, not a human playtest. The original minified runtime was not edited.

**The complete capture does not establish 900 seconds of unobscured playable gameplay.** A later diplomatic incident blocked pointer Save and camera controls. There were 21 action timeouts (12 Save, 9 camera) and zero uncaught page exceptions. Keyboard input and RAF callbacks continued behind the modal. The last successful pointer workflow ended at 525.707 seconds; the first observed pointer failure followed the 586.917-second action boundary. Neither endpoint is a per-frame proof that every earlier frame lacked an overlay. The expected First Contact choice was physically handled at 51.288 seconds. A 60-second warm-up exclusion is provided as sensitivity analysis, not a claim that its exact modal onset was measured.

| Capture window | RAF intervals | Average FPS | Median FPS | 1% low FPS | p95 / p99 ms | >33.33ms | >100ms | Maximum ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Raw, including boot | 53,953 | 59.45 | 59.88 | 30.95 | 16.80 / 16.80 | 118 | 37 | 316.70 |
| Full timed 902.836 s; modal affected | 53,714 | 59.50 | 59.88 | 32.31 | 16.80 / 16.80 | 106 | 36 | 316.70 |
| Through last successful pointer workflow 525.707 s | 31,321 | 59.58 | 59.88 | 35.03 | 16.80 / 16.80 | 67 | 9 | 316.70 |
| 60–525.707 s warm sensitivity | 27,721 | 59.53 | 59.88 | 33.26 | 16.80 / 16.80 | 67 | 9 | 316.70 |
| Before first observed failure 586.917 s | 34,965 | 59.57 | 59.88 | 34.83 | 16.80 / 16.80 | 72 | 12 | 316.70 |

Average FPS is 1,000 divided by mean positive RAF interval. Median FPS is 1,000 divided by median interval. The 1% low is 1,000 divided by the mean slowest ceil(1%×N) intervals. Percentiles sort intervals and select index floor(p×N), capped at N−1. Strict threshold counts include normal 16.7 ms cadence exceeding the provisional 16.67 ms budget; they must not be interpreted as tens of thousands of severe stalls. The full timed window has 33,274 intervals >16.67 ms. RAF records callback delivery, not proof of useful rendered pixels.

The following phase results use only the prefix through the last successful pointer workflow. Labels identify scheduled actions; they are not calibrated high-density scenes or repeated controlled scene trials.

| Scheduled phase | Frames | Average FPS | 1% low FPS | p95 / p99 ms | Maximum ms |
|---|---:|---:|---:|---:|---:|
| camera | 2,680 | 58.67 | 18.40 | 16.80 / 16.80 | 150.00 |
| combat | 6,729 | 59.78 | 43.67 | 16.70 / 16.80 | 83.40 |
| harvest | 3,580 | 59.74 | 41.37 | 16.70 / 16.80 | 100.00 |
| heavy-hud | 3,553 | 59.78 | 43.88 | 16.70 / 16.80 | 83.20 |
| idle | 3,661 | 59.64 | 37.53 | 16.80 / 16.80 | 66.70 |
| movement | 7,361 | 59.50 | 32.53 | 16.80 / 16.80 | 316.70 |
| save | 3,739 | 59.64 | 37.23 | 16.70 / 16.80 | 133.30 |

The largest timed stall was 316.70 ms at about 71.76 seconds during a movement phase. The next was 283.40 ms at 833.15 seconds, after pointer obstruction had been observed. No stalls were deleted. Screenshot markers, checkpoint sampling, frame-array serialization and probe work can perturb timing; proximity is recorded in the JSON without causal attribution. The largest stall is not within 2 seconds of a screenshot; several later 150–167 ms stalls are within about 0.16–0.18 seconds of checkpoint samples. These are hypotheses for a controlled follow-up, not grounds to exclude frames.

The 54 physical movement intervals all produced nonzero endpoint displacement. Their endpoint chords sum to 244.71 metres, including one 42.47 metre health-reset relocation (health 4→100); excluding that likely recovery gives 202.24 metres and a maximum 22.33 metre chord. These are not walking path length or calibrated speed: collision, knockback and automatic recovery can contribute. Six endpoint biome transitions were observed between Highlands and Desert; mission state records those two visited regions. Kills attributed to another biome do not prove player exploration there.

The timed loop ran 54 combat, 27 harvest, 27 heavy-HUD, 27 Save, 24 camera and 54 movement action intervals. Fifteen Save and 15 camera intervals completed without a recorded timeout. Ordinary gameplay reached 1,309 XP, 36 defeated enemies, 14 chopped trees and 5 mined rocks. XP began at 0; the officer remained Ensign, so no rank promotion was certified. Four personal objective IDs were recorded. The grid campaign mission remained waiting for surveys/buildings; no campaign mission completion, boss encounter or construction occurred inside this timed loop. Through the 525.707-second pointer boundary the recorded actor had 861 XP and 16 kills. Screenshots and targeted construction/boss/recovery cases are separate evidence.

There were **128 real HTTP 200 save acknowledgments inside the timed window**. The raw response array contains 133 entries because its live reference also included one earlier and four later responses. Request response-duration p50/p95/p99 were **3.342/8.672/65.487 ms**, maximum 67.220 ms. These network/server measurements exclude the 800 ms game debounce and subsequent JSON/ack processing; they are not click-to-durable latency.

At loop end the client transport reported saved, revision 129, no pending/in-flight job and zero retries/rejections/conflicts/auth expirations. A subsequent direct authenticated APIRequestContext GET bypassed the browser pending-save overlay and returned actual server v4 state, revision 133, 1,333 XP, 38 kills, 14 trees and 5 rocks. It occurred about 28 seconds after the timed loop while gameplay continued during final serialization recovery. The later revision/XP/kills/credits differ from the earlier snapshot for that reason; this is not a same-time equality test and supplies no evidence of state corruption. It also does not substitute for the separate full reload, lost-ACK, conflict, outbox or authentication tests.

A harness serialization error called browser Response.status as a function after the 902.836-second loop had finished. The recorded duration, frames and samples were retained. The next command verified a completed ≥900-second run, captured the final screenshot before navigation, performed a direct server GET and wrote the data. The original error remains in result 7; no gameplay assertion or duration was relaxed.

| Memory metric, first→last sampled | First MiB | Last MiB | Peak MiB | Last 20 samples, slope MiB/min |
|---|---:|---:|---:|---:|
| performance.memory usedJSHeapSize | 137.23 | 832.10 | 885.39 | +0.665 |
| CDP JSHeapUsedSize | 48.92 | 126.75 | 179.44 | +0.482 |
| Renderer-reported total estimate | 84.72 | 982.99 | 982.99 | +0.133 |
| Renderer-reported textures estimate | 72.34 | 752.17 | 752.17 | +0.000 |
| Fetch cache | 9.54 | 58.76 | 63.84 | +0.000 |
| Parsed cache | 61.88 | 53.29 | 61.88 | +0.000 |

These accounting scopes differ substantially. Do not sum CDP heap, performance.memory heap and renderer estimates, infer a precise GPU allocation, or call the difference retained garbage. Much renderer growth occurs during early asset/model streaming; later texture estimates plateau while JS heap varies. CDP heap ranges 45.20–179.44 MiB across samples, and its positive tail slope is an observation requiring fixed-state retained-object analysis. No forced-GC, dominator or allocation-root investigation was performed in this session.

Observed workers remained 5 (4 KTX2 + 1 adaptive); intervals remained 31. Leak-probe live listeners 184→199, detached listeners 11→14, pending RAF 12→10 (range 10–14). CDP event listeners 239→320 (peak 375); DOM nodes 5,796→22,716 (peak 41,850); layout objects 2,458→11,258. Those increases, UI creation and nonmonotonic garbage collection require investigation, but this session proves neither a retained leak nor leak freedom. The original game was not repeatedly restarted under a controlled fixed-state memory workload.

Across the 886.675-second first-to-last CDP sample span, renderer-process CPU grew 391.44 seconds, approximately 44.15% of one core; main-thread task time grew 320.06 seconds, approximately 36.10% busy time. These are scoped CDP process/thread counters, not whole-machine CPU or GPU utilization. GPU duration/utilization was unavailable; renderer timestamp readings were zero. This 60 Hz headless capture does not evaluate 120 FPS capability and cannot be causally compared with historical 120 Hz interactive runs.

Asset watchdog evidence reached 88 completed loads with 0 stalls/0 failures, load p50/p95/max 25.8/121.6/226.8 ms, one bounded 4-worker pool, and 0 pending leases at sampled end. Fetch/parsed caches remained within their 64 MiB budgets, while renderer resources are separately accounted. However, the resource timing table retained exactly 250 entries, consistent with its default buffer limit; only 16 asset entries are present. Their 2.8 ms median and 10.7 ms maximum are a partial network sample, not a session-wide asset latency distribution. Zero duplicates in those 16 entries does not certify zero duplicate downloads. The old GLTF initialization hang did not reproduce and its definitive cause remains unresolved. The existing duplicate-Three warning remains.

Evidence-based provisional suggestions for the coordinator: controls 6/10, performance 6/10, stability 4/10 and progression 5/10, with the qualifications above. Sound and fun are NOT_EVALUATED. Graphics needs actual screenshot review. No overall game score or full gameplay PASS should be computed from this partial supplement alone. Targeted renderer, boss, physics, construction and persistence cases remain separate acceptance evidence.

Source: `original-long.json`, SHA256 `6895eb7c48137381991538cb7355c93dc02a96ba48e51d2e20b50b1448ce543f`. Machine-readable calculations and plot-ready frame/memory/CPU series: [original-analysis.json](evidence/original-analysis.json).
