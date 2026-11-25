# Production readiness checklist

Last reviewed: 2026-11-25. This document describes the code in the audit branch, not a claim that the live service is production-ready.

## Implemented in this branch
- Role-scoped teacher attendance and results list APIs.
- Student, teacher and guardian self-service APIs with record scoping.
- Guardian portal for linked active children.
- Expense ledger table, admin/accountant-only expense APIs, basic expense UI and a period accounting summary.
- Expense input validation with automated unit tests.
- Draft Android release-signing workflow.

## Still blocking production use
- [ ] PostgreSQL adapter is not implemented. `server/index.js` uses synchronous `better-sqlite3`; the PostgreSQL schema is only a draft.
- [ ] PostgreSQL application adapter and a tested production cutover are not implemented. A guarded SQLite-to-PostgreSQL data-copy script and runbook have been added, but the copy has not been run against a real target DB and needs row-count/record verification. Local SQLite backup/restore tooling exists, but CI and a real recovery drill must pass.
- [ ] Render service/database region and connectivity need to be reviewed before connecting any production database. Never add DATABASE_URL to the live service yet: the current server deliberately exits when it is set.
- [ ] Integration tests are needed for all authenticated endpoints and all five roles; current expense tests only cover input validation.
- [ ] Accounting reconciliation needs review. The report counts recorded `fee_payments` as collections; legacy `fees.paid_amount` values without ledger rows are not included in period collections.
- [ ] SMS/email provider integration is not configured.
- [ ] Online bKash/Nagad checkout is not implemented; the endpoint intentionally returns 503.
- [ ] Complete teacher/guardian/admin/accountant workflows and responsive end-to-end tests on a real device.
- [ ] Android release keystore/signing secrets and release APK/AAB are not configured/generated.
- [ ] Review audit logging, backup policy, incident recovery and production security settings. The new local SQLite utility creates a checksum manifest and verifies integrity; it is not cloud backup, encryption, or durable Render storage.

## Release rule
Do not merge this branch into `main` or deploy it until the database adapter, migration, backups, permission tests and end-to-end tests have been completed and reviewed. Do not enter real student data into a service without verified durable storage and recovery.
