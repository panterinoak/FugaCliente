import jwt from 'jsonwebtoken';
import { forbidden, unauthorized } from '../utils/errors.js';

export const JWT_OPTIONS = Object.freeze({ algorithm: 'HS256', issuer: 'fugacliente', audience: 'fugacliente-api' });

/**
 * Verifica el JWT Bearer y vuelve a consultar al usuario en cada petición:
 * un usuario desactivado o con rol cambiado pierde el acceso sin esperar a que expire el token.
 */
export function auth(repository, config) {
  return async (req, res, next) => {
    const match = /^Bearer (\S+)$/i.exec(req.headers.authorization || '');
    if (!match) throw unauthorized();
    let claims;
    try {
      claims = jwt.verify(match[1], config.JWT_SECRET, {
        algorithms: [JWT_OPTIONS.algorithm], issuer: JWT_OPTIONS.issuer, audience: JWT_OPTIONS.audience
      });
    } catch {
      throw unauthorized('INVALID_TOKEN', 'La sesión expiró o el token no es válido.');
    }
    const user = await repository.getUser(Number(claims.sub));
    if (!user || !user.active) throw unauthorized('UNAUTHORIZED', 'Usuario no disponible.');
    req.user = user;
    next();
  };
}

/** Autorización por rol (RBAC). Debe ejecutarse después de `auth`. */
export function roles(...allowed) {
  return (req, res, next) => {
    if (!allowed.includes(req.user?.role)) return next(forbidden());
    next();
  };
}

/** Proyección pública: nunca expone el hash de la contraseña. */
export function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, active: user.active };
}
