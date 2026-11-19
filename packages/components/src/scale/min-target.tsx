/**
 * Port of WCPOS v2 `packages/components/src/lib/min-target.tsx`: a transparent band the control token tall,
 * centred over a control drawn under it and overflowing it, out of layout, so the finger still gets the full
 * target while the control keeps its drawn size. Render it as the LAST child of the press target, so a touch on
 * it is the control's own.
 *
 * From v2: not `hitSlop`, because iOS (Fabric) hit-tests nothing outside a parent that no child overflows, and
 * React Native Web ignores `hitSlop` altogether; a real overflowing child is hit-tested on iOS and Android and is
 * part of the control's DOM on the web.
 * Also from v2: tall only by default, because sideways growth would take a neighbour's touches in a dense
 * strip; `square` grows it to the full target both ways, for a lone icon control with no neighbour within reach.
 *
 * TallyUI differences: it renders nothing unless the pointer is coarse, and its size is a style number (the
 * `--spacing-ctl` token, floored at the coarse pointer floor) rather than the `min-h-ctl` class, because
 * `scale.css` is opt-in.
 */
import { View } from 'react-native';
import { POINTER_FLOORS } from '@tallyui/theme';
import { usePointer } from './use-pointer';
import { useScale } from './scale-provider';

/** The band's size under a coarse pointer: 44 at Compact and Regular, 52 at Spacious. */
export function useMinTarget(): number {
  return Math.max(useScale().variables['--spacing-ctl'], POINTER_FLOORS.coarse);
}

export function MinTargetBand({ square = false }: { square?: boolean }) {
  const pointer = usePointer();
  const size = useMinTarget();
  if (pointer !== 'coarse') return null;
  return (
    <View testID="min-target-band" style={{ pointerEvents: 'box-none' }} className="absolute inset-0 items-center justify-center">
      <View className={square ? undefined : 'w-full'} style={square ? { minHeight: size, minWidth: size } : { minHeight: size }} />
    </View>
  );
}
