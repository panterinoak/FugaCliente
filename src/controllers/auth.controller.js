import { ok } from '../utils/http.js';

export const authController = ({ auth }) => ({
  /** POST /auth/login → JWT de corta duración. */
  login: async (req, res) => {
    const { email, password } = req.validated.body;
    ok(res, await auth.login(email, password));
  }
});
