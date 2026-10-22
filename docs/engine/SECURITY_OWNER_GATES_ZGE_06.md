# Security owner gates — ZGE-06

Urgent independent release blocker: previously exposed production provider keys and the committed collector token remain unrevoked/unrotated in the available evidence. This milestone did not read out secret values, change production configuration, rewrite history, alter privileges, migrate production data or use production identities. Staging's generated disposable tokens are separate test identities and do not remediate those exposures.

Owner actions remain the redacted revoke/rotate/history/post-verification checklist in SECURITY_REMEDIATION_ZGE_05.md: revoke exposed credentials; review provider/collector access and billing; install least-privilege replacements through controlled secret injection; verify old tokens fail; coordinate authorized history/artifact cleanup; scan all refs/deployed/CI outputs and verify client traffic contains no replacements. Do not regard opt-in collection or removing a value from HEAD as revocation.

The staging host is loopback-only, separately enabled, uses private temporary database/identity files, hashed expiring fixture sessions, server world/role checks and parameterized SQL. It is not production authentication, remote hosting or MySQL certification. Fault headers require a separate explicit test flag. Requesting durable staging work did not authorize live takeover or production deployment.

Golden gate remains unchanged: three tests first fail expected bundle SHA 7a9cdfee… versus existing timeout-patched 25665bd8…; their later model golden also predates prior readable model/asset work. Preserve timeouts/safeguards. Owner-approved artifact provenance/reproducible replacement and semantic review must precede any explicit golden update; no re-pinning occurred.
