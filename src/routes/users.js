import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { roles, publicUser } from '../middlewares/auth.js';
import { validate, userSchema, idParams } from '../middlewares/validation.js';
import { missing } from '../utils/errors.js';

export function userRoutes(repository) {
  const router = Router();
  router.get('/me', (req, res) => res.json({ data: publicUser(req.user) }));
  router.get('/', async (req, res) => res.json({ data: (await repository.listUsers()).map(publicUser) }));
  router.get('/:id', validate(idParams, 'params'), async (req, res) => {
    const user = await repository.getUser(req.validated.params.id); if (!user) throw missing('Usuario'); res.json({ data: publicUser(user) });
  });
  router.post('/', roles('admin'), validate(userSchema), async (req, res) => {
    const { password, ...input } = req.validated.body;
    const data = publicUser(await repository.createUser({ ...input, passwordHash: await bcrypt.hash(password, 12) }, req.user.id));
    res.location(`/api/users/${data.id}`).status(201).json({ data });
  });
  return router;
}
