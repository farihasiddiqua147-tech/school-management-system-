'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { verifyDatabase, backup, restore, sha256 } = require('../scripts/sqlite-backup');

function makeDb(file) {
  const db = new Database(file);
  db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE); INSERT INTO users(email) VALUES ('admin@example.test');");
  db.close();
}

test('backup creates a verified copy and checksum manifest', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'school-backup-'));
  try {
    const source = path.join(dir, 'source.sqlite');
    const out = path.join(dir, 'backups');
    makeDb(source);
    await backup(source, out);
    const files = fs.readdirSync(out);
    const file = path.join(out, files.find(name => name.endsWith('.sqlite')));
    assert.ok(fs.existsSync(file + '.manifest.json'));
    assert.equal(verifyDatabase(file).tables, 1);
    const manifest = JSON.parse(fs.readFileSync(file + '.manifest.json', 'utf8'));
    assert.equal(manifest.sha256, sha256(file));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('restore verifies backup and refuses to overwrite an existing destination', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'school-restore-'));
  try {
    const source = path.join(dir, 'backup.sqlite');
    const destination = path.join(dir, 'restored.sqlite');
    makeDb(source);
    restore(source, destination);
    assert.equal(verifyDatabase(destination).tables, 1);
    assert.throws(() => restore(source, destination), /already exists/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('restore rejects a tampered backup when a manifest exists', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'school-tamper-'));
  try {
    const source = path.join(dir, 'backup.sqlite');
    makeDb(source);
    fs.writeFileSync(source + '.manifest.json', JSON.stringify({ sha256: 'incorrect' }));
    assert.throws(() => restore(source, path.join(dir, 'restored.sqlite')), /checksum/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
