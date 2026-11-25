const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('runtime is pinned to Node 20 for the native SQLite dependency', () => {
  assert.match(read('.node-version').trim(), /^20\./);
  assert.match(read('package.json'), /"node":\s*"20\.x"/);
});

test('API enforces a sufficiently long JWT secret before starting', () => {
  const server = read('server/index.js');
  assert.match(server, /!JWT_SECRET\s*\|\|\s*JWT_SECRET\.length\s*<\s*32/);
});

test('sensitive administrative routes require authentication and role checks', () => {
  const server = read('server/index.js');
  assert.match(server, /app\.post\('\/api\/users',auth,allow\('admin'\)/);
  assert.match(server, /app\.put\('\/api\/settings',auth,allow\('admin'\)/);
  assert.match(server, /app\.post\('\/api\/fees',auth,allow\('admin','accountant'\)/);
});

test('student and guardian marksheet requests are scoped to linked records', () => {
  const server = read('server/index.js');
  assert.match(server, /WHERE id=\? AND user_id=\?/);
  assert.match(server, /WHERE id=\? AND guardian_user_id=\?/);
  assert.match(server, /You may only view your own marksheet/);
  assert.match(server, /You may only view your linked student marksheet/);
});

test('online payment endpoint fails closed until gateway integration is complete', () => {
  const server = read('server/index.js');
  assert.match(server, /app\.post\('\/api\/payments\/online'/);
  assert.match(server, /status\(503\)\.json\(\{error:'Online payment gateway is not configured yet/);
});

test('SQLite backup utility checks source and backup integrity', () => {
  const backup = read('scripts/backup-sqlite.js');
  assert.match(backup, /integrity_check/);
  assert.match(backup, /foreign_key_check/);
  assert.match(backup, /await source\.backup\(backupPath\)/);
  assert.match(backup, /Backup verified/);
  assert.match(read('package.json'), /"db:backup": "node scripts\/backup-sqlite\.js"/);
  assert.match(read('scripts/restore-sqlite.js'), /Target already exists; restore will not overwrite any file/);
  assert.match(read('package.json'), /"db:restore": "node scripts\/restore-sqlite\.js"/);
});


test('accounting receipt and ledger endpoints are role restricted and parameterized', () => {
  const server = read('server/index.js');
  assert.match(server, /app\.get\('\/api\/fees\/:id\/receipt\/:receiptNo',auth,allow\('admin','accountant'\)/);
  assert.match(server, /app\.get\('\/api\/reports\/fee-ledger',auth,allow\('admin','accountant'\)/);
  assert.match(server, /from must not be later than to/);
});

test('marksheet GPA is zero when any subject is failed', () => {
  const server = read('server/index.js');
  assert.match(server, /enriched\.some\(s=>s\.point===0\)\?0/);
});
