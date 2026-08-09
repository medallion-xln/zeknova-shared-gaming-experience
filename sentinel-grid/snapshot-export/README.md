# Stage 2F-Z Read-Only Capture Export

The capture template requires the real ZekNova repository head, runtime build SHA-256, collector ID and environment ID. It emits `source.kind = "live-runtime"` and `productionEligible = true`; Stage 2F-Z will still quarantine the record unless all hashes, parity checks and session-manifest bindings validate.

The capture module must be read-only and return `{ envelope, legacyEvidence }`. No command, authority token or world mutation is permitted.
