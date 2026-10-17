/**
 * Persistencia relacional (SQL Server). Fuente de verdad de los datos de negocio.
 * - Consultas siempre parametrizadas (sin concatenar valores del usuario).
 * - Operaciones críticas en procedimientos almacenados transaccionales (dbo.sp_*).
 * - Lecturas de detalle desde vistas (dbo.vw_*) que encapsulan los JOIN de catálogos.
 * - Cada cambio encola su evento en dbo.AuditOutbox dentro de la misma transacción.
 */
import sql from 'mssql';
import { sqlConfig } from '../config/env.js';
import { conflict, missing } from '../utils/errors.js';

const USER_SELECT = `
  SELECT u.UserId AS id, u.Name AS name, u.Email AS email, u.PasswordHash AS passwordHash,
         r.Code AS role, u.Active AS active, u.CreatedAt AS createdAt
  FROM dbo.Users u
  JOIN dbo.Roles r ON r.RoleId = u.RoleId`;

const CLIENT_SELECT = `
  SELECT c.ClientId AS id, c.Name AS name, c.Email AS email, c.Phone AS phone,
         c.SegmentId AS segmentId, s.Name AS segmentName, c.Status AS status, c.CreatedAt AS createdAt
  FROM dbo.Clients c
  JOIN dbo.ClientSegments s ON s.SegmentId = c.SegmentId`;

const SERVICE_SELECT = 'SELECT ServiceId AS id, Name AS name, SlaHours AS slaHours, Active AS active FROM dbo.Services';
const INCIDENT_SELECT = 'SELECT * FROM dbo.vw_IncidentDetail';
const ACTION_SELECT = 'SELECT * FROM dbo.vw_RetentionActionDetail';

/** Lista blanca de columnas actualizables: los nombres de columna nunca provienen del usuario. */
const UPDATABLE = Object.freeze({
  client: { name: 'Name', email: 'Email', phone: 'Phone', segmentId: 'SegmentId', status: 'Status' },
  user: { name: 'Name', roleId: 'RoleId', active: 'Active' },
  service: { name: 'Name', slaHours: 'SlaHours', active: 'Active' }
});

function setClause(entity, patch) {
  const columns = UPDATABLE[entity];
  const fields = Object.keys(patch);
  if (!fields.length || fields.some(field => !columns[field])) throw conflict('Los campos de actualización no son válidos.');
  return { fields, sql: fields.map(field => `${columns[field]} = @${field}`).join(', ') };
}

export class SqlRepository {
  constructor(pool) {
    this.pool = pool;
  }

  static async connect(config) {
    const pool = new sql.ConnectionPool(sqlConfig(config));
    pool.on('error', () => console.error('Error del pool de SQL Server.'));
    await pool.connect();
    return new SqlRepository(pool);
  }

  request(params = {}, executor = this.pool) {
    const request = new sql.Request(executor);
    for (const [key, value] of Object.entries(params)) request.input(key, value ?? null);
    return request;
  }

  query(text, params = {}, executor = this.pool) {
    return this.request(params, executor).query(text);
  }

  async one(text, params, executor) {
    return (await this.query(text, params, executor)).recordset[0] || null;
  }

  async exists(text, params, executor) {
    return (await this.query(text, params, executor)).recordset.length > 0;
  }

  /** Ejecuta una unidad de trabajo en una transacción; ante cualquier error se revierte. */
  async mutate(operation) {
    const transaction = new sql.Transaction(this.pool);
    await transaction.begin();
    try {
      const result = await operation(transaction);
      await transaction.commit();
      return result;
    } catch (err) {
      try {
        await transaction.rollback();
      } catch {
        /* Puede haber rollback automático por XACT_ABORT. */
      }
      throw err;
    }
  }

  async event(tx, eventType, entity, entityId, actorId, payload) {
    await this.request({ EventType: eventType, Entity: entity, EntityId: entityId, ActorId: actorId, Payload: JSON.stringify(payload) }, tx)
      .execute('dbo.sp_QueueEvent');
  }

  /* ---------- Usuarios ---------- */
  async listUsers() {
    return (await this.query(`${USER_SELECT} ORDER BY u.UserId`)).recordset;
  }

  getUser(id) {
    return this.one(`${USER_SELECT} WHERE u.UserId = @id`, { id });
  }

