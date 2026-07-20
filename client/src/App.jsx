import { useEffect, useState } from 'react';
import Login from './components/Login';
import Register from './components/Register';
import NavigationMenu from './components/NavigationMenu';
import StudentPortal from './components/StudentPortal';
import TeacherDashboard from './components/TeacherDashboard';
import {
  getCurrentUser,
  getStoredToken,
  login,
  logout,
  registerStudent,
} from './api/authService';

const validUserRoles = new Set(['student', 'lecturer']);
const invalidSessionMessage = 'Your session is no longer valid. Please log in again.';
const hasValidUserRole = (user) => validUserRoles.has(user?.role);

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
        const restoredUser = await getCurrentUser();

        if (!hasValidUserRole(restoredUser)) {
          throw new Error('Invalid authenticated user.');
        }

        setCurrentUser(restoredUser);
      } catch {
        logout();
        setCurrentUser(null);
        setSessionMessage(invalidSessionMessage);
      } finally {
        setIsSessionLoading(false);
      }
    };

    restoreSession();
  }, []);

  const handleLogin = async (credentials) => {
    const user = await login(credentials);

    if (!hasValidUserRole(user)) {
      logout();
      setCurrentUser(null);
      setShowRegister(false);
      setSessionMessage(invalidSessionMessage);
      return;
    }

    setCurrentUser(user);
    setShowRegister(false);
    setSessionMessage('');
  };

  const handleRegister = async (credentials) => {
    const user = await registerStudent(credentials);

    if (!hasValidUserRole(user)) {
      logout();
      setCurrentUser(null);
      setShowRegister(false);
      setSessionMessage(invalidSessionMessage);
      return;
    }

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
            key={sessionMessage}
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
          <TeacherDashboard currentUser={currentUser} />
        )}

        {!isSessionLoading && currentUser?.role === 'student' && <StudentPortal />}
      </main>
    </div>
  );
}

export default App;
