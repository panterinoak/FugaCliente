/**
 * Raíz de composición (inyección de dependencias manual).
 * Los servicios reciben repositorios por constructor, por lo que la misma lógica funciona con
 * SQL Server + MongoDB en producción y con repositorios en memoria en la demo y en las pruebas.
 */
import { AuthService } from './services/auth.service.js';
import { UserService } from './services/user.service.js';
import { CatalogService } from './services/catalog.service.js';
import { ClientService } from './services/client.service.js';
import { IncidentService } from './services/incident.service.js';
import { RetentionService } from './services/retention.service.js';
import { AnalyticsService } from './services/analytics.service.js';
import { ReportService } from './services/report.service.js';

export function createContainer({ repository, audit, config }) {
  const clients = new ClientService(repository, audit);
  return Object.freeze({
    repository,
    audit,
    config,
    auth: new AuthService(repository, config),
    users: new UserService(repository),
    catalogs: new CatalogService(repository),
    clients,
    incidents: new IncidentService(repository),
    retention: new RetentionService(repository),
    analytics: new AnalyticsService(repository, clients, audit),
    reports: new ReportService(clients)
  });
}
