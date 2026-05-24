import { useState } from 'react';

const Register = ({ onBackToLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('student');
  const [success, setSuccess] = useState('');

  const handleRegister = () => {
    if (!username.trim() || !password.trim()) {
      return;
    }

    const users =
      JSON.parse(localStorage.getItem('users')) || [];

    users.push({
      username,
      password,
      role,
    });

    localStorage.setItem(
      'users',
      JSON.stringify(users)
    );

    setSuccess('User registered successfully');

    setUsername('');
    setPassword('');
    setRole('student');
  };

  return (
    <div className="container mt-5">
      <div className="row justify-content-center">
        <div className="col-md-4">
          <div className="card shadow">
            <div className="card-header bg-success text-white">
              <h4 className="mb-0">
                Register New User
              </h4>
            </div>

            <div className="card-body">
              <div className="mb-3">
                <label className="form-label">
                  Username
                </label>
                <input
                  type="text"
                  className="form-control"
                  value={username}
                  onChange={(e) =>
                    setUsername(e.target.value)
                  }
                />
              </div>

              <div className="mb-3">
                <label className="form-label">
                  Password
                </label>
                <input
                  type="password"
                  className="form-control"
                  value={password}
                  onChange={(e) =>
                    setPassword(e.target.value)
                  }
                />
              </div>

              <div className="mb-3">
                <label className="form-label">
                  Role
                </label>

                <select
                  className="form-select"
                  value={role}
                  onChange={(e) =>
                    setRole(e.target.value)
                  }
                >
                  <option value="student">
                    Student
                  </option>
                  <option value="teacher">
                    Teacher
                  </option>
                </select>
              </div>

              {success && (
                <div className="alert alert-success">
                  {success}
                </div>
              )}

              <button
                className="btn btn-success w-100 mb-2"
                onClick={handleRegister}
              >
                Register
              </button>

              <button
                className="btn btn-outline-secondary w-100"
                onClick={onBackToLogin}
              >
                Back to Login
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;