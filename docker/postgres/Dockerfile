FROM postgres:16

COPY docker/postgres/init.sql /docker-entrypoint-initdb.d/000_initial.sql
COPY server/db/migrations/001_milestone_2_exam_authoring.sql /docker-entrypoint-initdb.d/001_milestone_2_exam_authoring.sql
