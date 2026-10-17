import { api, fetchAll } from '../core/api.js';
import { html, mount, $ } from '../core/html.js';
import { empty, options, pagination, segmented, skeletonRows } from '../core/components.js';
import { dailyBars, hbar } from '../core/charts.js';
import { LABELS, fmt } from '../core/format.js';
import { showError } from '../detail.js';

const query = { page: 1, clientId: '', kind: 'business' };

function describe(event) {
  const p = event.payload || {};
  if (event.eventType === 'http.request') return `${p.method} ${p.path} → ${p.status} · ${p.durationMs} ms`;
  return Object.entries(p).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' · ');
}

async function loadTable(main) {
  const body = $('[data-events]', main);
  mount(body, skeletonRows(6));
  const params = new URLSearchParams({ page: query.page, limit: 20 });
  if (query.clientId) params.set('clientId', query.clientId);
  if (query.kind) params.set('kind', query.kind);
  const result = await api(`/logs?${params}`);
  mount(body, result.data.length ? html`<div class="table-wrap"><table>
    <thead><tr><th>Evento</th><th class="hide-sm">Recurso</th><th>Detalle</th><th>Fecha</th></tr></thead>
    <tbody>${result.data.map(e => html`<tr><td><span class="cell-title">${LABELS.event[e.eventType] || e.eventType}</span><span class="event-type">${e.eventType}</span></td>
      <td class="hide-sm muted">${e.entity}${e.entityId ? ` #${e.entityId}` : ''}</td><td class="payload">${describe(e)}</td><td class="muted nowrap">${fmt.dateTime(e.occurredAt)}</td></tr>`)}</tbody></table></div>
    ${pagination(result.pagination)}` : empty('Sin eventos', 'Los eventos llegan desde el outbox de SQL Server en pocos segundos.'));
  body.querySelectorAll('[data-page]').forEach(b => b.addEventListener('click', () => {
    query.page += b.dataset.page === 'next' ? 1 : -1;
    void loadTable(main).catch(showError);
  }));
}

export async function activityView(main) {
  const [summary, clients] = await Promise.all([api('/logs/summary?days=30'), fetchAll('/clients')]);
  const s = summary.data;
  const business = s.byType.filter(t => t.eventType !== 'http.request');
  const max = Math.max(1, ...business.map(t => t.count));
  const errorRate = s.http.total ? Math.round((s.http.errors / s.http.total) * 1000) / 10 : 0;

  mount(main, html`
    <div class="page-head"><div><h1>Auditoría</h1><p>Eventos de negocio entregados por el outbox transaccional y peticiones HTTP, almacenados en MongoDB (últimos ${s.days} días).</p></div></div>
    <div class="grid-2">
      <section class="panel"><div class="panel-head"><div><h2>Actividad de negocio por día</h2><p>Agregación $group por fecha sobre la colección events</p></div></div>
        <div class="panel-body">${s.byDay.length ? dailyBars(s.byDay) : html`<p class="muted">Sin eventos en el periodo.</p>`}</div></section>
      <section class="panel"><div class="panel-head"><div><h2>Salud del API</h2><p>Peticiones registradas por el middleware de logging</p></div></div>
        <div class="panel-body"><div class="metric-row">
          <div class="metric"><span>Peticiones</span><b>${fmt.number(s.http.total)}</b></div>
          <div class="metric"><span>Tasa de error</span><b>${errorRate} %</b></div>
          <div class="metric"><span>Latencia media</span><b>${s.http.avgDurationMs} ms</b></div>
        </div></div></section>
    </div>
    <div class="grid-2">
      <section class="panel table-panel">
        <div class="toolbar">${segmented('kind', [['business', 'Negocio'], ['http', 'HTTP'], ['', 'Todos']], query.kind)}<label class="sr-only" for="eventClient">Filtrar por cliente</label>
          <select id="eventClient" data-client><option value="">Todos los clientes</option>${options(clients.sort((a, b) => a.name.localeCompare(b.name, 'es')), query.clientId)}</select></div>
        <div data-events></div>
      </section>
      <section class="panel"><div class="panel-head"><div><h2>Eventos por tipo</h2><p>Sin contar peticiones HTTP</p></div></div>
        <div class="panel-body"><div class="hbars">${business.map(t => html`<div class="hbar-row"><div class="hbar-label"><span>${LABELS.event[t.eventType] || t.eventType}</span><b>${t.count}</b></div>${hbar(t.count, max)}</div>`)}</div></div></section>
    </div>`);

  $('[data-segment="kind"]', main).addEventListener('click', event => {
    const button = event.target.closest('button[data-value]');
    if (!button) return;
    event.currentTarget.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    query.kind = button.dataset.value;
    query.page = 1;
    void loadTable(main).catch(showError);
  });
  $('[data-client]', main).addEventListener('change', event => {
    query.clientId = event.target.value;
    query.page = 1;
    void loadTable(main).catch(showError);
  });
  await loadTable(main);
}
