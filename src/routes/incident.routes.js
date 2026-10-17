import { Router } from 'express';
import { incidentController } from '../controllers/incident.controller.js';
import { validate } from '../middlewares/validation.js';
import { idParams, incidentListSchema, incidentSchema, incidentUpdateSchema } from '../validators/schemas.js';

export function incidentRoutes(container) {
  const router = Router();
  const controller = incidentController(container);
  router.get('/', validate(incidentListSchema, 'query'), controller.list);
  router.post('/', validate(incidentSchema), controller.create);
  router.get('/:id', validate(idParams, 'params'), controller.get);
  router.patch('/:id', validate(idParams, 'params'), validate(incidentUpdateSchema), controller.updateStatus);
  return router;
}
