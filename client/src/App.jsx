import { useState } from 'react';
import Login from './components/Login';
import TeacherDashboard from './components/TeacherDashboard';
import StudentPortal from './components/StudentPortal';
import ScoresPage from './components/ScoresPage';
import './App.css';

function App() {
  const [role, setRole] = useState(null);

  const handleLogin = (userRole) => {
    setRole(userRole);
  };

  const handleLogout = () => {
    setRole(null);
  };

  return (
    <div className="min-vh-100 bg-light">
      <nav className="navbar navbar-dark bg-dark mb-4 shadow">
        <div className="container">
          <span className="navbar-brand mb-0 h1">E-Test System</span>
          {role && (
            <div className="d-flex align-items-center">
              <span className="text-white-50 me-3">
                Viewing as: <strong>{role.charAt(0).toUpperCase() + role.slice(1)}</strong>
              </span>
              <button className="btn btn-outline-light btn-sm" onClick={handleLogout}>
                Logout
              </button>
            </div>
          )}
        </div>
      </nav>
      <main>
        {!role && <Login onLogin={handleLogin} />}
        {role === 'teacher' && <TeacherDashboard />}
        {role === 'teacher' && <ScoresPage />}
        {role === 'student' && <StudentPortal />}
      </main>
    </div>
  );
}

export default App;