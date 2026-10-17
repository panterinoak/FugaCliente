/**
 * Punto de entrada: carga la configuración, conecta los repositorios, inicia el worker del outbox
 * y el servidor HTTP. Gestiona un apagado ordenado ante SIGINT/SIGTERM.
 */
import { loadConfig } from './config/env.js';
import { SqlRepository } from './repositories/sql.js';
import { MongoAudit } from './repositories/mongo.js';
import { MemoryRepository, MemoryAudit } from './repositories/memory.js';
import { OutboxWorker } from './services/outbox.js';
import { seedData } from '../scripts/seed-data.js';
import { createApp } from './app.js';

let repository;
let audit;
let server;
let worker;
let stopping = false;

async function connect(config) {
  if (config.DB_MODE === 'demo') {
    const memory = { repository: new MemoryRepository(), audit: new MemoryAudit() };
    await seedData(memory.repository, config, memory.audit);
    return memory;
  }
  return { repository: await SqlRepository.connect(config), audit: await MongoAudit.connect(config) };
}

async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  worker?.stop();
  const timeout = setTimeout(() => process.exit(code || 1), 15_000);
  timeout.unref();
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  if (worker) {
    try {
      await worker.flush();
    } catch {
      /* El outbox SQL se conserva para el siguiente arranque. */
    }
  }
  await Promise.allSettled([repository?.close(), audit?.close()]);
  clearTimeout(timeout);
  process.exitCode = code;
}

try {
  const config = loadConfig();
  ({ repository, audit } = await connect(config));
  worker = new OutboxWorker(repository, audit, config.OUTBOX_INTERVAL_MS);
  worker.start();
  server = createApp({ repository, audit, config }).listen(config.PORT, config.HOST, () => {
    console.log(`FugaCliente disponible en http://${config.HOST}:${config.PORT}`);
    console.log(`Documentación del API: http://${config.HOST}:${config.PORT}/api/docs`);
    console.log(config.DB_MODE === 'demo'
      ? 'MODO DEMO: datos temporales en memoria. Para la evaluación utiliza SQL Server y MongoDB.'
      : 'Persistencia SQL Server + MongoDB habilitada.');
  });
  server.on('error', err => {
    console.error(err.code === 'EADDRINUSE' ? 'El puerto está ocupado. Cambia PORT en .env.' : 'No se pudo iniciar el servidor.');
    void shutdown(1);
  });
} catch (err) {
  console.error(`No se pudo iniciar FugaCliente: ${err.message}`);
  console.error('Revisa .env, inicia las bases de datos y ejecuta npm run db:setup. También puedes usar npm run demo.');
  await shutdown(1);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
