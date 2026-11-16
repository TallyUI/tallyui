import type { JSX } from 'react';
import { Pressable, Text, View, type ViewProps } from 'react-native';
import { cn } from '@tallyui/theme';
import type { CatalogueView } from '@tallyui/pos';
import { MinTargetBand } from '../scale/min-target';

export interface ViewToggleProps extends Omit<ViewProps, 'children'> {
  value: CatalogueView;
  onChange: (view: CatalogueView) => void;
  /** Default { grid: 'Grid', table: 'Table' }. */
  labels?: { grid?: string; table?: string };
  className?: string;
}

export function ViewToggle({ value, onChange, labels, className, ...viewProps }: ViewToggleProps): JSX.Element {
  // No overflow-hidden, which would clip each segment's band: the end segments round their own outer corners.
  return (
    <View {...viewProps} role="radiogroup" accessibilityLabel="View" testID="view-toggle"
      className={cn('flex-row self-start rounded-md border border-border', className)}>
      {(['grid', 'table'] as const).map((view) => {
        const selected = value === view;
        const label = labels?.[view] ?? (view === 'grid' ? 'Grid' : 'Table');
        return (
          <Pressable key={view} role="radio" aria-checked={selected} testID={`view-toggle-${view}`}
            accessibilityLabel={label} onPress={() => { if (!selected) onChange(view); }}
            className={cn('px-3 py-2', view === 'grid' ? 'rounded-l-md' : 'rounded-r-md', selected ? 'bg-primary' : 'bg-card')}>
            <Text className={cn('text-sm font-medium', selected ? 'text-primary-foreground' : 'text-foreground')}>{label}</Text>
            <MinTargetBand />
          </Pressable>
        );
      })}
    </View>
  );
}
