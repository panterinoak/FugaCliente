import { Router } from 'express';
import { z } from 'zod';
import { validate, idParams, actionSchema, actionUpdateSchema, listSchema } from '../middlewares/validation.js';
import { paginate } from '../services/customers.js';
import { missing } from '../utils/errors.js';

export function retentionRoutes(repository) {
  const router = Router();
  router.get('/', validate(listSchema.extend({ status: z.enum(['pendiente', 'completada']).optional() }), 'query'), async (req, res) => {
    const q = req.validated.query; let rows = await repository.listActions(q);
    if (q.status) rows = rows.filter(a => a.status === q.status);
    if (q.search) { const s = q.search.toLowerCase(); rows = rows.filter(a => `${a.description} ${a.clientName}`.toLowerCase().includes(s)); }
    res.json(paginate(rows, q));
  });
  router.post('/', validate(actionSchema), async (req, res) => {
    const data = await repository.createAction(req.validated.body, req.user.id); res.location(`/api/retention-actions/${data.id}`).status(201).json({ data });
  });
  router.get('/:id', validate(idParams, 'params'), async (req, res) => {
    const data = await repository.getAction(req.validated.params.id); if (!data) throw missing('Acción'); res.json({ data });
  });
  router.patch('/:id', validate(idParams, 'params'), validate(actionUpdateSchema), async (req, res) => {
    res.json({ data: await repository.completeAction(req.validated.params.id, req.validated.body.outcome, req.user.id) });
  });
  return router;
}
