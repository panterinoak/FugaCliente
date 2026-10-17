import { missing } from '../utils/errors.js';
import { matchesSearch, paginate } from '../utils/pagination.js';

/** Acciones de retención: responsable, fecha límite y resultado inmutable una vez registrado. */
export class RetentionService {
  constructor(repository) {
    this.repository = repository;
  }

  async list({ clientId, status, search, ...page } = {}) {
    const now = Date.now();
    const rows = (await this.repository.listActions({ clientId }))
      .filter(a => !status || a.status === status)
      .filter(a => matchesSearch(a, search, ['description', 'clientName', 'assignedUserName']))
      .map(a => ({ ...a, overdue: a.status === 'pendiente' && new Date(a.dueAt).getTime() < now }));
    return paginate(rows, page);
  }

  async get(id) {
    const action = await this.repository.getAction(id);
    if (!action) throw missing('Acción');
    return action;
  }

  create(input, actorId) {
    return this.repository.createAction(input, actorId);
  }

  complete(id, outcome, actorId) {
    return this.repository.completeAction(id, outcome, actorId);
  }
}
