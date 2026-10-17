/** Gráficos SVG sin dependencias externas (compatibles con la CSP estricta). */
import { html, raw } from './html.js';
import { fmt } from './format.js';

const n = value => Math.round(value * 100) / 100;

/** Barras agrupadas: incidencias registradas vs. resueltas por semana. */
export function weeklyBars(weeks) {
  const W = 640, H = 220, left = 28, bottom = 26, top = 10;
  const max = Math.max(4, ...weeks.flatMap(w => [w.opened, w.resolved]));
  const step = Math.ceil(max / 4);
  const ceil = step * 4;
  const plotH = H - top - bottom;
  const slot = (W - left) / weeks.length;
  const barW = Math.min(18, slot / 3.2);
  const y = v => top + plotH - (v / ceil) * plotH;

  const grid = Array.from({ length: 5 }, (_, i) => {
    const v = step * i;
    return `<line class="grid-line" x1="${left}" x2="${W}" y1="${n(y(v))}" y2="${n(y(v))}"/><text x="${left - 8}" y="${n(y(v)) + 4}" text-anchor="end">${v}</text>`;
  }).join('');
  const bars = weeks.map((w, i) => {
    const cx = left + slot * i + slot / 2;
    const label = fmt.dayMonth(w.to);
    return `<g><title>Semana al ${label}: ${w.opened} registradas, ${w.resolved} resueltas</title>
      <rect class="bar-a" x="${n(cx - barW - 2)}" y="${n(y(w.opened))}" width="${n(barW)}" height="${n(plotH - (y(w.opened) - top))}" rx="3"/>
      <rect class="bar-b" x="${n(cx + 2)}" y="${n(y(w.resolved))}" width="${n(barW)}" height="${n(plotH - (y(w.resolved) - top))}" rx="3"/>
      <text x="${n(cx)}" y="${H - 6}" text-anchor="middle">${label}</text></g>`;
  }).join('');
  return html`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Incidencias registradas y resueltas por semana">${raw(grid + bars)}</svg>`;
}

/** Barra horizontal simple (proporción de un total). */
export function hbar(value, max, cls = 'fill') {
  const width = max ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return html`<svg class="hbar" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true"><rect class="track" width="100" height="8"/><rect class="${cls}" width="${n(width)}" height="8"/></svg>`;
}

/** Barra de distribución por nivel de riesgo. */
export function distributionBar(distribution, total) {
  let x = 0;
  const parts = ['alto', 'medio', 'bajo'].map(level => {
    const width = total ? (distribution[level] / total) * 100 : 0;
    const rect = width ? `<rect class="${level}" x="${n(x)}" width="${n(width)}" height="10"/>` : '';
    x += width;
    return rect;
  }).join('');
  return html`<svg class="dist-bar" viewBox="0 0 100 10" preserveAspectRatio="none" role="img" aria-label="Alto ${distribution.alto}, medio ${distribution.medio}, bajo ${distribution.bajo}"><rect class="track" width="100" height="10"/>${raw(parts)}</svg>`;
}

/** Anillo de porcentaje (tasa de recuperación). */
export function ring(percent, caption) {
  const r = 46, c = 2 * Math.PI * r;
  const value = percent ?? 0;
  return html`<svg class="ring" viewBox="0 0 112 112" role="img" aria-label="${caption}: ${percent ?? 'sin datos'}">
    <circle class="track" cx="56" cy="56" r="${r}" fill="none" stroke-width="10"/>
    <circle class="fill" cx="56" cy="56" r="${r}" fill="none" stroke-width="10" stroke-linecap="round" stroke-dasharray="${n((value / 100) * c)} ${n(c)}" transform="rotate(-90 56 56)"/>
    <text x="56" y="58" text-anchor="middle">${percent === null || percent === undefined ? '—' : `${Math.round(value)}%`}</text>
    <text class="sub" x="56" y="74" text-anchor="middle">${caption}</text></svg>`;
}

/** Barras verticales compactas por día (actividad de auditoría). */
export function dailyBars(days) {
  const W = 640, H = 140, bottom = 22, top = 8;
  if (!days.length) return html``;
  const max = Math.max(1, ...days.map(d => d.count));
  const slot = W / days.length;
  const barW = Math.min(22, slot * 0.6);
  const plotH = H - top - bottom;
  const labelEvery = Math.ceil(days.length / 8);
  const bars = days.map((d, i) => {
    const h = (d.count / max) * plotH;
    const x = slot * i + (slot - barW) / 2;
    const label = i % labelEvery === 0 ? `<text x="${n(x + barW / 2)}" y="${H - 6}" text-anchor="middle">${fmt.dayMonth(`${d.date}T12:00:00Z`)}</text>` : '';
    return `<g><title>${d.date}: ${d.count} eventos</title><rect class="bar-a" x="${n(x)}" y="${n(top + plotH - h)}" width="${n(barW)}" height="${n(h)}" rx="2"/>${label}</g>`;
  }).join('');
  return html`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Eventos de negocio por día"><line class="grid-line" x1="0" x2="${W}" y1="${top + plotH}" y2="${top + plotH}"/>${raw(bars)}</svg>`;
}
