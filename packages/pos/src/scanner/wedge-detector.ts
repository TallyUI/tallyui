// Ported from WCPOS v2 packages/scanner/src/wedge-detector.ts (monorepo 85ecbd43f) (meta only).
/** The wedge detector distinguishes scanner bursts from typing using a folded
 * running average of inter-key gaps. Live and replay paths share the reducer. */
export interface WedgeSettings {
  /** Folded-average gap (ms) below which input latches as a scan. */
  threshold: number;
  /** Stripped only when it equals the first key. */
  prefix: string;
  /** Stripped only when it equals the last key. */
  suffix: string;
}

/** v2 store defaults: threshold 24 ms (stores.ts barcode_scanning_avg_time_input_threshold), no prefix/suffix. */
export const DEFAULT_WEDGE_SETTINGS: WedgeSettings = { threshold: 24, prefix: '', suffix: '' };
/** v2 store default barcode_scanning_min_chars. */
export const DEFAULT_MIN_SCAN_CHARS = 8;
/** End-of-scan settle: a burst is complete this long after its last key. */
export const WEDGE_END_OF_SCAN_MS = 150;

export interface WedgeState {
  avg: number;
  detecting: boolean;
  stack: string[];
  lastTimeMs: number | null;
  /** Time of the first key of the current burst's stack. */
  startedAtMs: number | null;
  /** An Enter/Tab arrived during the burst — the signature of a scanner terminator. */
  sawTerminator: boolean;
}

export function createWedgeState(): WedgeState {
  return { avg: 0, detecting: false, stack: [], lastTimeMs: null, startedAtMs: null, sawTerminator: false };
}

/** Fold one key, mutating and returning state. Kept bug-for-bug with v2:
 * only length-1 keys advance timing; the first gap is +Infinity; the average
 * folds as (avg + gap) / 2. Scanning latches below threshold for the burst;
 * a slow key outside a burst resets the average and restarts the stack. */
export function foldWedgeKey(state: WedgeState, key: string, timeMs: number, threshold: number): WedgeState {
  if (key.length !== 1) return state;
  let gap = Number.POSITIVE_INFINITY;
  if (state.lastTimeMs !== null) gap = timeMs - state.lastTimeMs;
  state.avg = state.avg === 0 ? gap : (state.avg + gap) / 2;
  if (state.detecting || state.avg < threshold) {
    state.detecting = true;
    state.stack.push(key);
  } else {
    state.avg = 0;
    state.stack = [key];
  }
  if (state.stack.length === 1) state.startedAtMs = timeMs;
  state.lastTimeMs = timeMs;
  return state;
}

/** Strip a configured prefix/suffix only when it equals the single key at
 * that edge of the stack — never as a substring. */
export function stripBoundary(stack: string[], settings: WedgeSettings): string {
  const inputStack = [...stack];
  if (settings.prefix && inputStack[0] === settings.prefix) inputStack.shift();
  if (settings.suffix && inputStack[inputStack.length - 1] === settings.suffix) inputStack.pop();
  return inputStack.join('');
}

export interface TraceKey { key: string; timeMs: number; }
export interface WedgeReplayResult {
  /** Whether the detector would latch onto this trace as a scan. */
  detectedAsScan: boolean;
  /** The barcode the detector would emit, with prefix/suffix stripped. */
  code: string;
}

/** Replay the detector over a completed keystroke trace. */
export function replayWedgeDetector(keys: TraceKey[], settings: WedgeSettings): WedgeReplayResult {
  const state = createWedgeState();
  for (const entry of keys) foldWedgeKey(state, entry.key, entry.timeMs, settings.threshold);
  if (!state.detecting) return { detectedAsScan: false, code: '' };
  return { detectedAsScan: true, code: stripBoundary(state.stack, settings) };
}

export interface WedgeScanMeta {
  /** The burst ended with an Enter/Tab terminator — scanners send one, typists rarely do. */
  terminated: boolean;
  /** When the burst's first key arrived (the detector's clock): the physical scan time.
   * The emit itself is WEDGE_END_OF_SCAN_MS after the LAST key. */
  startedAtMs: number;
}

export interface WedgeDetectorOptions {
  /** Read current settings per keystroke so live changes apply. */
  getSettings: () => WedgeSettings;
  /** A completed burst, prefix/suffix already stripped. */
  onScan: (code: string, meta: WedgeScanMeta) => void;
  /** Injectable clock/timers so hosts and tests control time. */
  now?: () => number;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
}
export interface WedgeDetector {
  /** True for a latched burst key: the host must prevent its default action. */
  handleKey: (key: string, timeMs?: number) => boolean;
  /** Cancel any pending end-of-scan timer on host teardown. */
  dispose: () => void;
}

/** Stream keys through the reducer, emitting after the settle window and
 * once the quiet period exceeds the threshold, mirroring the original hook. */
export function createWedgeDetector(options: WedgeDetectorOptions): WedgeDetector {
  const now = options.now ?? Date.now;
  const schedule = options.setTimeout ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const cancel = options.clearTimeout ?? ((handle: unknown) => clearTimeout(handle as never));
  let state = createWedgeState();
  let timer: unknown = null;
  const clearTimer = () => {
    if (timer !== null) {
      cancel(timer);
      timer = null;
    }
  };
  const handleKey = (key: string, timeMs?: number) => {
    const time = timeMs ?? now();
    const sinceLastMs = state.lastTimeMs === null ? Number.POSITIVE_INFINITY : time - state.lastTimeMs;
    if (key.length !== 1) {
      const inBurst = state.detecting && sinceLastMs <= WEDGE_END_OF_SCAN_MS;
      // Non-printable keys never advance the burst, but an Enter/Tab landing
      // inside one is the scanner-terminator signature — remember it so the
      // emit can tell a real (mis-configured) scan from fast typing.
      if ((key === 'Enter' || key === 'Tab') && inBurst) {
        state.sawTerminator = true;
        return true;
      }
      return false;
    }
    const settings = options.getSettings();
    foldWedgeKey(state, key, time, settings.threshold);
    if (!state.detecting) return false;
    clearTimer();
    function settle() {
      timer = null;
      const current = options.getSettings();
      if (state.detecting && now() - (state.lastTimeMs || 0) > current.threshold) {
        const code = stripBoundary(state.stack, current);
        const terminated = state.sawTerminator;
        const startedAtMs = state.startedAtMs;
        // Reset for the next burst, deliberately keeping lastTimeMs.
        const lastTimeMs = state.lastTimeMs;
        state = createWedgeState();
        state.lastTimeMs = lastTimeMs;
        options.onScan(code, { terminated, startedAtMs: startedAtMs ?? now() });
      } else if (state.detecting) {
        // A threshold at or above the settle window must not latch forever.
        timer = schedule(settle, WEDGE_END_OF_SCAN_MS);
      }
    }
    timer = schedule(settle, WEDGE_END_OF_SCAN_MS);
    return state.detecting && sinceLastMs <= WEDGE_END_OF_SCAN_MS;
  };
  return { handleKey, dispose: clearTimer };
}
