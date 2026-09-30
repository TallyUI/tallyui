import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import type { SyncNotice } from '@tallyui/core';
import type { OutboxState } from '@tallyui/pos';

/** What the cashier reads when the catalogue pull stops, keyed by the notice's code; the code itself is never shown. */
const PULL_NOTICE_TEXT: Record<string, { line: string; detail: string }> = {
  unauthorized: { line: "The catalogue isn't updating: this till needs to sign in to the store again.",
    detail: 'Products, prices and stock stay as they were until someone signs in again.' },
  unsupported_store: { line: "The catalogue isn't updating: the store needs a software update.",
    detail: 'The store owner needs to update WooCommerce to version 5.8 or later.' },
};
const PULL_NOTICE_FALLBACK = { line: "The catalogue isn't updating.",
  detail: 'Products, prices and stock stay as they were. Restart the app; if it keeps happening, contact the store owner.' };

export function SyncStatus({ state, pullNotice }: { state: OutboxState; pullNotice?: SyncNotice }) {
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
  const notice = pullNotice
    && (Object.hasOwn(PULL_NOTICE_TEXT, pullNotice.code) ? PULL_NOTICE_TEXT[pullNotice.code] : PULL_NOTICE_FALLBACK);
  return <>{notice ? <>
    <Text accessibilityLabel="Catalogue status" className="px-4 pt-2 text-xs text-muted-foreground">{notice.line}</Text>
    <Text accessibilityLabel="Catalogue status detail" className="px-4 text-[10px] text-muted-foreground">{notice.detail}</Text>
  </> : null}<Text accessibilityLabel="Sync status" className="px-4 py-2 text-xs text-muted-foreground">
    {label}{state.sending ? ' · sending' : state.lastRetryReason
      ? ` · retrying (${state.lastRetryReason}) in ${seconds}s` : ''}
    {stuck ? ` · Not syncing ${stuck.commandIds.length} order${stuck.commandIds.length === 1 ? '' : 's'}: `
      + (stuck.reason === 'timeout' ? 'no answer from the store' : 'the store keeps failing')
      + ` (${stuck.reason}) since ${new Date(stuck.since).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : ''}
  </Text></>;
}
