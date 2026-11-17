import { Path } from 'react-native-svg';
import { createSvgIcon } from './svg-icon';

// Tabler users (MIT), tabler-icons 1.2.42 via Iconify; WCPOS v2's `customers` nav icon.
export const UsersIcon = createSvgIcon('UsersIcon', () => (
  <Path d="M5 7a4 4 0 1 0 8 0a4 4 0 1 0-8 0M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2m1-17.87a4 4 0 0 1 0 7.75M21 21v-2a4 4 0 0 0-3-3.85" />
));
