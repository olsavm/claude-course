# Design Decisions — Database Schema

Analysis of the `tasks` table against the stated business requirements. Scope constraint applied throughout: schema is final, no future extensions, no user/auth linking.

---

## 1. ENUMs instead of VARCHAR + CHECK

**Current:** `VARCHAR(20) CHECK (status IN (...))`, `VARCHAR(10) CHECK (priority IN (...))`

**Decision: Change to ENUM types.**

```sql
CREATE TYPE task_status   AS ENUM ('todo', 'in_progress', 'done');
CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high');
```

**Why:**
- The values are permanently fixed — the one downside of ENUMs (ALTER TYPE is painful) does not apply here.
- PostgreSQL stores ENUMs as 4-byte integers internally; comparisons are integer comparisons, not string comparisons.
- `ORDER BY priority` with the ENUM defined as `('low', 'medium', 'high')` sorts in natural business order without a CASE expression. With VARCHAR, sorting priority meaningfully requires `CASE WHEN priority = 'low' THEN 1 ...`.
- Invalid values are rejected at the type level before hitting a CHECK constraint. The error surface is smaller.

**Trade-off considered:** ENUMs are less portable across databases. Not relevant here — the spec explicitly requires PostgreSQL.

---

## 2. `updated_at` trigger

**Current:** `DEFAULT NOW()` only — set at INSERT, never touched again.

**Decision: Add a BEFORE UPDATE trigger.**

```sql
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
```

**Why:** Without this, `updated_at` is silently wrong on every UPDATE unless every code path explicitly sets it. There will be at least five UPDATE paths in this codebase (title, description, priority, due_date, status transition) — any one of them can forget. The trigger makes correctness unconditional and removes the obligation from application code entirely.

---

## 3. Search index (pg_trgm)

**Current:** No index supports the search endpoint.

**Decision: Add `pg_trgm` GIN index over lowercased title + description.**

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_tasks_search ON tasks
  USING GIN ((lower(title) || ' ' || lower(coalesce(description, ''))) gin_trgm_ops);
```

**Why `pg_trgm` over full-text search (`tsvector`):**
The spec says "search by keyword" and "not case-sensitive". The natural implementation is `ILIKE '%keyword%'`. Full-text search (`tsvector`) is word-boundary based — it would not match "bug" inside "debugging", which is counterintuitive for a task search. `pg_trgm` supports `ILIKE` directly and matches substrings, which matches user expectations.

Without this index, every search is a sequential scan with `ILIKE`. For an internal tool this is acceptable at low row counts but degrades linearly. The index costs negligible storage and makes search O(log n).

**The concatenation approach** (`lower(title) || ' ' || lower(description)`) means one index covers both columns. The alternative — two separate trigram indexes — requires the query planner to combine them with a bitmap OR scan, which is less efficient.

---

## 4. Indexes: replace individual status/priority with composite + add overdue partial index

**Current:** `idx_tasks_status ON tasks (status)`, `idx_tasks_priority ON tasks (priority)`

**Decision: Replace with a composite index and add a partial index for overdue.**

```sql
-- Replace individual indexes:
CREATE INDEX idx_tasks_status_priority ON tasks (status, priority);

-- Add for the /stats overdue query:
CREATE INDEX idx_tasks_overdue ON tasks (due_date)
  WHERE status != 'done';
```

**Why the individual indexes are weak:** `status` has 3 distinct values and `priority` has 3. With ~33% selectivity per value, PostgreSQL's query planner will often ignore a B-tree index and choose a sequential scan — especially for common values like `status = 'todo'`. Individual indexes on low-cardinality columns have poor selectivity.

**Why composite is better:** `GET /tasks?status=todo&priority=high` is the expected combined filter. A composite index `(status, priority)` has 9 distinct combinations — much higher selectivity — and satisfies both single-column and combined filter queries (the leading column `status` alone is still usable).

**Why a partial index for overdue:** The `/stats` endpoint computes overdue tasks: `due_date < NOW() AND status != 'done'`. A partial index excluding `done` tasks keeps the index small (done tasks are permanently excluded) and makes the overdue count query efficient. As tasks accumulate in `done` status over time, the partial index stays lean while a full index would grow unboundedly.

---

## 5. `due_date > created_at` sanity check

**Current:** No DB-level constraint on `due_date`.

**Decision: Add `CHECK (due_date IS NULL OR due_date > created_at)`.**

**Why:** The spec requires due dates to be in the future *at creation time*. A `CHECK (due_date > NOW())` would enforce this at INSERT but break any UPDATE on a row whose due_date has since passed (PostgreSQL re-evaluates CHECK on every UPDATE, even when the checked column hasn't changed). That makes the constraint unusable.

`due_date > created_at` is a weaker but safe approximation: it can't guarantee the due date was in the future when the task was created (technically a task created at 11:59 PM with a due date of 11:59 PM + 1 second passes), but it catches obvious data errors (due date in the past relative to creation) and is stable — it won't suddenly start failing as time passes. The "must be in the future at creation" rule is enforced in application code; this constraint is a last-resort guard.

---

## 6. Migration tracking table

**Current:** `migrate.js` re-runs all `.sql` files on every invocation. It doesn't fail only because of `IF NOT EXISTS` guards.

**Decision: Add a `schema_migrations` table.**

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename   TEXT        PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

`migrate.js` should skip any file already recorded in this table and insert a row after each successful execution. This makes the migration runner idempotent by design rather than by accident, and provides an auditable record of when each migration was applied.

---

## Summary

| # | Change | Impact |
|---|--------|--------|
| 1 | ENUM for status and priority | Type safety, natural sort order |
| 2 | `updated_at` trigger | Correctness — field is currently broken on UPDATE |
| 3 | `pg_trgm` GIN index | Required for search endpoint performance |
| 4 | Composite `(status, priority)` + partial overdue index | Correct selectivity for filter and stats queries |
| 5 | `CHECK (due_date > created_at)` | Lightweight sanity guard at DB level |
| 6 | Migration tracking table | Idempotent migrations by design |
