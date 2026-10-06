export type RunEventType = 'run.completed' | 'workflow.failed';

export interface RunEvent {
  /** `<boot epoch>.<seq>`, used as the SSE `id:` so clients can resume with Last-Event-ID. */
  id: string;
  type: RunEventType;
  data: Record<string, unknown>;
  receivedAt: string;
}

type Listener = (event: RunEvent) => void;

export interface RunEventsOptions {
  /** How many recent events to keep for replay. */
  historySize?: number;
  /** How many dedupe keys to remember. */
  dedupeSize?: number;
  dedupeTtlMs?: number;
}

/**
 * In-memory pub/sub for SSE plus a small buffer of recent events.
 * Single-instance by design: run more than one replica and callbacks would
 * reach only one of them (see README).
 */
export class RunEvents {
  private readonly listeners = new Set<Listener>();
  private readonly history: RunEvent[] = [];
  /** Insertion-ordered map used as an LRU: key -> expiry ms. */
  private readonly seen = new Map<string, number>();
  private seq = 0;
  /** Distinguishes this process's ids from a previous run's after a restart. */
  private readonly epoch = Date.now().toString(36);
  private readonly historySize: number;
  private readonly dedupeSize: number;
  private readonly dedupeTtlMs: number;

  constructor(opts: RunEventsOptions = {}) {
    this.historySize = opts.historySize ?? 50;
    this.dedupeSize = opts.dedupeSize ?? 2000;
    this.dedupeTtlMs = opts.dedupeTtlMs ?? 7 * 24 * 3600_000;
  }

  /** Publishes unless `dedupeKey` was already seen. Returns whether it was published. */
  publish(type: RunEventType, data: Record<string, unknown>, dedupeKey: string): boolean {
    const now = Date.now();
    const exp = this.seen.get(dedupeKey);
    if (exp !== undefined && exp > now) return false;

    this.seen.delete(dedupeKey);
    this.seen.set(dedupeKey, now + this.dedupeTtlMs);
    while (this.seen.size > this.dedupeSize) {
      const oldest = this.seen.keys().next().value;
      if (oldest === undefined) break;
      this.seen.delete(oldest);
    }

    const event: RunEvent = { id: `${this.epoch}.${++this.seq}`, type, data, receivedAt: new Date(now).toISOString() };
    this.history.push(event);
    if (this.history.length > this.historySize) this.history.shift();

    for (const l of this.listeners) {
      try {
        l(event);
      } catch {
        // One broken subscriber must not stop the others.
      }
    }
    return true;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get subscriberCount(): number {
    return this.listeners.size;
  }

  /**
   * Events the client missed, given its Last-Event-ID. An id from a previous
   * process (or garbage) replays the whole buffer.
   */
  since(lastEventId: string): RunEvent[] {
    const [epoch, seqStr] = lastEventId.split('.');
    const seq = Number(seqStr);
    if (epoch !== this.epoch || !Number.isInteger(seq)) return this.recent();
    return this.history.filter((e) => Number(e.id.split('.')[1]) > seq);
  }

  recent(): RunEvent[] {
    return [...this.history];
  }
}
