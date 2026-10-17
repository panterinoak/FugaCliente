/** Fichas de detalle: cliente (panel lateral), incidencia y acción (modal). */
import { api } from './core/api.js';
import { html, raw } from './core/html.js';
import { FACTORS, LABELS, fmt } from './core/format.js';
import { avatar, badge, factorBar, icon, levelBadge, severity, slaState } from './core/components.js';
import { busy, closeModal, confirmAction, openDrawer, openModal, toast, closeDrawer, drawerOpen } from './core/overlay.js';
import { can } from './core/state.js';
import { actionForm, clientForm, commentForm, incidentForm } from './forms.js';

let refreshView = async () => {};
export const setRefresh = fn => { refreshView = fn; };

const after = async clientId => {
  await refreshView();
  if (clientId && drawerOpen()) await clientDetail(clientId);
};

function factorList(risk) {
  return html`<div class="factor-list">${FACTORS.map(({ key }) => {
    const f = risk.factors.find(item => item.key === key);
    const width = (f.points / f.max) * 100;
    return html`<div class="factor-item ${f.points ? '' : 'zero'}">
      <i class="swatch f-${key}"></i>
      <div><strong>${f.label}</strong><small>${f.detail}</small></div>
      <svg class="mini" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true"><rect class="track" width="100" height="6"/><rect class="f-${key}" width="${width}" height="6"/></svg>
      <span class="pts">+${f.points}</span></div>`;
  })}</div>`;
}

function incidentTimeline(rows) {
  if (!rows.length) return html`<p class="muted">Sin incidencias registradas.</p>`;
  return html`<ol class="timeline">${rows.map(i => html`<li class="timeline-item">
    <span class="timeline-dot ${i.status}"></span>
    <div><div class="timeline-head"><strong>#${i.id} · ${i.categoryName}</strong>${badge(i.status)}</div>
      <p>${i.description}</p>
      <div class="timeline-meta"><span>${i.serviceName}</span><span>${LABELS.severity[i.severity]}</span>
        <span>Satisfacción ${i.satisfaction ? `${i.satisfaction}/5` : 'sin calificar'}</span><span>${fmt.dateTime(i.createdAt)}</span>
        <button class="link-btn" type="button" data-open-incident="${i.id}">Ver caso</button></div></div></li>`)}</ol>`;
}

function actionTimeline(rows) {
  if (!rows.length) return html`<p class="muted">Sin acciones de retención.</p>`;
  return html`<ol class="timeline">${rows.map(a => html`<li class="timeline-item">
    <span class="timeline-dot ${a.status}"></span>
    <div><div class="timeline-head"><strong>${LABELS.actionType[a.type]} · ${a.assignedUserName}</strong>${a.outcome ? badge(a.outcome) : badge(a.status)}</div>
      <p>${a.description}</p>
      <div class="timeline-meta"><span>Límite ${fmt.dateTime(a.dueAt)}</span>${a.completedAt ? html`<span>Completada ${fmt.dateTime(a.completedAt)}</span>` : ''}
        <button class="link-btn" type="button" data-open-action="${a.id}">Ver acción</button></div></div></li>`)}</ol>`;
}

function notes(rows) {
  if (!rows.length) return html`<p class="muted">Sin notas. Registra llamadas, correos o acuerdos con el cliente.</p>`;
  return rows.map(c => html`<article class="note-card"><header><span><strong>${c.authorName}</strong> · ${LABELS.channel[c.channel]}</span><time>${fmt.dateTime(c.createdAt)}</time></header><p>${c.text}</p></article>`);
}

