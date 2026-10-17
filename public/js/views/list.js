/** Comportamiento común de las vistas de listado: búsqueda, filtros y paginación. */
import { $, html, mount } from '../core/html.js';
import { icon, pagination, skeletonRows } from '../core/components.js';
import { fmt } from '../core/format.js';

/**
 * Crea una vista de listado. `config.load(query)` devuelve `{ data, pagination }`
 * y `config.table(rows)` devuelve la tabla. Los filtros se conservan al volver a la vista.
 */
export function createListView(config) {
  const query = { page: 1, search: '', ...config.defaults };

  async function load(main) {
    const panel = $('[data-list-body]', main);
    mount(panel, skeletonRows(6));
    const result = await config.load(query);
    mount(panel, html`${result.data.length ? config.table(result.data) : config.empty(query)}${result.pagination.total ? pagination(result.pagination) : ''}`);
    $('[data-count]', main).textContent = `${fmt.number(result.pagination.total)} ${result.pagination.total === 1 ? config.noun[0] : config.noun[1]}`;
    panel.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => {
      query.page += button.dataset.page === 'next' ? 1 : -1;
      void load(main).then(() => panel.scrollIntoView({ block: 'nearest' })).catch(config.onError);
    }));
    config.bind?.(panel, result.data);
  }

  async function render(main) {
    mount(main, html`
      <div class="page-head"><div><h1>${config.title}</h1><p>${config.description}</p></div><div class="page-actions">${config.actions?.() || ''}</div></div>
      <section class="panel table-panel">
        <div class="toolbar">
          <label class="search">${icon('search')}<span class="sr-only">Buscar</span><input type="search" data-search placeholder="${config.searchPlaceholder}" value="${query.search}"></label>
          ${config.filters?.(query) || ''}
          <span class="count" data-count></span>
        </div>
        <div data-list-body></div>
      </section>`);

    let timer;
    $('[data-search]', main).addEventListener('input', event => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        query.search = event.target.value.trim();
        query.page = 1;
        void load(main).catch(config.onError);
      }, 300);
    });
    main.querySelectorAll('[data-filter]').forEach(select => select.addEventListener('change', () => {
      query[select.dataset.filter] = select.value;
      query.page = 1;
      void load(main).catch(config.onError);
    }));
    main.querySelectorAll('[data-segment]').forEach(group => group.addEventListener('click', event => {
      const button = event.target.closest('button[data-value]');
      if (!button) return;
      group.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
      query[group.dataset.segment] = button.dataset.value;
      query.page = 1;
      void load(main).catch(config.onError);
    }));
    config.bindHeader?.(main);
    await load(main);
  }

  return { render, query, reload: main => load(main) };
}

/** Convierte el estado de filtros en parámetros de consulta, omitiendo vacíos. */
export function toParams(query, limit = 20) {
  const params = new URLSearchParams({ page: String(query.page), limit: String(limit) });
  for (const [key, value] of Object.entries(query)) if (key !== 'page' && value) params.set(key, value);
  return params.toString();
}
