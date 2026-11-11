import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWedgeDetector, DEFAULT_WEDGE_SETTINGS, replayWedgeDetector, WEDGE_END_OF_SCAN_MS } from './wedge-detector';

function trace(code: string, gap = 5) {
  return [...code].map((key, index) => ({ key, timeMs: index * gap }));
}

function createClock() {
  let time = 0;
  let nextId = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => time,
    setTimeout: (fn: () => void, ms: number) => {
      const id = ++nextId;
      timers.set(id, { at: time + ms, fn });
      return id;
    },
    clearTimeout: (handle: unknown) => { timers.delete(handle as number); },
    advance: (ms: number) => {
      const until = time + ms;
      while (timers.size) {
        const [id, timer] = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (timer.at > until) break;
        time = timer.at;
        timers.delete(id);
        timer.fn();
      }
      time = until;
    },
  };
}

describe('wedge detector', () => {
  const code = '036000291452';

  it('reads a fast burst as a scan', () => {
    expect(replayWedgeDetector(trace(code), DEFAULT_WEDGE_SETTINGS)).toEqual({
      detectedAsScan: true, code,
    });
  });

  it('does not read slow typing as a scan', () => {
    expect(replayWedgeDetector(trace(code, 120), DEFAULT_WEDGE_SETTINGS)).toEqual({
      detectedAsScan: false, code: '',
    });
  });

  it('strips a configured prefix and suffix only at the edges', () => {
    const settings = { threshold: 24, prefix: '[', suffix: ']' };
    expect(replayWedgeDetector(trace('[1234]'), settings)).toEqual({ detectedAsScan: true, code: '1234' });
    expect(replayWedgeDetector(trace('[12[34]'), settings).code).toBe('12[34');
    expect(replayWedgeDetector(trace('12]34'), settings).code).toBe('12]34');
    expect(replayWedgeDetector(trace('[1234]'), { ...settings, prefix: '[1' }).code).toBe('[1234');
    expect(replayWedgeDetector(trace('[1234]'), { ...settings, suffix: '4]' }).code).toBe('1234]');
  });

  it('emits once after the burst settles', () => {
    const clock = createClock();
    const onScan = vi.fn();
    const detector = createWedgeDetector({ ...clock, getSettings: () => DEFAULT_WEDGE_SETTINGS, onScan });
    expect(detector.handleKey('Enter')).toBe(false);
    for (const [index, key] of [...code].entries()) {
      expect(detector.handleKey(key)).toBe(index > 0);
      clock.advance(5);
    }
    expect(detector.handleKey('Enter')).toBe(true);
    expect(detector.handleKey('Tab')).toBe(true);
    expect(detector.handleKey('Shift')).toBe(false);
    expect(onScan).not.toHaveBeenCalled();
    clock.advance(144);
    expect(onScan).not.toHaveBeenCalled();
    clock.advance(1);
    expect(onScan).toHaveBeenCalledExactlyOnceWith(code, { terminated: true, startedAtMs: 0 });
    expect(detector.handleKey('Enter')).toBe(false);
    clock.advance(500);
    expect(onScan).toHaveBeenCalledTimes(1);
    for (const key of code) {
      detector.handleKey(key);
      clock.advance(5);
    }
    detector.dispose();
    clock.advance(200);
    expect(onScan).toHaveBeenCalledTimes(1);
  });
});

