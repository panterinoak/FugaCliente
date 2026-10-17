/** Error de aplicación con estado HTTP y código estable para el cliente. */
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const missing = (resource = 'Recurso') => new AppError(404, 'NOT_FOUND', `${resource} no encontrado.`);
export const conflict = message => new AppError(409, 'CONFLICT', message);
export const forbidden = (message = 'Tu rol no permite esta operación.') => new AppError(403, 'FORBIDDEN', message);
export const unauthorized = (code = 'UNAUTHORIZED', message = 'Inicia sesión para continuar.') => new AppError(401, code, message);

/** Códigos de SQL Server: 2601/2627 duplicado, 547 FK/CHECK, 50001/50002 lanzados por los SP. */
const SQL_ERRORS = Object.freeze({
  2601: { status: 409, code: 'DUPLICATE', message: 'Ya existe un registro con ese correo o nombre.' },
  2627: { status: 409, code: 'DUPLICATE', message: 'Ya existe un registro con ese correo o nombre.' },
  547: { status: 409, code: 'CONFLICT' },
  50001: { status: 404, code: 'NOT_FOUND' },
  50002: { status: 409, code: 'CONFLICT' }
});

const BODY_ERRORS = Object.freeze({
  'entity.parse.failed': { status: 400, code: 'INVALID_JSON', message: 'El cuerpo debe ser JSON válido.' },
  'entity.too.large': { status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'El cuerpo supera el límite permitido.' }
});

/** Traduce cualquier error a `{ status, code, message, details }` sin filtrar detalles internos. */
export function normalizeError(err) {
  let status = err.status || 500;
  let code = err.code || 'INTERNAL_ERROR';
  let message = err.message;
  const sqlNumber = err.number || err.originalError?.info?.number;
  const mapped = SQL_ERRORS[sqlNumber] || BODY_ERRORS[err.type];
  if (mapped) {
    status = mapped.status;
    code = mapped.code;
    message = mapped.message || message;
  }
  return { status, code: String(code), message, details: status < 500 ? err.details : undefined };
}

// Express identifica el manejador de errores por sus cuatro parámetros.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const { status, code, details, ...rest } = normalizeError(err);
  let { message } = rest;
  if (status >= 500) {
    console.error(JSON.stringify({ event: 'server.error', requestId: req.requestId, name: err.name, code: String(err.code || 'unknown') }));
    message = 'No fue posible completar la operación. Revisa el estado del servicio.';
  }
  const error = { code, message, requestId: req.requestId };
  if (details) error.details = details;
  res.status(status).json({ error });
}
