/**
 * Motor de riesgo explicable (reglas-v1).
 * El puntaje 0-100 prioriza la atención y muestra sus causas; no es una probabilidad estadística.
 */
import { DAY_MS, HOUR_MS } from '../config/constants.js';

export const RISK_RULES = Object.freeze({
  version: 'reglas-v1',
  windowDays: 30,
  mediumThreshold: 40,
  highThreshold: 70,
  factors: Object.freeze({ satisfaction: 25, open: 30, repeated: 20, severity: 15, sla: 10 })
});

const time = value => new Date(value).getTime();

export function riskLevel(score) {
  if (score >= RISK_RULES.highThreshold) return 'alto';
  if (score >= RISK_RULES.mediumThreshold) return 'medio';
  return 'bajo';
}

const RECOMMENDATIONS = Object.freeze({
  alto: 'Priorizar contacto personal y resolver las incidencias pendientes.',
  medio: 'Asignar seguimiento y revisar la causa del reclamo.',
  bajo: 'Mantener la atención y observar nuevas incidencias.'
});

export function calculateRisk(incidents, now = new Date()) {
  const end = now.getTime();
  const start = end - RISK_RULES.windowDays * DAY_MS;
  const max = RISK_RULES.factors;

  const valid = incidents.filter(i => time(i.createdAt) <= end); // ignora fechas futuras
  const recent = valid.filter(i => time(i.createdAt) >= start); // ventana inclusiva
  const open = valid.filter(i => i.status !== 'resuelta'); // pendientes sin límite de antigüedad
  const rated = recent
    .filter(i => i.satisfaction !== null && i.satisfaction !== undefined)
    .sort((a, b) => time(b.createdAt) - time(a.createdAt) || b.id - a.id);
  const rating = rated[0]?.satisfaction;
  const breached = open.filter(i => end - time(i.createdAt) > i.slaHours * HOUR_MS);

  const satisfactionPoints = rating <= 2 ? max.satisfaction : rating === 3 ? 10 : 0;
  const factors = [
    {
      key: 'satisfaction', label: 'Satisfacción reciente', points: satisfactionPoints, max: max.satisfaction,
      detail: rating ? `Última calificación: ${rating}/5` : 'Sin calificación en los últimos 30 días'
    },
    {
      key: 'open', label: 'Incidencias pendientes', points: Math.min(open.length * 10, max.open), max: max.open,
      detail: `${open.length} sin resolver; 10 puntos por incidencia`
    },
    {
      key: 'repeated', label: 'Reclamos repetidos', points: Math.min(Math.max(recent.length - 1, 0) * 10, max.repeated), max: max.repeated,
      detail: `${recent.length} incidencias en 30 días; se puntúa desde la segunda`
    },
    {
      key: 'severity', label: 'Incidencia grave reciente', points: recent.some(i => i.severity === 3) ? max.severity : 0, max: max.severity,
      detail: '15 puntos si hay gravedad 3 en los últimos 30 días'
    },
    {
      key: 'sla', label: 'Plazo de atención vencido', points: breached.length ? max.sla : 0, max: max.sla,
      detail: `${breached.length} incidencias pendientes superan el SLA del servicio`
    }
  ];

  const score = factors.reduce((sum, factor) => sum + factor.points, 0);
  const level = riskLevel(score);
  return {
    score, level, factors,
    recommendation: RECOMMENDATIONS[level],
    algorithm: RISK_RULES.version,
    windowDays: RISK_RULES.windowDays,
    computedAt: now.toISOString()
  };
}

/** Incidencias pendientes que ya superaron el SLA de su servicio. */
export const isSlaBreached = (incident, now = new Date()) =>
  incident.status !== 'resuelta' && now.getTime() - time(incident.createdAt) > incident.slaHours * HOUR_MS;
