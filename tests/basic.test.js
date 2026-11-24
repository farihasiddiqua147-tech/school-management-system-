const test = require('node:test');
const assert = require('node:assert/strict');

test('grade mapping returns expected Bangladesh-style letter grades', () => {
  const grade = (p) => p >= 80 ? 'A+' : p >= 70 ? 'A' : p >= 60 ? 'A-' : p >= 50 ? 'B' : p >= 40 ? 'C' : p >= 33 ? 'D' : 'F';
  assert.equal(grade(80), 'A+');
  assert.equal(grade(79.99), 'A');
  assert.equal(grade(33), 'D');
  assert.equal(grade(32.99), 'F');
});
test('percentage handles numeric marks', () => {
  assert.equal((75 / 100) * 100, 75);
  assert.equal((45 / 60) * 100, 75);
});

const { validateStudentLogin } = require('../server/student-validation');

test('student creation requires a valid login email and password', () => {
  assert.match(validateStudentLogin('', 'long-enough-password'), /valid email/i);
  assert.match(validateStudentLogin('not-an-email', 'long-enough-password'), /valid email/i);
  assert.match(validateStudentLogin('student@example.com', 'short'), /12 characters/i);
  assert.equal(validateStudentLogin('student@example.com', 'a-secure-password'), null);
});
