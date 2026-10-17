/** Componentes de presentación reutilizables (devuelven plantillas seguras). */
import { html, raw } from './html.js';
import { FACTORS, fmt, LABELS } from './format.js';

export const icon = (name, cls = '') => html`<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

const tone = name => 1 + ([...String(name)].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 5);
export const avatar = (name, size = '') => html`<span class="avatar ${size} tone-${tone(name)}" aria-hidden="true">${fmt.initials(name)}</span>`;

export const badge = (value, label = LABELS.status[value] || LABELS.levelShort[value] || LABELS.outcome[value] || value) =>
  html`<span class="badge ${value}">${label}</span>`;

export const levelBadge = level => html`<span class="badge ${level}">${LABELS.levelShort[level]}</span>`;

export const severity = level => html`<span class="severity s${level}" title="Gravedad ${level} de 3"><i><b></b><b></b><b></b></i>${LABELS.severity[level]}</span>`;

/** Estado del SLA de una incidencia respecto del plazo de su servicio. */
export function slaState(incident) {
  if (incident.status === 'resuelta') return html`<span class="sla done">${icon('check')}Atendida</span>`;
  const deadline = new Date(incident.createdAt).getTime() + incident.slaHours * 3_600_000;
  if (Date.now() > deadline) return html`<span class="sla breached">${icon('clock')}Vencido ${fmt.relative(deadline)}</span>`;
  return html`<span class="sla ontime">${icon('clock')}Vence ${fmt.relative(deadline)}</span>`;
}

export const person = (name, sub, size = '') => html`<div class="person">${avatar(name, size)}<div><span class="cell-title">${name}</span>${sub ? html`<span class="cell-sub">${sub}</span>` : ''}</div></div>`;

/**
 * Barra apilada de los cinco factores. Cada punto ocupa una unidad de un total de 100,
 * de modo que la longitud coloreada ES el puntaje y cada color explica su causa.
 */
export function factorBar(risk, { label = true } = {}) {
  let x = 0;
  const segments = FACTORS.map(({ key }) => {
    const points = risk.factors.find(f => f.key === key)?.points || 0;
    const rect = points ? `<rect class="f-${key}" x="${x}" y="0" width="${points}" height="10"/>` : '';
    x += points;
    return rect;
  }).join('');
  const description = risk.factors.filter(f => f.points).map(f => `${f.label}: ${f.points}`).join(', ') || 'Sin factores de riesgo';
  return html`<svg class="factor-bar" viewBox="0 0 100 10" preserveAspectRatio="none" role="img" aria-label="${label ? `Puntaje ${risk.score} de 100. ${description}` : ''}"><rect class="track" x="0" y="0" width="100" height="10"/>${raw(segments)}</svg>`;
}

export const riskCell = risk => html`<div class="risk-cell">${factorBar(risk)}<span class="score">${risk.score}</span></div>`;

export const factorLegend = () => html`<div class="factor-legend">${FACTORS.map(f => html`<span><i class="swatch f-${f.key}"></i>${f.short}</span>`)}</div>`;

export const empty = (title, text, action = '') => html`<div class="empty">${icon('search')}<strong>${title}</strong><p>${text}</p>${action}</div>`;

export const skeletonRows = (rows = 6) => html`<div class="skeleton-block">${Array.from({ length: rows }, (_, i) => html`<span class="skeleton ${i === 0 ? 'lg' : ''}"></span>`)}</div>`;

export function pagination(p) {
  const from = p.total ? (p.page - 1) * p.limit + 1 : 0;
  const to = Math.min(p.page * p.limit, p.total);
  return html`<div class="pagination"><span>${from}–${to} de ${fmt.number(p.total)}</span><div class="pagination-buttons">
    <button class="btn btn-sm" data-page="prev" ${p.page <= 1 ? raw('disabled') : ''}>${icon('chevron-left')}Anterior</button>
    <button class="btn btn-sm" data-page="next" ${p.page >= p.pages ? raw('disabled') : ''}>Siguiente${icon('chevron')}</button></div></div>`;
}

export const options = (rows, selected, { value = r => r.id, label = r => r.name } = {}) =>
  rows.map(r => html`<option value="${value(r)}" ${String(value(r)) === String(selected) ? raw('selected') : ''}>${label(r)}</option>`);

export const segmented = (name, items, current) => html`<div class="segmented" role="group" data-segment="${name}">${items.map(([value, label]) =>
  html`<button type="button" data-value="${value}" aria-pressed="${String(value) === String(current)}">${label}</button>`)}</div>`;
