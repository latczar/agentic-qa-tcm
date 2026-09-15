-- Applied on every start with IF NOT EXISTS, so starting the service is enough to set it up.

CREATE TABLE IF NOT EXISTS test_cases (
  id                 text PRIMARY KEY,
  title              text NOT NULL,
  feature            text NOT NULL,
  priority           text NOT NULL,
  preconditions      text NOT NULL DEFAULT '',
  steps              jsonb NOT NULL DEFAULT '[]'::jsonb,
  test_data          jsonb NOT NULL DEFAULT '{}'::jsonb,
  automation_status  text NOT NULL,
  automation_ref     text,
  automation_run_id  text,
  automation_note    text,
  -- Increments on content edits and whenever a human requests automation. The pipeline
  -- runs at most once per (id, version), so this is what makes duplicate polls harmless
  -- and deliberate retries possible.
  version            integer NOT NULL DEFAULT 1,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS test_cases_status_idx ON test_cases (automation_status);

CREATE TABLE IF NOT EXISTS case_history (
  id           bigserial PRIMARY KEY,
  case_id      text NOT NULL REFERENCES test_cases (id) ON DELETE CASCADE,
  at           timestamptz NOT NULL DEFAULT now(),
  actor        text NOT NULL,
  from_status  text,
  to_status    text NOT NULL,
  version      integer NOT NULL,
  note         text
);

CREATE INDEX IF NOT EXISTS case_history_case_idx ON case_history (case_id, at);
