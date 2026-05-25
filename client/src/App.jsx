import { useState } from 'react';
import Login from './components/Login';
import Register from './components/Register';
import NavigationMenu from './components/NavigationMenu';
import ScoresPage from './components/ScoresPage';
import StudentPortal from './components/StudentPortal';
import TeacherDashboard from './components/TeacherDashboard';
import './App.css';

function App() {
  const [role, setRole] = useState(null);
  const [showRegister, setShowRegister] = useState(false);

  const handleLogin = (userRole) => {
    setRole(userRole);
  };

  const handleLogout = () => {
    setRole(null);
    setShowRegister(false);
  };

  return (
    <div className="min-vh-100 bg-light">
      <NavigationMenu role={role} onLogout={handleLogout} />

      <main>
        {!role && !showRegister && (
          <Login
            onLogin={handleLogin}
            onShowRegister={() => setShowRegister(true)}
          />
        )}

        {!role && showRegister && (
          <Register onBackToLogin={() => setShowRegister(false)} />
        )}

        {role === 'teacher' && (
          <>
            <TeacherDashboard />
            <ScoresPage />
          </>
        )}

        {role === 'student' && <StudentPortal />}
      </main>
    </div>
  );
}

export default App;