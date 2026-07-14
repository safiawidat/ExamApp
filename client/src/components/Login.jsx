import { useState } from 'react';

const Login = ({ onLogin, onShowRegister, initialError = '' }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(initialError);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async (event) => {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      await onLogin({ username: username.trim(), password });
    } catch (requestError) {
      setError(requestError?.message || 'Unable to log in. Please try again.');
    } finally {
      setIsSubmitting(false);
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

            <form className="card-body" onSubmit={handleLogin}>
              <div className="mb-3">
                <label className="form-label" htmlFor="login-username">Username</label>
                <input
                  id="login-username"
                  type="text"
                  className="form-control"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>

              <div className="mb-3">
                <label className="form-label" htmlFor="login-password">Password</label>
                <input
                  id="login-password"
                  type="password"
                  className="form-control"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>

              {error && <div className="alert alert-danger">{error}</div>}

              <button className="btn btn-primary w-100" type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Logging in...' : 'Login'}
              </button>

              <button
                className="btn btn-outline-secondary w-100 mt-2"
                type="button"
                onClick={onShowRegister}
                disabled={isSubmitting}
              >
                Register
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
