import express, { Router } from 'express';
import { fileURLToPath } from 'node:url';
import { createContainer } from './container.js';
import { apiRouter } from './routes/index.js';
import { requestLogger } from './middlewares/logging.js';
import { apiLimiter, noStore, securityHeaders } from './middlewares/security.js';
import { errorHandler, missing } from './utils/errors.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));

/**
 * Fábrica de la aplicación Express. No abre puertos ni conexiones: recibe los repositorios ya
 * creados, lo que permite probarla con supertest y repositorios en memoria.
 */
/** Reutiliza el router en /api sin volver a procesar las peticiones que ya pertenecen a /api/v1. */
function legacyAlias(api) {
  const router = Router();
  router.use((req, res, next) => (/^\/v1(\/|$)/.test(req.path) ? next('router') : next()));
  router.use(api);
  return router;
}

export function createApp({ repository, audit, config, quiet = false }) {
  const app = express();
  const container = createContainer({ repository, audit, config });
  const api = apiRouter(container);

  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY ?? false);
  app.use(securityHeaders());
  app.use(requestLogger(audit, { quiet }));
  app.use(express.json({ limit: '64kb' }));

  app.use('/api', noStore, apiLimiter());
  app.use('/api/v1', api); // ruta versionada recomendada
  app.use('/api', legacyAlias(api)); // alias compatible con la versión 1 de la entrega

  app.use(express.static(PUBLIC_DIR, { index: 'index.html', maxAge: config.NODE_ENV === 'production' ? '1h' : 0 }));
  app.use((req, res, next) => next(missing('Ruta')));
  app.use(errorHandler);
  return app;
}
