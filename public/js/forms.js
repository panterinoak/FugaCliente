/** Formularios de alta y edición. Validación nativa + errores del API mostrados por campo. */
import { api, fetchAll } from './core/api.js';
import { html, raw, $ } from './core/html.js';
import { LABELS, fmt } from './core/format.js';
import { options } from './core/components.js';
import { busy, closeModal, openModal, toast } from './core/overlay.js';
import { session, store } from './core/state.js';

const NUMERIC = ['clientId', 'segmentId', 'serviceId', 'categoryId', 'severity', 'slaHours', 'assignedUserId'];

const field = (label, control, { span = false, hint = '' } = {}) => {
  const name = /name="([^"]+)"/.exec(String(control))?.[1];
  const id = `f_${name}`;
  const withId = raw(String(control).replace(/^<(input|select|textarea)/, `<$1 id="${id}" aria-describedby="${id}_err"`));
  return html`<div class="field ${span ? 'span-2' : ''}"><label for="${id}">${label}</label>${withId}${hint ? html`<span class="field-hint">${hint}</span>` : ''}<span class="form-error" id="${id}_err"></span></div>`;
};

function readForm(form) {
  const data = Object.fromEntries(new FormData(form));
  for (const key of NUMERIC) if (key in data) data[key] = data[key] === '' ? null : Number(data[key]);
  if ('satisfaction' in data) data.satisfaction = data.satisfaction ? Number(data.satisfaction) : null;
  if ('phone' in data) data.phone = data.phone.trim() || null;
  if ('dueAt' in data) data.dueAt = new Date(data.dueAt).toISOString();
  return data;
}

/** Validación previa en español (evita los mensajes nativos del navegador). */
export function validateForm(form) {
  const details = [];
  for (const el of form.elements) {
    if (!el.name || el.validity.valid) continue;
    const v = el.validity;
    let message = 'Revisa este campo.';
    if (v.valueMissing) message = 'Este campo es obligatorio.';
    else if (v.tooShort) message = `Escribe al menos ${el.minLength} caracteres (llevas ${el.value.length}).`;
    else if (v.tooLong) message = `Máximo ${el.maxLength} caracteres.`;
    else if (v.typeMismatch && el.type === 'email') message = 'Escribe un correo válido, por ejemplo nombre@empresa.com.';
    else if (v.rangeUnderflow) message = `El valor mínimo es ${el.min}.`;
    else if (v.rangeOverflow) message = `El valor máximo es ${el.max}.`;
    else if (v.badInput) message = 'Formato no válido.';
    if (!details.some(d => d.field === el.name)) details.push({ field: el.name, message });
  }
  showErrors(form, { message: '', details });
  return details.length === 0;
}

function showErrors(form, error) {
  form.querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
  form.querySelectorAll('.field .form-error').forEach(el => { el.textContent = ''; });
  let unplaced = [];
  for (const detail of error.details || []) {
    const input = form.elements[detail.field];
    const slot = input && $(`#${input.id}_err`, form);
    if (slot) {
      input.setAttribute('aria-invalid', 'true');
      slot.textContent = detail.message;
    } else unplaced.push(detail.message);
  }
  $('[data-form-error]', form).textContent = unplaced.length ? unplaced.join(' · ') : (error.details?.length ? '' : error.message);
  form.querySelector('[aria-invalid="true"]')?.focus();
}

/**
 * Abre un formulario modal. `submit(data)` recibe los valores ya tipados.
 * Al guardar: cierra, avisa y ejecuta `onDone`.
 */
function formDialog({ title, lead = '', fields, submitLabel, submit, success, onDone }) {
  const body = openModal(title, html`${lead ? html`<p class="lead">${lead}</p>` : ''}
    <form novalidate><div class="form-grid">${fields}</div><p class="form-error" data-form-error role="alert"></p>
    <div class="form-actions"><button class="btn" type="button" data-close>Cancelar</button><button class="btn btn-primary" type="submit">${submitLabel}</button></div></form>`);
  const form = body.querySelector('form');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!validateForm(form)) return;
    try {
      const result = await busy(form.querySelector('[type=submit]'), () => submit(readForm(form)));
      closeModal();
      toast(success);
      await onDone?.(result);
    } catch (err) {
      showErrors(form, err);
    }
  });
}

const activeClients = async () => (await fetchAll('/clients?status=activo')).sort((a, b) => a.name.localeCompare(b.name, 'es'));
const activeUsers = () => store.users.filter(u => u.active);

