DO $migration$
BEGIN
  IF TO_REGCLASS('public.schema_migrations') IS NULL THEN
    RAISE EXCEPTION
      'Migration 004 requires the existing public.schema_migrations table.';
  END IF;

  IF TO_REGCLASS('public.questions') IS NULL THEN
    RAISE EXCEPTION
      'Migration 004 requires the existing public.questions table.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'questions_id_exam_id_unique'
      AND conrelid = 'public.questions'::REGCLASS
      AND contype = 'u'
      AND PG_GET_CONSTRAINTDEF(oid) = 'UNIQUE (id, exam_id)'
  ) THEN
    RAISE EXCEPTION
      'Migration 004 requires the existing questions_id_exam_id_unique constraint.';
  END IF;

  IF TO_REGPROCEDURE('public.examapp_set_updated_at()') IS NULL THEN
    RAISE EXCEPTION
      'Migration 004 requires the existing public.examapp_set_updated_at() function.';
  END IF;
END
$migration$;

CREATE TABLE question_notices (
  question_id INTEGER PRIMARY KEY,
  exam_id INTEGER NOT NULL,
  message TEXT NOT NULL,
  placement VARCHAR(10) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT question_notices_question_exam_fkey
    FOREIGN KEY (question_id, exam_id)
    REFERENCES questions(id, exam_id) ON DELETE CASCADE,
  CONSTRAINT question_notices_message_not_blank_check CHECK (
    BTRIM(message) <> ''
  ),
  CONSTRAINT question_notices_message_trimmed_check CHECK (
    message = BTRIM(message)
  ),
  CONSTRAINT question_notices_message_length_check CHECK (
    CHAR_LENGTH(message) <= 1000
  ),
  CONSTRAINT question_notices_placement_check CHECK (
    placement IN ('above', 'below')
  )
);

CREATE INDEX question_notices_exam_question_idx
  ON question_notices (exam_id, question_id);

CREATE TRIGGER question_notices_set_updated_at
BEFORE UPDATE ON question_notices
FOR EACH ROW EXECUTE FUNCTION examapp_set_updated_at();

INSERT INTO schema_migrations (version, name)
VALUES ('004', '004_question_notices.sql')
ON CONFLICT (version) DO NOTHING;
