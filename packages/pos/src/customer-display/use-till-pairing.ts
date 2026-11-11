import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { TillDisplayService, TillDisplayEntry, TillDisplayStatus } from './till-display-service';
import type { PairingError, PairingPhase, TillPairing } from './till-pairing';

export interface TillPairingView { phase: PairingPhase; forgetError: PairingError | null }
export interface TillDisplaysView { status: TillDisplayStatus; displays: readonly TillDisplayEntry[] }

const NO_PAIRING: TillPairingView = { phase: { phase: 'idle' }, forgetError: null };
const NO_DISPLAYS: TillDisplaysView = { status: 'closed', displays: [] };

/** A store over `source.onChange` whose snapshot is a new object only when one of its parts changed. */
function useView<S extends { onChange(listener: () => void): () => void }, V extends object>(
  source: S | null, empty: V, read: (source: S) => V,
): V {
  const held = useRef<V | null>(null);
  const subscribe = useCallback((listener: () => void) => source?.onChange(listener) ?? (() => {}), [source]);
  const snapshot = () => {
    if (!source) return empty;
    const next = read(source);
    const last = held.current;
    if (!last || (Object.keys(next) as Array<keyof V>).some((key) => last[key] !== next[key])) held.current = next;
    return held.current as V;
  };
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** The till pairing's phase and last forget refusal, re-rendered on each change; null gives idle. */
export function useTillPairing(pairing: TillPairing | null): TillPairingView {
  return useView(pairing, NO_PAIRING, (p) => ({ phase: p.phase, forgetError: p.forgetError }));
}

/** The till display service's status and displays, re-rendered on each change; null gives `closed` with none. */
export function useTillDisplays(service: TillDisplayService | null): TillDisplaysView {
  return useView(service, NO_DISPLAYS, (s) => ({ status: s.status, displays: s.displays }));
}
