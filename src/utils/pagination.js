import { PAGINATION } from '../config/constants.js';

/** Construye el sobre estándar `{ data, pagination }` a partir de una lista completa. */
export function paginate(rows, { page = 1, limit = PAGINATION.defaultLimit } = {}) {
  return {
    data: rows.slice((page - 1) * limit, page * limit),
    pagination: pageInfo(rows.length, { page, limit })
  };
}

export function pageInfo(total, { page = 1, limit = PAGINATION.defaultLimit } = {}) {
  return { page, limit, total, pages: Math.ceil(total / limit) };
}

/** Búsqueda insensible a mayúsculas y tildes sobre los campos indicados. */
export function matchesSearch(row, search, fields) {
  if (!search) return true;
  const normalize = value => String(value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es');
  const needle = normalize(search);
  return fields.some(field => normalize(row[field]).includes(needle));
}
