# Security owner gates — ZGE-05 (redacted)

**Urgent independent release blocker.** Previously exposed production provider keys, the committed collector token, and the prior credential-bearing process argument remain unresolved. This milestone neither prints values nor rotates credentials/deployment configuration. Process audit records only executable names/PIDs/cwd. Credential-related paths are identifiers only; no values belong in reports, logs or chat.

Owner checklist:

- [ ] Inventory affected provider/collector identities privately and revoke exposed keys/tokens immediately; check provider audit/use/billing records for unauthorized use.
- [ ] Create least-privilege replacements through owner-controlled consoles; deploy through the secret store/environment injection path. Verify the old credentials fail and the new deployment succeeds without echoing either.
- [ ] Replace the committed collector credential with server-side secret injection and remove client access; inspect distributed bundles/logs/caches and shared exports for exposure. Opt-in collection alone is not revocation.
- [ ] Purge credential-bearing command/history/log artifacts as appropriate under the owner's retention requirements; avoid process-argument secrets going forward.
- [ ] Coordinate repository history remediation with collaborators and the hosting owner. Rotate first. Use a reviewed backup + history rewrite procedure only with explicit owner authorization; do not rewrite this dirty checkout or assume deletion from HEAD revokes a credential.
- [ ] After authorized cleanup, secret-scan active tree, all refs/tags, generated assets, CI artifacts and deployed output; verify browser/network traffic contains no replacements, old-token use is denied, collector auth is server-side and alerts are enabled.
- [ ] Record redacted evidence of completion, affected identities and timestamps in a restricted owner record. Close this gate separately from gameplay certification.

Golden/source release gate: the three tests (`runtime-reconstruction`, `renderer-ownership-certification`, `runtime-graphics-context`) still first assert bundle SHA-256 `7a9cdfeec0c7b2ffe6e3f0f250fafb0e0d41ef0bd66d823240086985f36f5dab`; current pre-existing timeout-patched bundle is `25665bd856768b89f2283f6e44a8f93efafe074f9d0fcace5efd8296c991d115`. They also pin model artifact `e6af33cdf1f56c098d16156ce34ff435c7fa7a5490ed640a63c6e5e43ca726d0`; readable model/asset-service work changed that file in earlier milestones. Exact current source/artifact digests are in the manifest. All three fail at the first bundle assertion, so a matching bundle alone would not resolve the model golden/provenance decision.

Safest resolution: owner reviews timeout-patch/loader provenance and full dirty diff, reconstructs a reproducible readable build or approves a documented replacement artifact lineage, then explicitly approves release assets and regenerated golden expectations together with all semantic tests. Preserve ZEK-04.1 45 s model timeout and 3 s HQ/20 s environment races until their replacement is certified. Do not blindly re-pin hashes, revert working mitigations, treat an uncommitted patch as a release or claim these failures are fixed by the engine tests.
