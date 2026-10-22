# Source build reproducibility — ZGE-09

`scripts/zge09-source-snapshot.mjs` captures a declared independent engine/authority test boundary into a new owner-private temporary directory. It resolves the complete JavaScript import graph with esbuild, preserves readable PHP/schema/runtime files and source-policy inputs, writes a SHA-256 inventory, builds a standalone ESM SDK twice and checks identical output hashes. It refuses legacy assets, third-party module files, escaping paths, symlinked inputs, public parents, existing targets and sources that change during capture. The generated snapshot contains neither `assets/` nor `node_modules/`.

The final complete capture included 79 readable files, produced a 146,708-byte standalone ESM engine, ran **64/64 selected original tests** inside the isolated snapshot, syntax-checked 19 PHP files and executed the standalone bundle's kernel step/disposal smoke test. Final capture metadata, source hashes and logs are published with ZGE-09 evidence. Its source-tree SHA-256 is `63b567879b19f742234763c1524eefd8d67ef192558ac07add8878e3d0fbe888`; the standalone build SHA-256 is `36be5f9a1ffda63b6e90780246bdf8f1a46219c336779377dfe6a923214bb0b9`. The source-only compressed capture is `evidence/zge09/reproducibility/source-snapshot-final.tar.gz`. The source snapshot is a frozen copy independent of further worktree changes; its generated `source-manifest.json` identifies exactly what was tested.

| Custody category | Demonstrated boundary |
|---|---|
| Core, construction, personal/team progress, missions and tooling | Readable import closure, deterministic ESM output, captured original tests; no historical game bundle dependency |
| PHP/SQLite and persistent Node authority runtime | Readable sources and policy fingerprints captured; selected supervised IPC/lease/crash tests execute from the snapshot using system Node/PHP/PDO SQLite |
| Browser staging presentation | The normal repository/browser regression provides evidence; the headless source snapshot does not include the complete browser UI/Three.js/media asset distribution |
| Original ZekNova generated game | Missing original buildable source remains a blocker; historical minified bundle is excluded, unchanged and not claimed reproducible |
| Historical timeout patches and golden assertions | Existing artifact lineage and known golden mismatch retained; no hash re-pin or patch rewrite occurs |
| Assets and model weights | Excluded from this source-only build; independent provenance/licensing and artifact-custody gates remain; neural inference stays mock-only |

## Reproduce a capture

From the normal repository with its existing locked esbuild installation, Node and PHP/PDO SQLite:

```sh
mkdir -m 700 /tmp/zge09-source-custody
node scripts/zge09-source-snapshot.mjs /tmp/zge09-source-custody/capture
```

The capture creates a minimal ESM `package.json`, `source-engine.mjs`, `build/engine.mjs`, complete source manifest, selected test logs and no authentication fixture contents. Generated test databases/credentials remain in separate disposable private fixture directories outside the snapshot. A failed capture is not a release artifact; preserve its diagnostic log and select a new target for retry.

To verify the captured sources on a clean machine, provide the recorded Node/PHP versions and PDO SQLite, then execute the `selectedTests` list from `source-manifest.json` with Node's built-in test runner from the capture directory. These tests require no npm packages. Example safe programmatic invocation:

```js
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const manifest = JSON.parse(readFileSync('source-manifest.json'));
const result = spawnSync(process.execPath,
  ['--test', '--test-concurrency=1', ...manifest.selectedTests],
  { stdio: 'inherit' });
process.exitCode = result.status;
```

For an independent rebuild, install the manifest-recorded esbuild version into a separate build-tools directory, outside the capture. Use its JavaScript `build` API with `absWorkingDir` equal to the capture, `entryPoints:['source-engine.mjs']`, `bundle:true`, `platform:'node'`, `format:'esm'`, `legalComments:'none'`, `write:false` and `outfile:'build/engine.mjs'`; compare SHA-256 with the manifest. Build tooling is a recorded external dependency, not silently shipped as original engine source. The standalone output itself needs only Node built-ins and can run without esbuild or npm modules.

The current machine was Node v22.22.2, esbuild 0.25.11 and PHP 8.5.9. Byte identity has been measured for repeated builds with this toolchain, not asserted across arbitrary compiler/OS versions. Signed releases, remote artifact escrow, full browser asset redistribution and a clean build of the original legacy game remain separate release gates. No commit or production artifact deployment is performed by this tooling.
