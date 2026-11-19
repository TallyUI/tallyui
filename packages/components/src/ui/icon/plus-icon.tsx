import { Line } from 'react-native-svg';
import { createSvgIcon } from './svg-icon';

export const PlusIcon = createSvgIcon('PlusIcon', () => (
  <>
    <Line x1={5} y1={12} x2={19} y2={12} />
    <Line x1={12} y1={5} x2={12} y2={19} />
  </>
));
