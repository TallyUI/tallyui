import { afterEach, describe, expect, it, vi } from 'vitest';
import { cameraErrorStatus, DETECTOR_FORMATS, detectorFormatToSymbology, nativeBarcodeDetector, startDecodeLoop,
  type DetectedBarcode } from './camera-scan';

/** A decoder whose detect calls each wait for the test to settle them. */
function manualDecoder() {
  const pending: { resolve: (value: DetectedBarcode[]) => void; reject: (error: unknown) => void }[] = [];
  const detect = vi.fn(() => new Promise<DetectedBarcode[]>((resolve, reject) => { pending.push({ resolve, reject }); }));
  return { decoder: { detect }, pending, detect };
}

/** Injected timers: run() fires the one scheduled tick and lets the detect start. */
function manualTimers() {
  const queue: (() => void)[] = [];
  const setTimer = vi.fn((fn: () => void) => { queue.push(fn); return queue.length; });
  const clearTimer = vi.fn();
  const run = async () => {
    const next = queue.shift();
    if (!next) throw new Error('no timer scheduled');
    next();
    await flush();
  };
  return { setTimer, clearTimer, run, queue };
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function setup() {
  const decoder = manualDecoder();
  const timers = manualTimers();
  const onDetected = vi.fn();
  const onStatus = vi.fn();
  const loop = startDecodeLoop({ decoder: decoder.decoder, source: 'video', onDetected, onStatus,
    setTimer: timers.setTimer, clearTimer: timers.clearTimer });
  /** Fire the tick and settle its detect. */
  const cycle = async (outcome: DetectedBarcode[] | Error) => {
    await timers.run();
    const call = decoder.pending.shift()!;
    if (outcome instanceof Error) call.reject(outcome); else call.resolve(outcome);
    await flush();
  };
  return { ...decoder, ...timers, onDetected, onStatus, loop, cycle };
}

describe('camera scan', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('maps the six detector formats to TallyUI symbologies', () => {
    expect(DETECTOR_FORMATS.map(detectorFormatToSymbology)).toEqual(['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'qr']);
    expect(detectorFormatToSymbology('aztec')).toBeUndefined();
    expect(detectorFormatToSymbology('toString')).toBeUndefined();
  });

  it('wraps the BarcodeDetector global when present', async () => {
    vi.stubGlobal('BarcodeDetector', undefined);
    expect(nativeBarcodeDetector()).toBeUndefined();
    const detect = vi.fn(async () => [{ rawValue: '12345678', format: 'ean_8' }]);
    const constructed = vi.fn();
    vi.stubGlobal('BarcodeDetector', class {
      constructor(options: unknown) { constructed(options); }
      detect = detect;
    });
    const decoder = nativeBarcodeDetector();
    expect(constructed).toHaveBeenCalledExactlyOnceWith({ formats: [...DETECTOR_FORMATS] });
    await expect(decoder!.detect('frame')).resolves.toEqual([{ rawValue: '12345678', format: 'ean_8' }]);
    expect(detect).toHaveBeenCalledExactlyOnceWith('frame');
    vi.stubGlobal('BarcodeDetector', class { constructor() { throw new Error('unsupported'); } });
    expect(nativeBarcodeDetector()).toBeUndefined();
  });

  it('keeps one detect in flight and delivers each non-empty result', async () => {
    const { run, detect, pending, setTimer, onDetected, cycle } = setup();
    expect(setTimer).toHaveBeenCalledWith(expect.any(Function), 200);
    await run();
    expect(detect).toHaveBeenCalledExactlyOnceWith('video');
    // Still pending: no next tick is scheduled.
    expect(setTimer).toHaveBeenCalledTimes(1);
    pending.shift()!.resolve([{ rawValue: '4006381333931', format: 'ean_13' }, { rawValue: '', format: 'qr_code' },
      { rawValue: 'X-1', format: 'aztec' }]);
    await flush();
    expect(onDetected.mock.calls).toEqual([['4006381333931', 'ean13'], ['X-1', undefined]]);
    expect(setTimer).toHaveBeenCalledTimes(2);
    await cycle([]);
    expect(detect).toHaveBeenCalledTimes(2);
  });

  it('reports decoder-error after five consecutive rejections and recovers on a success', async () => {
    const { onStatus, cycle } = setup();
    const fail = new Error('decode failed');
    for (let i = 0; i < 4; i += 1) await cycle(fail);
    expect(onStatus).not.toHaveBeenCalled();
    await cycle([]);
    for (let i = 0; i < 4; i += 1) await cycle(fail);
    expect(onStatus).not.toHaveBeenCalled();
    await cycle(fail);
    expect(onStatus.mock.calls).toEqual([['decoder-error']]);
    await cycle(fail);
    expect(onStatus).toHaveBeenCalledTimes(1);
    await cycle([]);
    expect(onStatus).toHaveBeenLastCalledWith('scanning');
    for (let i = 0; i < 4; i += 1) await cycle(fail);
    expect(onStatus).toHaveBeenCalledTimes(2);
    await cycle(fail);
    expect(onStatus).toHaveBeenLastCalledWith('decoder-error');
  });

  it('fires nothing after stop', async () => {
    const { run, pending, onDetected, onStatus, loop, setTimer, clearTimer, queue } = setup();
    await run();
    loop.stop();
    pending.shift()!.resolve([{ rawValue: '12345678', format: 'ean_8' }]);
    await flush();
    expect(onDetected).not.toHaveBeenCalled();
    expect(setTimer).toHaveBeenCalledTimes(1);
    expect(queue).toHaveLength(0);

    const second = setup();
    for (let i = 0; i < 4; i += 1) await second.cycle(new Error('x'));
    await second.run();
    second.loop.stop();
    expect(second.clearTimer).not.toHaveBeenCalled();
    second.pending.shift()!.reject(new Error('x'));
    await flush();
    expect(second.onStatus).not.toHaveBeenCalled();
    const third = setup();
    third.loop.stop();
    expect(third.clearTimer).toHaveBeenCalledExactlyOnceWith(1);
    expect(clearTimer).not.toHaveBeenCalled();
    expect(onStatus).not.toHaveBeenCalled();
  });

  it('maps a getUserMedia error to a status', () => {
    expect(cameraErrorStatus(new DOMException('denied', 'NotAllowedError'))).toBe('camera-denied');
    expect(cameraErrorStatus({ name: 'NotAllowedError' })).toBe('camera-denied');
    expect(cameraErrorStatus(new DOMException('busy', 'NotReadableError'))).toBe('camera-unavailable');
    expect(cameraErrorStatus(new Error('nope'))).toBe('camera-unavailable');
    expect(cameraErrorStatus(null)).toBe('camera-unavailable');
  });
});
