'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSqliteValue, TABLES } = require('./migrate-sqlite-to-postgres');

test('preserves ordinary SQLite values', () => {
  assert.equal(normalizeSqliteValue(0, 'integer'), 0);
  assert.equal(normalizeSqliteValue('School name', 'text'), 'School name');
  assert.equal(normalizeSqliteValue(null, 'date'), null);
});

test('converts empty optional date/timestamp strings to SQL null', () => {
  assert.equal(normalizeSqliteValue('', 'date'), null);
  assert.equal(normalizeSqliteValue('', 'timestamp with time zone'), null);
  assert.equal(normalizeSqliteValue('', 'text'), '');
});

test('migration table allowlist is unique and includes financial/audit tables', () => {
  assert.equal(new Set(TABLES).size, TABLES.length);
  for (const table of ['users', 'students', 'attendance', 'fees', 'fee_payments', 'expenses', 'audit_logs']) {
    assert.ok(TABLES.includes(table), 'missing table: ' + table);
  }
});