  findUserByEmail(email) {
    return this.one(`${USER_SELECT} WHERE u.Email = @email`, { email });
  }

  async roleId(code, tx) {
    const role = await this.one('SELECT RoleId AS id FROM dbo.Roles WHERE Code = @code', { code }, tx);
    if (!role) throw missing('Rol');
    return role.id;
  }

  async createUser(input, actorId = null) {
    const id = await this.mutate(async tx => {
      const roleId = await this.roleId(input.role, tx);
      const row = await this.one(
        `INSERT dbo.Users(Name, Email, PasswordHash, RoleId) OUTPUT INSERTED.UserId AS id
         VALUES (@name, @email, @passwordHash, @roleId)`,
        { name: input.name, email: input.email, passwordHash: input.passwordHash, roleId }, tx
      );
      await this.event(tx, 'user.created', 'user', row.id, actorId, { role: input.role });
      return row.id;
    });
    return this.getUser(id);
  }

  async updateUser(id, patch, actorId) {
    await this.mutate(async tx => {
      if (!await this.exists('SELECT UserId FROM dbo.Users WITH (UPDLOCK, HOLDLOCK) WHERE UserId = @id', { id }, tx)) throw missing('Usuario');
      const { role, ...rest } = patch;
      const values = { ...rest, ...(role ? { roleId: await this.roleId(role, tx) } : {}) };
      const update = setClause('user', values);
      await this.query(`UPDATE dbo.Users SET ${update.sql} WHERE UserId = @id`, { ...values, id }, tx);
      await this.event(tx, 'user.updated', 'user', id, actorId, { fields: Object.keys(patch) });
    });
    return this.getUser(id);
  }

  /* ---------- Catálogos ---------- */
  async catalogs() {
    const result = await this.query(`
      SELECT RoleId AS id, Code AS code, Name AS name FROM dbo.Roles ORDER BY RoleId;
      SELECT SegmentId AS id, Name AS name FROM dbo.ClientSegments ORDER BY SegmentId;
      ${SERVICE_SELECT} ORDER BY ServiceId;
      SELECT CategoryId AS id, Name AS name FROM dbo.IncidentCategories ORDER BY CategoryId;`);
    const [roles, segments, services, categories] = result.recordsets;
    return { roles, segments, services, categories };
  }

  async listServices() {
    return (await this.query(`${SERVICE_SELECT} ORDER BY ServiceId`)).recordset;
  }

  getService(id) {
    return this.one(`${SERVICE_SELECT} WHERE ServiceId = @id`, { id });
  }

  async createService(input, actorId) {
    const id = await this.mutate(async tx => {
      const row = await this.one('INSERT dbo.Services(Name, SlaHours) OUTPUT INSERTED.ServiceId AS id VALUES (@name, @slaHours)', input, tx);
      await this.event(tx, 'service.created', 'service', row.id, actorId, { slaHours: input.slaHours });
      return row.id;
    });
    return this.getService(id);
  }

  async updateService(id, patch, actorId) {
    await this.mutate(async tx => {
      if (!await this.exists('SELECT ServiceId FROM dbo.Services WITH (UPDLOCK, HOLDLOCK) WHERE ServiceId = @id', { id }, tx)) throw missing('Servicio');
      const update = setClause('service', patch);
      await this.query(`UPDATE dbo.Services SET ${update.sql} WHERE ServiceId = @id`, { ...patch, id }, tx);
      await this.event(tx, 'service.updated', 'service', id, actorId, { fields: update.fields });
    });
    return this.getService(id);
  }

  /* ---------- Clientes ---------- */
  async listClients() {
    return (await this.query(`${CLIENT_SELECT} ORDER BY c.ClientId`)).recordset;
  }

  getClient(id) {
    return this.one(`${CLIENT_SELECT} WHERE c.ClientId = @id`, { id });
  }

  async createClient(input, actorId) {
    const id = await this.mutate(async tx => {
      if (!await this.exists('SELECT SegmentId FROM dbo.ClientSegments WHERE SegmentId = @segmentId', { segmentId: input.segmentId }, tx)) throw missing('Segmento');
      const row = await this.one(
        `INSERT dbo.Clients(Name, Email, Phone, SegmentId, Status) OUTPUT INSERTED.ClientId AS id
         VALUES (@name, @email, @phone, @segmentId, @status)`, input, tx
      );
      await this.event(tx, 'client.created', 'client', row.id, actorId, { segmentId: input.segmentId });
      return row.id;
    });
    return this.getClient(id);
  }

