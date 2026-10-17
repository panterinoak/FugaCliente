import { Router } from 'express';
import { retentionController } from '../controllers/retention.controller.js';
import { validate } from '../middlewares/validation.js';
import { actionListSchema, actionSchema, actionUpdateSchema, idParams } from '../validators/schemas.js';

export function retentionRoutes(container) {
  const router = Router();
  const controller = retentionController(container);
  router.get('/', validate(actionListSchema, 'query'), controller.list);
  router.post('/', validate(actionSchema), controller.create);
  router.get('/:id', validate(idParams, 'params'), controller.get);
  router.patch('/:id', validate(idParams, 'params'), validate(actionUpdateSchema), controller.complete);
  return router;
}
