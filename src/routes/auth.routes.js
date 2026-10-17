import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { loginLimiter } from '../middlewares/security.js';
import { validate } from '../middlewares/validation.js';
import { loginSchema } from '../validators/schemas.js';

export function authRoutes(container) {
  const router = Router();
  const controller = authController(container);
  router.post('/login', loginLimiter(), validate(loginSchema), controller.login);
  return router;
}
