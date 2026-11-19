import { Path } from 'react-native-svg';
import { createSvgIcon } from './svg-icon';

// Tabler discount (MIT), tabler-icons 1.2.42 via Iconify; WCPOS v2's `discount` nav icon.
export const DiscountIcon = createSvgIcon('DiscountIcon', () => (
  <>
    <Path d="m9 15l6-6" />
    <Path d="M9 9.5a.5.5 0 1 0 1 0a.5.5 0 1 0-1 0m5 5a.5.5 0 1 0 1 0a.5.5 0 1 0-1 0" fill="currentColor" />
    <Path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0" />
  </>
));
