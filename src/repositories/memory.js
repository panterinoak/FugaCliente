/**
 * Repositorios en memoria con el MISMO contrato que SqlRepository y MongoAudit.
 * Se usan en `npm run demo` y en las pruebas automáticas; replican las reglas que en producción
 * imponen los procedimientos almacenados (estados, versiones, integridad y outbox).
 */
import { randomUUID } from 'node:crypto';
import { canTransition, DAY_MS } from '../config/constants.js';
import { conflict, missing } from '../utils/errors.js';
import { pageInfo } from '../utils/pagination.js';

const clone = value => structuredClone(value);
const newest = (a, b) => new Date(b.createdAt) - new Date(a.createdAt) || b.id - a.id;

export class MemoryRepository {
  constructor() {
    this.users = [];
    this.clients = [];
    this.incidents = [];
    this.actions = [];
    this.outbox = [];
    this.roles = [
      { id: 1, code: 'admin', name: 'Administrador' },
      { id: 2, code: 'analista', name: 'Analista' },
      { id: 3, code: 'agente', name: 'Agente de atención' }
    ];
    this.segments = [{ id: 1, name: 'Persona' }, { id: 2, name: 'Pequeña empresa' }, { id: 3, name: 'Empresa' }];
    this.services = [
      { id: 1, name: 'Soporte técnico', slaHours: 24, active: true },
      { id: 2, name: 'Entrega de pedidos', slaHours: 48, active: true },
      { id: 3, name: 'Atención comercial', slaHours: 12, active: true }
    ];
    this.categories = [
      { id: 1, name: 'Demora de atención' }, { id: 2, name: 'Trato inadecuado' },
      { id: 3, name: 'Servicio defectuoso' }, { id: 4, name: 'Error de facturación' }
    ];
  }

  next(rows) {
    return Math.max(0, ...rows.map(r => r.id)) + 1;
  }

  /** Equivalente a dbo.sp_QueueEvent: el evento se guarda junto al cambio. */
  event(eventType, entity, entityId, actorId, payload) {
    this.outbox.push({ eventId: randomUUID(), eventType, entity, entityId, actorId, occurredAt: new Date(), payload, processed: false });
  }

  /* ---------- Usuarios ---------- */
  async listUsers() {
    return clone(this.users);
  }

  async getUser(id) {
    return clone(this.users.find(u => u.id === id) || null);
  }

  async findUserByEmail(email) {
    return clone(this.users.find(u => u.email === email.toLowerCase()) || null);
  }

  async createUser(input, actorId = null) {
    const email = input.email.toLowerCase();
    if (this.users.some(u => u.email === email)) throw conflict('El correo del usuario ya está registrado.');
    const user = { id: this.next(this.users), ...input, email, active: true, createdAt: new Date().toISOString() };
    this.users.push(user);
    this.event('user.created', 'user', user.id, actorId, { role: user.role });
    return clone(user);
  }

  async updateUser(id, patch, actorId) {
    const user = this.users.find(u => u.id === id);
    if (!user) throw missing('Usuario');
    Object.assign(user, patch);
    this.event('user.updated', 'user', id, actorId, { fields: Object.keys(patch) });
    return clone(user);
  }

  /* ---------- Catálogos ---------- */
  async catalogs() {
    return clone({ roles: this.roles, segments: this.segments, services: this.services, categories: this.categories });
  }

  async listServices() {
    return clone(this.services);
  }

  async createService(input, actorId) {
    if (this.services.some(s => s.name.toLowerCase() === input.name.toLowerCase())) throw conflict('El servicio ya existe.');
    const service = { id: this.next(this.services), ...input, active: true };
    this.services.push(service);
    this.event('service.created', 'service', service.id, actorId, { slaHours: service.slaHours });
    return clone(service);
  }

  async updateService(id, patch, actorId) {
    const service = this.services.find(s => s.id === id);
    if (!service) throw missing('Servicio');
    if (patch.name && this.services.some(s => s.id !== id && s.name.toLowerCase() === patch.name.toLowerCase())) {
      throw conflict('El servicio ya existe.');
    }
    Object.assign(service, patch);
    this.event('service.updated', 'service', id, actorId, { fields: Object.keys(patch) });
    return clone(service);
  }

  /* ---------- Clientes ---------- */
  decorateClient(client) {
    return { ...client, segmentName: this.segments.find(s => s.id === client.segmentId)?.name };
  }

  async listClients() {
    return this.clients.map(c => this.decorateClient(clone(c)));
  }

  async getClient(id) {
    const client = this.clients.find(c => c.id === id);
    return client ? this.decorateClient(clone(client)) : null;
  }

