import { Path } from 'react-native-svg';
import { createSvgIcon } from './svg-icon';

// Tabler map-pin (MIT): the glyph of WCPOS v2's `address` icon in its default (Tabler) set.
export const MapPinIcon = createSvgIcon('MapPinIcon', () => (
  <>
    <Path d="M9 11a3 3 0 1 0 6 0 3 3 0 0 0-6 0" />
    <Path d="M17.657 16.657 13.414 20.9a2 2 0 0 1-2.827 0l-4.244-4.243a8 8 0 1 1 11.314 0" />
  </>
));
