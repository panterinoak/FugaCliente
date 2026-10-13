# Sustentación de FugaCliente

## Preparación antes de exponer

Ejecuta el modo completo de `README.md`. Comprueba que `/api/health` devuelve `mode: sqlmongo`, `sql: ok` y `mongo: ok`. Importa la colección de Postman y ten abiertas la interfaz, la terminal, `database/schema.sql` y tu cliente de SQL/MongoDB. Si utilizas la demo, debes decir que usa memoria y que no acredita persistencia.

No es necesario memorizar todo el código. Lo principal es poder seguir una petición desde la interfaz hasta su base de datos y explicar por qué la información se divide entre SQL Server y MongoDB.

## Presentación del problema y la solución

“Nuestro proyecto se llama FugaCliente. Busca ayudar a una empresa a identificar clientes que podrían alejarse por experiencias de mala atención. Cuando un reclamo se queda sin seguimiento, el equipo puede perder la oportunidad de resolverlo. Por eso el sistema reúne incidencias, calcula un puntaje con reglas visibles y permite asignar una acción de retención con responsable y fecha.

Adaptamos el caso del PDF a este tema: administramos servicios en lugar de salas y registramos incidencias como operación transaccional principal. Mantenemos Express, SQL Server, MongoDB, routers, middlewares, un procedimiento almacenado y un API REST con verbos y códigos de estado.”

## Recorrido de demostración de 7 a 10 minutos

### 1 Ingreso y arquitectura

Abre el login y entra. Muestra `src/server.js` y `src/app.js`.

“El servidor verifica las variables de entorno, abre las conexiones y arranca Express. La aplicación monta un router por recurso. La interfaz y Postman utilizan el mismo API; la interfaz no accede directamente a las bases.”

En `src/routes/` señala los archivos de clientes, usuarios, servicios, incidencias y retención. Explica que separar rutas permite localizar el código y mantener responsabilidades claras.

### 2 Validación y errores

En Postman ejecuta la petición de validación inválida. Debe devolver 400. Abre `src/middlewares/validation.js` y `src/utils/errors.js`.

“Validamos nombres, correos, fechas, IDs y valores permitidos antes de ejecutar la operación. Una entrada inválida recibe 400 y un mensaje con los campos que debe corregir. El manejador global convierte los errores del sistema en JSON y no expone consultas ni contraseñas. Un duplicado se responde con 409 y un recurso inexistente con 404.”

### 3 Persistencia SQL y procedimiento

En la interfaz crea un cliente o utiliza uno de los datos ficticios. Registra una incidencia grave con satisfacción 1. Muestra `dbo.sp_RegisterIncident` en `database/schema.sql` y el método `createIncident` de `src/repositories/sql.js`.

“El router valida el cuerpo y el repositorio ejecuta un procedimiento almacenado con parámetros. El procedimiento comprueba que el cliente esté activo, que existan el servicio, la categoría y el usuario, y comienza una transacción. Inserta la incidencia y el evento en el outbox. Si falla una comprobación se revierte la operación; si todo es válido se confirma y el API responde 201.”

Para mostrar el registro en SQL Server:

```sql
USE FugaCliente;
SELECT TOP (10) * FROM dbo.Clients ORDER BY ClientId DESC;
SELECT TOP (10) * FROM dbo.Incidents ORDER BY IncidentId DESC;
SELECT TOP (10) * FROM dbo.AuditOutbox ORDER BY OccurredAt DESC;
```

Explica las PK, FK, restricciones de correo único y CHECK de gravedad. Roles, segmentos, categorías y servicios se separan para evitar repetir sus nombres. La relación opcional entre retención e incidencia se guarda aparte en `RetentionActionIncidents`; los triggers impiden vincular clientes distintos.

### 4 Riesgo explicable

Abre el detalle del cliente. Muestra `src/services/risk.js`.

“El puntaje suma señales concretas y tiene un máximo de 100. Considera la calificación más reciente, las incidencias pendientes, los reclamos repetidos, la gravedad y el SLA vencido. La ventana de historial es de 30 días, pero un pendiente antiguo todavía requiere atención. Bajo es menos de 40, medio va de 40 a 69 y alto empieza en 70. Es un índice de prioridad propuesto; no representa una probabilidad estadística ni una IA entrenada.”

Con una primera incidencia nueva grave y satisfacción 1, muestra **50 puntos**: 25 por satisfacción, 10 por pendiente y 15 por gravedad. Al resolverla, muestra **40 puntos**: desaparecen los 10 por pendiente, pero se conserva el historial reciente. Si utilizas un cliente que ya tenía incidencias, explica los factores reales que aparecen; no prometas que siempre tendrá el mismo valor.

### 5 Concurrencia y retención

Actualiza una incidencia y luego ejecuta la petición de Postman “Versión obsoleta”. Debe devolver 409. Muestra `dbo.sp_UpdateIncidentStatus`.

