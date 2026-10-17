import { publicUser } from '../middlewares/auth.js';
import { created, ok } from '../utils/http.js';

export const userController = ({ users }) => ({
  me: (req, res) => ok(res, publicUser(req.user)),
  list: async (req, res) => ok(res, await users.list()),
  get: async (req, res) => ok(res, await users.get(req.validated.params.id)),
  create: async (req, res) => {
    const user = await users.create(req.validated.body, req.user.id);
    created(res, `/api/users/${user.id}`, user);
  },
  update: async (req, res) => ok(res, await users.update(req.validated.params.id, req.validated.body, req.user))
});
