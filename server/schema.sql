PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 email TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('admin','teacher','student','guardian','accountant')),
 active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS settings (
 key TEXT PRIMARY KEY,
 value TEXT NOT NULL,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS students (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 student_code TEXT UNIQUE,
 name TEXT NOT NULL,
 class_name TEXT NOT NULL,
 roll TEXT NOT NULL,
 guardian_name TEXT,
 guardian_phone TEXT,
 guardian_user_id INTEGER REFERENCES users(id),
 status TEXT NOT NULL DEFAULT 'active',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS staff (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER REFERENCES users(id),
 name TEXT NOT NULL,
 designation TEXT NOT NULL,
 phone TEXT,
 joined_on TEXT,
 active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS attendance (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
 attendance_date TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('present','absent','late','leave')),
 note TEXT,
 marked_by INTEGER REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(student_id, attendance_date)
);
CREATE TABLE IF NOT EXISTS homework (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 class_name TEXT NOT NULL,
 subject TEXT NOT NULL,
 title TEXT NOT NULL,
 description TEXT,
 due_date TEXT,
 created_by INTEGER REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS exams (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 class_name TEXT NOT NULL,
 exam_date TEXT,
 academic_year TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS results (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
 student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
 subject TEXT NOT NULL,
 marks REAL NOT NULL CHECK(marks >= 0),
 max_marks REAL NOT NULL DEFAULT 100 CHECK(max_marks > 0),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(exam_id, student_id, subject)
);
CREATE TABLE IF NOT EXISTS fees (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 student_id INTEGER NOT NULL REFERENCES students(id),
 description TEXT NOT NULL,
 amount REAL NOT NULL CHECK(amount >= 0),
 paid_amount REAL NOT NULL DEFAULT 0 CHECK(paid_amount >= 0),
 due_date TEXT,
 status TEXT NOT NULL DEFAULT 'unpaid' CHECK(status IN ('unpaid','partial','paid')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS notices (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 title TEXT NOT NULL,
 body TEXT NOT NULL,
 audience TEXT NOT NULL DEFAULT 'all',
 published INTEGER NOT NULL DEFAULT 1,
 created_by INTEGER REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_name);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(attendance_date);
CREATE INDEX IF NOT EXISTS idx_results_exam ON results(exam_id, student_id);
CREATE INDEX IF NOT EXISTS idx_fees_student ON fees(student_id);