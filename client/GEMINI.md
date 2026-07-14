# GEMINI.md

## Project Overview
**E-Test System** is a React-based web application for role-based examination workflows. The backend role is named `lecturer`; the lecturer entry component retains the historical `TeacherDashboard` name.

### Main Technologies
- **Framework:** [React 19](https://react.dev/)
- **Build Tool:** [Vite](https://vitejs.dev/)
- **Styling:** [Bootstrap 5](https://getbootstrap.com/)
- **Testing:** [Vitest](https://vitest.dev/) & [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- **Deployment:** [gh-pages](https://github.com/tschaub/gh-pages)

## Architecture
The project follows a modular architecture centered around React components and utility services:

- **`src/api/`**: `apiClient.js` handles authenticated HTTP requests and the session token. `examTypeService.js`, `lecturerExamService.js`, and `questionService.js` provide server-backed lecturer authoring. `examService.js` and `mockDb.js` remain only for the legacy student prototype.
- **`src/components/`**: Contains all UI components. Key components include:
    - `TeacherDashboard.jsx`: Lecturer authoring entry point.
    - `ExamTypeManager.jsx` / `ExamManager.jsx`: Shared-type and owned-draft management.
    - `QuestionEditor.jsx` / `QuestionForm.jsx`: Question CRUD, transitions, and reorder for all supported types.
    - `StudentPortal.jsx`: Legacy mock interface for students to take exams.
    - `Login.jsx` / `Register.jsx`: Authentication flow.
- **`src/services/`**: Provides cross-cutting concerns:
    - `configService.js`: Global application configuration.
    - `loggerService.js`: Unified logging interface.
    - `notifyService.js`: User notifications.
    - `storageService.js`: Local storage management.

## Building and Running

### Development
```bash
npm run dev
```

### Production Build
```bash
npm run build
```

### Testing
```bash
npm run test      # Watch mode
npm run test:run  # Single run
```

### Linting
```bash
npm run lint
```

### Deployment
```bash
npm run deploy
```

## Development Conventions

- **Component Pattern:** Prefer functional components with React Hooks.
- **Service Encapsulation:** Business logic, API calls, and utility functions should reside in the `services/` or `api/` directories rather than inside components.
- **Testing Practice:** Each new feature or service should include corresponding tests (e.g., `*.test.js` or `*.test.jsx`).
- **Styling:** Uses Bootstrap classes for layout and basic styling, supplemented by `App.css` and `index.css`.
- **Lecturer source of truth:** Do not use or extend mock storage for lecturer authoring. PostgreSQL through the authenticated API is authoritative.
- **API boundary:** Components must not call `fetch` directly; use the API service modules. Client storage and user-supplied role values are never authorization authority.
- **Question contract:** Use `question_type`, `prompt`, boolean `correct_answer` for true/false, `reference_answer` for short answer, and `options` for multiple choice. Do not send stale fields during a type transition.
- **Safe interaction:** Preserve pending-state lockout, safe public errors, and confirmations for destructive changes or populated type transitions.
- **Milestone boundary:** Do not add publishing, student delivery or submissions, grading, or results as part of lecturer authoring work.
