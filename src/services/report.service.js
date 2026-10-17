import { toCsv } from '../utils/csv.js';

const factorPoints = (client, key) => client.risk.factors.find(f => f.key === key)?.points ?? 0;

const CLIENT_COLUMNS = [
  { label: 'ID', value: c => c.id },
  { label: 'Cliente', value: c => c.name },
  { label: 'Correo', value: c => c.email },
  { label: 'Teléfono', value: c => c.phone },
  { label: 'Segmento', value: c => c.segmentName },
  { label: 'Estado', value: c => c.status },
  { label: 'Puntaje', value: c => c.risk.score },
  { label: 'Nivel', value: c => c.risk.level },
  { label: 'Satisfacción', value: c => factorPoints(c, 'satisfaction') },
  { label: 'Pendientes', value: c => factorPoints(c, 'open') },
  { label: 'Repetición', value: c => factorPoints(c, 'repeated') },
  { label: 'Gravedad', value: c => factorPoints(c, 'severity') },
  { label: 'SLA vencido', value: c => factorPoints(c, 'sla') },
  { label: 'Recomendación', value: c => c.risk.recommendation }
];

/** Exportaciones para análisis externo (Excel, Power BI). */
export class ReportService {
  constructor(clients) {
    this.clients = clients;
  }

  async clientsCsv(filters = {}) {
    const rows = await this.clients.filtered(filters);
    return { filename: `fugacliente-clientes-${new Date().toISOString().slice(0, 10)}.csv`, content: toCsv(CLIENT_COLUMNS, rows), count: rows.length };
  }
}
