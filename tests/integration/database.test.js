import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../../src/config/env.js';
import { SqlRepository } from '../../src/repositories/sql.js';
import { MongoAudit } from '../../src/repositories/mongo.js';
import { OutboxWorker } from '../../src/services/outbox.js';
import { ensureAdmin } from '../../scripts/seed-data.js';

// Ejecutar explícitamente contra bases de prueba ya preparadas; nunca elimina bases.
test('SQL Server y MongoDB confirman incidencia, integridad y outbox', { skip: process.env.RUN_DB_INTEGRATION !== '1' }, async () => {
  const config = loadConfig();
  assert.ok(config.SQL_DATABASE.toLowerCase().endsWith('_test'), 'SQL_DATABASE debe terminar en _test.');
  assert.ok(config.MONGO_DATABASE.toLowerCase().endsWith('_test'), 'MONGO_DATABASE debe terminar en _test.');
  let repo, audit;
  try {
    repo = await SqlRepository.connect(config); audit = await MongoAudit.connect(config);
    const admin = await ensureAdmin(repo, config), catalogs = await repo.catalogs();
    const client = await repo.createClient({ name: 'Integración verificable', email: `integration-${crypto.randomUUID()}@example.com`, phone: null, segmentId: catalogs.segments[0].id, status: 'activo' }, admin.id);
    const incident = await repo.createIncident({ clientId: client.id, serviceId: catalogs.services[0].id, categoryId: catalogs.categories[0].id, severity: 3, satisfaction: 1, assignedUserId: admin.id, description: 'Caso de integración con bases de datos reales.' }, admin.id);
    assert.equal(incident.status, 'abierta');
    const bad = { clientId: client.id, serviceId: catalogs.services[0].id, categoryId: 2147483647, severity: 1, satisfaction: null, assignedUserId: null, description: 'Este registro debe ser rechazado sin dejar cambios.' };
    await assert.rejects(repo.createIncident(bad, admin.id)); assert.equal((await repo.listIncidents({ clientId: client.id })).length, 1);
    const updated = await repo.updateIncident(incident.id, { status: 'resuelta', expectedVersion: 1 }, admin.id); assert.equal(updated.version, 2);
    await assert.rejects(repo.updateIncident(incident.id, { status: 'en_proceso', expectedVersion: 1 }, admin.id));
    const worker = new OutboxWorker(repo, audit); await worker.flush();
    const events = await audit.list({ clientId: client.id, limit: 100 }); assert.ok(events.data.some(e => e.eventType === 'incident.created'));
    const count = events.pagination.total; await worker.flush(); assert.equal((await audit.list({ clientId: client.id, limit: 100 })).pagination.total, count);
    const comment = await audit.addComment(client.id, { text: 'Nota de integración', channel: 'interno' }, admin); assert.ok(comment.id);
    assert.equal((await audit.listComments(client.id)).pagination.total, 1);
  } finally { await Promise.allSettled([repo?.close(), audit?.close()]); }
});
