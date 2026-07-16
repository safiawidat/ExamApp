# ExamApp React client

## Purpose

The `client/` application is the React and Vite front end for ExamApp. It authenticates against the Express API, renders role-specific lecturer and student workflows, validates API responses, and sends authoring and final-submission requests to the PostgreSQL-backed server.

The client does not calculate grades. Scores, feedback, grading, and results views are not implemented.

## Role-based flows

### Lecturer

- Sign in with a controlled seeded lecturer account.
- Load the shared exam-type catalog and owned exams.
- Manage owned exam types and use shared types for new exams.
- Create and edit owned draft exams.
- Author multiple-choice, true/false, and short-answer questions.
- Reorder and delete draft questions.
- Publish a non-empty draft after confirmation.
- See published exams as read-only, with no edit, delete, reorder, or unpublish operation.
- Open `Manage notices` only for an owned published exam and return to the exam dashboard afterward.
- View published questions in stored order, see an existing notice or `No notice`, and add, edit, or delete a separate notice with `above` or `below` placement.

Draft exams expose question authoring, and only non-empty drafts can be published. Question notices are separate records from published question content: managing a notice does not edit the question, and the notice workspace contains no question-content editing controls. Notice controls and back navigation lock while a save or delete is pending.

### Student

- Register publicly or log in with an existing student account.
- Load the published exam catalog from the server.
- Open full student-safe exam detail on demand.
- See notices above or below their associated question.
- Answer all three question types, including Boolean `false`.
- Confirm and submit one final answer set.
- See submitted exams disabled in the catalog.

Students never receive option correctness, correct answers, reference answers, scores, feedback, or results.

## Important components

- `src/App.jsx` — session restoration and role-based application entry point
- `src/components/NavigationMenu.jsx` — signed-in identity and logout
- `src/components/Login.jsx` and `Register.jsx` — authentication forms
- `src/components/TeacherDashboard.jsx` — lecturer workspace orchestration
- `src/components/ExamTypeManager.jsx` — owned/shared exam-type behavior
- `src/components/ExamManager.jsx` — draft exam CRUD and publication
- `src/components/QuestionEditor.jsx` and `QuestionForm.jsx` — question CRUD, type changes, deletion, and ordering
- `src/components/QuestionNoticeEditor.jsx` — ordered published-question notice workspace, `No notice` states, above/below placement, and add/edit/delete flows
- `src/components/StudentPortal.jsx` — published catalog, detail loading, submitted state, and submission lifecycle
- `src/components/StudentForm.jsx` — safe question rendering, notices, answer collection, and final confirmation

## API and validation modules

- `src/api/apiClient.js` — API base URL, JSON requests, bearer token attachment, and safe API errors
- `src/api/authService.js` — login, registration, session restoration, token storage, and logout
- `src/api/examTypeService.js` — lecturer exam-type API
- `src/api/lecturerExamService.js` — lecturer exam CRUD and publication
- `src/api/questionService.js` — question CRUD and ordering
- `src/api/questionNoticeService.js` — authenticated notice reads, saves, and deletions plus response validation
- `src/api/authoringValidation.js` — lecturer response and identifier validation
- `src/api/studentExamService.js` — student catalog, safe detail, and final submission API
- `src/api/studentExamValidation.js` — strict student response and answer validation

Only the JWT is stored in `sessionStorage`. Exam data, users, roles, and submissions remain server-backed.

## Environment

Copy `.env.example` to `.env` and configure:

```text
VITE_API_BASE_URL=http://localhost:3001/api
```

Use the API base for the environment you are running. Do not commit populated environment files, credentials, or tokens.

## Install and start

From `client/`:

```powershell
npm.cmd install
npm.cmd run dev
```

Open the local address printed by Vite.

## Test, lint, and build

```powershell
npm.cmd run test:run
npm.cmd run test:run -- --maxWorkers=1
npm.cmd run lint
npm.cmd run build
```

Approved client validation for the current implementation:

- 19 test files
- 289/289 tests passed across repeated ordinary `npm.cmd run test:run` runs
- Vitest uses `maxWorkers: 2` as a deterministic test-runner worker cap
- Explicit serial validation with `npm.cmd run test:run -- --maxWorkers=1` also passed
- ESLint passed with zero warnings/errors
- Production build passed with 38 modules transformed

The worker cap applies only to Vitest. The application is not limited to two workers, production does not use Vitest, and the ordinary test command remains `npm.cmd run test:run`.

## Important client behavior

- `App` restores a stored session through `/api/auth/me`; an invalid session clears the token and returns to login.
- Authoring mutations rely on server-side role and ownership enforcement even when controls are hidden or disabled in the UI.
- Publishing requires confirmation, is disabled for empty exams, and cannot be undone in the current implementation.
- Published exams expose notice management while their exam and question content remains immutable.
- `QuestionNoticeEditor` preserves stored question order, shows existing or `No notice` states, and locks controls and back navigation during notice mutations.
- Student detail validation rejects private fields such as `correct_answer`, `reference_answer`, `is_correct`, `score`, and `feedback`.
- `StudentForm` produces exactly one answer object per question. An object containing only `question_id` represents an unanswered question.
- Submission pending, error, success, refresh-warning, and duplicate-request states are handled explicitly.

## Current client limitations

- No unpublish control exists.
- No automated or manual grading is implemented.
- No scores, feedback, or results view exists.
- A final submission cannot be edited or resubmitted.
- Final deployment is not yet documented or complete.
- The preserved `microservices/` homework remains separate from the primary ExamApp runtime.
