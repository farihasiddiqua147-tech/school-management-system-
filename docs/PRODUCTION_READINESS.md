# Production readiness and remaining implementation

## Operational improvements in this repository

- Pin Node.js 20.19.0 in `.node-version` and run automated tests in GitHub Actions.
- Use `npm run db:backup` to make a timestamped SQLite backup. It validates database integrity and foreign-key constraints before copying and verifies the backup after copying.
- Set `DATABASE_FILE` to the active SQLite database path and optionally `BACKUP_DIR` to a private backup directory. Keep backups outside the public web root, restrict access, encrypt at rest, and arrange off-host copies separately.
- Use `npm run db:restore -- <backup.sqlite> <new-target.sqlite>` to restore a backup into a new, separate database file. It refuses to overwrite an existing target and checks integrity/foreign-key constraints. It does not switch the live application database automatically. Practice on a separate path and verify key records before any planned cutover.

## Important database architecture finding

The current API imports `better-sqlite3` and performs synchronous database calls throughout `server/index.js` (`prepare`, `get`, `all`, `run`, `transaction`, and SQLite-specific SQL such as `PRAGMA`, `ON CONFLICT`, and `AUTOINCREMENT`). PostgreSQL drivers such as `pg` are asynchronous and use different SQL/dialect semantics. Setting `DATABASE_URL` or swapping a package therefore does **not** create a working PostgreSQL runtime adapter. Do not point production at PostgreSQL until the API's database access is refactored and tested against it.

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
- [ ] Perform a restore rehearsal and schedule protected off-host backups.
- [ ] Add audit logging, input validation, error monitoring, and rate limits appropriate to the deployed traffic.
- [ ] Integrate SMS, email, and bKash/Nagad only with provider credentials, verified callbacks/signatures, idempotency, and sandbox-to-production testing.
- [ ] Finish frontend-to-API integration and end-to-end tests on both mobile and desktop layouts.

## Feature status

The existing backend includes starter routes for accounts, students, staff, attendance, homework, exams/results, fees/payments, notices, school settings, and basic marksheet/fee reports. The full user interface, complete role workflows, financial ledger, configurable grading rules, live payment gateway, SMS/email delivery, PostgreSQL runtime, tested restore workflow, and production deployment are not complete. Treat them as outstanding until implemented and tested.
