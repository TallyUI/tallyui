import { describe, expect, it, vi } from 'vitest';
import { createWedgeDetector, DEFAULT_WEDGE_SETTINGS, replayWedgeDetector } from './wedge-detector';

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
    expect(onScan).toHaveBeenCalledExactlyOnceWith(code);
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
