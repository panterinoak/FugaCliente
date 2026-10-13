import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { MemoryRepository, MemoryAudit } from '../src/repositories/memory.js';
import { OutboxWorker } from '../src/services/outbox.js';

const config = { JWT_SECRET: 'secret-for-behavior-tests-at-least-32-chars', JWT_EXPIRES_IN: '2h', DB_MODE: 'demo' };
let repo, audit, app, token, agentToken;
const auth = () => ({ Authorization: 'Bearer ' + token });
const createClient = async (email = `cliente-${crypto.randomUUID()}@example.com`) => {
  const result = await request(app).post('/api/clients').set(auth()).send({ name: 'Cliente de prueba', email, segmentId: 1 }); assert.equal(result.status, 201); return result.body.data;
};
const incidentData = clientId => ({ clientId, serviceId: 1, categoryId: 1, severity: 3, satisfaction: 1, description: 'El servicio no se atendió dentro del plazo esperado.', assignedUserId: 1 });
before(async () => {
  repo = new MemoryRepository(); audit = new MemoryAudit(); const hash = await bcrypt.hash('TestingPassword2026!', 4);
  await repo.createUser({ name: 'Admin test', email: 'admin@test.com', role: 'admin', passwordHash: hash });
  await repo.createUser({ name: 'Agente test', email: 'agent@test.com', role: 'agente', passwordHash: hash });
  app = createApp({ repository: repo, audit, config, quiet: true });
  token = (await request(app).post('/api/auth/login').send({ email: 'admin@test.com', password: 'TestingPassword2026!' })).body.data.token;
  agentToken = (await request(app).post('/api/auth/login').send({ email: 'agent@test.com', password: 'TestingPassword2026!' })).body.data.token;
});
test('Las rutas privadas requieren token y rechazan tokens alterados', async () => {
  assert.equal((await request(app).get('/api/clients')).status, 401);
  assert.equal((await request(app).get('/api/clients').set('Authorization', 'Bearer invalid')).status, 401);
});
test('Login incorrecto no expone si existe el correo', async () => {
  const result = await request(app).post('/api/auth/login').send({ email: 'missing@test.com', password: 'incorrecta' });
  assert.equal(result.status, 401); assert.equal(result.body.error.code, 'INVALID_CREDENTIALS');
});
test('Los usuarios públicos no contienen hashes de contraseña', async () => {
  const result = await request(app).get('/api/users').set(auth()); assert.equal(result.status, 200);
  assert.ok(result.body.data.every(u => !('passwordHash' in u)));
  const created = await request(app).post('/api/users').set(auth()).send({ name: 'Otro agente', email: 'other@test.com', password: 'SecurePassword2026!', role: 'agente' });
  assert.equal(created.status, 201); assert.equal((await request(app).get(created.headers.location).set(auth())).status, 200);
});
test('Un agente no puede crear usuarios ni consultar auditoría', async () => {
  const headers = { Authorization: 'Bearer ' + agentToken };
  assert.equal((await request(app).post('/api/users').set(headers).send({})).status, 403);
  assert.equal((await request(app).get('/api/logs').set(headers)).status, 403);
});
test('Se validan entradas, campos inesperados y JSON inválido con 400', async () => {
  assert.equal((await request(app).post('/api/clients').set(auth()).send({ name: 'A', email: 'bad', segmentId: 1 })).status, 400);
  assert.equal((await request(app).post('/api/clients').set(auth()).send({ name: 'Válido', email: 'valid@test.com', segmentId: 1, invented: true })).status, 400);
  assert.equal((await request(app).post('/api/clients').set(auth()).set('Content-Type', 'application/json').send('{broken')).status, 400);
});
test('No se aceptan contraseñas que bcrypt truncaría en 72 bytes', async () => {
  const r = await request(app).post('/api/users').set(auth()).send({ name: 'Unicode', email: 'unicode@test.com', password: 'é'.repeat(40), role: 'agente' }); assert.equal(r.status, 400);
});
test('Crear cliente retorna 201, Location válida y duplicados se rechazan con 409', async () => {
  const c = await createClient('unique@test.com');
  assert.equal((await request(app).get(`/api/clients/${c.id}`).set(auth())).status, 200);
  const duplicate = await request(app).post('/api/clients').set(auth()).send({ name: 'Duplicado', email: 'UNIQUE@test.com', segmentId: 1 }); assert.equal(duplicate.status, 409);
});
test('Clientes y categorías inexistentes no generan incidencias', async () => {
  const before = repo.incidents.length;
  assert.equal((await request(app).post('/api/incidents').set(auth()).send(incidentData(999999))).status, 404);
  const c = await createClient(); assert.equal((await request(app).post('/api/incidents').set(auth()).send({ ...incidentData(c.id), categoryId: 999 })).status, 404);
  assert.equal(repo.incidents.length, before);
});
test('El ciclo de incidencia afecta el riesgo y detecta actualizaciones concurrentes', async () => {
  const c = await createClient();
  const created = await request(app).post('/api/incidents').set(auth()).send(incidentData(c.id)); assert.equal(created.status, 201);
  const i = created.body.data; const firstRisk = (await request(app).get(`/api/clients/${c.id}/risk`).set(auth())).body.data.risk;
  assert.equal(firstRisk.score, 50);
  const updated = await request(app).patch(`/api/incidents/${i.id}`).set(auth()).send({ status: 'resuelta', expectedVersion: 1 }); assert.equal(updated.status, 200);
  assert.equal(updated.body.data.version, 2); assert.ok(updated.body.data.resolvedAt);
  assert.equal((await request(app).patch(`/api/incidents/${i.id}`).set(auth()).send({ status: 'en_proceso', expectedVersion: 1 })).status, 409);
  assert.equal((await request(app).patch(`/api/incidents/${i.id}`).set(auth()).send({ status: 'abierta', expectedVersion: 2 })).status, 409);
  assert.equal((await request(app).get(`/api/clients/${c.id}/risk`).set(auth())).body.data.risk.score, 40);
});
test('La acción no puede vincularse a la incidencia de otro cliente', async () => {
  const c1 = await createClient(), c2 = await createClient();
  const i = (await request(app).post('/api/incidents').set(auth()).send(incidentData(c1.id))).body.data;
  const r = await request(app).post('/api/retention-actions').set(auth()).send({ clientId: c2.id, incidentId: i.id, assignedUserId: 1, type: 'contacto', description: 'Contactar al cliente y revisar el problema.', dueAt: new Date(Date.now() + 86400000).toISOString() }); assert.equal(r.status, 409);
});
test('Se registra el resultado de una acción y no se sobrescribe al reintentarlo', async () => {
  const c = await createClient(); const r = await request(app).post('/api/retention-actions').set(auth()).send({ clientId: c.id, assignedUserId: 1, type: 'seguimiento', description: 'Confirmar que el problema está resuelto.', dueAt: new Date(Date.now() + 86400000).toISOString() }); assert.equal(r.status, 201);
  const url = `/api/retention-actions/${r.body.data.id}`;
  assert.equal((await request(app).patch(url).set(auth()).send({ outcome: 'recuperado' })).status, 200);
  assert.equal((await request(app).patch(url).set(auth()).send({ outcome: 'recuperado' })).status, 200);
  assert.equal((await request(app).patch(url).set(auth()).send({ outcome: 'sin_respuesta' })).status, 409);
});
test('Los comentarios conservan autor, canal y contenido sin interpretarlo como HTML', async () => {
  const c = await createClient(); const text = '<script>alert(1)</script>';
  const r = await request(app).post(`/api/clients/${c.id}/comments`).set(auth()).send({ text, channel: 'telefono' }); assert.equal(r.status, 201);
  const rows = (await request(app).get(`/api/clients/${c.id}/comments`).set(auth())).body.data;
  assert.equal(rows[0].text, text); assert.equal(rows[0].authorId, 1);
});
test('Archivar preserva el historial y bloquea nuevas incidencias', async () => {
  const c = await createClient(); await request(app).post('/api/incidents').set(auth()).send(incidentData(c.id));
  assert.equal((await request(app).delete(`/api/clients/${c.id}`).set(auth())).status, 204);
  assert.equal((await request(app).get(`/api/clients/${c.id}`).set(auth())).body.data.status, 'inactivo');
  assert.equal((await request(app).post('/api/incidents').set(auth()).send(incidentData(c.id))).status, 409);
  assert.equal((await request(app).get(`/api/incidents?clientId=${c.id}`).set(auth())).body.pagination.total, 1);
});
test('Paginación valida límites y filtros antes de calcular totales', async () => {
  assert.equal((await request(app).get('/api/clients?limit=101').set(auth())).status, 400);
  assert.equal((await request(app).get('/api/clients?page=0').set(auth())).status, 400);
  const r = await request(app).get('/api/clients?search=unique&limit=1').set(auth()); assert.equal(r.body.pagination.total, 1); assert.equal(r.body.data.length, 1);
});
test('Outbox reintenta eventos sin duplicar auditoría', async () => {
  const worker = new OutboxWorker(repo, audit); await worker.flush(); const count = audit.logs.length; await worker.flush(); assert.equal(audit.logs.length, count);
  assert.equal((await repo.pendingEvents()).length, 0);
  assert.ok(audit.logs.some(e => e.eventType === 'incident.created'));
  assert.ok(!JSON.stringify(audit.logs).includes('TestingPassword2026!'));
});
test('Salud y recursos inexistentes usan códigos correctos', async () => {
  assert.equal((await request(app).get('/api/health')).body.data.mode, 'demo');
  assert.equal((await request(app).get('/api/clients/999999').set(auth())).status, 404);
  assert.equal((await request(app).get('/api/clients/abc').set(auth())).status, 400);
});
