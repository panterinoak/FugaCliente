export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message); this.status = status; this.code = code; this.details = details;
  }
}
export const missing = (resource = 'Recurso') => new AppError(404, 'NOT_FOUND', `${resource} no encontrado.`);
export const conflict = message => new AppError(409, 'CONFLICT', message);

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  let status = err.status || 500;
  let code = err.code || 'INTERNAL_ERROR';
  let message = err.message;
  // Errores explícitos de los procedimientos almacenados.
  const number = err.number || err.originalError?.info?.number;
  if ([2601, 2627].includes(number)) { status = 409; code = 'DUPLICATE'; message = 'Ya existe un registro con ese correo o nombre.'; }
  if (number === 50001) { status = 404; code = 'NOT_FOUND'; }
  if (number === 50002 || number === 547) { status = 409; code = 'CONFLICT'; }
  if (err.type === 'entity.parse.failed') { status = 400; code = 'INVALID_JSON'; message = 'El cuerpo debe ser JSON válido.'; }
  if (err.type === 'entity.too.large') { status = 413; code = 'PAYLOAD_TOO_LARGE'; message = 'El cuerpo supera el límite permitido.'; }
  if (status >= 500) {
    console.error(JSON.stringify({ event: 'server.error', requestId: req.requestId, name: err.name, code: String(err.code || 'unknown') }));
    message = 'No fue posible completar la operación. Revisa el estado del servicio.';
  }
  const error = { code, message, requestId: req.requestId };
  if (err.details && status < 500) error.details = err.details;
  res.status(status).json({ error });
}
