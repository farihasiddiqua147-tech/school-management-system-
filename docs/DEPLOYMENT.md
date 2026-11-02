# Local setup and deployment checklist

## Local development

1. Install Node.js 20 LTS and npm.
2. Clone this repository.
3. Copy `.env.example` to `.env`.
4. Generate a secret locally (do not send it to anyone): `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
5. Put the generated value in `JWT_SECRET`; choose a unique admin email and strong password (12+ characters).
6. Run `npm install`, then `npm start`.
7. Check `http://localhost:3000/api/health`.
8. Login by sending JSON to `POST /api/auth/login`; copy the returned token into an Authorization Bearer header for protected endpoints.

Example login body:
```json
{"email":"admin@example.com","password":"replace-with-your-own-strong-password"}
```

## Before any public deployment

- Set environment variables in the hosting provider's secret manager; never upload `.env`.
- Use HTTPS and restrict CORS to the actual frontend origin.
- Use a persistent disk/volume for SQLite, or migrate to a managed PostgreSQL database for multiple app instances.
- Use automated encrypted backups and test restoring them.
- Add request validation, automated integration tests, audit logging calls, monitoring and error reporting.
- Review authorization for each role and resource. Guardian/student routes need ownership checks before real records are exposed.
- Configure a transactional SMS/email provider only after adding consent, templates, rate limits, delivery logs and secrets.
- Do not use real student/guardian information until security review and access controls are complete.
- Configure hosting health checks against `/api/health`.

## Current limitation

The API is a starter implementation and the existing static Bengali UI is still a localStorage prototype; it does not yet call the API. The database tables for timetable, library, inventory and audit logs are present, but complete CRUD APIs/screens for those modules are not finished. This repository has not been deployment-tested in a live hosting environment.
