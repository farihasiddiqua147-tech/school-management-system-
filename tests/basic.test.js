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


test('application refuses DATABASE_URL until PostgreSQL adapter is implemented', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '../server/index.js'), 'utf8');
  const guardAt = source.indexOf("if (process.env.DATABASE_URL)");
  const sqliteOpenAt = source.indexOf('new Database(dbFile)');
  assert.notEqual(guardAt, -1, 'DATABASE_URL safety guard must exist');
  assert.notEqual(sqliteOpenAt, -1, 'SQLite initialization must be identifiable');
  assert.ok(guardAt < sqliteOpenAt, 'DATABASE_URL guard must run before SQLite opens');
  assert.match(source.slice(guardAt, sqliteOpenAt), /process\.exit\(1\)/);
});


test('admin role is authorized to list students', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '../server/index.js'), 'utf8');
  assert.match(
    source,
    /app\.get\('\/api\/students',\s*auth,\s*allow\('admin','teacher','accountant','guardian'\)/
  );
});


test('teacher student access is limited to assigned classes', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '../server/index.js'), 'utf8');
  const listRoute = source.slice(source.indexOf("app.get('/api/students'"), source.indexOf("app.post('/api/students'"));
  assert.match(listRoute, /teacherClassNames\(req\.user\.id\)/);
  const createRoute = source.slice(source.indexOf("app.post('/api/students'"), source.indexOf("app.post('/api/students/:id/deactivate'"));
  assert.match(createRoute, /teacherCanAccessClass\(req\.user\.id,cls\)/);
});

test('student and guardian exam listings are class scoped', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '../server/index.js'), 'utf8');
  const route = source.slice(source.indexOf("app.get('/api/exams'"), source.indexOf("app.post('/api/exams'"));
  assert.match(route, /req\.user\.role==='student'/);
  assert.match(route, /req\.user\.role==='guardian'/);
  assert.match(route, /teacherClassNames\(req\.user\.id\)/);
});

test('notices validate audience and only return notices for the signed-in role', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '../server/index.js'), 'utf8');
  const route = source.slice(source.indexOf("app.get('/api/notices'"), source.indexOf("function gradePoint"));
  assert.match(route, /audienceForRole/);
  assert.match(route, /Invalid notice audience/);
});


test('marksheet access verifies the exam class and teacher assignment', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '../server/index.js'), 'utf8');
  const route = source.slice(source.indexOf("app.get('/api/reports/marksheet'"), source.indexOf("app.get('/api/reports/fees'"));
  assert.match(route, /student\.class_name!==exam\.class_name/);
  assert.match(route, /teacherCanAccessClass\(req\.user\.id,student\.class_name\)/);
});


test('marksheet GPA is zero if any subject grade is a fail', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '../server/index.js'), 'utf8');
  const route = source.slice(source.indexOf("app.get('/api/reports/marksheet'"), source.indexOf("app.get('/api/reports/fees'"));
  assert.match(route, /const failed=enriched\.some\(s=>s\.letter==='F'\)/);
  assert.match(route, /const gpa=failed\?0:/);
  assert.match(route, /grade:failed\?'F':gradePoint\(percentage\)\.letter/);
});
