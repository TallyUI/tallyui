import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import type { OutboxState } from '@tallyui/pos';

// Shown instead of the raw retry reason while the store keeps answering 404 (OutboxState.backendMissing).
const BACKEND_MISSING = "Can't find TallyUI on the store. The store address may be wrong, or its TallyUI plugin isn't installed. "
  + "Sales stay safe on this till and will send once it's fixed.";

export function SyncStatus({ state }: { state: OutboxState }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    if (!state.nextAttemptAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [state.nextAttemptAt]);
  const seconds = Math.max(0, Math.ceil(((state.nextAttemptAt ?? now) - now) / 1000));
  const label = state.pending === 0 ? 'All sales synced'
    : `${state.pending} sale${state.pending === 1 ? '' : 's'} waiting to sync`;
  const { stuck } = state;
  return <Text accessibilityLabel="Sync status" className="px-4 py-2 text-xs text-muted-foreground">
    {label}{state.backendMissing ? ` · ${BACKEND_MISSING}` : state.sending ? ' · sending' : state.lastRetryReason
      ? ` · retrying (${state.lastRetryReason}) in ${seconds}s` : ''}
    {stuck ? ` · Not syncing ${stuck.commandIds.length} order${stuck.commandIds.length === 1 ? '' : 's'}: `
      + (stuck.reason === 'timeout' ? 'no answer from the store' : 'the store keeps failing')
      + ` (${stuck.reason}) since ${new Date(stuck.since).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : ''}
  </Text>;
}
