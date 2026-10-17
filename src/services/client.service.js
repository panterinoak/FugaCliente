import { randomUUID } from 'node:crypto';
import { calculateRisk } from './risk.js';
import { missing } from '../utils/errors.js';
import { matchesSearch, paginate } from '../utils/pagination.js';

const byRisk = (a, b) => b.risk.score - a.risk.score || a.id - b.id;

/**
 * Casos de uso de clientes. Combina datos transaccionales (SQL Server) con comentarios (MongoDB)
 * y calcula el riesgo explicable de cada cliente a partir de su historial de incidencias.
 */
export class ClientService {
  constructor(repository, audit) {
    this.repository = repository;
    this.audit = audit;
  }

  /** Clientes con su riesgo calculado en un único recorrido de incidencias. */
  async snapshot(now = new Date()) {
    const [clients, incidents] = await Promise.all([this.repository.listClients(), this.repository.listIncidents()]);
    const byClient = Map.groupBy(incidents, incident => incident.clientId);
    return clients.map(client => ({ ...client, risk: calculateRisk(byClient.get(client.id) || [], now) }));
  }

  async filtered({ search = '', status, level } = {}) {
    return (await this.snapshot())
      .filter(c => matchesSearch(c, search, ['name', 'email']))
      .filter(c => !status || c.status === status)
      .filter(c => !level || c.risk.level === level)
      .sort(byRisk);
  }

  async list(query = {}) {
    return paginate(await this.filtered(query), query);
  }

  /** Clientes activos con riesgo medio o alto, ordenados por prioridad. */
  async alerts(query = {}) {
    const rows = (await this.filtered({ ...query, status: 'activo' })).filter(c => c.risk.level !== 'bajo');
    return paginate(rows, query);
  }

  async get(id) {
    const client = await this.repository.getClient(id);
    if (!client) throw missing('Cliente');
    return client;
  }

  async create(input, actorId) {
    return this.repository.createClient(input, actorId);
  }

  async update(id, patch, actorId) {
    return this.repository.updateClient(id, patch, actorId);
  }

  /** Archivo lógico: conserva incidencias, acciones y auditoría. */
  async archive(id, actorId) {
    await this.repository.updateClient(id, { status: 'inactivo' }, actorId);
  }

  async risk(id) {
    const client = await this.get(id);
    return { client, risk: calculateRisk(await this.repository.listIncidents({ clientId: id })) };
  }

  async comments(id, query) {
    await this.get(id);
    return this.audit.listComments(id, query);
  }

  async addComment(id, input, user) {
    await this.get(id);
    const comment = await this.audit.addComment(id, input, user);
    // El comentario ya está confirmado; un fallo de la auditoría secundaria no lo convierte en error.
    void this.audit.write({
      eventId: randomUUID(), eventType: 'comment.created', entity: 'client', entityId: id,
      actorId: user.id, occurredAt: new Date(), payload: { commentId: comment.id, channel: comment.channel }
    }).catch(() => console.error('No se pudo registrar el evento del comentario.'));
    return comment;
  }
}
