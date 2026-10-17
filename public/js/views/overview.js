import { api, download } from '../core/api.js';
import { html, mount } from '../core/html.js';
import { empty, factorLegend, icon, levelBadge, person, riskCell } from '../core/components.js';
import { distributionBar, hbar, ring, weeklyBars } from '../core/charts.js';
import { LABELS, fmt } from '../core/format.js';
import { can, session } from '../core/state.js';
import { toast } from '../core/overlay.js';
import { clientDetail, showError } from '../detail.js';
import { actionForm, incidentForm } from '../forms.js';

const pct = (part, total) => (total ? Math.round((part / total) * 100) : 0);

export async function overviewView(main, { refresh }) {
  const { data: d } = await api('/dashboard');
  const firstName = session.user.name.split(' ')[0];
  const maxCategory = Math.max(1, ...d.byCategory.map(c => c.count));
  const maxService = Math.max(1, ...d.byService.map(s => s.open));
  const r = d.retention;
  const maxFactor = Math.max(1, ...d.factorTotals.map(f => f.points));

  mount(main, html`
    <div class="page-head">
      <div><h1>${fmt.greeting()}, ${firstName}</h1><p>${fmt.longDate()} · ${d.atRisk ? `${d.atRisk} clientes necesitan atención; ${d.distribution.alto} con prioridad alta.` : 'Ningún cliente activo presenta riesgo medio o alto.'}</p></div>
      <div class="page-actions">
        ${can.privileged() ? html`<button class="btn" data-export>${icon('download')}Exportar riesgo</button>` : ''}
        <button class="btn btn-primary" data-new-incident>${icon('plus')}Registrar incidencia</button>
      </div>
    </div>

    <section class="kpis" aria-label="Indicadores">
      <div class="kpi"><div class="kpi-label">Clientes activos</div><div class="kpi-value">${fmt.number(d.totalClients)}</div><div class="kpi-note">En la cartera de atención</div></div>
      <div class="kpi"><div class="kpi-label">En riesgo</div><div class="kpi-value">${d.atRisk}<small>/ ${d.totalClients}</small></div><div class="kpi-note ${d.distribution.alto ? 'is-high' : 'is-ok'}">${d.distribution.alto} en riesgo alto</div></div>
      <div class="kpi"><div class="kpi-label">Incidencias abiertas</div><div class="kpi-value">${d.openIncidents}</div><div class="kpi-note ${d.slaBreached ? 'is-high' : 'is-ok'}">${d.slaBreached ? `${d.slaBreached} con SLA vencido` : 'Todas dentro del plazo'}</div></div>
      <div class="kpi"><div class="kpi-label">Satisfacción (30 días)</div><div class="kpi-value">${d.averageSatisfaction ?? '—'}<small>/ 5</small></div><div class="kpi-note ${d.averageSatisfaction !== null && d.averageSatisfaction < 3 ? 'is-mid' : ''}">Promedio de casos calificados</div></div>
      <div class="kpi"><div class="kpi-label">Acciones pendientes</div><div class="kpi-value">${d.pendingActions}</div><div class="kpi-note ${d.overdueActions ? 'is-high' : ''}">${d.overdueActions ? `${d.overdueActions} fuera de plazo` : 'Ninguna vencida'}</div></div>
    </section>

    <div class="grid-2">
      <section class="panel">
        <div class="panel-head"><div><h2>Cola de prioridad</h2><p>Clientes activos con mayor puntaje y la causa de cada punto</p></div><a class="btn btn-sm btn-ghost" href="#/clientes">Ver todos${icon('chevron')}</a></div>
        <div class="panel-flush" data-priority>${d.priorityClients.length ? html`<div class="table-wrap"><table>
          <thead><tr><th>Cliente</th><th>Riesgo</th><th class="hide-sm">Nivel</th></tr></thead>
          <tbody>${d.priorityClients.map(c => html`<tr class="is-clickable" data-id="${c.id}" tabindex="0"><td>${person(c.name, `${c.segmentName} · ${c.email}`)}</td><td>${riskCell(c.risk)}</td><td class="hide-sm">${levelBadge(c.risk.level)}</td></tr>`)}</tbody>
        </table></div>` : empty('Sin alertas activas', 'Ningún cliente activo supera los 40 puntos. Sigue registrando incidencias para mantener el seguimiento.')}</div>
        <div class="panel-foot">${factorLegend()}</div>
      </section>

      <section class="panel">
        <div class="panel-head"><div><h2>Distribución del riesgo</h2><p>Clientes activos por nivel</p></div></div>
        <div class="panel-body">
          <div class="dist-total"><b>${d.totalClients}</b><span class="muted">clientes activos</span></div>
          ${distributionBar(d.distribution, d.totalClients)}
          <div class="dist-list">${['alto', 'medio', 'bajo'].map(level => html`<div class="dist-row"><i class="swatch ${level}"></i><span>${LABELS.level[level]} <span class="muted">· ${{ alto: '70–100', medio: '40–69', bajo: '0–39' }[level]} pts</span></span><b>${d.distribution[level]}</b><small>${pct(d.distribution[level], d.totalClients)} %</small></div>`)}</div>
          ${d.atRisk ? html`<div class="factor-summary"><h3>Qué explica el riesgo</h3><p class="muted">Puntos aportados por cada factor en los ${d.atRisk} clientes en riesgo</p>
            <div class="hbars">${[...d.factorTotals].sort((a, b) => b.points - a.points).map(f => html`<div class="hbar-row"><div class="hbar-label"><span><i class="swatch f-${f.key}"></i> ${f.label}</span><span><b>${f.points}</b> <span class="muted">pts · ${f.clients} clientes</span></span></div>${hbar(f.points, maxFactor, `f-${f.key}`)}</div>`)}</div></div>` : ''}
        </div>
      </section>
    </div>

    <div class="grid-2">
      <section class="panel">
        <div class="panel-head"><div><h2>Incidencias por semana</h2><p>Últimas 8 semanas: casos registrados frente a casos resueltos</p></div>
          <div class="chart-legend"><span><i class="swatch a"></i>Registradas</span><span><i class="swatch b"></i>Resueltas</span></div></div>
        <div class="panel-body">${weeklyBars(d.trend)}</div>
      </section>
      <section class="panel">
        <div class="panel-head"><div><h2>Motivos de reclamo</h2><p>Incidencias de los últimos 30 días</p></div></div>
        <div class="panel-body">${d.byCategory.length ? html`<div class="hbars">${d.byCategory.map(c => html`<div class="hbar-row"><div class="hbar-label"><span>${c.name}</span><b>${c.count}</b></div>${hbar(c.count, maxCategory)}</div>`)}</div>` : html`<p class="muted">Sin incidencias en los últimos 30 días.</p>`}</div>
      </section>
    </div>

    <div class="grid-even">
      <section class="panel">
        <div class="panel-head"><div><h2>Carga por servicio</h2><p>Incidencias abiertas y cuántas superaron su SLA</p></div></div>
        <div class="panel-body">${d.byService.length ? html`<div class="hbars">${d.byService.map(s => html`<div class="hbar-row"><div class="hbar-label"><span>${s.name}</span><span><b>${s.open}</b> <span class="muted">abiertas · ${s.breached} vencidas</span></span></div>${hbar(s.breached, maxService, 'fill-alt')}</div>`)}</div>` : html`<p class="muted">No hay incidencias abiertas.</p>`}</div>
      </section>
      <section class="panel">
        <div class="panel-head"><div><h2>Resultados de retención</h2><p>Acciones completadas por el equipo</p></div><button class="btn btn-sm" data-new-action>${icon('plus')}Asignar acción</button></div>
        <div class="panel-body outcomes">
          ${ring(r.recoveryRate, 'recuperados')}
          <ul class="stat-list">
            <li><span>Recuperados</span><b>${r.recovered}</b></li>
            <li><span>Contactados</span><b>${r.contacted}</b></li>
            <li><span>Sin respuesta</span><b>${r.noResponse}</b></li>
            <li><span class="muted">Completadas / asignadas</span><b>${r.completed} / ${r.total}</b></li>
          </ul>
        </div>
      </section>
    </div>`);

  main.querySelectorAll('[data-priority] tr[data-id]').forEach(row => {
    const open = () => clientDetail(Number(row.dataset.id)).catch(showError);
    row.addEventListener('click', open);
    row.addEventListener('keydown', e => { if (e.key === 'Enter') open(); });
  });
  main.querySelector('[data-new-incident]').addEventListener('click', () => incidentForm({ onDone: refresh }).catch(showError));
  main.querySelector('[data-new-action]').addEventListener('click', () => actionForm({ onDone: refresh }).catch(showError));
  main.querySelector('[data-export]')?.addEventListener('click', () => download('/reports/clients.csv?status=activo').then(name => toast(`Descargado ${name}`)).catch(showError));
  return d;
}
