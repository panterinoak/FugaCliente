import { created, list, ok } from '../utils/http.js';

export const retentionController = ({ retention }) => ({
  list: async (req, res) => list(res, await retention.list(req.validated.query)),
  get: async (req, res) => ok(res, await retention.get(req.validated.params.id)),
  create: async (req, res) => {
    const action = await retention.create(req.validated.body, req.user.id);
    created(res, `/api/retention-actions/${action.id}`, action);
  },
  complete: async (req, res) => ok(res, await retention.complete(req.validated.params.id, req.validated.body.outcome, req.user.id))
});
