# ExamApp

## Project overview

ExamApp is a full-stack examination application built with a React client, an Express API, and PostgreSQL. The implementation covers the complete exam lifecycle: public student registration, controlled lecturer creation, JWT authentication, lecturer-owned exam authoring, publication, separate question notices, student-safe exam delivery, one final submission per student per exam, lecturer grading of submissions, and publication of results back to students.

## Live deployment

| Component | URL |
| --- | --- |
| Client | https://examapp-bs77.onrender.com |
| API | https://examapp-x1fb.onrender.com |
| API health check | https://examapp-x1fb.onrender.com/api/health |
| Database | PostgreSQL, hosted on Neon |

Both services are hosted on Render; the client is a static site build, the API is a Render web service. `/api/health` runs `SELECT 1` against Neon and is used as the platform health check, so a `200 {"status":"ok"}` response confirms the API, its environment configuration, and the database connection together.

## Implemented functionality

- Students can register, log in, restore a browser session, log out, browse published exams, open a student-safe exam, submit one final answer set, and view their published grade and per-question feedback once a lecturer publishes results.
- Lecturers use controlled seeded accounts and can manage their own exam types, use shared exam types, create owned draft exams, and author multiple-choice, true/false, and short-answer questions.
- Draft questions can be updated, deleted with position compaction, and reordered.
- A non-empty draft exam can be published once. Published exam content is immutable, and no unpublish workflow exists.
- From an owned published exam, a lecturer can open the notice workspace, review questions in stored order, see each existing notice or a `No notice` state, and add, edit, or delete a notice with `above` or `below` placement.
- Notices are separate records delivered to students independently of immutable question content. Managing a notice never edits the published exam or question.
- Lecturers review submissions for an owned exam, award per-question marks (multiple-choice and true/false are calculated automatically; short answer is scored manually), mark grading complete, and can reopen a completed grading pass before publishing.
- Lecturers publish a completed grading result to the submitting student; publication is only possible after grading is marked complete.
- Student responses never contain correctness flags, correct answers, or reference answers before a result is published.

## Architecture

```text
React client (Render static site)  ->  Express API (Render web service)  ->  PostgreSQL (Neon)
```

The React client sends JSON requests to the Express API. Express validates payloads, authenticates bearer tokens, enforces roles and ownership, and delegates persistence to PostgreSQL repositories. PostgreSQL is the source of truth for users, roles, exam types, exams, questions, multiple-choice options, question notices, exam submissions, submission answers, and grading/result state.

Full architecture diagrams (overall, client-only, server-only, and deployment) are in [`docs/architecture.md`](docs/architecture.md).

The preserved `microservices/` homework demonstration is a separate, self-contained module and is not part of the primary ExamApp runtime — see [`microservices/README.md`](microservices/README.md).

## Repository structure

- `client/` — React and Vite client, API adapters, validation, components, and client tests
- `server/` — Express routes, controllers, services, repositories, migrations, scripts, and integration tests
- `docker/` — local PostgreSQL image, base schema, and development Compose configuration
- `docs/` — architecture, ERD, API reference, sequence diagrams, and project documentation
- `microservices/` — preserved homework demonstration; not the ExamApp runtime

## Roles and authorization

### Lecturer

- Uses an account created through the controlled lecturer seed command.
- Lists the shared exam-type catalog and may use any listed type for an exam.
- Creates, updates, and deletes only exam types that the lecturer owns.
- Creates and manages only owned draft exams.
- Authors multiple-choice, true/false, and short-answer questions on owned drafts.
- Publishes an owned exam only after it contains at least one question.
- Cannot edit, delete, or reorder published exam content, and cannot unpublish an exam.
- Can open `Manage notices` only for an owned published exam, manage a separate above/below notice for each question, and return to the exam dashboard.
- Lists and opens submissions for an owned exam, awards a per-question mark for each answer, marks a submission's grading `completed`, and may `reopen` a completed grading pass to correct it before publishing.
- Publishes a result only from `completed` grading state; publication is irreversible through the API.

Owner-scoped reads and mutations hide another lecturer's resources with `404` where applicable.

### Student