function noActiveClients(title) {
  openModal(title, html`<p class="lead">Primero registra un cliente activo; las incidencias y los seguimientos siempre pertenecen a un cliente.</p>
    <div class="form-actions"><button class="btn" data-close type="button">Cerrar</button></div>`, { size: 'modal-sm' });
}

export async function clientForm({ id = null, onDone } = {}) {
  const current = id ? (await api(`/clients/${id}`)).data : { status: 'activo' };
  formDialog({
    title: id ? 'Editar cliente' : 'Nuevo cliente',
    lead: id ? '' : 'El riesgo se calcula automáticamente a partir de sus incidencias.',
    submitLabel: id ? 'Guardar cambios' : 'Registrar cliente',
    success: id ? 'Cliente actualizado.' : 'Cliente registrado.',
    fields: html`
      ${field('Nombre o razón social', html`<input name="name" required minlength="2" maxlength="150" value="${current.name || ''}" autocomplete="off">`, { span: true })}
      ${field('Correo electrónico', html`<input name="email" type="email" required maxlength="254" value="${current.email || ''}">`)}
      ${field('Teléfono', html`<input name="phone" inputmode="tel" maxlength="25" placeholder="+51 999 999 999" value="${current.phone || ''}">`, { hint: 'Opcional' })}
      ${field('Segmento', html`<select name="segmentId" required>${options(store.catalogs.segments, current.segmentId)}</select>`)}
      ${field('Estado', html`<select name="status">${options([{ id: 'activo', name: 'Activo' }, { id: 'inactivo', name: 'Archivado' }], current.status)}</select>`)}`,
    submit: data => (id ? api(`/clients/${id}`, { method: 'PATCH', body: data }) : api('/clients', { method: 'POST', body: data })),
    onDone
  });
}

export async function incidentForm({ clientId = '', onDone } = {}) {
  const clients = await activeClients();
  if (!clients.length) return noActiveClients('Registrar incidencia');
  formDialog({
    title: 'Registrar incidencia',
    lead: 'Describe la experiencia del cliente. El puntaje de riesgo se actualiza al guardar.',
    submitLabel: 'Registrar incidencia',
    success: 'Incidencia registrada. El riesgo del cliente se recalculó.',
    fields: html`
      ${field('Cliente', html`<select name="clientId" required>${options(clients, clientId)}</select>`, { span: true })}
      ${field('Servicio', html`<select name="serviceId" required>${options(store.catalogs.services.filter(s => s.active), '', { label: s => `${s.name} · SLA ${s.slaHours} h` })}</select>`)}
      ${field('Motivo', html`<select name="categoryId" required>${options(store.catalogs.categories, '')}</select>`)}
      <div class="field span-2"><span class="field-label">Gravedad</span><div class="choice-row">
        ${[1, 2, 3].map(v => html`<label class="choice"><input type="radio" name="severity" value="${v}" ${v === 2 ? raw('checked') : ''} required><span>${v} · ${LABELS.severity[v]}</span></label>`)}
      </div></div>
      ${field('Satisfacción declarada', html`<select name="satisfaction"><option value="">Sin calificación</option>${[1, 2, 3, 4, 5].map(v => html`<option value="${v}">${v} · ${LABELS.satisfaction[v]}</option>`)}</select>`)}
      ${field('Responsable', html`<select name="assignedUserId">${options(activeUsers(), session.user.id)}</select>`)}
      ${field('Qué ocurrió', html`<textarea name="description" required minlength="10" maxlength="2000" placeholder="Qué pasó, desde cuándo y qué espera el cliente."></textarea>`, { span: true })}`,
    submit: data => api('/incidents', { method: 'POST', body: data }),
    onDone
  });
}

