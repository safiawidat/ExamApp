CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(80) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT users_role_check CHECK (role IN ('lecturer', 'student')),
  CONSTRAINT users_username_not_blank_check CHECK (BTRIM(username) <> ''),
  CONSTRAINT users_username_lowercase_check CHECK (username = LOWER(username))
);
