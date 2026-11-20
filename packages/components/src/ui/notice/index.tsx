import * as React from 'react';
import { AccessibilityInfo, Platform, View } from 'react-native';
import { cn } from '@tallyui/theme';
import { Button } from '../button';
import { HStack } from '../hstack';
import { Text } from '../text';
import { VStack } from '../vstack';
import type { SvgIconProps } from '../icon/svg-icon';
import { AlertCircleIcon } from '../icon/alert-circle-icon';
import { AlertTriangleIcon } from '../icon/alert-triangle-icon';
import { InfoCircleIcon } from '../icon/info-circle-icon';

type NoticeAction = { label: string; onPress: () => void; testID?: string; primary?: boolean };
type NoticeProps = {
  tone: 'bad' | 'warning' | 'info';
  title: string;
  children?: React.ReactNode;
  actions?: readonly [NoticeAction] | readonly [NoticeAction, NoticeAction];
  /** The tone's glyph by default; `null` draws none. */
  icon?: React.ComponentType<SvgIconProps> | null;
  /** `false` makes a plain group, not a live region, for a band that holds controls. */
  live?: boolean;
  testID?: string; className?: string;
};

// As WCPOS v2's TONE[tone].band and glyph; a `primary` action's label is inked in the accent.
const TONES = {
  bad: { band: 'border-bad/45 bg-bad-bg', glyph: AlertCircleIcon },
  warning: { band: 'border-warning/45 bg-warning-bg', glyph: AlertTriangleIcon },
  info: { band: 'border-border bg-card', glyph: InfoCircleIcon },
} as const;

export function Notice({ tone, title, children, actions, icon, live = true, testID, className }: NoticeProps) {
  // iOS has no live region, so a bad band speaks its title once on mount there (as v2).
  const spoken = React.useRef(live && tone === 'bad' ? title : undefined);
  React.useEffect(() => {
    if (spoken.current && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(spoken.current);
  }, []);
  const Glyph = icon ?? TONES[tone].glyph;
  const id = (part: string) => (testID ? `${testID}-${part}` : undefined);
  return (
    <View
      testID={testID}
      role={!live ? 'group' : tone === 'bad' ? 'alert' : 'status'}
      aria-live={!live ? undefined : tone === 'bad' ? 'assertive' : 'polite'}
      className={cn('flex-row flex-wrap items-center gap-2 rounded-lg border px-3 py-2.5', TONES[tone].band, className)}
    >
      {icon !== null && <Glyph className="text-foreground" />}
      <VStack className="min-w-0 flex-1 basis-48">
        <Text testID={id('title')} className="text-foreground font-medium">{title}</Text>
        {children}
      </VStack>
      {actions && (
        <HStack className="flex-wrap gap-2">
          {actions.map((action, index) => (
            <Button key={index} variant="ghost" size="sm" className="h-auto min-h-9 py-1" testID={action.testID ?? id(`action-${index}`)} onPress={action.onPress}>
              <Text className={cn('web:whitespace-normal', action.primary && 'text-primary')}>{action.label}</Text>
            </Button>
          ))}
        </HStack>
      )}
    </View>
  );
}
export type { NoticeProps, NoticeAction };
