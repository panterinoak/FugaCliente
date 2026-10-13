export const RISK_RULES = Object.freeze({ version: 'reglas-v1', windowDays: 30, mediumThreshold: 40, highThreshold: 70 });

export function calculateRisk(incidents, now = new Date()) {
  const end = now.getTime(), start = end - RISK_RULES.windowDays * 86400000;
  const valid = incidents.filter(i => new Date(i.createdAt).getTime() <= end);
  const recent = valid.filter(i => new Date(i.createdAt).getTime() >= start);
  const open = valid.filter(i => i.status !== 'resuelta');
  const rated = recent.filter(i => i.satisfaction !== null && i.satisfaction !== undefined)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt) || b.id - a.id);
  const rating = rated[0]?.satisfaction;
  const breached = open.filter(i => end - new Date(i.createdAt).getTime() > i.slaHours * 3600000);
  const factors = [
    { key: 'satisfaction', label: 'Satisfacción reciente', points: rating <= 2 ? 25 : rating === 3 ? 10 : 0, max: 25, detail: rating ? `Última calificación: ${rating}/5` : 'Sin calificación en los últimos 30 días' },
    { key: 'open', label: 'Incidencias pendientes', points: Math.min(open.length * 10, 30), max: 30, detail: `${open.length} sin resolver; 10 puntos por incidencia` },
    { key: 'repeated', label: 'Reclamos repetidos', points: Math.min(Math.max(recent.length - 1, 0) * 10, 20), max: 20, detail: `${recent.length} incidencias en 30 días; se puntúa desde la segunda` },
    { key: 'severity', label: 'Incidencia grave reciente', points: recent.some(i => i.severity === 3) ? 15 : 0, max: 15, detail: '15 puntos si hay gravedad 3 en los últimos 30 días' },
    { key: 'sla', label: 'Plazo de atención vencido', points: breached.length ? 10 : 0, max: 10, detail: `${breached.length} incidencias pendientes superan el SLA del servicio` }
  ];
  const score = factors.reduce((sum, f) => sum + f.points, 0);
  const level = score >= 70 ? 'alto' : score >= 40 ? 'medio' : 'bajo';
  const recommendation = level === 'alto' ? 'Priorizar contacto personal y resolver las incidencias pendientes.' : level === 'medio' ? 'Asignar seguimiento y revisar la causa del reclamo.' : 'Mantener la atención y observar nuevas incidencias.';
  return { score, level, factors, recommendation, algorithm: RISK_RULES.version, windowDays: 30, computedAt: now.toISOString() };
}
