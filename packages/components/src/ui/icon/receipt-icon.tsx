import { Path } from 'react-native-svg';
import { createSvgIcon } from './svg-icon';

// Tabler receipt (MIT), tabler-icons 1.2.42 via Iconify; WCPOS v2's `receipt` nav icon.
export const ReceiptIcon = createSvgIcon('ReceiptIcon', () => (
  <Path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-3-2l-2 2l-2-2l-2 2l-2-2zM9 7h6m-6 4h6m-2 4h2" />
));
