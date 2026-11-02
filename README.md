# School Management System

A Bengali-first school-management starter project with a responsive browser UI and a Node.js REST API.

## Included in this repository

### Browser prototype
- Bengali dashboard and responsive layout
- Student list and add-student form
- Admin-editable school name, logo URL, address, phone, email and academic year
- Demo UI data saved in the current browser's localStorage

### API backend (starter)
- JWT login and current-user endpoint
- Password hashing with bcrypt
- Roles: admin, teacher, student, guardian, accountant
- Admin-managed school settings
- Students and staff endpoints
- Bulk attendance, homework, exams and marks/results
- Fee creation and payment recording
- Notices and dashboard totals
- SQLite schema, indexes and foreign-key constraints
- Basic security middleware, login rate limit and environment configuration

## Run the API locally

Requires Node.js 20+ and npm. From the repository root:

1. Copy `.env.example` to `.env`.
2. Set a unique random `JWT_SECRET` of at least 32 characters.
3. Set a strong `ADMIN_PASSWORD` of at least 12 characters and change `ADMIN_EMAIL`.
4. Install dependencies with `npm install`.
5. Start with `npm start`.
6. Open `http://localhost:3000/api/health` to verify the service.

The first start creates the SQLite database under `data/` and bootstraps an admin using the values in `.env` if that email does not already exist. Never commit `.env`, real student data, passwords, tokens or production database files.

## API overview

- `POST /api/auth/login` — login with email and password
- `GET /api/auth/me` — current account
- `GET/PUT /api/settings` — read/update school settings (update is admin-only)
- `GET /api/dashboard` — overview counts
- `GET/POST/PATCH /api/students` — student records
- `GET/POST /api/staff` — staff records
- `GET /api/attendance`, `POST /api/attendance/bulk`
- `GET/POST /api/homework`
- `GET/POST /api/exams`, `POST /api/results`, `GET /api/results`
- `GET/POST /api/fees`, `POST /api/fees/:id/payment`
- `GET/POST /api/notices`
- `POST /api/users` — admin creates role-based accounts

Protected endpoints require `Authorization: Bearer <token>`. Send JSON bodies with `Content-Type: application/json`.

## Important status and limitations

This is an **early-stage starter, not a complete production-ready school system**. The existing browser UI is not yet connected to the API; the API needs automated tests and deployment verification. Some role-specific data filtering, student/guardian self-service, full CRUD screens, receipt/ledger reporting, GPA/grading rules, library, inventory, timetable, email/SMS provider integration, backups, audit logging and production deployment remain to be implemented and tested. Review the code and security configuration before using real student information. Use HTTPS and backups in any deployment.
