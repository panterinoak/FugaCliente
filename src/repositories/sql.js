import sql from 'mssql';
import { sqlConfig } from '../config/env.js';
import { conflict, missing } from '../utils/errors.js';

const userSelect = `SELECT u.UserId AS id, u.Name AS name, u.Email AS email, u.PasswordHash AS passwordHash,
  r.Code AS role, u.Active AS active, u.CreatedAt AS createdAt FROM dbo.Users u JOIN dbo.Roles r ON r.RoleId = u.RoleId`;
const clientSelect = `SELECT c.ClientId AS id, c.Name AS name, c.Email AS email, c.Phone AS phone,
  c.SegmentId AS segmentId, s.Name AS segmentName, c.Status AS status, c.CreatedAt AS createdAt
  FROM dbo.Clients c JOIN dbo.ClientSegments s ON s.SegmentId = c.SegmentId`;
const incidentSelect = `SELECT i.IncidentId AS id, i.ClientId AS clientId, c.Name AS clientName, i.ServiceId AS serviceId,
  s.Name AS serviceName, s.SlaHours AS slaHours, i.CategoryId AS categoryId, cat.Name AS categoryName,
  i.AssignedUserId AS assignedUserId, u.Name AS assignedUserName, i.CreatedById AS createdById,
  i.Description AS description, i.Severity AS severity, i.Satisfaction AS satisfaction, i.Status AS status,
  i.CreatedAt AS createdAt, i.UpdatedAt AS updatedAt, i.ResolvedAt AS resolvedAt, i.Version AS version
  FROM dbo.Incidents i JOIN dbo.Clients c ON c.ClientId = i.ClientId JOIN dbo.Services s ON s.ServiceId = i.ServiceId
  JOIN dbo.IncidentCategories cat ON cat.CategoryId = i.CategoryId LEFT JOIN dbo.Users u ON u.UserId = i.AssignedUserId`;
const actionSelect = `SELECT a.ActionId AS id, a.ClientId AS clientId, c.Name AS clientName, l.IncidentId AS incidentId,
  a.AssignedUserId AS assignedUserId, u.Name AS assignedUserName, a.CreatedById AS createdById,
  a.Type AS type, a.Description AS description, a.DueAt AS dueAt, a.Status AS status, a.Outcome AS outcome,
  a.CreatedAt AS createdAt, a.CompletedAt AS completedAt FROM dbo.RetentionActions a
  JOIN dbo.Clients c ON c.ClientId = a.ClientId JOIN dbo.Users u ON u.UserId = a.AssignedUserId
  LEFT JOIN dbo.RetentionActionIncidents l ON l.ActionId = a.ActionId`;

