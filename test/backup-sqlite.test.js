const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Database = require('better-sqlite3');

test('backup command creates and verifies a real SQLite backup', async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'school-backup-test-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));

  const databasePath = path.join(temp, 'source.sqlite');
  const backupDir = path.join(temp, 'backups');
  const db = new Database(databasePath);
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE parents (id INTEGER PRIMARY KEY);
    CREATE TABLE students (
      id INTEGER PRIMARY KEY,
      parent_id INTEGER REFERENCES parents(id)
    );
    INSERT INTO parents(id) VALUES (1);
    INSERT INTO students(id, parent_id) VALUES (1, 1);
  `);
  db.close();

  const scriptPath = path.resolve(__dirname, '..', 'scripts', 'backup-sqlite.js');
  const result = spawnSync(process.execPath, [scriptPath], {
    encoding: 'utf8',
    env: { ...process.env, DATABASE_FILE: databasePath, BACKUP_DIR: backupDir }
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Backup verified:/);

  const files = fs.readdirSync(backupDir).filter(name => name.endsWith('.sqlite'));
  assert.equal(files.length, 1);
  const backup = new Database(path.join(backupDir, files[0]), { readonly: true, fileMustExist: true });
  try {
    assert.equal(backup.pragma('integrity_check', { simple: true }), 'ok');
    assert.equal(backup.prepare('SELECT COUNT(*) AS n FROM students').get().n, 1);
    assert.deepEqual(backup.pragma('foreign_key_check'), []);
  } finally {
    backup.close();
  }
});
