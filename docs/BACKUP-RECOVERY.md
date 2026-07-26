# Company backup and disaster recovery

## Format and security

Every backup is a UTF-8 JSON encrypted envelope (`application/vnd.poultry.backup+json`). The authenticated cipher is AES-256-GCM and the key is derived with scrypt from `BACKUP_ENCRYPTION_KEY` (scheduled jobs) or an owner-supplied passphrase (manual exports). Never store the key beside the backup. The decrypted document identifies `poultry.company-backup`, has an integer `schemaVersion`, per-collection record counts, and a SHA-256 checksum over canonicalized data.

Version 1 contains company configuration; users (including password hashes); the canonical role-permission matrix; document sequences; customers; suppliers; categories; products; batches; stock movements; purchase orders and lines; purchase returns and lines; sales invoices and lines; sales returns and lines; customer and supplier payments; chart of accounts; vouchers/journal entries and lines; PDC cheques; expenses; targets; routes and visits; quotations and lines; payment schedules; and audit logs. It excludes global failed-login telemetry because that data is not company-owned. A format change requires a schema-version increment and migration support.

Only an authenticated `OWNER` with `BACKUP_RESTORE` may generate, stage, or approve restoration. Transport must use TLS. R2 buckets must be private, use least-privilege credentials, server-side encryption, versioning/object lock where available, and access logging. Rotate encryption keys annually and after any suspected disclosure; retain old keys until their backups expire.

## Schedule, retention, and storage

* Run `/api/cron/backup` nightly after close of business. Alert when any company fails or when no destination is configured.
* Keep 30 daily, 12 month-end, and 7 year-end backups. The application automatically prunes ordinary R2 daily objects after 30 days; move month/year-end copies to locked archival prefixes before pruning.
* Primary: private Cloudflare R2 in a region appropriate to the company. Secondary: a separate-account, encrypted offline/object-locked copy. Email is emergency-only and must use an encrypted artifact.
* Weekly, verify that the newest object downloads, decrypts, and passes checksum/record-count validation. Quarterly, run the full drill below.

## Recovery procedure

1. Declare an incident, assign a recovery owner and recorder, stop writes, record incident/ticket, target company, artifact key, checksum, schema version, application/database versions, and timestamps.
2. Take and retain a rollback snapshot of production. Download the selected encrypted artifact over TLS and obtain its key through the secrets manager using two-person access.
3. As the company owner, submit `action=stage`, `file`, and `passphrase` to `/api/import`. This models restoration into a new empty test tenant, verifies authenticated decryption, schema/count/checksum, foreign keys, batch stock against movements, finite customer/supplier ledger balances, and debit/credit journal equality. Resolve **every** error; never edit an encrypted backup in place.
4. Perform an isolated database restoration into a newly created empty test database/company using the schema version recorded in the manifest. Run migrations only according to the version-specific recovery release. Compare all manifest counts and run the SQL controls below. The API stage approval expires after 15 minutes and is bound to the artifact checksum and target company.
5. Submit the unchanged file with `action=production` and its `approvalToken`. Approval is a gate, not an unattended destructive database write. During the approved maintenance window, restore the test-verified snapshot using the database operator tooling, mapping only the tenant company ID. Do not merge into a populated company. Atomically switch traffic only after checks pass.
6. Repeat controls in production, sample invoices/purchases and attachments, require owner/accountant sign-off, re-enable writes, monitor errors and financial reports. If any check fails, keep writes stopped and revert the rollback snapshot.
7. Revoke temporary access, securely discard local plaintext, record recovery time/data loss, results, approvers, exceptions, and follow-up work.

### Mandatory controls

Run tenant-scoped equivalents and attach output to the drill record: orphan counts for every relationship; `ProductBatch.quantity = SUM(StockMovement.quantity)` by batch; customer opening balance + posted invoices − non-reversed payments − posted returns; supplier opening balance + posted purchases − non-voided payments − posted returns; and journal debit total = credit total for every voucher. Also compare every collection count and the SHA-256 manifest checksum. Zero exceptions are permitted.

## Restoration drill record — 2026-07-26

| Field | Result |
|---|---|
| Scope | Complete synthetic version-1 company artifact; generation → encryption → decrypt → stage validation → production-approval gate |
| Environment | Automated isolated test fixture; no production data or secrets |
| Commands | `npm test`; `npm run lint`; `npm run build` |
| Security | Wrong/tampered content rejected by authenticated encryption/checksum; approval bound to company/checksum and expires in 15 minutes |
| Integrity | Foreign keys, batch movement totals, customer/supplier calculations, and balanced journals exercised |
| Outcome | Passed automated format, cryptography, validation, and approval-gate drill; operator database cutover is not claimed and must be performed quarterly in the isolated database environment |
| Evidence | `src/lib/company-backup.test.ts` and CI/build output for this change |

The recovery owner must append a dated operational drill entry each quarter. A drill is incomplete until an actual empty database restoration and rollback/cutover rehearsal is signed by both owner and accountant/operations reviewer.
