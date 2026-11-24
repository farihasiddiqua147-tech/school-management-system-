# School Management System

A Bengali-first, role-based school management web application with a Node.js/Express API and a native Android client foundation.

## Roles

- **Admin:** manage school settings, students, teacher accounts, class assignments, payment-gateway configuration and reports.
- **Teacher:** work with assigned classes, attendance, homework, exams and marks.
- **Student:** view own profile, attendance, homework, routine, fees and results, including exam-wise GPA/marksheet summaries.
- **Guardian:** view linked student records and role-appropriate notices.
- **Accountant:** manage fee invoices, record office payments and review fee totals.

## Run locally

Requires Node.js 20+ and npm.

1. Copy `.env.example` to `.env`.
2. Set a unique random `JWT_SECRET` of at least 32 characters.
3. Set a strong `ADMIN_PASSWORD` of at least 12 characters and change `ADMIN_EMAIL`.
4. Run `npm install`.
5. Run `npm start`.
6. Open `http://localhost:3000/login.html` and verify `http://localhost:3000/api/health`.

The API bootstraps an admin only when the configured admin email does not already exist. Never commit `.env`, real student records, passwords, tokens or database files.

## Main API areas

- Authentication: `POST /api/auth/login`, `GET /api/auth/me`
- School settings and users
- Students and staff
- Attendance, timetable, homework and exams
- Results and exam-wise GPA/marksheet: `GET /api/reports/marksheet?exam_id=...&student_id=...`
- Fees, office payment records and fee totals
- Role-targeted notices
- Student and teacher self-service endpoints

Protected endpoints require `Authorization: Bearer <token>`. The API uses role checks and record scoping; the automated tests include student-account persistence and role-scope regression checks. GitHub Actions also syntax-checks the backend and frontend scripts.

## Current implementation status

The web frontend is connected to the API for the implemented workflows. Student login and database persistence have been tested by the project owner. Recent work on branch `fix/database-persistence-audit` further limits role access, adds the notices screen, and adds GPA/marksheet summaries.

**This branch has not been merged into `main` or deployed to the live Render service.** Changes should be reviewed and verified before release.

## Not yet production-complete

- **Persistent production database:** the application still uses SQLite. Render's free web-service filesystem can be ephemeral; the PostgreSQL schema file is a draft, not a working PostgreSQL adapter. Do not set `DATABASE_URL` until the adapter and migration are implemented and tested. Back up any real data before changing databases.
- **SMS and email:** provider integration and credentials are not configured.
- **Online payments:** bKash/Nagad credential settings are not a live checkout integration. Merchant API calls, signature verification, callbacks and reconciliation are still required.
- **Accounting:** fee invoices, office payment receipts and fee totals exist; a complete expense ledger and audited financial statements still need implementation.
- **Remaining web workflows:** full management screens and end-to-end tests are still needed for every role and module, including guardian self-service and administrative attendance/result workflows.
- **Android:** the current native client is an initial role-based read-only dashboard. It is not yet a complete mobile app for creating/editing attendance, marks, fees, notices and other records. The debug APK is for testing, not Play Store publication.
- **Release readiness:** verify database backups and restore, audit logging, production security, real-device responsive behavior, all role permissions, and deployment after merge.

Do not use this starter with real student information until production database persistence, backups, permissions and deployment have been independently verified.
