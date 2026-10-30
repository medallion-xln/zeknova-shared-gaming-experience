# Reconstructed ZekNova runtime source

This directory is the maintainable, repository-owned source lineage recovered
from the frozen compatibility runtime. The production files in `assets/` remain
golden references and are not build inputs.

The compatibility source is split at stable capability boundaries. Individual
segments intentionally preserve lexical scope across boundaries; their ordered
manifest is the entrypoint. This keeps the recovered implementation lossless
while allowing later, separately certified refactors into standalone modules.

`model/model-runtime.js` is the complete readable model subsystem with all 20
public exports. It supersedes the legacy partial `assets/model-runtime.js` as a
source owner, but does not replace either live asset during this stage.

Run `npm run runtime:reconstruct:verify` to build both candidates and verify
reviewed lineage, public contracts, authority constraints, tamper detection and
unchanged live bindings. Use `npm run verify:reproducible` for independent builds.


## ZGE-18A provenance and candidate policy

`provenance.json` identifies A: untouched shipping references selected by `Game.js`, B: ordered
reconstructed sources, C: historical committed artifact digests at f91da08, and D: generated
reviewed candidates. The model candidate reproduces shipping bytes exactly. Compatibility has
an explicit candidate-only correction to the final staged RB-1 HQ wait, in addition to the
three reconciled historical differences. It is not silently promoted into the launch path.

Candidates live under `artifacts/` for comparison. Their relative imports are deployment-relative:
interpret them at the manifest's `deploymentPath` under `assets/`, never execute them in place
from `artifacts/runtime-reconstruction/`. The model source is emitted verbatim; no URL rewriting
or independent decoder construction is introduced. Integrity verification validates source,
candidate and shipping hashes, while mutation tests exercise rejection of tampered files.

`runtime:reconstruct:verify` builds once and verifies provenance/contracts; the separate
`verify:reproducible` command builds twice in independent installations.
