# AI-assisted world authoring — ZGE-13

**Retains the existing mock/deterministic proposal workflow, extending it to model and gameplay-rule contracts. No real provider inference, no natural-language world generation claim, no autonomous live-world mutation.**

## Workflow (unchanged, versioned, reversible)

```
Prompt → Typed Plan → Read-only Preview → Validation → Explicit Approval → Commit → Undo
```

- `mockProposal(scene, { request, kind, entityId })` returns `{schema:'zge.sdk.proposal.v1', provider:'deterministic-mock-v1', request, plan, changeset}`.
- `ProposalReview` wraps the changeset: `preview()` emits a `zge.sdk.diff.v1` diff without mutating state; `reject()` leaves the scene byte-identical; `approve({approved:true})` commits with `source` provenance; each operation is undoable as a normal changeset.
- The Studio `#propose` path renders the diff, dependency warnings (a rule referencing a removed entity), and disables approve/reject until a decision.

## ZGE-13 extension: model + gameplay-rule proposals

`mockProposal` now understands:

- `kind:'add'` — proposed environmental prop (box mesh + transform).
- `kind:'move'` — proposed transform change.
- `kind:'remove'` — proposed entity deletion.
- `kind:'objective'` — a `SetRules` changeset adding a `goal` rule to the scene rules document (validated through `validateRules`; the same `beacon-haven` objective contract).

All proposals require **valid public SDK schemas** (`zge.sdk.changeset.v1` operations, `SetRules` values against `zge.sdk.scene.v1` entities). Unsupported capabilities reject before touching the project; the `ProposalReview` constructor validates the proposal envelope (`deterministic-mock-v1` only).

## Hard constraints

- **Deterministic mock only.** `provider:'deterministic-mock-v1'` — a structured fixture, not natural-language inference. Nothing labels this "AI generation."
- **No autonomous authority.** Every changeset requires explicit `approve({approved:true})`; rejected/stale proposals cannot mutate state.
- **No executable code as data.** Rule proposals are `goal` data, never `eval`/`script`.
- **Versioned + reversible.** Approvals are ordinary commits with undo; proposals carry `baseRevision` and reject on stale state.

## Optional real-provider integration — NOT implemented

No authorized AI provider is connected in a way that produced genuine inference for this milestone, and no new credential installation or secret exposure is authorized. A structured provider adapter remains **opt-in, developer-only, future work**. Because no real provider inference executed against a validated changeset, **natural-language world generation is explicitly NOT marked implemented.**

## Tests

The mock reject/approve/undo and objective-fixture paths are exercised by `scripts/zge13-workflow.mjs` (reject changes nothing; approve commits; undo reverts) and the `beacon-haven` objective proposal in `docs/engine/evidence/zge13/`.
