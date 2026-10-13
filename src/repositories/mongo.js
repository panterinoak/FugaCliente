import { MongoClient } from 'mongodb';

export class MongoAudit {
  constructor(client, db) { this.client = client; this.db = db; this.events = db.collection('events'); this.comments = db.collection('comments'); }
  static async connect(config) {
    const client = new MongoClient(config.MONGO_URI, { serverSelectionTimeoutMS: 10000, socketTimeoutMS: 10000, maxPoolSize: 10 });
    try {
      await client.connect(); const db = client.db(config.MONGO_DATABASE);
      const collections = await db.listCollections({}, { nameOnly: true }).toArray();
      if (!collections.some(c => c.name === 'events')) await db.createCollection('events', {
        validator: { $jsonSchema: { bsonType: 'object', required: ['eventId', 'eventType', 'entity', 'occurredAt', 'payload'], properties: {
          eventId: { bsonType: 'string' }, eventType: { bsonType: 'string' }, entity: { bsonType: 'string' }, occurredAt: { bsonType: 'date' }, payload: { bsonType: 'object' }
        } } }
      });
      if (!collections.some(c => c.name === 'comments')) await db.createCollection('comments', {
        validator: { $jsonSchema: { bsonType: 'object', required: ['clientId', 'text', 'authorId', 'channel', 'createdAt'], properties: {
          clientId: { bsonType: ['int', 'long', 'double'] }, text: { bsonType: 'string', minLength: 2, maxLength: 3000 }, authorId: { bsonType: ['int', 'long', 'double'] }, channel: { enum: ['interno', 'telefono', 'correo', 'web'] }, createdAt: { bsonType: 'date' }
        } } }
      });
      const store = new MongoAudit(client, db);
      await store.events.createIndex({ eventId: 1 }, { unique: true });
      await store.events.createIndex({ entity: 1, entityId: 1, occurredAt: -1 });
      await store.events.createIndex({ occurredAt: 1 }, { expireAfterSeconds: config.LOG_RETENTION_DAYS * 86400 });
      await store.comments.createIndex({ clientId: 1, createdAt: -1 });
      return store;
    } catch (err) { await client.close(); throw err; }
  }
  async write(entry) {
    // Upsert idempotente: si se reintenta el outbox, el mismo evento no se duplica.
    const doc = { ...entry, occurredAt: new Date(entry.occurredAt) };
    await this.events.updateOne({ eventId: entry.eventId }, { $setOnInsert: doc }, { upsert: true });
  }
  async list({ clientId, page = 1, limit = 20 } = {}) {
    const filter = clientId ? { entity: 'client', entityId: clientId } : {};
    const [data, total] = await Promise.all([
      this.events.find(filter, { projection: { _id: 0 } }).sort({ occurredAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
      this.events.countDocuments(filter)
    ]);
    return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }
  async addComment(clientId, input, user) {
    const doc = { clientId, ...input, authorId: user.id, authorName: user.name, createdAt: new Date() };
    const result = await this.comments.insertOne(doc);
    const { _id, ...stored } = doc; return { id: result.insertedId.toHexString(), ...stored };
  }
  async listComments(clientId, { page = 1, limit = 20 } = {}) {
    const [rows, total] = await Promise.all([
      this.comments.find({ clientId }).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
      this.comments.countDocuments({ clientId })
    ]);
    return { data: rows.map(({ _id, ...r }) => ({ id: _id.toHexString(), ...r })), pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }
  async health() { await this.db.command({ ping: 1 }); return { mongo: 'ok' }; }
  async close() { await this.client.close(); }
}
