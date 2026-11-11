import { useCallback, useSyncExternalStore } from 'react';
import type { DisplayClient, DisplayClientPhase } from './display-client';
import { initialDisplayState, type DisplayState } from './display-state';

export interface DisplayClientView { phase: DisplayClientPhase; state: DisplayState }

const STARTING: DisplayClientView = { phase: { phase: 'starting' }, state: initialDisplayState };
// The last view handed out per client, so the hook returns the same object until the client changes.
const views = new WeakMap<DisplayClient, DisplayClientView>();
const noSubscription = () => () => {};

function viewOf(client: DisplayClient): DisplayClientView {
  const last = views.get(client);
  if (last && last.phase === client.phase && last.state === client.state) return last;
  const view = { phase: client.phase, state: client.state };
  views.set(client, view);
  return view;
}

/** The display client's phase and screen state for React; a null client is `starting`. */
export function useDisplayClient(client: DisplayClient | null): DisplayClientView {
  const subscribe = useCallback((listener: () => void) => (client ? client.onChange(listener) : noSubscription()), [client]);
  const getSnapshot = useCallback(() => (client ? viewOf(client) : STARTING), [client]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
