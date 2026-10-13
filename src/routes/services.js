import { Router } from 'express';
import { roles } from '../middlewares/auth.js';
import { validate, serviceSchema } from '../middlewares/validation.js';

export function serviceRoutes(repository) {
  const router = Router();
  router.get('/', async (req, res) => res.json({ data: await repository.listServices() }));
  router.post('/', roles('admin'), validate(serviceSchema), async (req, res) => {
    const data = await repository.createService(req.validated.body, req.user.id); res.location('/api/services').status(201).json({ data });
  });
  return router;
}
