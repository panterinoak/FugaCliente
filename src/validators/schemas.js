/**
 * Contratos de entrada de la API (Zod). Cada esquema es estricto: los campos desconocidos
 * se rechazan con 400 para evitar asignaciones masivas no previstas.
 */
import { z } from 'zod';
import {
  ACTION_OUTCOMES, ACTION_STATUS, ACTION_TYPES, CLIENT_STATUS, COMMENT_CHANNELS,
  INCIDENT_STATUS, PAGINATION, RISK_LEVELS, ROLES
} from '../config/constants.js';

const id = z.coerce.number().int().positive().max(2_147_483_647);
const text = (min, max) => z.string().trim().min(min).max(max);
const email = z.string().trim().email().max(254).transform(value => value.toLowerCase());
const password = z.string().min(12).max(72)
  .refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'La contraseña no debe superar 72 bytes UTF-8.');
const phone = z.string().trim().regex(/^[+0-9 ()-]{6,25}$/, 'Usa solo dígitos, espacios, +, ( ) o -.');
const atLeastOne = schema => schema.refine(value => Object.keys(value).length > 0, 'Envía al menos un campo.');

export const idParams = z.object({ id });

/* ---------- Autenticación y usuarios ---------- */
export const loginSchema = z.object({ email, password: z.string().min(1).max(72) }).strict();
export const userSchema = z.object({ name: text(2, 100), email, password, role: z.enum(ROLES) }).strict();
export const userUpdateSchema = atLeastOne(z.object({
  name: text(2, 100), role: z.enum(ROLES), active: z.boolean()
}).partial().strict());

/* ---------- Catálogo de servicios ---------- */
export const serviceSchema = z.object({ name: text(2, 100), slaHours: z.number().int().min(1).max(720) }).strict();
export const serviceUpdateSchema = atLeastOne(z.object({
  name: text(2, 100), slaHours: z.number().int().min(1).max(720), active: z.boolean()
}).partial().strict());

/* ---------- Clientes ---------- */
export const clientSchema = z.object({
  name: text(2, 150),
  email,
  phone: phone.nullable().optional().default(null),
  segmentId: id,
  status: z.enum(CLIENT_STATUS).default('activo')
}).strict();
export const clientUpdateSchema = atLeastOne(z.object({
  name: text(2, 150), email, phone: phone.nullable(), segmentId: id, status: z.enum(CLIENT_STATUS)
}).partial().strict());

/* ---------- Incidencias ---------- */
export const incidentSchema = z.object({
  clientId: id,
  serviceId: id,
  categoryId: id,
  description: text(10, 2000),
  severity: z.number().int().min(1).max(3),
  satisfaction: z.number().int().min(1).max(5).nullable().optional().default(null),
  assignedUserId: id.nullable().optional().default(null)
}).strict();
export const incidentUpdateSchema = z.object({
  status: z.enum(INCIDENT_STATUS),
  expectedVersion: z.number().int().positive()
}).strict();

/* ---------- Retención ---------- */
export const actionSchema = z.object({
  clientId: id,
  incidentId: id.nullable().optional().default(null),
  assignedUserId: id,
  type: z.enum(ACTION_TYPES),
  description: text(10, 2000),
  dueAt: z.string().datetime({ offset: true })
    .refine(value => new Date(value).getTime() > Date.now(), 'La fecha debe ser futura.')
}).strict();
export const actionUpdateSchema = z.object({ outcome: z.enum(ACTION_OUTCOMES) }).strict();

/* ---------- Comentarios (MongoDB) ---------- */
export const commentSchema = z.object({
  text: text(2, 3000),
  channel: z.enum(COMMENT_CHANNELS).default('interno')
}).strict();

/* ---------- Consultas de listado ---------- */
export const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(PAGINATION.maxLimit).default(PAGINATION.defaultLimit),
  search: z.string().trim().max(150).default(''),
  level: z.enum(RISK_LEVELS).optional(),
  status: z.enum([...CLIENT_STATUS, ...INCIDENT_STATUS, ...ACTION_STATUS]).optional(),
  clientId: id.optional()
}).strict();

export const clientListSchema = listSchema.extend({ status: z.enum(CLIENT_STATUS).optional() });
export const incidentListSchema = listSchema.extend({ status: z.enum(INCIDENT_STATUS).optional() });
export const actionListSchema = listSchema.extend({ status: z.enum(ACTION_STATUS).optional() });
export const logListSchema = listSchema.extend({ kind: z.enum(['business', 'http']).optional() });
export const summarySchema = z.object({ days: z.coerce.number().int().min(1).max(90).default(14) }).strict();
export const reportSchema = z.object({
  level: z.enum(RISK_LEVELS).optional(),
  status: z.enum(CLIENT_STATUS).optional()
}).strict();
