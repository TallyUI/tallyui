import { Line } from 'react-native-svg';
import { createSvgIcon } from './svg-icon';

export const XIcon = createSvgIcon('XIcon', () => (
  <>
    <Line x1={18} y1={6} x2={6} y2={18} />
    <Line x1={6} y1={6} x2={18} y2={18} />
  </>
));
