# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
npm install

# Run database migrations
npm run migrate

# Start dev server (auto-restart on changes)
npm run dev

# Start production server
npm start
```

No test runner or linter is configured yet.

## Environment

Copy `.env.example` to `.env` before running anything. The only required variable is `DATABASE_URL` (PostgreSQL connection string). `PORT` defaults to 3000.

## Architecture

The app follows a thin layered structure:

- **`src/index.js`** — bootstraps the process: loads `.env`, verifies DB connectivity, then starts the HTTP server.
- **`src/app.js`** — pure Express setup (no I/O). Mounts middleware and will mount route files. New route files go here.
- **`src/db/index.js`** — exports a single shared `pg.Pool`. Import this everywhere DB access is needed; never create a second pool.
- **`src/db/migrations/`** — plain `.sql` files run in filename order by `src/db/migrate.js`. Add new migrations as `00N_description.sql`.

Planned additions (see `CLAUDE.local.md` for full spec):
- `src/routes/tasks.js` — Express router for all `/tasks` endpoints
- `src/controllers/` — handler functions called by routes
- `src/middleware/` — input validation and shared error helpers
- `openapi.yaml` — required OpenAPI 3.x specification at the project root

## Database

Single table: `tasks`. Key constraints enforced at the DB level:
- `status` check: `todo | in_progress | done`
- `priority` check: `low | medium | high`
- UUIDs via `gen_random_uuid()` (requires `pgcrypto` extension, already in migration)

`updated_at` is **not** auto-maintained by a trigger — application code must set it on every `UPDATE`.
