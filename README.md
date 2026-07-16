# ExamApp

## Project overview

ExamApp is a full-stack examination application built with a React client, an Express API, and PostgreSQL. The current implementation includes Milestones 1–3: public student registration, controlled lecturer creation, JWT authentication, lecturer-owned exam authoring, publication, separate question notices, student-safe exam delivery, and one final submission per student per exam.

Submitted answers are stored but are not graded. Scores, feedback, grading workflows, and results views are not implemented.

## Implemented functionality

- Students can register, log in, restore a browser session, log out, browse published exams, open a student-safe exam, and submit one final answer set.
- Lecturers use controlled seeded accounts and can manage their own exam types, use shared exam types, create owned draft exams, and author multiple-choice, true/false, and short-answer questions.
- Draft questions can be updated, deleted with position compaction, and reordered.
- A non-empty draft exam can be published once. Published exam content is immutable, and no unpublish workflow exists.
- From an owned published exam, a lecturer can open the notice workspace, review questions in stored order, see each existing notice or a `No notice` state, and add, edit, or delete a notice with `above` or `below` placement.
- Notices are separate records delivered to students independently of immutable question content. Managing a notice never edits the published exam or question.
- Student responses never contain correctness flags, correct answers, or reference answers.

## Architecture

```text
React client  ->  Express API  ->  PostgreSQL
```

The React client sends JSON requests to the Express API. Express validates payloads, authenticates bearer tokens, enforces roles and ownership, and delegates persistence to PostgreSQL repositories. PostgreSQL is the source of truth for users, roles, exam types, exams, questions, multiple-choice options, question notices, exam submissions, and submission answers.

The preserved `microservices/` homework demonstration is separate from the primary ExamApp runtime.

## Repository structure

- `client/` — React and Vite client, API adapters, validation, components, and client tests
- `server/` — Express routes, controllers, services, repositories, migrations, scripts, and integration tests
- `docker/` — local PostgreSQL image, base schema, and development Compose configuration
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

Owner-scoped reads and mutations hide another lecturer's resources with `404` where applicable.

### Student

- Registers publicly; registration always assigns the `student` role.
- Views only published exams.
- Opens student-safe exam details and submits one final answer set.
- Sees whether the authenticated student has already submitted each exam.
- Cannot access lecturer endpoints.
- Never receives correct answers, reference answers, option correctness, scores, feedback, or results.

## Prerequisites

- Node.js and npm
- Docker Desktop with Docker Compose
- PowerShell for the example commands below, or equivalent commands in another shell

## Environment setup

Copy `server/.env.example` to `server/.env` and `client/.env.example` to `client/.env`. Configure local values without committing either file.

For the server, configure:

- `PORT`
- `DATA_SOURCE=postgres`
- `DATABASE_URL`
- `DB_SSL`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `CLIENT_ORIGIN`
- `SEED_LECTURER_USERNAME` and `SEED_LECTURER_PASSWORD` when running the seed command

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

## Migrations 001–004

From `server/`:

```powershell
npm.cmd run db:migrate
```

The migration runner loads numbered SQL files in order, uses a transaction and advisory lock, records applied versions in `schema_migrations`, and skips successful versions on later runs. A successful rerun reports that the database schema is already up to date.

- **001 — lecturer exam authoring:** preserves the existing `users` table; replaces only the exact known legacy bootstrap exam dataset; creates `exam_types`, lecturer-owned `exams`, `questions`, `question_options`, indexes, constraints, and timestamp triggers. Unexpected legacy data stops the transactional migration instead of being discarded.
- **002 — question types:** replaces the original question-type constraints with `multiple_choice`, `true_false`, and `short_answer`. Multiple-choice correctness stays on options, true/false stores an exact Boolean representation, and short answer stores trimmed non-empty reference text. Ambiguous legacy `open_text` rows stop migration.
- **003 — final submissions:** creates `exam_submissions` and `submission_answers`. `(exam_id, student_id)` is unique. The submission service writes exactly one answer row for every exam question, while the answer primary key prevents more than one row for the same submission/question pair. Selected-option, Boolean, and text answers are stored in separate nullable columns; a row with all three values null represents an unanswered question. Composite foreign keys keep submissions, exams, questions, and options aligned. Checks plus `examapp_validate_submission_answer()` enforce answer shape, and the API writes the submission transactionally.
- **004 — question notices:** creates separate `question_notices` storage with one notice per question and a composite exam/question relationship. Messages must be trimmed, non-empty, and at most 1000 characters. Placement is `above` or `below`. An update trigger maintains `updated_at`. Notices remain independent of immutable published question content.

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

Notice writes accept only `message` and `placement`; placement must be `above` or `below`. Notice access is available only for owned published exams.

### Student delivery and submission

