CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(20) PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $migration$
DECLARE
  legacy_exam_count BIGINT;
  javascript_bootstrap_exam_count BIGINT;
  node_bootstrap_exam_count BIGINT;
BEGIN
  IF TO_REGCLASS('public.users') IS NULL THEN
    RAISE EXCEPTION
      'Milestone 2 migration requires the existing public.users table.';
  END IF;

  IF TO_REGCLASS('public.exams') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'exams'
        AND column_name IN ('lecturer_id', 'exam_type_id')
    ) THEN
      RAISE EXCEPTION
        'The exams table already appears migrated, but migration 001 is not recorded.';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'exams'
        AND column_name = 'title'
    ) OR NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'exams'
        AND column_name = 'description'
    ) OR NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'exams'
        AND column_name = 'status'
    ) THEN
      RAISE EXCEPTION
        'The legacy exams table does not match the expected Milestone 1 schema.';
    END IF;

    -- Replacement is intentionally limited to the complete bootstrap dataset.
    -- Empty, missing, duplicate, and otherwise unexpected datasets are preserved.
    SELECT
      COUNT(*),
      COUNT(*) FILTER (
        WHERE title IS NOT DISTINCT FROM 'JavaScript Fundamentals'
          AND description IS NOT DISTINCT FROM
            'A sample exam covering JavaScript basics.'
          AND status IS NOT DISTINCT FROM 'draft'
      ),
      COUNT(*) FILTER (
        WHERE title IS NOT DISTINCT FROM 'Node.js Fundamentals'
          AND description IS NOT DISTINCT FROM
            'A sample exam covering Node.js basics.'
          AND status IS NOT DISTINCT FROM 'draft'
      )
    INTO
      legacy_exam_count,
      javascript_bootstrap_exam_count,
      node_bootstrap_exam_count
    FROM exams;

    IF legacy_exam_count <> 2
      OR javascript_bootstrap_exam_count <> 1
      OR node_bootstrap_exam_count <> 1 THEN
      RAISE EXCEPTION
        'Cannot replace the legacy exams table because it does not contain exactly one copy of each expected bootstrap record (total: %, JavaScript: %, Node.js: %). Export or reconcile those records before retrying; users and the database volume can be preserved.',
        legacy_exam_count,
        javascript_bootstrap_exam_count,
        node_bootstrap_exam_count;
    END IF;

    DROP TABLE exams;
  END IF;
END
$migration$;

CREATE TABLE exam_types (
  id SERIAL PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  description TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT exam_types_name_not_blank_check CHECK (BTRIM(name) <> ''),
  CONSTRAINT exam_types_name_trimmed_check CHECK (name = BTRIM(name))
);

CREATE UNIQUE INDEX exam_types_name_case_insensitive_unique
  ON exam_types (LOWER(name));
CREATE INDEX exam_types_created_by_idx ON exam_types (created_by);

CREATE TABLE exams (
  id SERIAL PRIMARY KEY,
  lecturer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  exam_type_id INTEGER NOT NULL REFERENCES exam_types(id) ON DELETE RESTRICT,
  title VARCHAR(150) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TIMESTAMPTZ,
  CONSTRAINT exams_title_not_blank_check CHECK (BTRIM(title) <> ''),
  CONSTRAINT exams_title_trimmed_check CHECK (title = BTRIM(title)),
  CONSTRAINT exams_status_check CHECK (status IN ('draft', 'published')),
  CONSTRAINT exams_publication_state_check CHECK (
    (status = 'draft' AND published_at IS NULL)
    OR (status = 'published' AND published_at IS NOT NULL)
  )
);

CREATE INDEX exams_lecturer_id_idx ON exams (lecturer_id, id);
CREATE INDEX exams_exam_type_id_idx ON exams (exam_type_id);
CREATE INDEX exams_published_catalog_idx
  ON exams (published_at DESC, id DESC)
  WHERE status = 'published';

CREATE TABLE questions (
  id SERIAL PRIMARY KEY,
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL,
  text TEXT NOT NULL,
  points INTEGER NOT NULL,
  position INTEGER NOT NULL,
  correct_answer TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT questions_type_check CHECK (type IN ('multiple_choice', 'open_text')),
  CONSTRAINT questions_text_not_blank_check CHECK (BTRIM(text) <> ''),
  CONSTRAINT questions_text_trimmed_check CHECK (text = BTRIM(text)),
  CONSTRAINT questions_points_positive_check CHECK (points > 0),
  CONSTRAINT questions_position_positive_check CHECK (position > 0),
  CONSTRAINT questions_answer_type_check CHECK (
    type = 'open_text' OR correct_answer IS NULL
  ),
  CONSTRAINT questions_exam_position_unique
    UNIQUE (exam_id, position) DEFERRABLE INITIALLY IMMEDIATE
);

CREATE INDEX questions_exam_id_idx ON questions (exam_id, position);

CREATE TABLE question_options (
  id SERIAL PRIMARY KEY,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  position INTEGER NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT question_options_text_not_blank_check CHECK (BTRIM(text) <> ''),
  CONSTRAINT question_options_text_trimmed_check CHECK (text = BTRIM(text)),
  CONSTRAINT question_options_position_positive_check CHECK (position > 0),
  CONSTRAINT question_options_question_position_unique
    UNIQUE (question_id, position) DEFERRABLE INITIALLY IMMEDIATE
);

CREATE UNIQUE INDEX question_options_one_correct_idx
  ON question_options (question_id)
  WHERE is_correct;

CREATE OR REPLACE FUNCTION examapp_set_updated_at()
RETURNS TRIGGER AS $function$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END
$function$ LANGUAGE plpgsql;

CREATE TRIGGER exam_types_set_updated_at
BEFORE UPDATE ON exam_types
FOR EACH ROW EXECUTE FUNCTION examapp_set_updated_at();

CREATE TRIGGER exams_set_updated_at
BEFORE UPDATE ON exams
FOR EACH ROW EXECUTE FUNCTION examapp_set_updated_at();

CREATE TRIGGER questions_set_updated_at
BEFORE UPDATE ON questions
FOR EACH ROW EXECUTE FUNCTION examapp_set_updated_at();

INSERT INTO schema_migrations (version, name)
VALUES ('001', '001_milestone_2_exam_authoring.sql')
ON CONFLICT (version) DO NOTHING;