- Registers publicly; registration always assigns the `student` role.
- Views only published exams.
- Opens student-safe exam details and submits one final answer set.
- Sees whether the authenticated student has already submitted each exam.
- Views a published result for a submitted exam, including total score, percentage, and per-question feedback where entered by the lecturer.
- Cannot access lecturer endpoints.
- Never receives correct answers, reference answers, option correctness, scores, feedback, or results before the lecturer publishes them.

## Prerequisites

- Node.js and npm
- Docker Desktop with Docker Compose
- PowerShell for the example commands below, or equivalent commands in another shell

## Environment setup

Copy `server/.env.example` to `server/.env` and `client/.env.example` to `client/.env`. Configure local values without committing either file.

For the server, configure:

- `PORT`
- `DATABASE_URL` — must include `sslmode=require` (or set `DB_SSL=true`) when pointing at a hosted database such as Neon
- `DB_SSL`
- `JWT_SECRET` — at least 32 characters; a short value or a known placeholder (e.g. `changeme`, `secret`) is rejected at startup in production
- `JWT_EXPIRES_IN`
- `CLIENT_ORIGIN`
- `SEED_LECTURER_USERNAME` and `SEED_LECTURER_PASSWORD` when running the seed command

PostgreSQL is the only supported data source; the legacy `DATA_SOURCE` switch and its JSON-file fallback have been removed.

For the client, `VITE_API_BASE_URL` must point to the local API base, including `/api`. The client uses the local default only when that variable is absent.

Never commit credentials, JWT secrets, tokens, database connection details, or populated `.env` files.

## Local PostgreSQL startup

From the repository root, provide process-local Compose values and start PostgreSQL:

```powershell
$env:POSTGRES_DB = 'examapp'
$env:POSTGRES_USER = 'examapp'
$env:POSTGRES_PASSWORD = 'YOUR_LOCAL_PASSWORD'
$env:POSTGRES_PORT = '5432'
docker compose -f docker/compose.dev.yaml up -d --build
```

Wait until the `postgres` service is healthy. The PostgreSQL image initializes the base `users` table and the migrations copied into the image when a new volume is created. After configuring `server/.env`, always run the migration command to apply every pending version, including migrations 003 and 004.

## Migrations 001–005

From `server/`:

```powershell
npm.cmd run db:migrate
```

The migration runner loads numbered SQL files in order, uses a transaction and advisory lock, records applied versions in `schema_migrations`, and skips successful versions on later runs. A successful rerun reports that the database schema is already up to date.

- **001 — lecturer exam authoring:** preserves the existing `users` table; replaces only the exact known legacy bootstrap exam dataset; creates `exam_types`, lecturer-owned `exams`, `questions`, `question_options`, indexes, constraints, and timestamp triggers. Unexpected legacy data stops the transactional migration instead of being discarded.
- **002 — question types:** replaces the original question-type constraints with `multiple_choice`, `true_false`, and `short_answer`. Multiple-choice correctness stays on options, true/false stores an exact Boolean representation, and short answer stores trimmed non-empty reference text. Ambiguous legacy `open_text` rows stop migration.
- **003 — final submissions:** creates `exam_submissions` and `submission_answers`. `(exam_id, student_id)` is unique. The submission service writes exactly one answer row for every exam question, while the answer primary key prevents more than one row for the same submission/question pair. Selected-option, Boolean, and text answers are stored in separate nullable columns; a row with all three values null represents an unanswered question. Composite foreign keys keep submissions, exams, questions, and options aligned. Checks plus `examapp_validate_submission_answer()` enforce answer shape, and the API writes the submission transactionally.
- **004 — question notices:** creates separate `question_notices` storage with one notice per question and a composite exam/question relationship. Messages must be trimmed, non-empty, and at most 1000 characters. Placement is `above` or `below`. An update trigger maintains `updated_at`. Notices remain independent of immutable published question content.
- **005 — grading and results:** adds `awarded_points` (0–1) and `lecturer_feedback` to `submission_answers`, and `grading_state`, `total_score`, `graded_by`, `grading_completed_at`, and `result_published_at` to `exam_submissions`. Check constraints enforce that grading fields are populated together only once `grading_state = 'completed'`, that `grading_completed_at` cannot precede submission time, and that `result_published_at` can only be set once grading is complete and scored.

## Server installation and startup

