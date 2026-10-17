import { DAY_MS, RISK_LEVELS } from '../config/constants.js';
import { isSlaBreached } from './risk.js';

const TREND_WEEKS = 8;
const time = value => new Date(value).getTime();
const round1 = value => Math.round(value * 10) / 10;

/** Cuenta elementos por clave y devuelve `[{ name, count }]` ordenado de mayor a menor. */
function countBy(rows, key) {
  const counts = new Map();
  for (const row of rows) counts.set(row[key], (counts.get(row[key]) || 0) + 1);
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || String(a.name).localeCompare(String(b.name)));
}

/**
 * Indicadores del panel. Se calculan sobre la misma instantánea que usa el listado de clientes,
 * de modo que las cifras del panel y de las tablas siempre coinciden.
 */
export class AnalyticsService {
  constructor(repository, clients, audit) {
    this.repository = repository;
    this.clients = clients;
    this.audit = audit;
  }

  async dashboard(now = new Date()) {
    const [snapshot, incidents, actions] = await Promise.all([
      this.clients.snapshot(now), this.repository.listIncidents(), this.repository.listActions()
    ]);
    const active = snapshot.filter(c => c.status === 'activo');
    const distribution = Object.fromEntries(RISK_LEVELS.map(level => [level, 0]));
    for (const client of active) distribution[client.risk.level]++;

    const open = incidents.filter(i => i.status !== 'resuelta');
    const pending = actions.filter(a => a.status === 'pendiente');
    const recent = incidents.filter(i => time(i.createdAt) >= now.getTime() - 30 * DAY_MS && time(i.createdAt) <= now.getTime());
    const rated = recent.filter(i => i.satisfaction !== null && i.satisfaction !== undefined);

    return {
      totalClients: active.length,
      distribution,
      atRisk: distribution.medio + distribution.alto,
      openIncidents: open.length,
      slaBreached: open.filter(i => isSlaBreached(i, now)).length,
      pendingActions: pending.length,
      overdueActions: pending.filter(a => time(a.dueAt) < now.getTime()).length,
      averageSatisfaction: rated.length ? round1(rated.reduce((s, i) => s + i.satisfaction, 0) / rated.length) : null,
      priorityClients: active.filter(c => c.risk.level !== 'bajo').sort((a, b) => b.risk.score - a.risk.score || a.id - b.id).slice(0, 5),
      factorTotals: this.factorTotals(active.filter(c => c.risk.level !== 'bajo')),
      trend: this.weeklyTrend(incidents, now),
      byCategory: countBy(recent, 'categoryName'),
      byService: this.serviceLoad(open, now),
      retention: this.retentionOutcomes(actions)
    };
  }

  /** Incidencias registradas y resueltas en las últimas 8 semanas (ventanas de 7 días hasta hoy). */
  weeklyTrend(incidents, now) {
    const end = now.getTime();
    return Array.from({ length: TREND_WEEKS }, (_, index) => {
      const to = end - (TREND_WEEKS - 1 - index) * 7 * DAY_MS;
      const from = to - 7 * DAY_MS;
      const inRange = value => value && time(value) > from && time(value) <= to;
      return {
        from: new Date(from).toISOString(),
        to: new Date(to).toISOString(),
        opened: incidents.filter(i => inRange(i.createdAt)).length,
        resolved: incidents.filter(i => inRange(i.resolvedAt)).length
      };
    });
  }

  /** Puntos aportados por cada factor entre los clientes en riesgo: qué explica el riesgo de la cartera. */
  factorTotals(atRisk) {
    const totals = new Map();
    for (const client of atRisk) {
      for (const f of client.risk.factors) {
        const row = totals.get(f.key) || { key: f.key, label: f.label, points: 0, clients: 0 };
        row.points += f.points;
        if (f.points) row.clients++;
        totals.set(f.key, row);
      }
    }
    return [...totals.values()];
  }

  serviceLoad(open, now) {
    const groups = Map.groupBy(open, i => i.serviceName);
    return [...groups].map(([name, rows]) => ({
      name, open: rows.length, breached: rows.filter(i => isSlaBreached(i, now)).length
    })).sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));
  }

  retentionOutcomes(actions) {
    const completed = actions.filter(a => a.status === 'completada');
    const count = outcome => completed.filter(a => a.outcome === outcome).length;
    const recovered = count('recuperado');
    return {
      total: actions.length,
      completed: completed.length,
      recovered,
      contacted: count('contactado'),
      noResponse: count('sin_respuesta'),
      recoveryRate: completed.length ? round1((recovered / completed.length) * 100) : null
    };
  }

  logs(query) {
    return this.audit.list(query);
  }

  /** Agregación en MongoDB: eventos por tipo, por día y métricas de peticiones HTTP. */
  logSummary(query) {
    return this.audit.summary(query);
  }
}
