/**
 * Plantillas HTML seguras. Toda interpolación se escapa por defecto; solo los fragmentos
 * creados con `html` o marcados con `raw` se insertan sin escapar. Así ningún dato de
 * clientes o comentarios puede inyectar HTML (XSS).
 */
class SafeHtml {
  constructor(value) {
    this.value = value;
  }

  toString() {
    return this.value;
  }
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ESCAPES[char]);
export const raw = value => new SafeHtml(String(value));

function render(value) {
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(render).join('');
  if (value === null || value === undefined || value === false) return '';
  return esc(value);
}

export function html(strings, ...values) {
  return new SafeHtml(strings.reduce((out, chunk, i) => out + chunk + (i < values.length ? render(values[i]) : ''), ''));
}

/** Reemplaza el contenido de un elemento con una plantilla segura. */
export function mount(element, template) {
  element.innerHTML = render(template);
  return element;
}

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
