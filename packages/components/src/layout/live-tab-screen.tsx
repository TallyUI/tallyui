import { Pressable, Text, View, type ViewProps } from 'react-native';

import { cn } from '@tallyui/theme';

/** Mirrors `LiveTabState` from `@tallyui/database`, without depending on that package. */
export type LiveTabScreenState = 'acquiring' | 'live' | 'parked' | 'blocked';

export interface LiveTabScreenProps extends Omit<ViewProps, 'children'> {
  state: LiveTabScreenState;
  /** Called when the parked screen's "Use here" button is pressed. */
  onUseHere: () => void;
  /** Called when the blocked screen's "Reload" button is pressed. */
  onReload: () => void;
  /** Title for both the parked and the blocked screen. */
  parkedTitle?: string;
  parkedBody?: string;
  useHereLabel?: string;
  blockedBody?: string;
  reloadLabel?: string;
  className?: string;
}

/**
 * ADR-061: what a tab shows once it is no longer the live one. Renders
 * nothing for `acquiring` and `live`.
 */
export function LiveTabScreen({
  state,
  onUseHere,
  onReload,
  parkedTitle = 'POS is open in another tab',
  parkedBody = 'This tab stopped so the other one can work. Use it here instead?',
  useHereLabel = 'Use here',
  blockedBody = 'The POS is open in another tab. Close that tab to use it here, or reload this one.',
  reloadLabel = 'Reload',
  className,
  ...viewProps
}: LiveTabScreenProps) {
  if (state !== 'parked' && state !== 'blocked') return null;

  const body = state === 'parked' ? parkedBody : blockedBody;
  const buttonLabel = state === 'parked' ? useHereLabel : reloadLabel;
  const onPress = state === 'parked' ? onUseHere : onReload;

  return (
    <View className={cn('flex-1 items-center justify-center gap-4 bg-bg p-6', className)} {...viewProps}>
      <Text className="text-center text-lg font-bold text-foreground">{parkedTitle}</Text>
      <Text className="text-center text-sm text-muted-foreground">{body}</Text>
      <Pressable onPress={onPress} className="items-center rounded-lg bg-primary px-4 py-3">
        <Text className="text-sm font-semibold text-primary-foreground">{buttonLabel}</Text>
      </Pressable>
    </View>
  );
}
