import type { Logger, LogEntry, LogLevel, LogMeta, LogSink } from './types';

export function createLogger(scope = 'root'): Logger {
  return createChildLogger(new Map(), scope);
}

function logWithSinks(
  sinks: Map<string, LogSink>,
  level: LogLevel,
  scope: string,
  message: string,
  data?: Record<string, unknown>,
  meta?: LogMeta,
) {
  const entry: LogEntry = { level, scope, message, data, timestamp: Date.now() };
  // Set only when given, so an entry logged without them keeps its old shape.
  if (meta?.actor) entry.actor = meta.actor;
  if (meta?.syncRecord) entry.syncRecord = meta.syncRecord;
  for (const sink of sinks.values()) {
    if (!sink.levels.includes(level)) continue;
    if (sink.scopes && !sink.scopes.includes(scope)) continue;
    sink.write(entry);
  }
}

function createChildLogger(sinks: Map<string, LogSink>, scope: string): Logger {
  return {
    debug: (message, data, meta) => logWithSinks(sinks, 'debug', scope, message, data, meta),
    info: (message, data, meta) => logWithSinks(sinks, 'info', scope, message, data, meta),
    warn: (message, data, meta) => logWithSinks(sinks, 'warn', scope, message, data, meta),
    error: (message, data, meta) => logWithSinks(sinks, 'error', scope, message, data, meta),
    createScope: (childName: string) => createChildLogger(sinks, childName),
    addSink: (sink: LogSink) => { sinks.set(sink.id, sink); },
    removeSink: (sinkId: string) => { sinks.delete(sinkId); },
  };
}
