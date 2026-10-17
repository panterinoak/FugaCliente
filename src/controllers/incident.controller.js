import { created, list, ok } from '../utils/http.js';

export const incidentController = ({ incidents }) => ({
  list: async (req, res) => list(res, await incidents.list(req.validated.query)),
  get: async (req, res) => ok(res, await incidents.get(req.validated.params.id)),
  create: async (req, res) => {
    const incident = await incidents.create(req.validated.body, req.user.id);
    created(res, `/api/incidents/${incident.id}`, incident);
  },
  updateStatus: async (req, res) => ok(res, await incidents.updateStatus(req.validated.params.id, req.validated.body, req.user.id))
});
