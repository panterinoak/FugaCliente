import { fileURLToPath } from 'node:url';
import { API_VERSION, APP_NAME } from '../config/constants.js';
import { ok } from '../utils/http.js';

const OPENAPI_FILE = fileURLToPath(new URL('../../docs/openapi.json', import.meta.url));
const startedAt = Date.now();

export const systemController = ({ repository, audit, config }) => ({
  index: (req, res) => ok(res, {
    name: APP_NAME, version: API_VERSION, mode: config.DB_MODE,
    docs: '/api/docs', openapi: '/api/openapi.json', health: '/api/health'
  }),

  /** 200 si SQL Server y MongoDB responden; 503 si alguna dependencia falla. */
  health: async (req, res) => {
    const [sql, mongo] = await Promise.allSettled([repository.health(), audit.health()]);
    const healthy = sql.status === 'fulfilled' && mongo.status === 'fulfilled';
    res.status(healthy ? 200 : 503).json({
      data: {
        status: healthy ? 'ok' : 'degraded',
        mode: config.DB_MODE,
        version: API_VERSION,
        uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
        sql: sql.status === 'fulfilled' ? sql.value.sql : 'error',
        mongo: mongo.status === 'fulfilled' ? mongo.value.mongo : 'error',
        outboxPending: sql.status === 'fulfilled' ? sql.value.outboxPending : null
      }
    });
  },

  openapi: (req, res) => res.sendFile(OPENAPI_FILE)
});
