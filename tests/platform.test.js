import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { MemoryRepository, MemoryAudit } from '../src/repositories/memory.js';
import { OutboxWorker } from '../src/services/outbox.js';
import { seedData } from '../scripts/seed-data.js';
import { toCsv } from '../src/utils/csv.js';

const PASSWORD = 'TestingPassword2026!';
const config = { JWT_SECRET: 'secret-for-platform-tests-at-least-32-chars', JWT_EXPIRES_IN: '2h', DB_MODE: 'demo', ADMIN_EMAIL: 'admin@test.com', ADMIN_NAME: 'Admin test', ADMIN_PASSWORD: PASSWORD };
let repo, audit, app, admin, analyst, agent;
const as = token => ({ Authorization: 'Bearer ' + token });
const login = async email => (await request(app).post('/api/auth/login').send({ email, password: PASSWORD })).body.data.token;

before(async () => {
  repo = new MemoryRepository();
  audit = new MemoryAudit();
  const hash = await bcrypt.hash(PASSWORD, 4);
  await repo.createUser({ name: 'Admin test', email: 'admin@test.com', role: 'admin', passwordHash: hash });
  await seedData(repo, config, audit);
  app = createApp({ repository: repo, audit, config, quiet: true });
  admin = await login('admin@test.com');
  analyst = await login('carla.analista@fugacliente.local');
  agent = await login('jorge.agente@fugacliente.local');
  await new OutboxWorker(repo, audit).flush();
});

test('La ruta versionada /api/v1 expone el mismo contrato que /api', async () => {
  const legacy = await request(app).get('/api/clients?limit=5').set(as(admin));
  const versioned = await request(app).get('/api/v1/clients?limit=5').set(as(admin));
  assert.equal(versioned.status, 200);
  assert.deepEqual(versioned.body.pagination, legacy.body.pagination);
  assert.equal((await request(app).get('/api/v1/no-existe').set(as(admin))).status, 404);
});

test('El índice y la salud informan versión y documentación', async () => {
  const index = await request(app).get('/api/v1');
  assert.equal(index.body.data.docs, '/api/docs');
  const health = await request(app).get('/api/health');
  assert.equal(health.body.data.version, '2.0.0');
  assert.ok(Number.isInteger(health.body.data.uptimeSeconds));
  assert.equal((await request(app).get('/api/docs')).headers.location, '/docs.html');
});

test('Se reutiliza un X-Request-Id válido y se genera uno ante valores inválidos', async () => {
  const own = await request(app).get('/api/health').set('X-Request-Id', 'trace-12345678');
  assert.equal(own.headers['x-request-id'], 'trace-12345678');
  const bad = await request(app).get('/api/health').set('X-Request-Id', '<script>');
  assert.notEqual(bad.headers['x-request-id'], '<script>');
});

test('El panel incluye tendencia, categorías, carga por servicio y resultados de retención', async () => {
  const { body } = await request(app).get('/api/dashboard').set(as(agent));
  const d = body.data;
  assert.equal(d.trend.length, 8);
  assert.ok(d.trend.every(w => Number.isInteger(w.opened) && Number.isInteger(w.resolved)));
  assert.equal(d.distribution.bajo + d.distribution.medio + d.distribution.alto, d.totalClients);
  assert.equal(d.totalClients, 13, 'el cliente archivado no cuenta como activo');
  assert.ok(d.byCategory.length > 0 && d.byService.length > 0);
  assert.equal(d.retention.completed, 4);
  assert.equal(d.retention.recovered, 2);
  assert.equal(d.retention.recoveryRate, 50);
  assert.ok(d.slaBreached <= d.openIncidents);
});

test('Las alertas solo incluyen clientes activos con riesgo medio o alto', async () => {
  const { body } = await request(app).get('/api/alerts?limit=100').set(as(agent));
  assert.ok(body.data.length > 0);
  assert.ok(body.data.every(c => c.status === 'activo' && c.risk.level !== 'bajo'));
  const scores = body.data.map(c => c.risk.score);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
});

test('La búsqueda ignora tildes y mayúsculas', async () => {
  const { body } = await request(app).get('/api/clients?search=optica').set(as(agent));
  assert.equal(body.data[0].name, 'Óptica Visión');
});

test('Las acciones pendientes vencidas se marcan como overdue', async () => {
  const { body } = await request(app).get('/api/retention-actions?status=pendiente').set(as(agent));
  assert.ok(body.data.every(a => typeof a.overdue === 'boolean'));
});

