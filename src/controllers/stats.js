const pool = require("../db");

async function getStats(_req, res, next) {
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*)                                                       AS total,
        COUNT(*) FILTER (WHERE status = 'todo')                        AS todo,
        COUNT(*) FILTER (WHERE status = 'in_progress')                 AS in_progress,
        COUNT(*) FILTER (WHERE status = 'done')                        AS done,
        COUNT(*) FILTER (WHERE priority = 'low')                       AS low,
        COUNT(*) FILTER (WHERE priority = 'medium')                    AS medium,
        COUNT(*) FILTER (WHERE priority = 'high')                      AS high,
        COUNT(*) FILTER (WHERE due_date < NOW() AND status != 'done')   AS overdue
      FROM tasks
    `);

    const r = rows[0];
    res.json({
      total: parseInt(r.total),
      by_status: {
        todo: parseInt(r.todo),
        in_progress: parseInt(r.in_progress),
        done: parseInt(r.done),
      },
      by_priority: {
        low: parseInt(r.low),
        medium: parseInt(r.medium),
        high: parseInt(r.high),
      },
      overdue: parseInt(r.overdue),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getStats };
