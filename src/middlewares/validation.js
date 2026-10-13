import { z } from 'zod';
import { AppError } from '../utils/errors.js';

export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) return next(new AppError(400, 'VALIDATION_ERROR', 'Corrige los datos de entrada.',
      result.error.issues.map(x => ({ field: x.path.join('.'), message: x.message }))));
    req.validated ??= {}; req.validated[source] = result.data; next();
  };
}
const id = z.coerce.number().int().positive().max(2147483647);
const text = (min, max) => z.string().trim().min(min).max(max);
const email = z.string().trim().email().max(254).transform(v => v.toLowerCase());
const password = z.string().min(12).max(72).refine(v => Buffer.byteLength(v, 'utf8') <= 72, 'La contraseña no debe superar 72 bytes UTF-8.');
export const idParams = z.object({ id });
export const loginSchema = z.object({ email, password: z.string().min(1).max(72) }).strict();
export const userSchema = z.object({ name: text(2, 100), email, password, role: z.enum(['admin', 'analista', 'agente']) }).strict();
export const clientSchema = z.object({
  name: text(2, 150), email, phone: z.string().trim().regex(/^[+0-9 ()-]{6,25}$/).nullable().optional().default(null),
  segmentId: id, status: z.enum(['activo', 'inactivo']).default('activo')
}).strict();
export const clientUpdateSchema = clientSchema.partial().strict().refine(v => Object.keys(v).length > 0, 'Envía al menos un campo.');
export const serviceSchema = z.object({ name: text(2, 100), slaHours: z.number().int().min(1).max(720) }).strict();
export const incidentSchema = z.object({
  clientId: id, serviceId: id, categoryId: id, description: text(10, 2000),
  severity: z.number().int().min(1).max(3), satisfaction: z.number().int().min(1).max(5).nullable().optional().default(null),
  assignedUserId: id.nullable().optional().default(null)
}).strict();
export const incidentUpdateSchema = z.object({
  status: z.enum(['abierta', 'en_proceso', 'resuelta']), expectedVersion: z.number().int().positive()
}).strict();
export const actionSchema = z.object({
  clientId: id, incidentId: id.nullable().optional().default(null),
  assignedUserId: id, type: z.enum(['contacto', 'compensacion', 'seguimiento']),
  description: text(10, 2000), dueAt: z.string().datetime({ offset: true }).refine(v => new Date(v).getTime() > Date.now(), 'La fecha debe ser futura.')
}).strict();
export const actionUpdateSchema = z.object({ outcome: z.enum(['contactado', 'recuperado', 'sin_respuesta']) }).strict();
export const commentSchema = z.object({ text: text(2, 3000), channel: z.enum(['interno', 'telefono', 'correo', 'web']).default('interno') }).strict();
export const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(150).default(''),
  level: z.enum(['bajo', 'medio', 'alto']).optional(),
  status: z.enum(['activo', 'inactivo', 'abierta', 'en_proceso', 'resuelta', 'pendiente', 'completada']).optional(),
  clientId: id.optional()
}).strict();
