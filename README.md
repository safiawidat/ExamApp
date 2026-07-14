# ExamApp

## Project overview

ExamApp is a full-stack examination project. Milestone 1 establishes the authentication foundation that lets students register publicly, lets lecturers use controlled seeded accounts, and enforces role-specific API access.

## Current milestone status

Milestone 1 implements and tests the authentication vertical slice. Authentication is integrated from the React client through the Express API to PostgreSQL. The final project, deployment, and real exam workflows are not complete.

The earlier `feature/docker-config` and `feature/microservices` work remains preserved. The `microservices/` directory is the preserved homework demonstration and is outside the current authentication application.

## Current architecture

```text
React client  ->  Express API  ->  PostgreSQL
```

The browser sends JSON requests to the API. Express validates credentials and bearer tokens, and PostgreSQL stores users, password hashes, roles, and the existing exam records.

## Repository structure

- `client/` — React and Vite browser application, including client tests
- `server/` — Express API, PostgreSQL repositories, seed script, and integration tests
- `docker/` — local PostgreSQL image, schema initialization, and development Compose file
- `microservices/` — preserved homework demonstration; not part of the Milestone 1 runtime

## Authentication design

- Student registration is public and always creates the `student` role. A client-supplied role is rejected.
- Lecturer creation is controlled by the server seed command and process environment.
- Passwords are hashed with bcrypt before storage and are never returned by the API.
- Successful login and registration return a signed JWT for bearer authentication.
- Protected requests reload the user from PostgreSQL, so role authorization uses the current database-backed identity.
- The client stores only the JWT in `sessionStorage`. Closing the browser session removes it; logout removes only the authentication token.

## Roles

- `lecturer` — can use lecturer-only access and create an exam through the existing API boundary
- `student` — can register publicly, use student-only access, and list exams through the existing API boundary

## Prerequisites

- Node.js
- npm
- Docker Desktop with Docker Compose

## Environment setup

Copy `client/.env.example` to `client/.env` for local client settings and copy `server/.env.example` to `server/.env` for local server settings. Fill in local values such as `YOUR_LOCAL_PASSWORD` and a new, strong `JWT_SECRET` generated for your machine.

Never commit `.env` files, real passwords, JWT secrets, tokens, lecturer credentials, or database connection details.

For a PostgreSQL-backed server, set `DATA_SOURCE=postgres`. Ensure the server database settings match the process-only PostgreSQL variables used when starting Docker.

## Start local PostgreSQL

From the repository root in PowerShell, set process-only values and start the development database:

```powershell
$env:POSTGRES_DB = 'examapp'
$env:POSTGRES_USER = 'examapp'
$env:POSTGRES_PASSWORD = 'YOUR_LOCAL_PASSWORD'
$env:POSTGRES_PORT = '5432'
docker compose -f docker/compose.dev.yaml up -d --build
```

Wait for the `postgres` service to become healthy. The schema in `docker/postgres/init.sql` is applied only when a fresh database volume is initialized.

## Install and start the server

```powershell
cd server
npm.cmd install
npm.cmd run dev
```

Before starting, configure the values described in `server/.env.example`, including the local PostgreSQL connection, a strong JWT secret, and the allowed client origin. The API defaults to port 3001.

## Seed a lecturer

Provide seed credentials only through the current process, then run the seed command from `server/`:

```powershell
$env:SEED_LECTURER_USERNAME = 'YOUR_LECTURER_USERNAME'
$env:SEED_LECTURER_PASSWORD = 'YOUR_LECTURER_PASSWORD'
npm.cmd run seed:users
```

Running the command again for an existing lecturer updates that lecturer's password. It refuses to convert an existing student account into a lecturer.

## Install and start the client

```powershell
cd client
npm.cmd install
npm.cmd run dev
```

Open the local URL printed by Vite. `client/.env.example` documents the API base setting.

## Authentication API

| Method | Endpoint | Authentication | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | Public | Register a student and return a JWT plus safe user |
| `POST` | `/api/auth/login` | Public | Authenticate credentials and return a JWT plus safe user |
| `GET` | `/api/auth/me` | Bearer JWT | Restore the current database-backed user |
| `GET` | `/api/student/access` | Student | Verify the student role boundary |
| `GET` | `/api/lecturer/access` | Lecturer | Verify the lecturer role boundary |

The existing `/api/exams` routes are also protected: students and lecturers may list exams, while only lecturers may create one.

## Tests

Run all client tests:

```powershell
cd client
npm.cmd run test:run
```

Server tests are PostgreSQL integration tests and require a dedicated, isolated `TEST_DATABASE_URL` in the current process:

```powershell
cd server
$env:TEST_DATABASE_URL = 'YOUR_ISOLATED_TEST_DATABASE_URL'
$env:TEST_DATABASE_ISOLATED = 'true'
npm.cmd run test:run
```

The test suite never falls back to `DATABASE_URL`. The database name must use `test` or `vitest` as an explicit underscore-delimited segment: it must begin with `test_` or `vitest_`, contain `_test_` or `_vitest_`, or end with `_test` or `_vitest`. Valid examples include `test_examapp`, `examapp_test`, `examapp_test_run`, `vitest_examapp`, and `examapp_vitest_run`. The isolation marker must be exactly `true`, and the test URL must not match an existing `DATABASE_URL`. The suite uses generated usernames, deletes only its own records, runs sequentially, and closes its PostgreSQL pool. Do not point `TEST_DATABASE_URL` at a shared development, staging, or production database.

## Manual authentication smoke test

- [ ] Register a new student in the UI and confirm the student dashboard appears.
- [ ] Refresh and confirm the student session is restored.
- [ ] Log out and confirm the login form returns.
- [ ] Log in with a lecturer account created by the seed command.
- [ ] Confirm the lecturer dashboard appears.
- [ ] Refresh and confirm the lecturer session is restored.
- [ ] Log out and confirm the login form returns.
- [ ] Submit invalid credentials and confirm a safe generic error is visible.
- [ ] Confirm the browser console does not display passwords, JWTs, or secrets.

## Security notes

- Use unique, strong secrets and credentials for each environment.
- Serve deployed traffic over HTTPS and restrict the allowed client origin.
- Do not put sensitive values in source code, committed environment files, URLs, logs, or screenshots.
- Public registration cannot choose a role; lecturer accounts are controlled by the seed path.
- Invalid credentials receive the same generic API error.
- Authentication responses expose only safe user fields and never `password_hash`.
- JWT logout is client-side token removal; server-side revocation is not part of Milestone 1.

## Current limitations

- The exam UI remains mock-based and is not connected to the Express exam endpoints.
- The `microservices/` directory remains the preserved homework demonstration.
- Final deployment is not complete.
- Exam authoring, questions, submissions, grading, and results are not implemented as a real full-stack workflow.

## Git workflow

Development follows:

```text
feature branch  ->  pull request  ->  dev
```

Review and validate each feature before merging it into `dev`. The `dev` branch must not yet be merged into `main`; the final project is still incomplete.