Every endpoint below requires a student bearer token.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/student/exams` | List published exams and the authenticated student's submitted state |
| `GET` | `/api/student/exams/:id` | Load a published exam with ordered student-safe questions |
| `POST` | `/api/student/exams/:id/submissions` | Store the authenticated student's one final submission |

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

The student portal uses `studentExamService.js`, not local exam data. It loads the catalog first, then full exam detail on demand. `StudentForm` renders notices above or below their question, preserves Boolean `false`, represents every question in the final payload, and handles confirmation, pending, error, success, and catalog-refresh states. Submitted exams are disabled. No score or results screen exists.

## Testing and validation

Approved validation totals for the current implementation:

- Client: **19 test files, 289/289 tests passed** across repeated ordinary `npm.cmd run test:run` runs and an explicit `--maxWorkers=1` serial run
- Client Vitest configuration: `maxWorkers: 2` provides a deterministic worker cap for the ordinary test command
- Client lint: passed with zero warnings/errors
- Client production build: passed with 38 modules transformed
- Server: **8 test files, 166/166 tests passed** against isolated PostgreSQL
- HTTP smoke: **99/99 checks passed**
- Database: migrations 001–004 passed on a fresh disposable PostgreSQL database; rerunning reported the schema was already up to date

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

- [ ] Register a student and confirm automatic student sign-in.
- [ ] Log in as a student and as a seeded lecturer with the appropriate accounts.
- [ ] Refresh after login and confirm session restoration through `/api/auth/me`.
- [ ] Log out and confirm the JWT is removed from the browser session.
- [ ] Create, update, and delete an unused owned exam type.
- [ ] Confirm another lecturer's exam type is usable but not editable or deletable.
- [ ] Create and edit an owned draft exam using an owned or shared exam type.
- [ ] Create and edit multiple-choice, true/false, and short-answer questions.
- [ ] Verify Boolean `false` is preserved while authoring and answering.
- [ ] Reorder questions, delete a middle question, and confirm positions compact correctly.
- [ ] Confirm publishing a zero-question exam is rejected.
- [ ] Publish a non-empty draft and confirm it becomes available to students.
- [ ] Confirm published metadata, questions, options, answers, order, and deletion are read-only.
- [ ] Open `Manage notices` for an owned published exam.
- [ ] Confirm questions appear in their stored order and missing notices display `No notice`.
- [ ] Add a notice with `above` placement and verify it appears above the question in the student view.
- [ ] Change the notice placement to `below` and verify the student view updates appropriately.
- [ ] Edit the notice message and verify the updated message reaches the student view.
- [ ] Delete the notice and verify it is removed from the student view.
- [ ] Confirm no question-content editing controls appear in the notice workspace.
- [ ] Confirm notice controls and back navigation lock while a save or delete is pending.
- [ ] Confirm `Back to exams` returns to the exam list.
- [ ] Confirm the student catalog contains only published exams in server order.
- [ ] Open exam detail and confirm no correctness or reference-answer fields are exposed.
- [ ] Answer all three types, including Boolean `false`, and verify the confirmation summary.
- [ ] Leave at least one question unanswered and confirm it is included explicitly in the final request.
- [ ] Complete a final submission and confirm the exam becomes disabled as submitted.
- [ ] Confirm another submission by the same student is prevented.
- [ ] Confirm a second student has independent catalog and submitted state.
- [ ] Confirm students cannot access lecturer endpoints and lecturers cannot access student endpoints.
- [ ] Confirm no grade, score, feedback, result, correctness data, token, password, or secret is displayed.
- [ ] Confirm the browser console has no unexpected errors or secret exposure.

## Security notes

- Passwords are hashed with bcrypt and are never returned.
- Public registration rejects any client-supplied role; lecturer creation is controlled by the seed path.
- JWTs are signed with an environment secret and sent as bearer tokens. The client stores only the JWT in `sessionStorage`.
- Protected requests reload the current user from PostgreSQL before role checks.
- Lecturer exam access is owner-scoped, while exam-type mutations are creator-scoped.
- SQL uses parameterized queries. Publishing, question mutations, migrations, and submissions use transactional safeguards where consistency spans multiple records.
- Student projections and client response validation reject private correctness, reference-answer, score, feedback, and identity fields.
- Use HTTPS and an exact allowed client origin in deployed environments. Never expose secrets in source, logs, screenshots, or URLs.
- JWT revocation beyond client-side token removal is not currently implemented.

## Current limitations

- No unpublish workflow or unpublish endpoint exists.
- No automated or manual grading is implemented.
- There are no scores, feedback, or results views.
- Submitted answers cannot be revised after final submission.
- Final deployment is not yet documented or complete; no deployment URL is approved.
- The preserved `microservices/` homework demonstration remains separate from the primary runtime.

## Git workflow

Development follows a feature workflow:

```text
feature branch  ->  review / pull request  ->  dev  ->  later release to main
```

The current implementation includes Milestones 1–3. Documentation does not assume that a particular feature branch has already been merged into `dev` or `main`.
