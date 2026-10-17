import { Router } from 'express';
import { auth } from '../middlewares/auth.js';
import { systemController } from '../controllers/system.controller.js';
import { authRoutes } from './auth.routes.js';
import { userRoutes } from './user.routes.js';
import { catalogRoutes } from './catalog.routes.js';
import { clientRoutes } from './client.routes.js';
import { incidentRoutes } from './incident.routes.js';
import { retentionRoutes } from './retention.routes.js';
import { analyticsRoutes } from './analytics.routes.js';

/**
 * Router del API REST (Richardson nivel 2): recursos con sustantivos, verbos HTTP y códigos de estado.
 * Las rutas públicas se declaran antes del middleware de autenticación.
 */
export function apiRouter(container) {
  const api = Router();
  const system = systemController(container);

  // Públicas
  api.get('/', system.index);
  api.get('/health', system.health);
  api.get('/openapi.json', system.openapi);
  api.get('/docs', (req, res) => res.redirect(302, '/docs.html'));
  api.use('/auth', authRoutes(container));

  // Privadas: JWT obligatorio
  api.use(auth(container.repository, container.config));
  api.use('/users', userRoutes(container));
  api.use('/clients', clientRoutes(container));
  api.use('/incidents', incidentRoutes(container));
  api.use('/retention-actions', retentionRoutes(container));
  api.use(catalogRoutes(container));
  api.use(analyticsRoutes(container));
  return api;
}
