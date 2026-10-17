/**
 * Persistencia NoSQL (MongoDB): eventos de auditoría y comentarios en documentos BSON.
 * - `events`: esquema flexible (payload libre) con validador $jsonSchema, índice único por eventId,
 *   índice compuesto para consultas por cliente y TTL para la retención de logs.
 * - `comments`: notas de seguimiento con autor, canal y fecha.
 */
import { MongoClient } from 'mongodb';
import { DAY_MS } from '../config/constants.js';
import { pageInfo } from '../utils/pagination.js';

const EVENTS_VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['eventId', 'eventType', 'entity', 'occurredAt', 'payload'],
    properties: {
      eventId: { bsonType: 'string' },
      eventType: { bsonType: 'string' },
      entity: { bsonType: 'string' },
      entityId: { bsonType: ['int', 'long', 'double', 'null'] },
      actorId: { bsonType: ['int', 'long', 'double', 'null'] },
      occurredAt: { bsonType: 'date' },
      payload: { bsonType: 'object' }
    }
  }
};

const COMMENTS_VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['clientId', 'text', 'authorId', 'channel', 'createdAt'],
    properties: {
      clientId: { bsonType: ['int', 'long', 'double'] },
      text: { bsonType: 'string', minLength: 2, maxLength: 3000 },
      authorId: { bsonType: ['int', 'long', 'double'] },
      authorName: { bsonType: 'string' },
      channel: { enum: ['interno', 'telefono', 'correo', 'web'] },
      createdAt: { bsonType: 'date' }
    }
  }
};

export class MongoAudit {
  constructor(client, db) {
    this.client = client;
    this.db = db;
    this.events = db.collection('events');
    this.comments = db.collection('comments');
  }

  static async connect(config) {
    const client = new MongoClient(config.MONGO_URI, { serverSelectionTimeoutMS: 10_000, socketTimeoutMS: 10_000, maxPoolSize: 10 });
    try {
      await client.connect();
      const db = client.db(config.MONGO_DATABASE);
      const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map(c => c.name));
      if (!existing.has('events')) await db.createCollection('events', { validator: EVENTS_VALIDATOR });
      else await db.command({ collMod: 'events', validator: EVENTS_VALIDATOR }).catch(() => {});
      if (!existing.has('comments')) await db.createCollection('comments', { validator: COMMENTS_VALIDATOR });

      const store = new MongoAudit(client, db);
      await Promise.all([
        store.events.createIndex({ eventId: 1 }, { unique: true, name: 'ux_eventId' }),
        store.events.createIndex({ entity: 1, entityId: 1, occurredAt: -1 }, { name: 'ix_entity_date' }),
        store.events.createIndex({ eventType: 1, occurredAt: -1 }, { name: 'ix_type_date' }),
        store.events.createIndex({ occurredAt: 1 }, { expireAfterSeconds: config.LOG_RETENTION_DAYS * 86_400, name: 'ttl_occurredAt' }),
        store.comments.createIndex({ clientId: 1, createdAt: -1 }, { name: 'ix_client_date' })
      ]);
      return store;
    } catch (err) {
      await client.close();
      throw err;
    }
  }

  /** Upsert idempotente: si el outbox reintenta, el mismo evento no se duplica. */
  async write(entry) {
    const doc = { ...entry, occurredAt: new Date(entry.occurredAt) };
    await this.events.updateOne({ eventId: entry.eventId }, { $setOnInsert: doc }, { upsert: true });
  }

  async list({ clientId, kind, page = 1, limit = 20 } = {}) {
    const filter = clientId ? { entity: 'client', entityId: clientId } : {};
    if (kind === 'business') filter.eventType = { $ne: 'http.request' };
    if (kind === 'http') filter.eventType = 'http.request';
    const [data, total] = await Promise.all([
      this.events.find(filter, { projection: { _id: 0 } }).sort({ occurredAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
      this.events.countDocuments(filter)
    ]);
    return { data, pagination: pageInfo(total, { page, limit }) };
  }

  /**
   * Pipeline de agregación con $facet: en una sola consulta obtiene eventos por tipo,
   * actividad de negocio por día y métricas de las peticiones HTTP (total, errores, latencia).
   */
  async summary({ days = 14 } = {}) {
    const since = new Date(Date.now() - days * DAY_MS);
    const [result] = await this.events.aggregate([
      { $match: { occurredAt: { $gte: since } } },
      {
        $facet: {
          byType: [
            { $group: { _id: '$eventType', count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } },
            { $project: { _id: 0, eventType: '$_id', count: 1 } }
          ],
          byDay: [
            { $match: { eventType: { $ne: 'http.request' } } },
            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$occurredAt' } }, count: { $sum: 1 } } },
            { $sort: { _id: 1 } },
            { $project: { _id: 0, date: '$_id', count: 1 } }
          ],
          http: [
            { $match: { eventType: 'http.request' } },
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                errors: { $sum: { $cond: [{ $gte: ['$payload.status', 400] }, 1, 0] } },
                avgDurationMs: { $avg: '$payload.durationMs' }
              }
            }
          ]
        }
      }
    ]).toArray();
    const http = result.http[0] || { total: 0, errors: 0, avgDurationMs: 0 };
    return {
      days,
      byType: result.byType,
      byDay: result.byDay,
      http: { total: http.total, errors: http.errors, avgDurationMs: Math.round(http.avgDurationMs || 0) }
    };
  }

  async addComment(clientId, input, user) {
    const doc = { clientId, ...input, authorId: user.id, authorName: user.name, createdAt: new Date() };
    const result = await this.comments.insertOne(doc);
    const { _id, ...stored } = doc; // eslint-disable-line no-unused-vars
    return { id: result.insertedId.toHexString(), ...stored };
  }

  async listComments(clientId, { page = 1, limit = 20 } = {}) {
    const [rows, total] = await Promise.all([
      this.comments.find({ clientId }).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
      this.comments.countDocuments({ clientId })
    ]);
    return {
      data: rows.map(({ _id, ...row }) => ({ id: _id.toHexString(), ...row })),
      pagination: pageInfo(total, { page, limit })
    };
  }

  async health() {
    await this.db.command({ ping: 1 });
    return { mongo: 'ok' };
  }

  async close() {
    await this.client.close();
  }
}
