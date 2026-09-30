import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import type { OutboxState } from '@tallyui/pos';

// The line the cashier reads while the store keeps answering 404 (OutboxState.backendMissing) and no order is stuck.
const BACKEND_MISSING = "Sales aren't reaching the online store. Keep selling: they're saved on this till and will send by themselves.";
// The same line once an order is stuck, in place of the stuck text; {time} becomes stuck.since.
const BACKEND_MISSING_SINCE = "Sales haven't reached the online store since {time}. Keep selling: they're saved on this till and will send by themselves.";
// The detail below it, for whoever looks into it; {pluginName} becomes the pluginName prop.
const BACKEND_MISSING_DETAIL = "The store didn't recognise this till. Ask the store owner to check that {pluginName} is installed "
  + "and switched on, and that the store address in this till's settings is right.";

/** `pluginName` names the store's plugin in the backend-missing detail, as the app's store owners know it. */
export function SyncStatus({ state, pluginName = 'the POS plugin' }: { state: OutboxState; pluginName?: string }) {
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
  // The device's own 12/24-hour format, with no forced leading zero on the hour.
  const at = (time: number) => new Date(time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const backendMissingText = stuck ? BACKEND_MISSING_SINCE.replace('{time}', at(stuck.since)) : BACKEND_MISSING;
  const stuckText = !stuck || state.backendMissing ? ''
    : ` · Not syncing ${stuck.commandIds.length} order${stuck.commandIds.length === 1 ? '' : 's'}: `
      + (stuck.reason === 'timeout' ? 'no answer from the store' : 'the store keeps failing') + ` (${stuck.reason}) since ${at(stuck.since)}`;
  return <View><Text accessibilityLabel="Sync status" className="px-4 py-2 text-xs text-muted-foreground">
    {label}{state.backendMissing ? ` · ${backendMissingText}` : state.sending ? ' · sending' : state.lastRetryReason
      ? ` · retrying (${state.lastRetryReason}) in ${seconds}s` : ''}
    {stuckText}
  </Text>
  {state.backendMissing ? <Text className="px-4 pb-2 text-xs text-muted-foreground">
    {BACKEND_MISSING_DETAIL.replace('{pluginName}', pluginName)}</Text> : null}</View>;
}
