import { useState } from 'react';

const USERS = [
  { username: 'teacher', password: '1234', role: 'teacher' },
  { username: 'student', password: '1234', role: 'student' },
];

const Login = ({ onLogin, onShowRegister }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = () => {
    const user = USERS.find(
      (u) => u.username === username && u.password === password
    );
    if (user) {
      onLogin(user.role);
    } else {
      setError('Invalid username or password');
    }
  };

  return (
    <div className="container mt-5">
      <div className="row justify-content-center">
        <div className="col-md-4">
          <div className="card shadow">
            <div className="card-header bg-dark text-white">
              <h4 className="mb-0">E-Test System Login</h4>
            </div>
            <div className="card-body">
              <div className="mb-3">
                <label className="form-label">Username</label>
                <input
                  type="text"
                  className="form-control"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              <div className="mb-3">
                <label className="form-label">Password</label>
                <input
                  type="password"
                  className="form-control"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {error && <div className="alert alert-danger">{error}</div>}
              <button className="btn btn-primary w-100" onClick={handleLogin}>
                Login
              </button>
              <button className="btn btn-outline-secondary w-100 mt-2" onClick={onShowRegister}>
                Register
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;