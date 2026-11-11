import { Line } from 'react-native-svg';
import { createSvgIcon } from './svg-icon';

/** A horizontal grip of two lines. */
export const GripIcon = createSvgIcon('GripIcon', () => (
  <>
    <Line x1={5} y1={10} x2={19} y2={10} />
    <Line x1={5} y1={14} x2={19} y2={14} />
  </>
));
