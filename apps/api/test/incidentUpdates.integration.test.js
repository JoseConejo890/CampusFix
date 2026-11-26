import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { withTransaction } from '../src/db.js';
import { createIncidentUpdatesRepository } from '../src/repositories/incidentUpdatesRepository.js';
import { createApp } from '../src/app.js';

const connectionString = process.env.TEST_DATABASE_URL;
const integration = (name, fn) => test(name, { skip: !connectionString }, fn);
// Every run owns a separate schema; application data is never truncated or modified.
const schema = `campusfix_test_${randomUUID().replaceAll('-', '')}`;
let adminPool;
let pool;
let repository;

before(async () => {
  if (!connectionString) return;
  adminPool = new pg.Pool({ connectionString });
  await adminPool.query(`CREATE SCHEMA "${schema}"`);
  pool = new pg.Pool({ connectionString, options: `-c search_path=${schema}` });
  for (const file of ['001_schema.sql', '002_closure.sql']) {
    await pool.query(await readFile(new URL(`../db/migrations/${file}`, import.meta.url), 'utf8'));
  }
  repository = createIncidentUpdatesRepository({ transaction: (callback) => withTransaction(callback, pool) });
});

after(async () => {
  await pool?.end();
  if (adminPool) {
    try { await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { await adminPool.end(); }
  }
});

async function fixture() {
  const ids = {};
  for (const [name, role] of [['admin', 'admin'], ['student', 'student'], ['tech', 'technician'], ['otherTech', 'technician']]) {
    const { rows } = await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id',
      [name, `${randomUUID()}@example.invalid`, 'test-only', role],
    );
    ids[name] = rows[0].id;
  }
  const { rows: categories } = await pool.query('INSERT INTO categories (name) VALUES ($1) RETURNING id', [randomUUID()]);
  const { rows: incidents } = await pool.query(`
    INSERT INTO incidents (title, description, location, category_id, reported_by)
    VALUES ('Lamp', 'No light', 'Library', $1, $2) RETURNING id
  `, [categories[0].id, ids.student]);
  ids.incident = incidents[0].id;
  return ids;
}

function update(f, changes, actorId = f.admin) {
  return repository.updateIncident({ incidentId: f.incident, actorId, changes });
}

async function state(incidentId) {
  const { rows } = await pool.query('SELECT * FROM incidents WHERE id = $1', [incidentId]);
  const { rows: history } = await pool.query('SELECT * FROM incident_updates WHERE incident_id = $1 ORDER BY created_at, id', [incidentId]);
  return { incident: rows[0], history };
}

integration('admin assignment and status change persist together with complete history', async () => {
  const f = await fixture();
  const result = await update(f, { assignedTo: f.tech, status: 'in_progress', comment: 'Revisar lámpara' });
  assert.equal(result.incident.assigned_to, f.tech);
  assert.equal(result.incident.assigned_to_name, 'tech');
  assert.equal(result.incident.status, 'in_progress');
  assert.equal(result.update.changed_by, f.admin);
  assert.equal(result.update.previous_status, 'open');
  assert.equal(result.update.previous_assigned_to, null);
  assert.equal(result.update.new_assigned_to, f.tech);
  assert.equal(result.update.comment, 'Revisar lámpara');
  assert.ok(result.update.created_at instanceof Date);
  assert.equal((await state(f.incident)).history.length, 1);
});

integration('student cannot assign or change status; unassigned technician cannot update', async () => {
  const f = await fixture();
  await assert.rejects(update(f, { assignedTo: f.tech }, f.student), { status: 403 });
  await assert.rejects(update(f, { status: 'resolved' }, f.student), { status: 403 });
  await assert.rejects(update(f, { status: 'resolved' }, f.tech), { status: 403 });
  const current = await state(f.incident);
  assert.equal(current.incident.status, 'open');
  assert.equal(current.history.length, 0);
});

integration('only assigned technician can change status and cannot assign even themselves', async () => {
  const f = await fixture();
  await update(f, { assignedTo: f.tech });
  await assert.rejects(update(f, { status: 'resolved' }, f.otherTech), { status: 403 });
  await assert.rejects(update(f, { assignedTo: f.tech }, f.tech), { status: 403 });
  const result = await update(f, { status: 'resolved' }, f.tech);
  assert.equal(result.update.changed_by, f.tech);
  assert.equal(result.update.new_assigned_to, f.tech);
});

