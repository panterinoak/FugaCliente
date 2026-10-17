import { writeFile } from 'node:fs/promises';

const ref = name => ({ $ref: '#/components/schemas/' + name });
const json = schema => ({ 'application/json': { schema } });
const success = description => ({ description });
const errors = { '400': { description: 'Entrada inválida', content: json(ref('Error')) }, '401': { description: 'Sesión ausente o inválida' }, '403': { description: 'Rol sin permiso' }, '404': { description: 'Recurso inexistente' }, '409': { description: 'Duplicado, relación o versión en conflicto' } };
const field = (type, extra = {}) => ({ type, ...extra });
const id = field('integer', { minimum: 1 });
const idParameter = { name: 'id', in: 'path', required: true, schema: id };
const pageParameters = [{ name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } }, { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } }];
const searchParameter = { name: 'search', in: 'query', schema: { type: 'string', maxLength: 150 } };
const clientParameter = { name: 'clientId', in: 'query', schema: id };
const statusParameter = values => ({ name: 'status', in: 'query', schema: { type: 'string', enum: values } });
const levelParameter = { name: 'level', in: 'query', schema: { type: 'string', enum: ['bajo', 'medio', 'alto'] } };
const paths = {};
function route(path, method, summary, tag, { schema, code = 200, parameters = [], publicRoute = false, description = '' } = {}) {
  paths[path] ??= {};
  paths[path][method] = { summary, description, tags: [tag], ...(publicRoute ? { security: [] } : {}),
    ...(parameters.length ? { parameters } : {}), ...(schema ? { requestBody: { required: true, content: json(ref(schema)) } } : {}),
    responses: { [code]: success(code === 201 ? 'Recurso creado. Encabezado Location disponible.' : code === 204 ? 'Cliente archivado. Sin cuerpo.' : 'Operación correcta. Cuerpo data y pagination cuando corresponde.'), ...errors } };
}
route('/', 'get', 'Índice del API', 'Sistema', { publicRoute: true });
route('/health', 'get', 'Estado de SQL Server, MongoDB y outbox', 'Sistema', { publicRoute: true, description: '200 si ambos responden; 503 si alguna base no está disponible. En demo se indica explícitamente memoria temporal.' });
paths['/health'].get.responses['503'] = { description: 'Dependencia no disponible' };
route('/auth/login', 'post', 'Obtener JWT', 'Autenticación', { publicRoute: true, schema: 'Login', description: '20 intentos por 15 minutos por IP. Devuelve data.token, data.user y data.expiresIn.' });
route('/users/me', 'get', 'Perfil de la sesión', 'Usuarios');
route('/users', 'get', 'Listar usuarios sin hashes de contraseña', 'Usuarios');
route('/users', 'post', 'Crear usuario con rol', 'Usuarios', { schema: 'UserCreate', code: 201, description: 'Solo administrador.' });
route('/users/{id}', 'get', 'Consultar usuario', 'Usuarios', { parameters: [idParameter] });
route('/users/{id}', 'patch', 'Cambiar nombre, rol o acceso de un usuario', 'Usuarios', { schema: 'UserUpdate', parameters: [idParameter], description: 'Solo administrador. No puede cambiar su propio rol ni desactivarse; siempre queda al menos un administrador activo.' });
route('/catalogs', 'get', 'Roles, segmentos, servicios y categorías', 'Catálogos');
route('/services', 'get', 'Listar servicios y SLA', 'Servicios');
route('/services', 'post', 'Crear servicio', 'Servicios', { schema: 'ServiceCreate', code: 201, description: 'Solo administrador.' });
route('/services/{id}', 'get', 'Consultar servicio', 'Servicios', { parameters: [idParameter] });
route('/services/{id}', 'patch', 'Actualizar SLA, nombre o estado del servicio', 'Servicios', { schema: 'ServiceUpdate', parameters: [idParameter], description: 'Solo administrador.' });
route('/clients', 'get', 'Listar clientes con riesgo calculado', 'Clientes', { parameters: [...pageParameters, searchParameter, levelParameter, statusParameter(['activo', 'inactivo'])] });
route('/clients', 'post', 'Registrar cliente', 'Clientes', { schema: 'ClientCreate', code: 201 });
route('/clients/{id}', 'get', 'Consultar cliente', 'Clientes', { parameters: [idParameter] });
route('/clients/{id}', 'patch', 'Actualizar datos del cliente', 'Clientes', { schema: 'ClientUpdate', parameters: [idParameter], description: 'Administrador o analista. Al menos un campo.' });
route('/clients/{id}', 'delete', 'Archivar cliente conservando historial', 'Clientes', { code: 204, parameters: [idParameter], description: 'Solo administrador. No elimina físicamente al cliente.' });
route('/clients/{id}/risk', 'get', 'Consultar puntaje y factores explicables', 'Riesgo', { parameters: [idParameter], description: 'data.client y data.risk. Puntaje 0-100; nivel bajo 0-39, medio 40-69, alto 70-100. No es probabilidad estadística.' });
route('/clients/{id}/comments', 'get', 'Consultar comentarios en MongoDB', 'Comentarios', { parameters: [idParameter, ...pageParameters] });
route('/clients/{id}/comments', 'post', 'Agregar comentario', 'Comentarios', { parameters: [idParameter], schema: 'CommentCreate', code: 201 });
route('/incidents', 'get', 'Listar incidencias', 'Incidencias', { parameters: [...pageParameters, searchParameter, clientParameter, statusParameter(['abierta', 'en_proceso', 'resuelta'])] });
route('/incidents', 'post', 'Registrar incidencia mediante stored procedure', 'Incidencias', { schema: 'IncidentCreate', code: 201 });
route('/incidents/{id}', 'get', 'Consultar incidencia', 'Incidencias', { parameters: [idParameter] });
route('/incidents/{id}', 'patch', 'Actualizar estado con control de versión', 'Incidencias', { parameters: [idParameter], schema: 'IncidentUpdate', description: 'Transiciones: abierta a en_proceso o resuelta; en_proceso a resuelta. Resuelta no se reabre. Versión desactualizada: 409.' });
route('/retention-actions', 'get', 'Listar acciones de retención', 'Retención', { parameters: [...pageParameters, searchParameter, clientParameter, statusParameter(['pendiente', 'completada'])] });
route('/retention-actions', 'post', 'Asignar acción y fecha límite', 'Retención', { schema: 'ActionCreate', code: 201 });
route('/retention-actions/{id}', 'get', 'Consultar acción', 'Retención', { parameters: [idParameter] });
route('/retention-actions/{id}', 'patch', 'Completar acción con resultado', 'Retención', { parameters: [idParameter], schema: 'ActionUpdate', description: 'Repetir el mismo resultado es idempotente; cambiar uno ya confirmado devuelve 409.' });
route('/dashboard', 'get', 'Indicadores, prioridad, tendencia semanal, motivos, carga por servicio y retención', 'Riesgo');
route('/alerts', 'get', 'Clientes activos con puntaje desde 40', 'Riesgo', { parameters: [...pageParameters, searchParameter, levelParameter] });
route('/logs', 'get', 'Consultar auditoría BSON', 'Auditoría', { parameters: [...pageParameters, clientParameter, { name: 'kind', in: 'query', schema: { type: 'string', enum: ['business', 'http'] } }], description: 'Administrador o analista. Eventos de negocio (outbox) y logs HTTP.' });
route('/logs/summary', 'get', 'Resumen agregado de auditoría (MongoDB $facet)', 'Auditoría', { parameters: [{ name: 'days', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 90, default: 14 } }], description: 'Eventos por tipo, actividad de negocio por día y métricas HTTP (total, errores, latencia media).' });
route('/reports/clients.csv', 'get', 'Exportar clientes con riesgo a CSV', 'Reportes', { parameters: [levelParameter, statusParameter(['activo', 'inactivo'])], description: 'Administrador o analista. text/csv UTF-8 con BOM; protege contra inyección de fórmulas. Encabezado X-Total-Count.' });
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, required, properties });
const text = (min, max) => field('string', { minLength: min, maxLength: max });
const nullableId = { ...id, nullable: true };
const clientProperties = { name: text(2, 150), email: field('string', { format: 'email', maxLength: 254 }), phone: field('string', { nullable: true, pattern: '^[+0-9 ()-]{6,25}$' }), segmentId: id, status: field('string', { enum: ['activo', 'inactivo'], default: 'activo' }) };
const openapi = { openapi: '3.0.3', info: { title: 'FugaCliente API', version: '2.0.0', description: 'Evaluación parcial de backend. Arquitectura en capas (rutas → controladores → servicios → repositorios). SQL Server para transacciones y MongoDB para auditoría y comentarios. Fechas ISO 8601 en UTC. Todos los recursos de negocio requieren Bearer JWT.' },
  servers: [{ url: '/api/v1', description: 'API versionada (recomendada)' }, { url: '/api', description: 'Alias compatible con la versión 1' }], security: [{ bearerAuth: [] }], paths,
  components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } }, schemas: {
    Login: object({ email: field('string', { format: 'email' }), password: text(1, 72) }),
    UserCreate: object({ name: text(2, 100), email: field('string', { format: 'email' }), password: { ...text(12, 72), description: 'Máximo 72 bytes UTF-8 para evitar truncado de bcrypt.' }, role: field('string', { enum: ['admin', 'analista', 'agente'] }) }),
    ServiceCreate: object({ name: text(2, 100), slaHours: field('integer', { minimum: 1, maximum: 720 }) }),
    ServiceUpdate: { ...object({ name: text(2, 100), slaHours: field('integer', { minimum: 1, maximum: 720 }), active: field('boolean') }, []), minProperties: 1 },
    UserUpdate: { ...object({ name: text(2, 100), role: field('string', { enum: ['admin', 'analista', 'agente'] }), active: field('boolean') }, []), minProperties: 1 },
    ClientCreate: object(clientProperties, ['name', 'email', 'segmentId']), ClientUpdate: { ...object(clientProperties, []), minProperties: 1 },
    IncidentCreate: object({ clientId: id, serviceId: id, categoryId: id, description: text(10, 2000), severity: field('integer', { minimum: 1, maximum: 3 }), satisfaction: field('integer', { minimum: 1, maximum: 5, nullable: true }), assignedUserId: nullableId }, ['clientId', 'serviceId', 'categoryId', 'description', 'severity']),
    IncidentUpdate: object({ status: field('string', { enum: ['abierta', 'en_proceso', 'resuelta'] }), expectedVersion: id }),
    ActionCreate: object({ clientId: id, incidentId: nullableId, assignedUserId: id, type: field('string', { enum: ['contacto', 'compensacion', 'seguimiento'] }), description: text(10, 2000), dueAt: field('string', { format: 'date-time', description: 'Fecha futura con zona horaria.' }) }, ['clientId', 'assignedUserId', 'type', 'description', 'dueAt']),
    ActionUpdate: object({ outcome: field('string', { enum: ['contactado', 'recuperado', 'sin_respuesta'] }) }),
    CommentCreate: object({ text: text(2, 3000), channel: field('string', { enum: ['interno', 'telefono', 'correo', 'web'], default: 'interno' }) }, ['text']),
    Error: object({ error: object({ code: field('string'), message: field('string'), requestId: field('string'), details: { type: 'array', items: { type: 'object' } } }, ['code', 'message']) })
  } }
};
await writeFile(new URL('../docs/openapi.json', import.meta.url), JSON.stringify(openapi, null, 2) + '\n');

