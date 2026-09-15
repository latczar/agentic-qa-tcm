-- Executed by the official Postgres image on first start only (empty data volume).
-- To re-run: docker compose down -v && docker compose up -d
-- The default database (POSTGRES_DB) is created by the image itself; these are the extra ones.
CREATE DATABASE tcm;
CREATE DATABASE pipeline;
