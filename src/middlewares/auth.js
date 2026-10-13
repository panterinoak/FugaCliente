import jwt from 'jsonwebtoken';
import { AppError } from '../utils/errors.js';

export function auth(repository, config) {
  return async (req, res, next) => {
    const match = /^Bearer (\S+)$/i.exec(req.headers.authorization || '');
    if (!match) throw new AppError(401, 'UNAUTHORIZED', 'Inicia sesión para continuar.');
    let claims;
    try { claims = jwt.verify(match[1], config.JWT_SECRET, { algorithms: ['HS256'], issuer: 'fugacliente', audience: 'fugacliente-api' }); }
    catch { throw new AppError(401, 'INVALID_TOKEN', 'La sesión expiró o el token no es válido.'); }
    const user = await repository.getUser(Number(claims.sub));
    if (!user || !user.active) throw new AppError(401, 'UNAUTHORIZED', 'Usuario no disponible.');
    req.user = user; next();
  };
}
export function roles(...allowed) {
  return (req, res, next) => {
    if (!allowed.includes(req.user?.role)) return next(new AppError(403, 'FORBIDDEN', 'Tu rol no permite esta operación.'));
    next();
  };
}
export function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, active: user.active };
}
