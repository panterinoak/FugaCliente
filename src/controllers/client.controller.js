import { created, list, noContent, ok } from '../utils/http.js';

export const clientController = ({ clients }) => ({
  list: async (req, res) => list(res, await clients.list(req.validated.query)),
  get: async (req, res) => ok(res, await clients.get(req.validated.params.id)),
  create: async (req, res) => {
    const client = await clients.create(req.validated.body, req.user.id);
    created(res, `/api/clients/${client.id}`, client);
  },
  update: async (req, res) => ok(res, await clients.update(req.validated.params.id, req.validated.body, req.user.id)),
  archive: async (req, res) => {
    await clients.archive(req.validated.params.id, req.user.id);
    noContent(res);
  },
  risk: async (req, res) => ok(res, await clients.risk(req.validated.params.id)),
  comments: async (req, res) => list(res, await clients.comments(req.validated.params.id, req.validated.query)),
  addComment: async (req, res) => {
    const id = req.validated.params.id;
    created(res, `/api/clients/${id}/comments`, await clients.addComment(id, req.validated.body, req.user));
  }
});
