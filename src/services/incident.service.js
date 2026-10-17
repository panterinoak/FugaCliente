import { missing } from '../utils/errors.js';
import { matchesSearch, paginate } from '../utils/pagination.js';

/** Ciclo de vida de incidencias: registro transaccional y transiciones con control de versión. */
export class IncidentService {
  constructor(repository) {
    this.repository = repository;
  }

  async list({ clientId, status, search, ...page } = {}) {
    const rows = (await this.repository.listIncidents({ clientId }))
      .filter(i => !status || i.status === status)
      .filter(i => matchesSearch(i, search, ['description', 'clientName', 'serviceName', 'categoryName']));
    return paginate(rows, page);
  }

  async get(id) {
    const incident = await this.repository.getIncident(id);
    if (!incident) throw missing('Incidencia');
    return incident;
  }

  create(input, actorId) {
    return this.repository.createIncident(input, actorId);
  }

  updateStatus(id, patch, actorId) {
    return this.repository.updateIncident(id, patch, actorId);
  }
}
