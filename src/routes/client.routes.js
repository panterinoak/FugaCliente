import { Router } from 'express';
import { clientController } from '../controllers/client.controller.js';
import { roles } from '../middlewares/auth.js';
import { validate } from '../middlewares/validation.js';
import { clientListSchema, clientSchema, clientUpdateSchema, commentSchema, idParams, listSchema } from '../validators/schemas.js';

export function clientRoutes(container) {
  const router = Router();
  const controller = clientController(container);
  const byId = validate(idParams, 'params');
  router.get('/', validate(clientListSchema, 'query'), controller.list);
  router.post('/', validate(clientSchema), controller.create);
  router.get('/:id', byId, controller.get);
  router.patch('/:id', roles('admin', 'analista'), byId, validate(clientUpdateSchema), controller.update);
  router.delete('/:id', roles('admin'), byId, controller.archive);
  router.get('/:id/risk', byId, controller.risk);
  router.get('/:id/comments', byId, validate(listSchema, 'query'), controller.comments);
  router.post('/:id/comments', byId, validate(commentSchema), controller.addComment);
  return router;
}
