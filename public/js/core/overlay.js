/** Modal, panel lateral, confirmaciones y avisos. */
import { $, html, mount } from './html.js';
import { icon } from './components.js';

const modal = () => $('#modal');
const drawer = () => $('#drawer');

export function openModal(title, body, { size = '' } = {}) {
  const dialog = modal();
  dialog.className = `modal ${size}`;
  $('#modalTitle').textContent = title;
  mount($('#modalBody'), body);
  if (!dialog.open) dialog.showModal();
  dialog.querySelector('input:not([type=hidden]), select, textarea')?.focus();
  return $('#modalBody');
}

export const closeModal = () => modal().open && modal().close();

export function openDrawer(body) {
  const dialog = drawer();
  mount($('#drawerBody'), body);
  if (!dialog.open) dialog.showModal();
  return $('#drawerBody');
}

export const closeDrawer = () => drawer().open && drawer().close();
export const drawerOpen = () => drawer().open;

/** Confirmación accesible basada en el mismo modal. Resuelve true/false. */
export function confirmAction({ title, message, confirm = 'Confirmar', danger = false }) {
  return new Promise(resolve => {
    const body = openModal(title, html`<p class="lead">${message}</p>
      <div class="form-actions"><button class="btn" type="button" data-answer="no">Cancelar</button>
      <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" type="button" data-answer="yes">${confirm}</button></div>`, { size: 'modal-sm' });
    const finish = answer => {
      modal().removeEventListener('close', onClose);
      closeModal();
      resolve(answer);
    };
    const onClose = () => resolve(false);
    modal().addEventListener('close', onClose, { once: true });
    body.querySelector('[data-answer="yes"]').addEventListener('click', () => finish(true));
    body.querySelector('[data-answer="no"]').addEventListener('click', () => finish(false));
  });
}

export function toast(message, { error = false, timeout = 4500 } = {}) {
  const item = document.createElement('div');
  item.className = `toast ${error ? 'error' : ''}`;
  item.setAttribute('role', error ? 'alert' : 'status');
  mount(item, html`${icon(error ? 'alert' : 'check')}<span>${message}</span><button type="button" aria-label="Cerrar aviso">${icon('x')}</button>`);
  item.querySelector('button').addEventListener('click', () => item.remove());
  $('#toasts').append(item);
  setTimeout(() => item.remove(), timeout);
}

export function initOverlays() {
  for (const dialog of [modal(), drawer()]) {
    dialog.addEventListener('click', event => {
      if (event.target === dialog) dialog.close(); // clic en el fondo
      if (event.target.closest('[data-close]')) dialog.close();
    });
  }
}

/** Marca un botón como ocupado mientras se resuelve una promesa. */
export async function busy(button, task) {
  button?.classList.add('is-busy');
  if (button) button.disabled = true;
  try {
    return await task();
  } finally {
    button?.classList.remove('is-busy');
    if (button) button.disabled = false;
  }
}
