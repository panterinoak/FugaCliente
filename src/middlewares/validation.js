import { AppError } from '../utils/errors.js';

/**
 * Valida `req[source]` con un esquema Zod y deja el resultado tipado en `req.validated[source]`.
 * Los controladores nunca leen `req.body`/`req.query` sin validar.
 */
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.issues.map(issue => ({ field: issue.path.join('.'), message: issue.message }));
      return next(new AppError(400, 'VALIDATION_ERROR', 'Corrige los datos de entrada.', details));
    }
    req.validated ??= {};
    req.validated[source] = result.data;
    next();
  };
}

// Compatibilidad: los esquemas viven en src/validators/schemas.js.
export * from '../validators/schemas.js';
