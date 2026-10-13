import { randomUUID } from 'node:crypto';
import { conflict, missing } from '../utils/errors.js';

export class MemoryRepository {
  constructor() {
    this.users = []; this.clients = []; this.incidents = []; this.actions = []; this.outbox = [];
    this.roles = [{ id: 1, code: 'admin', name: 'Administrador' }, { id: 2, code: 'analista', name: 'Analista' }, { id: 3, code: 'agente', name: 'Agente de atención' }];
    this.segments = [{ id: 1, name: 'Persona' }, { id: 2, name: 'Pequeña empresa' }, { id: 3, name: 'Empresa' }];
    this.services = [{ id: 1, name: 'Soporte técnico', slaHours: 24, active: true }, { id: 2, name: 'Entrega de pedidos', slaHours: 48, active: true }, { id: 3, name: 'Atención comercial', slaHours: 12, active: true }];
    this.categories = [{ id: 1, name: 'Demora de atención' }, { id: 2, name: 'Trato inadecuado' }, { id: 3, name: 'Servicio defectuoso' }, { id: 4, name: 'Error de facturación' }];
  }
  next(rows) { return Math.max(0, ...rows.map(r => r.id)) + 1; }
  event(eventType, entity, entityId, actorId, payload) {
    this.outbox.push({ eventId: randomUUID(), eventType, entity, entityId, actorId, occurredAt: new Date(), payload, processed: false });
  }
  async listUsers() { return structuredClone(this.users); }
  async getUser(id) { return structuredClone(this.users.find(u => u.id === id) || null); }
  async findUserByEmail(email) { return structuredClone(this.users.find(u => u.email === email.toLowerCase()) || null); }
  async createUser(input, actorId = null) {
    if (this.users.some(u => u.email === input.email.toLowerCase())) throw conflict('El correo del usuario ya está registrado.');
    const user = { id: this.next(this.users), ...input, email: input.email.toLowerCase(), active: true, createdAt: new Date().toISOString() };
    this.users.push(user); this.event('user.created', 'user', user.id, actorId, { role: user.role }); return structuredClone(user);
  }
  async catalogs() { return structuredClone({ roles: this.roles, segments: this.segments, services: this.services, categories: this.categories }); }
  async listServices() { return structuredClone(this.services); }
  async createService(input, actorId) {
    if (this.services.some(s => s.name.toLowerCase() === input.name.toLowerCase())) throw conflict('El servicio ya existe.');
    const service = { id: this.next(this.services), ...input, active: true };
    this.services.push(service); this.event('service.created', 'service', service.id, actorId, { slaHours: service.slaHours }); return structuredClone(service);
  }
  decorateClient(c) { return { ...c, segmentName: this.segments.find(s => s.id === c.segmentId)?.name }; }
  async listClients() { return this.clients.map(c => this.decorateClient(structuredClone(c))); }
  async getClient(id) { const c = this.clients.find(c => c.id === id); return c ? this.decorateClient(structuredClone(c)) : null; }
  async createClient(input, actorId) {
    if (!this.segments.some(s => s.id === input.segmentId)) throw missing('Segmento');
    if (this.clients.some(c => c.email === input.email.toLowerCase())) throw conflict('El correo del cliente ya está registrado.');
    const client = { id: this.next(this.clients), ...input, email: input.email.toLowerCase(), createdAt: new Date().toISOString() };
    this.clients.push(client); this.event('client.created', 'client', client.id, actorId, { segmentId: client.segmentId }); return this.getClient(client.id);
  }
  async updateClient(id, patch, actorId) {
    const c = this.clients.find(c => c.id === id); if (!c) throw missing('Cliente');
    if (patch.segmentId && !this.segments.some(s => s.id === patch.segmentId)) throw missing('Segmento');
    if (patch.email && this.clients.some(c => c.id !== id && c.email === patch.email.toLowerCase())) throw conflict('El correo del cliente ya está registrado.');
    Object.assign(c, patch); this.event('client.updated', 'client', id, actorId, { fields: Object.keys(patch) }); return this.getClient(id);
  }
  decorateIncident(i) {
    const service = this.services.find(s => s.id === i.serviceId);
    return { ...i, serviceName: service.name, slaHours: service.slaHours, clientName: this.clients.find(c => c.id === i.clientId)?.name, categoryName: this.categories.find(c => c.id === i.categoryId)?.name, assignedUserName: this.users.find(u => u.id === i.assignedUserId)?.name || null };
  }
  async listIncidents(filter = {}) { return this.incidents.filter(i => !filter.clientId || i.clientId === filter.clientId).map(i => this.decorateIncident(structuredClone(i))).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt) || b.id - a.id); }
  async getIncident(id) { const i = this.incidents.find(i => i.id === id); return i ? this.decorateIncident(structuredClone(i)) : null; }
  async createIncident(input, actorId) {
    const client = this.clients.find(c => c.id === input.clientId);
    if (!client) throw missing('Cliente'); if (client.status !== 'activo') throw conflict('El cliente está inactivo.');
    if (!this.services.some(s => s.id === input.serviceId && s.active)) throw missing('Servicio activo');
    if (!this.categories.some(c => c.id === input.categoryId)) throw missing('Categoría');
    if (input.assignedUserId && !this.users.some(u => u.id === input.assignedUserId && u.active)) throw missing('Responsable activo');
    const createdAt = input.createdAt || new Date().toISOString();
    const incident = { id: this.next(this.incidents), ...input, status: 'abierta', createdById: actorId, createdAt, resolvedAt: null, version: 1, updatedAt: createdAt };
    this.incidents.push(incident); this.event('incident.created', 'client', incident.clientId, actorId, { incidentId: incident.id, severity: incident.severity }); return this.getIncident(incident.id);
  }
  async updateIncident(id, patch, actorId) {
    const i = this.incidents.find(i => i.id === id); if (!i) throw missing('Incidencia');
    if (i.version !== patch.expectedVersion) throw conflict('Otra persona modificó la incidencia. Actualiza y vuelve a intentarlo.');
    if (i.status === patch.status) return this.getIncident(id);
    if (i.status === 'resuelta' || (i.status === 'en_proceso' && patch.status === 'abierta')) throw conflict('La transición de estado no está permitida.');
    i.status = patch.status; i.version++; i.updatedAt = new Date().toISOString();
    if (i.status === 'resuelta') i.resolvedAt = i.updatedAt;
    this.event('incident.status_changed', 'client', i.clientId, actorId, { incidentId: id, status: i.status }); return this.getIncident(id);
  }
  decorateAction(a) { return { ...a, clientName: this.clients.find(c => c.id === a.clientId)?.name, assignedUserName: this.users.find(u => u.id === a.assignedUserId)?.name }; }
  async listActions(filter = {}) { return this.actions.filter(a => !filter.clientId || a.clientId === filter.clientId).map(a => this.decorateAction(structuredClone(a))).sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt)); }
  async getAction(id) { const a = this.actions.find(a => a.id === id); return a ? this.decorateAction(structuredClone(a)) : null; }
  async createAction(input, actorId) {
    const client = this.clients.find(c => c.id === input.clientId);
    if (!client) throw missing('Cliente'); if (client.status !== 'activo') throw conflict('El cliente está inactivo.');
    if (!this.users.some(u => u.id === input.assignedUserId && u.active)) throw missing('Responsable activo');
    if (input.incidentId && !this.incidents.some(i => i.id === input.incidentId && i.clientId === input.clientId)) throw conflict('La incidencia no pertenece a este cliente.');
    const action = { id: this.next(this.actions), ...input, createdById: actorId, status: 'pendiente', outcome: null, createdAt: new Date().toISOString(), completedAt: null };
    this.actions.push(action); this.event('retention.created', 'client', action.clientId, actorId, { actionId: action.id, type: action.type }); return this.getAction(action.id);
  }
  async completeAction(id, outcome, actorId) {
    const a = this.actions.find(a => a.id === id); if (!a) throw missing('Acción');
    if (a.status === 'completada') { if (a.outcome !== outcome) throw conflict('La acción ya tiene un resultado registrado.'); return this.getAction(id); }
    a.status = 'completada'; a.outcome = outcome; a.completedAt = new Date().toISOString();
    this.event('retention.completed', 'client', a.clientId, actorId, { actionId: id, outcome }); return this.getAction(id);
  }
  async pendingEvents() { return this.outbox.filter(e => !e.processed).slice(0, 100).map(e => { const { processed, ...entry } = e; return structuredClone(entry); }); }
  async markEvent(eventId) { const e = this.outbox.find(e => e.eventId === eventId); if (e) e.processed = true; }
  async health() { return { sql: 'demo', outboxPending: this.outbox.filter(e => !e.processed).length }; }
  async close() {}
}

export class MemoryAudit {
  constructor() { this.logs = []; this.comments = []; }
  async write(entry) { if (!this.logs.some(e => e.eventId === entry.eventId)) this.logs.push(structuredClone(entry)); }
  async list({ clientId, limit = 20, page = 1 } = {}) {
    const rows = this.logs.filter(e => !clientId || (e.entity === 'client' && e.entityId === clientId)).sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));
    return { data: structuredClone(rows.slice((page - 1) * limit, page * limit)), pagination: { page, limit, total: rows.length, pages: Math.ceil(rows.length / limit) } };
  }
  async addComment(clientId, input, user) {
    const c = { id: randomUUID(), clientId, ...input, authorId: user.id, authorName: user.name, createdAt: new Date().toISOString() };
    this.comments.push(c); return structuredClone(c);
  }
  async listComments(clientId, { page = 1, limit = 20 } = {}) {
    const rows = this.comments.filter(c => c.clientId === clientId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return { data: structuredClone(rows.slice((page - 1) * limit, page * limit)), pagination: { page, limit, total: rows.length, pages: Math.ceil(rows.length / limit) } };
  }
  async health() { return { mongo: 'demo' }; }
  async close() {}
}
