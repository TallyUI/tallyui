import { Path } from 'react-native-svg';
import { createSvgIcon } from './svg-icon';

// Tabler alert-circle (MIT), as WCPOS v2's tabler `alert` glyph.
export const AlertCircleIcon = createSvgIcon('AlertCircleIcon', () => <Path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0m9-4v4m0 4h.01" />);
