import { api, download } from '../core/api.js';
import { html } from '../core/html.js';
import { badge, empty, factorLegend, icon, levelBadge, person, riskCell, segmented } from '../core/components.js';
import { can } from '../core/state.js';
import { toast } from '../core/overlay.js';
import { clientDetail, showError } from '../detail.js';
import { clientForm } from '../forms.js';
import { createListView, toParams } from './list.js';

let view;

export function clientsView(refresh) {
  view ??= createListView({
    title: 'Clientes',
    description: 'Ordenados por puntaje de riesgo. Cada color de la barra es un factor que suma puntos.',
    noun: ['cliente', 'clientes'],
    searchPlaceholder: 'Buscar por nombre o correo',
    defaults: { level: '', status: 'activo' },
    onError: showError,
    actions: () => html`${can.privileged() ? html`<button class="btn" data-export>${icon('download')}Exportar CSV</button>` : ''}
      <button class="btn btn-primary" data-new>${icon('plus')}Nuevo cliente</button>`,
    filters: q => html`${segmented('level', [['', 'Todos'], ['alto', 'Alto'], ['medio', 'Medio'], ['bajo', 'Bajo']], q.level)}
      <select data-filter="status" aria-label="Estado"><option value="activo" ${q.status === 'activo' ? 'selected' : ''}>Activos</option><option value="inactivo" ${q.status === 'inactivo' ? 'selected' : ''}>Archivados</option><option value="" ${q.status === '' ? 'selected' : ''}>Todos los estados</option></select>`,
    load: q => api(`/clients?${toParams(q)}`),
    table: rows => html`<div class="table-wrap"><table>
      <thead><tr><th>Cliente</th><th class="hide-sm">Segmento</th><th>Riesgo</th><th>Nivel</th><th class="hide-sm">Estado</th><th><span class="sr-only">Abrir</span></th></tr></thead>
      <tbody>${rows.map(c => html`<tr class="is-clickable" data-id="${c.id}" tabindex="0">
        <td>${person(c.name, c.email)}</td><td class="hide-sm muted">${c.segmentName}</td>
        <td>${riskCell(c.risk)}</td><td>${levelBadge(c.risk.level)}</td><td class="hide-sm">${badge(c.status)}</td>
        <td class="actions-cell">${icon('chevron', 'row-chevron')}</td></tr>`)}</tbody></table></div>
      <div class="panel-foot">${factorLegend()}</div>`,
    empty: q => empty(q.search || q.level ? 'Ningún cliente coincide' : 'Aún no hay clientes', q.search || q.level ? 'Prueba con otro nombre o cambia el nivel de riesgo.' : 'Registra tu primer cliente para comenzar a medir su riesgo.'),
    bind: panel => panel.querySelectorAll('tr[data-id]').forEach(row => {
      const open = () => clientDetail(Number(row.dataset.id)).catch(showError);
      row.addEventListener('click', open);
      row.addEventListener('keydown', e => { if (e.key === 'Enter') open(); });
    }),
    bindHeader: main => {
      main.querySelector('[data-new]').addEventListener('click', () => clientForm({ onDone: refresh }).catch(showError));
      main.querySelector('[data-export]')?.addEventListener('click', async event => {
        const button = event.currentTarget;
        button.disabled = true;
        try {
          const params = new URLSearchParams();
          if (view.query.level) params.set('level', view.query.level);
          if (view.query.status) params.set('status', view.query.status);
          toast(`Descargado ${await download(`/reports/clients.csv?${params}`)}`);
        } catch (err) { showError(err); } finally { button.disabled = false; }
      });
    }
  });
  return view;
}
