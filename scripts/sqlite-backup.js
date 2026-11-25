#!/usr/bin/env node
'use strict';

// Safe SQLite backup/restore utility for maintenance windows.
// Backup:  node scripts/sqlite-backup.js backup ./data/school.sqlite ./backups
// Restore: node scripts/sqlite-backup.js restore ./backups/school-<timestamp>.sqlite ./data/restore-test.sqlite
// Restore always writes to a NEW destination; it never overwrites an existing database.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');

function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function verifyDatabase(filePath) {
  const db = new Database(filePath, { readonly: true, fileMustExist: true });
  try {
    const rows = db.pragma('integrity_check');
    if (rows.length !== 1 || rows[0].integrity_check !== 'ok') {
      throw new Error('SQLite integrity_check failed');
    }
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
    if (!tables.some(row => row.name === 'users')) {
      throw new Error('Database verification failed: users table is missing');
    }
    return { tables: tables.length };
  } finally {
    db.close();
  }
}

async function backup(source, outputDir) {
  const sourcePath = path.resolve(source);
  if (!fs.existsSync(sourcePath)) throw new Error('Source database does not exist');
  fs.mkdirSync(outputDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const destination = path.join(path.resolve(outputDir), `school-${stamp}.sqlite`);
  const db = new Database(sourcePath, { readonly: true, fileMustExist: true });
  try {
    await db.backup(destination);
  } finally {
    db.close();
  }
  const verification = verifyDatabase(destination);
  const manifest = {
    createdAt: new Date().toISOString(),
    sourceFileName: path.basename(sourcePath),
    backupFileName: path.basename(destination),
    sha256: sha256(destination),
    bytes: fs.statSync(destination).size,
    verification
  };
  fs.writeFileSync(destination + '.manifest.json', JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ ok: true, backup: destination, manifest: destination + '.manifest.json', ...manifest }, null, 2));
}

function restore(source, destination) {
  const sourcePath = path.resolve(source);
  const destinationPath = path.resolve(destination);
  if (!fs.existsSync(sourcePath)) throw new Error('Backup file does not exist');
  if (fs.existsSync(destinationPath)) throw new Error('Restore destination already exists; choose a new path so no data is overwritten');
  const manifestPath = sourcePath + '.manifest.json';
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.sha256 !== sha256(sourcePath)) throw new Error('Backup checksum does not match its manifest');
  }
  verifyDatabase(sourcePath);
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(sourcePath, destinationPath, fs.constants.COPYFILE_EXCL);
  try {
    const verification = verifyDatabase(destinationPath);
    console.log(JSON.stringify({ ok: true, restoredTo: destinationPath, sha256: sha256(destinationPath), ...verification }, null, 2));
  } catch (error) {
    fs.rmSync(destinationPath, { force: true });
    throw error;
  }
}

async function main(args) {
  const [command, source, destination] = args;
  if (command === 'backup' && source && destination) return backup(source, destination);
  if (command === 'restore' && source && destination) return restore(source, destination);
  throw new Error('Usage: node scripts/sqlite-backup.js backup <database.sqlite> <output-directory>\n   or: node scripts/sqlite-backup.js restore <backup.sqlite> <new-destination.sqlite>');
}

if (require.main === module) {
  main(process.argv.slice(2)).catch(error => {
    console.error('Database backup/restore failed:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { sha256, verifyDatabase, backup, restore };
