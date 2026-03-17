CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Enum types
CREATE TYPE task_status   AS ENUM ('todo', 'in_progress', 'done');
CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high');

CREATE TABLE IF NOT EXISTS tasks (
  id          UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  title       VARCHAR(200)   NOT NULL,
  description TEXT,
  status      task_status    NOT NULL DEFAULT 'todo',
  priority    task_priority  NOT NULL DEFAULT 'medium',
  due_date    TIMESTAMPTZ,
  created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_due_date_after_created
    CHECK (due_date IS NULL OR due_date > created_at)
);

-- Keep updated_at current on every write
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tasks_set_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Composite index covers single-column (status) and combined (status + priority) filters
CREATE INDEX IF NOT EXISTS idx_tasks_status_priority
  ON tasks (status, priority);

-- Partial index for the overdue count in /stats — excludes done tasks, stays lean over time
CREATE INDEX IF NOT EXISTS idx_tasks_overdue
  ON tasks (due_date)
  WHERE status != 'done';

-- Trigram index for case-insensitive keyword search across title + description
CREATE INDEX IF NOT EXISTS idx_tasks_search
  ON tasks USING GIN (
    (lower(title) || ' ' || lower(coalesce(description, ''))) gin_trgm_ops
  );
