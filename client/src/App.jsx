import { useEffect, useState } from 'react';
import Login from './components/Login';
import Register from './components/Register';
import NavigationMenu from './components/NavigationMenu';
import ScoresPage from './components/ScoresPage';
import StudentPortal from './components/StudentPortal';
import TeacherDashboard from './components/TeacherDashboard';
import {
  getCurrentUser,
  getStoredToken,
  login,
  logout,
  registerStudent,
} from './api/authService';
import './App.css';

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [showRegister, setShowRegister] = useState(false);
  const [sessionMessage, setSessionMessage] = useState('');

  useEffect(() => {
    const restoreSession = async () => {
      if (!getStoredToken()) {
        setIsSessionLoading(false);
        return;
      }

      try {
        setCurrentUser(await getCurrentUser());
      } catch {
        logout();
        setCurrentUser(null);
        setSessionMessage('Your session is no longer valid. Please log in again.');
      } finally {
        setIsSessionLoading(false);
      }
    };

    restoreSession();
  }, []);

  const handleLogin = async (credentials) => {
    const user = await login(credentials);
    setCurrentUser(user);
    setShowRegister(false);
    setSessionMessage('');
  };

  const handleRegister = async (credentials) => {
    const user = await registerStudent(credentials);
    setCurrentUser(user);
    setShowRegister(false);
    setSessionMessage('');
  };

  const handleLogout = () => {
    logout();
    setCurrentUser(null);
    setShowRegister(false);
    setSessionMessage('');
  };

  return (
    <div className="min-vh-100 bg-light">
      <NavigationMenu user={currentUser} onLogout={handleLogout} />

      <main>
        {isSessionLoading && (
          <div className="container py-5 text-center" aria-live="polite">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Restoring session...</span>
            </div>
          </div>
        )}

        {!isSessionLoading && !currentUser && !showRegister && (
          <Login
            onLogin={handleLogin}
            onShowRegister={() => setShowRegister(true)}
            initialError={sessionMessage}
          />
        )}

        {!isSessionLoading && !currentUser && showRegister && (
          <Register
            onRegister={handleRegister}
            onBackToLogin={() => setShowRegister(false)}
          />
        )}

        {!isSessionLoading && currentUser?.role === 'lecturer' && (
          <>
            <TeacherDashboard />
            <ScoresPage />
          </>
        )}

        {!isSessionLoading && currentUser?.role === 'student' && <StudentPortal />}
      </main>
    </div>
  );
}

export default App;
