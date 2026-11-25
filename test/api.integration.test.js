const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

test('API integration: authentication, marksheet GPA, receipt and accounting permissions', async t => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'school-api-'));
  const port = await freePort();
  const adminEmail = 'integration-admin@example.test';
  const adminPassword = 'Integration-Admin-123!';
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      JWT_SECRET: 'integration-test-secret-that-is-at-least-32-characters',
      DATABASE_FILE: path.join(tempDir, 'test.sqlite'),
      ADMIN_EMAIL: adminEmail,
      ADMIN_PASSWORD: adminPassword,
      ADMIN_NAME: 'Integration Admin'
    },
    stdio: 'ignore'
  });
  const base = `http://127.0.0.1:${port}`;
  t.after(async () => {
    child.kill('SIGTERM');
    await new Promise(resolve => {
      if (child.exitCode !== null) return resolve();
      child.once('exit', resolve);
      setTimeout(resolve, 1500);
    });
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  let ready = false;
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) throw new Error(`API exited before startup (code ${child.exitCode})`);
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) { ready = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(ready, true, 'API should become healthy');

  const request = async (route, { token, method = 'GET', body } = {}) => {
    const response = await fetch(`${base}${route}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(token ? { authorization: `Bearer ${token}` } : {})
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const data = await response.json();
    return { status: response.status, data };
  };

  const login = await request('/api/auth/login', {
    method: 'POST', body: { email: adminEmail, password: adminPassword }
  });
  assert.equal(login.status, 200);
  const adminToken = login.data.token;
  assert.ok(adminToken);

  const studentResponse = await request('/api/students', {
    token: adminToken, method: 'POST',
    body: { name: 'Integration Student', class_name: 'Class 1', roll: '1' }
  });
  assert.equal(studentResponse.status, 201);
  const studentId = studentResponse.data.student.id;

  const examResponse = await request('/api/exams', {
    token: adminToken, method: 'POST',
    body: { name: 'Term Test', class_name: 'Class 1', exam_date: '2026-11-20', academic_year: '2026' }
  });
  assert.equal(examResponse.status, 201);
  const examId = examResponse.data.exam.id;
  for (const result of [
    { subject: 'English', marks: 90, max_marks: 100 },
    { subject: 'Bangla', marks: 30, max_marks: 100 }
  ]) {
    const saved = await request('/api/results', {
      token: adminToken, method: 'POST',
      body: { exam_id: examId, student_id: studentId, ...result }
    });
    assert.equal(saved.status, 200);
  }
  const marksheet = await request(`/api/reports/marksheet?exam_id=${examId}&student_id=${studentId}`, { token: adminToken });
  assert.equal(marksheet.status, 200);
  assert.equal(marksheet.data.gpa, 0, 'one failed subject should result in GPA zero');
  assert.equal(marksheet.data.grade, 'F');

  const feeResponse = await request('/api/fees', {
    token: adminToken, method: 'POST',
    body: { student_id: studentId, description: 'Tuition fee', amount: 1000, fee_type: 'monthly_tuition' }
  });
  assert.equal(feeResponse.status, 201);
  const feeId = feeResponse.data.fee.id;
  const payment = await request(`/api/fees/${feeId}/payment`, {
    token: adminToken, method: 'POST', body: { amount: 250, method: 'cash', reference: 'TEST-001' }
  });
  assert.equal(payment.status, 200);
  const receiptNo = payment.data.receipt.receipt_no;

  const receipt = await request(`/api/fees/${feeId}/receipt/${encodeURIComponent(receiptNo)}`, { token: adminToken });
  assert.equal(receipt.status, 200);
  assert.equal(receipt.data.receipt.amount, 250);
  assert.equal(receipt.data.receipt.student_id, studentId);

  const ledger = await request('/api/reports/fee-ledger', { token: adminToken });
  assert.equal(ledger.status, 200);
  assert.equal(ledger.data.total.payment_count, 1);
  assert.equal(ledger.data.total.collected, 250);
  assert.equal(ledger.data.payments.length, 1);

  const invalidRange = await request('/api/reports/fee-ledger?from=2026-12-01&to=2026-01-01', { token: adminToken });
  assert.equal(invalidRange.status, 400);

  const teacherUser = await request('/api/users', {
    token: adminToken, method: 'POST',
    body: { name: 'Integration Teacher', email: 'integration-teacher@example.test', password: 'Integration-Teacher-123!', role: 'teacher' }
  });
  assert.equal(teacherUser.status, 201);
  const teacherLogin = await request('/api/auth/login', {
    method: 'POST', body: { email: 'integration-teacher@example.test', password: 'Integration-Teacher-123!' }
  });
  assert.equal(teacherLogin.status, 200);
  const deniedLedger = await request('/api/reports/fee-ledger', { token: teacherLogin.data.token });
  assert.equal(deniedLedger.status, 403);
});