```powershell
cd server
npm.cmd install
npm.cmd run db:migrate
npm.cmd run dev
```

The API defaults to port 3001. Runtime startup requires a database connection and JWT secret.

## Lecturer seeding

Set lecturer seed values only in the current process, then run:

```powershell
cd server
$env:SEED_LECTURER_USERNAME = 'YOUR_LECTURER_USERNAME'
$env:SEED_LECTURER_PASSWORD = 'YOUR_LECTURER_PASSWORD'
npm.cmd run seed:users
```

Rerunning the command updates an existing lecturer's password. It will not convert an existing student account into a lecturer.

## Client installation and startup

```powershell
cd client
npm.cmd install
npm.cmd run dev
```

Open the local address printed by Vite. The client stores only the JWT in `sessionStorage`; user records and exam data remain server-backed.

## API reference

All bodies and responses use JSON unless an endpoint returns `204 No Content`.

### Authentication and access

| Method | Endpoint | Role | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | Public | Register a student and return a JWT plus safe user data |
| `POST` | `/api/auth/login` | Public | Authenticate and return a JWT plus safe user data |
| `GET` | `/api/auth/me` | Authenticated | Restore the current database-backed user |
| `GET` | `/api/lecturer/access` | Lecturer | Verify the lecturer role boundary |
| `GET` | `/api/student/access` | Student | Verify the student role boundary |

### Lecturer authoring and publication

Every endpoint below requires a lecturer bearer token.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/exam-types` | List the shared exam-type catalog |
| `POST` | `/api/exam-types` | Create an owned exam type |
| `PATCH` | `/api/exam-types/:id` | Update an owned exam type |
| `DELETE` | `/api/exam-types/:id` | Delete an unused owned exam type |
| `GET` | `/api/exams` | List the current lecturer's exams |
| `POST` | `/api/exams` | Create an owned draft exam |
| `GET` | `/api/exams/:id` | Read an owned exam |
| `PATCH` | `/api/exams/:id` | Update an owned draft exam |
| `DELETE` | `/api/exams/:id` | Delete an owned draft exam |
| `POST` | `/api/exams/:id/publish` | Publish a non-empty owned draft; accepts no client-controlled fields |
| `GET` | `/api/exams/:examId/questions` | List questions on an owned exam |
| `POST` | `/api/exams/:examId/questions` | Add a question to an owned draft |
| `PUT` | `/api/exams/:examId/questions/reorder` | Supply every question ID once in the requested draft order |
| `PATCH` | `/api/exams/:examId/questions/:questionId` | Update or change a question on an owned draft |
| `DELETE` | `/api/exams/:examId/questions/:questionId` | Delete a draft question and compact later positions |
| `GET` | `/api/exams/:examId/questions/:questionId/notice` | Read the notice for a question on an owned published exam |
| `PUT` | `/api/exams/:examId/questions/:questionId/notice` | Create or replace that question's notice |
| `DELETE` | `/api/exams/:examId/questions/:questionId/notice` | Delete that question's notice |
| `GET` | `/api/exams/:examId/submissions` | List submissions for an owned exam |
| `GET` | `/api/exams/:examId/submissions/:submissionId` | Read one submission, its answers, and current grading state |
| `PUT` | `/api/exams/:examId/submissions/:submissionId/grading` | Save per-question awarded marks and optional feedback |
| `POST` | `/api/exams/:examId/submissions/:submissionId/grading/complete` | Mark grading complete and calculate the total score |
| `POST` | `/api/exams/:examId/submissions/:submissionId/grading/reopen` | Reopen a completed (not yet published) grading pass |
| `POST` | `/api/exams/:examId/submissions/:submissionId/result/publish` | Publish the completed result to the student |

Notice writes accept only `message` and `placement`; placement must be `above` or `below`. Notice access is available only for owned published exams.

Multiple-choice and true/false answers are scored automatically by `gradingCalculator.js` against stored correctness; short-answer marks are entered manually by the lecturer as a value from 0 to 1 per question. `grading/complete` is only permitted once every question has an awarded mark, and calculates `total_score` as the sum of awarded marks out of the question count. `result/publish` is only permitted from `grading_state = 'completed'`.

### Student delivery and submission

Every endpoint below requires a student bearer token.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/student/exams` | List published exams and the authenticated student's submitted state |
| `GET` | `/api/student/exams/:id` | Load a published exam with ordered student-safe questions |
| `POST` | `/api/student/exams/:id/submissions` | Store the authenticated student's one final submission |
| `GET` | `/api/student/exams/:examId/result` | Read the authenticated student's published result for a submitted exam, if published |