integration('unknown actor, incident, missing assignee and non-technician are rejected without partial writes', async () => {
  const f = await fixture();
  await assert.rejects(update(f, { status: 'resolved' }, '9223372036854775807'), { status: 401 });
  await assert.rejects(repository.updateIncident({ incidentId: '9223372036854775807', actorId: f.admin, changes: { status: 'resolved' } }), { status: 404 });
  for (const assignedTo of [f.student, f.admin, '9223372036854775807']) {
    await assert.rejects(update(f, { assignedTo, status: 'in_progress' }), { status: 400 });
  }
  assert.equal((await state(f.incident)).history.length, 0);
  assert.equal((await state(f.incident)).incident.status, 'open');
});

integration('reassignment, unassignment and no-op retain the correct history', async () => {
  const f = await fixture();
  await update(f, { assignedTo: f.tech });
  const reassigned = await update(f, { assignedTo: f.otherTech });
  assert.equal(reassigned.update.previous_assigned_to, f.tech);
  assert.equal(reassigned.update.new_assigned_to, f.otherTech);
  assert.equal(reassigned.update.previous_status, 'open');
  assert.equal(reassigned.update.new_status, 'open');
  const noOp = await update(f, { assignedTo: f.otherTech, status: 'open' });
  assert.equal(noOp.update, null);
  assert.equal(noOp.incident.updated_at.getTime(), reassigned.incident.updated_at.getTime());
  const unassigned = await update(f, { assignedTo: null });
  assert.equal(unassigned.update.previous_assigned_to, f.otherTech);
  assert.equal(unassigned.incident.assigned_to, null);
  assert.equal((await state(f.incident)).history.length, 3);
});

integration('closing requires an assignee and closing/reopening maintains dates', async () => {
  const f = await fixture();
  await assert.rejects(update(f, { status: 'closed' }), { status: 409 });
  const closed = await update(f, { assignedTo: f.tech, status: 'closed' });
  assert.ok(closed.incident.closed_at instanceof Date);
  assert.ok(closed.incident.updated_at >= closed.incident.created_at);
  const { rows: [timestamps] } = await pool.query(`
    SELECT i.closed_at = i.updated_at AND i.updated_at = u.created_at AS match
    FROM incidents i JOIN incident_updates u ON u.incident_id = i.id
    WHERE u.id = $1
  `, [closed.update.id]);
  assert.equal(timestamps.match, true);
  await assert.rejects(update(f, { assignedTo: null }), { status: 409 });
  const reassigned = await update(f, { assignedTo: f.otherTech });
  assert.deepEqual(reassigned.incident.closed_at, closed.incident.closed_at);
  const reopened = await update(f, { status: 'open' });
  assert.equal(reopened.incident.closed_at, null);
  assert.equal(reopened.update.previous_status, 'closed');
});

integration('PostgreSQL rejects inconsistent closures even outside the API', async () => {
  const f = await fixture();
  await assert.rejects(pool.query(
    "UPDATE incidents SET status = 'closed', closed_at = now() WHERE id = $1", [f.incident],
  ), { code: '23514', constraint: 'incidents_closed_requires_assignee' });
  await assert.rejects(pool.query(
    "UPDATE incidents SET status = 'closed', assigned_to = $2 WHERE id = $1", [f.incident, f.tech],
  ), { code: '23514', constraint: 'incidents_closed_at_matches_status' });
  await assert.rejects(pool.query(
    'UPDATE incidents SET closed_at = now() WHERE id = $1', [f.incident],
  ), { code: '23514', constraint: 'incidents_closed_at_matches_status' });
});

integration('history exposes author and assignee names in chronological order without password hashes', async () => {
  const f = await fixture();
  assert.deepEqual(await repository.listIncidentHistory({ incidentId: f.incident, actorId: f.student }), []);
  await update(f, { assignedTo: f.tech });
  await update(f, { status: 'resolved' }, f.tech);
  const history = await repository.listIncidentHistory({ incidentId: f.incident, actorId: f.student });
  assert.equal(history.length, 2);
  assert.equal(history[0].changed_by_name, 'admin');
  assert.equal(history[0].new_assigned_to_name, 'tech');
  assert.equal(history[1].changed_by_name, 'tech');
  assert.ok(history[0].created_at <= history[1].created_at);
  assert.ok(history.every((entry) => !Object.hasOwn(entry, 'password_hash')));
  await assert.rejects(repository.listIncidentHistory({ incidentId: '9223372036854775807', actorId: f.admin }), { status: 404 });
});

