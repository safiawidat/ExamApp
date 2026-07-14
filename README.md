# ExamApp

## Project overview

ExamApp is a full-stack examination project. Milestone 1 provides the completed authentication foundation: students register publicly, lecturers use controlled seeded accounts, and role-specific API access is enforced. Milestone 2 adds PostgreSQL-backed lecturer exam authoring and is ready for review on its feature branch.

## Current milestone status

Milestone 1 authentication remains implemented and tested from the React client through the Express API to PostgreSQL. Milestone 2 now covers a shared exam-type catalog, owned draft exams, and multiple-choice, true/false, and short-answer questions through lecturer-only APIs and the React lecturer dashboard. This work is still under review and unmerged; publishing, student delivery and submissions, grading, results, and final deployment are not complete.

The earlier `feature/docker-config` and `feature/microservices` work remains preserved. The `microservices/` directory is the preserved homework demonstration and is outside the current authentication application.

## Current architecture

```text
React client  ->  Express API  ->  PostgreSQL
```

The browser sends JSON requests to the API. Express validates credentials and bearer tokens, and PostgreSQL stores users, password hashes, roles, exam types, exams, questions, and multiple-choice options.

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

- `lecturer` — can use lecturer-only access, list shared exam types, manage exam types they created, and author exams and questions on their own drafts
- `student` — can register publicly and use student-only access; students cannot access any lecturer-authoring endpoint

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

Wait for the `postgres` service to become healthy. PostgreSQL entrypoint initialization runs only when a fresh database volume is initialized.

Fresh databases apply the base user schema and the versioned Milestone 2 migrations automatically. To upgrade an existing development database without deleting its volume, configure `DATABASE_URL` in `server/.env`, then run:

```powershell
cd server
npm.cmd run db:migrate
```

Migration 001 preserves users and replaces a legacy `exams` table only when it contains exactly two rows: one NULL-safe match for each known bootstrap tuple. An empty legacy table, a missing or duplicate bootstrap row, an unexpected title or description, and an unexpected `NULL` description all stop the transactional migration before the legacy table is dropped. A fresh database with no legacy `exams` table is supported.

Migration 002 replaces `questions_type_check` and `questions_answer_type_check`. It permits exactly `multiple_choice`, `true_false`, and `short_answer`: multiple choice stores correctness in `question_options.is_correct` and requires `questions.correct_answer` to be `NULL`; true/false stores exactly `'true'` or `'false'`; and short answer stores trimmed, non-empty text in `correct_answer`. Existing `open_text` rows or multiple-choice rows with a non-NULL answer fail before constraint replacement, and the migration transaction fully rolls back. Applied versions are recorded in `schema_migrations`, so successful reruns are skipped.

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

Milestone 1 authentication behavior remains unchanged while the temporary Milestone 1 exam boundary is superseded by the lecturer-authoring contract below.

## Milestone 2 authoring API

