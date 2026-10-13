/* FugaCliente - SQL Server 2022 o superior. Script idempotente y no destructivo.
   GO es separador de lotes para SSMS/sqlcmd y scripts/setup-db.js. */
IF DB_ID(N'FugaCliente') IS NULL CREATE DATABASE [FugaCliente];
GO
USE [FugaCliente];
GO
IF OBJECT_ID('dbo.Roles', 'U') IS NULL
CREATE TABLE dbo.Roles (
  RoleId INT IDENTITY PRIMARY KEY,
  Code VARCHAR(20) NOT NULL UNIQUE,
  Name NVARCHAR(80) NOT NULL
);
IF OBJECT_ID('dbo.Users', 'U') IS NULL
CREATE TABLE dbo.Users (
  UserId INT IDENTITY PRIMARY KEY,
  Name NVARCHAR(100) NOT NULL,
  Email NVARCHAR(254) COLLATE Latin1_General_100_CI_AS NOT NULL UNIQUE,
  PasswordHash VARCHAR(100) NOT NULL,
  RoleId INT NOT NULL REFERENCES dbo.Roles(RoleId),
  Active BIT NOT NULL DEFAULT 1,
  CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID('dbo.ClientSegments', 'U') IS NULL
CREATE TABLE dbo.ClientSegments (
  SegmentId INT IDENTITY PRIMARY KEY,
  Name NVARCHAR(80) NOT NULL UNIQUE
);
IF OBJECT_ID('dbo.Clients', 'U') IS NULL
CREATE TABLE dbo.Clients (
  ClientId INT IDENTITY PRIMARY KEY,
  Name NVARCHAR(150) NOT NULL,
  Email NVARCHAR(254) COLLATE Latin1_General_100_CI_AS NOT NULL UNIQUE,
  Phone VARCHAR(25) NULL,
  SegmentId INT NOT NULL REFERENCES dbo.ClientSegments(SegmentId),
  Status VARCHAR(10) NOT NULL DEFAULT 'activo' CHECK (Status IN ('activo','inactivo')),
  CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID('dbo.Services', 'U') IS NULL
CREATE TABLE dbo.Services (
  ServiceId INT IDENTITY PRIMARY KEY,
  Name NVARCHAR(100) COLLATE Latin1_General_100_CI_AS NOT NULL UNIQUE,
  SlaHours INT NOT NULL CHECK (SlaHours BETWEEN 1 AND 720),
  Active BIT NOT NULL DEFAULT 1
);
IF OBJECT_ID('dbo.IncidentCategories', 'U') IS NULL
CREATE TABLE dbo.IncidentCategories (
  CategoryId INT IDENTITY PRIMARY KEY,
  Name NVARCHAR(80) NOT NULL UNIQUE
);
IF OBJECT_ID('dbo.Incidents', 'U') IS NULL
CREATE TABLE dbo.Incidents (
  IncidentId INT IDENTITY PRIMARY KEY,
  ClientId INT NOT NULL REFERENCES dbo.Clients(ClientId),
  ServiceId INT NOT NULL REFERENCES dbo.Services(ServiceId),
  CategoryId INT NOT NULL REFERENCES dbo.IncidentCategories(CategoryId),
  AssignedUserId INT NULL REFERENCES dbo.Users(UserId),
  CreatedById INT NOT NULL REFERENCES dbo.Users(UserId),
  Description NVARCHAR(2000) NOT NULL,
  Severity TINYINT NOT NULL CHECK (Severity BETWEEN 1 AND 3),
  Satisfaction TINYINT NULL CHECK (Satisfaction BETWEEN 1 AND 5),
  Status VARCHAR(15) NOT NULL DEFAULT 'abierta' CHECK (Status IN ('abierta','en_proceso','resuelta')),
  CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  ResolvedAt DATETIME2 NULL,
  Version INT NOT NULL DEFAULT 1 CHECK (Version > 0),
  CONSTRAINT UQ_Incidents_Client UNIQUE (IncidentId, ClientId),
  CONSTRAINT CK_Incidents_Resolved CHECK ((Status = 'resuelta' AND ResolvedAt IS NOT NULL) OR (Status <> 'resuelta' AND ResolvedAt IS NULL))
);
IF OBJECT_ID('dbo.RetentionActions', 'U') IS NULL
CREATE TABLE dbo.RetentionActions (
  ActionId INT IDENTITY PRIMARY KEY,
  ClientId INT NOT NULL REFERENCES dbo.Clients(ClientId),
  AssignedUserId INT NOT NULL REFERENCES dbo.Users(UserId),
  CreatedById INT NOT NULL REFERENCES dbo.Users(UserId),
  Type VARCHAR(20) NOT NULL CHECK (Type IN ('contacto','compensacion','seguimiento')),
  Description NVARCHAR(2000) NOT NULL,
  DueAt DATETIME2 NOT NULL,
  Status VARCHAR(15) NOT NULL DEFAULT 'pendiente' CHECK (Status IN ('pendiente','completada')),
  Outcome VARCHAR(20) NULL CHECK (Outcome IN ('contactado','recuperado','sin_respuesta')),
  CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CompletedAt DATETIME2 NULL,
  CONSTRAINT CK_Actions_Completion CHECK (
    (Status = 'pendiente' AND Outcome IS NULL AND CompletedAt IS NULL) OR
    (Status = 'completada' AND Outcome IS NOT NULL AND CompletedAt IS NOT NULL)
  )
);
/* Relación opcional separada: evita repetir en la acción una dependencia
   IncidentId -> ClientId y conserva la tercera forma normal. */
IF OBJECT_ID('dbo.RetentionActionIncidents', 'U') IS NULL
CREATE TABLE dbo.RetentionActionIncidents (
  ActionId INT PRIMARY KEY REFERENCES dbo.RetentionActions(ActionId),
  IncidentId INT NOT NULL REFERENCES dbo.Incidents(IncidentId)
);
/* Outbox técnico: confirma el cambio de negocio y su evento en la misma transacción. */
IF OBJECT_ID('dbo.AuditOutbox', 'U') IS NULL
CREATE TABLE dbo.AuditOutbox (
  EventId UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  EventType VARCHAR(80) NOT NULL,
  Entity VARCHAR(30) NOT NULL,
  EntityId INT NULL,
  ActorId INT NULL REFERENCES dbo.Users(UserId),
  OccurredAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  Payload NVARCHAR(MAX) NOT NULL CHECK (ISJSON(Payload) = 1),
  ProcessedAt DATETIME2 NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Incidents_Client_Date' AND object_id = OBJECT_ID('dbo.Incidents'))
CREATE INDEX IX_Incidents_Client_Date ON dbo.Incidents(ClientId, CreatedAt DESC) INCLUDE (Status, Severity, Satisfaction, ServiceId);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Actions_Status_Due' AND object_id = OBJECT_ID('dbo.RetentionActions'))
CREATE INDEX IX_Actions_Status_Due ON dbo.RetentionActions(Status, DueAt) INCLUDE (ClientId, AssignedUserId);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Outbox_Pending' AND object_id = OBJECT_ID('dbo.AuditOutbox'))
CREATE INDEX IX_Outbox_Pending ON dbo.AuditOutbox(OccurredAt) WHERE ProcessedAt IS NULL;
GO
IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE Code = 'admin') INSERT dbo.Roles(Code, Name) VALUES ('admin', N'Administrador');
IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE Code = 'analista') INSERT dbo.Roles(Code, Name) VALUES ('analista', N'Analista');
IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE Code = 'agente') INSERT dbo.Roles(Code, Name) VALUES ('agente', N'Agente de atención');
IF NOT EXISTS (SELECT 1 FROM dbo.ClientSegments WHERE Name = N'Persona') INSERT dbo.ClientSegments(Name) VALUES (N'Persona');
IF NOT EXISTS (SELECT 1 FROM dbo.ClientSegments WHERE Name = N'Pequeña empresa') INSERT dbo.ClientSegments(Name) VALUES (N'Pequeña empresa');
IF NOT EXISTS (SELECT 1 FROM dbo.ClientSegments WHERE Name = N'Empresa') INSERT dbo.ClientSegments(Name) VALUES (N'Empresa');
IF NOT EXISTS (SELECT 1 FROM dbo.Services WHERE Name = N'Soporte técnico') INSERT dbo.Services(Name, SlaHours) VALUES (N'Soporte técnico', 24);
IF NOT EXISTS (SELECT 1 FROM dbo.Services WHERE Name = N'Entrega de pedidos') INSERT dbo.Services(Name, SlaHours) VALUES (N'Entrega de pedidos', 48);
IF NOT EXISTS (SELECT 1 FROM dbo.Services WHERE Name = N'Atención comercial') INSERT dbo.Services(Name, SlaHours) VALUES (N'Atención comercial', 12);
IF NOT EXISTS (SELECT 1 FROM dbo.IncidentCategories WHERE Name = N'Demora de atención') INSERT dbo.IncidentCategories(Name) VALUES (N'Demora de atención');
IF NOT EXISTS (SELECT 1 FROM dbo.IncidentCategories WHERE Name = N'Trato inadecuado') INSERT dbo.IncidentCategories(Name) VALUES (N'Trato inadecuado');
IF NOT EXISTS (SELECT 1 FROM dbo.IncidentCategories WHERE Name = N'Servicio defectuoso') INSERT dbo.IncidentCategories(Name) VALUES (N'Servicio defectuoso');
IF NOT EXISTS (SELECT 1 FROM dbo.IncidentCategories WHERE Name = N'Error de facturación') INSERT dbo.IncidentCategories(Name) VALUES (N'Error de facturación');
GO
CREATE OR ALTER PROCEDURE dbo.sp_QueueEvent
  @EventType VARCHAR(80), @Entity VARCHAR(30), @EntityId INT, @ActorId INT, @Payload NVARCHAR(MAX)
