import { Circle, Path } from 'react-native-svg';
import { createSvgIcon } from './svg-icon';

// Lucide map-pin (ISC), the glyph of WCPOS v2's `address` icon
export const MapPinIcon = createSvgIcon('MapPinIcon', () => (
  <>
    <Path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
    <Circle cx={12} cy={10} r={3} />
  </>
));
