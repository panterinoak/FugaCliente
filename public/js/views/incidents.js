import { api } from '../core/api.js';
import { html } from '../core/html.js';
import { badge, empty, icon, segmented, severity, slaState } from '../core/components.js';
import { fmt } from '../core/format.js';
import { incidentDetail, showError } from '../detail.js';
import { incidentForm } from '../forms.js';
import { createListView, toParams } from './list.js';

let view;

export function incidentsView(refresh) {
  view ??= createListView({
    title: 'Incidencias',
    description: 'Casos de mal servicio y su plazo de atención (SLA). Una incidencia pendiente suma riesgo hasta resolverse.',
    noun: ['incidencia', 'incidencias'],
    searchPlaceholder: 'Buscar por cliente, motivo o descripción',
    defaults: { status: '' },
    onError: showError,
    actions: () => html`<button class="btn btn-primary" data-new>${icon('plus')}Registrar incidencia</button>`,
    filters: q => segmented('status', [['', 'Todas'], ['abierta', 'Abiertas'], ['en_proceso', 'En proceso'], ['resuelta', 'Resueltas']], q.status),
    load: q => api(`/incidents?${toParams(q)}`),
    table: rows => html`<div class="table-wrap"><table>
      <thead><tr><th>Caso</th><th class="hide-sm">Servicio</th><th>Gravedad</th><th>Plazo</th><th>Estado</th><th class="hide-sm">Registro</th></tr></thead>
      <tbody>${rows.map(i => html`<tr class="is-clickable" data-id="${i.id}" tabindex="0">
        <td><span class="cell-title">#${i.id} · ${i.clientName}</span><span class="cell-sub">${i.categoryName} — ${i.description}</span></td>
        <td class="hide-sm muted nowrap">${i.serviceName}</td><td>${severity(i.severity)}</td><td>${slaState(i)}</td>
        <td>${badge(i.status)}</td><td class="hide-sm muted nowrap">${fmt.dateTime(i.createdAt)}</td></tr>`)}</tbody></table></div>`,
    empty: q => empty(q.search || q.status ? 'Sin resultados' : 'Sin incidencias registradas', q.search || q.status ? 'Cambia el filtro de estado o la búsqueda.' : 'Cuando un cliente reporte una mala experiencia, regístrala aquí.'),
    bind: panel => panel.querySelectorAll('tr[data-id]').forEach(row => {
      const open = () => incidentDetail(Number(row.dataset.id)).catch(showError);
      row.addEventListener('click', open);
      row.addEventListener('keydown', e => { if (e.key === 'Enter') open(); });
    }),
    bindHeader: main => main.querySelector('[data-new]').addEventListener('click', () => incidentForm({ onDone: refresh }).catch(showError))
  });
  return view;
}
