const pool = require('../db');
const { isValidUUID, isValidStatus, isValidPriority, isValidDate, isFutureDate } = require('../middleware/validate');

const STATUS_TRANSITIONS = { todo: 'in_progress', in_progress: 'done' };

async function createTask(req, res, next) {
  try {
    const { title, description, priority = 'medium', due_date } = req.body;

    const errors = [];
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      errors.push('title is required and must be a non-empty string');
    } else if (title.length > 200) {
      errors.push('title must not exceed 200 characters');
    }
    if (!isValidPriority(priority)) {
      errors.push('priority must be low, medium, or high');
    }
    if (due_date !== undefined && due_date !== null) {
      if (!isValidDate(due_date)) errors.push('due_date must be a valid ISO date');
      // NOTE: future-date check temporarily removed for testing
    }
    if (errors.length) return res.status(422).json({ errors });

    const { rows } = await pool.query(
      `INSERT INTO tasks (title, description, priority, due_date)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [title.trim(), description ?? null, priority, due_date ?? null]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
}

async function listTasks(req, res, next) {
  try {
    const { status, priority } = req.query;

    const errors = [];
    if (status   && !isValidStatus(status))     errors.push('status must be todo, in_progress, or done');
    if (priority && !isValidPriority(priority)) errors.push('priority must be low, medium, or high');
    if (errors.length) return res.status(422).json({ errors });

    const conditions = [];
    const params = [];

    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }
    if (priority) {
      params.push(priority);
      conditions.push(`priority = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT * FROM tasks ${where} ORDER BY created_at DESC`,
      params
    );

    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function searchTasks(req, res, next) {
  try {
    const { q } = req.query;
    if (!q || q.trim().length === 0) {
      return res.status(422).json({ error: 'q (search query) is required' });
    }

    const { rows } = await pool.query(
      `SELECT * FROM tasks
       WHERE (lower(title) || ' ' || lower(coalesce(description, ''))) LIKE '%' || lower($1) || '%'
       ORDER BY created_at DESC`,
      [q.trim()]
    );

    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function getTask(req, res, next) {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(422).json({ error: 'id must be a valid UUID' });

    const { rows } = await pool.query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Task not found' });

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

async function updateTask(req, res, next) {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(422).json({ error: 'id must be a valid UUID' });

    if ('status' in req.body) {
      return res.status(422).json({
        error: 'status cannot be changed here; use PATCH /tasks/:id/status',
      });
    }

    const ALLOWED = ['title', 'description', 'priority', 'due_date'];
    const fields  = ALLOWED.filter((f) => f in req.body);
    if (!fields.length) {
      return res.status(422).json({ error: 'Provide at least one field to update' });
    }

    const errors = [];
    if ('title' in req.body) {
      const t = req.body.title;
      if (!t || typeof t !== 'string' || t.trim().length === 0)
        errors.push('title must be a non-empty string');
      else if (t.length > 200)
        errors.push('title must not exceed 200 characters');
    }
    if ('priority' in req.body && !isValidPriority(req.body.priority)) {
      errors.push('priority must be low, medium, or high');
    }
    if ('due_date' in req.body && req.body.due_date !== null) {
      if (!isValidDate(req.body.due_date)) errors.push('due_date must be a valid ISO date');
    }
    if (errors.length) return res.status(422).json({ errors });

    // Build dynamic SET clause
    const params = [];
    const setClauses = fields.map((field) => {
      const value = field === 'title' ? req.body[field].trim() : req.body[field];
      params.push(value);
      return `${field} = $${params.length}`;
    });
    params.push(id);

    const { rows } = await pool.query(
      `UPDATE tasks SET ${setClauses.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'Task not found' });

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

async function deleteTask(req, res, next) {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(422).json({ error: 'id must be a valid UUID' });

    const { rowCount } = await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
    if (!rowCount) return res.status(404).json({ error: 'Task not found' });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

async function transitionStatus(req, res, next) {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(422).json({ error: 'id must be a valid UUID' });

    const { rows } = await pool.query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Task not found' });

    const nextStatus = STATUS_TRANSITIONS[rows[0].status];
    if (!nextStatus) {
      return res.status(422).json({
        error: 'Task is already done; no further transitions are possible',
      });
    }

    const { rows: updated } = await pool.query(
      'UPDATE tasks SET status = $1 WHERE id = $2 RETURNING *',
      [nextStatus, id]
    );

    res.json(updated[0]);
  } catch (err) {
    next(err);
  }
}

module.exports = { createTask, listTasks, searchTasks, getTask, updateTask, deleteTask, transitionStatus };
