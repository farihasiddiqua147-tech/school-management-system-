# Production database cutover runbook

Status: **NOT APPROVED FOR LIVE CUTOVER**. This runbook is a checklist, not evidence that the cutover has been tested.

## Hard stop conditions

Do not set `DATABASE_URL`, connect the Render database, merge the audit branch, or deploy a new release until every prerequisite below is complete. The current server intentionally exits when `DATABASE_URL` is present because its runtime still uses synchronous SQLite.

- [ ] PostgreSQL runtime adapter implemented for every query and transaction used by the API.
- [ ] All existing API tests pass with SQLite and PostgreSQL.
- [ ] Integration tests cover unauthenticated access, each of the five roles, cross-student/guardian isolation, and invalid input.
- [ ] PostgreSQL schema has been applied to a disposable test database and all schema differences resolved.
- [ ] Migration rehearsal completed using a copy of representative, non-sensitive test data.
- [ ] Rehearsal verifies every table's row count and samples critical records: users/roles, students and guardian links, attendance, exams/results, fees, fee payments, expenses, notices, settings, and audit events.
- [ ] Backup is stored outside the service's ephemeral filesystem; restore has been completed into a separate database and verified.
- [ ] Database region, Render private connectivity, TLS/credentials, connection limits, and access permissions reviewed.
- [ ] A named operator has confirmed the maintenance window and rollback decision.

## Safe rehearsal sequence

1. Use a disposable PostgreSQL database, never the live school database.
2. Apply the current PostgreSQL schema and run the automated test suite against it.
3. Create a SQLite backup and verify its checksum/integrity manifest.
4. Run the migration script only with an explicit test database URL and `CONFIRM_SCHOOL_DB_MIGRATION=YES`. The script is designed to refuse populated target tables.
5. Compare source and destination row counts table by table; inspect key records and foreign-key relationships. A successful script exit alone is not sufficient.
6. Start the PostgreSQL-enabled app against the disposable database and exercise login, all role-specific screens/APIs, fee collection, expense reporting, result entry, and guardian-child access.
7. Restart the app and repeat read/write checks to prove data persists across process restarts.
8. Restore a backup into a separate empty database and verify the app can read the restored data.

Never paste database URLs, passwords, JWT secrets, keystores, or other credentials into chat, issues, logs, or source control.

## Production cutover (only after all hard stops are cleared)

1. Announce a maintenance window and stop writes to the old database.
2. Take and verify a final backup; keep the original database unchanged.
3. Migrate to an empty production PostgreSQL database using the reviewed, tested procedure.
4. Compare row counts and critical records before changing application traffic.
5. Deploy the PostgreSQL-capable release with the database URL stored only in the hosting provider's secret environment settings.
6. Smoke-test each role and critical workflows with test accounts before reopening school operations.
7. Monitor errors, database connections, and data integrity; record the cutover time and migration report.

## Rollback criteria and approach

Rollback if authentication fails, role isolation fails, important row counts differ, payment/accounting totals do not reconcile, or writes cannot be confirmed durable.

- Keep the old database intact and do not allow writes to both databases.
- Put the app into maintenance mode / stop writes before switching back.
- Switch application traffic back only to a database whose data is known to be consistent.
- If any writes happened after cutover, reconcile them explicitly before reopening the old database; do not simply discard them.
- Re-run the smoke tests and document the incident and recovery result.

## Current known blockers

- Runtime still uses SQLite; PostgreSQL runtime adapter is not implemented.
- Migration has not been rehearsed against a real target PostgreSQL database.
- Render's free filesystem is not durable storage for SQLite backups.
- SMS/email providers, online bKash/Nagad checkout, release signing, and full end-to-end testing remain separate launch blockers.