“Cada cambio incrementa la versión. Si dos personas intentan actualizar el mismo caso y una tiene una versión antigua, el segundo cambio se rechaza para evitar que sobrescriba al primero.”

Crea una acción de seguimiento y complétala como contactado o recuperado. Explica que el resultado de atención se conserva, pero que no borra reclamos ni reduce el riesgo sin evidencia nueva.

### 6 MongoDB y auditoría

Agrega una nota y consulta Actividad. Abre `src/repositories/mongo.js` y `src/services/outbox.js`.

“En MongoDB guardamos comentarios y logs en BSON. Los eventos comparten identificador, tipo, recurso, fecha y autor, pero el payload cambia según la operación. Los índices ayudan a consultar el historial de un cliente. El identificador único evita duplicados y el TTL elimina logs antiguos, sin borrar los comentarios.”

Ejemplos para `mongosh`:

```javascript
use fugacliente
db.comments.find().sort({createdAt: -1}).limit(5)
db.events.find({eventType: "incident.created"}).sort({occurredAt: -1}).limit(5)
db.events.getIndexes()
```

“Como SQL y MongoDB no comparten una transacción, usamos un outbox. La incidencia y su evento se confirman juntos en SQL. Después un worker envía el evento a MongoDB. Si esa base falla, el evento queda pendiente para reintentarlo. La auditoría puede tardar unos segundos en aparecer.”

### 7 Cierre y entrega

Muestra README, `.env.example`, la colección de Postman y `npm test`.

“La entrega incluye la configuración de ejemplo, el script SQL, documentación y pruebas. Los recursos del API utilizan GET para consultar, POST para crear, PATCH para cambios parciales y DELETE para archivar un cliente. Con esa semántica y códigos de estado implementamos el nivel 2 de Richardson.”

## Preguntas de reflexión del PDF

### Cuál fue el mayor reto al integrar ambas bases

“El principal reto de diseño es mantener la consistencia cuando una operación SQL se confirma y MongoDB todavía no está disponible. Una transacción local no cubre ambas bases. El outbox guarda un evento pendiente dentro de SQL y permite reintentar el envío sin duplicarlo. También distinguimos los datos transaccionales de los documentos de auditoría.”

### Cómo ayudan los middlewares

“Evitan repetir la autenticación, los permisos, la validación y el logging en cada endpoint. El router se concentra en la operación de su recurso. Si debemos ajustar una regla de validación o la respuesta de error, lo hacemos en un lugar común.”

### Qué parte del flujo HTTP resulta más clara

“Una petición llega a Express, recibe un identificador, se procesa como JSON y pasa por autenticación y validación. El router llama al servicio o repositorio, SQL o MongoDB realiza la operación y el servidor responde con un estado HTTP y JSON. Si ocurre un error, llega al manejador global. Al terminar, el middleware registra el resultado de la petición.”

Estas respuestas son una guía conceptual. Adáptalas a lo que realmente ejecutes y comprendas durante tu preparación.

## Preguntas técnicas que pueden hacerte

| Pregunta | Respuesta que debes explicar |
|---|---|
| Por qué no guardar todo en MongoDB | SQL necesita relaciones e integridad para los recursos; MongoDB permite eventos con payloads distintos y comentarios documentales |
| Por qué no guardar todo en SQL | Se cumple la arquitectura híbrida del curso y se separa la información transaccional de la documental |
| Qué garantiza una FK | Que la referencia apunta a un registro existente y no se inserta una relación inexistente |
| Qué pasa si MongoDB cae | Los eventos de negocio permanecen en el outbox; comentarios nuevos fallan y logs HTTP son de mejor esfuerzo |
| Qué hace bcrypt | Almacena un hash de la contraseña para comprobarla sin guardar texto plano |
| Qué permite el JWT | Identificar una sesión firmada y limitada en el tiempo; el rol se vuelve a comprobar en SQL |
| Qué garantiza el puntaje | Una aplicación consistente de reglas; no garantiza que el cliente abandone o se quede |
| Qué es el SLA | El plazo máximo de atención establecido para cada servicio |
| Por qué archivar y no borrar | Se conserva la trazabilidad del cliente, sus incidencias y sus comentarios |
| Qué prueba la demo | Comportamiento de interfaz y API con memoria; no la persistencia SQL/NoSQL |
| Qué faltaría para producción | Validar los pesos, medir rendimiento, configurar infraestructura segura y agregar permisos por cartera |

## Evidencias para preparar en tu computadora

Captura la respuesta de salud en modo completo, el registro SQL de una incidencia, un documento MongoDB y el resultado de una petición válida e inválida. Ejecuta la prueba real en bases `_test` si cuentas con ellas. Esas evidencias deben corresponder a tu ejecución, no a una conexión supuesta.
