#!/usr/bin/env node
'use strict';

const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');

function assertHealthy(database, label) {
  const integrity = database.pragma('integrity_check', { simple: true });
  if (integrity !== 'ok') throw new Error(`${label} integrity check failed: ${integrity}`);
  const violations = database.pragma('foreign_key_check');
  if (violations.length) throw new Error(`${label} has ${violations.length} foreign-key violation(s).`);
}

async function main() {
  const [sourceArg, targetArg, ...extra] = process.argv.slice(2);
  if (!sourceArg || !targetArg || extra.length) {
    throw new Error('Usage: node scripts/restore-sqlite.js <backup.sqlite> <new-target.sqlite>');
  }

  const sourcePath = path.resolve(sourceArg);
  const targetPath = path.resolve(targetArg);
  if (sourcePath === targetPath) throw new Error('Source and target paths must be different.');
  if (!fs.existsSync(sourcePath)) throw new Error(`Backup file not found: ${sourcePath}`);
  if (fs.existsSync(targetPath)) throw new Error('Target already exists; restore will not overwrite any file.');
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
  try {
    assertHealthy(source, 'Source backup');
    await source.backup(targetPath);
  } finally {
    source.close();
  }

  const restored = new Database(targetPath, { readonly: true, fileMustExist: true });
  try {
    assertHealthy(restored, 'Restored database');
  } catch (error) {
    restored.close();
    try { fs.unlinkSync(targetPath); } catch {}
    throw error;
  }
  restored.close();

  process.stdout.write(`Restore copy verified: ${targetPath}\n`);
}

main().catch(error => {
  console.error(`Database restore failed: ${error.message}`);
  process.exitCode = 1;
});
