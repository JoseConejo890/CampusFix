import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

let server;
let baseUrl;
let mockCalls;
let mockBehavior;

const sampleIncident = {
  id: '1',
  title: 'Proyector sin señal',
  description: 'El proyector del aula 204 no enciende.',
  location: 'Edificio B - Aula 204',
  category_id: '1',
  category_name: 'Infraestructura',
  reported_by: '1',
  reported_by_name: 'José Conejo',
  assigned_to: null,
  assigned_to_name: null,
  status: 'open',
  priority: 'high',
  created_at: '2026-11-19T20:00:00.000Z',
  updated_at: '2026-11-19T20:00:00.000Z',
  closed_at: null,
};

before(async () => {
  mockCalls = [];
  mockBehavior = {
    listIncidents: async (filters) => {
      mockCalls.push({ method: 'listIncidents', filters });
      return [sampleIncident];
    },
    createIncident: async (payload) => {
      mockCalls.push({ method: 'createIncident', payload });
      return { ...sampleIncident, ...payload };
    },
  };

  const app = createApp({
    incidentsRepository: {
      listIncidents: (filters) => mockBehavior.listIncidents(filters),
      createIncident: (payload) => mockBehavior.createIncident(payload),
    },
  });

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve, reject) => {
  server.close((error) => (error ? reject(error) : resolve()));
}));

test('GET /api/incidents returns incident list and forwards valid filters', async () => {
  mockCalls = [];
  const response = await fetch(`${baseUrl}/api/incidents?status=open&priority=high&categoryId=2`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, { incidents: [sampleIncident] });
  assert.deepEqual(mockCalls[0], {
    method: 'listIncidents',
    filters: { status: 'open', priority: 'high', categoryId: '2' },
  });
});

test('GET /api/incidents rejects invalid status filter with 400', async () => {
  const response = await fetch(`${baseUrl}/api/incidents?status=invalid`);
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error, 'Invalid status filter');
});

test('POST /api/incidents creates an incident with default medium priority', async () => {
  mockCalls = [];
  const response = await fetch(`${baseUrl}/api/incidents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: '  Fuga de agua  ',
      description: 'Llave rota en el baño.',
      location: 'Edificio A - Planta baja',
      categoryId: 1,
      reportedBy: '2',
    }),
  });

  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.incident.title, 'Fuga de agua');
  assert.deepEqual(mockCalls[0], {
    method: 'createIncident',
    payload: {
      title: 'Fuga de agua',
      description: 'Llave rota en el baño.',
      location: 'Edificio A - Planta baja',
      categoryId: '1',
      reportedBy: '2',
      priority: 'medium',
    },
  });
});

test('POST /api/incidents accepts snake_case category_id and reported_by', async () => {
  mockCalls = [];
  const response = await fetch(`${baseUrl}/api/incidents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Sin internet',
      description: 'No hay WiFi en biblioteca.',
      location: 'Biblioteca',
      category_id: '3',
      reported_by: 4,
      priority: 'high',
    }),
  });

  assert.equal(response.status, 201);
  assert.deepEqual(mockCalls[0].payload, {
    title: 'Sin internet',
    description: 'No hay WiFi en biblioteca.',
    location: 'Biblioteca',
    categoryId: '3',
    reportedBy: '4',
    priority: 'high',
  });
});

test('POST /api/incidents rejects missing fields or invalid priority with 400', async () => {
  const response = await fetch(`${baseUrl}/api/incidents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: '   ',
      priority: 'urgent',
    }),
  });

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error, 'Validation failed');
  assert.ok(Array.isArray(body.details));
  assert.ok(body.details.length >= 5);
});

test('POST /api/incidents returns 400 when referenced category or user does not exist', async () => {
  const originalCreate = mockBehavior.createIncident;
  mockBehavior.createIncident = async () => {
    const err = new Error('foreign key violation');
    err.code = '23503';
    throw err;
  };

  try {
    const response = await fetch(`${baseUrl}/api/incidents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Lámpara fundida',
        description: 'Pasillo oscuro.',
        location: 'Edificio C',
        categoryId: '999',
        reportedBy: '999',
      }),
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error, 'Referenced category or user does not exist');
  } finally {
    mockBehavior.createIncident = originalCreate;
  }
});
