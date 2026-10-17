import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';

const limitMessage = message => ({ error: { code: 'RATE_LIMIT', message } });

/** Cabeceras de seguridad con CSP estricta: la interfaz no usa scripts ni estilos externos. */
export const securityHeaders = () => helmet({
  contentSecurityPolicy: {
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'style-src': ["'self'"],
      'img-src': ["'self'", 'data:'],
      'font-src': ["'self'"],
      'connect-src': ["'self'"],
      'object-src': ["'none'"],
      'frame-ancestors': ["'none'"],
      'upgrade-insecure-requests': null
    }
  }
});

/** Las respuestas del API contienen datos personales: no se almacenan en caché. */
export const noStore = (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};

export const apiLimiter = () => rateLimit({
  windowMs: 60_000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false,
  message: limitMessage('Demasiadas solicitudes. Inténtalo en un minuto.')
});

/** Protección contra fuerza bruta en el login: 20 intentos cada 15 minutos por IP. */
export const loginLimiter = () => rateLimit({
  windowMs: 15 * 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false,
  message: limitMessage('Demasiados intentos. Vuelve a intentarlo en 15 minutos.')
});
