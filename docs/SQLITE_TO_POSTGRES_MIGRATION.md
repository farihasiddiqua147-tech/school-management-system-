# SQLite to PostgreSQL migration utility

This is a guarded, one-time **data-copy tool**, not a PostgreSQL application adapter. The running server still uses SQLite. Do not set DATABASE_URL on the live Render service; the server deliberately refuses to start when it is present.

## Before attempting a migration

1. Work on a copy of the project and a separate, fresh PostgreSQL database. Never point this at a database containing school data.
2. Stop all application writes and make a verified SQLite backup using docs/SQLITE_BACKUP_RESTORE.md.
3. Ensure the source SQLite database has been opened by the current app version so its startup schema updates (including user_id, fee_type and billing_period) have run.
4. Use a private terminal and set DATABASE_URL there. Never paste credentials into chat, commit them, or place them in source files.
5. Confirm that you understand this script copies data but does not switch the app runtime.

## Run the copy

```sh
npm install
CONFIRM_SCHOOL_DB_MIGRATION=YES SQLITE_SOURCE=./data/school.sqlite npm run migrate:postgres
```

The command requires DATABASE_URL to be set in the environment. The script checks the SQLite integrity, requires expected tables, creates the PostgreSQL schema, refuses to copy into any target table that already contains rows, checks source/target column compatibility, copies rows in foreign-key order inside one PostgreSQL transaction, adjusts identity sequences, and rolls back on error.

## After the copy

- Compare row counts table-by-table and spot-check important student, attendance, marks, invoices, payment, expense and audit records.
- Run permission and end-to-end tests against a PostgreSQL-backed application adapter before any cutover.
- Keep the SQLite source and verified backup unchanged until the migration has been formally accepted.

## Important limitation

The production server currently imports better-sqlite3 and uses its synchronous query API throughout the routes. This tool does not change that code. A real asynchronous PostgreSQL database layer and full API integration tests are still required before DATABASE_URL can be used by the running app. This script has not been run against your private database from this environment.