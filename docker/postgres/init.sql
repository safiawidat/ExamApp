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

CREATE TABLE IF NOT EXISTS exams (
  id SERIAL PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
);

INSERT INTO exams (title, description, status)
SELECT
  'JavaScript Fundamentals',
  'A sample exam covering JavaScript basics.',
  'draft'
WHERE NOT EXISTS (
  SELECT 1 FROM exams WHERE title = 'JavaScript Fundamentals'
);

INSERT INTO exams (title, description, status)
SELECT
  'Node.js Fundamentals',
  'A sample exam covering Node.js basics.',
  'draft'
WHERE NOT EXISTS (
  SELECT 1 FROM exams WHERE title = 'Node.js Fundamentals'
);
