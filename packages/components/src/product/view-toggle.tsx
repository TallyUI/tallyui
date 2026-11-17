import type { JSX } from 'react';
import { Pressable, Text, View, type ViewProps } from 'react-native';
import { cn } from '@tallyui/theme';
import type { CatalogueView } from '@tallyui/pos';
import { MinTargetBand } from '../scale/min-target';
import { IconButton } from '../ui/icon-button';
import { ViewGridIcon } from '../ui/icon/view-grid-icon';
import { ViewListIcon } from '../ui/icon/view-list-icon';
import { Text as UiText } from '../ui/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

export interface ViewToggleProps extends Omit<ViewProps, 'children'> {
  value: CatalogueView;
  onChange: (view: CatalogueView) => void;
  /** Default { grid: 'Grid', table: 'Table' }. In the icon form the label names the view a press switches to,
   *  default "Switch to grid view" / "Switch to table view". */
  labels?: { grid?: string; table?: string };
  className?: string;
  /** 'segments' (default): the Grid/Table radio pair. 'icon': v2's single view-mode button
   *  (pos/products/view-mode-toggle.tsx), one press switches to the other view. */
  variant?: 'segments' | 'icon';
}

export function ViewToggle({ value, onChange, labels, className, variant, ...viewProps }: ViewToggleProps): JSX.Element {
  if (variant === 'icon') {
    const next = value === 'table' ? 'grid' : 'table';
    const label = labels?.[next] ?? (next === 'grid' ? 'Switch to grid view' : 'Switch to table view');
    return (
      <View {...viewProps} testID="view-toggle" className={cn('self-start', className)}>
        <Tooltip>
          <TooltipTrigger asChild>
            <IconButton variant="ghost" testID={`view-toggle-${next}`} accessibilityLabel={label} onPress={() => onChange(next)}>
              <View className="text-foreground">{value === 'table' ? <ViewGridIcon size={20} /> : <ViewListIcon size={20} />}</View>
              <MinTargetBand square />
            </IconButton>
          </TooltipTrigger>
          <TooltipContent><UiText>{label}</UiText></TooltipContent>
        </Tooltip>
      </View>
    );
  }
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