integration('failure while inserting history rolls back the incident and releases the connection', async () => {
  const f = await fixture();
  const original = await state(f.incident);
  // Inject an actual PostgreSQL error after UPDATE and before history is inserted.
  const failingRepository = createIncidentUpdatesRepository({
    transaction: (callback) => withTransaction((client) => callback({
      query: (sql, values) => sql.includes('INSERT INTO incident_updates')
        ? client.query('SELECT 1 / 0') : client.query(sql, values),
    }), pool),
  });
  await assert.rejects(failingRepository.updateIncident({
    incidentId: f.incident, actorId: f.admin, changes: { assignedTo: f.tech, status: 'in_progress' },
  }), { code: '22012' });
  assert.deepEqual(await state(f.incident), original);
  assert.equal((await update(f, { assignedTo: f.tech })).incident.assigned_to, f.tech);
});

integration('concurrent updates record a continuous chain of previous and new values', async () => {
  const f = await fixture();
  await Promise.all([
    update(f, { assignedTo: f.tech, status: 'in_progress' }),
    update(f, { assignedTo: f.otherTech, status: 'resolved' }),
  ]);
  const { incident, history } = await state(f.incident);
  assert.equal(history.length, 2);
  assert.equal(history[0].previous_status, 'open');
  assert.equal(history[0].previous_assigned_to, null);
  assert.equal(history[1].previous_status, history[0].new_status);
  assert.equal(history[1].previous_assigned_to, history[0].new_assigned_to);
  assert.equal(incident.status, history[1].new_status);
  assert.equal(incident.assigned_to, history[1].new_assigned_to);
});

integration('HTTP PATCH and GET history work end to end with PostgreSQL and development identity', async (t) => {
  const f = await fixture();
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDevAuth = process.env.DEV_AUTH_ENABLED;
  process.env.NODE_ENV = 'development';
  process.env.DEV_AUTH_ENABLED = 'true';
  t.after(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalNodeEnv;
    if (originalDevAuth === undefined) delete process.env.DEV_AUTH_ENABLED; else process.env.DEV_AUTH_ENABLED = originalDevAuth;
  });
  const server = createApp({ incidentsRepository: repository }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  const url = `http://127.0.0.1:${server.address().port}/api/incidents/${f.incident}`;
  const body = JSON.stringify({ assignedTo: f.tech, status: 'in_progress' });
  const anonymous = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
  assert.equal(anonymous.status, 401);
  const response = await fetch(url, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-User-Id': f.admin }, body,
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.incident.assigned_to, f.tech);
  assert.equal(data.update.changed_by, f.admin);
  assert.ok(data.update.created_at.endsWith('Z'));
  const history = await fetch(`${url}/history`, { headers: { 'X-User-Id': f.student } });
  assert.equal(history.status, 200);
  assert.equal((await history.json()).updates[0].changed_by_name, 'admin');
  const forbidden = await fetch(url, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-User-Id': f.student },
    body: JSON.stringify({ status: 'resolved' }),
  });
  assert.equal(forbidden.status, 403);

  const headers = { 'Content-Type': 'application/json', 'X-User-Id': f.admin };
  for (const invalidBody of [null, [], {}, { status: 'invalid' },
    { assignedTo: '0' }, { assignedTo: '9223372036854775808' },
    { assignedTo: 9007199254740992 }, { assignedTo: f.tech, assigned_to: f.otherTech },
    { status: 'resolved', changed_by: f.student }, { status: 'open', comment: ' ' },
    { status: 'open', comment: 'x'.repeat(2001) }]) {
    const invalid = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify(invalidBody) });
    assert.equal(invalid.status, 400);
  }
  const malformed = await fetch(url, { method: 'PATCH', headers, body: '{' });
  assert.equal(malformed.status, 400);
  for (const id of ['0', 'abc', '9223372036854775808']) {
    const invalidId = await fetch(`${url.replace(/\d+$/, id)}`, { method: 'PATCH', headers, body });
    assert.equal(invalidId.status, 400);
  }
  const missing = await fetch(url.replace(/\d+$/, '9223372036854775807'), {
    method: 'PATCH', headers, body,
  });
  assert.equal(missing.status, 404);

  process.env.NODE_ENV = 'production';
  const production = await fetch(url, { method: 'PATCH', headers, body });
  assert.equal(production.status, 401);
  process.env.NODE_ENV = 'development';
  process.env.DEV_AUTH_ENABLED = 'false';
  const disabled = await fetch(url, { method: 'PATCH', headers, body });
  assert.equal(disabled.status, 401);
  assert.equal((await state(f.incident)).history.length, 1);
});
