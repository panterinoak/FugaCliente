import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRepository, MemoryAudit } from '../src/repositories/memory.js';
import { OutboxWorker } from '../src/services/outbox.js';

test('Una caída de MongoDB deja el evento pendiente para el próximo intento', async () => {
  const repo = new MemoryRepository(), audit = new MemoryAudit(); repo.event('test.event', 'client', 1, null, {});
  const failed = new OutboxWorker(repo, { write: async () => { throw new Error('offline'); } });
  await assert.rejects(failed.flush()); assert.equal((await repo.pendingEvents()).length, 1);
  const worker = new OutboxWorker(repo, audit); await worker.flush(); assert.equal((await repo.pendingEvents()).length, 0); assert.equal(audit.logs.length, 1);
});
test('Un fallo tras escribir en MongoDB no duplica el evento en el reintento', async () => {
  const repo = new MemoryRepository(), audit = new MemoryAudit(); repo.event('test.event', 'client', 1, null, {});
  const mark = repo.markEvent.bind(repo); repo.markEvent = async () => { throw new Error('SQL offline'); };
  const worker = new OutboxWorker(repo, audit); await assert.rejects(worker.flush()); assert.equal(audit.logs.length, 1);
  repo.markEvent = mark; await worker.flush(); assert.equal(audit.logs.length, 1); assert.equal((await repo.pendingEvents()).length, 0);
});
