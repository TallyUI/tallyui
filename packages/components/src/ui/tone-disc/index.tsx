import type * as React from 'react';
import { View } from 'react-native';
import { cn } from '@tallyui/theme';
import type { SvgIconProps } from '../icon/svg-icon';
import { CheckIcon } from '../icon/check-icon';
import { AlertTriangleIcon } from '../icon/alert-triangle-icon';
import { AlertCircleIcon } from '../icon/alert-circle-icon';
import { InfoCircleIcon } from '../icon/info-circle-icon';

type Tone = 'ok' | 'warning' | 'bad' | 'info' | 'muted';
type ToneDiscProps = {
  tone: Tone;
  /** Overrides the tone's glyph; any `createSvgIcon` glyph. */
  icon?: React.ComponentType<SvgIconProps>;
  size?: 'sm' | 'default' | 'lg';
  testID?: string;
};

const TONES = {
  ok: { disc: 'bg-ok-bg', text: 'text-ok', glyph: CheckIcon },
  warning: { disc: 'bg-warning-bg', text: 'text-warning-text', glyph: AlertTriangleIcon },
  bad: { disc: 'bg-bad-bg', text: 'text-bad', glyph: AlertCircleIcon },
  info: { disc: 'bg-info/15', text: 'text-info', glyph: InfoCircleIcon },
  muted: { disc: 'bg-muted', text: 'text-muted-foreground', glyph: InfoCircleIcon },
} as const;
const SIZES = { sm: { disc: 'size-11', glyph: 18 }, default: { disc: 'size-14', glyph: 28 }, lg: { disc: 'size-24', glyph: 36 } } as const;

// As WCPOS v2: the tone lives on the disc (its wash and its glyph).
// One scale: 44 beside a sheet's title, 56 a gate or finished setup, 96 the paid stamp.
export function ToneDisc({ tone: name, icon, size: sizeName = 'default', testID }: ToneDiscProps) {
  const tone = TONES[name];
  const size = SIZES[sizeName];
  const Glyph = icon ?? tone.glyph;
  return (
    <View testID={testID} className={cn('items-center justify-center rounded-full', size.disc, tone.disc, tone.text)}>
      <Glyph size={size.glyph} strokeWidth={1.5} />
    </View>
  );
}

export type { ToneDiscProps, Tone as ToneDiscTone };
