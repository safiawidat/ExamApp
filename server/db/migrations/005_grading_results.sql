DO $migration$
BEGIN
  IF TO_REGCLASS('public.schema_migrations') IS NULL THEN
    RAISE EXCEPTION
      'Migration 005 requires the existing public.schema_migrations table.';
  END IF;

  IF TO_REGCLASS('public.users') IS NULL THEN
    RAISE EXCEPTION
      'Migration 005 requires the existing public.users table.';
  END IF;

  IF TO_REGCLASS('public.exam_submissions') IS NULL THEN
    RAISE EXCEPTION
      'Migration 005 requires the existing public.exam_submissions table.';
  END IF;

  IF TO_REGCLASS('public.submission_answers') IS NULL THEN
    RAISE EXCEPTION
      'Migration 005 requires the existing public.submission_answers table.';
  END IF;
END
$migration$;

ALTER TABLE submission_answers
  ADD COLUMN awarded_points NUMERIC,
  ADD COLUMN lecturer_feedback TEXT,
  ADD CONSTRAINT submission_answers_awarded_points_check CHECK (
    awarded_points IS NULL
    OR (awarded_points >= 0 AND awarded_points <= 1)
  );

ALTER TABLE exam_submissions
  ADD COLUMN grading_state VARCHAR(20) NOT NULL DEFAULT 'ungraded',
  ADD COLUMN total_score NUMERIC,
  ADD COLUMN graded_by INTEGER,
  ADD COLUMN grading_completed_at TIMESTAMPTZ,
  ADD COLUMN result_published_at TIMESTAMPTZ,
  ADD CONSTRAINT exam_submissions_grading_state_check CHECK (
    grading_state IN ('ungraded', 'in_progress', 'completed')
  ),
  ADD CONSTRAINT exam_submissions_total_score_check CHECK (
    total_score IS NULL OR total_score >= 0
  ),
  ADD CONSTRAINT exam_submissions_graded_by_fkey
    FOREIGN KEY (graded_by) REFERENCES users(id) ON DELETE RESTRICT,
  ADD CONSTRAINT exam_submissions_grading_completion_check CHECK (
    (
      grading_state IN ('ungraded', 'in_progress')
      AND total_score IS NULL
      AND graded_by IS NULL
      AND grading_completed_at IS NULL
    )
    OR (
      grading_state = 'completed'
      AND total_score IS NOT NULL
      AND graded_by IS NOT NULL
      AND grading_completed_at IS NOT NULL
    )
  ),
  ADD CONSTRAINT exam_submissions_grading_timestamp_check CHECK (
    grading_completed_at IS NULL OR grading_completed_at >= submitted_at
  ),
  ADD CONSTRAINT exam_submissions_result_publication_check CHECK (
    result_published_at IS NULL
    OR (
      grading_state = 'completed'
      AND total_score IS NOT NULL
      AND result_published_at >= grading_completed_at
    )
  );

CREATE INDEX exam_submissions_graded_by_idx
  ON exam_submissions (graded_by)
  WHERE graded_by IS NOT NULL;

INSERT INTO schema_migrations (version, name)
VALUES ('005', '005_grading_results.sql')
ON CONFLICT (version) DO NOTHING;
