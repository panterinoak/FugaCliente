import { api } from '../core/api.js';
import { html, mount } from '../core/html.js';
import { badge, icon, person } from '../core/components.js';
import { LABELS } from '../core/format.js';
import { can, session, store } from '../core/state.js';
import { showError } from '../detail.js';
import { serviceForm, userForm } from '../forms.js';

export async function teamView(main, { reloadCatalogs }) {
  const [services, users] = await Promise.all([api('/services'), api('/users')]);
  store.users = users.data;
  const admin = can.admin();

  mount(main, html`
    <div class="page-head"><div><h1>Equipo y servicios</h1><p>Los servicios definen el plazo de atención (SLA) que usa el puntaje; el equipo atiende incidencias y acciones.</p></div></div>
    <div class="grid-team">
      <section class="panel table-panel">
        <div class="panel-head"><div><h2>Servicios</h2><p>${services.data.length} servicios · superar el SLA suma 10 puntos</p></div>${admin ? html`<button class="btn btn-sm" data-new-service>${icon('plus')}Servicio</button>` : ''}</div>
        <div class="table-wrap"><table><thead><tr><th>Servicio</th><th>SLA</th><th>Estado</th>${admin ? html`<th><span class="sr-only">Editar</span></th>` : ''}</tr></thead>
          <tbody>${services.data.map(s => html`<tr><td><span class="cell-title">${s.name}</span></td><td class="num">${s.slaHours} h</td><td>${badge(s.active ? 'activo' : 'inactivo', s.active ? 'Activo' : 'Inactivo')}</td>
            ${admin ? html`<td class="actions-cell"><button class="icon-btn" data-edit-service="${s.id}" aria-label="Editar ${s.name}">${icon('edit')}</button></td>` : ''}</tr>`)}</tbody></table></div>
      </section>
      <section class="panel table-panel">
        <div class="panel-head"><div><h2>Equipo</h2><p>${users.data.filter(u => u.active).length} personas con acceso</p></div>${admin ? html`<button class="btn btn-sm" data-new-user>${icon('plus')}Usuario</button>` : ''}</div>
        <div class="table-wrap"><table><thead><tr><th>Persona</th><th>Rol</th><th>Acceso</th>${admin ? html`<th><span class="sr-only">Editar</span></th>` : ''}</tr></thead>
          <tbody>${users.data.map(u => html`<tr><td>${person(u.name, u.email)}</td><td><span class="role-chip">${LABELS.role[u.role]}</span></td>
            <td class="nowrap">${badge(u.active ? 'activo' : 'inactivo', u.active ? 'Habilitado' : 'Deshabilitado')}</td>
            ${admin ? html`<td class="actions-cell">${u.id === session.user.id ? html`<span class="muted">Tú</span>` : html`<button class="icon-btn" data-edit-user="${u.id}" aria-label="Editar ${u.name}">${icon('edit')}</button>`}</td>` : ''}</tr>`)}</tbody></table></div>
        <div class="panel-foot">Administrador: todo. Analista: edita clientes y consulta auditoría. Agente: registra y atiende casos.</div>
      </section>
    </div>`);

  const done = async () => {
    await reloadCatalogs();
    await teamView(main, { reloadCatalogs });
  };
  main.querySelector('[data-new-service]')?.addEventListener('click', () => serviceForm({ onDone: done }));
  main.querySelector('[data-new-user]')?.addEventListener('click', () => userForm({ onDone: done }));
  main.querySelectorAll('[data-edit-service]').forEach(b => b.addEventListener('click', () => {
    serviceForm({ service: services.data.find(s => s.id === Number(b.dataset.editService)), onDone: done });
  }));
  main.querySelectorAll('[data-edit-user]').forEach(b => b.addEventListener('click', () => {
    userForm({ user: users.data.find(u => u.id === Number(b.dataset.editUser)), onDone: done });
  }));
  void showError;
}
