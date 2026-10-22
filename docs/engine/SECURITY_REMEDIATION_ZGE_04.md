# Redacted owner remediation checklist — ZGE-04

Status: unresolved. Previously exposed provider credentials and the Sentinel collector token require immediate owner-controlled revocation and rotation. The earlier credential-bearing process argument also remains in the rotation scope. Values have not been inspected, copied into fixtures, printed, or changed in ZGE-04.

- [ ] Owner inventories the affected provider/account and collector credential identifiers privately, without pasting secret values into chats or logs.
- [ ] Owner revokes exposed credentials at each issuing provider and confirms the old credentials no longer authenticate.
- [ ] Owner issues least-privilege replacements and installs them through the approved secret/configuration channel; production configuration is unchanged by this milestone.
- [ ] Owner reviews provider and collector access logs for unexpected use during the exposure window and follows their incident process if needed.
- [ ] Owner updates approved dependent services, verifies intended access, and verifies the collector stays opt-in.
- [ ] Owner removes plaintext credentials from tracked configuration and credential-bearing process arguments through a separately reviewed change. Any history rewrite requires coordination; none is attempted here.
- [ ] Owner adds redacted secret scanning and records completion using credential identifiers/status only, never values.

No automated credential rotation, provider account access, production deployment, or Git history rewrite was authorized or attempted.
