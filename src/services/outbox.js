export class OutboxWorker {
  constructor(repository, audit, interval = 3000, quiet = false) { this.repository = repository; this.audit = audit; this.interval = interval; this.running = false; this.quiet = quiet; }
  async flush() {
    if (this.running) return;
    this.running = true;
    try {
      for (const event of await this.repository.pendingEvents()) { await this.audit.write(event); await this.repository.markEvent(event.eventId); }
    } finally { this.running = false; }
  }
  start() {
    const pump = () => this.flush().catch(() => { if (!this.quiet) console.error('Auditoría pendiente; se reintentará sin perder eventos SQL.'); });
    void pump(); this.timer = setInterval(pump, this.interval); this.timer.unref();
  }
  stop() { clearInterval(this.timer); }
}
