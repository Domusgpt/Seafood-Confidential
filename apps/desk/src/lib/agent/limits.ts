// In-process guards for the agent gateway, applied before any database work so that anonymous or
// failing traffic cannot fill the audit trail or starve staff pages of connections. Per instance;
// the database keeps the authoritative per-agent budget (app.agent_rate_remaining).

/** Fixed-size sliding-window counter keyed by a string (client address, token prefix). */
export class WindowCounter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 10_000,
  ) {}

  /** Record one event; returns false when the key is over its limit for the window. */
  hit(key: string, now = Date.now()): boolean {
    const since = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > since);
    const allowed = recent.length < this.limit;
    if (allowed) recent.push(now);
    this.hits.delete(key);
    this.hits.set(key, recent);
    if (this.hits.size > this.maxKeys) {
      const oldest = this.hits.keys().next().value;
      if (oldest !== undefined) this.hits.delete(oldest);
    }
    return allowed;
  }

  /** True when the key is already at its limit, without recording an event. */
  blocked(key: string, now = Date.now()): boolean {
    const since = now - this.windowMs;
    return (this.hits.get(key) ?? []).filter((t) => t > since).length >= this.limit;
  }
}

/** Counting semaphore with a bounded queue: acquire() resolves to a release function, or null when full. */
export class Semaphore {
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(
    private readonly max: number,
    private readonly maxQueue: number,
  ) {}

  async acquire(): Promise<(() => void) | null> {
    if (this.active >= this.max) {
      if (this.waiting.length >= this.maxQueue) return null;
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    } else {
      this.active++;
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.waiting.shift();
      if (next) next();
      else this.active--;
    };
  }

  get load() {
    return { active: this.active, waiting: this.waiting.length };
  }
}
