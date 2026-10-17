// La demo no modifica bases de datos ni utiliza los secretos de un entorno real.
process.env.DB_MODE = 'demo'; process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = 'fugacliente-demo-local-secret-2026-only';
process.env.ADMIN_EMAIL = 'admin@fugacliente.local'; process.env.ADMIN_PASSWORD = 'FugaCliente2026!';
await import('../src/server.js');
