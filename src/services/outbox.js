/**
 * Worker del patrón Transactional Outbox.
 * SQL Server confirma el cambio de negocio y su evento en la misma transacción; este worker
 * entrega los eventos pendientes a MongoDB (upsert idempotente por eventId) y luego los marca.
 * Si MongoDB cae, los eventos quedan en SQL y se reintentan sin pérdida ni duplicados.
 */
export class OutboxWorker {
  constructor(repository, audit, interval = 3000, quiet = false) {
    this.repository = repository;
    this.audit = audit;
    this.interval = interval;
    this.quiet = quiet;
    this.running = false;
    this.timer = null;
  }

  async flush() {
    if (this.running) return 0;
    this.running = true;
    let delivered = 0;
    try {
      for (const event of await this.repository.pendingEvents()) {
        await this.audit.write(event);
        await this.repository.markEvent(event.eventId);
        delivered++;
      }
    } finally {
      this.running = false;
    }
    return delivered;
  }

  start() {
    const pump = () => this.flush().catch(() => {
      if (!this.quiet) console.error('Auditoría pendiente; se reintentará sin perder eventos SQL.');
    });
    void pump();
    this.timer = setInterval(pump, this.interval);
    this.timer.unref();
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }
}