function item(name, method, path, body, script) {
  return { name, request: { method, ...(path === '/auth/login' || path === '/health' ? { auth: { type: 'noauth' } } : {}),
    header: body ? [{ key: 'Content-Type', value: 'application/json' }] : [], url: '{{baseUrl}}' + path,
    ...(body ? { body: { mode: 'raw', raw: JSON.stringify(body, null, 2), options: { raw: { language: 'json' } } } } : {}) },
    ...(script ? { event: [{ listen: 'test', script: { type: 'text/javascript', exec: script } }] } : {}) };
}
const testStatus = code => [`pm.test('HTTP ${code}', () => pm.response.to.have.status(${code}));`];
const save = (name, prop = 'id') => [`if (pm.response.code < 300) pm.collectionVariables.set('${name}', pm.response.json().data.${prop});`];
const collection = { info: { name: 'FugaCliente 2.0 · Evaluación Parcial', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json', description: 'Ejecuta en orden: login, catálogos, crear cliente, crear incidencia, actualizar estado y crear seguimiento. Configura email/password para tu .env. JWT e IDs se guardan automáticamente.' },
  variable: [{ key: 'baseUrl', value: 'http://localhost:3000/api/v1' }, { key: 'email', value: 'admin@fugacliente.local' }, { key: 'password', value: 'FugaCliente2026!' }, { key: 'token', value: '' }, { key: 'clientId', value: '' }, { key: 'incidentId', value: '' }, { key: 'actionId', value: '' }, { key: 'userId', value: '1' }, { key: 'segmentId', value: '1' }, { key: 'serviceId', value: '1' }, { key: 'categoryId', value: '1' }, { key: 'version', value: '1' }],
  auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}', type: 'string' }] },
  item: [
    item('01 · Salud de las bases', 'GET', '/health', null, testStatus(200)),
    item('02 · Login y guardar token', 'POST', '/auth/login', { email: '{{email}}', password: '{{password}}' }, [...testStatus(200), ...save('token', 'token'), "if (pm.response.code === 200) pm.collectionVariables.set('userId', pm.response.json().data.user.id);"]),
    item('03 · Catálogos y guardar IDs', 'GET', '/catalogs', null, [...testStatus(200), "const c = pm.response.json().data; if (c) { pm.collectionVariables.set('segmentId',c.segments[0].id); pm.collectionVariables.set('serviceId',c.services[0].id); pm.collectionVariables.set('categoryId',c.categories[0].id); }"]),
    item('04 · Perfil', 'GET', '/users/me', null, testStatus(200)),
    item('05 · Crear cliente', 'POST', '/clients', { name: 'Cliente Postman', email: 'cliente-{{$timestamp}}@example.com', phone: '+51 999 999 999', segmentId: '{{segmentId}}' }, [...testStatus(201), ...save('clientId')]),
    item('06 · Listar clientes', 'GET', '/clients?limit=20&page=1', null, testStatus(200)),
    item('07 · Riesgo del cliente', 'GET', '/clients/{{clientId}}/risk', null, testStatus(200)),
    item('08 · Registrar incidencia', 'POST', '/incidents', { clientId: '{{clientId}}', serviceId: '{{serviceId}}', categoryId: '{{categoryId}}', description: 'El cliente reporta mala atención y solicita una solución.', severity: 3, satisfaction: 1, assignedUserId: '{{userId}}' }, [...testStatus(201), ...save('incidentId'), ...save('version', 'version')]),
    item('09 · Listar incidencias', 'GET', '/incidents?clientId={{clientId}}', null, testStatus(200)),
    item('10 · Resolver incidencia', 'PATCH', '/incidents/{{incidentId}}', { status: 'resuelta', expectedVersion: 1 }, [...testStatus(200), ...save('version', 'version')]),
    item('11 · Registrar acción', 'POST', '/retention-actions', { clientId: '{{clientId}}', incidentId: '{{incidentId}}', assignedUserId: '{{userId}}', type: 'seguimiento', description: 'Llamar al cliente y confirmar que recibió la solución.', dueAt: '{{dueAt}}' }, [...testStatus(201), ...save('actionId')]),
    item('12 · Completar acción', 'PATCH', '/retention-actions/{{actionId}}', { outcome: 'recuperado' }, testStatus(200)),
    item('13 · Agregar comentario BSON', 'POST', '/clients/{{clientId}}/comments', { text: 'El cliente confirmó que recibió la solución.', channel: 'telefono' }, testStatus(201)),
    item('14 · Consultar comentarios', 'GET', '/clients/{{clientId}}/comments', null, testStatus(200)),
    item('15 · Indicadores', 'GET', '/dashboard', null, testStatus(200)),
    item('16 · Alertas', 'GET', '/alerts', null, testStatus(200)),
    item('17 · Auditoría del cliente', 'GET', '/logs?clientId={{clientId}}', null, testStatus(200)),
    item('18 · Validación inválida', 'POST', '/clients', { name: 'A', email: 'no-es-correo', segmentId: '{{segmentId}}' }, testStatus(400)),
    item('19 · Versión obsoleta', 'PATCH', '/incidents/{{incidentId}}', { status: 'en_proceso', expectedVersion: 1 }, testStatus(409)),
    item('20 · Archivar cliente', 'DELETE', '/clients/{{clientId}}', null, testStatus(204)),
    item('21 · Resumen de auditoría (agregación)', 'GET', '/logs/summary?days=30', null, testStatus(200)),
    item('22 · Exportar clientes CSV', 'GET', '/reports/clients.csv?status=activo', null, testStatus(200)),
    item('23 · Actualizar SLA del servicio', 'PATCH', '/services/{{serviceId}}', { slaHours: 24 }, testStatus(200))
  ]
};
collection.item[10].event.unshift({ listen: 'prerequest', script: { type: 'text/javascript', exec: ["pm.collectionVariables.set('dueAt', new Date(Date.now()+86400000).toISOString());"] } });
await writeFile(new URL('../docs/FugaCliente.postman_collection.json', import.meta.url), JSON.stringify(collection, null, 2) + '\n');
console.log('OpenAPI y colección de Postman generados.');
