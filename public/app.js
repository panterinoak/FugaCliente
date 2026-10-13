'use strict';
const $ = selector => document.querySelector(selector);
const state = { token: sessionStorage.getItem('fc_token'), user: null, mode: '', view: 'overview', page: 1, search: '', level: '', status: '', clientId: '', catalogs: {}, users: [], allClients: [] };
const labels = { overview: 'Vista general', clients: 'Clientes', incidents: 'Incidencias', actions: 'Retención', services: 'Servicios y equipo', logs: 'Actividad' };
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const titleCase = value => String(value ?? '').replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());
const date = value => value ? new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : 'Sin fecha';
const initials = value => String(value || '?').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const privileged = () => ['admin', 'analista'].includes(state.user?.role);
const admin = () => state.user?.role === 'admin';

async function api(path, method = 'GET', body) {
  const response = await fetch('/api' + path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(state.token ? { Authorization: 'Bearer ' + state.token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (response.status === 204) return null;
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login') logout();
    const details = result.error?.details?.map(x => `${x.field}: ${x.message}`).join(' · ');
    throw new Error(details || result.error?.message || 'No se pudo completar la operación.');
  }
  return result;
}
let toastTimer;
function toast(message, error = false) { const el = $('#toast'); el.textContent = message; el.classList.toggle('error', error); el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 5500); }
function logout() { state.token = null; state.user = null; sessionStorage.removeItem('fc_token'); $('#application').hidden = true; $('#loginScreen').hidden = false; $('#modal').close(); }
async function bootstrap() {
  const health = (await api('/health')).data; state.mode = health.mode;
  $('#demoHint').hidden = state.mode !== 'demo'; $('#loginStatus').textContent = state.mode === 'demo' ? 'Demostración local disponible' : 'Servicio conectado a SQL Server y MongoDB';
  if (state.token) { state.user = (await api('/users/me')).data; await enterApp(); }
}
async function enterApp() {
  const [catalogs, users] = await Promise.all([api('/catalogs'), api('/users')]);
  state.catalogs = catalogs.data; state.users = users.data;
  $('#userName').textContent = state.user.name; $('#userRole').textContent = titleCase(state.user.role); $('#userAvatar').textContent = initials(state.user.name);
  $('#modePill').textContent = state.mode === 'demo' ? 'Demo · datos temporales' : 'SQL Server + MongoDB';
  document.querySelectorAll('[data-privileged]').forEach(el => { el.hidden = !privileged(); });
  $('#loginScreen').hidden = true; $('#application').hidden = false; await navigate('overview');
}
$('#loginForm').addEventListener('submit', async event => {
  event.preventDefault(); const button = event.target.querySelector('button'); button.disabled = true; $('#loginError').textContent = '';
  try {
    const f = new FormData(event.target); const { data } = await api('/auth/login', 'POST', { email: f.get('email'), password: f.get('password') });
    state.token = data.token; state.user = data.user; sessionStorage.setItem('fc_token', data.token); event.target.elements.password.value = '';
    await enterApp();
  } catch (err) { $('#loginError').textContent = err.message; }
  finally { button.disabled = false; }
});
$('#logoutButton').addEventListener('click', logout);
$('#mobileLogoutButton').addEventListener('click', logout);
$('#closeModal').addEventListener('click', () => $('#modal').close());
$('#refreshButton').addEventListener('click', () => render().catch(err => toast(err.message, true)));
document.querySelectorAll('[data-view]').forEach(el => el.addEventListener('click', () => navigate(el.dataset.view).catch(err => toast(err.message, true))));
function heading(title, caption, action = '', actionText = '') {
  return `<div class="page-heading"><div><span class="eyebrow">ATENCIÓN Y RETENCIÓN</span><h1>${esc(title)}</h1><p>${esc(caption)}</p></div>${action ? `<button class="button primary" data-action="${action}">+ ${esc(actionText)}</button>` : ''}</div>`;
}
function badge(value) { return `<span class="badge ${esc(value)}">${esc(titleCase(value))}</span>`; }
function score(risk) { return `<div class="score"><strong>${risk.score}</strong><span class="muted">/100</span><meter min="0" max="100" low="40" high="70" optimum="0" value="${risk.score}" aria-label="Riesgo ${risk.score} de 100"></meter></div>`; }
function person(client) { return `<div class="person-cell"><span class="avatar">${esc(initials(client.name || client.clientName))}</span><div><span class="client-name">${esc(client.name || client.clientName)}</span>${client.email ? `<span class="client-email">${esc(client.email)}</span>` : ''}</div></div>`; }
async function navigate(view) {
  state.view = view; state.page = 1; state.search = ''; state.level = ''; state.status = ''; state.clientId = '';
  document.querySelectorAll('[data-view]').forEach(el => el.classList.toggle('active', el.dataset.view === view));
  $('#breadcrumb').textContent = 'Espacio de trabajo / ' + labels[view]; await render();
}
async function render() {
  const el = $('#mainContent'); el.innerHTML = '<div class="loading">Cargando tu espacio de trabajo…</div>';
  try {
    if (state.view === 'overview') await overview(); else if (state.view === 'services') await services(); else await listView();
  } catch (err) { el.innerHTML = `<div class="error-panel">${esc(err.message)}<p class="muted">Usa el botón de actualizar para volver a intentarlo.</p></div>`; throw err; }
}
async function overview() {
  const { data: d } = await api('/dashboard');
  const rows = d.priorityClients.map(c => `<tr><td>${person(c)}</td><td>${badge(c.risk.level)}</td><td>${score(c.risk)}</td><td><button class="text-link" data-action="detail" data-id="${c.id}">Revisar ↗</button></td></tr>`).join('');
  $('#mainContent').innerHTML = heading('Cada cliente cuenta', 'Una mirada a las señales de riesgo y al trabajo pendiente.', 'newIncident', 'Registrar incidencia') +
  `<div class="stats"><article class="stat"><div class="stat-label">Clientes activos <span class="stat-icon">◎</span></div><div class="stat-value">${d.totalClients}</div><div class="stat-note">En tu cartera de atención</div></article>
  <article class="stat"><div class="stat-label">Clientes en riesgo <span class="stat-icon">↗</span></div><div class="stat-value">${d.atRisk}</div><div class="stat-note highlight">${d.distribution.alto} requieren prioridad</div></article>
  <article class="stat"><div class="stat-label">Incidencias pendientes <span class="stat-icon">⚑</span></div><div class="stat-value">${d.openIncidents}</div><div class="stat-note">Abiertas o en proceso</div></article>
  <article class="stat"><div class="stat-label">Acciones por completar <span class="stat-icon">✓</span></div><div class="stat-value">${d.pendingActions}</div><div class="stat-note">${d.overdueActions} fuera de plazo</div></article></div>
  <div class="dashboard-grid"><section class="card"><div class="card-head"><div><h2>Clientes que necesitan atención</h2><p>Prioridad según el puntaje actual</p></div><button class="text-link" data-action="goClients">Ver clientes ↗</button></div>
  ${rows ? `<div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Nivel</th><th>Puntaje</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty"><strong>No hay alertas activas</strong>Continúa registrando y atendiendo las experiencias de tus clientes.</div>'}
  <div class="meta-note">Satisfacción, incidencias, recurrencia, gravedad y plazo de atención.</div></section>
  <section class="card"><div class="card-head"><div><h2>Distribución de riesgo</h2><p>Todos tus clientes activos</p></div></div><div class="card-body"><div class="chart-area"><canvas id="riskChart" width="400" height="400" aria-label="Distribución: ${d.distribution.alto} alto, ${d.distribution.medio} medio, ${d.distribution.bajo} bajo" role="img"></canvas><div class="chart-center"><strong>${d.totalClients}</strong><span>CLIENTES ACTIVOS</span></div></div>
  <div class="legend">${['alto', 'medio', 'bajo'].map(level => `<div class="legend-line"><span class="dot ${level}"></span>${titleCase(level)}<strong>${d.distribution[level]}</strong></div>`).join('')}</div></div></section></div>
  <div class="insight-row"><span class="insight-icon">↗</span><div><h3>Convierte una señal en una acción</h3><p>Asigna un responsable, define una fecha y registra el resultado del seguimiento.</p></div><button class="button" data-action="newAction">Crear seguimiento</button></div>`;
  const ctx = $('#riskChart').getContext('2d'); ctx.lineWidth = 34;
  ctx.strokeStyle = '#25313d'; ctx.beginPath(); ctx.arc(200, 200, 145, 0, Math.PI * 2); ctx.stroke();
  let angle = -Math.PI / 2;
  for (const [level, color] of [['alto', '#fb8e99'], ['medio', '#f3c677'], ['bajo', '#6ee7bf']]) {
    const portion = d.totalClients ? d.distribution[level] / d.totalClients * Math.PI * 2 : 0;
    if (portion > 0) { ctx.strokeStyle = color; ctx.beginPath(); ctx.arc(200, 200, 145, angle + .025, angle + portion - .025); ctx.stroke(); angle += portion; }
  }
}
function table(headers, rows, emptyTitle) { return `<div class="table-wrap"><table><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>${rows ? '' : `<div class="empty"><strong>${esc(emptyTitle)}</strong>Registra información o cambia los filtros para ver resultados.</div>`}`; }
function pagination(p) { return `<div class="pagination"><span>${p.total} registros · Página ${p.pages ? p.page : 0} de ${p.pages}</span><div class="pagination-buttons"><button class="button small" data-action="previous" ${p.page <= 1 ? 'disabled' : ''}>Anterior</button><button class="button small" data-action="next" ${p.page >= p.pages ? 'disabled' : ''}>Siguiente</button></div></div>`; }
function query() { const q = new URLSearchParams({ page: state.page, limit: 20 }); for (const key of ['search', 'level', 'status', 'clientId']) if (state[key]) q.set(key, state[key]); return q; }
function option(value, label, selected) { return `<option value="${esc(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${esc(label)}</option>`; }
async function listView() {
  const view = state.view;
  const path = { clients: '/clients', incidents: '/incidents', actions: '/retention-actions', logs: '/logs' }[view];
  const { data, pagination: p } = await api(path + '?' + query());
  const description = { clients: 'Revisa el riesgo, conoce el historial y decide el siguiente paso.', incidents: 'Registra lo ocurrido y acompaña cada caso hasta su resolución.', actions: 'Organiza el seguimiento y conserva el resultado de cada intervención.', logs: 'Consulta los eventos registrados y la trazabilidad del sistema.' }[view];
  const action = { clients: 'newClient', incidents: 'newIncident', actions: 'newAction', logs: '' }[view];
  const actionText = { clients: 'Agregar cliente', incidents: 'Registrar incidencia', actions: 'Crear acción' }[view];
  const statuses = { clients: ['activo', 'inactivo'], incidents: ['abierta', 'en_proceso', 'resuelta'], actions: ['pendiente', 'completada'] }[view];
  let filters = `<input id="searchBox" class="search-input" aria-label="Buscar registros" placeholder="Buscar por nombre o descripción…" value="${esc(state.search)}">`;
  if (view === 'clients') filters += `<select id="levelFilter" aria-label="Nivel de riesgo">${option('', 'Todos los niveles', state.level)}${['alto', 'medio', 'bajo'].map(x => option(x, 'Riesgo ' + x, state.level)).join('')}</select>`;
  if (statuses) filters += `<select id="statusFilter" aria-label="Estado">${option('', 'Todos los estados', state.status)}${statuses.map(x => option(x, titleCase(x), state.status)).join('')}</select>`;
  if (view === 'logs') {
    await loadAllClients(); filters = `<select id="clientFilter" aria-label="Filtrar por cliente">${option('', 'Todos los eventos', state.clientId)}${state.allClients.map(c => option(c.id, c.name, state.clientId)).join('')}</select>`;
  }
  let headers, rows;
  if (view === 'clients') {
    headers = ['Cliente', 'Segmento', 'Nivel de riesgo', 'Puntaje', 'Estado', ''];
    rows = data.map(c => `<tr><td>${person(c)}</td><td class="muted">${esc(c.segmentName)}</td><td>${badge(c.risk.level)}</td><td>${score(c.risk)}</td><td>${badge(c.status)}</td><td><button class="text-link" data-action="detail" data-id="${c.id}">Ver detalle ↗</button></td></tr>`).join('');
  } else if (view === 'incidents') {
    headers = ['Caso y cliente', 'Servicio', 'Gravedad', 'Estado', 'Registro', ''];
    rows = data.map(i => `<tr><td><strong>#${i.id} · ${esc(i.clientName)}</strong><span class="client-email">${esc(i.description.slice(0, 65))}${i.description.length > 65 ? '…' : ''}</span></td><td class="muted">${esc(i.serviceName)}</td><td>${['', 'Leve', 'Moderada', 'Grave'][i.severity]}</td><td>${badge(i.status)}</td><td class="muted">${date(i.createdAt)}</td><td><button class="text-link" data-action="incident" data-id="${i.id}">${i.status === 'resuelta' ? 'Ver caso' : 'Actualizar'} ↗</button></td></tr>`).join('');
  } else if (view === 'actions') {
    headers = ['Cliente y acción', 'Responsable', 'Fecha límite', 'Estado', ''];
    rows = data.map(a => `<tr><td><strong>${esc(a.clientName)}</strong><span class="client-email">${titleCase(a.type)} · ${esc(a.description.slice(0, 55))}</span></td><td class="muted">${esc(a.assignedUserName)}</td><td class="muted">${date(a.dueAt)}</td><td>${badge(a.status)}${a.outcome ? `<span class="client-email">${esc(titleCase(a.outcome))}</span>` : ''}</td><td><button class="text-link" data-action="action" data-id="${a.id}">Ver acción ↗</button></td></tr>`).join('');
  } else {
    headers = ['Evento', 'Recurso', 'Fecha', 'Detalle'];
    rows = data.map(e => `<tr><td class="event-kind">${esc(e.eventType)}</td><td class="muted">${esc(e.entity)} ${esc(e.entityId ?? '')}</td><td class="muted">${date(e.occurredAt)}</td><td class="details-preview">${esc(JSON.stringify(e.payload))}</td></tr>`).join('');
  }
  $('#mainContent').innerHTML = heading(labels[view], description, action, actionText) + `<div class="toolbar">${filters}<span class="muted">${p.total} registros</span></div><section class="card">${table(headers, rows, 'No hay registros para estos filtros')}${pagination(p)}</section>`;
  let debounce;
  $('#searchBox')?.addEventListener('input', event => { state.search = event.target.value; state.page = 1; clearTimeout(debounce); debounce = setTimeout(() => listView().then(() => { const box = $('#searchBox'); box?.focus(); box?.setSelectionRange(box.value.length, box.value.length); }).catch(err => toast(err.message, true)), 450); });
  for (const [id, key] of [['levelFilter', 'level'], ['statusFilter', 'status'], ['clientFilter', 'clientId']]) $('#' + id)?.addEventListener('change', event => { state[key] = event.target.value; state.page = 1; void render().catch(err => toast(err.message, true)); });
}
async function services() {
  const [services, users] = await Promise.all([api('/services'), api('/users')]); state.users = users.data;
  const serviceRows = services.data.map(s => `<tr><td>${esc(s.name)}</td><td>${s.slaHours} horas</td><td>${s.active ? badge('activo') : badge('inactivo')}</td></tr>`).join('');
  const userRows = users.data.map(u => `<tr><td><strong>${esc(u.name)}</strong><span class="client-email">${esc(u.email)}</span></td><td>${esc(titleCase(u.role))}</td></tr>`).join('');
  $('#mainContent').innerHTML = heading('Servicios y equipo', 'Los plazos de atención y las personas responsables del seguimiento.') +
    `<div class="catalog-grid"><section class="card"><div class="card-head"><div><h2>Servicios</h2><p>Plazo máximo antes de vencer el SLA</p></div>${admin() ? '<button class="button small" data-action="newService">+ Servicio</button>' : ''}</div>${table(['Servicio', 'SLA', 'Estado'], serviceRows, 'Sin servicios')}</section>
    <section class="card"><div class="card-head"><div><h2>Equipo</h2><p>Usuarios con acceso al sistema</p></div>${admin() ? '<button class="button small" data-action="newUser">+ Usuario</button>' : ''}</div>${table(['Usuario', 'Rol'], userRows, 'Sin usuarios')}</section></div>`;
}
function modal(title, html) { $('#modalTitle').textContent = title; $('#modalContent').innerHTML = html; if (!$('#modal').open) $('#modal').showModal(); }
async function loadAllClients() {
  const clients = []; let page = 1, pages;
  do { const r = await api(`/clients?limit=100&page=${page}`); clients.push(...r.data); pages = r.pagination.pages; page++; } while (page <= pages);
  state.allClients = clients;
}
async function detail(id) {
  modal('Detalle del cliente', '<div class="loading">Cargando historial…</div>');
  const [profile, incidents, comments] = await Promise.all([api(`/clients/${id}/risk`), api(`/incidents?clientId=${id}&limit=20`), api(`/clients/${id}/comments?limit=20`)]);
  const { client: c, risk: r } = profile.data;
  modal(c.name, `<div class="detail-summary"><div class="detail-score ${r.level}"><strong>${r.score}</strong><small>DE 100</small></div><div>${badge(r.level)}<p>${esc(r.recommendation)}</p></div></div>
    <p class="inline-note">${esc(c.email)} · ${esc(c.segmentName)} · ${esc(titleCase(c.status))}${c.phone ? ' · ' + esc(c.phone) : ''}</p>
    ${r.factors.map(f => `<div class="factor-row"><div><span>${esc(f.label)}</span><small>${esc(f.detail)}</small></div><progress max="${f.max}" value="${f.points}" aria-label="${esc(f.label)}"></progress><strong>+${f.points}</strong></div>`).join('')}
    <p class="inline-note">Reglas explicables · ventana de ${r.windowDays} días para historial reciente. Las incidencias pendientes de mayor antigüedad también se consideran.</p>
    <div class="detail-buttons">${c.status === 'activo' ? `<button class="button small primary" data-action="newIncident" data-client="${id}">+ Incidencia</button><button class="button small" data-action="newAction" data-client="${id}">+ Seguimiento</button>` : ''}${privileged() ? `<button class="button small" data-action="editClient" data-id="${id}">Editar cliente</button>` : ''}</div>
    <div class="section-subhead"><h3>Incidencias recientes</h3><span class="muted">${incidents.pagination.total} casos</span></div>
    ${incidents.data.map(i => `<div class="detail-item"><div class="detail-item-meta"><span>#${i.id} · ${esc(i.serviceName)}</span>${badge(i.status)}</div><p>${esc(i.description)}</p><div class="detail-item-meta"><span>${date(i.createdAt)} · Satisfacción: ${i.satisfaction ?? 'Sin calificación'}${i.satisfaction ? '/5' : ''}</span><button class="text-link" data-action="incident" data-id="${i.id}">Ver caso ↗</button></div></div>`).join('') || '<p class="inline-note">Este cliente todavía no tiene incidencias.</p>'}
    <div class="section-subhead"><h3>Comentarios y notas</h3><button class="text-link" data-action="newComment" data-client="${id}">+ Agregar nota</button></div>
    ${comments.data.map(c => `<div class="detail-item"><div class="detail-item-meta"><span>${esc(c.authorName)} · ${esc(c.channel)}</span><span>${date(c.createdAt)}</span></div><p>${esc(c.text)}</p></div>`).join('') || '<p class="inline-note">Sin notas registradas.</p>'}
    ${(incidents.pagination.total > 20 || comments.pagination.total > 20) ? '<p class="inline-note">Se muestran los 20 registros más recientes de cada historial. El API permite consultar las páginas restantes.</p>' : ''}`);
}
function field(label, input, full = false) {
  const name = /name="([^"]+)"/.exec(input)?.[1];
  const id = 'field_' + name;
  const control = input.replace(/^<(input|select|textarea)/, `<$1 id="${id}"`);
  return `<div class="${full ? 'full' : ''}"><label for="${id}">${label}</label>${control}</div>`;
}
function select(name, rows, key = 'name', selected = '') { return `<select name="${name}" required>${rows.map(r => option(r.id, r[key], selected)).join('')}</select>`; }
async function form(kind, clientId = '', entityId = '') {
  let fields = '', title, path, method = 'POST', original;
  const cats = state.catalogs;
  if (['newIncident', 'newAction'].includes(kind)) await loadAllClients();
  if (kind === 'newClient' || kind === 'editClient') {
    original = entityId ? (await api(`/clients/${entityId}`)).data : {};
    title = entityId ? 'Editar cliente' : 'Agregar cliente'; path = entityId ? `/clients/${entityId}` : '/clients'; method = entityId ? 'PATCH' : 'POST';
    fields = field('Nombre o razón social', `<input name="name" minlength="2" maxlength="150" required value="${esc(original.name)}">`, true) + field('Correo', `<input name="email" type="email" required value="${esc(original.email)}">`) + field('Teléfono opcional', `<input name="phone" placeholder="+51 999 999 999" value="${esc(original.phone)}">`) + field('Segmento', select('segmentId', cats.segments, 'name', original.segmentId)) + field('Estado', `<select name="status">${option('activo', 'Activo', original.status || 'activo')}${option('inactivo', 'Inactivo', original.status)}</select>`);
  } else if (kind === 'newIncident') {
    title = 'Registrar incidencia'; path = '/incidents';
    fields = field('Cliente', select('clientId', state.allClients.filter(c => c.status === 'activo'), 'name', clientId), true) + field('Servicio', select('serviceId', cats.services.filter(s => s.active))) + field('Categoría', select('categoryId', cats.categories)) + field('Gravedad', '<select name="severity"><option value="1">1 · Leve</option><option value="2">2 · Moderada</option><option value="3">3 · Grave</option></select>') + field('Satisfacción del cliente', '<select name="satisfaction"><option value="">Sin calificación</option><option value="1">1 · Muy insatisfecho</option><option value="2">2 · Insatisfecho</option><option value="3">3 · Neutral</option><option value="4">4 · Satisfecho</option><option value="5">5 · Muy satisfecho</option></select>') + field('Responsable', select('assignedUserId', state.users.filter(u => u.active), 'name', state.user.id), true) + field('Describe lo ocurrido', '<textarea name="description" minlength="10" maxlength="2000" required placeholder="Explica qué ocurrió y qué espera el cliente."></textarea>', true);
  } else if (kind === 'newAction') {
    title = 'Crear acción de retención'; path = '/retention-actions';
    fields = field('Cliente', select('clientId', state.allClients.filter(c => c.status === 'activo'), 'name', clientId), true) + field('Responsable', select('assignedUserId', state.users.filter(u => u.active), 'name', state.user.id)) + field('Tipo de acción', '<select name="type"><option value="contacto">Contacto</option><option value="compensacion">Compensación</option><option value="seguimiento">Seguimiento</option></select>') + field('Fecha y hora límite', '<input name="dueAt" type="datetime-local" required>', true) + field('Acción que se realizará', '<textarea name="description" minlength="10" maxlength="2000" required></textarea>', true);
  } else if (kind === 'newComment') {
    title = 'Agregar nota al cliente'; path = `/clients/${clientId}/comments`;
    fields = field('Canal', '<select name="channel"><option value="interno">Nota interna</option><option value="telefono">Teléfono</option><option value="correo">Correo</option><option value="web">Web</option></select>', true) + field('Comentario', '<textarea name="text" minlength="2" maxlength="3000" required></textarea>', true);
  } else if (kind === 'newService') {
    title = 'Agregar servicio'; path = '/services'; fields = field('Nombre', '<input name="name" minlength="2" maxlength="100" required>', true) + field('Plazo de atención en horas', '<input name="slaHours" type="number" min="1" max="720" value="24" required>', true);
  } else if (kind === 'newUser') {
    title = 'Agregar usuario'; path = '/users'; fields = field('Nombre', '<input name="name" minlength="2" maxlength="100" required>', true) + field('Correo', '<input name="email" type="email" required>', true) + field('Contraseña de al menos 12 caracteres', '<input name="password" type="password" autocomplete="new-password" minlength="12" maxlength="72" required>') + field('Rol', '<select name="role"><option value="agente">Agente</option><option value="analista">Analista</option><option value="admin">Administrador</option></select>');
  }
  if (['newIncident', 'newAction'].includes(kind) && !state.allClients.some(c => c.status === 'activo')) { modal(title, '<p class="inline-note">Agrega un cliente activo antes de registrar esta información.</p><button class="button primary" data-action="newClient">Agregar cliente</button>'); return; }
  modal(title, `<form id="recordForm"><div class="form-grid">${fields}</div><p id="formError" class="form-error" role="alert"></p><div class="form-actions"><button class="button" type="button" data-action="close">Cancelar</button><button class="button primary" type="submit">Guardar</button></div></form>`);
  $('#recordForm').addEventListener('submit', async event => {
    event.preventDefault(); const submit = event.target.querySelector('[type=submit]'); submit.disabled = true; $('#formError').textContent = '';
    try {
      const input = Object.fromEntries(new FormData(event.target));
      for (const key of ['clientId', 'segmentId', 'serviceId', 'categoryId', 'severity', 'slaHours', 'assignedUserId']) if (key in input) input[key] = Number(input[key]);
      if ('satisfaction' in input) input.satisfaction = input.satisfaction ? Number(input.satisfaction) : null;
      if ('phone' in input) input.phone = input.phone.trim() || null;
      if ('dueAt' in input) input.dueAt = new Date(input.dueAt).toISOString();
      if (kind === 'newAction') input.incidentId = null;
      await api(path, method, input); $('#modal').close(); toast('Información guardada correctamente.');
      if (['newService', 'newUser'].includes(kind)) { state.catalogs = (await api('/catalogs')).data; state.users = (await api('/users')).data; }
      await render(); if (clientId && ['newComment', 'editClient'].includes(kind)) await detail(Number(clientId));
    } catch (err) { $('#formError') ? $('#formError').textContent = err.message : toast(err.message, true); }
    finally { submit.disabled = false; }
  });
}
async function incident(id) {
  const { data: i } = await api(`/incidents/${id}`);
  modal(`Incidencia #${i.id}`, `<p>${esc(i.clientName)} · ${esc(i.serviceName)}</p><p class="muted">${esc(i.description)}</p><p class="inline-note">Gravedad ${i.severity} · ${esc(i.categoryName)} · Satisfacción ${i.satisfaction ?? 'sin calificación'} · ${date(i.createdAt)}</p><p>${badge(i.status)}</p>
  ${i.status !== 'resuelta' ? `<form id="incidentForm"><label>Nuevo estado<select name="status">${i.status === 'abierta' ? '<option value="en_proceso">En proceso</option>' : ''}<option value="resuelta">Resuelta</option></select></label><p class="inline-note">Resolver el caso elimina sus puntos por pendiente y por plazo vencido. La experiencia reciente continúa en el historial.</p><p id="formError" class="form-error" role="alert"></p><div class="form-actions"><button class="button primary" type="submit">Actualizar estado</button></div></form>` : `<p class="inline-note">Resuelta el ${date(i.resolvedAt)}. El historial se conserva.</p>`}`);
  $('#incidentForm')?.addEventListener('submit', async e => {
    e.preventDefault(); const button = e.target.querySelector('button'); button.disabled = true;
    try { await api(`/incidents/${id}`, 'PATCH', { status: new FormData(e.target).get('status'), expectedVersion: i.version }); $('#modal').close(); toast('Estado actualizado.'); await render(); }
    catch (err) { $('#formError') ? $('#formError').textContent = err.message : toast(err.message, true); } finally { button.disabled = false; }
  });
}
async function action(id) {
  const { data: a } = await api(`/retention-actions/${id}`);
  modal(`Acción #${a.id}`, `<p>${esc(a.clientName)} · ${esc(titleCase(a.type))}</p><p class="muted">${esc(a.description)}</p><p class="inline-note">Responsable: ${esc(a.assignedUserName)} · Fecha límite: ${date(a.dueAt)}</p><p>${badge(a.status)}</p>
  ${a.status === 'pendiente' ? '<form id="actionForm"><label>Resultado de la intervención<select name="outcome"><option value="contactado">Cliente contactado</option><option value="recuperado">Cliente recuperado</option><option value="sin_respuesta">Sin respuesta</option></select></label><p id="formError" class="form-error" role="alert"></p><div class="form-actions"><button class="button primary" type="submit">Completar acción</button></div></form>' : `<p class="inline-note">Resultado: ${esc(titleCase(a.outcome))} · ${date(a.completedAt)}</p>`}`);
  $('#actionForm')?.addEventListener('submit', async e => { e.preventDefault(); const button = e.target.querySelector('button'); button.disabled = true;
    try { await api(`/retention-actions/${id}`, 'PATCH', { outcome: new FormData(e.target).get('outcome') }); $('#modal').close(); toast('Resultado registrado.'); await render(); }
    catch (err) { $('#formError') ? $('#formError').textContent = err.message : toast(err.message, true); } finally { button.disabled = false; }
  });
}
document.addEventListener('click', event => {
  const button = event.target.closest('[data-action]'); if (!button || button.disabled) return;
  void (async () => {
    const { action: act, id, client } = button.dataset;
    if (act === 'close') $('#modal').close();
    else if (act === 'goClients') await navigate('clients');
    else if (act === 'detail') await detail(Number(id));
    else if (act === 'incident') await incident(Number(id));
    else if (act === 'action') await action(Number(id));
    else if (act === 'next' || act === 'previous') { state.page += act === 'next' ? 1 : -1; await render(); }
    else await form(act, client || (act === 'editClient' ? id : ''), id || '');
  })().catch(err => toast(err.message, true));
});
void bootstrap().catch(err => { $('#loginStatus').textContent = 'Servicio no disponible'; $('#loginError').textContent = err.message; });
