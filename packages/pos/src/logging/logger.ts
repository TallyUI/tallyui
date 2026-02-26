import type { Logger, LogEntry, LogLevel, LogSink } from './types';

export function createLogger(scope = 'root'): Logger {
  const sinks: Map<string, LogSink> = new Map();

  function log(level: LogLevel, message: string, data?: Record<string, unknown>) {
    const entry: LogEntry = {
      level,
      scope,
      message,
      data,
      timestamp: Date.now(),
    };

    for (const sink of sinks.values()) {
      if (!sink.levels.includes(level)) continue;
      if (sink.scopes && !sink.scopes.includes(scope)) continue;
      sink.write(entry);
    }
  }

  return {
    debug: (message, data) => log('debug', message, data),
    info: (message, data) => log('info', message, data),
    warn: (message, data) => log('warn', message, data),
    error: (message, data) => log('error', message, data),

    createScope(name: string): Logger {
      return createChildLogger(sinks, name);
    },

    addSink(sink: LogSink) {
      sinks.set(sink.id, sink);
    },

    removeSink(sinkId: string) {
      sinks.delete(sinkId);
    },
  };
}

function logWithSinks(
  sinks: Map<string, LogSink>,
  level: LogLevel,
  scope: string,
  message: string,
  data?: Record<string, unknown>,
) {
  const entry: LogEntry = { level, scope, message, data, timestamp: Date.now() };
  for (const sink of sinks.values()) {
    if (!sink.levels.includes(level)) continue;
    if (sink.scopes && !sink.scopes.includes(scope)) continue;
    sink.write(entry);
  }
}

function createChildLogger(sinks: Map<string, LogSink>, scope: string): Logger {
  return {
    debug: (message, data) => logWithSinks(sinks, 'debug', scope, message, data),
    info: (message, data) => logWithSinks(sinks, 'info', scope, message, data),
    warn: (message, data) => logWithSinks(sinks, 'warn', scope, message, data),
    error: (message, data) => logWithSinks(sinks, 'error', scope, message, data),
    createScope: (childName: string) => createChildLogger(sinks, childName),
    addSink: (sink: LogSink) => sinks.set(sink.id, sink),
    removeSink: (sinkId: string) => sinks.delete(sinkId),
  };
}
