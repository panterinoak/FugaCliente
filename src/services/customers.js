import { calculateRisk } from './risk.js';
import { missing } from '../utils/errors.js';

export function paginate(rows, { page = 1, limit = 20 } = {}) {
  return { data: rows.slice((page - 1) * limit, page * limit), pagination: { page, limit, total: rows.length, pages: Math.ceil(rows.length / limit) } };
}
export class CustomerService {
  constructor(repository) { this.repository = repository; }
  async snapshot(now = new Date()) {
    const [clients, incidents] = await Promise.all([this.repository.listClients(), this.repository.listIncidents()]);
    const byClient = new Map();
    for (const i of incidents) { if (!byClient.has(i.clientId)) byClient.set(i.clientId, []); byClient.get(i.clientId).push(i); }
    return clients.map(c => ({ ...c, risk: calculateRisk(byClient.get(c.id) || [], now) }));
  }
  async list(query = {}) {
    let rows = await this.snapshot();
    if (query.search) { const s = query.search.toLocaleLowerCase('es'); rows = rows.filter(c => `${c.name} ${c.email}`.toLocaleLowerCase('es').includes(s)); }
    if (query.status) rows = rows.filter(c => c.status === query.status);
    if (query.level) rows = rows.filter(c => c.risk.level === query.level);
    rows.sort((a, b) => b.risk.score - a.risk.score || a.id - b.id);
    return paginate(rows, query);
  }
  async risk(id) {
    const client = await this.repository.getClient(id);
    if (!client) throw missing('Cliente');
    return { client, risk: calculateRisk(await this.repository.listIncidents({ clientId: id })) };
  }
  async dashboard() {
    const [snapshot, incidents, actions] = await Promise.all([this.snapshot(), this.repository.listIncidents(), this.repository.listActions()]);
    const active = snapshot.filter(c => c.status === 'activo');
    const distribution = { bajo: 0, medio: 0, alto: 0 };
    active.forEach(c => distribution[c.risk.level]++);
    return {
      totalClients: active.length, distribution,
      atRisk: distribution.medio + distribution.alto,
      openIncidents: incidents.filter(i => i.status !== 'resuelta').length,
      pendingActions: actions.filter(a => a.status === 'pendiente').length,
      overdueActions: actions.filter(a => a.status === 'pendiente' && new Date(a.dueAt) < new Date()).length,
      priorityClients: active.filter(c => c.risk.level !== 'bajo').sort((a, b) => b.risk.score - a.risk.score || a.id - b.id).slice(0, 5)
    };
  }
}
