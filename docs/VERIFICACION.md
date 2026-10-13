# Verificación de la entrega

Preparación: 13 de octubre de 2026. Se utilizó Node.js 24 y las versiones fijadas en `package-lock.json`.

## Pruebas realizadas

| Comprobación | Resultado | Alcance |
|---|---|---|
| `npm run check` | 31 archivos JavaScript, 0 errores de sintaxis | Código de servidor, scripts, interfaz y pruebas |
| `npm test` | 27 aprobadas, 0 fallidas | Riesgo y API con repositorios temporales |
| Recorrido en Chromium | Aprobado | Login, cliente, incidencia, riesgo, nota, resolución, retención, catálogos y actividad |
| Puntaje en interfaz | 50 al registrar, 40 al resolver | Primera incidencia grave con satisfacción 1 |
| Texto de comentario con etiquetas HTML | Se muestra como texto sin ejecutarse | Escape de contenido en la interfaz |
| Interfaz de escritorio | Revisada a 1440 × 1000 | Panel, tablas y controles visibles |
| Interfaz móvil | Revisada a 390 × 844 | Sin desbordamiento horizontal de la página |
| OpenAPI | JSON válido y referencias internas resueltas | 28 operaciones documentadas |
| Colección Postman | JSON válido | 20 peticiones ordenadas con variables y pruebas |
| Informe Word | 9 páginas renderizadas e inspeccionadas | Tablas, diagrama, títulos y numeración |
| Integración real de bases | Pendiente; 1 prueba omitida sin habilitación | Requiere SQL Server y MongoDB operativos |

Las pruebas incluyen rechazo de sesiones inválidas, permisos de agentes, entradas incorrectas, contraseñas que exceden el límite de bcrypt, correos duplicados, relaciones inexistentes, versiones obsoletas, vínculo de incidencias de otro cliente, resultados de retención que no se sobrescriben, archivo lógico y paginación.

Las pruebas de riesgo cubren el cliente sin historial, el máximo de 100, la calificación más reciente, el límite de 30 días, pendientes antiguos, el efecto de resolver, el límite exacto del SLA, fechas futuras y umbrales de clasificación. Las pruebas de outbox simulan fallos antes y después de escribir el evento y comprueban su recuperación sin duplicados.

## Lo que todavía debe comprobarse con bases reales

El entorno usado para preparar esta entrega no tuvo servidores SQL Server y MongoDB operativos. Por eso no se afirma que el script se haya ejecutado contra SQL Server ni que se haya probado una conexión real a MongoDB. El código de ambos repositorios, el SQL y las configuraciones se incluyen para ejecutar esa comprobación.

En el equipo de evaluación:

1. Configura `.env` e inicia las bases.
2. Ejecuta `npm run db:setup`, `npm run db:seed` y `npm run doctor`.
3. Inicia el servidor y consulta `/api/health` en modo `sqlmongo`.
4. Registra una incidencia y confirma que está en `dbo.Incidents`.
5. Espera el worker y consulta su evento en MongoDB.
6. Reinicia el servidor y comprueba que los registros se conservan.

Para automatizar parte de esa comprobación, utiliza bases aisladas cuyos nombres terminen en `_test`, prepara su esquema y habilita `RUN_DB_INTEGRATION=1` antes de ejecutar `npm run test:integration`. La prueba valida una incidencia real, un rechazo sin inserción, el cambio de versión, el outbox idempotente y un comentario MongoDB. No borra bases ni registros ajenos.

## Entrega

El ZIP contiene el código fuente, el script SQL, la configuración de ejemplo, el lockfile, el informe y la documentación. Excluye `node_modules`, `.env`, cachés, binarios de prueba y capturas del navegador.
