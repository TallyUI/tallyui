import { Path } from 'react-native-svg';
import { createSvgIcon } from './svg-icon';

// Tabler check (MIT), as WCPOS v2's tabler `check` glyph.
export const CheckIcon = createSvgIcon('CheckIcon', () => <Path d="m5 12 5 5L20 7" />);
