DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM questions
    WHERE type = 'open_text'
  ) THEN
    RAISE EXCEPTION
      'Migration 002 cannot classify existing open_text questions as true_false or short_answer. Resolve those rows explicitly before retrying.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM questions
    WHERE type = 'multiple_choice'
      AND correct_answer IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'Migration 002 requires existing multiple_choice questions to have a NULL correct_answer.';
  END IF;
END
$migration$;

ALTER TABLE questions
  DROP CONSTRAINT questions_type_check,
  DROP CONSTRAINT questions_answer_type_check;

ALTER TABLE questions
  ADD CONSTRAINT questions_type_check CHECK (
    type IN ('multiple_choice', 'true_false', 'short_answer')
  ),
  ADD CONSTRAINT questions_answer_type_check CHECK (
    (type = 'multiple_choice' AND correct_answer IS NULL)
    OR (
      type = 'true_false'
      AND correct_answer IS NOT NULL
      AND correct_answer IN ('true', 'false')
    )
    OR (
      type = 'short_answer'
      AND correct_answer IS NOT NULL
      AND BTRIM(correct_answer) <> ''
      AND correct_answer = BTRIM(correct_answer)
    )
  );

INSERT INTO schema_migrations (version, name)
VALUES ('002', '002_question_types.sql')
ON CONFLICT (version) DO NOTHING;
