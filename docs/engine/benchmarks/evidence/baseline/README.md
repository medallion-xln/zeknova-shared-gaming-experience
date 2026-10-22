# BENCH01 baseline evidence

This package records a fresh unit/regression baseline, historical artifact custody and local machine inventory. It does not certify physical gameplay or frame performance; those are separate scenario evidence packages.

The user brief's 263-test starting figure is ZGE10. ZGE11 added six SDK cases, bringing the measured current starting suite to269. The legacy denominator is85 matching test files plus the existing Picasso performance report, yielding86 total; ZGE03/04 temporarily reported82/85 by excluding that extra report.

`manifest-audit.json` checks every explicit artifact-hash map, source/evidence hash record and inventory hash in available milestone manifests. ZGE05/06 contain inventory digests rather than broad artifact maps. All37 historical changed entries from ZGE08/09/10 have later milestone entries that match current bytes. The latest ZGE11 manifest matches186/186 and no referenced file is missing. These historical differences represent documented subsequent milestones, not BENCH01 source writes.

ZGE00 is `docs/engine/CERTIFICATION_RESULTS.md`; there is no separately named ZGE_00_IMPLEMENTATION_REPORT or verification manifest. Reports01–11 were read. Report00 boot timing includes observer/tool latency and is superseded by01; avoid using it as a causal startup regression baseline. Interactive120Hz measurements cannot be directly compared with headless60Hz observations. ZGE08/09 short movement-only throughput cannot establish mixed-workload player capacity. Historical10/11 complete-service mixed traces use comparable6-intent/s pacing,8identities/8gateways and quotas; duration, accumulated archive and host contention still differ.

`environment.json` records actual hardware/software versions; actual backend, viewport and DPR must come from each browser scenario. `custody-check.json` is a point-in-time comparison with the coordinator's7855-file initial inventory. New authorized instrumentation/evidence and final custody are recorded by the coordinator.

Reproduce unit checks from the repository without any build or golden regeneration:

```sh
npm run test:engine
python3 /absolute/path/to/run-legacy.py legacy
npm run check
npm run audit:animations
```

The Python runner writes to `/tmp/zge-bench01/baseline`, executes all85 matching legacy files and Picasso report independently, captures failures without short-circuiting, and does not alter gameplay. Legacy results are per script/file; engine counts are Node test cases. Never sum those denominators as a single coverage measure.
