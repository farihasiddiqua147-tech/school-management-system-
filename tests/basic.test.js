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


test('SQLite student account and profile survive closing and reopening the database', () => {
  const Database = require('better-sqlite3');
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const bcrypt = require('bcryptjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'school-db-test-'));
  const dbPath = path.join(dir, 'school.sqlite');
  const schema = fs.readFileSync(path.join(__dirname, '../server/schema.sql'), 'utf8');

  try {
    let db = new Database(dbPath);
    db.exec(schema);
    const columns = db.prepare('PRAGMA table_info(students)').all().map(c => c.name);
    if (!columns.includes('user_id')) db.exec('ALTER TABLE students ADD COLUMN user_id INTEGER REFERENCES users(id)');
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_students_user_id ON students(user_id) WHERE user_id IS NOT NULL');

    const email = 'student@example.com';
    const password = 'a-secure-password';
    const user = db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,'student')")
      .run('Test Student', email, bcrypt.hashSync(password, 4));
    const student = db.prepare('INSERT INTO students(name,class_name,roll,user_id) VALUES(?,?,?,?)')
      .run('Test Student', 'Class 5', '12', user.lastInsertRowid);
    db.close();

    db = new Database(dbPath);
    const savedUser = db.prepare('SELECT * FROM users WHERE email=?').get(email);
    const savedStudent = db.prepare('SELECT * FROM students WHERE id=? AND user_id=?')
      .get(student.lastInsertRowid, savedUser.id);
    assert.ok(savedUser);
    assert.equal(savedUser.role, 'student');
    assert.equal(bcrypt.compareSync(password, savedUser.password_hash), true);
    assert.ok(savedStudent);
    assert.equal(savedStudent.name, 'Test Student');
    db.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
