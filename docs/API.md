# API REST de FugaCliente

Base: `http://localhost:3000/api`. Todas las fechas se devuelven en ISO 8601; los ejemplos incluyen `Z` para UTC. Los cuerpos de escritura son JSON. Una creación retorna 201 y `Location`; una consulta o actualización retorna 200; el archivo lógico retorna 204 sin cuerpo.

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
| GET | `/health` | Público | Estado y modo de las bases |
| GET | `/openapi.json` | Público | Especificación OpenAPI |
| POST | `/auth/login` | Público | JWT y perfil |
| GET | `/users/me` | Sesión | Perfil actual |
| GET | `/users` | Sesión | Equipo sin hashes |
| GET | `/users/:id` | Sesión | Usuario por ID |
| POST | `/users` | Admin | Nuevo usuario |
| GET | `/catalogs` | Sesión | Roles, segmentos, servicios y categorías |
| GET | `/services` | Sesión | Servicios y SLA |
| POST | `/services` | Admin | Nuevo servicio |
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
| GET | `/dashboard` | Sesión | Indicadores y prioridades |
| GET | `/alerts` | Sesión | Clientes activos con riesgo ≥ 40 |
| GET | `/logs` | Admin o analista | Auditoría paginada |

Los IDs válidos deben ser enteros positivos y existir en sus tablas. Se rechazan campos adicionales en los cuerpos. Consulta `/catalogs` para obtener IDs; no asumas números si utilizas una base modificada.

## Filtros y paginación

`page` empieza en 1 y `limit` vale 20 por defecto, con máximo 100. Ejemplo: `/clients?page=1&limit=20&search=lucia&level=alto&status=activo`.

| Recurso | Filtros útiles |
|---|---|
| Clientes | `search` por nombre/correo, `level=bajo/medio/alto`, `status=activo/inactivo` |
| Incidencias | `search` por cliente/descripción, `clientId`, `status=abierta/en_proceso/resuelta` |
| Acciones | `search` por cliente/descripción, `clientId`, `status=pendiente/completada` |
| Alertas | `search`, `level`; solo clientes activos con puntaje desde 40 |
| Logs | `clientId` para los eventos de negocio de un cliente |
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
