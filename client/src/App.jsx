import { useState } from 'react';
import TeacherDashboard from './components/TeacherDashboard';
import StudentPortal from './components/StudentPortal';
import './App.css';

function App() {
  const [role, setRole] = useState('teacher'); // 'teacher' or 'student'

  const toggleRole = () => {
    setRole(role === 'teacher' ? 'student' : 'teacher');
  };

  return (
    <div className="min-vh-100 bg-light">
      <nav className="navbar navbar-dark bg-dark mb-4 shadow">
        <div className="container">
          <span className="navbar-brand mb-0 h1">E-Test System</span>
          <div className="d-flex align-items-center">
            <span className="text-white-50 me-3">Viewing as: <strong>{role.charAt(0).toUpperCase() + role.slice(1)}</strong></span>
            <button className="btn btn-outline-light btn-sm" onClick={toggleRole}>
              Switch to {role === 'teacher' ? 'Student' : 'Teacher'} View
            </button>
          </div>
        </div>
      </nav>

      <main>
        {role === 'teacher' ? (
          <TeacherDashboard />
        ) : (
          <StudentPortal />
        )}
      </main>

      <footer className="container text-center mt-5 py-4 border-top text-muted">
        <p>&copy; 2026 E-Test System Mock Environment</p>
      </footer>
    </div>
  );
}

export default App;
