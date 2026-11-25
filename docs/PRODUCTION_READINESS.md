# Production readiness and remaining implementation

## Completed in this change

- Pin Node.js 20.19.0 in `.node-version`. `better-sqlite3` is a native module, so use a supported Node 20 runtime instead of an untested newer major version.
- Add GitHub Actions CI to install dependencies and run `npm test` on Node 20 for pushes and pull requests.
- Record the database migration boundary and production rollout requirements below to avoid treating an unverified database switch as complete.

## Important database architecture finding

The current API imports `better-sqlite3` and performs synchronous database calls throughout `server/index.js` (`prepare`, `get`, `all`, `run`, `transaction`, and SQLite-specific SQL such as `PRAGMA`, `ON CONFLICT`, and `AUTOINCREMENT`). PostgreSQL drivers such as `pg` are asynchronous and use different SQL/dialect semantics. Setting `DATABASE_URL` or swapping a package therefore does **not** create a working PostgreSQL runtime adapter. Do not point production at PostgreSQL until the API's database access is refactored and tested against it.

## SQLite backup utility

Run `npm run db:backup` on a host with access to the SQLite database. It writes a timestamped copy under `./backups` (or `BACKUP_DIR`), checks database integrity and foreign-key constraints before copying, and verifies the resulting backup. Set `DATABASE_FILE` to the active database path. Keep the backup directory private, encrypted at rest, access-restricted, and outside the public web root; arrange off-host copies separately. This utility does not replace a tested restore procedure. Practice restoring a copy to a separate path before relying on backups for recovery.

## Required PostgreSQL migration sequence

1. Introduce a repository/service layer for database operations and remove direct SQLite calls from route handlers.
2. Select a single asynchronous database interface and implement SQLite and PostgreSQL adapters against the same contract.
3. Add versioned migrations for every table, index, constraint, and existing-data change; translate SQLite-specific DDL/DML and date handling to PostgreSQL.
4. Add integration tests against a real PostgreSQL service covering login, roles, student/guardian scoping, attendance, marksheets/GPA, fees, partial payments, receipts, and concurrent payment attempts.
5. Build an explicit export/import tool, reconcile row counts and financial totals, rehearse rollback, and verify backup restoration before cutover.
6. Configure `DATABASE_URL` as a secret in the hosting dashboard. Never commit credentials or production data.

## Production launch checklist

- [ ] Run CI successfully on the deployment commit.
- [ ] Configure a unique `JWT_SECRET` (32+ random characters), strong `ADMIN_PASSWORD`, and real `ADMIN_EMAIL` in the host's secret environment settings.
- [ ] Keep `NODE_ENV=production`; restrict `CORS_ORIGIN` to the actual frontend origin(s).
- [ ] Use persistent storage for SQLite or complete and verify the PostgreSQL adapter before selecting PostgreSQL.
- [ ] Verify `/api/health` and a real login after deployment without exposing credentials in logs.
- [ ] Complete API authorization tests for all five roles and test student/guardian data isolation.
- [ ] Add automated database backups and perform a restore rehearsal.
- [ ] Add audit logging, input validation, error monitoring, and rate limits appropriate to the deployed traffic.
- [ ] Integrate SMS, email, and bKash/Nagad only with provider credentials, verified callbacks/signatures, idempotency, and sandbox-to-production testing.
- [ ] Finish frontend-to-API integration and end-to-end tests on both mobile and desktop layouts.

## Feature status

The existing backend includes starter routes for accounts, students, staff, attendance, homework, exams/results, fees/payments, notices, school settings, and basic marksheet/fee reports. This does not mean the full user interface, complete role workflows, financial ledger, configurable grading rules, live payment gateway, SMS/email delivery, or production-grade audit/backup system is complete. Treat those as outstanding until implemented and tested.
