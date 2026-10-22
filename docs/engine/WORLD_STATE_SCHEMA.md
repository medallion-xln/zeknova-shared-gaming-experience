# World-state schema — ZGE-04

Public core API: `createWorldState`, `validateWorldState`, `serializeWorldState`, `restoreWorldState`, `immutableData`; schema identifier `zge.world-state.v1`. `Construction.worldState(authority)` exports this representation without importing Three.js, game content, the minified runtime or a renderer.

| Field | Contract |
|---|---|
| schema / id | Exact schema identifier and world identity |
| revision | Nonnegative integer simulation/domain revision |
| inventoryRevision | Nonnegative integer inventory revision |
| authority | Domain, owner identifier and nonnegative epoch; descriptive metadata, never permission to execute |
| entities | Unique IDs and plain component data; building entities carry transform and building-type components |
| buildings | Stable instance IDs, type, finite x/y/z/rotation, level, optional radius/state and plain extensions |
| occupancy | Entity ID, x/z and nonnegative radius derived from building data; parallel order and values must agree |
| inventory | Finite, nonnegative resource quantities keyed by game-provided resource identifiers |
| events | Ordered plain gameplay records with nonempty string type; construction events have command and building IDs |

All exported state is deeply detached and frozen. Only finite, acyclic plain JSON is accepted: functions, undefined, class instances, typed arrays, dates, scene objects and nonfinite numbers reject. Serialization validates the boundary; restoration validates schema/revisions, IDs, transforms, entity/building correspondence, occupancy and event shape, then returns a fresh immutable value. Game-specific catalogs/cost rules and authority registration live outside this snapshot.

The schema is a representation for state inspection, AI observation and rendering/reference generation. It does not drive the legacy scene or replace the production v4 save envelope. Construction's internal version-2 transaction snapshot additionally contains its idempotency/undo journal and pending intentions. The kernel snapshot also includes timing and queued commands; these distinct formats are deliberately versioned separately.

Pipeline remains Authoritative Simulation → World Snapshot → Scene Capture → Optional Neural Rendering. Consumers cannot mutate exported snapshots. A snapshot's owner string never grants command authority. No neural physics, training, model downloads, multiplayer replication protocol or complete legacy-world migration is introduced here.
