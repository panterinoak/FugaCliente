# Historial de cambios

## 2.0.0 — Octubre de 2026

### Arquitectura
- Arquitectura en capas: rutas → controladores → servicios → repositorios, con raíz de composición (`src/container.js`).
- Constantes de dominio centralizadas y esquemas Zod separados en `src/validators/`.
- API versionada en `/api/v1` (se conserva `/api` como alias).
- Middleware de seguridad dedicado con CSP estricta; `X-Request-Id` reutilizable para correlación.
- Código reformateado y documentado; utilidades de paginación, respuestas HTTP y CSV.

### Nuevas funciones del API
- `PATCH /users/:id`: rol, nombre y acceso con protecciones (no autodegradarse; siempre un admin activo).
- `GET|PATCH /services/:id`: consulta y edición de SLA y estado.
- `GET /logs?kind=business|http` y `GET /logs/summary` (agregación MongoDB `$facet`).
- `GET /reports/clients.csv`: exportación del riesgo protegida contra inyección de fórmulas.
- Panel ampliado: tendencia semanal, motivos, carga por servicio, factores del riesgo, satisfacción media, SLA vencidos y resultados de retención.
- Acciones de retención con indicador `overdue`; búsqueda insensible a tildes.

### Persistencia
- SQL Server: vistas `vw_IncidentDetail`, `vw_RetentionActionDetail`, `vw_ClientIncidentSummary` e índice `IX_Incidents_Status`.
- MongoDB: validador ampliado, índice por tipo de evento e índices con nombre.
- `doctor` verifica procedimientos y vistas.

### Interfaz
- Rediseño completo: nuevo logotipo (medidor de riesgo), sistema visual con modo claro/oscuro, fuente Inter local.
- Barra de factores explicables en tablas y detalle; panel lateral de cliente con pestañas.
- Gráficos SVG propios, búsqueda global con teclado, formularios con errores por campo en español.
- Enrutamiento por hash, menú móvil, accesibilidad (foco visible, roles ARIA, movimiento reducido).
- Referencia del API en `/api/docs` generada desde OpenAPI.

### Calidad y entrega
- 41 pruebas (14 nuevas), Dockerfile, perfil `app` en Compose, CI con GitHub Actions, `.editorconfig`.
- Datos de demostración más realistas (14 clientes, 30 incidencias en 8 semanas, 3 usuarios).

## 1.0.0 — Octubre de 2026
- Primera versión: API REST con Express, SQL Server, MongoDB, outbox y riesgo explicable.
