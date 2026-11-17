import { Path } from 'react-native-svg';
import { createSvgIcon } from './svg-icon';

// Tabler gift (MIT), tabler-icons 1.2.42 via Iconify; WCPOS v2's `gift` nav icon.
export const GiftIcon = createSvgIcon('GiftIcon', () => (
  <>
    <Path d="M3 9a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zm9-1v13" />
    <Path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7m2.5-4a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5a2.5 2.5 0 0 1 0 5" />
  </>
));
