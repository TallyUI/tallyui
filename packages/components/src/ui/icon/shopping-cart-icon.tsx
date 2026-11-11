import { Circle, Path } from 'react-native-svg';
import { createSvgIcon } from './svg-icon';

export const ShoppingCartIcon = createSvgIcon('ShoppingCartIcon', () => (
  <>
    <Circle cx={9} cy={20} r={1.5} />
    <Circle cx={18} cy={20} r={1.5} />
    <Path d="M2 3h3l2.5 12h11.5l2-8H6.2" />
  </>
));
