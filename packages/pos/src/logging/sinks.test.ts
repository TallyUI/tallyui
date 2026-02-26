import { describe, it, expect, vi } from 'vitest';
import { consoleSink, callbackSink } from './sinks';
import type { LogEntry } from './types';

const entry: LogEntry = {
  level: 'info',
  scope: 'test',
  message: 'hello',
  data: { key: 'value' },
  timestamp: 1000,
};

describe('consoleSink', () => {
  it('writes info/debug to console.log', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const sink = consoleSink({ levels: ['info'] });
    sink.write(entry);
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  it('writes warn to console.warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sink = consoleSink({ levels: ['warn'] });
    sink.write({ ...entry, level: 'warn' });
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  it('writes error to console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const sink = consoleSink({ levels: ['error'] });
    sink.write({ ...entry, level: 'error' });
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  it('uses provided id or defaults to console', () => {
    const s1 = consoleSink({ levels: ['info'] });
    expect(s1.id).toBe('console');

    const s2 = consoleSink({ id: 'debug-console', levels: ['debug'] });
    expect(s2.id).toBe('debug-console');
  });
});

describe('callbackSink', () => {
  it('calls the callback for matching entries', () => {
    const cb = vi.fn();
    const sink = callbackSink({ id: 'toast', levels: ['error'], callback: cb });
    sink.write({ ...entry, level: 'error' });
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ level: 'error', message: 'hello' }));
  });

  it('has correct id and levels', () => {
    const sink = callbackSink({ id: 'my-sink', levels: ['warn', 'error'], callback: vi.fn() });
    expect(sink.id).toBe('my-sink');
    expect(sink.levels).toEqual(['warn', 'error']);
  });
});
