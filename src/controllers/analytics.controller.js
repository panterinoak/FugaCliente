import { list, ok } from '../utils/http.js';

export const analyticsController = ({ analytics, clients, reports }) => ({
  dashboard: async (req, res) => ok(res, await analytics.dashboard()),
  alerts: async (req, res) => list(res, await clients.alerts(req.validated.query)),
  logs: async (req, res) => list(res, await analytics.logs(req.validated.query)),
  logSummary: async (req, res) => ok(res, await analytics.logSummary(req.validated.query)),
  clientsCsv: async (req, res) => {
    const report = await reports.clientsCsv(req.validated.query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
    res.setHeader('X-Total-Count', String(report.count));
    res.send(report.content);
  }
});