### Important status behavior

- `401` — missing, malformed, invalid, or expired authentication
- `403` — authenticated user has the wrong role
- `404` — missing resources, unpublished student exams, and owner-hidden lecturer resources where applicable
- `409` — conflicts such as duplicate usernames, duplicate exam types, deleting an exam type in use, publishing an empty or already-published exam, modifying published content, notice operations on drafts, or duplicate final submission

## Important data and workflow rules

### Publication and immutability

- Draft metadata, questions, options, answer keys/reference answers, order, and deletion may be managed before publication.
- A zero-question exam cannot be published.
- Publishing is final in the current implementation; there is no unpublish endpoint.
- After publication, exam metadata, questions, options, answers, order, and deletion are locked through the authoring API.
- Question notices are separate records and remain manageable for owned published exams without changing the question itself.

### Student delivery

- Only published exams appear in the student catalog.
- Catalog ordering is publication time descending, then exam ID descending. Question and option ordering from the server is preserved.
- `has_submitted` is calculated only for the authenticated student.
- Detail responses contain prompts, points, positions, safe options, and optional notices.
- Correctness flags, correct answers, reference answers, lecturer IDs, scores, and feedback are excluded.

### Final submission

The public request body uses an `answers` array. Every exam question must appear exactly once:

```json
{
  "answers": [
    { "question_id": 101, "selected_option_id": 1001 },
    { "question_id": 102, "boolean_answer": false },
    { "question_id": 103 }
  ]
}
```

The third object is an explicit unanswered short-answer question. The client also supports a non-empty trimmed `text_answer` when that question is answered.

- Duplicate, missing, or unknown question IDs are rejected.
- A selected option must belong to its multiple-choice question.
- Answer fields must match the question type, and each question may have at most one non-null answer value.
- Unanswered questions are still written as explicit `submission_answers` rows with null answer values.
- Submission creation and all answer inserts are transactional.
- The unique exam/student constraint permits one final submission per student per exam; another attempt returns `409`.
- The `201` confirmation contains only submission ID, exam ID, submission timestamp, and answer count. It contains no grade, score, feedback, result, or correctness data.

## Lecturer and student UI

The lecturer dashboard loads shared exam types and owned exams from the API. Draft exams expose question authoring for all three question types, including editing, deletion, and reordering; a non-empty draft can be published after confirmation. Published content cannot be edited, deleted, or reordered, and no unpublish operation exists. Only published exams expose `Manage notices`.

`client/src/components/QuestionNoticeEditor.jsx` loads published questions in stored order and shows each existing notice or a `No notice` state. Lecturers can add a notice, choose `above` or `below`, edit or delete it, and return to the exam dashboard. Notice controls and back navigation lock while a mutation is pending. `client/src/api/questionNoticeService.js` performs authenticated notice reads, saves, and deletions and validates notice responses. Notices remain separate records, so this workspace does not expose question-content editing controls or alter immutable published content.

The student portal uses `studentExamService.js`, not local exam data. It loads the catalog first, then full exam detail on demand. `StudentForm` renders notices above or below their question, preserves Boolean `false`, represents every question in the final payload, and handles confirmation, pending, error, success, and catalog-refresh states. Submitted exams are disabled.

`client/src/components/SubmissionReviewWorkspace.jsx` lists an owned exam's submissions and lets a lecturer open one, award a mark per question (multiple-choice and true/false show the calculated mark; short answer is entered manually), add optional per-question feedback, save progress, mark grading complete, reopen a completed pass, and publish the result. `client/src/api/lecturerGradingService.js` performs the authenticated grading reads and writes and validates responses.

`client/src/components/StudentResult.jsx` requests `/api/student/exams/:examId/result` for a submitted exam. Before a lecturer publishes, the API returns `404` and the component shows a pending state; once published, it renders total score, percentage, and per-question feedback. `client/src/api/studentResultValidation.js` validates the published-result response shape.

