# Verificación de la entrega

Preparación: 15 de octubre de 2026 · versión 2.0.0 · Node.js 22 y versiones fijadas en `package-lock.json`.

## Pruebas realizadas

| Comprobación | Resultado | Alcance |
|---|---|---|
| `npm run check` | 74 archivos JavaScript, 0 errores de sintaxis | Servidor, scripts, interfaz y pruebas |
| `npm test` | 41 aprobadas, 0 fallidas | Riesgo, outbox, API, panel, agregaciones, CSV, usuarios, servicios, versionado y CSP |
| Recorrido en Chromium | Aprobado, 0 errores de consola | Login, panel, clientes, panel lateral, incidencias, retención, equipo, auditoría, formularios, búsqueda |
| Interfaz de escritorio | Revisada a 1440 px en modo claro y oscuro | Tablas, gráficos, modales y panel lateral |
| Interfaz móvil | Revisada a 390 × 844 | Menú lateral, tablas desplazables, formularios en una columna |
| Validación en formularios | Mensajes por campo en español | Validación del navegador y errores `details` del API |
| Escape de HTML | Comentarios con etiquetas se muestran como texto | Plantillas con escape automático |
| CSP | `script-src 'self'`, `style-src 'self'` sin errores | Sin recursos externos ni estilos en línea |
| OpenAPI | JSON válido, 34 operaciones | Referencia en `/api/docs` |
| Colección Postman | JSON válido | 23 peticiones con variables y pruebas |
| Integración real de bases | Pendiente; 1 prueba omitida sin habilitación | Requiere SQL Server y MongoDB operativos |

Las pruebas nuevas de la versión 2.0 comprueban: equivalencia de `/api/v1` y `/api`, salud con versión, reutilización segura de `X-Request-Id`, estructura del panel ampliado, alertas ordenadas, búsqueda sin tildes, indicador de acciones vencidas, resumen de auditoría y su control de acceso, CSV con filtros y protección contra fórmulas, reglas de gestión de usuarios, revocación inmediata al deshabilitar un usuario y edición validada de servicios.

## Lo que debe comprobarse con bases reales

El entorno de preparación no tuvo SQL Server ni MongoDB disponibles (sin acceso a registros de imágenes Docker). Por eso **no se afirma** que el script SQL, las vistas nuevas ni el pipeline `$facet` se hayan ejecutado contra servidores reales. El código se escribió siguiendo la sintaxis documentada y se incluye una prueba de integración para confirmarlo.

En el equipo de evaluación:

1. Configura `.env` e inicia las bases.
2. Ejecuta `npm run db:setup`, `npm run db:seed` y `npm run doctor` (verifica 5 procedimientos y 3 vistas).
3. Inicia el servidor y consulta `/api/health` en modo `sqlmongo`.
4. Registra una incidencia y confirma que está en `dbo.Incidents` y en `dbo.vw_IncidentDetail`.
5. Abre Auditoría: el resumen usa la agregación de MongoDB.
6. Reinicia el servidor y comprueba que los registros se conservan.

Para automatizar parte de la comprobación usa bases cuyo nombre termine en `_test` y habilita `RUN_DB_INTEGRATION=1` antes de `npm run test:integration`.

## Entrega

El ZIP contiene código fuente, script SQL, configuración de ejemplo, lockfile, informe y documentación. Excluye `node_modules`, `.env`, cachés y capturas de prueba.
