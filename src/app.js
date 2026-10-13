import express, { Router } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { fileURLToPath } from 'node:url';
import { auth, roles } from './middlewares/auth.js';
import { requestLogger } from './middlewares/logging.js';
import { validate, listSchema } from './middlewares/validation.js';
import { errorHandler, missing } from './utils/errors.js';
import { CustomerService, paginate } from './services/customers.js';
import { authRoutes } from './routes/auth.js';
import { userRoutes } from './routes/users.js';
import { clientRoutes } from './routes/clients.js';
import { incidentRoutes } from './routes/incidents.js';
import { retentionRoutes } from './routes/retention.js';
import { serviceRoutes } from './routes/services.js';

export function createApp({ repository, audit, config, quiet = false }) {
  const app = express(); const api = Router(); const customers = new CustomerService(repository);
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: { 'upgrade-insecure-requests': null } } }));
  app.use(requestLogger(audit, { quiet }));
  app.use(express.json({ limit: '64kb' }));
  app.use('/api', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  app.use('/api', rateLimit({ windowMs: 60000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: { code: 'RATE_LIMIT', message: 'Demasiadas solicitudes. Inténtalo en un minuto.' } } }));
  api.get('/', (req, res) => res.json({ data: { name: 'FugaCliente', version: '1.0.0', mode: config.DB_MODE, docs: '/api/openapi.json' } }));
  api.get('/health', async (req, res) => {
    const [sql, mongo] = await Promise.allSettled([repository.health(), audit.health()]);
    const healthy = sql.status === 'fulfilled' && mongo.status === 'fulfilled';
    res.status(healthy ? 200 : 503).json({ data: { status: healthy ? 'ok' : 'degraded', mode: config.DB_MODE,
      sql: sql.status === 'fulfilled' ? sql.value.sql : 'error', mongo: mongo.status === 'fulfilled' ? mongo.value.mongo : 'error',
      outboxPending: sql.status === 'fulfilled' ? sql.value.outboxPending : null } });
  });
  api.get('/openapi.json', (req, res) => res.sendFile(fileURLToPath(new URL('../docs/openapi.json', import.meta.url))));
  api.use('/auth', authRoutes(repository, config));
  api.use(auth(repository, config));
  api.use('/users', userRoutes(repository));
  api.use('/clients', clientRoutes(repository, audit, customers));
  api.use('/incidents', incidentRoutes(repository));
  api.use('/retention-actions', retentionRoutes(repository));
  api.use('/services', serviceRoutes(repository));
  api.get('/catalogs', async (req, res) => res.json({ data: await repository.catalogs() }));
  api.get('/dashboard', async (req, res) => res.json({ data: await customers.dashboard() }));
  api.get('/alerts', validate(listSchema, 'query'), async (req, res) => {
    const q = req.validated.query; let rows = (await customers.snapshot()).filter(c => c.status === 'activo' && c.risk.level !== 'bajo');
    if (q.level) rows = rows.filter(c => c.risk.level === q.level);
    if (q.search) { const s = q.search.toLowerCase(); rows = rows.filter(c => `${c.name} ${c.email}`.toLowerCase().includes(s)); }
    rows.sort((a, b) => b.risk.score - a.risk.score || a.id - b.id); res.json(paginate(rows, q));
  });
  api.get('/logs', roles('admin', 'analista'), validate(listSchema, 'query'), async (req, res) => res.json(await audit.list(req.validated.query)));
  app.use('/api', api);
  app.use(express.static(fileURLToPath(new URL('../public', import.meta.url)), { index: 'index.html' }));
  app.use((req, res, next) => next(missing('Ruta')));
  app.use(errorHandler);
  return app;
}
