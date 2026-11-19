import { Path } from 'react-native-svg';
import { createSvgIcon } from './svg-icon';

// Tabler alert-triangle (MIT), as WCPOS v2's tabler `warning` glyph.
export const AlertTriangleIcon = createSvgIcon('AlertTriangleIcon', () => (
  <Path d="M12 9v4m-1.637-9.409L2.257 17.125a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636-2.87L13.637 3.59a1.914 1.914 0 0 0-3.274 0M12 16h.01" />
));