describe('createWedgeDetector meta', () => {
  const SETTINGS = DEFAULT_WEDGE_SETTINGS;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** v2's `trace(chars, gapMs, startMs = 1000)`, built on this file's `trace`. */
  function traceFrom(code: string, gapMs: number, startMs = 1000) {
    return trace(code, gapMs).map((entry) => ({ ...entry, timeMs: entry.timeMs + startMs }));
  }

  function streamWithMeta(entries: { key: string; timeMs: number }[]) {
    const results: { code: string; terminated: boolean }[] = [];
    const detector = createWedgeDetector({
      getSettings: () => ({ ...SETTINGS }),
      onScan: (code, meta) => results.push({ code, terminated: meta.terminated }),
    });
    for (const entry of entries) {
      vi.setSystemTime(entry.timeMs);
      detector.handleKey(entry.key, entry.timeMs);
    }
    vi.advanceTimersByTime(WEDGE_END_OF_SCAN_MS);
    return results;
  }

  it('reports the first key time for each slow 13-key burst', () => {
    const onScan = vi.fn();
    const detector = createWedgeDetector({
      getSettings: () => ({ ...SETTINGS, threshold: 40 }),
      onScan,
      now: () => Date.now(),
      setTimeout: (fn, ms) => setTimeout(fn, ms),
    });
    for (const startedAtMs of [1000, 10_000]) {
      for (const entry of traceFrom('1234567890123', 30, startedAtMs)) {
        vi.setSystemTime(entry.timeMs);
        detector.handleKey(entry.key);
      }
      vi.advanceTimersByTime(WEDGE_END_OF_SCAN_MS);
      expect(onScan).toHaveBeenLastCalledWith('1234567890123', { terminated: false, startedAtMs });
    }
    expect(onScan).toHaveBeenCalledTimes(2);
  });

  it('handleKey reports keys that belong to a latched burst', () => {
    const onScan = vi.fn();
    const detector = createWedgeDetector({
      getSettings: () => SETTINGS,
      onScan,
      now: () => Date.now(),
      setTimeout: (fn, ms) => setTimeout(fn, ms),
    });
    for (const entry of traceFrom('12345678', 13)) {
      vi.setSystemTime(entry.timeMs);
      expect(detector.handleKey(entry.key)).toBe(entry.key !== '1');
    }
    expect(detector.handleKey('Enter')).toBe(true);
    expect(onScan).not.toHaveBeenCalled();
    vi.advanceTimersByTime(WEDGE_END_OF_SCAN_MS);
    expect(onScan).toHaveBeenCalledWith('12345678', expect.objectContaining({ terminated: true }));
    expect(detector.handleKey('Enter')).toBe(false);
  });

  it('a terminator long after the last key is not part of the burst', () => {
    const onScan = vi.fn();
    const detector = createWedgeDetector({ getSettings: () => SETTINGS, onScan });
    for (const entry of traceFrom('12345678', 13)) {
      vi.setSystemTime(entry.timeMs);
      detector.handleKey(entry.key);
    }
    vi.setSystemTime(Date.now() + WEDGE_END_OF_SCAN_MS + 1);
    expect(detector.handleKey('Enter')).toBe(false);
    vi.advanceTimersByTime(WEDGE_END_OF_SCAN_MS);
    expect(onScan).toHaveBeenCalledWith('12345678', expect.objectContaining({ terminated: false }));
  });

  it('flags a burst ending in Enter as terminated', () => {
    const keys = traceFrom('4006', 13);
    const last = keys[keys.length - 1].timeMs;
    const results = streamWithMeta([...keys, { key: 'Enter', timeMs: last + 13 }]);
    expect(results).toEqual([{ code: '4006', terminated: true }]);
  });

  it('flags a burst ending in Tab as terminated', () => {
    const keys = traceFrom('4006', 13);
    const last = keys[keys.length - 1].timeMs;
    const results = streamWithMeta([...keys, { key: 'Tab', timeMs: last + 13 }]);
    expect(results).toEqual([{ code: '4006', terminated: true }]);
  });

  it('reports an unterminated burst as terminated: false', () => {
    const results = streamWithMeta(traceFrom('sdafs', 13));
    expect(results).toEqual([{ code: 'sdafs', terminated: false }]);
  });

  it('an Enter outside any burst does not mark the next burst terminated', () => {
    const keys = traceFrom('sdafs', 13, 1000);
    const results = streamWithMeta([{ key: 'Enter', timeMs: 500 }, ...keys]);
    expect(results).toEqual([{ code: 'sdafs', terminated: false }]);
  });

  // Not in v2: the terminator flag resets between bursts on one detector.
  it('a terminated burst does not mark the next burst terminated', () => {
    const results: { code: string; terminated: boolean }[] = [];
    const detector = createWedgeDetector({
      getSettings: () => ({ ...SETTINGS }),
      onScan: (code, meta) => results.push({ code, terminated: meta.terminated }),
    });
    const first = traceFrom('4006', 13, 1000);
    const enter = { key: 'Enter', timeMs: first[first.length - 1].timeMs + 13 };
    for (const burst of [[...first, enter], traceFrom('sdafs', 13, 2000)]) {
      for (const entry of burst) {
        vi.setSystemTime(entry.timeMs);
        detector.handleKey(entry.key, entry.timeMs);
      }
      vi.advanceTimersByTime(WEDGE_END_OF_SCAN_MS);
    }
    expect(results).toEqual([
      { code: '4006', terminated: true },
      { code: 'sdafs', terminated: false },
    ]);
  });
});
