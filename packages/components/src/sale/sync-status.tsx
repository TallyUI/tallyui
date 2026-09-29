import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import type { OutboxState } from '@tallyui/pos';

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
    {label}{state.sending ? ' · sending' : state.lastRetryReason
      ? ` · retrying (${state.lastRetryReason}) in ${seconds}s` : ''}
    {stuck ? ` · Not syncing ${stuck.commandIds.length} order${stuck.commandIds.length === 1 ? '' : 's'}: the store keeps failing`
      + ` (${stuck.reason}) since ${new Date(stuck.since).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : ''}
  </Text>;
}
