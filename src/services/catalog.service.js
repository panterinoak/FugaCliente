import { missing } from '../utils/errors.js';

/** Catálogos de referencia: roles, segmentos, servicios (con SLA) y categorías de incidencia. */
export class CatalogService {
  constructor(repository) {
    this.repository = repository;
  }

  catalogs() {
    return this.repository.catalogs();
  }

  listServices() {
    return this.repository.listServices();
  }

  async getService(id) {
    const service = (await this.repository.listServices()).find(s => s.id === id);
    if (!service) throw missing('Servicio');
    return service;
  }

  createService(input, actorId) {
    return this.repository.createService(input, actorId);
  }

  async updateService(id, patch, actorId) {
    await this.getService(id);
    return this.repository.updateService(id, patch, actorId);
  }
}
