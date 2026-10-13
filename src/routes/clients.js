import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { roles } from '../middlewares/auth.js';
import { validate, clientSchema, clientUpdateSchema, commentSchema, idParams, listSchema } from '../middlewares/validation.js';
import { missing } from '../utils/errors.js';

export function clientRoutes(repository, audit, service) {
  const router = Router();
  const clientList = listSchema.extend({ status: z.enum(['activo', 'inactivo']).optional() });
  router.get('/', validate(clientList, 'query'), async (req, res) => res.json(await service.list(req.validated.query)));
  router.post('/', validate(clientSchema), async (req, res) => {
    const data = await repository.createClient(req.validated.body, req.user.id);
    res.location(`/api/clients/${data.id}`).status(201).json({ data });
  });
  router.get('/:id', validate(idParams, 'params'), async (req, res) => {
    const data = await repository.getClient(req.validated.params.id); if (!data) throw missing('Cliente'); res.json({ data });
  });
  router.patch('/:id', roles('admin', 'analista'), validate(idParams, 'params'), validate(clientUpdateSchema), async (req, res) => {
    res.json({ data: await repository.updateClient(req.validated.params.id, req.validated.body, req.user.id) });
  });
  router.delete('/:id', roles('admin'), validate(idParams, 'params'), async (req, res) => {
    await repository.updateClient(req.validated.params.id, { status: 'inactivo' }, req.user.id); res.status(204).end();
  });
  router.get('/:id/risk', validate(idParams, 'params'), async (req, res) => res.json({ data: await service.risk(req.validated.params.id) }));
  router.get('/:id/comments', validate(idParams, 'params'), validate(listSchema, 'query'), async (req, res) => {
    const id = req.validated.params.id; if (!await repository.getClient(id)) throw missing('Cliente');
    res.json(await audit.listComments(id, req.validated.query));
  });
  router.post('/:id/comments', validate(idParams, 'params'), validate(commentSchema), async (req, res) => {
    const id = req.validated.params.id; if (!await repository.getClient(id)) throw missing('Cliente');
    const data = await audit.addComment(id, req.validated.body, req.user);
    // El comentario ya está confirmado. Un fallo del log no transforma su creación en un error.
    void audit.write({ eventId: randomUUID(), eventType: 'comment.created', entity: 'client', entityId: id,
      actorId: req.user.id, occurredAt: new Date(), payload: { commentId: data.id, channel: data.channel } }).catch(() => console.error('No se pudo registrar el evento del comentario.'));
    res.location(`/api/clients/${id}/comments`).status(201).json({ data });
  });
  return router;
}
