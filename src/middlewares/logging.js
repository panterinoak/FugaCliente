import { randomUUID } from 'node:crypto';

export function requestLogger(audit, { quiet = false } = {}) {
  return (req, res, next) => {
    req.requestId = randomUUID(); res.setHeader('X-Request-Id', req.requestId);
    const start = performance.now();
    res.on('finish', () => {
      if (!req.originalUrl.startsWith('/api/')) return;
      const entry = {
        eventId: req.requestId, eventType: 'http.request', entity: 'http', entityId: null,
        actorId: req.user?.id ?? null, occurredAt: new Date(),
        payload: { method: req.method, path: req.originalUrl.split('?')[0], status: res.statusCode, durationMs: Math.round(performance.now() - start) }
      };
      if (!quiet) console.log(JSON.stringify(entry));
      // Nunca registrar passwords, tokens, cuerpo de la petición ni parámetros de búsqueda.
      void audit.write(entry).catch(() => { if (!quiet) console.error('No se pudo guardar el log HTTP en MongoDB.'); });
    });
    next();
  };
}
