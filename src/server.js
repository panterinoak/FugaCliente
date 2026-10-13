import { loadConfig } from './config/env.js';
import { SqlRepository } from './repositories/sql.js';
import { MongoAudit } from './repositories/mongo.js';
import { MemoryRepository, MemoryAudit } from './repositories/memory.js';
import { OutboxWorker } from './services/outbox.js';
import { seedData } from '../scripts/seed-data.js';
import { createApp } from './app.js';

let repository, audit, server, worker;
let stopping = false;
try {
  const config = loadConfig();
  if (config.DB_MODE === 'demo') {
    repository = new MemoryRepository(); audit = new MemoryAudit(); await seedData(repository, config);
  } else {
    repository = await SqlRepository.connect(config); audit = await MongoAudit.connect(config);
  }
  worker = new OutboxWorker(repository, audit, config.OUTBOX_INTERVAL_MS); worker.start();
  server = createApp({ repository, audit, config }).listen(config.PORT, config.HOST, () => {
    console.log(`FugaCliente disponible en http://${config.HOST}:${config.PORT}`);
    console.log(config.DB_MODE === 'demo' ? 'MODO DEMO: datos temporales en memoria. Para la evaluación utiliza SQL Server y MongoDB.' : 'Persistencia SQL Server + MongoDB habilitada.');
  });
  server.on('error', err => { console.error(err.code === 'EADDRINUSE' ? 'El puerto está ocupado. Cambia PORT en .env.' : 'No se pudo iniciar el servidor.'); void shutdown(1); });
} catch (err) {
  console.error(`No se pudo iniciar FugaCliente: ${err.message}`);
  console.error('Revisa .env, inicia las bases de datos y ejecuta npm run db:setup. También puedes usar npm run demo.');
  await shutdown(1);
}

async function shutdown(code = 0) {
  if (stopping) return; stopping = true; worker?.stop();
  const timeout = setTimeout(() => process.exit(code || 1), 15000); timeout.unref();
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  if (worker) { try { await worker.flush(); } catch { /* El outbox SQL se conserva para el siguiente arranque. */ } }
  await Promise.allSettled([repository?.close(), audit?.close()]); clearTimeout(timeout); process.exitCode = code;
}
process.on('SIGINT', () => { void shutdown(); });
process.on('SIGTERM', () => { void shutdown(); });
