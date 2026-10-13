import { Router } from 'express';
import { z } from 'zod';
import { validate, idParams, incidentSchema, incidentUpdateSchema, listSchema } from '../middlewares/validation.js';
import { paginate } from '../services/customers.js';
import { missing } from '../utils/errors.js';

export function incidentRoutes(repository) {
  const router = Router();
  router.get('/', validate(listSchema.extend({ status: z.enum(['abierta', 'en_proceso', 'resuelta']).optional() }), 'query'), async (req, res) => {
    const q = req.validated.query; let rows = await repository.listIncidents(q);
    if (q.status) rows = rows.filter(i => i.status === q.status);
    if (q.search) { const s = q.search.toLowerCase(); rows = rows.filter(i => `${i.description} ${i.clientName}`.toLowerCase().includes(s)); }
    res.json(paginate(rows, q));
  });
  router.post('/', validate(incidentSchema), async (req, res) => {
    const data = await repository.createIncident(req.validated.body, req.user.id); res.location(`/api/incidents/${data.id}`).status(201).json({ data });
  });
  router.get('/:id', validate(idParams, 'params'), async (req, res) => {
    const data = await repository.getIncident(req.validated.params.id); if (!data) throw missing('Incidencia'); res.json({ data });
  });
  router.patch('/:id', validate(idParams, 'params'), validate(incidentUpdateSchema), async (req, res) => {
    res.json({ data: await repository.updateIncident(req.validated.params.id, req.validated.body, req.user.id) });
  });
  return router;
}
