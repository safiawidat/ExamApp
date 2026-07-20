import { useState } from 'react';

const Register = ({ onRegister, onBackToLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRegister = async (event) => {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);

    try {
      await onRegister({ username: username.trim(), password });
    } catch (requestError) {
      setError(requestError?.message || 'Unable to register. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mt-5">
      <div className="row justify-content-center">
        <div className="col-md-4">
          <div className="card shadow">
            <div className="card-header bg-success text-white">
              <h4 className="mb-0">Register Student</h4>
            </div>

            <form className="card-body" onSubmit={handleRegister}>
              <div className="mb-3">
                <label className="form-label" htmlFor="register-username">Username</label>
                <input
                  id="register-username"
                  type="text"
                  className="form-control"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>

              <div className="mb-3">
                <label className="form-label" htmlFor="register-password">Password</label>
                <input
                  id="register-password"
                  type="password"
                  className="form-control"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength="8"
                  required
                />
              </div>

              <div className="mb-3">
                <label className="form-label" htmlFor="register-confirm-password">
                  Confirm Password
                </label>
                <input
                  id="register-confirm-password"
                  type="password"
                  className="form-control"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength="8"
                  required
                />
              </div>

              {error && (
                <div className="alert alert-danger">
                  {error}
                </div>
              )}

              <button
                className="btn btn-success w-100 mb-2"
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Registering...' : 'Register'}
              </button>

              <button
                className="btn btn-outline-secondary w-100"
                type="button"
                onClick={onBackToLogin}
                disabled={isSubmitting}
              >
                Back to Login
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;
