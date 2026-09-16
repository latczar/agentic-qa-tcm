-- Pipeline state. Applied on start with IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS generation_runs (
  id                 text PRIMARY KEY,
  test_case_id       text NOT NULL,
  test_case_version  integer NOT NULL,
  status             text NOT NULL,
  attempts           integer NOT NULL DEFAULT 0,
  max_attempts       integer NOT NULL,
  deferrals          integer NOT NULL DEFAULT 0,
  provider           text NOT NULL,
  model              text NOT NULL,
  candidate_path     text,
  best_attempt       integer,
  failure_class      text,
  summary            text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  -- One run per automation request. This is the idempotency guarantee.
  UNIQUE (test_case_id, test_case_version)
);

CREATE TABLE IF NOT EXISTS generation_attempts (
  id               bigserial PRIMARY KEY,
  run_id           text NOT NULL REFERENCES generation_runs (id) ON DELETE CASCADE,
  attempt_no       integer NOT NULL,
  kind             text NOT NULL,            -- generate | retry | repair
  prompt_version   text NOT NULL,
  context_receipt  jsonb NOT NULL,
  prompt           text NOT NULL,
  raw_response     text,
  parsed_ok        boolean NOT NULL DEFAULT false,
  gate_report      jsonb,
  failure_class    text,
  self_report      jsonb,                    -- claimed vs actual symbols
  duration_ms      integer NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, attempt_no)
);

-- Phase 6: agentic mode and token accounting.
ALTER TABLE generation_attempts ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'curated';
ALTER TABLE generation_attempts ADD COLUMN IF NOT EXISTS agent_log jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE generation_attempts ADD COLUMN IF NOT EXISTS prompt_tokens integer;
ALTER TABLE generation_attempts ADD COLUMN IF NOT EXISTS completion_tokens integer;
