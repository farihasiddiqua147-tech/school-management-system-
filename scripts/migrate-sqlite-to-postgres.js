'use strict';

// One-time, explicit SQLite -> PostgreSQL data copy. Run only with the app stopped.
// This migrates data; it does NOT switch the application runtime to PostgreSQL.
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { Client } = require('pg');

const TABLES = [
  'users', 'settings', 'students', 'staff', 'attendance', 'homework', 'exams',
  'fees', 'results', 'fee_payments', 'payment_gateway_settings', 'notices',
  'timetable', 'library_books', 'library_loans', 'inventory_items', 'expenses', 'audit_logs'
];

async function main() {
  const sourceFile = path.resolve(process.env.SQLITE_SOURCE || './data/school.sqlite');
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('Set DATABASE_URL to the target PostgreSQL database. Never commit it.');
  if (!fs.existsSync(sourceFile)) throw new Error('SQLite source file not found: ' + sourceFile);
  if (process.env.CONFIRM_SCHOOL_DB_MIGRATION !== 'YES') {
    throw new Error('Set CONFIRM_SCHOOL_DB_MIGRATION=YES only after stopping app writes and taking a verified backup.');
  }
  const sqlite = new Database(sourceFile, { readonly: true, fileMustExist: true });
  const pg = new Client({ connectionString: databaseUrl });
  let inTransaction = false;
  try {
    const integrity = sqlite.pragma('integrity_check');
    if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') throw new Error('Source SQLite integrity_check failed');
    const existingTables = new Set(sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(x => x.name));
    for (const table of TABLES) if (!existingTables.has(table)) throw new Error('Source database is missing expected table: ' + table);
    await pg.connect();
    await pg.query('BEGIN');
    inTransaction = true;
    const schema = fs.readFileSync(path.join(__dirname, '..', 'server', 'schema.postgres.sql'), 'utf8');
    await pg.query(schema);
    const counts = await pg.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'");
    for (const row of counts.rows) {
      const check = await pg.query('SELECT 1 FROM ' + '"' + row.table_name.replace(/"/g, '""') + '" LIMIT 1');
      if (check.rowCount) throw new Error('Target PostgreSQL is not empty (table has data): ' + row.table_name + '. Use a fresh empty database; this script never overwrites target data.');
    }
    const summary = [];
    for (const table of TABLES) {
      const columns = sqlite.prepare('PRAGMA table_info("' + table + '")').all().map(c => c.name);
      const pgColumns = await pg.query('SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2', ['public', table]);
      const available = new Set(pgColumns.rows.map(c => c.column_name));
      const missing = columns.filter(c => !available.has(c));
      if (missing.length) throw new Error('Schema mismatch for ' + table + '; PostgreSQL is missing columns: ' + missing.join(', '));
      const rows = sqlite.prepare('SELECT * FROM "' + table + '"').all();
      if (rows.length) {
        const quoted = columns.map(c => '"' + c.replace(/"/g, '""') + '"').join(', ');
        const params = '(' + columns.map((_, i) => '$' + (i + 1)).join(', ') + ')';
        const sql = 'INSERT INTO "' + table + '" (' + quoted + ') VALUES ' + params;
        for (const row of rows) await pg.query(sql, columns.map(c => row[c] === undefined ? null : row[c]));
      }
      summary.push({ table, rows: rows.length });
    }
    for (const table of TABLES) {
      const idColumn = sqlite.prepare('PRAGMA table_info("' + table + '")').all().find(c => c.name === 'id');
      if (idColumn && idColumn.pk) {
        await pg.query("SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE((SELECT MAX(id) FROM \"" + table + "\"), 1), (SELECT COUNT(*) > 0 FROM \"" + table + "\"))", ['public.' + table]);
      }
    }
    await pg.query('COMMIT');
    inTransaction = false;
    console.log(JSON.stringify({ ok: true, source: sourceFile, migratedTables: summary, totalRows: summary.reduce((n, x) => n + x.rows, 0), note: 'Data copy committed. Application runtime still uses SQLite until a separately tested PostgreSQL adapter is implemented.' }, null, 2));
  } catch (error) {
    if (inTransaction) await pg.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    sqlite.close();
    await pg.end().catch(() => {});
  }
}

if (require.main === module) main().catch(error => { console.error('Migration stopped safely:', error.message); process.exitCode = 1; });
module.exports = { TABLES, main };
