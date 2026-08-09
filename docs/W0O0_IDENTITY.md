# W0-O.0 — Stable Faction and Entity Identity

This slice introduces identities only. It does not create perception events, a knowledge ledger, observation expiry, intelligence sharing, or Prime authority.

## Runtime identities

- Human team faction: stable from `teamCode`.
- ZekNovan settlement factions: stable from team world, biome seed, and settlement ordinal.
- Human units: stable from user ID or multiplayer client ID.
- Structures and resources: stable from persistent source IDs.
- ZekNovan spawned units: monotonic world-local spawn sequence; retired IDs are never reused.

`IdentityIntegration` installs additively after the legacy game runtime starts. It does not edit the generated runtime bundle or the existing omniscient AZL telemetry path.

## Browser diagnostics

```js
ZekNovaIdentityIntegration.captureSnapshot()
ZekNovaIdentityIntegration.registry.snapshotHash()
ZEK_IDENTITY_ADAPTER.captureIdentitySnapshot()
```

Runtime objects receive these `userData` fields when applicable:

```js
{
  entityId: "zkid:v1:...",
  ownerFactionId: "zkid:v1:faction:..." | null,
  identitySchemaVersion: 1
}
```

## Verification

```bash
npm test
node tests/w0o0-portability-report.cjs --digest
```

The portability digest intentionally excludes any future freeze manifest so the digest can be recorded without circularity.
