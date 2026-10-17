import { created, ok } from '../utils/http.js';

export const catalogController = ({ catalogs }) => ({
  catalogs: async (req, res) => ok(res, await catalogs.catalogs()),
  listServices: async (req, res) => ok(res, await catalogs.listServices()),
  getService: async (req, res) => ok(res, await catalogs.getService(req.validated.params.id)),
  createService: async (req, res) => {
    const service = await catalogs.createService(req.validated.body, req.user.id);
    created(res, `/api/services/${service.id}`, service);
  },
  updateService: async (req, res) => ok(res, await catalogs.updateService(req.validated.params.id, req.validated.body, req.user.id))
});
