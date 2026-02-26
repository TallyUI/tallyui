export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
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

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
  createScope(name: string): Logger;
  addSink(sink: LogSink): void;
  removeSink(sinkId: string): void;
}
