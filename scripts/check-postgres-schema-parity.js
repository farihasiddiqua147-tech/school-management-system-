'use strict';

// Static contract check for the PostgreSQL cutover. This does not claim that
// the runtime is PostgreSQL-ready; it prevents silent schema drift while the
// async adapter is being implemented.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const sqliteSchema = fs.readFileSync(path.join(root, 'server/schema.sql'), 'utf8');
const postgresSchema = fs.readFileSync(path.join(root, 'server/schema.postgres.sql'), 'utf8');

function extractTables(sql) {
  const tables = new Map();
  const re = /CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+([a-z_][a-z0-9_]*)\\s*\\(([\\s\\S]*?)\\);/gi;
  for (const match of sql.matchAll(re)) {
    const columns = new Set();
    for (const rawLine of match[2].split(/,\\s*\\n/)) {
      const line = rawLine.trim();
      const m = line.match(/^([a-z_][a-z0-9_]*)\\s+/i);
      if (m && !/^(PRIMARY|UNIQUE|CHECK|FOREIGN|CONSTRAINT)$/i.test(m[1])) columns.add(m[1].toLowerCase());
    }
    tables.set(match[1].toLowerCase(), columns);
  }
  return tables;
}

function validateSchemaParity() {
  const sqlite = extractTables(sqliteSchema);
  const postgres = extractTables(postgresSchema);
  // These tables are created by idempotent runtime migrations rather than schema.sql.
  const runtimeTables = new Set(['fee_payments', 'payment_gateway_settings']);
  const errors = [];
  for (const [table, columns] of sqlite) {
    if (runtimeTables.has(table)) continue;
    const target = postgres.get(table);
    if (!target) { errors.push(`PostgreSQL schema missing table: ${table}`); continue; }
    for (const column of columns) {
      // students.user_id is added by the SQLite startup migration.
      if (table === 'students' && column === 'user_id') continue;
      if (!target.has(column)) errors.push(`PostgreSQL schema missing column: ${table}.${column}`);
    }
  }
  for (const table of runtimeTables) {
    if (!postgres.has(table)) errors.push(`PostgreSQL schema missing runtime-created table: ${table}`);
  }
  assert.deepEqual(errors, [], errors.join('\\n'));
  return { sqliteTables: sqlite.size, postgresTables: postgres.size, ok: true };
}

if (require.main === module) {
  console.log(JSON.stringify(validateSchemaParity(), null, 2));
}

module.exports = { extractTables, validateSchemaParity };
