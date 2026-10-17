import { Router } from 'express';
import { catalogController } from '../controllers/catalog.controller.js';
import { roles } from '../middlewares/auth.js';
import { validate } from '../middlewares/validation.js';
import { idParams, serviceSchema, serviceUpdateSchema } from '../validators/schemas.js';

export function catalogRoutes(container) {
  const router = Router();
  const controller = catalogController(container);
  router.get('/catalogs', controller.catalogs);
  router.get('/services', controller.listServices);
  router.post('/services', roles('admin'), validate(serviceSchema), controller.createService);
  router.get('/services/:id', validate(idParams, 'params'), controller.getService);
  router.patch('/services/:id', roles('admin'), validate(idParams, 'params'), validate(serviceUpdateSchema), controller.updateService);
  return router;
}
