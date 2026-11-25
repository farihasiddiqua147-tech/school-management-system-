# SQLite backup and restore runbook

This runbook applies only while the application is using SQLite. It does **not** make Render's ephemeral filesystem durable and it is not a PostgreSQL migration procedure.

## Before a backup

1. Confirm the source path is the database actually used by the application (DATABASE_FILE, or the default ./data/school.sqlite).
2. Schedule a maintenance window and stop writes if this is a live school database.
3. Choose a protected backup directory with enough free space. Backups contain student and financial data; restrict access and do not commit them to GitHub.

## Create a verified backup

Run from the repository root:

```sh
node scripts/sqlite-backup.js backup ./data/school.sqlite ./backups
```

The script uses SQLite's backup API, runs PRAGMA integrity_check, confirms the users table exists, and writes a SHA-256 manifest next to the backup. Keep the database and manifest together. Store a second copy in an approved private location; the repository is not a backup destination.

## Test a restore without overwriting anything

Use a new destination path:

```sh
node scripts/sqlite-backup.js restore ./backups/school-<timestamp>.sqlite ./data/restore-test.sqlite
```

The restore command checks the manifest when present, verifies the source database, refuses to overwrite an existing destination, copies the file, and verifies the restored copy. After this mechanical check, a designated administrator should also verify expected table counts and a few known records before accepting a recovery.

## Limitations

- This is a local SQLite utility, not a scheduled cloud backup service.
- A checksum detects accidental changes; it does not encrypt the backup.
- It does not make an ephemeral Render filesystem persistent.
- It does not copy SQLite WAL sidecar files manually; it relies on the SQLite backup API.
- Do not switch DATABASE_URL on. The PostgreSQL adapter and tested data migration remain unimplemented.
- Never restore directly over a live database. Restore to a new file, validate it, and only then plan a separately reviewed cutover.
