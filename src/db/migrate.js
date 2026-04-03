require('dotenv').config();

const fs = require('fs');
const path = require('path');
const pool = require('./index');

async function migrate() {
  // Bootstrap: tracking table must exist before any migration logic runs
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT        PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const { rows: applied } = await pool.query('SELECT filename FROM schema_migrations');
  const appliedSet = new Set(applied.map((r) => r.filename));

  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`Skip (already applied): ${file}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    console.log(`Applying: ${file}`);
    await pool.query(sql);
    await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
    console.log(`Done: ${file}`);
  }

  await pool.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
