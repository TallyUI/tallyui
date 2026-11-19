import { Path } from 'react-native-svg';
import { createSvgIcon } from './svg-icon';

// Tabler info-circle (MIT), as WCPOS v2's tabler `info` glyph.
export const InfoCircleIcon = createSvgIcon('InfoCircleIcon', () => (
  <>
    <Path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0m9-3h.01" />
    <Path d="M11 12h1v4h1" />
  </>
));
