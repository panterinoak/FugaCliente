import { Router } from 'express';
import { analyticsController } from '../controllers/analytics.controller.js';
import { roles } from '../middlewares/auth.js';
import { validate } from '../middlewares/validation.js';
import { listSchema, logListSchema, reportSchema, summarySchema } from '../validators/schemas.js';
import { PRIVILEGED_ROLES } from '../config/constants.js';

export function analyticsRoutes(container) {
  const router = Router();
  const controller = analyticsController(container);
  const privileged = roles(...PRIVILEGED_ROLES);
  router.get('/dashboard', controller.dashboard);
  router.get('/alerts', validate(listSchema, 'query'), controller.alerts);
  router.get('/logs', privileged, validate(logListSchema, 'query'), controller.logs);
  router.get('/logs/summary', privileged, validate(summarySchema, 'query'), controller.logSummary);
  router.get('/reports/clients.csv', privileged, validate(reportSchema, 'query'), controller.clientsCsv);
  return router;
}
