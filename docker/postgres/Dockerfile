FROM postgres:16

COPY docker/postgres/init.sql /docker-entrypoint-initdb.d/000_initial.sql
COPY server/db/migrations/ /docker-entrypoint-initdb.d/
