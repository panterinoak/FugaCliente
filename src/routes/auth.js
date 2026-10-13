import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { rateLimit } from 'express-rate-limit';
import { validate, loginSchema } from '../middlewares/validation.js';
import { publicUser } from '../middlewares/auth.js';
import { AppError } from '../utils/errors.js';

export function authRoutes(repository, config) {
  const router = Router();
  router.post('/login', rateLimit({ windowMs: 15 * 60000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: { code: 'RATE_LIMIT', message: 'Demasiados intentos. Vuelve a intentarlo en 15 minutos.' } } }), validate(loginSchema), async (req, res) => {
    const { email, password } = req.validated.body;
    const user = await repository.findUserByEmail(email);
    // Hash válido de comparación para que un correo inexistente también haga trabajo bcrypt.
    const fallback = '$2b$12$OHtrDfL.4nfS1in.KHaomODxYsdZNO3/kopbOcMHfc3Bs9DnYfCbO';
    const matches = await bcrypt.compare(password, user?.passwordHash || fallback);
    if (!user || !user.active || !matches) throw new AppError(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.');
    const token = jwt.sign({}, config.JWT_SECRET, { subject: String(user.id), expiresIn: config.JWT_EXPIRES_IN, algorithm: 'HS256', issuer: 'fugacliente', audience: 'fugacliente-api' });
    res.setHeader('Cache-Control', 'no-store'); res.json({ data: { token, user: publicUser(user), expiresIn: config.JWT_EXPIRES_IN } });
  });
  return router;
}
