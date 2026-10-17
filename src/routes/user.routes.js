import { Router } from 'express';
import { userController } from '../controllers/user.controller.js';
import { roles } from '../middlewares/auth.js';
import { validate } from '../middlewares/validation.js';
import { idParams, userSchema, userUpdateSchema } from '../validators/schemas.js';

export function userRoutes(container) {
  const router = Router();
  const controller = userController(container);
  router.get('/me', controller.me);
  router.get('/', controller.list);
  router.post('/', roles('admin'), validate(userSchema), controller.create);
  router.get('/:id', validate(idParams, 'params'), controller.get);
  router.patch('/:id', roles('admin'), validate(idParams, 'params'), validate(userUpdateSchema), controller.update);
  return router;
}
