import { loadConfig } from '../src/config/env.js';
import { SqlRepository } from '../src/repositories/sql.js';
import { MongoAudit } from '../src/repositories/mongo.js';
let repository, audit;
try {
  const config = loadConfig(); console.log(`Node ${process.version}; modo ${config.DB_MODE}.`);
  if (config.DB_MODE === 'demo') { console.log('La demo usa memoria. Para comprobar la rúbrica utiliza DB_MODE=sqlmongo.'); }
  else {
    repository = await SqlRepository.connect(config); console.log('SQL Server conectado:', await repository.health());
    const result = await repository.query("SELECT name FROM sys.procedures WHERE name IN ('sp_RegisterIncident','sp_UpdateIncidentStatus','sp_CreateRetentionAction','sp_CompleteRetentionAction')");
    if (result.recordset.length !== 4) throw new Error('Faltan procedimientos. Ejecuta npm run db:setup.');
    audit = await MongoAudit.connect(config); console.log('MongoDB conectado:', await audit.health());
    console.log('Diagnóstico correcto. Ejecuta npm run dev y abre http://localhost:' + config.PORT);
  }
} catch (err) { console.error('Diagnóstico:', err.message); process.exitCode = 1; }
finally { await Promise.allSettled([repository?.close(), audit?.close()]); }
