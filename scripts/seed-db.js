/** Carga datos ficticios en SQL Server y MongoDB (idempotente). */
import { loadConfig } from '../src/config/env.js';
import { SqlRepository } from '../src/repositories/sql.js';
import { MongoAudit } from '../src/repositories/mongo.js';
import { OutboxWorker } from '../src/services/outbox.js';
import { seedData } from './seed-data.js';

let repository;
let audit;
try {
  const config = loadConfig();
  if (config.DB_MODE !== 'sqlmongo') throw new Error('Usa DB_MODE=sqlmongo.');
  repository = await SqlRepository.connect(config);
  audit = await MongoAudit.connect(config);
  await seedData(repository, config, audit);
  const delivered = await new OutboxWorker(repository, audit).flush();
  console.log(`Datos ficticios cargados (${delivered} eventos enviados a MongoDB). La carga se omite si ya existe el cliente de demostración.`);
  console.log('Usuarios de equipo: carla.analista@fugacliente.local y jorge.agente@fugacliente.local (contraseña = ADMIN_PASSWORD).');
} catch (err) {
  console.error(`Error al cargar datos: ${err.message}`);
  process.exitCode = 1;
} finally {
  await Promise.allSettled([repository?.close(), audit?.close()]);
}