export async function actionForm({ clientId = '', onDone } = {}) {
  const clients = await activeClients();
  if (!clients.length) return noActiveClients('Asignar seguimiento');
  formDialog({
    title: 'Asignar acción de retención',
    lead: 'Define quién contactará al cliente, cómo y hasta cuándo.',
    submitLabel: 'Asignar acción',
    success: 'Acción de retención asignada.',
    fields: html`
      ${field('Cliente', html`<select name="clientId" required>${options(clients, clientId)}</select>`, { span: true })}
      <div class="field span-2"><span class="field-label">Tipo de acción</span><div class="choice-row">
        ${Object.entries(LABELS.actionType).map(([value, label], i) => html`<label class="choice"><input type="radio" name="type" value="${value}" ${i === 0 ? raw('checked') : ''}><span>${label}</span></label>`)}
      </div></div>
      ${field('Responsable', html`<select name="assignedUserId" required>${options(activeUsers(), session.user.id)}</select>`)}
      ${field('Fecha límite', html`<input name="dueAt" type="datetime-local" required value="${fmt.tomorrowInput()}">`)}
      ${field('Qué se hará', html`<textarea name="description" required minlength="10" maxlength="2000" placeholder="Por ejemplo: llamar para confirmar la solución y ofrecer un descuento."></textarea>`, { span: true })}`,
    submit: data => api('/retention-actions', { method: 'POST', body: { ...data, incidentId: null } }),
    onDone
  });
}

export function commentForm({ clientId, onDone }) {
  formDialog({
    title: 'Agregar nota',
    lead: 'Las notas se guardan en MongoDB con autor, canal y fecha.',
    submitLabel: 'Guardar nota',
    success: 'Nota guardada.',
    fields: html`
      <div class="field span-2"><span class="field-label">Canal</span><div class="choice-row">
        ${Object.entries(LABELS.channel).map(([value, label], i) => html`<label class="choice"><input type="radio" name="channel" value="${value}" ${i === 0 ? raw('checked') : ''}><span>${label}</span></label>`)}
      </div></div>
      ${field('Nota', html`<textarea name="text" required minlength="2" maxlength="3000"></textarea>`, { span: true })}`,
    submit: data => api(`/clients/${clientId}/comments`, { method: 'POST', body: data }),
    onDone
  });
}

export function serviceForm({ service = null, onDone } = {}) {
  formDialog({
    title: service ? `Editar ${service.name}` : 'Nuevo servicio',
    lead: 'El SLA es el plazo máximo para atender una incidencia; superarlo suma 10 puntos de riesgo.',
    submitLabel: service ? 'Guardar cambios' : 'Crear servicio',
    success: service ? 'Servicio actualizado.' : 'Servicio creado.',
    fields: html`
      ${field('Nombre', html`<input name="name" required minlength="2" maxlength="100" value="${service?.name || ''}">`, { span: true })}
      ${field('SLA en horas', html`<input name="slaHours" type="number" min="1" max="720" required value="${service?.slaHours || 24}">`, { span: !service })}
      ${service ? field('Estado', html`<select name="active">${options([{ id: 'true', name: 'Activo' }, { id: 'false', name: 'Inactivo' }], String(service.active))}</select>`) : ''}`,
    submit: data => {
      if ('active' in data) data.active = data.active === 'true';
      return service ? api(`/services/${service.id}`, { method: 'PATCH', body: data }) : api('/services', { method: 'POST', body: data });
    },
    onDone
  });
}

export function userForm({ user = null, onDone } = {}) {
  const roles = Object.entries(LABELS.role).map(([id, name]) => ({ id, name }));
  formDialog({
    title: user ? `Editar ${user.name}` : 'Nuevo usuario',
    submitLabel: user ? 'Guardar cambios' : 'Crear usuario',
    success: user ? 'Usuario actualizado.' : 'Usuario creado.',
    fields: user
      ? html`${field('Nombre', html`<input name="name" required minlength="2" maxlength="100" value="${user.name}">`, { span: true })}
        ${field('Rol', html`<select name="role">${options(roles, user.role)}</select>`)}
        ${field('Acceso', html`<select name="active">${options([{ id: 'true', name: 'Habilitado' }, { id: 'false', name: 'Deshabilitado' }], String(user.active))}</select>`)}`
      : html`${field('Nombre', html`<input name="name" required minlength="2" maxlength="100">`, { span: true })}
        ${field('Correo', html`<input name="email" type="email" required>`, { span: true })}
        ${field('Contraseña', html`<input name="password" type="password" autocomplete="new-password" required minlength="12" maxlength="72">`, { hint: 'Mínimo 12 caracteres' })}
        ${field('Rol', html`<select name="role">${options(roles, 'agente')}</select>`)}`,
    submit: data => {
      if ('active' in data) data.active = data.active === 'true';
      return user ? api(`/users/${user.id}`, { method: 'PATCH', body: data }) : api('/users', { method: 'POST', body: data });
    },
    onDone
  });
}