  async createClient(input, actorId) {
    if (!this.segments.some(s => s.id === input.segmentId)) throw missing('Segmento');
    const email = input.email.toLowerCase();
    if (this.clients.some(c => c.email === email)) throw conflict('El correo del cliente ya está registrado.');
    const client = { id: this.next(this.clients), ...input, email, createdAt: new Date().toISOString() };
    this.clients.push(client);
    this.event('client.created', 'client', client.id, actorId, { segmentId: client.segmentId });
    return this.getClient(client.id);
  }

  async updateClient(id, patch, actorId) {
    const client = this.clients.find(c => c.id === id);
    if (!client) throw missing('Cliente');
    if (patch.segmentId && !this.segments.some(s => s.id === patch.segmentId)) throw missing('Segmento');
    if (patch.email && this.clients.some(c => c.id !== id && c.email === patch.email.toLowerCase())) {
      throw conflict('El correo del cliente ya está registrado.');
    }
    Object.assign(client, patch);
    this.event('client.updated', 'client', id, actorId, { fields: Object.keys(patch) });
    return this.getClient(id);
  }

  /* ---------- Incidencias (equivalen a sp_RegisterIncident / sp_UpdateIncidentStatus) ---------- */
  decorateIncident(incident) {
    const service = this.services.find(s => s.id === incident.serviceId);
    return {
      ...incident,
      serviceName: service.name,
      slaHours: service.slaHours,
      clientName: this.clients.find(c => c.id === incident.clientId)?.name,
      categoryName: this.categories.find(c => c.id === incident.categoryId)?.name,
      assignedUserName: this.users.find(u => u.id === incident.assignedUserId)?.name || null
    };
  }

  async listIncidents(filter = {}) {
    return this.incidents
      .filter(i => !filter.clientId || i.clientId === filter.clientId)
      .map(i => this.decorateIncident(clone(i)))
      .sort(newest);
  }

  async getIncident(id) {
    const incident = this.incidents.find(i => i.id === id);
    return incident ? this.decorateIncident(clone(incident)) : null;
  }

  async createIncident(input, actorId) {
    const client = this.clients.find(c => c.id === input.clientId);
    if (!client) throw missing('Cliente');
    if (client.status !== 'activo') throw conflict('El cliente está inactivo.');
    if (!this.services.some(s => s.id === input.serviceId && s.active)) throw missing('Servicio activo');
    if (!this.categories.some(c => c.id === input.categoryId)) throw missing('Categoría');
    if (input.assignedUserId && !this.users.some(u => u.id === input.assignedUserId && u.active)) throw missing('Responsable activo');
    const createdAt = input.createdAt || new Date().toISOString();
    const incident = {
      id: this.next(this.incidents), ...input, status: 'abierta', createdById: actorId,
      createdAt, resolvedAt: null, version: 1, updatedAt: createdAt
    };
    this.incidents.push(incident);
    this.event('incident.created', 'client', incident.clientId, actorId, { incidentId: incident.id, severity: incident.severity });
    return this.getIncident(incident.id);
  }

  async updateIncident(id, patch, actorId) {
    const incident = this.incidents.find(i => i.id === id);
    if (!incident) throw missing('Incidencia');
    if (incident.version !== patch.expectedVersion) throw conflict('Otra persona modificó la incidencia. Actualiza y vuelve a intentarlo.');
    if (incident.status === patch.status) return this.getIncident(id);
    if (!canTransition(incident.status, patch.status)) throw conflict('La transición de estado no está permitida.');
    incident.status = patch.status;
    incident.version++;
    incident.updatedAt = patch.at || new Date().toISOString();
    if (incident.status === 'resuelta') incident.resolvedAt = incident.updatedAt;
    this.event('incident.status_changed', 'client', incident.clientId, actorId, { incidentId: id, status: incident.status });
    return this.getIncident(id);
  }

  /* ---------- Retención (equivalen a sp_CreateRetentionAction / sp_CompleteRetentionAction) ---------- */
  decorateAction(action) {
    return {
      ...action,
      clientName: this.clients.find(c => c.id === action.clientId)?.name,
      assignedUserName: this.users.find(u => u.id === action.assignedUserId)?.name
    };
  }

