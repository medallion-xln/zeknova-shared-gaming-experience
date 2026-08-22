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

Run `npm run runtime:reconstruct:verify` to build both candidates twice and
verify golden equality, determinism, public contracts, authority constraints,
tamper rejection, and unchanged live bindings.