AS
BEGIN
  SET NOCOUNT ON;
  INSERT dbo.AuditOutbox(EventType, Entity, EntityId, ActorId, Payload) VALUES (@EventType, @Entity, @EntityId, @ActorId, @Payload);
END;
GO
CREATE OR ALTER TRIGGER dbo.tr_ActionIncident_Client
ON dbo.RetentionActionIncidents AFTER INSERT, UPDATE
AS
BEGIN
  SET NOCOUNT ON;
  IF EXISTS (SELECT 1 FROM inserted l JOIN dbo.RetentionActions a ON a.ActionId = l.ActionId
    JOIN dbo.Incidents i ON i.IncidentId = l.IncidentId WHERE a.ClientId <> i.ClientId)
    THROW 50002, 'La incidencia no pertenece al cliente de la acción.', 1;
END;
GO
CREATE OR ALTER TRIGGER dbo.tr_Incident_ClientLink
ON dbo.Incidents AFTER UPDATE
AS
BEGIN
  SET NOCOUNT ON;
  IF UPDATE(ClientId) AND EXISTS (SELECT 1 FROM inserted i JOIN dbo.RetentionActionIncidents l ON l.IncidentId = i.IncidentId
    JOIN dbo.RetentionActions a ON a.ActionId = l.ActionId WHERE a.ClientId <> i.ClientId)
    THROW 50002, 'El cambio de cliente rompería la relación con la acción.', 1;