  async listActions(filter = {}) {
    return this.actions
      .filter(a => !filter.clientId || a.clientId === filter.clientId)
      .map(a => this.decorateAction(clone(a)))
      .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt) || a.id - b.id);
  }

  async getAction(id) {
    const action = this.actions.find(a => a.id === id);
    return action ? this.decorateAction(clone(action)) : null;
  }

  async createAction(input, actorId) {
    const client = this.clients.find(c => c.id === input.clientId);
    if (!client) throw missing('Cliente');
    if (client.status !== 'activo') throw conflict('El cliente está inactivo.');
    if (!this.users.some(u => u.id === input.assignedUserId && u.active)) throw missing('Responsable activo');
    if (input.incidentId && !this.incidents.some(i => i.id === input.incidentId && i.clientId === input.clientId)) {
      throw conflict('La incidencia no pertenece a este cliente.');
    }
    const action = {
      id: this.next(this.actions), ...input, createdById: actorId, status: 'pendiente',
      outcome: null, createdAt: new Date().toISOString(), completedAt: null
    };
    this.actions.push(action);
    this.event('retention.created', 'client', action.clientId, actorId, { actionId: action.id, type: action.type });
    return this.getAction(action.id);
  }

  async completeAction(id, outcome, actorId) {
    const action = this.actions.find(a => a.id === id);
    if (!action) throw missing('Acción');
    if (action.status === 'completada') {
      if (action.outcome !== outcome) throw conflict('La acción ya tiene un resultado registrado.');
      return this.getAction(id);
    }
    action.status = 'completada';
    action.outcome = outcome;
    action.completedAt = new Date().toISOString();
    this.event('retention.completed', 'client', action.clientId, actorId, { actionId: id, outcome });
    return this.getAction(id);
  }

  /* ---------- Outbox ---------- */
  async pendingEvents() {
    return this.outbox
      .filter(e => !e.processed)
      .slice(0, 100)
      .map(({ processed, ...entry }) => clone(entry)); // eslint-disable-line no-unused-vars
  }

  async markEvent(eventId) {
    const event = this.outbox.find(e => e.eventId === eventId);
    if (event) event.processed = true;
  }

  async health() {
    return { sql: 'demo', outboxPending: this.outbox.filter(e => !e.processed).length };
  }

  async close() {}
}

export class MemoryAudit {
  constructor() {
    this.logs = [];
    this.comments = [];
  }

  /** Idempotente por eventId, igual que el índice único de MongoDB. */
  async write(entry) {
    if (!this.logs.some(e => e.eventId === entry.eventId)) this.logs.push(clone(entry));
  }

  async list({ clientId, kind, limit = 20, page = 1 } = {}) {
    const rows = this.logs
      .filter(e => !clientId || (e.entity === 'client' && e.entityId === clientId))
      .filter(e => !kind || (kind === 'http') === (e.eventType === 'http.request'))
      .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));
    return { data: clone(rows.slice((page - 1) * limit, page * limit)), pagination: pageInfo(rows.length, { page, limit }) };
  }

  /** Mismo resultado que el pipeline de agregación de MongoAudit.summary. */
  async summary({ days = 14 } = {}) {
    const since = Date.now() - days * DAY_MS;
    const rows = this.logs.filter(e => new Date(e.occurredAt).getTime() >= since);
    const count = (list, key) => {
      const map = new Map();
      for (const row of list) map.set(key(row), (map.get(key(row)) || 0) + 1);
      return map;
    };
    const business = rows.filter(e => e.eventType !== 'http.request');
    const http = rows.filter(e => e.eventType === 'http.request');
    const byType = [...count(rows, e => e.eventType)].map(([eventType, n]) => ({ eventType, count: n })).sort((a, b) => b.count - a.count || a.eventType.localeCompare(b.eventType));
    const byDay = [...count(business, e => new Date(e.occurredAt).toISOString().slice(0, 10))].map(([date, n]) => ({ date, count: n })).sort((a, b) => a.date.localeCompare(b.date));
    const avg = http.length ? Math.round(http.reduce((s, e) => s + e.payload.durationMs, 0) / http.length) : 0;
    return {
      days,
      byType,
      byDay,
      http: { total: http.length, errors: http.filter(e => e.payload.status >= 400).length, avgDurationMs: avg }
    };
  }

  async addComment(clientId, input, user) {
    const comment = { id: randomUUID(), clientId, ...input, authorId: user.id, authorName: user.name, createdAt: new Date().toISOString() };
    this.comments.push(comment);
    return clone(comment);
  }

  async listComments(clientId, { page = 1, limit = 20 } = {}) {
    const rows = this.comments.filter(c => c.clientId === clientId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return { data: clone(rows.slice((page - 1) * limit, page * limit)), pagination: pageInfo(rows.length, { page, limit }) };
  }

  async health() {
    return { mongo: 'demo' };
  }

  async close() {}
}
