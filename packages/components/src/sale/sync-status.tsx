import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import type { OutboxState } from '@tallyui/pos';

// The line the cashier reads while the store keeps answering 404 (OutboxState.backendMissing) and no order is stuck.
const BACKEND_MISSING = "Sales aren't reaching the online store. Keep selling: they're saved on this till and will send by themselves.";
// The same line once an order is stuck, in place of the stuck text; {time} becomes stuck.since.
const BACKEND_MISSING_SINCE = "Sales haven't reached the online store since {time}. Keep selling: they're saved on this till and will send by themselves.";
// The line instead when no sale waits but till updates do; the register outbox has no stuck clock, so no "since" variant.
const TILL_UPDATES_MISSING = "Till updates aren't reaching the online store. Keep selling: they're saved on this till and will send by themselves.";
// The detail below it, for whoever looks into it; {pluginName} becomes the pluginName prop.
const BACKEND_MISSING_DETAIL = "This till couldn't find {pluginName} on the online store. Ask the store owner to check that it is installed "
  + "and switched on, and that the store address in this till's settings is right.";

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;
/** `pluginName` names the store's plugin in the detail, as its owners know it; `registerState` counts till updates. */
export function SyncStatus({ state, registerState, pluginName = 'the POS plugin' }: { state: OutboxState; registerState?: OutboxState; pluginName?: string }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    if (!state.nextAttemptAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [state.nextAttemptAt]);
  const seconds = Math.max(0, Math.ceil(((state.nextAttemptAt ?? now) - now) / 1000));
  const updates = registerState?.pending ?? 0;
  const label = state.pending === 0 && updates === 0 ? 'All sales synced' : [state.pending && count(state.pending, 'sale'),
    updates && count(updates, 'till update')].filter(Boolean).join(' and ') + ' waiting to sync';
  const { stuck } = state;
  const backendMissing = state.backendMissing ?? registerState?.backendMissing;
  // The device's own 12/24-hour format, with no forced leading zero on the hour.
  const at = (time: number) => new Date(time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const backendMissingText = state.pending === 0 && updates > 0 ? TILL_UPDATES_MISSING
    : stuck ? BACKEND_MISSING_SINCE.replace('{time}', at(stuck.since)) : BACKEND_MISSING;
  const stuckText = !stuck || backendMissing ? ''
    : ` · Not syncing ${stuck.commandIds.length} order${stuck.commandIds.length === 1 ? '' : 's'}: `
      + (stuck.reason === 'timeout' ? 'no answer from the store' : 'the store keeps failing') + ` (${stuck.reason}) since ${at(stuck.since)}`;
  const line = label + (backendMissing ? ` · ${backendMissingText}` : state.sending ? ' · sending' : state.lastRetryReason
    ? ` · retrying (${state.lastRetryReason}) in ${seconds}s` : '') + stuckText;
  return <View><Text accessibilityLabel={line} className="px-4 py-2 text-xs text-muted-foreground">{line}</Text>
  {backendMissing ? <Text className="px-4 pb-2 text-xs text-muted-foreground">
    {BACKEND_MISSING_DETAIL.replace('{pluginName}', pluginName)}</Text> : null}</View>;
}
