import { randomUUID } from 'node:crypto';

const INCOMING_ID = /^[A-Za-z0-9-]{8,64}$/;

/**
 * Asigna un identificador de correlación a cada petición (o reutiliza un X-Request-Id válido)
 * y registra método, ruta, estado y duración en MongoDB al terminar la respuesta.
 * Nunca se registran contraseñas, tokens, cuerpos ni parámetros de búsqueda.
 */
export function requestLogger(audit, { quiet = false } = {}) {
  return (req, res, next) => {
    const incoming = req.get('X-Request-Id');
    req.requestId = incoming && INCOMING_ID.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    const start = performance.now();

    res.on('finish', () => {
      if (!req.originalUrl.startsWith('/api/')) return;
      const entry = {
        eventId: randomUUID(),
        eventType: 'http.request',
        entity: 'http',
        entityId: null,
        actorId: req.user?.id ?? null,
        occurredAt: new Date(),
        payload: {
          requestId: req.requestId,
          method: req.method,
          path: req.originalUrl.split('?')[0],
          status: res.statusCode,
          durationMs: Math.round(performance.now() - start)
        }
      };
      if (!quiet) console.log(JSON.stringify(entry));
      void audit.write(entry).catch(() => {
        if (!quiet) console.error('No se pudo guardar el log HTTP en MongoDB.');
      });
    });
    next();
  };
}
