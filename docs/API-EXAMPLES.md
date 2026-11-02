# API quick examples

Replace `BASE` with the local API URL, usually `http://localhost:3000`.

## Login
```sh
curl -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"email":"admin@example.com","password":"YOUR_LOCAL_ADMIN_PASSWORD"}'
```

Save the token in your own terminal variable (do not commit it):
```sh
TOKEN='paste-token-in-your-local-terminal-only'
curl "$BASE/api/dashboard" -H "Authorization: Bearer $TOKEN"
```

## Read and update school settings
```sh
curl "$BASE/api/settings" -H "Authorization: Bearer $TOKEN"
curl -X PUT "$BASE/api/settings" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"schoolName":"Your School","address":"Your address","academicYear":"2026"}'
```

## Create a student
```sh
curl -X POST "$BASE/api/students" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"name":"Demo Student","class_name":"Class 5","roll":"12"}'
```

Use fictitious test data during development. Never put a real token or password in a public repository.
