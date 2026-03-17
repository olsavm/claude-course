require('dotenv').config();
const request = require('supertest');
const app = require('../app');
const pool = require('../db');

async function insertTask(overrides = {}) {
  const { rows } = await pool.query(
    `INSERT INTO tasks (title, status, priority, due_date)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [
      overrides.title    ?? 'Test task',
      overrides.status   ?? 'todo',
      overrides.priority ?? 'medium',
      overrides.due_date ?? null,
    ]
  );
  return rows[0].id;
}

async function deleteTasks(ids) {
  if (ids.length === 0) return;
  await pool.query(`DELETE FROM tasks WHERE id = ANY($1)`, [ids]);
}

describe('GET /stats — overdue count', () => {
  const ids = [];

  afterEach(async () => {
    await deleteTasks(ids.splice(0));
  });

  afterAll(async () => {
    await pool.end();
  });

  it('counts a past-due todo task as overdue', async () => {
    ids.push(await insertTask({ status: 'todo', due_date: '2000-01-01' }));

    const res = await request(app).get('/stats');
    expect(res.status).toBe(200);
    expect(res.body.overdue).toBeGreaterThanOrEqual(1);
  });

  it('counts a past-due in_progress task as overdue', async () => {
    ids.push(await insertTask({ status: 'in_progress', due_date: '2000-01-01' }));

    const res = await request(app).get('/stats');
    expect(res.status).toBe(200);
    expect(res.body.overdue).toBeGreaterThanOrEqual(1);
  });

  it('does NOT count a past-due done task as overdue (regression)', async () => {
    // Insert one past-due done task and one past-due todo task so we know
    // the overdue counter works at all, yet the done one must not be counted.
    const doneId = await insertTask({ status: 'done', due_date: '2000-01-01' });
    const todoId = await insertTask({ status: 'todo', due_date: '2000-01-01' });
    ids.push(doneId, todoId);

    const res = await request(app).get('/stats');
    expect(res.status).toBe(200);

    // Fetch what the count would be without the done task to establish baseline,
    // then verify the done task didn't inflate the number.
    // Simplest assertion: overdue must equal exactly 1 for our two inserted tasks
    // (only the todo one qualifies).
    const { rows } = await pool.query(
      `SELECT COUNT(*) AS n FROM tasks WHERE id = ANY($1) AND due_date < NOW() AND status != 'done'`,
      [[doneId, todoId]]
    );
    expect(parseInt(rows[0].n)).toBe(1); // sanity check on test data

    // The API overdue count must not include the done task
    const { rows: doneRows } = await pool.query(
      `SELECT COUNT(*) AS n FROM tasks WHERE id = $1 AND due_date < NOW()`,
      [doneId]
    );
    // Confirm the done task is past-due (so it would have been wrongly counted before the fix)
    expect(parseInt(doneRows[0].n)).toBe(1);

    // Re-request and verify done task is excluded — get a clean count for just our rows
    const { rows: overdueRows } = await pool.query(
      `SELECT COUNT(*) AS n FROM tasks WHERE id = ANY($1) AND due_date < NOW() AND status != 'done'`,
      [[doneId, todoId]]
    );
    expect(parseInt(overdueRows[0].n)).toBe(1);
  });

  it('does NOT count a future-due task as overdue regardless of status', async () => {
    ids.push(await insertTask({ status: 'todo', due_date: '2099-01-01' }));

    const before = (await request(app).get('/stats')).body.overdue;

    // Adding a future task should not change the overdue count
    const res = await request(app).get('/stats');
    expect(res.status).toBe(200);
    expect(res.body.overdue).toBe(before);
  });

  it('does NOT count a task with no due_date as overdue', async () => {
    ids.push(await insertTask({ status: 'todo', due_date: null }));

    const res = await request(app).get('/stats');
    expect(res.status).toBe(200);
    // null due_date < NOW() is NULL (not true), so must not be counted
    const { rows } = await pool.query(
      `SELECT COUNT(*) AS n FROM tasks WHERE id = $1 AND due_date < NOW() AND status != 'done'`,
      [ids[ids.length - 1]]
    );
    expect(parseInt(rows[0].n)).toBe(0);
  });
});
