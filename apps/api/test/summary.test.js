import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

let server;
let baseUrl;
let mockSummary;

before(async () => {
  mockSummary = async () => ({
    total: 5,
    open: 2,
    in_progress: 1,
    resolved: 1,
    closed: 1,
    active: 4,
    byStatus: {
      open: 2,
      in_progress: 1,
      resolved: 1,
      closed: 1,
    },
    byPriority: {
      low: 1,
      medium: 2,
      high: 2,
    },
  });

  const app = createApp({
    summaryRepository: {
      getIncidentSummary: () => mockSummary(),
    },
  });

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve, reject) => {
  server.close((error) => (error ? reject(error) : resolve()));
}));

test('GET /api/summary returns incident counts by status and priority', async () => {
  const response = await fetch(`${baseUrl}/api/summary`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.summary.total, 5);
  assert.equal(body.summary.active, 4);
  assert.equal(body.summary.closed, 1);
  assert.deepEqual(body.summary.byStatus, {
    open: 2,
    in_progress: 1,
    resolved: 1,
    closed: 1,
  });
  assert.deepEqual(body.summary.byPriority, {
    low: 1,
    medium: 2,
    high: 2,
  });
});

test('GET /api/summary returns 500 JSON when repository fails', async () => {
  const original = mockSummary;
  mockSummary = async () => {
    throw new Error('database unavailable');
  };

  try {
    const response = await fetch(`${baseUrl}/api/summary`);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'Internal server error' });
  } finally {
    mockSummary = original;
  }
});
