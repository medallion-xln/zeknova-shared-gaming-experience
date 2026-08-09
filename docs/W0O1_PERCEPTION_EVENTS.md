# W0-O.1 Grounded Perception Event Contract

W0-O.1 defines the only event records that may later enter a faction knowledge ledger.
It does not build the ledger and does not give Prime authority.

## Information boundary

A perception event must name:

- the world,
- the observing faction,
- the source faction,
- the active source entity that performed the observation,
- the observed subject,
- the control quantum,
- the grounded source type,
- an exact type-specific payload.

Unknown payload fields are rejected. Wall-clock timestamps and omniscient aggregate fields are forbidden.

## Runtime behavior

`PerceptionEventIntegration` installs additively after W0-O.0 identity integration. It does not scan every enemy automatically. Events are created only through explicit reporting methods or a grounded proximity check.

The live browser surfaces are:

- `globalThis.ZekNovaPerceptionEventIntegration`
- `globalThis.ZEK_PERCEPTION_EVENT_ADAPTER`
- `document.documentElement.dataset.zeknovaPerceptionEvents === "w0o1-v1"`

## Scope boundary

W0-O.2 will consume these events into private faction knowledge ledgers. W0-O.1 itself has no expiry, confidence decay, inferred knowledge, or action mask effects.
