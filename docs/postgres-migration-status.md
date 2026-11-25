# PostgreSQL migration status

## Current state

- The running application still opens SQLite through `better-sqlite3`.
- The application uses synchronous calls such as `db.prepare(...).get()`, `.all()`, `.run()`, and `.transaction()`.
- PostgreSQL drivers for Node.js are asynchronous. Changing only a connection string or adding `DATABASE_URL` cannot work.
- Render PostgreSQL resource exists on the Free plan for temporary testing, but the app is not connected to it.
- The Render MCP query connection was blocked because the database has no external IP allowlist entry. Do not make the database publicly reachable just to enable an administrative query.

## Preparation added

- `server/schema.postgres.sql` is a PostgreSQL-compatible schema draft for the tables currently defined by the SQLite schema and the runtime migrations.
- It includes the student-to-user link, guardian link, fee type/billing period, fee payment history, and encrypted payment gateway settings.

## Required implementation before switching databases

1. Introduce a PostgreSQL data-access layer and convert every route/helper from synchronous SQLite calls to awaited PostgreSQL queries.
2. Replace positional `?` placeholders with PostgreSQL parameters (`$1`, `$2`, ...).
3. Replace SQLite-only constructs: `PRAGMA`, `lastInsertRowid`, `changes`, `db.transaction`, `INSERT OR/ON CONFLICT` differences, and SQLite-specific date/string behavior.
4. Fix SQL expressions that rely on SQLite double-quoted string literals (for example weekday ordering).
5. Add an explicit, versioned migration runner. Do not rely on executing the full schema on every app startup.
6. Add integration tests against a real PostgreSQL instance for login, student creation/listing, student self-service, and persistence after reconnect/restart.
7. Only after tests pass, configure the web service with the internal database URL and deploy from a review branch.

## Safety rules

- Keep all work on a non-main branch until review and tests pass.
- Never commit database passwords or connection strings.
- Never expose the database to all IP addresses to work around a tool connection failure.
- Do not upgrade Render plans or enable paid services without explicit approval.
- Do not remove the SQLite path until the PostgreSQL path has passed the full test suite.
