import { View, type ViewProps } from 'react-native';
import { cn } from '@tallyui/theme';
import { useScale } from '../../scale/scale-provider';

export type SkeletonProps = ViewProps & { shape?: 'block' | 'line' | 'row' | 'tile' | 'chip'; className?: string };

const shapes = {
  block: 'flex-1 w-full',
  line: 'h-5',
  row: 'w-full',
  tile: 'w-full',
  // A filter chip's own frame (v2 `Chip`: the control height, full radius).
  chip: 'w-24 rounded-full',
};

// TallyUI difference: row/tile/chip heights are style numbers from the scale, not v2's h-row/h-tile/h-ctl
// classes, because scale.css is opt-in (as ListRow, ui/list-row/index.tsx).
const heights = { row: '--spacing-row', tile: '--spacing-tile', chip: '--spacing-ctl' } as const;

/** WCPOS v2's Skeleton: a still, muted placeholder in the shape of what is coming. No pulse, no animation. */
export function Skeleton({ shape = 'block', className, style, ...props }: SkeletonProps) {
  const { variables } = useScale();
  const height = shape in heights ? variables[heights[shape as keyof typeof heights]] : undefined;
  return (
    <View {...props} style={[height === undefined ? null : { height }, style]}
      className={cn('bg-muted rounded-lg', shapes[shape], className)} aria-busy />
  );
}

export const SKELETON_MAX_ROWS = 12;

/** How many skeleton rows fill `extent` at `rowHeight` each: at least 1, at most SKELETON_MAX_ROWS (v2). */
export function skeletonCount(extent: number, rowHeight: number): number {
  if (!Number.isFinite(extent) || extent <= 0) return 1;
  if (!Number.isFinite(rowHeight) || rowHeight <= 0) return 1;
  return Math.min(SKELETON_MAX_ROWS, Math.max(1, Math.ceil(extent / rowHeight)));
}
