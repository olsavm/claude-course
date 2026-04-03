const fs   = require('fs');
const path = require('path');
const express    = require('express');
const yaml       = require('js-yaml');
const swaggerUi  = require('swagger-ui-express');

const taskRoutes  = require('./routes/tasks');
const statsRoutes = require('./routes/stats');

const app = express();

app.use(express.json());

// Swagger UI
const openApiSpec = yaml.load(
  fs.readFileSync(path.join(__dirname, '..', 'openapi.yaml'), 'utf8')
);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));

// Routes
app.use('/tasks', taskRoutes);
app.use('/stats', statsRoutes);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// 404
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Global error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