export class SqlRepository {
  constructor(pool) { this.pool = pool; }
  static async connect(config) {
    const pool = new sql.ConnectionPool(sqlConfig(config));
    pool.on('error', () => console.error('Error del pool de SQL Server.'));
    await pool.connect(); return new SqlRepository(pool);
  }
  request(params = {}, executor = this.pool) {
    const request = new sql.Request(executor);
    for (const [key, value] of Object.entries(params)) request.input(key, value ?? null);
    return request;
  }
  async query(text, params = {}, executor = this.pool) { return this.request(params, executor).query(text); }
  async mutate(operation) {
    const transaction = new sql.Transaction(this.pool); await transaction.begin();
    try { const result = await operation(transaction); await transaction.commit(); return result; }
    catch (err) { try { await transaction.rollback(); } catch { /* Puede haber rollback automático por XACT_ABORT. */ } throw err; }
  }
  async event(tx, eventType, entity, entityId, actorId, payload) {
    await this.request({ EventType: eventType, Entity: entity, EntityId: entityId, ActorId: actorId, Payload: JSON.stringify(payload) }, tx).execute('dbo.sp_QueueEvent');
  }
  async listUsers() { return (await this.query(userSelect + ' ORDER BY u.UserId')).recordset; }
  async getUser(id) { return (await this.query(userSelect + ' WHERE u.UserId = @id', { id })).recordset[0] || null; }
  async findUserByEmail(email) { return (await this.query(userSelect + ' WHERE u.Email = @email', { email })).recordset[0] || null; }
  async createUser(input, actorId = null) {
    const id = await this.mutate(async tx => {
      const role = (await this.query('SELECT RoleId AS id FROM dbo.Roles WHERE Code = @role', { role: input.role }, tx)).recordset[0];
      if (!role) throw missing('Rol');
      const result = await this.query(`INSERT dbo.Users(Name, Email, PasswordHash, RoleId) OUTPUT INSERTED.UserId AS id VALUES (@name, @email, @passwordHash, @roleId)`, { ...input, roleId: role.id }, tx);
      const id = result.recordset[0].id;
      await this.event(tx, 'user.created', 'user', id, actorId, { role: input.role }); return id;
    });
    return this.getUser(id);
  }
  async catalogs() {
    const result = await this.query(`SELECT RoleId AS id, Code AS code, Name AS name FROM dbo.Roles ORDER BY RoleId;
      SELECT SegmentId AS id, Name AS name FROM dbo.ClientSegments ORDER BY SegmentId;
      SELECT ServiceId AS id, Name AS name, SlaHours AS slaHours, Active AS active FROM dbo.Services ORDER BY ServiceId;
      SELECT CategoryId AS id, Name AS name FROM dbo.IncidentCategories ORDER BY CategoryId;`);
    const [roles, segments, services, categories] = result.recordsets; return { roles, segments, services, categories };
  }
  async listServices() { return (await this.catalogs()).services; }
  async createService(input, actorId) {
    const id = await this.mutate(async tx => {
      const result = await this.query('INSERT dbo.Services(Name, SlaHours) OUTPUT INSERTED.ServiceId AS id VALUES (@name, @slaHours)', input, tx);
      const id = result.recordset[0].id; await this.event(tx, 'service.created', 'service', id, actorId, { slaHours: input.slaHours }); return id;
    });
    return (await this.listServices()).find(s => s.id === id);
  }
  async listClients() { return (await this.query(clientSelect + ' ORDER BY c.ClientId')).recordset; }
  async getClient(id) { return (await this.query(clientSelect + ' WHERE c.ClientId = @id', { id })).recordset[0] || null; }
  async createClient(input, actorId) {
    const id = await this.mutate(async tx => {
      if (!(await this.query('SELECT SegmentId FROM dbo.ClientSegments WHERE SegmentId = @segmentId', { segmentId: input.segmentId }, tx)).recordset.length) throw missing('Segmento');
      const result = await this.query('INSERT dbo.Clients(Name, Email, Phone, SegmentId, Status) OUTPUT INSERTED.ClientId AS id VALUES (@name, @email, @phone, @segmentId, @status)', input, tx);
      const id = result.recordset[0].id; await this.event(tx, 'client.created', 'client', id, actorId, { segmentId: input.segmentId }); return id;
    });
    return this.getClient(id);
  }
  async updateClient(id, patch, actorId) {
    const columns = { name: 'Name', email: 'Email', phone: 'Phone', segmentId: 'SegmentId', status: 'Status' };
    await this.mutate(async tx => {
      if (!(await this.query('SELECT ClientId FROM dbo.Clients WITH (UPDLOCK,HOLDLOCK) WHERE ClientId = @id', { id }, tx)).recordset.length) throw missing('Cliente');
      if (patch.segmentId && !(await this.query('SELECT SegmentId FROM dbo.ClientSegments WHERE SegmentId = @segmentId', { segmentId: patch.segmentId }, tx)).recordset.length) throw missing('Segmento');
      const fields = Object.keys(patch);
      if (!fields.length || fields.some(f => !columns[f])) throw conflict('Los campos de actualización no son válidos.');
      await this.query(`UPDATE dbo.Clients SET ${fields.map(f => `${columns[f]} = @${f}`).join(', ')} WHERE ClientId = @id`, { ...patch, id }, tx);
      await this.event(tx, 'client.updated', 'client', id, actorId, { fields });
    });
    return this.getClient(id);
  }
  async listIncidents({ clientId } = {}) { return (await this.query(incidentSelect + (clientId ? ' WHERE i.ClientId = @clientId' : '') + ' ORDER BY i.CreatedAt DESC, i.IncidentId DESC', clientId ? { clientId } : {})).recordset; }
  async getIncident(id) { return (await this.query(incidentSelect + ' WHERE i.IncidentId = @id', { id })).recordset[0] || null; }
  async createIncident(input, actorId) {
    const params = { ClientId: input.clientId, ServiceId: input.serviceId, CategoryId: input.categoryId,
      Description: input.description, Severity: input.severity, Satisfaction: input.satisfaction,
      AssignedUserId: input.assignedUserId, CreatedById: actorId, CreatedAt: input.createdAt ? new Date(input.createdAt) : null };
    const result = await this.request(params).execute('dbo.sp_RegisterIncident'); return this.getIncident(result.recordset[0].id);
  }
  async updateIncident(id, patch, actorId) {
    await this.request({ IncidentId: id, Status: patch.status, ExpectedVersion: patch.expectedVersion, ActorId: actorId }).execute('dbo.sp_UpdateIncidentStatus');
    return this.getIncident(id);
  }
  async listActions({ clientId } = {}) { return (await this.query(actionSelect + (clientId ? ' WHERE a.ClientId = @clientId' : '') + ' ORDER BY a.DueAt, a.ActionId', clientId ? { clientId } : {})).recordset; }
  async getAction(id) { return (await this.query(actionSelect + ' WHERE a.ActionId = @id', { id })).recordset[0] || null; }
  async createAction(input, actorId) {
    const result = await this.request({ ClientId: input.clientId, IncidentId: input.incidentId, AssignedUserId: input.assignedUserId,
      CreatedById: actorId, Type: input.type, Description: input.description, DueAt: new Date(input.dueAt) }).execute('dbo.sp_CreateRetentionAction');
    return this.getAction(result.recordset[0].id);
  }
  async completeAction(id, outcome, actorId) {
    await this.request({ ActionId: id, Outcome: outcome, ActorId: actorId }).execute('dbo.sp_CompleteRetentionAction'); return this.getAction(id);
  }
  async pendingEvents() {
    const rows = (await this.query(`SELECT TOP (100) CONVERT(VARCHAR(36),EventId) AS eventId, EventType AS eventType, Entity AS entity,
      EntityId AS entityId, ActorId AS actorId, OccurredAt AS occurredAt, Payload AS payload
      FROM dbo.AuditOutbox WHERE ProcessedAt IS NULL ORDER BY OccurredAt, EventId`)).recordset;
    return rows.map(r => ({ ...r, payload: JSON.parse(r.payload) }));
  }
  async markEvent(eventId) { await this.query('UPDATE dbo.AuditOutbox SET ProcessedAt = SYSUTCDATETIME() WHERE EventId = @eventId AND ProcessedAt IS NULL', { eventId }); }
  async health() { const result = await this.query('SELECT COUNT(*) AS pending FROM dbo.AuditOutbox WHERE ProcessedAt IS NULL'); return { sql: 'ok', outboxPending: result.recordset[0].pending }; }
  async close() { await this.pool.close(); }
}
