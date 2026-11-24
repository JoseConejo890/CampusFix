import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

let server;
let baseUrl;

before(async () => {
  const app = createApp({
    catalogRepository: {
      listCategories: async () => [
        { id: '1', name: 'Infraestructura', description: 'Fallas en aulas y edificios' },
        { id: '2', name: 'Redes', description: 'WiFi y conectividad' },
      ],
      listUsers: async () => [
        { id: '1', name: 'Jose Conejo', email: 'jose@campusfix.local', role: 'student' },
        { id: '2', name: 'Admin Campus', email: 'admin@campusfix.local', role: 'admin' },
      ],
    },
  });

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve, reject) => {
  server.close((error) => (error ? reject(error) : resolve()));
}));

test('GET /api/categories returns category list', async () => {
  const response = await fetch(`${baseUrl}/api/categories`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.categories.length, 2);
  assert.equal(body.categories[0].name, 'Infraestructura');
});

test('GET /api/users returns users without password hashes', async () => {
  const response = await fetch(`${baseUrl}/api/users`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.users.length, 2);
  assert.equal(body.users[0].password_hash, undefined);
  assert.equal(body.users[1].role, 'admin');
});
