# W0-O.2 — Private Faction Knowledge Ledger

W0-O.2 converts the validated W0-O.1 perception event stream into deterministic, faction-private knowledge. It does not read the authoritative game world and does not generate the final Prime observation packet.

## Pipeline

```text
authoritative world
→ W0-O.1 grounded event
→ W0-O.2 private faction ledger
→ later W0-O.3 canonical observation packet
```

## Knowledge topics

- `unit_contact`
- `combat_alert`
- `structure_status`
- `resource_location`
- `route_status`
- `infrastructure_status`

## Development freshness policy

| Event | Topic | Freshness |
|---|---|---:|
| `enemy_sighted` | `unit_contact` | 4 quanta |
| `enemy_lost` | `unit_contact` | stale immediately |
| `combat_alert` | `combat_alert` | 2 quanta |
| `structure_observed` | `structure_status` | persistent until contradicted |
| `structure_damaged` | `structure_status` | 6 quanta |
| `structure_destroyed` | `structure_status` | persistent until contradicted |
| `resource_discovered` | `resource_location` | 20 quanta |
| `route_observed` | `route_status` | 8 quanta |
| `infrastructure_status_observed` | `infrastructure_status` | 6 quanta |

Finite freshness uses an exclusive boundary:

```text
currentQuantum < freshUntilQuantumExclusive
```

At equality, the knowledge is stale.

## Evidence precedence

For conflicting evidence about the same faction, subject, and topic:

1. Newer effective observation quantum
2. Direct observation over shared intelligence
3. Event-type priority
4. Delivery event sequence
5. Delivery event ID

All evidence remains in the record history even when it is not selected as current.

## Sharing rule

Shared intelligence keeps both times:

- `effectiveObservedAtQuantum`: when the original fact was observed
- `deliveredAtQuantum`: when another faction received it

Sharing never refreshes old intelligence.

## Scope boundary

W0-O.2 does not:

- Create line of sight or perception events
- Read hidden health or global enemy counts
- Produce Prime feature vectors
- Alter legal action masks
- Grant Prime authority
- Assign production-balanced TTL values
