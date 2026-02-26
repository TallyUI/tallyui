import { describe, it, expect, vi } from 'vitest';
import { createLogger } from './logger';
import type { LogSink, LogEntry } from './types';

function createTestSink(overrides?: Partial<LogSink>): LogSink & { entries: LogEntry[] } {
  const entries: LogEntry[] = [];
  return {
    id: 'test',
    levels: ['debug', 'info', 'warn', 'error'],
    write: (entry) => entries.push(entry),
    entries,
    ...overrides,
  };
}

describe('createLogger', () => {
  it('creates a logger with default root scope', () => {
    const logger = createLogger();
    expect(logger).toBeDefined();
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  it('writes log entries to registered sinks', () => {
    const logger = createLogger();
    const sink = createTestSink();
    logger.addSink(sink);

    logger.info('hello world');

    expect(sink.entries).toHaveLength(1);
    expect(sink.entries[0].level).toBe('info');
    expect(sink.entries[0].message).toBe('hello world');
    expect(sink.entries[0].scope).toBe('root');
    expect(sink.entries[0].timestamp).toBeGreaterThan(0);
  });

  it('includes data in log entries', () => {
    const logger = createLogger();
    const sink = createTestSink();
    logger.addSink(sink);

    logger.error('failed', { code: 500 });

    expect(sink.entries[0].data).toEqual({ code: 500 });
  });

  it('only writes to sinks that match the log level', () => {
    const logger = createLogger();
    const errorOnly = createTestSink({ id: 'errors', levels: ['error'] });
    logger.addSink(errorOnly);

    logger.debug('debug msg');
    logger.info('info msg');
    logger.warn('warn msg');
    logger.error('error msg');

    expect(errorOnly.entries).toHaveLength(1);
    expect(errorOnly.entries[0].level).toBe('error');
  });

  it('removes sinks by id', () => {
    const logger = createLogger();
    const sink = createTestSink();
    logger.addSink(sink);
    logger.info('before');
    logger.removeSink('test');
    logger.info('after');

    expect(sink.entries).toHaveLength(1);
    expect(sink.entries[0].message).toBe('before');
  });
});

describe('scoped loggers', () => {
  it('creates a child logger with a scoped name', () => {
    const logger = createLogger();
    const sink = createTestSink();
    logger.addSink(sink);

    const child = logger.createScope('order-builder');
    child.info('order created');

    expect(sink.entries[0].scope).toBe('order-builder');
  });

  it('child loggers share sinks with parent', () => {
    const logger = createLogger();
    const sink = createTestSink();
    logger.addSink(sink);

    const child = logger.createScope('tax');
    child.warn('rate missing');
    logger.info('root message');

    expect(sink.entries).toHaveLength(2);
    expect(sink.entries[0].scope).toBe('tax');
    expect(sink.entries[1].scope).toBe('root');
  });

  it('sinks can filter by scope', () => {
    const logger = createLogger();
    const taxOnly = createTestSink({ id: 'tax-sink', scopes: ['tax'] });
    logger.addSink(taxOnly);

    const taxLog = logger.createScope('tax');
    const orderLog = logger.createScope('order');

    taxLog.info('tax message');
    orderLog.info('order message');

    expect(taxOnly.entries).toHaveLength(1);
    expect(taxOnly.entries[0].scope).toBe('tax');
  });

  it('sinks added to parent are visible to existing children', () => {
    const logger = createLogger();
    const child = logger.createScope('child');

    const sink = createTestSink();
    logger.addSink(sink);

    child.info('after add');
    expect(sink.entries).toHaveLength(1);
  });

  it('sinks removed from parent are removed from children', () => {
    const logger = createLogger();
    const sink = createTestSink();
    logger.addSink(sink);

    const child = logger.createScope('child');
    child.info('before');
    logger.removeSink('test');
    child.info('after');

    expect(sink.entries).toHaveLength(1);
  });

  it('nested scopes (grandchild) share sinks with root', () => {
    const logger = createLogger();
    const sink = createTestSink();
    logger.addSink(sink);

    const child = logger.createScope('parent');
    const grandchild = child.createScope('grandchild');

    grandchild.info('deep message');
    expect(sink.entries).toHaveLength(1);
    expect(sink.entries[0].scope).toBe('grandchild');
  });
});
