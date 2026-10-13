import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRisk } from '../src/services/risk.js';
const now = new Date('2026-10-13T15:00:00Z');
const incident = patch => ({ id: 1, createdAt: '2026-10-12T15:00:00Z', status: 'abierta', severity: 1, satisfaction: null, slaHours: 24, ...patch });

test('Un cliente sin incidencias comienza en cero', () => { const risk = calculateRisk([], now); assert.equal(risk.score, 0); assert.equal(risk.level, 'bajo'); });
test('El puntaje máximo suma 100 y activa prioridad alta', () => {
  const rows = [1, 2, 3].map(id => incident({ id, severity: 3, satisfaction: 1, createdAt: '2026-10-10T15:00:00Z' }));
  const risk = calculateRisk(rows, now); assert.equal(risk.score, 100); assert.equal(risk.level, 'alto'); assert.equal(risk.factors.reduce((s, f) => s + f.points, 0), 100);
});
test('La calificación más reciente se usa aunque el caso anterior fue peor', () => {
  const risk = calculateRisk([incident({ satisfaction: 1, createdAt: '2026-10-11T15:00:00Z' }), incident({ id: 2, satisfaction: 5, status: 'resuelta' })], now);
  assert.equal(risk.factors.find(f => f.key === 'satisfaction').points, 0);
});
test('La ventana de 30 días incluye su límite exacto y excluye historial más antiguo', () => {
  const boundary = new Date(now.getTime() - 30 * 86400000).toISOString();
  assert.equal(calculateRisk([incident({ createdAt: boundary, status: 'resuelta', satisfaction: 1, severity: 3 })], now).score, 40);
  assert.equal(calculateRisk([incident({ createdAt: new Date(new Date(boundary).getTime() - 1).toISOString(), status: 'resuelta', satisfaction: 1, severity: 3 })], now).score, 0);
});
test('Una incidencia antigua sin resolver todavía cuenta como pendiente y SLA vencido', () => {
  const risk = calculateRisk([incident({ createdAt: '2026-08-01T15:00:00Z', severity: 3, satisfaction: 1 })], now);
  assert.equal(risk.score, 20); assert.equal(risk.factors.find(f => f.key === 'severity').points, 0);
});
test('Resolver elimina pendiente y SLA sin borrar la experiencia reciente', () => {
  const row = incident({ severity: 3, satisfaction: 1, slaHours: 12 });
  assert.equal(calculateRisk([row], now).score, 60); assert.equal(calculateRisk([{ ...row, status: 'resuelta' }], now).score, 40);
});
test('No se asignan puntos por SLA en el instante exacto del plazo', () => { assert.equal(calculateRisk([incident({})], now).factors.find(f => f.key === 'sla').points, 0); });
test('Las incidencias futuras no afectan el cálculo', () => { assert.equal(calculateRisk([incident({ createdAt: '2026-10-14T00:00:00Z', severity: 3, satisfaction: 1 })], now).score, 0); });
test('Los límites 40 y 70 clasifican de forma consistente', () => {
  assert.equal(calculateRisk([incident({ severity: 3, satisfaction: 1, status: 'resuelta' })], now).level, 'medio');
  assert.equal(calculateRisk([incident({ severity: 3, satisfaction: 1, slaHours: 12 }), incident({ id: 2, status: 'resuelta', createdAt: '2026-10-10T00:00:00Z' })], now).score, 70);
  assert.equal(calculateRisk([incident({ severity: 3, satisfaction: 1, slaHours: 12 }), incident({ id: 2, status: 'resuelta', createdAt: '2026-10-10T00:00:00Z' })], now).level, 'alto');
});
