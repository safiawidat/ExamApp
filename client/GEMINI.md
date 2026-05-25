# GEMINI.md

## Project Overview
**E-Test System** is a React-based web application designed for managing and conducting online examinations. It provides a role-based interface for both students and teachers.

### Main Technologies
- **Framework:** [React 19](https://react.dev/)
- **Build Tool:** [Vite](https://vitejs.dev/)
- **Styling:** [Bootstrap 5](https://getbootstrap.com/)
- **Testing:** [Vitest](https://vitest.dev/) & [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- **Deployment:** [gh-pages](https://github.com/tschaub/gh-pages)

## Architecture
The project follows a modular architecture centered around React components and utility services:

- **`src/api/`**: Handles data operations. Includes `examService.js` for exam-related logic and `mockDb.js` for simulated data persistence.
- **`src/components/`**: Contains all UI components. Key components include:
    - `TeacherDashboard.jsx`: Management interface for instructors.
    - `StudentPortal.jsx`: Interface for students to take exams.
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
- **Mocking:** For development without a backend, use and extend `src/api/mockDb.js`.
