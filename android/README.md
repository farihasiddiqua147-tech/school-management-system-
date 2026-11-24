# Native Android App

This folder contains the Kotlin + Jetpack Compose Android client for the School Management System.

## Build
The GitHub Actions workflow `.github/workflows/android-apk.yml` builds a debug APK and uploads it as a workflow artifact.

Manual build (Android SDK + JDK 17 + Gradle 8.9):
```bash
cd android
gradle assembleDebug
```

## Implemented
- Native Android login against `POST /api/auth/login`
- Encrypted local session token storage and session validation via `GET /api/auth/me`
- Dashboard refresh and logout
- Role-based data panels for Admin, Teacher, Student, Guardian and Accountant
- Admin forms: create student login/profile, publish notice, create fee
- Teacher forms: submit an attendance record, add homework, publish notice
- Accountant forms: create fee and record a payment using the existing receipt endpoint
- Successful writes refresh the dashboard and role data; API permission/validation errors are shown in the app
- HTTPS-only network access

## Role limitations
Student and Guardian accounts currently have read-only self-service views in this Android version. Some workflows still need dedicated screens, better selection controls (for example, choosing a student instead of entering an ID), end-to-end testing with real school data, and UI refinement. This build should be treated as a testing version, not a finished production app.

## API
The default API base URL is configured in `app/build.gradle.kts` as the existing Render deployment. Change `BuildConfig.API_BASE_URL` when the backend domain changes.

## Security and release
The APK is debug-signed and intended for testing, not Play Store publication. Use only authorized school accounts. Passwords are sent to the existing server over HTTPS and are not saved locally; the session token is stored with AndroidX encrypted preferences.
