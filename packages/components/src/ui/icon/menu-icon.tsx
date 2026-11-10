import { Line } from 'react-native-svg';
import { createSvgIcon } from './svg-icon';

export const MenuIcon = createSvgIcon('MenuIcon', () => (
  <>
    <Line x1={4} y1={6} x2={20} y2={6} />
    <Line x1={4} y1={12} x2={20} y2={12} />
    <Line x1={4} y1={18} x2={20} y2={18} />
  </>
));
