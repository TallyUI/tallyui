import { Path } from 'react-native-svg';
import { createSvgIcon } from './svg-icon';

// Tabler category (MIT), v2 `icon/components/tabler/category.tsx`: the folder mark on a category tile.
export const CategoryIcon = createSvgIcon('CategoryIcon', () => (
  <Path d="M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2" />
));
