/**
 * Punto de entrada de la interfaz: sesión, enrutamiento por hash y elementos globales
 * (búsqueda, tema, menú móvil). Consume exclusivamente el API REST mediante fetch.
 */
import { api } from './core/api.js';
import { $, $$, html, mount } from './core/html.js';
import { avatar, factorBar, icon, levelBadge } from './core/components.js';
import { FACTORS, LABELS, fmt } from './core/format.js';
import { can, session, store } from './core/state.js';
import { closeDrawer, closeModal, initOverlays, toast } from './core/overlay.js';
import { clientDetail, setRefresh, showError } from './detail.js';
import { overviewView } from './views/overview.js';
import { clientsView } from './views/clients.js';
import { incidentsView } from './views/incidents.js';
import { retentionView } from './views/retention.js';
import { teamView } from './views/team.js';
import { activityView } from './views/activity.js';

const main = $('#mainContent');

const ROUTES = {
  panel: { title: 'Panel', render: () => overviewView(main, { refresh: render }).then(updateAlertCount) },
  clientes: { title: 'Clientes', render: () => clientsView(render).render(main) },
  incidencias: { title: 'Incidencias', render: () => incidentsView(render).render(main) },
  retencion: { title: 'Retención', render: () => retentionView(render).render(main) },
  equipo: { title: 'Equipo y servicios', render: () => teamView(main, { reloadCatalogs }) },
  auditoria: { title: 'Auditoría', privileged: true, render: () => activityView(main) }
};

const currentRoute = () => {
  const name = location.hash.replace(/^#\/?/, '').split('/')[0] || 'panel';
  const route = ROUTES[name];
  return route && (!route.privileged || can.privileged()) ? name : 'panel';
};

/* ---------------- Render y navegación ---------------- */
let renderToken = 0;
async function render() {
  if (!session.user) return;
  const name = currentRoute();
  const route = ROUTES[name];
  const token = ++renderToken;
  $$('.nav-link[data-route]').forEach(link => {
    const active = link.dataset.route === name;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  mount($('#crumb'), html`Espacio de trabajo / <b>${route.title}</b>`);
  document.title = `${route.title} · FugaCliente`;
  try {
    await route.render();
  } catch (err) {
    if (token !== renderToken || err.status === 401) return;
    mount(main, html`<div class="error-state">${icon('alert')}<div><strong>No se pudo cargar ${route.title.toLowerCase()}</strong><p>${err.message}</p>
      <button class="btn btn-sm" data-retry type="button">${icon('refresh')}Reintentar</button></div></div>`);
    $('[data-retry]', main)?.addEventListener('click', render);
  }
}

function updateAlertCount(dashboard) {
  const badge = $('#navAlerts');
  badge.hidden = !dashboard?.distribution?.alto;
  badge.textContent = dashboard?.distribution?.alto ?? '';
  badge.title = `${badge.textContent} clientes en riesgo alto`;
}

async function reloadCatalogs() {
  const [catalogs, users] = await Promise.all([api('/catalogs'), api('/users')]);
  store.catalogs = catalogs.data;
  store.users = users.data;
}

/* ---------------- Sesión ---------------- */
async function enterApp() {
  await reloadCatalogs();
  const u = session.user;
  $('#userName').textContent = u.name;
  $('#userRole').textContent = LABELS.role[u.role];
  $('#userAvatar').textContent = fmt.initials(u.name);
  $$('[data-privileged]').forEach(el => { el.hidden = !can.privileged(); });
  $('#loginScreen').hidden = true;
  $('#application').hidden = false;
  if (!location.hash) history.replaceState(null, '', '#/panel');
  await render();
  if (currentRoute() !== 'panel') api('/dashboard').then(r => updateAlertCount(r.data)).catch(() => {});
}

function showLogin() {
  closeModal();
  closeDrawer();
  $('#application').hidden = true;
  $('#loginScreen').hidden = false;
  $('#loginPassword').value = '';
}

function logout(message) {
  session.clear();
  showLogin();
  if (message) $('#loginError').textContent = message;
}

async function checkService() {
  const dot = $('#serviceDot');
  try {
    const { data } = await api('/health');
    session.mode = data.mode;
    const demo = data.mode === 'demo';
    dot.className = `dot ${data.status === 'ok' ? 'dot-ok' : 'dot-warn'}`;
    $('#loginStatus').textContent = demo
      ? 'Servicio disponible · demostración con datos en memoria'
      : `Servicio ${data.status === 'ok' ? 'disponible' : 'degradado'} · SQL Server ${data.sql} · MongoDB ${data.mongo}`;
    $('#demoHint').hidden = !demo;
    $('#modeLabel').textContent = demo ? 'Modo demostración' : 'SQL Server + MongoDB';
    $('#modeDetail').textContent = demo ? 'Datos temporales en memoria' : `Outbox pendiente: ${data.outboxPending ?? '—'} eventos`;
  } catch {
    dot.className = 'dot dot-error';
    $('#loginStatus').textContent = 'Servicio no disponible. Inicia el servidor y recarga la página.';
  }
}

function renderLoginSample() {
  const sample = { score: 100, factors: [
    { key: 'satisfaction', label: 'Satisfacción', points: 25 }, { key: 'open', label: 'Pendientes', points: 30 },
    { key: 'repeated', label: 'Repetición', points: 20 }, { key: 'severity', label: 'Gravedad', points: 15 }, { key: 'sla', label: 'SLA', points: 10 }
  ] };
  mount($('#loginSampleBar'), factorBar(sample));
  mount($('#loginSampleLegend'), FACTORS.map(f => html`<li><i class="swatch f-${f.key}"></i>${f.short} +${sample.factors.find(x => x.key === f.key).points}</li>`));
}

function initLogin() {
  const form = $('#loginForm');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('[type=submit]');
    $('#loginError').textContent = '';
    if (!form.reportValidity()) return;
    button.classList.add('is-busy');
    button.disabled = true;
    try {
      const { data } = await api('/auth/login', { method: 'POST', body: { email: form.email.value, password: form.password.value } });
      session.setToken(data.token);
      session.user = data.user;
      form.password.value = '';
      await enterApp();
      toast(`Sesión iniciada como ${LABELS.role[data.user.role].toLowerCase()}.`);
    } catch (err) {
      $('#loginError').textContent = err.message;
    } finally {
      button.classList.remove('is-busy');
      button.disabled = false;
    }
  });
  $('#togglePassword').addEventListener('click', event => {
    const input = $('#loginPassword');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    event.currentTarget.textContent = show ? 'Ocultar' : 'Mostrar';
    event.currentTarget.setAttribute('aria-pressed', String(show));
  });
  $$('[data-demo-user]').forEach(b => b.addEventListener('click', () => {
    $('#loginEmail').value = b.dataset.demoUser;
    $('#loginPassword').value = 'FugaCliente2026!';
    form.requestSubmit();
  }));
}

/* ---------------- Búsqueda global ---------------- */
function initSearch() {
  const input = $('#globalSearch');
  const box = $('#searchResults');
  let timer;
  let controller;
  const close = () => { box.hidden = true; };

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const term = input.value.trim();
    if (term.length < 2) return close();
    timer = setTimeout(async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const { data } = await api(`/clients?limit=6&search=${encodeURIComponent(term)}`, { signal: controller.signal });
        mount(box, data.length ? data.map((c, i) => html`<button type="button" class="search-item" role="option" aria-selected="${i === 0}" data-id="${c.id}">${avatar(c.name)}<span><span class="cell-title">${c.name}</span><span class="cell-sub">${c.email}</span></span><span class="meta">${levelBadge(c.risk.level)}</span></button>`)
          : html`<div class="search-empty">Ningún cliente coincide con “${term}”.</div>`);
        box.hidden = false;
      } catch (err) {
        if (err.name !== 'AbortError') showError(err);
      }
    }, 220);
  });
  box.addEventListener('click', event => {
    const item = event.target.closest('[data-id]');
    if (!item) return;
    close();
    input.value = '';
    clientDetail(Number(item.dataset.id)).catch(showError);
  });
  input.addEventListener('keydown', event => {
    const items = $$('.search-item', box);
    const index = items.findIndex(i => i.getAttribute('aria-selected') === 'true');
    if (event.key === 'Escape') { close(); input.blur(); }
    if (!items.length || box.hidden) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items.forEach((item, i) => item.setAttribute('aria-selected', String(i === next)));
    }
    if (event.key === 'Enter') { event.preventDefault(); items[Math.max(index, 0)].click(); }
  });
  document.addEventListener('click', event => { if (!event.target.closest('.global-search')) close(); });
  document.addEventListener('keydown', event => {
    if (event.key === '/' && !event.target.closest('input, textarea, select') && !$('#application').hidden) {
      event.preventDefault();
      input.focus();
    }
  });
}

