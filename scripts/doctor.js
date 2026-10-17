/** Diagnóstico de conexión: verifica SQL Server (procedimientos y vistas) y MongoDB. */
import { loadConfig } from '../src/config/env.js';
import { SqlRepository } from '../src/repositories/sql.js';
import { MongoAudit } from '../src/repositories/mongo.js';

const PROCEDURES = ['sp_QueueEvent', 'sp_RegisterIncident', 'sp_UpdateIncidentStatus', 'sp_CreateRetentionAction', 'sp_CompleteRetentionAction'];
const VIEWS = ['vw_IncidentDetail', 'vw_RetentionActionDetail', 'vw_ClientIncidentSummary'];
const inList = names => names.map(n => `'${n}'`).join(',');

let repository;
let audit;
try {
  const config = loadConfig();
  console.log(`Node ${process.version}; modo ${config.DB_MODE}.`);
  if (config.DB_MODE === 'demo') {
    console.log('La demo usa memoria. Para comprobar la rúbrica utiliza DB_MODE=sqlmongo.');
  } else {
    repository = await SqlRepository.connect(config);
    console.log('SQL Server conectado:', await repository.health());
    const procedures = await repository.query(`SELECT name FROM sys.procedures WHERE name IN (${inList(PROCEDURES)})`);
    if (procedures.recordset.length !== PROCEDURES.length) throw new Error('Faltan procedimientos. Ejecuta npm run db:setup.');
    const views = await repository.query(`SELECT name FROM sys.views WHERE name IN (${inList(VIEWS)})`);
    if (views.recordset.length !== VIEWS.length) throw new Error('Faltan vistas. Ejecuta npm run db:setup para actualizar el esquema.');
    console.log(`Procedimientos (${PROCEDURES.length}) y vistas (${VIEWS.length}) verificados.`);
    audit = await MongoAudit.connect(config);
    console.log('MongoDB conectado:', await audit.health());
    console.log(`Diagnóstico correcto. Ejecuta npm run dev y abre http://localhost:${config.PORT}`);
  }
} catch (err) {
  console.error('Diagnóstico:', err.message);
  process.exitCode = 1;
} finally {
  await Promise.allSettled([repository?.close(), audit?.close()]);
}