export async function clientDetail(id, tab = 'incidents') {
  if (!drawerOpen()) openDrawer(html`<div class="skeleton-block"><span class="skeleton lg"></span><span class="skeleton"></span><span class="skeleton"></span></div>`);
  const [profile, incidents, actions, comments] = await Promise.all([
    api(`/clients/${id}/risk`), api(`/incidents?clientId=${id}&limit=50`), api(`/retention-actions?clientId=${id}&limit=50`), api(`/clients/${id}/comments?limit=50`)
  ]);
  const { client: c, risk: r } = profile.data;
  const active = c.status === 'activo';
  const tabs = [['incidents', 'Incidencias', incidents.pagination.total], ['actions', 'Retención', actions.pagination.total], ['notes', 'Notas', comments.pagination.total]];

  const body = openDrawer(html`
    <header class="drawer-head">
      ${avatar(c.name, 'avatar-xl')}
      <div><h2 id="drawerTitle">${c.name}</h2>
        <div class="meta"><span>${icon('mail')}${c.email}</span>${c.phone ? html`<span>${icon('phone')}${c.phone}</span>` : ''}<span>${c.segmentName}</span>${badge(c.status)}</div></div>
      <button class="icon-btn" type="button" data-close aria-label="Cerrar">${icon('x')}</button>
    </header>
    <section class="drawer-section">
      <div class="score-hero">
        <div class="score-num ${r.level}">${r.score}<small> / 100</small></div>
        <div>${levelBadge(r.level)}<p>${r.recommendation}</p></div>
        ${factorBar(r)}
      </div>
      ${factorList(r)}
      <p class="fineprint">Algoritmo ${r.algorithm}: satisfacción e historial de los últimos ${r.windowDays} días; las incidencias pendientes cuentan sin importar su antigüedad. Calculado ${fmt.dateTime(r.computedAt)}.</p>
    </section>
    <section class="drawer-section"><div class="drawer-actions">
      ${active ? html`<button class="btn btn-primary btn-sm" data-do="incident">${icon('plus')}Incidencia</button><button class="btn btn-sm" data-do="action">${icon('buoy')}Seguimiento</button>` : ''}
      <button class="btn btn-sm" data-do="note">${icon('note')}Nota</button>
      ${can.editClients() ? html`<button class="btn btn-sm" data-do="edit">${icon('edit')}Editar</button>` : ''}
      ${can.admin() && active ? html`<button class="btn btn-sm btn-danger" data-do="archive">${icon('archive')}Archivar</button>` : ''}
    </div></section>
    <section class="drawer-section">
      <div class="tabs" role="tablist">${tabs.map(([key, label, count]) => html`<button class="tab" role="tab" type="button" data-tab="${key}" aria-selected="${key === tab}">${label}<span class="count">${count}</span></button>`)}</div>
      <div data-panel="incidents" ${tab === 'incidents' ? '' : raw('hidden')}>${incidentTimeline(incidents.data)}</div>
      <div data-panel="actions" ${tab === 'actions' ? '' : raw('hidden')}>${actionTimeline(actions.data)}</div>
      <div data-panel="notes" ${tab === 'notes' ? '' : raw('hidden')}>${notes(comments.data)}</div>
    </section>`);

  body.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => {
    body.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b === button)));
    body.querySelectorAll('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== button.dataset.tab; });
  }));
  body.querySelectorAll('[data-open-incident]').forEach(b => b.addEventListener('click', () => incidentDetail(Number(b.dataset.openIncident)).catch(showError)));
  body.querySelectorAll('[data-open-action]').forEach(b => b.addEventListener('click', () => actionDetail(Number(b.dataset.openAction)).catch(showError)));
  body.querySelectorAll('[data-do]').forEach(button => button.addEventListener('click', () => {
    const run = {
      incident: () => incidentForm({ clientId: id, onDone: () => after(id) }),
      action: () => actionForm({ clientId: id, onDone: () => after(id) }),
      note: () => commentForm({ clientId: id, onDone: () => clientDetail(id, 'notes') }),
      edit: () => clientForm({ id, onDone: () => after(id) }),
      archive: async () => {
        const ok = await confirmAction({ title: 'Archivar cliente', message: `${c.name} dejará de recibir nuevas incidencias. Su historial y auditoría se conservan.`, confirm: 'Archivar', danger: true });
        if (!ok) return;
        await api(`/clients/${id}`, { method: 'DELETE' });
        toast('Cliente archivado.');
        await after(id);
      }
    }[button.dataset.do];
    Promise.resolve(run()).catch(showError);
  }));
}

