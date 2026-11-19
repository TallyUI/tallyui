import { Platform, type View } from 'react-native';
import type { LayoutPosition } from './use-relative-position';

// On web, react-native-web's `measure()` sums offsetLeft/offsetTop along the
// offsetParent chain, which leave out CSS transforms (a centred Dialog's -50%
// translate), while `measureInWindow()` uses getBoundingClientRect
// (react-native-web/dist/exports/UIManager/index.js).
export function measureTrigger(node: View | null, onMeasure: (position: LayoutPosition) => void): void {
  if (Platform.OS === 'web') {
    node?.measureInWindow?.((x, y, width, height) => onMeasure({ pageX: x, pageY: y, width, height }));
    return;
  }
  node?.measure?.((_x, _y, width, height, pageX, pageY) => onMeasure({ pageX, pageY, width, height }));
}