/* ---------------- Tema y menú ---------------- */
function initTheme() {
  const button = $('#themeButton');
  const effective = () => document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const paint = () => mount(button, icon(effective() === 'dark' ? 'sun' : 'moon'));
  button.addEventListener('click', () => {
    const next = effective() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('fc_theme', next); } catch { /* preferencia solo en esta sesión */ }
    paint();
  });
  paint();
}

function initMenu() {
  const shell = $('#application');
  const button = $('#menuButton');
  const set = open => {
    shell.classList.toggle('nav-open', open);
    button.setAttribute('aria-expanded', String(open));
    $('#scrim').hidden = !open;
  };
  button.addEventListener('click', () => set(!shell.classList.contains('nav-open')));
  $('#scrim').addEventListener('click', () => set(false));
  $$('.nav-link').forEach(link => link.addEventListener('click', () => set(false)));
}

/* ---------------- Arranque ---------------- */
async function bootstrap() {
  initOverlays();
  initLogin();
  initSearch();
  initTheme();
  initMenu();
  renderLoginSample();
  setRefresh(render);
  $('#logoutButton').addEventListener('click', () => logout());
  $('#refreshButton').addEventListener('click', () => render());
  window.addEventListener('hashchange', () => { closeDrawer(); void render(); });
  window.addEventListener('session:expired', () => logout('Tu sesión expiró. Vuelve a iniciar sesión.'));

  await checkService();
  if (session.token) {
    try {
      session.user = (await api('/users/me')).data;
      await enterApp();
      return;
    } catch {
      session.clear();
    }
  }
  showLogin();
  $('#loginPassword').focus();
}

void bootstrap();
