import { api } from '../core/api.js';
import { html } from '../core/html.js';
import { avatar, badge, empty, icon, segmented } from '../core/components.js';
import { LABELS, fmt } from '../core/format.js';
import { actionDetail, showError } from '../detail.js';
import { actionForm } from '../forms.js';
import { createListView, toParams } from './list.js';

const TYPE_ICON = { contacto: 'phone', compensacion: 'gift', seguimiento: 'repeat' };
let view;

export function retentionView(refresh) {
  view ??= createListView({
    title: 'Retención',
    description: 'Acciones asignadas para recuperar la confianza de clientes en riesgo, con responsable y fecha límite.',
    noun: ['acción', 'acciones'],
    searchPlaceholder: 'Buscar por cliente, responsable o descripción',
    defaults: { status: 'pendiente' },
    onError: showError,
    actions: () => html`<button class="btn btn-primary" data-new>${icon('plus')}Asignar acción</button>`,
    filters: q => segmented('status', [['pendiente', 'Pendientes'], ['completada', 'Completadas'], ['', 'Todas']], q.status),
    load: q => api(`/retention-actions?${toParams(q)}`),
    table: rows => html`<div class="table-wrap"><table>
      <thead><tr><th>Acción</th><th class="hide-sm">Responsable</th><th>Fecha límite</th><th>Resultado</th></tr></thead>
      <tbody>${rows.map(a => html`<tr class="is-clickable" data-id="${a.id}" tabindex="0">
        <td><div class="person"><span class="avatar">${icon(TYPE_ICON[a.type])}</span><div><span class="cell-title">${a.clientName}</span><span class="cell-sub">${LABELS.actionType[a.type]} — ${a.description}</span></div></div></td>
        <td class="hide-sm"><div class="person">${avatar(a.assignedUserName)}<span>${a.assignedUserName}</span></div></td>
        <td class="nowrap ${a.overdue ? 'due-late' : ''}">${fmt.dateTime(a.dueAt)}<span class="cell-sub">${a.status === 'pendiente' ? fmt.relative(a.dueAt) : 'Completada'}</span></td>
        <td>${a.outcome ? badge(a.outcome) : a.overdue ? html`<span class="badge vencida">Vencida</span>` : badge(a.status)}</td></tr>`)}</tbody></table></div>`,
    empty: q => empty(q.status === 'pendiente' && !q.search ? 'No hay acciones pendientes' : 'Sin resultados', q.status === 'pendiente' && !q.search ? 'Asigna un seguimiento a los clientes con riesgo medio o alto.' : 'Cambia el filtro o la búsqueda.'),
    bind: panel => panel.querySelectorAll('tr[data-id]').forEach(row => {
      const open = () => actionDetail(Number(row.dataset.id)).catch(showError);
      row.addEventListener('click', open);
      row.addEventListener('keydown', e => { if (e.key === 'Enter') open(); });
    }),
    bindHeader: main => main.querySelector('[data-new]').addEventListener('click', () => actionForm({ onDone: refresh }).catch(showError))
  });
  return view;
}
