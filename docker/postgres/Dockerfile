FROM postgres:16

COPY docker/postgres/init.sql /docker-entrypoint-initdb.d/000_initial.sql
COPY server/db/migrations/001_milestone_2_exam_authoring.sql /docker-entrypoint-initdb.d/001_milestone_2_exam_authoring.sql
COPY server/db/migrations/002_question_types.sql /docker-entrypoint-initdb.d/002_question_types.sql
