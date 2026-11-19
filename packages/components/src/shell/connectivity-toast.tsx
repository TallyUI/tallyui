// Port of WCPOS v2's OnlineStatusLogger and its toast (MIT, WCPOS): the settle rule and the three titles from
// packages/core/src/screens/main/components/online-status/online-status-logger.tsx, the description kept from the
// code's action hint as in packages/core/src/contexts/merchant-toast.ts, the text of SYNC121's actionHint in
// packages/utils/src/logger/error-registry.json, and the top-centre placement of apps/main/app/_layout.tsx:84.
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, View } from 'react-native';
import type { ConnectivityState } from '@tallyui/core';
import { cn } from '@tallyui/theme';
import { Toast, ToastClose, ToastDescription, ToastTitle } from '../ui/toast';

// v2's CONNECTIVITY_SETTLE_MS: a verdict that reverts inside it is a flap, not an outage.
const SETTLE_MS = 5_000;
// How long the toast stays; TallyUI's choice, v2's Toaster passes no duration of its own.
const VISIBLE_MS = 4_000;
// v2 SYNC121's action hint, shown under both warnings.
const DESCRIPTION = 'Nothing to do — keep selling. Changes send automatically when the connection returns.';

const TEXT: Record<ConnectivityState, { title: string; description?: string; warning: boolean }> = {
  offline: { title: 'Device went offline', description: DESCRIPTION, warning: true },
  degraded: { title: 'Website is unreachable', description: DESCRIPTION, warning: true },
  online: { title: 'Connection restored', warning: false },
};

export interface ConnectivityToastProps {
  /** The till's connectivity verdict, e.g. a `@tallyui/database` connectivity tracker's `state`. */
  state: ConnectivityState;
  testID?: string;
}

export function ConnectivityToast({ state, testID = 'connectivity-toast' }: ConnectivityToastProps) {
  const previous = useRef(state);
  const lastShown = useRef(state);
  const [shown, setShown] = useState<ConnectivityState | null>(null);

  useEffect(() => {
    if (state === previous.current) return;
    previous.current = state;
    const timer = setTimeout(() => {
      if (state === lastShown.current) return;
      lastShown.current = state;
      setShown(state);
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    if (shown === null) return;
    if (Platform.OS === 'ios') {
      const { title, description } = TEXT[shown];
      AccessibilityInfo.announceForAccessibility(description ? `${title} ${description}` : title);
    }
    const timer = setTimeout(() => setShown(null), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [shown]);

  if (shown === null) return null;
  const { title, description, warning } = TEXT[shown];
  return (
    <View pointerEvents="box-none" className="absolute inset-x-0 top-4 z-50 items-center px-4">
      <Toast testID={testID} accessibilityLiveRegion="polite" className={cn('max-w-sm', warning ? 'border-warning' : 'border-success')}>
        <View aria-hidden className={cn('absolute inset-0', warning ? 'bg-warning/15' : 'bg-success/15')} />
        <View className="flex-1 gap-1">
          <ToastTitle>{title}</ToastTitle>
          {description ? <ToastDescription>{description}</ToastDescription> : null}
        </View>
        <ToastClose accessibilityLabel="Close" onPress={() => setShown(null)} />
      </Toast>
    </View>
  );
}
