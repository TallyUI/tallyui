import type { JSX } from 'react';
import { Pressable, Text, View, type ViewProps } from 'react-native';
import { cn } from '@tallyui/theme';
import type { CatalogueView } from '@tallyui/pos';

export interface ViewToggleProps extends Omit<ViewProps, 'children'> {
  value: CatalogueView;
  onChange: (view: CatalogueView) => void;
  /** Default { grid: 'Grid', table: 'Table' }. */
  labels?: { grid?: string; table?: string };
  className?: string;
}

export function ViewToggle({ value, onChange, labels, className, ...viewProps }: ViewToggleProps): JSX.Element {
  return (
    <View {...viewProps} role="radiogroup" accessibilityLabel="View" testID="view-toggle"
      className={cn('flex-row self-start overflow-hidden rounded-md border border-border', className)}>
      {(['grid', 'table'] as const).map((view) => {
        const selected = value === view;
        const label = labels?.[view] ?? (view === 'grid' ? 'Grid' : 'Table');
        return (
          <Pressable key={view} role="radio" aria-checked={selected} testID={`view-toggle-${view}`}
            accessibilityLabel={label} onPress={() => { if (!selected) onChange(view); }}
            className={cn('px-3 py-2', selected ? 'bg-primary' : 'bg-card')}>
            <Text className={cn('text-sm font-medium', selected ? 'text-primary-foreground' : 'text-foreground')}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
