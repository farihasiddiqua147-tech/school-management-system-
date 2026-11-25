#!/usr/bin/env node
'use strict';

const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const sourcePath = path.resolve(process.env.DATABASE_FILE || './data/school.sqlite');
  const backupDir = path.resolve(process.env.BACKUP_DIR || './backups');

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Database file not found: ${sourcePath}`);
  }
  fs.mkdirSync(backupDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `school-${stamp}.sqlite`);
  const source = new Database(sourcePath, { readonly: true, fileMustExist: true });

  try {
    const integrity = source.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') throw new Error(`Source integrity check failed: ${integrity}`);
    const foreignKeyErrors = source.pragma('foreign_key_check');
    if (foreignKeyErrors.length) {
      throw new Error(`Source has ${foreignKeyErrors.length} foreign-key violation(s); backup stopped.`);
    }
    await source.backup(backupPath);
  } finally {
    source.close();
  }

  const verify = new Database(backupPath, { readonly: true, fileMustExist: true });
  try {
    const integrity = verify.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') throw new Error(`Backup integrity check failed: ${integrity}`);
    const foreignKeyErrors = verify.pragma('foreign_key_check');
    if (foreignKeyErrors.length) throw new Error(`Backup has ${foreignKeyErrors.length} foreign-key violation(s).`);
  } catch (error) {
    verify.close();
    try { fs.unlinkSync(backupPath); } catch {}
    throw error;
  }
  verify.close();

  const stat = fs.statSync(backupPath);
  if (stat.size === 0) {
    fs.unlinkSync(backupPath);
    throw new Error('Backup file is empty.');
  }
  process.stdout.write(`Backup verified: ${backupPath} (${stat.size} bytes)\n`);
}

main().catch(error => {
  console.error(`Database backup failed: ${error.message}`);
  process.exitCode = 1;
});
