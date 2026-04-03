require('dotenv').config();
const request = require('supertest');
const app = require('../app');
const pool = require('../db');

async function insertTask(overrides = {}) {
  const { rows } = await pool.query(
    `INSERT INTO tasks (title, description, priority)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [
      overrides.title       ?? 'Test task',
      overrides.description ?? null,
      overrides.priority    ?? 'medium',
    ]
  );
  return rows[0].id;
}

async function deleteTasks(ids) {
  if (!ids.length) return;
  await pool.query('DELETE FROM tasks WHERE id = ANY($1)', [ids]);
}

describe('GET /tasks/search', () => {
  const ids = [];

  afterEach(async () => {
    await deleteTasks(ids.splice(0));
  });

  afterAll(async () => {
    await pool.end();
  });

  it('match found — returns tasks whose title contains the query', async () => {
    ids.push(await insertTask({ title: 'Buy groceries' }));

    const res = await request(app).get('/tasks/search?q=groceries');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const titles = res.body.map((t) => t.title);
    expect(titles).toContain('Buy groceries');
  });

  it('match found — returns tasks whose description contains the query', async () => {
    ids.push(await insertTask({ title: 'Sprint planning', description: 'Review velocity metrics' }));

    const res = await request(app).get('/tasks/search?q=velocity');

    expect(res.status).toBe(200);
    const titles = res.body.map((t) => t.title);
    expect(titles).toContain('Sprint planning');
  });

  it('no match — returns an empty array when nothing matches', async () => {
    ids.push(await insertTask({ title: 'Completely unrelated task' }));

    const res = await request(app).get('/tasks/search?q=xyzzy_no_match_42');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // None of our seeded tasks should appear
    const returnedIds = res.body.map((t) => t.id);
    expect(returnedIds).not.toContain(ids[0]);
  });

  it('empty query — returns 422 when q is missing', async () => {
    const res = await request(app).get('/tasks/search');
    expect(res.status).toBe(422);
  });

  it('empty query — returns 422 when q is an empty string', async () => {
    const res = await request(app).get('/tasks/search?q=');
    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('error');
  });

  it('special characters — % does not crash the server', async () => {
    const res = await request(app).get('/tasks/search?q=%25');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('special characters — _ does not crash the server', async () => {
    const res = await request(app).get('/tasks/search?q=_');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("special characters — single quote does not crash the server", async () => {
    const res = await request(app).get("/tasks/search?q='");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('partial match — "task" matches a title containing "My task list"', async () => {
    ids.push(await insertTask({ title: 'My task list' }));

    const res = await request(app).get('/tasks/search?q=task');

    expect(res.status).toBe(200);
    const titles = res.body.map((t) => t.title);
    expect(titles).toContain('My task list');
  });

  it('case-insensitive — uppercase query matches lowercase title', async () => {
    ids.push(await insertTask({ title: 'deploy to production' }));

    const res = await request(app).get('/tasks/search?q=DEPLOY');

    expect(res.status).toBe(200);
    const titles = res.body.map((t) => t.title);
    expect(titles).toContain('deploy to production');
  });
});
