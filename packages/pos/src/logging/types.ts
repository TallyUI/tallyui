export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Who did it: a person (a cashier or manager), not the system. WCPOS v2's log actor. */
export interface LogActor {
  id?: string;
  name?: string;
  role?: string;
}

/** `ok`: the store applied the record. `failed`: the store refused it. `pending`: the store keeps failing it on its
 * own, and it is still retrying. */
export type SyncRecordOutcome = 'ok' | 'failed' | 'pending';

/** One record's sync outcome (WCPOS v2's `sync.record` row). */
export interface LogSyncRecord {
  /** The local collection, e.g. `pos_orders`. */
  collection: string;
  /** The record's durable id (a PosOrder's `id`, not its commandId). */
  recordId: string;
  outcome: SyncRecordOutcome;
  /** The store's error code. */
  code?: string;
  reason?: string;
}

/** Typed fields a call site puts on the entry itself; each is set on the entry only when given. */
export interface LogMeta {
  actor?: LogActor;
  syncRecord?: LogSyncRecord;
}

export interface LogEntry extends LogMeta {
  level: LogLevel;
  scope: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

export interface LogSink {
  id: string;
  levels: LogLevel[];
  scopes?: string[];
  write(entry: LogEntry): void;
}

type LogMethod = (message: string, data?: Record<string, unknown>, meta?: LogMeta) => void;

export interface Logger {
  debug: LogMethod;
  info: LogMethod;
  warn: LogMethod;
  error: LogMethod;
  createScope(name: string): Logger;
  addSink(sink: LogSink): void;
  removeSink(sinkId: string): void;
}