test('El resumen de auditoría agrega eventos por tipo, día y métricas HTTP', async () => {
  const forbidden = await request(app).get('/api/logs/summary').set(as(agent));
  assert.equal(forbidden.status, 403);
  const { body } = await request(app).get('/api/logs/summary?days=30').set(as(analyst));
  assert.ok(body.data.byType.some(t => t.eventType === 'incident.created'));
  assert.ok(body.data.byDay.length > 0);
  assert.ok(body.data.http.total > 0);
  assert.equal((await request(app).get('/api/logs/summary?days=500').set(as(analyst))).status, 400);
});

test('El reporte CSV respeta filtros, permisos y codificación', async () => {
  assert.equal((await request(app).get('/api/reports/clients.csv').set(as(agent))).status, 403);
  const r = await request(app).get('/api/reports/clients.csv?level=alto').set(as(analyst));
  assert.equal(r.status, 200);
  assert.match(r.headers['content-type'], /text\/csv/);
  assert.match(r.headers['content-disposition'], /attachment; filename="fugacliente-clientes-/);
  assert.ok(r.text.startsWith('﻿ID,Cliente'));
  const lines = r.text.trim().split('\r\n');
  assert.equal(lines.length - 1, Number(r.headers['x-total-count']));
  assert.ok(lines.slice(1).every(line => line.includes(',alto,')));
});

test('El CSV neutraliza fórmulas y escapa comillas', () => {
  const csv = toCsv([{ label: 'a', value: r => r.a }], [{ a: '=HYPERLINK("x")' }, { a: 'Hola, "mundo"' }]);
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`));
  assert.ok(csv.includes('"Hola, ""mundo"""'));
});

test('Solo el administrador gestiona usuarios y no puede bloquearse a sí mismo', async () => {
  const users = (await request(app).get('/api/users').set(as(admin))).body.data;
  const me = users.find(u => u.email === 'admin@test.com');
  const target = users.find(u => u.email === 'jorge.agente@fugacliente.local');
  assert.equal((await request(app).patch(`/api/users/${target.id}`).set(as(analyst)).send({ active: false })).status, 403);
  assert.equal((await request(app).patch(`/api/users/${me.id}`).set(as(admin)).send({ active: false })).status, 409);
  assert.equal((await request(app).patch(`/api/users/${me.id}`).set(as(admin)).send({ role: 'agente' })).status, 409);
  assert.equal((await request(app).patch(`/api/users/${target.id}`).set(as(admin)).send({})).status, 400);
  const promoted = await request(app).patch(`/api/users/${target.id}`).set(as(admin)).send({ role: 'analista' });
  assert.equal(promoted.status, 200);
  assert.equal(promoted.body.data.role, 'analista');
  assert.ok(!('passwordHash' in promoted.body.data));
});

test('Un usuario desactivado pierde el acceso aunque su token no haya expirado', async () => {
  const hash = await bcrypt.hash(PASSWORD, 4);
  const temp = await repo.createUser({ name: 'Temporal', email: 'temp@test.com', role: 'agente', passwordHash: hash });
  const token = await login('temp@test.com');
  assert.equal((await request(app).get('/api/users/me').set(as(token))).status, 200);
  assert.equal((await request(app).patch(`/api/users/${temp.id}`).set(as(admin)).send({ active: false })).status, 200);
  assert.equal((await request(app).get('/api/users/me').set(as(token))).status, 401);
});

test('Los servicios se consultan por ID y su SLA se actualiza con validación', async () => {
  const created = await request(app).post('/api/services').set(as(admin)).send({ name: 'Instalaciones', slaHours: 72 });
  assert.equal(created.status, 201);
  assert.equal((await request(app).get(created.headers.location).set(as(agent))).status, 200);
  const updated = await request(app).patch(`/api/services/${created.body.data.id}`).set(as(admin)).send({ slaHours: 48, active: false });
  assert.equal(updated.body.data.slaHours, 48);
  assert.equal(updated.body.data.active, false);
  assert.equal((await request(app).patch(`/api/services/${created.body.data.id}`).set(as(admin)).send({ slaHours: 0 })).status, 400);
  assert.equal((await request(app).patch('/api/services/9999').set(as(admin)).send({ slaHours: 10 })).status, 404);
  assert.equal((await request(app).patch(`/api/services/${created.body.data.id}`).set(as(admin)).send({ name: 'Soporte técnico' })).status, 409);
});

test('La interfaz y la documentación se sirven con CSP estricta', async () => {
  const page = await request(app).get('/');
  assert.equal(page.status, 200);
  assert.match(page.headers['content-security-policy'], /script-src 'self'/);
  assert.equal((await request(app).get('/docs.html')).status, 200);
  assert.equal((await request(app).get('/api/openapi.json')).status, 200);
});
