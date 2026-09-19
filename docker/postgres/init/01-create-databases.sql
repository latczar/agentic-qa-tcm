-- Executed by the official Postgres image on first start only (empty data volume).
-- To re-run: docker compose down -v && docker compose up -d
-- The default database (POSTGRES_DB) is created by the image itself; these are the extra ones.
CREATE DATABASE tcm;
CREATE DATABASE pipeline;
-- Kept separate from `pipeline` so `npm run test:integration` never writes its scenario-matrix
-- runs into the same database the local dev orchestrator and review UI read from.
CREATE DATABASE pipeline_test;
