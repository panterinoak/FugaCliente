import { readFile } from 'node:fs/promises';
import sql from 'mssql';
import { loadConfig, sqlConfig } from '../src/config/env.js';
import { SqlRepository } from '../src/repositories/sql.js';
import { MongoAudit } from '../src/repositories/mongo.js';
import { ensureAdmin } from './seed-data.js';

let pool, repository, audit;
try {
  const config = loadConfig();
  if (config.DB_MODE !== 'sqlmongo') throw new Error('db:setup requiere DB_MODE=sqlmongo.');
  pool = await new sql.ConnectionPool(sqlConfig(config, 'master')).connect();
  let script = await readFile(new URL('../database/schema.sql', import.meta.url), 'utf8');
  script = script.replaceAll('[FugaCliente]', `[${config.SQL_DATABASE}]`).replaceAll("N'FugaCliente'", `N'${config.SQL_DATABASE}'`);
  const batches = script.split(/^\s*GO\s*$/im).filter(b => b.trim());
  await pool.request().batch(batches[0]);
  await pool.close();
  // La base se fija en la conexión. No dependemos de que USE persista entre
  // peticiones que el pool puede entregar a conexiones distintas.
  pool = await new sql.ConnectionPool(sqlConfig(config)).connect();
  for (const batch of batches.slice(1)) await pool.request().batch(batch);
  await pool.close(); pool = null;
  repository = await SqlRepository.connect(config); await ensureAdmin(repository, config); audit = await MongoAudit.connect(config);
  console.log('Esquema SQL, procedimientos, administrador y colecciones MongoDB preparados.');
  console.log(`Administrador: ${config.ADMIN_EMAIL}. La contraseña es ADMIN_PASSWORD de .env.`);
  console.log('Para cargar datos ficticios: npm run db:seed');
} catch (err) { console.error(`No se pudo preparar la base de datos: ${err.message}`); process.exitCode = 1; }
finally { await Promise.allSettled([pool?.close(), repository?.close(), audit?.close()]); }
