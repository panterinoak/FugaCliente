/** Cliente HTTP del API REST con manejo uniforme de errores y sesión. */
import { session } from './state.js';

export class ApiError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details || [];
  }
}

const BASE = '/api/v1';

export async function api(path, { method = 'GET', body, signal } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (session.token) headers.Authorization = `Bearer ${session.token}`;

  let response;
  try {
    response = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('No hay conexión con el servidor. Verifica que esté iniciado.', { status: 0, code: 'NETWORK' });
  }
  if (response.status === 204) return null;

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login') window.dispatchEvent(new CustomEvent('session:expired'));
    const error = payload.error || {};
    throw new ApiError(error.message || 'No se pudo completar la operación.', { status: response.status, code: error.code, details: error.details });
  }
  return payload;
}

/** Descarga un archivo autenticado (p. ej. el reporte CSV) sin exponer el token en la URL. */
export async function download(path) {
  const response = await fetch(BASE + path, { headers: { Authorization: `Bearer ${session.token}` } });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new ApiError(payload.error?.message || 'No se pudo generar el archivo.', { status: response.status });
  }
  const name = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') || '')?.[1] || 'reporte.csv';
  const url = URL.createObjectURL(await response.blob());
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}

/** Recorre todas las páginas de un listado (útil para selectores de formularios). */
export async function fetchAll(path) {
  const rows = [];
  let page = 1;
  let pages = 1;
  do {
    const separator = path.includes('?') ? '&' : '?';
    const result = await api(`${path}${separator}limit=100&page=${page}`);
    rows.push(...result.data);
    pages = result.pagination.pages;
    page++;
  } while (page <= pages);
  return rows;
}
