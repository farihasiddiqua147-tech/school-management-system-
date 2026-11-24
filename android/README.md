# Native Android App

This folder contains the first Kotlin + Jetpack Compose Android client for the School Management System.

## Build
The GitHub Actions workflow `.github/workflows/android-apk.yml` builds a debug APK and uploads it as a workflow artifact.

Manual build (Android SDK + JDK 17 + Gradle 8.9):
```bash
cd android
gradle assembleDebug
```

## Current implementation
- Native Android project (Kotlin / Jetpack Compose)
- HTTPS-only network access
- Login through the existing `POST /api/auth/login` endpoint
- Session token stored with AndroidX EncryptedSharedPreferences
- Session validation through `GET /api/auth/me`
- Initial dashboard data request through `GET /api/dashboard`
- Logout and dashboard refresh

## API
The default API base URL is configured in `app/build.gradle.kts` as the existing Render deployment. Change `BuildConfig.API_BASE_URL` when the backend domain changes.

## Important
This is the first native client foundation, not a claim that every role workflow is complete. Student, teacher, guardian, accountant and admin feature screens must be connected and tested against their corresponding API endpoints before production release. The current backend must be reachable over HTTPS. The APK currently uses a debug signing key and is for testing, not Play Store publication.
