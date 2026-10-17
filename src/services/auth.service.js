import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { JWT_OPTIONS, publicUser } from '../middlewares/auth.js';
import { unauthorized } from '../utils/errors.js';

// Hash válido de comparación: un correo inexistente también realiza trabajo bcrypt
// y el tiempo de respuesta no revela qué cuentas existen.
const TIMING_FALLBACK_HASH = '$2b$12$OHtrDfL.4nfS1in.KHaomODxYsdZNO3/kopbOcMHfc3Bs9DnYfCbO';

export class AuthService {
  constructor(repository, config) {
    this.repository = repository;
    this.config = config;
  }

  async login(email, password) {
    const user = await this.repository.findUserByEmail(email);
    const matches = await bcrypt.compare(password, user?.passwordHash || TIMING_FALLBACK_HASH);
    if (!user || !user.active || !matches) throw unauthorized('INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.');
    const token = jwt.sign({ role: user.role }, this.config.JWT_SECRET, {
      ...JWT_OPTIONS, subject: String(user.id), expiresIn: this.config.JWT_EXPIRES_IN
    });
    return { token, user: publicUser(user), expiresIn: this.config.JWT_EXPIRES_IN };
  }
}