END;
GO
CREATE OR ALTER TRIGGER dbo.tr_Action_ClientLink
ON dbo.RetentionActions AFTER UPDATE
AS
BEGIN
  SET NOCOUNT ON;
  IF UPDATE(ClientId) AND EXISTS (SELECT 1 FROM inserted a JOIN dbo.RetentionActionIncidents l ON l.ActionId = a.ActionId
    JOIN dbo.Incidents i ON i.IncidentId = l.IncidentId WHERE a.ClientId <> i.ClientId)
    THROW 50002, 'El cambio de cliente rompería la relación con la incidencia.', 1;
END;
GO
/* Equivalente al SP de registrar reserva del caso de ejemplo: operación transaccional
   principal adaptada al tema FugaCliente. No se mezclan reservas de coworking. */
CREATE OR ALTER PROCEDURE dbo.sp_RegisterIncident
  @ClientId INT, @ServiceId INT, @CategoryId INT, @Description NVARCHAR(2000),
  @Severity TINYINT, @Satisfaction TINYINT = NULL, @AssignedUserId INT = NULL,
  @CreatedById INT, @CreatedAt DATETIME2 = NULL
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    DECLARE @ClientStatus VARCHAR(10);
    SELECT @ClientStatus = Status FROM dbo.Clients WITH (UPDLOCK, HOLDLOCK) WHERE ClientId = @ClientId;
    IF @ClientStatus IS NULL THROW 50001, 'Cliente no encontrado.', 1;
    IF @ClientStatus <> 'activo' THROW 50002, 'El cliente está inactivo.', 1;
    IF NOT EXISTS (SELECT 1 FROM dbo.Services WHERE ServiceId = @ServiceId AND Active = 1) THROW 50001, 'Servicio activo no encontrado.', 1;
    IF NOT EXISTS (SELECT 1 FROM dbo.IncidentCategories WHERE CategoryId = @CategoryId) THROW 50001, 'Categoría no encontrada.', 1;
    IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE UserId = @CreatedById AND Active = 1) THROW 50001, 'Usuario no encontrado.', 1;
    IF @AssignedUserId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.Users WHERE UserId = @AssignedUserId AND Active = 1) THROW 50001, 'Responsable activo no encontrado.', 1;
    SET @CreatedAt = COALESCE(@CreatedAt, SYSUTCDATETIME());
    INSERT dbo.Incidents(ClientId, ServiceId, CategoryId, Description, Severity, Satisfaction, AssignedUserId, CreatedById, CreatedAt, UpdatedAt)
      VALUES (@ClientId, @ServiceId, @CategoryId, @Description, @Severity, @Satisfaction, @AssignedUserId, @CreatedById, @CreatedAt, @CreatedAt);
    DECLARE @Id INT = CONVERT(INT, SCOPE_IDENTITY());
    DECLARE @Payload NVARCHAR(MAX) = (SELECT @Id AS incidentId, @Severity AS severity FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
    EXEC dbo.sp_QueueEvent 'incident.created', 'client', @ClientId, @CreatedById, @Payload;
    COMMIT;
    SELECT @Id AS id;
  END TRY
  BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK;
    THROW;
  END CATCH
END;
GO
CREATE OR ALTER PROCEDURE dbo.sp_UpdateIncidentStatus
  @IncidentId INT, @Status VARCHAR(15), @ExpectedVersion INT, @ActorId INT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    DECLARE @Current VARCHAR(15), @Version INT, @ClientId INT;
    SELECT @Current = Status, @Version = Version, @ClientId = ClientId FROM dbo.Incidents WITH (UPDLOCK, HOLDLOCK) WHERE IncidentId = @IncidentId;
    IF @Current IS NULL THROW 50001, 'Incidencia no encontrada.', 1;
    IF @Version <> @ExpectedVersion THROW 50002, 'Otra persona modificó la incidencia. Actualiza y vuelve a intentarlo.', 1;
    IF @Current <> @Status
    BEGIN
      IF @Current = 'resuelta' OR (@Current = 'en_proceso' AND @Status = 'abierta') THROW 50002, 'La transición de estado no está permitida.', 1;
      UPDATE dbo.Incidents SET Status = @Status, Version = Version + 1, UpdatedAt = SYSUTCDATETIME(),
        ResolvedAt = CASE WHEN @Status = 'resuelta' THEN SYSUTCDATETIME() ELSE NULL END WHERE IncidentId = @IncidentId;
      DECLARE @Payload NVARCHAR(MAX) = (SELECT @IncidentId AS incidentId, @Status AS status FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
      EXEC dbo.sp_QueueEvent 'incident.status_changed', 'client', @ClientId, @ActorId, @Payload;
    END
    COMMIT;
    SELECT @IncidentId AS id;
  END TRY
  BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK;
    THROW;
  END CATCH
END;
GO
CREATE OR ALTER PROCEDURE dbo.sp_CreateRetentionAction
  @ClientId INT, @IncidentId INT = NULL, @AssignedUserId INT, @CreatedById INT,
  @Type VARCHAR(20), @Description NVARCHAR(2000), @DueAt DATETIME2
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    DECLARE @ClientStatus VARCHAR(10);
    SELECT @ClientStatus = Status FROM dbo.Clients WITH (UPDLOCK, HOLDLOCK) WHERE ClientId = @ClientId;
    IF @ClientStatus IS NULL THROW 50001, 'Cliente no encontrado.', 1;
    IF @ClientStatus <> 'activo' THROW 50002, 'El cliente está inactivo.', 1;
    IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE UserId = @AssignedUserId AND Active = 1) THROW 50001, 'Responsable activo no encontrado.', 1;
    IF @IncidentId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.Incidents WHERE IncidentId = @IncidentId AND ClientId = @ClientId) THROW 50002, 'La incidencia no pertenece a este cliente.', 1;
    IF @DueAt <= SYSUTCDATETIME() THROW 50002, 'La fecha de seguimiento debe ser futura.', 1;
    INSERT dbo.RetentionActions(ClientId, AssignedUserId, CreatedById, Type, Description, DueAt)
      VALUES (@ClientId, @AssignedUserId, @CreatedById, @Type, @Description, @DueAt);
    DECLARE @Id INT = CONVERT(INT, SCOPE_IDENTITY());
    IF @IncidentId IS NOT NULL INSERT dbo.RetentionActionIncidents(ActionId, IncidentId) VALUES (@Id, @IncidentId);
    DECLARE @Payload NVARCHAR(MAX) = (SELECT @Id AS actionId, @Type AS type FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
    EXEC dbo.sp_QueueEvent 'retention.created', 'client', @ClientId, @CreatedById, @Payload;
    COMMIT;
    SELECT @Id AS id;
  END TRY
  BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK;
    THROW;
  END CATCH
END;
GO
CREATE OR ALTER PROCEDURE dbo.sp_CompleteRetentionAction
  @ActionId INT, @Outcome VARCHAR(20), @ActorId INT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    DECLARE @Status VARCHAR(15), @CurrentOutcome VARCHAR(20), @ClientId INT;
    SELECT @Status = Status, @CurrentOutcome = Outcome, @ClientId = ClientId FROM dbo.RetentionActions WITH (UPDLOCK, HOLDLOCK) WHERE ActionId = @ActionId;
    IF @Status IS NULL THROW 50001, 'Acción no encontrada.', 1;
    IF @Status = 'completada' AND @CurrentOutcome <> @Outcome THROW 50002, 'La acción ya tiene un resultado registrado.', 1;
    IF @Status = 'pendiente'
    BEGIN
      UPDATE dbo.RetentionActions SET Status = 'completada', Outcome = @Outcome, CompletedAt = SYSUTCDATETIME() WHERE ActionId = @ActionId;
      DECLARE @Payload NVARCHAR(MAX) = (SELECT @ActionId AS actionId, @Outcome AS outcome FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
      EXEC dbo.sp_QueueEvent 'retention.completed', 'client', @ClientId, @ActorId, @Payload;
    END
    COMMIT;
    SELECT @ActionId AS id;
  END TRY
  BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK;
    THROW;
  END CATCH
END;
GO
