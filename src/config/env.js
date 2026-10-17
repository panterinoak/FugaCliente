import 'dotenv/config';
import { z } from 'zod';

const boolean = z.enum(['true', 'false']).transform(v => v === 'true');
export function loadConfig(input = process.env) {
  const schema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('127.0.0.1'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DB_MODE: z.enum(['sqlmongo', 'demo']).default('sqlmongo'),
    JWT_SECRET: z.string().min(32),
    JWT_EXPIRES_IN: z.enum(['15m', '30m', '1h', '2h', '8h']).default('2h'),
    SQL_HOST: z.string().default('localhost'),
    SQL_PORT: z.coerce.number().int().min(1).max(65535).default(1433),
    SQL_DATABASE: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/).default('FugaCliente'),
    SQL_USER: z.string().default('sa'),
    SQL_PASSWORD: z.string().default(''),
    SQL_ENCRYPT: boolean.default('false'),
    SQL_TRUST_CERT: boolean.default('true'),
    MONGO_URI: z.string().default('mongodb://localhost:27017'),
    MONGO_DATABASE: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/).default('fugacliente'),
    ADMIN_NAME: z.string().min(2).default('Administrador'),
    ADMIN_EMAIL: z.string().email().default('admin@fugacliente.local'),
    ADMIN_PASSWORD: z.string().min(12).max(72).refine(v => Buffer.byteLength(v, 'utf8') <= 72, 'Máximo 72 bytes UTF-8.').default('FugaCliente2026!'),
    OUTBOX_INTERVAL_MS: z.coerce.number().int().min(500).default(3000),
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
    LOG_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(90)
  });
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new Error('Revisa .env: ' + parsed.error.issues.map(x => `${x.path.join('.')}: ${x.message}`).join('; '));
  }
  const cfg = parsed.data;
  if (cfg.DB_MODE === 'sqlmongo' && !cfg.SQL_PASSWORD) throw new Error('Configura SQL_PASSWORD en .env.');
  if (cfg.NODE_ENV === 'production' && (cfg.DB_MODE === 'demo' || cfg.JWT_SECRET.startsWith('CAMBIAR_'))) {
    throw new Error('Producción requiere SQL/MongoDB y un JWT_SECRET propio.');
  }
  return cfg;
}

export function sqlConfig(cfg, database = cfg.SQL_DATABASE) {
  return {
    server: cfg.SQL_HOST, port: cfg.SQL_PORT, database,
    user: cfg.SQL_USER, password: cfg.SQL_PASSWORD,
    options: { encrypt: cfg.SQL_ENCRYPT, trustServerCertificate: cfg.SQL_TRUST_CERT, useUTC: true },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
    connectionTimeout: 15000, requestTimeout: 15000
  };
}
