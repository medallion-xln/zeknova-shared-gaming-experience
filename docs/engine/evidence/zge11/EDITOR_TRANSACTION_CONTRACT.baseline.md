# Local authoring transaction contract

`Scene` is an isolated authoring data store. It has no staging client, PHP route, credential or SQLite connection. A changeset has `schema:'zge.sdk.changeset.v1'`, exact `baseRevision`, and 1–100 operations. Every operation names a stable entity ID and explicit `expectedExists`. Preconditions are rechecked against the evolving temporary batch; only the completely validated final scene is published.

| Operation | Additional precondition/effect |
|---|---|
| CreateEntity | ID absent; finite registered component data; missing transform defaults normalized |
| CreatePrefabInstance | ID absent, known project prefab; detached data/new identity |
| DeleteEntity | Entity exists; all components removed together |
| UpdateTransform | Entity and transform exist; merge partial vectors, then validate complete transform |
| AddComponent | Entity exists, component absent, registered validator returns exactly true |
| UpdateComponent | Entity/component exist; complete replacement validates |
| RemoveComponent | Entity/component exist |

Scene v1 has ID, revision, nextId and entity array. Positive safe integer revisions/allocator, unique bounded IDs, valid names, finite plain JSON and a maximum 10,000 entities / four million serialized characters are enforced. Generated entity-N IDs must remain below nextId. Unsafe keys, non-JSON values, deep graphs and invalid vectors fail before commit. Component validators are trusted host code, so their external side effects are outside the scene transaction guarantee.

`preview` applies the same validation to detached data and returns additions, removals and before/after property changes without changing the scene, its history or revision. Commit saves a previous snapshot and records changeset/actor/source/revision provenance. Observer exceptions cannot reverse an already published commit. Returned scenes/entities/history are detached.

Undo and redo restore content with a new monotonically increasing revision and retain the highest allocator value. Undo cannot reuse a generated ID; a new commit clears redo. Undo holds at most 100 snapshots; commit provenance holds 200 records. Restore validates completely before replacing content and intentionally begins a new undo/provenance session. Serialized scenes retain IDs/revision/nextId, not an unbounded undo journal. A failed batch, stale proposal, deleted reference, invalid restore or empty undo never partially mutates a scene. Repeated undo/redo, stale revisions, unsafe input, failed multi-operation batches and save/restore are tested.

Studio stores selection, temporary drag, pending proposal, authoring scene, committed history and simulation in separate state fields/objects. Pointer movement changes presentation only; pointer release commits one transform transaction. Cancellation restores presentation. Numeric transforms use the same transaction validator. A simulation is a fresh engine/project clone with separate clock/systems/history and never edits the authoring scene. Editing controls are disabled during simulation. Reset discards that engine, rather than rewinding committed multiplayer gameplay.

The staging PHP/SQLite writer, generation fence, durable receipts and economic claims do not participate in this authoring history. No controlled publishing transaction exists in this milestone. Editor undo must never be described as server gameplay rollback.