  async updateClient(id, patch, actorId) {
    await this.mutate(async tx => {
      if (!await this.exists('SELECT ClientId FROM dbo.Clients WITH (UPDLOCK, HOLDLOCK) WHERE ClientId = @id', { id }, tx)) throw missing('Cliente');
      if (patch.segmentId && !await this.exists('SELECT SegmentId FROM dbo.ClientSegments WHERE SegmentId = @segmentId', { segmentId: patch.segmentId }, tx)) {
        throw missing('Segmento');
      }
      const update = setClause('client', patch);
      await this.query(`UPDATE dbo.Clients SET ${update.sql} WHERE ClientId = @id`, { ...patch, id }, tx);
      await this.event(tx, 'client.updated', 'client', id, actorId, { fields: update.fields });
    });
    return this.getClient(id);
  }

  /* ---------- Incidencias ---------- */
  async listIncidents({ clientId } = {}) {
    const where = clientId ? ' WHERE clientId = @clientId' : '';
    return (await this.query(`${INCIDENT_SELECT}${where} ORDER BY createdAt DESC, id DESC`, clientId ? { clientId } : {})).recordset;
  }

  getIncident(id) {
    return this.one(`${INCIDENT_SELECT} WHERE id = @id`, { id });
  }

  async createIncident(input, actorId) {
    const result = await this.request({
      ClientId: input.clientId, ServiceId: input.serviceId, CategoryId: input.categoryId,
      Description: input.description, Severity: input.severity, Satisfaction: input.satisfaction,
      AssignedUserId: input.assignedUserId, CreatedById: actorId,
      CreatedAt: input.createdAt ? new Date(input.createdAt) : null
    }).execute('dbo.sp_RegisterIncident');
    return this.getIncident(result.recordset[0].id);
  }

  async updateIncident(id, patch, actorId) {
    await this.request({ IncidentId: id, Status: patch.status, ExpectedVersion: patch.expectedVersion, ActorId: actorId })
      .execute('dbo.sp_UpdateIncidentStatus');
    return this.getIncident(id);
  }

  /* ---------- Retención ---------- */
  async listActions({ clientId } = {}) {
    const where = clientId ? ' WHERE clientId = @clientId' : '';
    return (await this.query(`${ACTION_SELECT}${where} ORDER BY dueAt, id`, clientId ? { clientId } : {})).recordset;
  }

  getAction(id) {
    return this.one(`${ACTION_SELECT} WHERE id = @id`, { id });
  }

  async createAction(input, actorId) {
    const result = await this.request({
      ClientId: input.clientId, IncidentId: input.incidentId, AssignedUserId: input.assignedUserId,
      CreatedById: actorId, Type: input.type, Description: input.description, DueAt: new Date(input.dueAt)
    }).execute('dbo.sp_CreateRetentionAction');
    return this.getAction(result.recordset[0].id);
  }

  async completeAction(id, outcome, actorId) {
    await this.request({ ActionId: id, Outcome: outcome, ActorId: actorId }).execute('dbo.sp_CompleteRetentionAction');
    return this.getAction(id);
  }

  /* ---------- Outbox ---------- */
  async pendingEvents() {
    const rows = (await this.query(`
      SELECT TOP (100) CONVERT(VARCHAR(36), EventId) AS eventId, EventType AS eventType, Entity AS entity,
             EntityId AS entityId, ActorId AS actorId, OccurredAt AS occurredAt, Payload AS payload
      FROM dbo.AuditOutbox
      WHERE ProcessedAt IS NULL
      ORDER BY OccurredAt, EventId`)).recordset;
    return rows.map(row => ({ ...row, payload: JSON.parse(row.payload) }));
  }

  async markEvent(eventId) {
    await this.query('UPDATE dbo.AuditOutbox SET ProcessedAt = SYSUTCDATETIME() WHERE EventId = @eventId AND ProcessedAt IS NULL', { eventId });
  }

  async health() {
    const row = await this.one('SELECT COUNT(*) AS pending FROM dbo.AuditOutbox WHERE ProcessedAt IS NULL');
    return { sql: 'ok', outboxPending: row.pending };
  }

  async close() {
    await this.pool.close();
  }
}
