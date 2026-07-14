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
