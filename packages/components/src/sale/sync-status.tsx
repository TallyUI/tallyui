import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, Text, View } from 'react-native';
import type { SyncNotice } from '@tallyui/core';
import type { OutboxState } from '@tallyui/pos';

/**
 * What the cashier reads when the product pull stops, keyed by the notice's code; the code itself is never shown.
 * Every detail starts "You can keep selling." `software`, `minVersion` and `fix` come from the notice, so the
 * component never names a backend or a version itself.
 */
type PullNoticeText = { line: (pluginName: string) => string; detail: (notice: SyncNotice, pluginName: string) => string };
const PULL_NOTICE_TEXT: Record<string, PullNoticeText> = {
  unauthorized: {
    line: () => "Products aren't updating: this till needs to sign in to the online store again.",
    detail: () => 'You can keep selling. Products, prices and stock stay as they were until someone signs in again.',
  },
  unsupported_store: {
    line: () => "Products aren't updating: the online store needs a software update.",
    detail: ({ software, minVersion }) => software && minVersion
      ? `You can keep selling. Ask the store owner to update ${software} to version ${minVersion} or later.`
      : "You can keep selling. Ask the store owner to update the store's software.",
  },
  missing_plugin: {
    line: (pluginName) => `Products aren't updating: the online store is missing ${pluginName}.`,
    detail: (_notice, pluginName) => `You can keep selling. This till couldn't find ${pluginName} on the online store. `
      + "Ask the store owner to check that it is installed and switched on, and that the store address in this till's settings is right.",
  },
  store_misconfigured: {
    line: () => "Products aren't updating: a setting on the online store needs changing.",
    detail: ({ fix }) => fix ? `You can keep selling. Ask the store owner to ${fix}.`
      : "You can keep selling. Ask the store owner to check the store's settings.",
  },
};
const PULL_NOTICE_FALLBACK: PullNoticeText = {
  line: () => "Products aren't updating.",
  detail: () => 'You can keep selling. Products, prices and stock stay as they were. '
    + 'Restart the app; if it keeps happening, tell the store owner.',
};

