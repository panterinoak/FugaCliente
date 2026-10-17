/**
 * Vocabulario de dominio compartido por validación, servicios, repositorios y documentación.
 * Mantener los valores en un único lugar evita que la API, SQL Server y la interfaz diverjan.
 */
export const APP_NAME = 'FugaCliente';
export const API_VERSION = '2.0.0';

export const ROLES = Object.freeze(['admin', 'analista', 'agente']);
export const PRIVILEGED_ROLES = Object.freeze(['admin', 'analista']);

export const CLIENT_STATUS = Object.freeze(['activo', 'inactivo']);
export const INCIDENT_STATUS = Object.freeze(['abierta', 'en_proceso', 'resuelta']);
export const ACTION_STATUS = Object.freeze(['pendiente', 'completada']);
export const ACTION_TYPES = Object.freeze(['contacto', 'compensacion', 'seguimiento']);
export const ACTION_OUTCOMES = Object.freeze(['contactado', 'recuperado', 'sin_respuesta']);
export const COMMENT_CHANNELS = Object.freeze(['interno', 'telefono', 'correo', 'web']);
export const RISK_LEVELS = Object.freeze(['bajo', 'medio', 'alto']);

/** Máquina de estados de una incidencia: una incidencia resuelta no se reabre. */
export const INCIDENT_TRANSITIONS = Object.freeze({
  abierta: Object.freeze(['en_proceso', 'resuelta']),
  en_proceso: Object.freeze(['resuelta']),
  resuelta: Object.freeze([])
});

export const canTransition = (from, to) => from === to || INCIDENT_TRANSITIONS[from]?.includes(to) === true;

export const DAY_MS = 86_400_000;
export const HOUR_MS = 3_600_000;

export const PAGINATION = Object.freeze({ defaultLimit: 20, maxLimit: 100 });
