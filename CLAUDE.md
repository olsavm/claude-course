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

No test runner or linter is configured yet. Swagger UI is available at `http://localhost:3000/docs` when the server is running.

## Environment

Copy `.env.example` to `.env` before running anything. The only required variable is `DATABASE_URL` (PostgreSQL connection string). `PORT` defaults to 3000.

## Architecture

The app follows a thin layered structure:

- **`src/index.js`** — bootstraps the process: loads `.env`, verifies DB connectivity, then starts the HTTP server.
- **`src/app.js`** — pure Express setup (no I/O). Mounts middleware and will mount route files. New route files go here.
- **`src/db/index.js`** — exports a single shared `pg.Pool`. Import this everywhere DB access is needed; never create a second pool.
- **`src/db/migrations/`** — plain `.sql` files run in filename order by `src/db/migrate.js`. Add new migrations as `00N_description.sql`.

- **`src/routes/tasks.js`** — Express router for `/tasks/*`. Note: `/search` is registered before `/:id` to prevent Express treating the literal string "search" as a UUID param.
- **`src/routes/stats.js`** — single `GET /stats` route.
- **`src/controllers/tasks.js`** — all task handlers; status transitions use a `STATUS_TRANSITIONS` map (`todo→in_progress→done`).
- **`src/controllers/stats.js`** — single aggregation query using `FILTER (WHERE ...)`.
- **`src/middleware/validate.js`** — pure validation helpers (UUID regex, enum checks, date helpers); imported by controllers, not used as Express middleware.
- **`openapi.yaml`** — OpenAPI 3.x spec at the project root; loaded at startup and served at `/docs` via `swagger-ui-express`.

## Database

Single table: `tasks`. Key constraints enforced at the DB level:
- `status` check: `todo | in_progress | done`
- `priority` check: `low | medium | high`
- UUIDs via `gen_random_uuid()` (requires `pgcrypto` extension, already in migration)

`updated_at` is **not** auto-maintained by a trigger — application code must set it on every `UPDATE`.
