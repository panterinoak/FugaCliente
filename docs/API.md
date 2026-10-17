# API REST de FugaCliente

Base recomendada: `http://localhost:3000/api/v1` (versionada). `http://localhost:3000/api` se mantiene como alias compatible con la versión 1. La referencia navegable está en **http://localhost:3000/api/docs**. Todas las fechas se devuelven en ISO 8601; los ejemplos incluyen `Z` para UTC. Los cuerpos de escritura son JSON. Una creación retorna 201 y `Location`; una consulta o actualización retorna 200; el archivo lógico retorna 204 sin cuerpo.

## Sesión y respuestas

`POST /auth/login` es público. Cuerpo:

```json
{ "email": "admin@fugacliente.local", "password": "FugaCliente2026!" }
```

El token está en `data.token`. Para los siguientes recursos envía `Authorization: Bearer TOKEN`. El API devuelve los errores en una estructura uniforme:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Corrige los datos de entrada.",
    "requestId": "identificador-de-la-peticion",
    "details": [{ "field": "email", "message": "Invalid email" }]
  }
}
```

Los mensajes de campo de Zod pueden estar en inglés. No se devuelven consultas SQL, contraseñas ni stacks internos. Una respuesta 400 señala una entrada inválida; 401 una sesión ausente o inválida; 403 un rol sin autorización; 404 un recurso inexistente; 409 un duplicado, relación incorrecta o versión obsoleta; 413 un cuerpo demasiado grande; 429 demasiadas solicitudes; 500 un fallo interno; 503 una base no disponible en salud.

## Rutas

| Método | Ruta | Permiso | Resultado |
|---|---|---|---|
| GET | `/` | Público | Índice: versión, modo y enlaces a documentación |
| GET | `/health` | Público | Estado de SQL Server, MongoDB, outbox, versión y uptime |
| GET | `/docs` | Público | Redirige a la referencia interactiva `/docs.html` |
| GET | `/openapi.json` | Público | Especificación OpenAPI |
| POST | `/auth/login` | Público | JWT y perfil |
| GET | `/users/me` | Sesión | Perfil actual |
| GET | `/users` | Sesión | Equipo sin hashes |
| GET | `/users/:id` | Sesión | Usuario por ID |
| POST | `/users` | Admin | Nuevo usuario |
| PATCH | `/users/:id` | Admin | Nombre, rol o acceso (no a sí mismo; siempre queda un admin activo) |
| GET | `/catalogs` | Sesión | Roles, segmentos, servicios y categorías |
| GET | `/services` | Sesión | Servicios y SLA |
| POST | `/services` | Admin | Nuevo servicio |
| GET | `/services/:id` | Sesión | Servicio por ID |
| PATCH | `/services/:id` | Admin | SLA, nombre o estado |
| GET | `/clients` | Sesión | Clientes paginados con riesgo |
| POST | `/clients` | Sesión | Cliente creado |
| GET | `/clients/:id` | Sesión | Datos del cliente |
| PATCH | `/clients/:id` | Admin o analista | Datos actualizados |
| DELETE | `/clients/:id` | Admin | Cliente inactivo, historial conservado |
| GET | `/clients/:id/risk` | Sesión | Puntaje, causas y recomendación |
| GET | `/clients/:id/comments` | Sesión | Comentarios paginados |
| POST | `/clients/:id/comments` | Sesión | Comentario BSON creado |
| GET | `/incidents` | Sesión | Incidencias paginadas |
| POST | `/incidents` | Sesión | Incidencia transaccional creada |
| GET | `/incidents/:id` | Sesión | Incidencia por ID |
| PATCH | `/incidents/:id` | Sesión | Cambio de estado y versión |
| GET | `/retention-actions` | Sesión | Acciones paginadas |
| POST | `/retention-actions` | Sesión | Acción asignada |
| GET | `/retention-actions/:id` | Sesión | Acción por ID |
| PATCH | `/retention-actions/:id` | Sesión | Resultado confirmado |
| GET | `/dashboard` | Sesión | Indicadores, prioridades, tendencia semanal, motivos, carga por servicio, factores y retención |
| GET | `/alerts` | Sesión | Clientes activos con riesgo ≥ 40 |
| GET | `/logs` | Admin o analista | Auditoría paginada (`kind=business` o `kind=http`) |
| GET | `/logs/summary` | Admin o analista | Agregación MongoDB `$facet`: eventos por tipo y día, métricas HTTP |
| GET | `/reports/clients.csv` | Admin o analista | Exportación CSV del riesgo (filtros `level`, `status`) |

Los IDs válidos deben ser enteros positivos y existir en sus tablas. Se rechazan campos adicionales en los cuerpos. Consulta `/catalogs` para obtener IDs; no asumas números si utilizas una base modificada.

## Filtros y paginación

`page` empieza en 1 y `limit` vale 20 por defecto, con máximo 100. Ejemplo: `/clients?page=1&limit=20&search=lucia&level=alto&status=activo`.

| Recurso | Filtros útiles |
|---|---|
| Clientes | `search` por nombre/correo, `level=bajo/medio/alto`, `status=activo/inactivo` |
| Incidencias | `search` por cliente/descripción, `clientId`, `status=abierta/en_proceso/resuelta` |
| Acciones | `search` por cliente/descripción, `clientId`, `status=pendiente/completada` |
| Alertas | `search`, `level`; solo clientes activos con puntaje desde 40 |
| Logs | `clientId` para los eventos de un cliente; `kind=business` (outbox) o `kind=http` (peticiones) |
| Comentarios | `page`, `limit` en el historial del cliente |

Las respuestas paginadas contienen `data` y `pagination` con `page`, `limit`, `total` y `pages`. Una página sin resultados tiene `data: []`. Un ID de cliente no existente en el filtro de una lista produce una lista vacía; la consulta directa de ese cliente devuelve 404.

## Crear un cliente

`POST /clients`:

```json
{ "name": "Ana Mendoza", "email": "ana@example.com", "phone": "+51 999 999 999", "segmentId": 1, "status": "activo" }
```

Nombre de 2 a 150 caracteres. Correo válido y único, almacenado en minúsculas. Teléfono opcional y segmento obligatorio. `PATCH /clients/:id` admite cualquier subconjunto no vacío de esos campos. Para archivar desde la interfaz, edita su estado como inactivo; también existe DELETE para el administrador.

## Registrar una incidencia

`POST /incidents`:

```json
{
  "clientId": 1,
  "serviceId": 1,
  "categoryId": 1,
  "description": "El cliente no recibió respuesta dentro del plazo esperado.",
  "severity": 3,
  "satisfaction": 1,
  "assignedUserId": 1
}
```

Gravedad: 1 leve, 2 moderada, 3 grave. Satisfacción: 1 a 5, o `null` cuando no existe una calificación. Descripción de 10 a 2000 caracteres. Responsable opcional. El servidor incorpora autor y fecha, y el procedimiento almacenado valida relaciones antes de confirmar incidencia y evento. Un cliente inactivo devuelve 409.

`PATCH /incidents/:id`:

```json
{ "status": "resuelta", "expectedVersion": 1 }
```

Envía la versión actual obtenida al consultar la incidencia. Cada cambio de estado incrementa `version`. Si otra petición ya modificó el registro, se devuelve 409 y debes volver a consultarlo. Los cambios válidos son `abierta → en_proceso`, `abierta → resuelta` y `en_proceso → resuelta`. No se permite retroceder o reabrir un caso resuelto. Enviar el mismo estado con la versión vigente no genera un nuevo cambio.

## Crear y completar retención

`POST /retention-actions`:

```json
{
  "clientId": 1,
  "incidentId": null,
  "assignedUserId": 1,
  "type": "contacto",
  "description": "Llamar al cliente y coordinar la solución del reclamo.",
  "dueAt": "2027-01-15T15:00:00Z"
}
```

La fecha debe ser futura respecto del momento en que se crea la acción. Tipos: `contacto`, `compensacion`, `seguimiento`. Una incidencia opcional debe pertenecer al mismo cliente. La interfaz crea acciones asociadas al cliente; la vinculación a una incidencia específica está disponible en el API.

`PATCH /retention-actions/:id` recibe:

```json
{ "outcome": "recuperado" }
```

Resultados: `contactado`, `recuperado`, `sin_respuesta`. La acción cambia de pendiente a completada y registra una fecha. Repetir el mismo resultado es idempotente; intentar cambiar un resultado confirmado devuelve 409. Marcar “recuperado” no borra reclamos ni resta puntos de riesgo por sí mismo.

## Comentarios, usuarios y servicios

`POST /clients/:id/comments`:

```json
{ "text": "El cliente confirmó que recibió una solución.", "channel": "telefono" }
```

Texto de 2 a 3000 caracteres. Canales: `interno`, `telefono`, `correo`, `web`. Se agregan autor y fecha en el servidor. MongoDB almacena el documento en BSON. La existencia del cliente se comprueba en SQL antes de guardar.

`POST /users`:

```json
{ "name": "Agente de atención", "email": "agente@example.com", "password": "UnaClaveSegura2026!", "role": "agente" }
```

Roles: `admin`, `analista`, `agente`. Contraseña de al menos 12 caracteres y no más de 72 bytes UTF-8. Solo el administrador crea usuarios. El API nunca devuelve el hash.

`POST /services`:

```json
{ "name": "Atención de garantías", "slaHours": 24 }
```

Nombre único de 2 a 100 caracteres; SLA entero entre 1 y 720 horas. Solo administrador.

## Auditoría y consistencia

Eventos: `user.created`, `client.created`, `client.updated`, `service.created`, `incident.created`, `incident.status_changed`, `retention.created`, `retention.completed`, `comment.created` y `http.request`.

Un evento tiene `eventId`, `eventType`, `entity`, `entityId`, `actorId`, `occurredAt` y `payload`. El payload permite distintas propiedades según el tipo. Para incidencias y acciones, `entity=client` permite consultar todo el historial de negocio de un cliente. Los logs HTTP identifican el recurso `http` y no se asocian a un cliente mediante su cuerpo.

Los eventos SQL pueden tardar el intervalo de `OUTBOX_INTERVAL_MS` en aparecer en MongoDB. El índice único evita duplicados al reintentar. MongoDB elimina logs que superan `LOG_RETENTION_DAYS` mediante un índice TTL; la eliminación es periódica y no exacta al segundo. Los comentarios no se eliminan por TTL.

El conjunto de recursos y sus verbos implementa el nivel 2 de Richardson. No incorpora enlaces HATEOAS del nivel 3. OpenAPI y Postman proporcionan el contrato y los ejemplos de consumo.

## Novedades de la versión 2.0

### Panel ampliado

`GET /dashboard` conserva los campos anteriores (`totalClients`, `distribution`, `atRisk`, `openIncidents`, `pendingActions`, `overdueActions`, `priorityClients`) y agrega:

| Campo | Contenido |
|---|---|
| `slaBreached` | Incidencias pendientes que superaron el SLA de su servicio |
| `averageSatisfaction` | Promedio de satisfacción de los casos calificados en 30 días (`null` si no hay) |
| `factorTotals` | Puntos aportados por cada factor entre los clientes en riesgo |
| `trend` | 8 ventanas semanales con `opened` y `resolved` |
| `byCategory` | Motivos de reclamo de los últimos 30 días |
| `byService` | Incidencias abiertas y vencidas por servicio |
| `retention` | Acciones completadas, recuperados, contactados, sin respuesta y `recoveryRate` (%) |

### Resumen de auditoría

`GET /logs/summary?days=30` ejecuta en MongoDB un pipeline `$match` + `$facet` con tres ramas (`$group` por tipo, `$group` por día con `$dateToString` y métricas HTTP con `$avg` y `$cond`):

```json
{ "data": { "days": 30,
  "byType": [{ "eventType": "incident.created", "count": 30 }],
  "byDay": [{ "date": "2026-10-15", "count": 12 }],
  "http": { "total": 240, "errors": 3, "avgDurationMs": 6 } } }
```

### Exportación CSV

`GET /reports/clients.csv?level=alto&status=activo` devuelve `text/csv; charset=utf-8` con BOM (Excel muestra tildes), encabezado `Content-Disposition` y `X-Total-Count`. Incluye puntaje, nivel, los cinco factores y la recomendación. Las celdas que empiezan con `= + - @` se prefijan para evitar inyección de fórmulas.

### Gestión de usuarios y servicios

```json
PATCH /api/v1/users/3        { "role": "analista" }
PATCH /api/v1/users/3        { "active": false }
PATCH /api/v1/services/1     { "slaHours": 12, "active": true }
```

Un usuario desactivado pierde el acceso en su siguiente petición aunque su JWT no haya expirado, porque el middleware de autenticación vuelve a consultar al usuario en SQL Server.

### Correlación de peticiones

Cada respuesta incluye `X-Request-Id`. Si el cliente envía un `X-Request-Id` válido (8 a 64 caracteres alfanuméricos o guiones), se reutiliza; así un error mostrado en la interfaz puede rastrearse en los logs de MongoDB (`payload.requestId`).
