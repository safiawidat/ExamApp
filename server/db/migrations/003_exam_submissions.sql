DO $migration$
BEGIN
  IF TO_REGCLASS('public.users') IS NULL THEN
    RAISE EXCEPTION
      'Migration 003 requires the existing public.users table.';
  END IF;

  IF TO_REGCLASS('public.exams') IS NULL THEN
    RAISE EXCEPTION
      'Migration 003 requires the existing public.exams table.';
  END IF;

  IF TO_REGCLASS('public.questions') IS NULL THEN
    RAISE EXCEPTION
      'Migration 003 requires the existing public.questions table.';
  END IF;

  IF TO_REGCLASS('public.question_options') IS NULL THEN
    RAISE EXCEPTION
      'Migration 003 requires the existing public.question_options table.';
  END IF;

  IF TO_REGCLASS('public.schema_migrations') IS NULL THEN
    RAISE EXCEPTION
      'Migration 003 requires the existing public.schema_migrations table.';
  END IF;
END
$migration$;

ALTER TABLE questions
  ADD CONSTRAINT questions_id_exam_id_unique UNIQUE (id, exam_id);

ALTER TABLE question_options
  ADD CONSTRAINT question_options_id_question_id_unique
    UNIQUE (id, question_id);

CREATE TABLE exam_submissions (
  id SERIAL PRIMARY KEY,
  exam_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT exam_submissions_exam_id_fkey
    FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE RESTRICT,
  CONSTRAINT exam_submissions_student_id_fkey
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT exam_submissions_exam_student_unique
    UNIQUE (exam_id, student_id),
  CONSTRAINT exam_submissions_id_exam_id_unique
    UNIQUE (id, exam_id)
);

CREATE INDEX exam_submissions_student_submitted_at_idx
  ON exam_submissions (student_id, submitted_at DESC);

CREATE TABLE submission_answers (
  submission_id INTEGER NOT NULL,
  exam_id INTEGER NOT NULL,
  question_id INTEGER NOT NULL,
  selected_option_id INTEGER,
  boolean_answer BOOLEAN,
  text_answer TEXT,
  CONSTRAINT submission_answers_pkey
    PRIMARY KEY (submission_id, question_id),
  CONSTRAINT submission_answers_submission_exam_fkey
    FOREIGN KEY (submission_id, exam_id)
    REFERENCES exam_submissions(id, exam_id) ON DELETE CASCADE,
  CONSTRAINT submission_answers_question_exam_fkey
    FOREIGN KEY (question_id, exam_id)
    REFERENCES questions(id, exam_id) ON DELETE RESTRICT,
  CONSTRAINT submission_answers_option_question_fkey
    FOREIGN KEY (selected_option_id, question_id)
    REFERENCES question_options(id, question_id) ON DELETE RESTRICT,
  CONSTRAINT submission_answers_one_value_check CHECK (
    NUM_NONNULLS(selected_option_id, boolean_answer, text_answer) <= 1
  ),
  CONSTRAINT submission_answers_text_valid_check CHECK (
    text_answer IS NULL
    OR (
      BTRIM(text_answer) <> ''
      AND text_answer = BTRIM(text_answer)
    )
  )
);

CREATE INDEX submission_answers_question_id_idx
  ON submission_answers (question_id, submission_id);

CREATE OR REPLACE FUNCTION examapp_validate_submission_answer()
RETURNS TRIGGER AS $function$
DECLARE
  question_type VARCHAR(30);
BEGIN
  SELECT type
  INTO question_type
  FROM questions
  WHERE id = NEW.question_id
    AND exam_id = NEW.exam_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF question_type = 'multiple_choice' THEN
    IF NEW.boolean_answer IS NOT NULL OR NEW.text_answer IS NOT NULL THEN
      RAISE EXCEPTION
        USING
          ERRCODE = '23514',
          MESSAGE = 'A multiple_choice submission answer may only use selected_option_id.';
    END IF;
  ELSIF question_type = 'true_false' THEN
    IF NEW.selected_option_id IS NOT NULL OR NEW.text_answer IS NOT NULL THEN
      RAISE EXCEPTION
        USING
          ERRCODE = '23514',
          MESSAGE = 'A true_false submission answer may only use boolean_answer.';
    END IF;
  ELSIF question_type = 'short_answer' THEN
    IF NEW.selected_option_id IS NOT NULL OR NEW.boolean_answer IS NOT NULL THEN
      RAISE EXCEPTION
        USING
          ERRCODE = '23514',
          MESSAGE = 'A short_answer submission answer may only use text_answer.';
    END IF;
  ELSE
    RAISE EXCEPTION
      USING
        ERRCODE = '23514',
        MESSAGE = FORMAT(
          'Submission answers do not support question type %L.',
          question_type
        );
  END IF;

  RETURN NEW;
END
$function$ LANGUAGE plpgsql;

CREATE TRIGGER submission_answers_validate_answer
BEFORE INSERT OR UPDATE ON submission_answers
FOR EACH ROW EXECUTE FUNCTION examapp_validate_submission_answer();

INSERT INTO schema_migrations (version, name)
VALUES ('003', '003_exam_submissions.sql')
ON CONFLICT (version) DO NOTHING;
