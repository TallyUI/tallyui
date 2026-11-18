import { Path } from 'react-native-svg';
import { createSvgIcon } from './svg-icon';

// Tabler printer (MIT); WCPOS v2's `print` icon.
export const PrinterIcon = createSvgIcon('PrinterIcon', () => (
  <>
    <Path d="M17 17h2a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h2m10-8V5a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v4" />
    <Path d="M7 15a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z" />
  </>
));
