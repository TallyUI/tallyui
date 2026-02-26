import type { LogEntry, LogLevel, LogSink } from './types';

export interface ConsoleSinkOptions {
  id?: string;
  levels: LogLevel[];
  scopes?: string[];
}

export function consoleSink(options: ConsoleSinkOptions): LogSink {
  return {
    id: options.id ?? 'console',
    levels: options.levels,
    scopes: options.scopes,
    write(entry: LogEntry) {
      const prefix = `[${entry.scope}]`;
      const args = entry.data ? [prefix, entry.message, entry.data] : [prefix, entry.message];

      switch (entry.level) {
        case 'error':
          console.error(...args);
          break;
        case 'warn':
          console.warn(...args);
          break;
        default:
          console.log(...args);
      }
    },
  };
}

export interface CallbackSinkOptions {
  id: string;
  levels: LogLevel[];
  scopes?: string[];
  callback: (entry: LogEntry) => void;
}

export function callbackSink(options: CallbackSinkOptions): LogSink {
  return {
    id: options.id,
    levels: options.levels,
    scopes: options.scopes,
    write: options.callback,
  };
}
