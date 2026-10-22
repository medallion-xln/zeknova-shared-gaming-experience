# Mock AI changeset review protocol

This release has a deterministic fixture provider only. A free-text request is a provenance label; it is not interpreted by a model. The user explicitly chooses add/move/remove fixture behavior. Provider identity is `deterministic-mock-v1`; UI labels it **DETERMINISTIC MOCK**. No network model provider, Matrix-Game inference, generated confidence or invented decision trace is present.

`zge.sdk.proposal.v1` contains provider, request, structured plan and versioned authoring changeset. `ProposalReview` detaches its input. A pending proposal can produce a `zge.sdk.diff.v1` preview using the real transaction validator: additions, removals and before/after property changes. Studio displays the plan, validation result and JSON diff; viewport wireframes show green additions, red removals and amber changed entities without adding them to the authoritative scene or hierarchy.

Approve is an explicit button that supplies `approved:true`, revalidates base revision/existence/components and commits through the same editor store as human edits. Provider/actor provenance is recorded. Undo remains available after approval. Rejection closes the proposal without changing data. Stale proposals cannot commit and approval is disabled when scene edits invalidate their base revision. Pending proposals do not execute arbitrary code or make gameplay calls.

Tests cover detached provider data, preview-only behavior, rejection, missing approval, approval, closed-proposal denial, all three diff types, stale revision rejection, provenance and undo. Actual browser interactions certify Preview/Reject/Approve/Undo on both rendering backends. This is a trusted local human-review UI, not a security claim against malicious code running with the user's page privileges.

The AI observability inspector shows only telemetry actually exposed by a registered runtime component and allowed by host permissions. Orbital Outpost exposes no AI agent observations/goals/legal actions/policy/provenance/outcomes; the UI says so. Sentinel's existing observation/execution authority restrictions are untouched. No assistant proposal is connected to live multiplayer authority.