Every endpoint in this section requires a lecturer bearer token. An unauthenticated request receives `401`, and a student receives `403`.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/exam-types` | List all exam types available to lecturers |
| `POST` | `/api/exam-types` | Create an exam type owned by the current lecturer |
| `PATCH` | `/api/exam-types/:id` | Update an exam type created by the current lecturer |
| `DELETE` | `/api/exam-types/:id` | Delete an unused exam type created by the current lecturer |
| `GET` | `/api/exams` | List the current lecturer's exams |
| `POST` | `/api/exams` | Create a draft exam owned by the current lecturer |
| `GET` | `/api/exams/:id` | Read one exam owned by the current lecturer |
| `PATCH` | `/api/exams/:id` | Update one draft exam owned by the current lecturer |
| `DELETE` | `/api/exams/:id` | Delete one draft exam owned by the current lecturer |
| `GET` | `/api/exams/:examId/questions` | List questions on an owned exam |
| `POST` | `/api/exams/:examId/questions` | Add a question to an owned draft exam |
| `PUT` | `/api/exams/:examId/questions/reorder` | Reorder every question on an owned draft exam |
| `PATCH` | `/api/exams/:examId/questions/:questionId` | Update or change the type of a question on an owned draft exam |
| `DELETE` | `/api/exams/:examId/questions/:questionId` | Delete a question and compact later positions |

Exam types form a shared lecturer catalog: every lecturer may list them and use them for a new exam, while only the lecturer identified by `created_by` may update or delete one. Non-owners receive `404` for mutation attempts, and an owner receives `409` when trying to delete a type that an exam uses.

Exam lists, reads, updates, and deletions are owner-scoped. A lecturer cannot enumerate another lecturer's exams. Exams are created as drafts; publication endpoints are not part of the current milestone work, and published records cannot be modified or deleted through these draft-authoring endpoints.

Question reads are owner-scoped. Creates, updates, deletes, and reorders additionally require an owned draft exam and run transactionally. The server manages identifiers and positions; deletion compacts positions, and reorder payloads must contain every current question ID exactly once.

Question payloads use public authoring fields rather than database column names:

```json
{
  "question_type": "multiple_choice",
  "prompt": "Which answer is correct?",
  "points": 2,
  "options": [
    { "text": "First", "is_correct": true },
    { "text": "Second", "is_correct": false }
  ]
}
```

```json
{
  "question_type": "true_false",
  "prompt": "The statement is correct.",
  "points": 1,
  "correct_answer": false
}
```

```json
{
  "question_type": "short_answer",
  "prompt": "Give the reference response.",
  "points": 3,
  "reference_answer": "Expected response"
}
```

```json
{ "question_ids": [3, 1, 2] }
```

Multiple-choice options are trimmed, require at least two case-insensitively unique values, and require exactly one correct option. True/false uses a public boolean even though PostgreSQL stores exact text. Short answer uses the public `reference_answer` field. Type changes replace incompatible stored answer data instead of retaining stale fields.

The lecturer dashboard uses authenticated server-backed services for types, exams, and questions. It labels owned and shared types, limits ownership controls appropriately, supports create/edit/delete/reorder for every question type, confirms destructive changes and populated type transitions, and exposes safe loading and error states. It does not expose publishing controls.

## Tests

Run all client tests:

```powershell
cd client
npm.cmd run test:run
```

Run the configured client lint and production build:

```powershell
npm.cmd run lint
npm.cmd run build
```

Server tests are PostgreSQL integration tests and require a dedicated, isolated `TEST_DATABASE_URL` in the current process:

```powershell
cd server
$env:TEST_DATABASE_URL = 'YOUR_ISOLATED_TEST_DATABASE_URL'
$env:TEST_DATABASE_ISOLATED = 'true'
npm.cmd run test:run
```

The test suite never falls back to `DATABASE_URL`. The database name must use `test` or `vitest` as an explicit underscore-delimited segment: it must begin with `test_` or `vitest_`, contain `_test_` or `_vitest_`, or end with `_test` or `_vitest`. Valid examples include `test_examapp`, `examapp_test`, `examapp_test_run`, `vitest_examapp`, and `examapp_vitest_run`. The isolation marker must be exactly `true`, and the test URL must not match an existing `DATABASE_URL`. The suite covers Milestone 1 authentication plus migrations and the full Milestone 2 authoring contract, uses generated identities and tracked record IDs, deletes only its own records, runs sequentially, and closes its PostgreSQL pools. Do not point `TEST_DATABASE_URL` at a shared development, staging, or production database.

The final Milestone 2 validation passed 88 server tests and 112 client tests, plus client lint, the production build, migration rerun checks, and a 65-check API smoke workflow.

## Manual browser smoke checklist

- [ ] Register a new student in the UI and confirm the student dashboard appears.
- [ ] Refresh and confirm the student session is restored.
- [ ] Log out and confirm the login form returns.
- [ ] Log in with a lecturer account created by the seed command.
- [ ] Confirm the lecturer dashboard appears.
- [ ] Create, edit, and delete an unused owned exam type.
- [ ] Confirm a type created by another lecturer is selectable but has no edit or delete controls.
- [ ] Create and edit owned draft exams using both owned and shared types, then delete an unused draft.
- [ ] Create and edit multiple-choice, true/false (`true` and `false`), and short-answer questions.
- [ ] Confirm populated question-type transitions, reorder questions, delete a middle question, and verify compact positions.
- [ ] Refresh and confirm the lecturer session is restored.
- [ ] Confirm authored types, exams, and questions persist after refresh and logout/re-login.
- [ ] Confirm a student cannot see lecturer authoring and a second lecturer cannot access another lecturer's exams.
- [ ] Confirm no publishing, grading, or results controls appear.
- [ ] Confirm labels, keyboard controls, pending states, and safe errors are usable.
- [ ] Log out and confirm the login form returns.
- [ ] Submit invalid credentials and confirm a safe generic error is visible.
- [ ] Confirm the browser console has no unexpected errors and does not display passwords, JWTs, or secrets.

## Security notes

- Use unique, strong secrets and credentials for each environment.
- Serve deployed traffic over HTTPS and restrict the allowed client origin.
- Do not put sensitive values in source code, committed environment files, URLs, logs, or screenshots.
- Public registration cannot choose a role; lecturer accounts are controlled by the seed path.
- Invalid credentials receive the same generic API error.
- Authentication responses expose only safe user fields and never `password_hash`.
- Draft exam and question operations are lecturer-only and owner-scoped; exam-type mutations are creator-scoped.
- SQL inputs are parameterized, question mutations are transactional, and API responses expose only public question fields.
- JWT logout is client-side token removal; server-side revocation is not part of Milestone 1.

## Current limitations

- Publishing and unpublishing are not implemented.
- Student exam delivery and submission, grading, and results remain outside Milestone 2.
- The student portal still uses the legacy mock exam path; that mock path does not apply to lecturer authoring.
- The `microservices/` directory remains the preserved homework demonstration.
- Final deployment is not complete.

## Git workflow

Development follows:

```text
feature branch  ->  pull request  ->  dev
```

Review and validate each feature before merging it into `dev`. The `dev` branch must not yet be merged into `main`; the final project is still incomplete.