export async function incidentDetail(id) {
  const { data: i } = await api(`/incidents/${id}`);
  const steps = ['abierta', 'en_proceso', 'resuelta'];
  const reached = steps.indexOf(i.status);
  const next = { abierta: ['en_proceso', 'resuelta'], en_proceso: ['resuelta'], resuelta: [] }[i.status];
  const body = openModal(`Incidencia #${i.id}`, html`
    <div class="status-steps">${steps.map((s, idx) => html`<span class="${idx < reached ? 'done' : idx === reached ? 'current' : ''}">${idx < reached ? icon('check') : ''}${LABELS.status[s]}</span>${idx < steps.length - 1 ? icon('chevron') : ''}`)}</div>
    <dl class="detail-grid">
      <div><dt>Cliente</dt><dd>${i.clientName}</dd></div>
      <div><dt>Servicio</dt><dd>${i.serviceName} · SLA ${i.slaHours} h</dd></div>
      <div><dt>Motivo</dt><dd>${i.categoryName}</dd></div>
      <div><dt>Gravedad</dt><dd>${severity(i.severity)}</dd></div>
      <div><dt>Satisfacción</dt><dd>${i.satisfaction ? `${i.satisfaction}/5 · ${LABELS.satisfaction[i.satisfaction]}` : 'Sin calificación'}</dd></div>
      <div><dt>Responsable</dt><dd>${i.assignedUserName || 'Sin asignar'}</dd></div>
      <div><dt>Registrada</dt><dd>${fmt.dateTime(i.createdAt)}</dd></div>
      <div><dt>Plazo</dt><dd>${slaState(i)}</dd></div>
    </dl>
    <p class="detail-desc">${i.description}</p>
    ${next.length ? html`<form data-status><div class="field"><span class="field-label">Cambiar estado</span><div class="choice-row">
        ${next.map((s, idx) => html`<label class="choice"><input type="radio" name="status" value="${s}" ${idx === 0 ? raw('checked') : ''}><span>${LABELS.status[s]}</span></label>`)}</div>
        <span class="field-hint">Resolver elimina los puntos por pendiente y SLA vencido; la experiencia reciente sigue en el historial. Versión ${i.version}.</span></div>
      <p class="form-error" role="alert"></p>
      <div class="form-actions"><button class="btn" type="button" data-close>Cerrar</button><button class="btn btn-primary" type="submit">Actualizar estado</button></div></form>`
    : html`<p class="muted">Resuelta ${fmt.dateTime(i.resolvedAt)}. Una incidencia resuelta no se reabre; registra una nueva si el problema vuelve.</p>`}`);
  body.querySelector('[data-status]')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await busy(form.querySelector('[type=submit]'), () => api(`/incidents/${id}`, { method: 'PATCH', body: { status: new FormData(form).get('status'), expectedVersion: i.version } }));
      closeModal();
      toast('Estado actualizado.');
      await after(i.clientId);
    } catch (err) {
      form.querySelector('.form-error').textContent = err.message;
    }
  });
}

export async function actionDetail(id) {
  const { data: a } = await api(`/retention-actions/${id}`);
  const late = a.status === 'pendiente' && new Date(a.dueAt) < new Date();
  const body = openModal(`${LABELS.actionType[a.type]} · ${a.clientName}`, html`
    <dl class="detail-grid">
      <div><dt>Responsable</dt><dd>${a.assignedUserName}</dd></div>
      <div><dt>Fecha límite</dt><dd class="${late ? 'due-late' : ''}">${fmt.dateTime(a.dueAt)} (${fmt.relative(a.dueAt)})</dd></div>
      <div><dt>Estado</dt><dd>${badge(a.status)}</dd></div>
      <div><dt>Resultado</dt><dd>${a.outcome ? badge(a.outcome) : 'Pendiente de registrar'}</dd></div>
    </dl>
    <p class="detail-desc">${a.description}</p>
    ${a.status === 'pendiente' ? html`<form data-outcome><div class="field"><span class="field-label">Resultado de la intervención</span><div class="choice-row">
        ${Object.entries(LABELS.outcome).map(([value, label], idx) => html`<label class="choice"><input type="radio" name="outcome" value="${value}" ${idx === 0 ? raw('checked') : ''}><span>${label}</span></label>`)}</div>
        <span class="field-hint">El resultado queda registrado y no puede cambiarse después.</span></div>
      <p class="form-error" role="alert"></p>
      <div class="form-actions"><button class="btn" type="button" data-close>Cerrar</button><button class="btn btn-primary" type="submit">Completar acción</button></div></form>`
    : html`<p class="muted">Completada ${fmt.dateTime(a.completedAt)}.</p>`}`);
  body.querySelector('[data-outcome]')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await busy(form.querySelector('[type=submit]'), () => api(`/retention-actions/${id}`, { method: 'PATCH', body: { outcome: new FormData(form).get('outcome') } }));
      closeModal();
      toast('Resultado registrado.');
      await after(a.clientId);
    } catch (err) {
      form.querySelector('.form-error').textContent = err.message;
    }
  });
}

export const showError = err => toast(err.message, { error: true });
export { closeDrawer };