## Testing and validation

Approved validation totals for the current implementation:

- Client: **20 test files, 404/404 tests passed** via `npm.cmd run test:run`
- Server: **14 test files, 304/304 tests passed** against isolated PostgreSQL, including a JSON `404` regression test
- Combined: **34 test files, 708/708 tests passed**
- Database: migrations 001–005 verified applied, in order, on the live Neon database via `schema_migrations`; `/api/health` confirms live connectivity

These totals reflect the codebase after the final dead-code cleanup (four unused client services and their tests removed) and the addition of Helmet and a JSON `404` handler.

Client commands:

```powershell
cd client
npm.cmd run test:run
npm.cmd run test:run -- --maxWorkers=1
npm.cmd run lint
npm.cmd run build
```

The worker cap applies only to the Vitest test runner. The ordinary project command remains `npm.cmd run test:run`; the explicit one-worker command is an additional serial validation, not the default configuration.

Server integration tests require an isolated test database:

```powershell
cd server
$env:TEST_DATABASE_URL = 'YOUR_ISOLATED_TEST_DATABASE_URL'
$env:TEST_DATABASE_ISOLATED = 'true'
npm.cmd run test:run
```

`TEST_DATABASE_URL` never falls back to `DATABASE_URL`, must not equal it, must use PostgreSQL, and must name a database clearly marked as a test database. `TEST_DATABASE_ISOLATED` must be exactly `true`. Never run integration tests against development, shared, staging, or production databases.

## Manual browser smoke checklist

A full manual smoke-test checklist covering authentication, authoring, publication, notices, student delivery, grading, and result publication is in [`docs/testing.md`](docs/testing.md).

## Security notes

- Passwords are hashed with bcrypt and are never returned.
- Public registration rejects any client-supplied role; lecturer creation is controlled by the seed path.
- JWTs are signed with an environment secret and sent as bearer tokens. The client stores only the JWT in `sessionStorage`.
- Protected requests reload the current user from PostgreSQL before role checks.
- Lecturer exam access is owner-scoped, while exam-type mutations are creator-scoped.
- SQL uses parameterized queries. Publishing, question mutations, migrations, submissions, and grading completion/publication use transactional safeguards where consistency spans multiple records.
- Student projections and client response validation reject private correctness, reference-answer, score, and feedback fields until a lecturer publishes a result, and always reject identity fields belonging to other users.
- `config.js` refuses to start in production with a missing, short (under 32 characters), or known-placeholder `JWT_SECRET`.
- Helmet sets standard security headers on all API responses; CORS is locked to a single configured `CLIENT_ORIGIN`.
- Unmatched routes return a JSON `404` body rather than falling through to a default HTML error page, keeping the API's error contract consistent for every response.
- Server logs record only error name and error code, never request bodies, credentials, or stack traces containing secrets.
- The deployed API uses HTTPS (Render) and connects to Neon over TLS (`DB_SSL`/`sslmode=require`). `CLIENT_ORIGIN` is set to the deployed client's exact origin. Never expose secrets in source, logs, screenshots, or URLs.
- JWT revocation beyond client-side token removal is not currently implemented.

## Current limitations

- No unpublish workflow or unpublish endpoint exists.
- Submitted answers cannot be revised after final submission.
- Once a result is published, there is no API endpoint to unpublish it or edit a published grade; corrections require reopening grading before publication only.
- JWT revocation beyond client-side token removal is not implemented; a token remains valid until it expires.
- The preserved `microservices/` homework demonstration remains separate from the primary runtime.

## Git workflow

Development follows a feature workflow:

```text
feature branch  ->  pull request  ->  dev  ->  release pull request  ->  main
```

Each milestone was developed on its own feature branch and merged into `dev` through a pull request: `feature/initialServer`, `feature/auth-foundation`, `feature/exam-authoring`, `feature/exam-delivery-submission`, `feature/grading-results`, `feature/docker-config`, and `feature/microservices` (preserved as a separate homework demonstration, not merged into the runtime). Final documentation and cleanup were completed on `feature/final-documentation` before release to `main`. See [`docs/milestones.md`](docs/milestones.md) for the full milestone-by-milestone history.
