/** Formato y vocabulario de la interfaz (es-PE). */
const LOCALE = 'es-PE';

const dateTime = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const dateOnly = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
const dayMonth = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' });
const longDate = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
const relative = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
const number = new Intl.NumberFormat(LOCALE);

export const fmt = {
  dateTime: value => (value ? dateTime.format(new Date(value)) : '—'),
  date: value => (value ? dateOnly.format(new Date(value)) : '—'),
  dayMonth: value => (value ? dayMonth.format(new Date(value)) : '—'),
  longDate: value => longDate.format(value ? new Date(value) : new Date()),
  number: value => number.format(value ?? 0),
  percent: value => (value === null || value === undefined ? '—' : `${number.format(value)} %`),
  /** "hace 3 horas", "en 2 días"… */
  relative(value) {
    if (!value) return '—';
    const diff = new Date(value).getTime() - Date.now();
    const abs = Math.abs(diff);
    const units = [['day', 86_400_000], ['hour', 3_600_000], ['minute', 60_000]];
    for (const [unit, ms] of units) if (abs >= ms || unit === 'minute') return relative.format(Math.round(diff / ms), unit);
    return '';
  },
  initials: value => String(value || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase(),
  /** Datetime-local por defecto: mañana a las 10:00 hora local. */
  tomorrowInput() {
    const d = new Date(Date.now() + 86_400_000);
    d.setHours(10, 0, 0, 0);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T10:00`;
  },
  greeting() {
    const h = new Date().getHours();
    return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  }
};

export const LABELS = {
  status: { activo: 'Activo', inactivo: 'Archivado', abierta: 'Abierta', en_proceso: 'En proceso', resuelta: 'Resuelta', pendiente: 'Pendiente', completada: 'Completada' },
  level: { alto: 'Riesgo alto', medio: 'Riesgo medio', bajo: 'Riesgo bajo' },
  levelShort: { alto: 'Alto', medio: 'Medio', bajo: 'Bajo' },
  role: { admin: 'Administrador', analista: 'Analista', agente: 'Agente' },
  actionType: { contacto: 'Contacto', compensacion: 'Compensación', seguimiento: 'Seguimiento' },
  outcome: { contactado: 'Contactado', recuperado: 'Recuperado', sin_respuesta: 'Sin respuesta' },
  channel: { interno: 'Nota interna', telefono: 'Teléfono', correo: 'Correo', web: 'Web' },
  severity: { 1: 'Leve', 2: 'Moderada', 3: 'Grave' },
  satisfaction: { 1: 'Muy insatisfecho', 2: 'Insatisfecho', 3: 'Neutral', 4: 'Satisfecho', 5: 'Muy satisfecho' },
  event: {
    'http.request': 'Petición HTTP', 'client.created': 'Cliente registrado', 'client.updated': 'Cliente actualizado',
    'incident.created': 'Incidencia registrada', 'incident.status_changed': 'Cambio de estado', 'retention.created': 'Acción asignada',
    'retention.completed': 'Acción completada', 'comment.created': 'Nota agregada', 'user.created': 'Usuario creado',
    'user.updated': 'Usuario actualizado', 'service.created': 'Servicio creado', 'service.updated': 'Servicio actualizado'
  }
};

/** Orden y nombres cortos de los cinco factores del puntaje. */
export const FACTORS = [
  { key: 'satisfaction', short: 'Satisfacción' },
  { key: 'open', short: 'Pendientes' },
  { key: 'repeated', short: 'Repetición' },
  { key: 'severity', short: 'Gravedad' },
  { key: 'sla', short: 'SLA vencido' }
];
