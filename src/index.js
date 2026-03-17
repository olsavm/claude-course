require('dotenv').config();

const app = require('./app');
const pool = require('./db');

const PORT = process.env.PORT || 3000;

async function start() {
  await pool.query('SELECT 1'); // verify DB connection
  console.log('Database connected');

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