// The line the cashier reads while the store keeps answering 404 (OutboxState.backendMissing) and no order is stuck.
const BACKEND_MISSING = "Sales aren't reaching the online store. Keep selling: they're saved on this till and will send by themselves.";
// The same line once an order is stuck, with the store missing or not; {time} becomes stuck.since.
const BACKEND_MISSING_SINCE = "Sales haven't reached the online store since {time}. Keep selling: they're saved on this till and will send by themselves.";
// The line instead when no sale waits but till updates do, and its "since" variant once registerState.stuck is set.
const TILL_UPDATES_MISSING = "Till updates aren't reaching the online store. Keep selling: they're saved on this till and will send by themselves.";
const TILL_UPDATES_MISSING_SINCE = "Till updates haven't reached the online store since {time}. Keep selling: they're saved on this till and will send by themselves.";
// The detail below it; {pluginName} becomes the pluginName prop. With nothing waiting (store missing or not) the line is only
// "Sales are up to date.", and here {lastTime} is set.
const BACKEND_MISSING_DETAIL = "This till couldn't find {pluginName} on the online store{lastTime}. Ask the store owner to check that it is installed "
  + "and switched on, and that the store address in this till's settings is right.";

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;
// iOS has no live region (accessibilityLiveRegion is Android-only), so there each text is announced when it changes: never on
// the first mount, nor on a re-render with the same text. Texts that change in the same render go in ONE call, joined by a space.
function useAnnounceOnIos(...texts: (string | undefined)[]) {
  const announced = useRef(texts);
  useEffect(() => {
    const changed = texts.filter((text, index) => text && text !== announced.current[index]);
    announced.current = texts;
    if (changed.length > 0 && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(changed.join(' '));
  }, texts);
}
/**
 * `pluginName` names the store's plugin in the detail, as its owners know it; `registerState` counts till updates.
 * `pullNotice` (a stopped product pull) shows as its own line and detail, above the outbox line.
 */
export function SyncStatus({ state, registerState, pluginName = 'the POS plugin', pullNotice }:
  { state: OutboxState; registerState?: OutboxState; pluginName?: string; pullNotice?: SyncNotice }) {
  const updates = registerState?.pending ?? 0;
  // The outbox whose sending and retrying text is shown (and whose countdown ticks): the register's when only till updates wait.
  const outbox = state.pending === 0 && registerState?.pending ? registerState : state;
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    if (!outbox.nextAttemptAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [outbox.nextAttemptAt]);
  const seconds = Math.max(0, Math.ceil(((outbox.nextAttemptAt ?? now) - now) / 1000));
  const label = [state.pending && count(state.pending, 'sale'),
    updates && count(updates, 'till update')].filter(Boolean).join(' and ') + ' waiting to sync';
  const { stuck } = state;
  const backendMissing = state.backendMissing ?? registerState?.backendMissing;
  // The device's own 12/24-hour format, with no forced leading zero on the hour.
  const at = (time: number) => new Date(time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const backendMissingText = state.pending === 0 && updates > 0 ? (registerState?.stuck
    ? TILL_UPDATES_MISSING_SINCE.replace('{time}', () => at(registerState.stuck!.since)) : TILL_UPDATES_MISSING)
    : stuck ? BACKEND_MISSING_SINCE.replace('{time}', () => at(stuck.since)) : BACKEND_MISSING;
  const upToDate = state.pending === 0 && updates === 0;
  // The sentence shows with the store missing, or once the waiting sales (with none waiting, the till updates) are stuck, then as
  // its "since" variant: the same words for any reason, and no reason code.
  const sentence = backendMissing || (state.pending === 0 && updates > 0 ? registerState?.stuck : stuck) ? ` · ${backendMissingText}` : '';
  // The live region holds only the substance (counts and the sentence), so it is announced when that changes and never as sending
  // or retrying flips or the countdown ticks: those are a short line of their own below it, outside any live region.
  const spoken = upToDate ? 'Sales are up to date.' : label + sentence;
  const doing = upToDate || backendMissing ? '' : outbox.sending ? 'Sending…'
    : outbox.lastRetryReason ? `Retrying in ${seconds} s.` : '';
  const text = pullNotice
    && (Object.hasOwn(PULL_NOTICE_TEXT, pullNotice.code) ? PULL_NOTICE_TEXT[pullNotice.code] : PULL_NOTICE_FALLBACK);
  const notice = pullNotice && text
    && { line: text.line(pluginName), detail: text.detail(pullNotice, pluginName) };
  useAnnounceOnIos(notice?.line, spoken);
  // Both notices name the missing plugin: both lines show, and the pull notice's detail once, below them, in place of the outbox's.
  const oneDetail = pullNotice?.code === 'missing_plugin' && !!backendMissing;
  // The notice lines carry no accessibility label, so a screen reader reads their text; the outbox line's label is its spoken text.
  // The notice line and the outbox line are polite live regions (react-native-web renders accessibilityLiveRegion as aria-live);
  // the details are not: each line says what changed, and its detail is there to read.
  return <View>{notice ? <>
    <Text accessibilityLiveRegion="polite" className="px-4 py-2 text-xs text-muted-foreground">{notice.line}</Text>
    {oneDetail ? null : <Text className="px-4 pb-2 text-xs text-muted-foreground">{notice.detail}</Text>}
  </> : null}<Text accessibilityLabel={spoken} accessibilityLiveRegion="polite" className="px-4 py-2 text-xs text-muted-foreground">{spoken}</Text>
  {doing ? <Text className="px-4 pb-2 text-xs text-muted-foreground">{doing}</Text> : null}
  {oneDetail && notice ? <Text className="px-4 pb-2 text-xs text-muted-foreground">{notice.detail}</Text>
    : backendMissing ? <Text className="px-4 pb-2 text-xs text-muted-foreground">
    {BACKEND_MISSING_DETAIL.replace('{pluginName}', () => pluginName).replace('{lastTime}', () => upToDate ? ' the last time it checked' : '')}</Text> : null}</View>;
}
