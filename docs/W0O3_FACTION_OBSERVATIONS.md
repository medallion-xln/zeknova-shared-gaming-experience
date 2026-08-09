# W0-O.3 — Canonical Faction Observation Packets

W0-O.3 projects the private W0-O.2 faction knowledge ledger into the exact deterministic packet that Sentinel Prime may read.

## Pipeline

```text
validated W0-O.1 perception events
→ private W0-O.2 faction knowledge ledger
→ fresh faction-scoped W0-O.3 observation packet
→ fixed 592-value Prime feature vector
```

## Information boundary

The observation generator reads only:

- a validated W0-O.0 identity snapshot,
- a validated W0-O.2 knowledge-ledger snapshot,
- one canonical faction ID,
- one explicit integer quantum.

It does not read the live enemy array, Three.js objects, global threat totals, hidden health, wall-clock time, another faction's private records, or action legality.

## Packet layout

The structured packet has six fixed-order sections:

1. `unit_contact` — 8 slots
2. `combat_alert` — 4 slots
3. `structure_status` — 8 slots
4. `resource_location` — 8 slots
5. `route_status` — 4 slots
6. `infrastructure_status` — 4 slots

Each section has fixed capacity. If fresh knowledge exceeds capacity, the most recent deterministic records are selected and the omitted count is recorded.

The numeric Prime layout contains:

- 16 header features,
- 36 slots,
- 16 features per slot,
- 592 total finite values in `[-1, 1]`.

## Privacy properties

- Stale records never enter packet slots.
- Other-faction private records never enter the packet.
- Global perception event IDs and sequences are omitted.
- Hidden identity-registry additions do not alter the packet.
- Hidden events addressed only to another faction do not alter the packet.
- Identical faction knowledge at the same quantum produces byte-identical packets, IDs, and feature vectors.

## Scope boundary

W0-O.3 does not change action legality and does not grant Prime authority. Observation-sensitive action masks begin in W0-O.5 after the real action registry work is sufficiently defined.
